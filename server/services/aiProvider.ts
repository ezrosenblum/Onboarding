import OpenAI from "openai";
import type { Lead } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_VENDOR_PROMPT = `You are a sales research assistant for SupplyStreamline, a vendor onboarding platform. Given the following vendor lead information, generate a short, personalized call opener script (3-5 sentences) that a caller can use when reaching out. The script should:

1. Reference specific details about the company (name, location, category, rating, website) to show you've done your homework
2. Be warm and professional
3. Mention a relevant benefit of joining SupplyStreamline based on their business type
4. End with an open-ended question to start conversation

Lead Information:
- Company: {{company_name}}
- Category: {{category_keyword}}
- City/State: {{city}}, {{state}}
- Phone: {{phone}}
- Website: {{website}}
- Rating: {{rating}} ({{reviews_count}} reviews)
- Scraped Email: {{scraped_email}}

Generate ONLY the opener script text. No headers, labels, or formatting.`;

export function getDefaultAiPrompt(): string {
  return DEFAULT_VENDOR_PROMPT;
}

function buildPromptFromTemplate(template: string, lead: Lead): string {
  return template
    .replace(/\{\{company_name\}\}/g, lead.companyName || "Unknown")
    .replace(/\{\{category_keyword\}\}/g, lead.categoryKeyword || "general services")
    .replace(/\{\{city\}\}/g, lead.city || "")
    .replace(/\{\{state\}\}/g, lead.state || "")
    .replace(/\{\{phone\}\}/g, lead.phone || "N/A")
    .replace(/\{\{website\}\}/g, lead.website || lead.domain || "N/A")
    .replace(/\{\{rating\}\}/g, lead.rating?.toString() || "N/A")
    .replace(/\{\{reviews_count\}\}/g, lead.reviewsCount?.toString() || "0")
    .replace(/\{\{scraped_email\}\}/g, lead.scrapedEmail || "N/A")
    .replace(/\{\{confirmed_email\}\}/g, lead.confirmedEmail || "N/A")
    .replace(/\{\{full_address\}\}/g, lead.fullAddress || "N/A");
}

export function isAiConfigured(): boolean {
  return !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
}

export async function generateOpenerScript(
  promptTemplate: string,
  lead: Lead
): Promise<{ text: string; model: string; tokensIn: number; tokensOut: number; mock: boolean }> {
  const filledPrompt = buildPromptFromTemplate(promptTemplate, lead);

  if (!isAiConfigured()) {
    return {
      text: `[Mock AI Response] Hi, this is a call for ${lead.companyName}. I noticed your ${lead.categoryKeyword || "business"} in ${lead.city || "your area"} has great reviews. We help businesses like yours streamline their vendor onboarding process. Would you be open to hearing how we could help?`,
      model: "mock",
      tokensIn: 0,
      tokensOut: 0,
      mock: true,
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: filledPrompt },
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  const text = completion.choices[0]?.message?.content?.trim() || "";
  const usage = completion.usage;

  return {
    text,
    model: completion.model || "gpt-4o-mini",
    tokensIn: usage?.prompt_tokens || 0,
    tokensOut: usage?.completion_tokens || 0,
    mock: false,
  };
}
