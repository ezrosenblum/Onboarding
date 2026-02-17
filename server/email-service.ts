import sgMail from '@sendgrid/mail';
import type { Lead, EmailTemplateType, PipelineType } from "@shared/schema";
import { storage } from "./storage";

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    return null;
  }

  try {
    const connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    if (!connectionSettings?.settings?.api_key) {
      return null;
    }
    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email || "connect@supplystreamline.com",
    };
  } catch {
    return null;
  }
}

const FROM_EMAIL = "connect@supplystreamline.com";
const SIGNUP_BASE_URL = "https://supplystreamline.com/signup";

function buildSignupLink(leadToken: string): string {
  return `${SIGNUP_BASE_URL}?ref=${leadToken}`;
}

interface EmailContent {
  subject: string;
  bodyHtml: string;
}

export interface DefaultTemplate {
  subject: string;
  bodyHtml: string;
}

export function getDefaultTemplates(): Record<EmailTemplateType, DefaultTemplate> {
  return {
    SEND_INFO: {
      subject: "SupplyStreamline – Getting You Connected",
      bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Hi {{company_name}} team,</p>
<p>It was a pleasure speaking with you! As mentioned, <strong>SupplyStreamline</strong> connects vendors with vetted buyers looking for exactly what you offer.</p>
<p>Here's a quick summary of how we help:</p>
<ul>
<li>Direct access to active buyers in your space</li>
<li>No upfront costs – we only earn when you do</li>
<li>Simple onboarding in under 5 minutes</li>
</ul>
<p><a href="{{signup_link}}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Get Started Free</a></p>
<p style="color: #666; font-size: 13px; margin-top: 24px;">If you have questions, just reply to this email. We're happy to help.</p>
<p>Best regards,<br/>{{caller_name}}</p>
</div>`,
    },
    FOLLOW_UP: {
      subject: "Quick follow-up – SupplyStreamline",
      bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Hi {{company_name}} team,</p>
<p>Just wanted to follow up on our previous email. We'd love to get you set up – it only takes a few minutes and there's no cost to you.</p>
<p><a href="{{signup_link}}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Complete Signup</a></p>
<p style="color: #666; font-size: 13px; margin-top: 24px;">Feel free to reply with any questions.</p>
<p>Best,<br/>{{caller_name}}</p>
</div>`,
    },
    UNREACHABLE_OUTREACH: {
      subject: "We tried reaching you – SupplyStreamline",
      bodyHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>Hi {{company_name}} team,</p>
<p>We've been trying to reach you by phone but haven't been able to connect. No worries – we know you're busy!</p>
<p><strong>SupplyStreamline</strong> helps vendors like you connect directly with qualified buyers. It's free to sign up and takes less than 5 minutes.</p>
<p><a href="{{signup_link}}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Sign Up – It's Free</a></p>
<p style="color: #666; font-size: 13px; margin-top: 24px;">If you'd prefer to talk first, reply to this email and we'll schedule a quick call at your convenience.</p>
<p>Best regards,<br/>{{caller_name}}</p>
</div>`,
    },
  };
}

function substituteVariables(text: string, lead: Lead, callerName?: string): string {
  const signupLink = buildSignupLink(lead.leadToken);
  return text
    .replace(/\{\{company_name\}\}/g, lead.companyName || "")
    .replace(/\{\{contact_email\}\}/g, lead.confirmedEmail || lead.scrapedEmail || "")
    .replace(/\{\{caller_name\}\}/g, callerName || "The SupplyStreamline Team")
    .replace(/\{\{signup_link\}\}/g, signupLink)
    .replace(/\{\{city\}\}/g, lead.city || "")
    .replace(/\{\{state\}\}/g, lead.state || "");
}

export async function buildEmailContent(templateType: EmailTemplateType, lead: Lead, callerName?: string): Promise<EmailContent> {
  const pipelineType = lead.pipelineType || "vendor";
  const dbTemplate = await storage.getEmailTemplate(pipelineType, templateType);

  let subject: string;
  let bodyHtml: string;

  if (dbTemplate) {
    subject = dbTemplate.subject;
    bodyHtml = dbTemplate.bodyHtml;
  } else {
    const defaults = getDefaultTemplates();
    subject = defaults[templateType].subject;
    bodyHtml = defaults[templateType].bodyHtml;
  }

  return {
    subject: substituteVariables(subject, lead, callerName),
    bodyHtml: substituteVariables(bodyHtml, lead, callerName),
  };
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  mock?: boolean;
  error?: string;
}

export async function sendEmail(
  toEmail: string,
  subject: string,
  bodyHtml: string,
  leadToken: string,
  leadId: number,
): Promise<SendResult> {
  const credentials = await getCredentials();

  if (!credentials) {
    console.log("[EMAIL] Mock mode: SendGrid not configured, logging email without sending");
    return { success: true, mock: true, messageId: `mock_${Date.now()}` };
  }

  try {
    sgMail.setApiKey(credentials.apiKey);
    const [response] = await sgMail.send({
      to: toEmail,
      from: credentials.fromEmail || FROM_EMAIL,
      subject,
      html: bodyHtml,
      customArgs: {
        lead_token: leadToken,
        lead_id: String(leadId),
      },
    });

    const messageId = response?.headers?.["x-message-id"] || null;
    return { success: true, messageId: messageId || undefined };
  } catch (err: any) {
    console.error("[EMAIL] SendGrid error:", err?.response?.body || err.message);
    return { success: false, error: err?.response?.body?.errors?.[0]?.message || err.message };
  }
}
