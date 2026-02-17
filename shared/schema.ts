import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = ["admin", "vendor_caller", "buyer_caller"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const callStatusEnum = ["NOT_CALLED", "CONTACTED", "VOICEMAIL", "NO_ANSWER", "CALLBACK", "NOT_INTERESTED", "INTERESTED", "SIGNED_UP"] as const;
export type CallStatus = (typeof callStatusEnum)[number];

export const emailStatusEnum = ["NOT_SENT", "SENT", "BOUNCED", "REPLIED"] as const;
export type EmailStatus = (typeof emailStatusEnum)[number];

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
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("leads_place_id_idx").on(table.placeId),
  index("leads_pipeline_type_idx").on(table.pipelineType),
  index("leads_assigned_to_idx").on(table.assignedToUserId),
  uniqueIndex("leads_pipeline_place_unique").on(table.pipelineType, table.placeId).where(sql`place_id IS NOT NULL`),
]);

export const callLogs = pgTable("call_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  userId: integer("user_id").notNull().references(() => users.id),
  calledAt: timestamp("called_at").defaultNow().notNull(),
  outcome: text("outcome").notNull(),
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

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
