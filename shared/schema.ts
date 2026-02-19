import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, numeric, index, uniqueIndex, json, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = ["admin", "vendor_caller", "buyer_caller"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const callModeEnum = ["BROWSER", "AGENT_PHONE"] as const;
export type CallMode = (typeof callModeEnum)[number];

export const twilioCallStatusEnum = ["initiated", "ringing", "in_progress", "completed", "failed", "busy", "no_answer", "canceled"] as const;
export type TwilioCallStatus = (typeof twilioCallStatusEnum)[number];

export const transcriptStatusEnum = ["NONE", "PENDING", "PROCESSING", "READY", "FAILED"] as const;
export type TranscriptStatus = (typeof transcriptStatusEnum)[number];

export const callOutcomeEnum = [
  "NO_ANSWER",
  "VOICEMAIL",
  "GATEKEEPER",
  "CALL_DROPPED",
  "SPOKE_NOT_INTERESTED",
  "SPOKE_SEND_INFO",
  "SPOKE_FOLLOW_UP",
  "SPOKE_INTERESTED",
] as const;
export type CallOutcome = (typeof callOutcomeEnum)[number];

export const retryOutcomes: readonly CallOutcome[] = ["NO_ANSWER", "VOICEMAIL", "GATEKEEPER", "CALL_DROPPED"] as const;

export const terminalOutcomes: readonly CallOutcome[] = ["SPOKE_NOT_INTERESTED"] as const;

export const callStatusEnum = ["NOT_CALLED", ...callOutcomeEnum] as const;
export type CallStatus = (typeof callStatusEnum)[number];

export const emailStatusEnum = ["NOT_SENT", "SENT", "OPENED", "CLICKED", "BOUNCED", "REPLIED", "SUPPRESSED"] as const;
export type EmailStatus = (typeof emailStatusEnum)[number];

export const emailTemplateTypeEnum = ["SEND_INFO", "FOLLOW_UP", "UNREACHABLE_OUTREACH"] as const;
export type EmailTemplateType = (typeof emailTemplateTypeEnum)[number];

export const signupStatusEnum = ["NOT_SIGNED_UP", "PENDING", "SIGNED_UP"] as const;
export type SignupStatus = (typeof signupStatusEnum)[number];

export const pipelineTypeEnum = ["vendor", "buyer"] as const;
export type PipelineType = (typeof pipelineTypeEnum)[number];

export interface AiOutputJson {
  opener_script: string;
  summary_bullets: string[];
  discovery_questions: string[];
  objections: string[];
  suggested_next_step: string;
}

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().$type<UserRole>().default("vendor_caller"),
  dailyCallTarget: integer("daily_call_target"),
  agentPhone: text("agent_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  pipelineType: text("pipeline_type").notNull().$type<PipelineType>().default("vendor"),
  sourceFile: text("source_file"),
  placeId: text("place_id"),
  cid: text("cid"),
  companyName: text("company_name").notNull(),
  fullAddress: text("full_address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  timezone: text("timezone"),
  phone: text("phone"),
  scrapedEmail: text("scraped_email"),
  confirmedEmail: text("confirmed_email"),
  contactName: text("contact_name"),
  website: text("website"),
  domain: text("domain"),
  categoryKeyword: text("category_keyword"),
  gmbUrl: text("gmb_url"),
  rating: numeric("rating"),
  reviewsCount: integer("reviews_count"),
  hoursRaw: text("hours_raw"),
  statusCall: text("status_call").notNull().$type<CallStatus>().default("NOT_CALLED"),
  statusEmail: text("status_email").notNull().$type<EmailStatus>().default("NOT_SENT"),
  statusSignup: text("status_signup").notNull().$type<SignupStatus>().default("NOT_SIGNED_UP"),
  attemptCount: integer("attempt_count").notNull().default(0),
  unreachable: boolean("unreachable").notNull().default(false),
  bestTimeToCall: text("best_time_to_call"),
  retryNextEligibleAt: timestamp("retry_next_eligible_at"),
  leadToken: text("lead_token").notNull().unique().default(sql`gen_random_uuid()`),
  emailLastSentAt: timestamp("email_last_sent_at"),
  emailSentCount: integer("email_sent_count").notNull().default(0),
  emailSuppressed: boolean("email_suppressed").notNull().default(false),
  emailInvalidReason: text("email_invalid_reason"),
  signedUpAt: timestamp("signed_up_at"),
  signedUpEmail: text("signed_up_email"),
  signedUpUserId: text("signed_up_user_id"),
  signupSource: text("signup_source"),
  leadScore: integer("lead_score").default(0),
  leadScoreUpdatedAt: timestamp("lead_score_updated_at"),
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at"),
  archiveReason: text("archive_reason"),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("leads_place_id_idx").on(table.placeId),
  index("leads_pipeline_type_idx").on(table.pipelineType),
  index("leads_assigned_to_idx").on(table.assignedToUserId),
  index("leads_lead_token_idx").on(table.leadToken),
  uniqueIndex("leads_pipeline_place_unique").on(table.pipelineType, table.placeId).where(sql`place_id IS NOT NULL`),
]);

export const callLogs = pgTable("call_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  userId: integer("user_id").notNull().references(() => users.id),
  calledAt: timestamp("called_at").defaultNow().notNull(),
  outcome: text("outcome").$type<CallOutcome>(),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
  withinBadTimingWindow: boolean("within_bad_timing_window").notNull().default(false),
  twilioCallSid: text("twilio_call_sid"),
  twilioConferenceSid: text("twilio_conference_sid"),
  fromNumber: text("from_number"),
  toNumber: text("to_number"),
  callMode: text("call_mode").$type<CallMode>(),
  callStatus: text("call_status").$type<TwilioCallStatus>().default("initiated"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  recordingSid: text("recording_sid"),
  recordingUrl: text("recording_url"),
  recordingDurationSeconds: integer("recording_duration_seconds"),
  transcriptStatus: text("transcript_status").$type<TranscriptStatus>().default("NONE"),
  transcriptText: text("transcript_text"),
  transcriptProvider: text("transcript_provider"),
  transcriptError: text("transcript_error"),
  coachNote: text("coach_note"),
  qualityTag: text("quality_tag"),
  coachNoteByUserId: integer("coach_note_by_user_id").references(() => users.id),
  coachNoteAt: timestamp("coach_note_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("call_logs_twilio_sid_idx").on(table.twilioCallSid),
]);

export const leadNotes = pgTable("lead_notes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  userId: integer("user_id").notNull().references(() => users.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailLogs = pgTable("email_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  userId: integer("user_id").notNull().references(() => users.id),
  templateType: text("template_type").notNull().$type<EmailTemplateType>(),
  toEmail: text("to_email").notNull(),
  fromEmail: text("from_email").notNull().default("connect@supplystreamline.com"),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  sendgridMessageId: text("sendgrid_message_id"),
  inReplyToMessageId: text("in_reply_to_message_id"),
  isReply: boolean("is_reply").notNull().default(false),
  status: text("status").notNull().default("SENT"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inboundEmails = pgTable("inbound_emails", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  sgMessageId: text("sg_message_id"),
  inReplyTo: text("in_reply_to"),
  isRead: boolean("is_read").notNull().default(false),
  readByUserId: integer("read_by_user_id").references(() => users.id),
  readAt: timestamp("read_at"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("inbound_emails_lead_id_idx").on(table.leadId),
  index("inbound_emails_received_at_idx").on(table.receivedAt),
]);

export const emailEvents = pgTable("email_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  eventType: text("event_type").notNull(),
  sgMessageId: text("sg_message_id"),
  timestamp: timestamp("timestamp").notNull(),
  url: text("url"),
  raw: json("raw"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const emailTemplates = pgTable("email_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  pipelineType: text("pipeline_type").notNull().$type<PipelineType>().default("vendor"),
  templateType: text("template_type").notNull().$type<EmailTemplateType>(),
  name: text("name").notNull().default(""),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  sequence: integer("sequence").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_templates_pipeline_template_unique").on(table.pipelineType, table.templateType),
]);

export const aiPrompts = pgTable("ai_prompts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  pipelineType: text("pipeline_type").notNull().$type<PipelineType>(),
  promptTemplate: text("prompt_template").notNull(),
  version: integer("version").notNull().default(1),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ai_prompts_pipeline_unique").on(table.pipelineType),
]);

export const aiResearch = pgTable("ai_research", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  pipelineType: text("pipeline_type").notNull().$type<PipelineType>(),
  promptVersion: integer("prompt_version").notNull(),
  promptUsed: text("prompt_used").notNull(),
  modelUsed: text("model_used"),
  outputJson: jsonb("output_json").notNull().$type<AiOutputJson>(),
  openerScript: text("opener_script").notNull(),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isCurrent: boolean("is_current").notNull().default(true),
}, (table) => [
  index("ai_research_lead_id_idx").on(table.leadId),
  uniqueIndex("ai_research_lead_current_unique").on(table.leadId).where(sql`is_current = true`),
]);

export const signupEvents = pgTable("signup_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  leadToken: text("lead_token").notNull(),
  eventType: text("event_type").notNull(),
  payloadRaw: jsonb("payload_raw").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  sourceIp: text("source_ip"),
  userAgent: text("user_agent"),
  idempotencyKey: text("idempotency_key"),
}, (table) => [
  index("signup_events_lead_id_idx").on(table.leadId),
  index("signup_events_lead_token_idx").on(table.leadToken),
  uniqueIndex("signup_events_idempotency_unique").on(table.idempotencyKey).where(sql`idempotency_key IS NOT NULL`),
]);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const callEvents = pgTable("call_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  callLogId: integer("call_log_id").notNull().references(() => callLogs.id),
  twilioCallSid: text("twilio_call_sid"),
  eventType: text("event_type").notNull(),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("call_events_call_log_id_idx").on(table.callLogId),
  index("call_events_twilio_sid_idx").on(table.twilioCallSid),
]);

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, passwordHash: true }).extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export const insertCallLogSchema = createInsertSchema(callLogs).omit({ id: true, createdAt: true });
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallLog = typeof callLogs.$inferSelect;

export const insertLeadNoteSchema = createInsertSchema(leadNotes).omit({ id: true, createdAt: true });
export type InsertLeadNote = z.infer<typeof insertLeadNoteSchema>;
export type LeadNote = typeof leadNotes.$inferSelect;

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({ id: true, createdAt: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

export const insertEmailEventSchema = createInsertSchema(emailEvents).omit({ id: true, createdAt: true });
export type InsertEmailEvent = z.infer<typeof insertEmailEventSchema>;
export type EmailEvent = typeof emailEvents.$inferSelect;

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, updatedAt: true });
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

export const insertAiPromptSchema = createInsertSchema(aiPrompts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiPrompt = z.infer<typeof insertAiPromptSchema>;
export type AiPrompt = typeof aiPrompts.$inferSelect;

export const insertAiResearchSchema = createInsertSchema(aiResearch).omit({ id: true, createdAt: true });
export type InsertAiResearch = z.infer<typeof insertAiResearchSchema>;
export type AiResearchRecord = typeof aiResearch.$inferSelect;

export const insertInboundEmailSchema = createInsertSchema(inboundEmails).omit({ id: true, createdAt: true });
export type InsertInboundEmail = z.infer<typeof insertInboundEmailSchema>;
export type InboundEmail = typeof inboundEmails.$inferSelect;

export type SignupEvent = typeof signupEvents.$inferSelect;

export type SystemSetting = typeof systemSettings.$inferSelect;

export type CallEvent = typeof callEvents.$inferSelect;

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
