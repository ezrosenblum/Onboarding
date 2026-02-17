import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, numeric, index, uniqueIndex, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = ["admin", "vendor_caller", "buyer_caller"] as const;
export type UserRole = (typeof userRoleEnum)[number];

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

export const callStatusEnum = ["NOT_CALLED", ...callOutcomeEnum] as const;
export type CallStatus = (typeof callStatusEnum)[number];

export const emailStatusEnum = ["NOT_SENT", "SENT", "OPENED", "CLICKED", "BOUNCED", "REPLIED"] as const;
export type EmailStatus = (typeof emailStatusEnum)[number];

export const emailTemplateTypeEnum = ["SEND_INFO", "FOLLOW_UP", "UNREACHABLE_OUTREACH"] as const;
export type EmailTemplateType = (typeof emailTemplateTypeEnum)[number];

export const signupStatusEnum = ["NOT_SIGNED_UP", "PENDING", "SIGNED_UP"] as const;
export type SignupStatus = (typeof signupStatusEnum)[number];

export const pipelineTypeEnum = ["vendor", "buyer"] as const;
export type PipelineType = (typeof pipelineTypeEnum)[number];

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().$type<UserRole>().default("vendor_caller"),
  dailyCallTarget: integer("daily_call_target"),
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
  outcome: text("outcome").notNull().$type<CallOutcome>(),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
  withinBadTimingWindow: boolean("within_bad_timing_window").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
  sendgridMessageId: text("sendgrid_message_id"),
  status: text("status").notNull().default("SENT"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

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

export type SystemSetting = typeof systemSettings.$inferSelect;

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
