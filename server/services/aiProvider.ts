import OpenAI from "openai";
import type { Lead, AiOutputJson } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_VENDOR_PROMPT = `You are a sales research assistant for SupplyStreamline, a vendor onboarding platform. Given the following vendor lead information, generate a personalized call preparation package.

Your response must be ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "opener_script": "A warm, personalized 10-15 second spoken opener script (3-5 sentences) referencing specific company details",
  "summary_bullets": ["Up to 3 key bullet points about this company that a caller should know"],
  "discovery_questions": ["3-5 tailored discovery questions based on the company's profile"],
  "objections": ["2-3 likely objections with suggested responses"],
  "suggested_next_step": "The recommended next action after the call"
}

Rules:
- opener_script must reference the company name and at least one specific detail (location, category, rating, etc.)
- summary_bullets should highlight business strengths or relevant facts
- discovery_questions should be open-ended and relevant to their business type
- objections should address common vendor onboarding concerns
- suggested_next_step should be actionable`;

const DEFAULT_BUYER_PROMPT = `You are a sales research assistant for SupplyStreamline, a buyer onboarding platform. Given the following buyer lead information, generate a personalized call preparation package.

Your response must be ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "opener_script": "A warm, personalized 10-15 second spoken opener script (3-5 sentences) referencing specific company details",
  "summary_bullets": ["Up to 3 key bullet points about this company that a caller should know"],
  "discovery_questions": ["3-5 tailored discovery questions based on the company's profile"],
  "objections": ["2-3 likely objections with suggested responses"],
  "suggested_next_step": "The recommended next action after the call"
}

Rules:
- opener_script must reference the company name and at least one specific detail (location, category, rating, etc.)
- summary_bullets should highlight buying needs or procurement patterns
- discovery_questions should be open-ended and relevant to their purchasing requirements
- objections should address common buyer onboarding concerns
- suggested_next_step should be actionable`;

const JSON_OUTPUT_INSTRUCTIONS = `

IMPORTANT: Respond with ONLY valid JSON matching the schema above. No markdown code blocks, no explanations, no extra text before or after the JSON.`;

export function getDefaultAiPrompt(): string {
  return DEFAULT_VENDOR_PROMPT;
}

export function getDefaultAiPromptForPipeline(pipelineType: string): string {
  if (pipelineType === "buyer") return DEFAULT_BUYER_PROMPT;
  return DEFAULT_VENDOR_PROMPT;
}

function buildLeadDataBlock(lead: Lead): string {
  const data: Record<string, string> = {};
  if (lead.companyName) data.company_name = lead.companyName;
  if (lead.fullAddress) data.full_address = lead.fullAddress;
  if (lead.city) data.city = lead.city;
  if (lead.state) data.state = lead.state;
  if (lead.zip) data.zip = lead.zip;
  if (lead.phone) data.phone = lead.phone;
  if (lead.categoryKeyword) data.category_keyword = lead.categoryKeyword;
  if (lead.website || lead.domain) data.website = lead.website || lead.domain || "";
  if (lead.rating) data.rating = lead.rating.toString();
  if (lead.reviewsCount != null) data.reviews_count = lead.reviewsCount.toString();
  if (lead.hoursRaw) data.hours_raw = lead.hoursRaw;
  if (lead.scrapedEmail) data.scraped_email = lead.scrapedEmail;
  if (lead.confirmedEmail) data.confirmed_email = lead.confirmedEmail;
  data.pipeline_type = lead.pipelineType;
  return JSON.stringify(data, null, 2);
}

function buildPromptFromTemplate(template: string, lead: Lead): string {
  let filled = template
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

  return filled;
}

export function buildFinalPrompt(promptTemplate: string, lead: Lead): string {
  const filledTemplate = buildPromptFromTemplate(promptTemplate, lead);
  const leadData = buildLeadDataBlock(lead);
  return `${filledTemplate}\n\nLead Data:\n${leadData}${JSON_OUTPUT_INSTRUCTIONS}`;
}

const EMPTY_OUTPUT: AiOutputJson = {
  opener_script: "",
  summary_bullets: [],
  discovery_questions: [],
  objections: [],
  suggested_next_step: "",
};

function parseAiOutput(raw: string): AiOutputJson {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(text);
    return {
      opener_script: typeof parsed.opener_script === "string" ? parsed.opener_script : "",
      summary_bullets: Array.isArray(parsed.summary_bullets) ? parsed.summary_bullets.map(String) : [],
      discovery_questions: Array.isArray(parsed.discovery_questions) ? parsed.discovery_questions.map(String) : [],
      objections: Array.isArray(parsed.objections) ? parsed.objections.map(String) : [],
      suggested_next_step: typeof parsed.suggested_next_step === "string" ? parsed.suggested_next_step : "",
    };
  } catch {
    return {
      ...EMPTY_OUTPUT,
      opener_script: text,
    };
  }
}

export function isAiConfigured(): boolean {
  return !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
}

export interface AiGenerationResult {
  outputJson: AiOutputJson;
  openerScript: string;
  promptUsed: string;
  modelUsed: string;
  mock: boolean;
}

export async function generateStructuredResearch(
  promptTemplate: string,
  lead: Lead
): Promise<AiGenerationResult> {
  const finalPrompt = buildFinalPrompt(promptTemplate, lead);

  if (!isAiConfigured()) {
    const mockOutput: AiOutputJson = {
      opener_script: `Hi, this is a call for ${lead.companyName}. I noticed your ${lead.categoryKeyword || "business"} in ${lead.city || "your area"} has great reviews. We help businesses like yours streamline their vendor onboarding process. Would you be open to hearing how we could help?`,
      summary_bullets: [
        `${lead.companyName} is a ${lead.categoryKeyword || "business"} in ${lead.city || "the area"}`,
        lead.rating ? `Rated ${lead.rating} stars with ${lead.reviewsCount || 0} reviews` : "No rating data available",
        lead.website ? `Active website: ${lead.website}` : "No website found",
      ],
      discovery_questions: [
        "How are you currently managing your vendor relationships?",
        "What challenges do you face with your current onboarding process?",
        "How many new vendors do you typically onboard per month?",
      ],
      objections: [
        "\"We already have a system\" - Our platform integrates with existing workflows and adds automation on top.",
        "\"We're too busy right now\" - That's exactly why our streamlined process saves teams an average of 10 hours per week.",
      ],
      suggested_next_step: "Schedule a 15-minute demo to show how SupplyStreamline works with their specific business type.",
    };

    return {
      outputJson: mockOutput,
      openerScript: mockOutput.opener_script,
      promptUsed: finalPrompt,
      modelUsed: "mock",
      mock: true,
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: finalPrompt },
    ],
    max_tokens: 800,
    temperature: 0.7,
  });

  const rawText = completion.choices[0]?.message?.content?.trim() || "";
  const outputJson = parseAiOutput(rawText);

  return {
    outputJson,
    openerScript: outputJson.opener_script,
    promptUsed: finalPrompt,
    modelUsed: completion.model || "gpt-4o-mini",
    mock: false,
  };
}
