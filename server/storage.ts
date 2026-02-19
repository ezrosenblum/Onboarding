import { db } from "./db";
import { eq, and, isNull, ilike, sql, desc, asc, lte, gte, count, inArray } from "drizzle-orm";
import { users, leads, callLogs, leadNotes, emailLogs, emailEvents, emailTemplates, aiPrompts, aiResearch, signupEvents, systemSettings, callEvents, inboundEmails } from "@shared/schema";
import type { User, InsertLead, Lead, CallLog, InsertCallLog, LeadNote, InsertLeadNote, EmailLog, InsertEmailLog, EmailEvent, InsertEmailEvent, EmailTemplate, InsertEmailTemplate, AiPrompt, AiResearchRecord, AiOutputJson, SignupEvent, SystemSetting, CallEvent } from "@shared/schema";
import bcrypt from "bcryptjs";

export interface CallerPerformance {
  userId: number;
  userName: string;
  callsMade: number;
  emailsSent: number;
  repliesSent: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsBounced: number;
  signups: number;
  unreachableCount: number;
  avgAttemptsPerLead: number;
  callToEmailPct: number;
  clickToSignupPct: number;
}

export interface PerformanceMetrics {
  totals: {
    calls: number;
    emails: number;
    repliesSent: number;
    emailsOpened: number;
    emailsClicked: number;
    emailsBounced: number;
    signups: number;
  };
  rates: {
    callToEmailPct: number;
    emailOpenPct: number;
    emailClickPct: number;
    replyRatePct: number;
    clickToSignupPct: number;
    callToSignupPct: number;
  };
  byCaller: CallerPerformance[];
  signupsByState: { state: string; count: number }[];
  signupsByCategory: { category: string; count: number }[];
  callTimingAnalysis: {
    badTimingCalls: number;
    totalCalls: number;
    badTimingNoAnswerRate: number;
    bestHours: { hour: number; calls: number; connectRate: number }[];
  };
}

export interface IStorage {
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(data: { name: string; email: string; password: string; role: string }): Promise<User>;
  getAllUsers(): Promise<User[]>;

  createLead(data: InsertLead): Promise<Lead>;
  getLeadById(id: number): Promise<Lead | undefined>;
  getLeadByPlaceIdAndPipeline(placeId: string, pipelineType: string): Promise<Lead | undefined>;
  getAllLeads(pipelineType?: string): Promise<Lead[]>;
  getLeadsByUserId(userId: number): Promise<Lead[]>;
  updateLead(id: number, data: Partial<Lead>): Promise<Lead | undefined>;
  assignLeads(callerId: number, count: number, filters?: { state?: string; category?: string; minRating?: number; hasPhone?: boolean; hasEmail?: boolean }): Promise<number>;

  getArchivedLeads(pipelineType?: string): Promise<Lead[]>;
  getActiveAssignedLeads(): Promise<Lead[]>;
  getNewLeads(userId: number, includeUnreachable?: boolean): Promise<Lead[]>;
  getRetryLeads(userId: number, includeUnreachable?: boolean): Promise<Lead[]>;
  getRetryEligibleCount(userId: number): Promise<number>;
  getCalledLeads(userId: number): Promise<Lead[]>;
  getActiveLeads(userId: number, includeUnreachable?: boolean): Promise<Lead[]>;
  getCompletedLeads(userId: number): Promise<Lead[]>;

  createCallLog(data: InsertCallLog): Promise<CallLog>;
  getCallLogsByLeadId(leadId: number): Promise<CallLog[]>;
  getCallLogsTodayByUserId(userId: number): Promise<number>;
  getLastCallLogForLead(leadId: number): Promise<CallLog | undefined>;

  createLeadNote(data: InsertLeadNote): Promise<LeadNote>;
  getNotesByLeadId(leadId: number): Promise<LeadNote[]>;

  createEmailLog(data: InsertEmailLog): Promise<EmailLog>;
  getEmailLogsByLeadId(leadId: number): Promise<EmailLog[]>;
  getEmailLogByMessageId(messageId: string): Promise<EmailLog | undefined>;
  getEmailsSentTodayByUserId(userId: number): Promise<number>;
  getCallerWeeklyStats(userId: number): Promise<{ callsThisWeek: number; emailsThisWeek: number; signupsThisWeek: number }>;
  hasEmailLogForLead(leadId: number, templateType: string): Promise<boolean>;

  createEmailEvent(data: InsertEmailEvent): Promise<EmailEvent>;
  getLeadByToken(token: string): Promise<Lead | undefined>;

  getEmailTemplates(pipelineType: string): Promise<EmailTemplate[]>;
  getEmailTemplate(pipelineType: string, templateType: string): Promise<EmailTemplate | undefined>;
  upsertEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate>;

  getUserCount(): Promise<number>;

  getAiPrompt(pipelineType: string): Promise<AiPrompt | undefined>;
  getAllAiPrompts(): Promise<AiPrompt[]>;
  upsertAiPrompt(pipelineType: string, promptTemplate: string, userId: number): Promise<AiPrompt>;

  getCurrentAiResearch(leadId: number): Promise<AiResearchRecord | undefined>;
  createAiResearch(data: { leadId: number; pipelineType: string; promptVersion: number; promptUsed: string; modelUsed: string | null; outputJson: AiOutputJson; openerScript: string; createdByUserId: number }): Promise<AiResearchRecord>;
  createAiResearchVersioned(data: { leadId: number; pipelineType: string; promptVersion: number; promptUsed: string; modelUsed: string | null; outputJson: AiOutputJson; openerScript: string; createdByUserId: number }): Promise<AiResearchRecord>;
  markPreviousAiResearchNotCurrent(leadId: number): Promise<void>;
  getAiResearchHistory(leadId: number): Promise<AiResearchRecord[]>;

  createSignupEvent(data: { leadId: number; leadToken: string; eventType: string; payloadRaw: any; sourceIp?: string | null; userAgent?: string | null; idempotencyKey?: string | null }): Promise<SignupEvent>;
  getSignupEventsByLeadId(leadId: number): Promise<SignupEvent[]>;
  processWebhookSignup(eventData: { leadId: number; leadToken: string; eventType: string; payloadRaw: any; sourceIp?: string | null; userAgent?: string | null; idempotencyKey?: string | null }, leadUpdate: { statusSignup: string; signedUpAt: Date; signedUpEmail: string | null; signedUpUserId: string | null; signupSource: string }): Promise<SignupEvent>;
  getSignupMetrics(range: "today" | "week" | "month"): Promise<{ total: number; byCaller: { userId: number; userName: string; count: number }[] }>;
  getPerformanceMetrics(range: "today" | "week" | "month"): Promise<PerformanceMetrics>;

  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
  getUserCount(): Promise<number>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  deleteLead(id: number): Promise<void>;
  bulkDeleteLeads(ids: number[]): Promise<number>;
  getFilteredLeads(filters: { state?: string; category?: string; minRating?: number; hasPhone?: boolean; hasEmail?: boolean; unassigned?: boolean }, limit?: number): Promise<Lead[]>;
  getLeadsAssignedToday(): Promise<Lead[]>;
  getCallerQueues(): Promise<{ userId: number; userName: string; uncalledCount: number; totalAssigned: number }[]>;
  getDailyAssignmentHistory(days: number): Promise<{ date: string; totalAssigned: number; totalCalled: number; callers: { userId: number; userName: string; assigned: number; called: number }[] }[]>;
  getLeadsAssignedOnDate(dateStr: string): Promise<Lead[]>;

  getCallLogByTwilioSid(sid: string): Promise<CallLog | undefined>;
  updateCallLog(id: number, data: Partial<CallLog>): Promise<CallLog | undefined>;
  createCallEvent(data: { callLogId: number; twilioCallSid?: string; eventType: string; raw?: any }): Promise<CallEvent>;
  getCallEventsByCallLogId(callLogId: number): Promise<CallEvent[]>;
  getPendingTranscriptions(): Promise<CallLog[]>;

  getLeadScoreWeights(): Promise<Record<string, number>>;
  getLeakReport(): Promise<{
    clickedNotSignedUp: Lead[];
    spokeNoEmail: Lead[];
    retriedNeverMoved: Lead[];
    assignedUntouched: Lead[];
  }>;
  getCallerAlerts(): Promise<Array<{
    type: 'low_conversion' | 'high_unreachable' | 'no_activity' | 'high_no_answer';
    callerId: number;
    callerName: string;
    message: string;
    severity: 'warning' | 'info';
  }>>;
  getCategoryStateAnalysis(range: "week" | "month" | "all"): Promise<{
    byState: { state: string; calls: number; emails: number; signups: number; conversionPct: number }[];
    byCategory: { category: string; calls: number; emails: number; signups: number; conversionPct: number }[];
    byRatingBand: { band: string; calls: number; signups: number; conversionPct: number }[];
    bySourceFile: { sourceFile: string; totalLeads: number; calls: number; signups: number; conversionPct: number }[];
  }>;

  createInboundEmail(data: any): Promise<any>;
  getInboundEmailsByLeadId(leadId: number): Promise<any[]>;
  markInboundEmailRead(id: number, userId: number): Promise<void>;
  getEmailThread(leadId: number): Promise<{ sent: any[]; received: any[] }>;
  getEmailThreads(opts: { filter: string; currentUserId: number; leadId?: number; assignedCallerId?: number }): Promise<any[]>;

  getAllSettings(): Promise<Record<string, string>>;
  getPipelineHealth(): Promise<{
    totalUncontacted: number;
    untouchedAssigned: number;
    retryQueueSize: number;
    unreachableCount: number;
    activePending: number;
    clickedNotSignedUp: number;
  }>;
  getCallReviewQueue(filters: {
    callerId?: number;
    outcome?: string;
    dateFrom?: string;
    dateTo?: string;
    hasRecording?: boolean;
    qualityTag?: string;
    limit: number;
    offset: number;
  }): Promise<any[]>;
  getAllCallLogs(): Promise<CallLog[]>;
  getAllEmailLogs(): Promise<EmailLog[]>;
  getAllSignupEvents(): Promise<SignupEvent[]>;
  getCallerDetail(userId: number, range: "today" | "week" | "month"): Promise<{
    user: { id: number; name: string; email: string; role: string; dailyCallTarget: number | null };
    metrics: {
      totalCalls: number;
      totalEmails: number;
      totalSignups: number;
      callToEmailPct: number;
      clickToSignupPct: number;
      unreachableRate: number;
      outcomeDistribution: { outcome: string; count: number }[];
    };
    dailyTrend: { date: string; calls: number; emails: number; signups: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async createUser(data: { name: string; email: string; password: string; role: string }): Promise<User> {
    const hash = await bcrypt.hash(data.password, 10);
    const [user] = await db.insert(users).values({
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: hash,
      role: data.role as any,
    }).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(asc(users.name));
  }

  async getUserCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    return Number(result[0].count);
  }

  async createLead(data: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(data).returning();
    return lead;
  }

  async getLeadById(id: number): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, id));
    return lead;
  }

  async getLeadByPlaceIdAndPipeline(placeId: string, pipelineType: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads)
      .where(and(eq(leads.placeId, placeId), eq(leads.pipelineType, pipelineType as any)));
    return lead;
  }

  async getAllLeads(pipelineType?: string): Promise<Lead[]> {
    if (pipelineType) {
      return db.select().from(leads)
        .where(and(eq(leads.pipelineType, pipelineType as any), eq(leads.isArchived, false)))
        .orderBy(desc(leads.createdAt));
    }
    return db.select().from(leads)
      .where(eq(leads.isArchived, false))
      .orderBy(desc(leads.createdAt));
  }

  async getArchivedLeads(pipelineType?: string): Promise<Lead[]> {
    if (pipelineType) {
      return db.select().from(leads)
        .where(and(eq(leads.pipelineType, pipelineType as any), eq(leads.isArchived, true)))
        .orderBy(desc(leads.archivedAt));
    }
    return db.select().from(leads)
      .where(eq(leads.isArchived, true))
      .orderBy(desc(leads.archivedAt));
  }

  async getActiveAssignedLeads(): Promise<Lead[]> {
    return db.select().from(leads)
      .where(and(
        sql`${leads.assignedToUserId} IS NOT NULL`,
        eq(leads.pipelineType, "vendor"),
        eq(leads.isArchived, false),
      ))
      .orderBy(desc(leads.assignedAt));
  }

  async getLeadsByUserId(userId: number): Promise<Lead[]> {
    return db.select().from(leads)
      .where(and(eq(leads.assignedToUserId, userId), eq(leads.isArchived, false)))
      .orderBy(desc(leads.createdAt));
  }

  async updateLead(id: number, data: Partial<Lead>): Promise<Lead | undefined> {
    const [lead] = await db.update(leads).set(data).where(eq(leads.id, id)).returning();
    return lead;
  }

  async assignLeads(callerId: number, count: number, filters?: { state?: string; category?: string; minRating?: number; hasPhone?: boolean; hasEmail?: boolean }): Promise<number> {
    const conditions = [
      eq(leads.pipelineType, "vendor"),
      eq(leads.statusCall, "NOT_CALLED"),
      isNull(leads.assignedToUserId),
    ];

    if (filters?.state) {
      conditions.push(ilike(leads.state, filters.state));
    }
    if (filters?.category) {
      conditions.push(ilike(leads.categoryKeyword, `%${filters.category}%`));
    }
    if (filters?.minRating != null) {
      conditions.push(sql`CAST(${leads.rating} AS NUMERIC) >= ${filters.minRating}`);
    }
    if (filters?.hasPhone) {
      conditions.push(sql`${leads.phone} IS NOT NULL AND ${leads.phone} != ''`);
    }
    if (filters?.hasEmail) {
      conditions.push(sql`(${leads.scrapedEmail} IS NOT NULL AND ${leads.scrapedEmail} != '') OR (${leads.confirmedEmail} IS NOT NULL AND ${leads.confirmedEmail} != '')`);
    }

    const eligible = await db.select({ id: leads.id }).from(leads)
      .where(and(...conditions))
      .limit(count);

    if (eligible.length === 0) return 0;

    const ids = eligible.map((e) => e.id);
    const now = new Date();

    await db.update(leads)
      .set({ assignedToUserId: callerId, assignedAt: now })
      .where(sql`${leads.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);

    return ids.length;
  }

  async getNewLeads(userId: number, includeUnreachable = false): Promise<Lead[]> {
    const conditions = [
      eq(leads.assignedToUserId, userId),
      eq(leads.statusCall, "NOT_CALLED"),
      eq(leads.isArchived, false),
    ];
    if (!includeUnreachable) conditions.push(eq(leads.unreachable, false));
    return db.select().from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.leadScore), asc(leads.createdAt));
  }

  async getRetryLeads(userId: number, includeUnreachable = false): Promise<Lead[]> {
    const now = new Date();
    const conditions = [
      eq(leads.assignedToUserId, userId),
      sql`${leads.statusCall} != 'NOT_CALLED'`,
      eq(leads.isArchived, false),
      sql`${leads.retryNextEligibleAt} IS NOT NULL`,
      lte(leads.retryNextEligibleAt, now),
    ];
    if (!includeUnreachable) conditions.push(eq(leads.unreachable, false));
    return db.select().from(leads)
      .where(and(...conditions))
      .orderBy(asc(leads.retryNextEligibleAt));
  }

  async getRetryEligibleCount(userId: number): Promise<number> {
    const now = new Date();
    const result = await db.select({ count: sql<number>`count(*)` }).from(leads)
      .where(and(
        eq(leads.assignedToUserId, userId),
        eq(leads.unreachable, false),
        eq(leads.isArchived, false),
        sql`${leads.retryNextEligibleAt} IS NOT NULL`,
        lte(leads.retryNextEligibleAt, now)
      ));
    return Number(result[0].count);
  }

  async getCalledLeads(userId: number): Promise<Lead[]> {
    const conditions = [
      eq(leads.assignedToUserId, userId),
      sql`${leads.statusCall} != 'NOT_CALLED'`,
      eq(leads.isArchived, false),
    ];
    return db.select().from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt));
  }

  async getActiveLeads(userId: number, includeUnreachable = false): Promise<Lead[]> {
    const conditions = [
      eq(leads.assignedToUserId, userId),
      sql`${leads.statusSignup} != 'SIGNED_UP'`,
      sql`${leads.statusCall} IN ('SPOKE_SEND_INFO', 'SPOKE_FOLLOW_UP', 'SPOKE_INTERESTED', 'SPOKE_NOT_INTERESTED')`,
      sql`${leads.retryNextEligibleAt} IS NULL`,
      eq(leads.isArchived, false),
    ];
    if (!includeUnreachable) conditions.push(eq(leads.unreachable, false));
    return db.select().from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt));
  }

  async getCompletedLeads(userId: number): Promise<Lead[]> {
    return db.select().from(leads)
      .where(and(
        eq(leads.assignedToUserId, userId),
        sql`${leads.statusSignup} = 'SIGNED_UP'`
      ))
      .orderBy(desc(leads.createdAt));
  }

  async createCallLog(data: InsertCallLog): Promise<CallLog> {
    const [log] = await db.insert(callLogs).values(data).returning();
    return log;
  }

  async getCallLogsByLeadId(leadId: number): Promise<CallLog[]> {
    return db.select().from(callLogs)
      .where(eq(callLogs.leadId, leadId))
      .orderBy(desc(callLogs.calledAt));
  }

  async getCallLogsTodayByUserId(userId: number): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await db.select({ count: sql<number>`count(*)` }).from(callLogs)
      .where(and(
        eq(callLogs.userId, userId),
        gte(callLogs.calledAt, todayStart)
      ));
    return Number(result[0].count);
  }

  async getLastCallLogForLead(leadId: number): Promise<CallLog | undefined> {
    const [log] = await db.select().from(callLogs)
      .where(eq(callLogs.leadId, leadId))
      .orderBy(desc(callLogs.calledAt))
      .limit(1);
    return log;
  }

  async createLeadNote(data: InsertLeadNote): Promise<LeadNote> {
    const [note] = await db.insert(leadNotes).values(data).returning();
    return note;
  }

  async getNotesByLeadId(leadId: number): Promise<LeadNote[]> {
    return db.select().from(leadNotes)
      .where(eq(leadNotes.leadId, leadId))
      .orderBy(desc(leadNotes.createdAt));
  }

  async createEmailLog(data: InsertEmailLog): Promise<EmailLog> {
    const [log] = await db.insert(emailLogs).values(data).returning();
    return log;
  }

  async getEmailLogsByLeadId(leadId: number): Promise<EmailLog[]> {
    return db.select().from(emailLogs)
      .where(eq(emailLogs.leadId, leadId))
      .orderBy(desc(emailLogs.createdAt));
  }

  async getEmailLogByMessageId(messageId: string): Promise<EmailLog | undefined> {
    const [log] = await db.select().from(emailLogs)
      .where(eq(emailLogs.sendgridMessageId, messageId));
    return log;
  }

  async getEmailsSentTodayByUserId(userId: number): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await db.select({ count: sql<number>`count(*)` }).from(emailLogs)
      .where(and(
        eq(emailLogs.userId, userId),
        gte(emailLogs.createdAt, todayStart)
      ));
    return Number(result[0].count);
  }

  async getCallerWeeklyStats(userId: number): Promise<{ callsThisWeek: number; emailsThisWeek: number; signupsThisWeek: number }> {
    const now = new Date();
    const day = now.getDay();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);

    const [callResult, emailResult, signupResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(callLogs)
        .where(and(eq(callLogs.userId, userId), gte(callLogs.calledAt, weekStart))),
      db.select({ count: sql<number>`count(*)` }).from(emailLogs)
        .where(and(eq(emailLogs.userId, userId), gte(emailLogs.createdAt, weekStart))),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(
          eq(leads.assignedToUserId, userId),
          eq(leads.statusSignup, "SIGNED_UP"),
          gte(leads.signedUpAt, weekStart),
        )),
    ]);

    return {
      callsThisWeek: Number(callResult[0].count),
      emailsThisWeek: Number(emailResult[0].count),
      signupsThisWeek: Number(signupResult[0].count),
    };
  }

  async hasEmailLogForLead(leadId: number, templateType: string): Promise<boolean> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(emailLogs)
      .where(and(
        eq(emailLogs.leadId, leadId),
        eq(emailLogs.templateType, templateType as any)
      ));
    return Number(result[0].count) > 0;
  }

  async createEmailEvent(data: InsertEmailEvent): Promise<EmailEvent> {
    const [event] = await db.insert(emailEvents).values(data).returning();
    return event;
  }

  async getLeadByToken(token: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.leadToken, token));
    return lead;
  }

  async getEmailTemplates(pipelineType: string): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates)
      .where(eq(emailTemplates.pipelineType, pipelineType as any));
  }

  async getEmailTemplate(pipelineType: string, templateType: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates)
      .where(and(
        eq(emailTemplates.pipelineType, pipelineType as any),
        eq(emailTemplates.templateType, templateType as any)
      ));
    return template;
  }

  async upsertEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const existing = await this.getEmailTemplate(data.pipelineType as string, data.templateType as string);
    if (existing) {
      const updateSet: any = { subject: data.subject, bodyHtml: data.bodyHtml, updatedAt: new Date() };
      if (data.name !== undefined) updateSet.name = data.name;
      if (data.sequence !== undefined) updateSet.sequence = data.sequence;
      const [updated] = await db.update(emailTemplates)
        .set(updateSet)
        .where(eq(emailTemplates.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(emailTemplates).values(data).returning();
    return created;
  }

  async getAiPrompt(pipelineType: string): Promise<AiPrompt | undefined> {
    const [prompt] = await db.select().from(aiPrompts)
      .where(eq(aiPrompts.pipelineType, pipelineType as any));
    return prompt;
  }

  async getAllAiPrompts(): Promise<AiPrompt[]> {
    return db.select().from(aiPrompts).orderBy(asc(aiPrompts.pipelineType));
  }

  async upsertAiPrompt(pipelineType: string, promptTemplate: string, userId: number): Promise<AiPrompt> {
    const existing = await this.getAiPrompt(pipelineType);
    if (existing) {
      const [updated] = await db.update(aiPrompts)
        .set({
          promptTemplate,
          version: existing.version + 1,
          updatedByUserId: userId,
          updatedAt: new Date(),
        })
        .where(eq(aiPrompts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(aiPrompts).values({
      pipelineType: pipelineType as any,
      promptTemplate,
      version: 1,
      updatedByUserId: userId,
    }).returning();
    return created;
  }

  async getCurrentAiResearch(leadId: number): Promise<AiResearchRecord | undefined> {
    const [record] = await db.select().from(aiResearch)
      .where(and(eq(aiResearch.leadId, leadId), eq(aiResearch.isCurrent, true)));
    return record;
  }

  async createAiResearch(data: { leadId: number; pipelineType: string; promptVersion: number; promptUsed: string; modelUsed: string | null; outputJson: AiOutputJson; openerScript: string; createdByUserId: number }): Promise<AiResearchRecord> {
    const [record] = await db.insert(aiResearch).values({
      leadId: data.leadId,
      pipelineType: data.pipelineType as any,
      promptVersion: data.promptVersion,
      promptUsed: data.promptUsed,
      modelUsed: data.modelUsed,
      outputJson: data.outputJson,
      openerScript: data.openerScript,
      createdByUserId: data.createdByUserId,
      isCurrent: true,
    }).returning();
    return record;
  }

  async createAiResearchVersioned(data: { leadId: number; pipelineType: string; promptVersion: number; promptUsed: string; modelUsed: string | null; outputJson: AiOutputJson; openerScript: string; createdByUserId: number }): Promise<AiResearchRecord> {
    return db.transaction(async (tx) => {
      await tx.update(aiResearch)
        .set({ isCurrent: false })
        .where(and(eq(aiResearch.leadId, data.leadId), eq(aiResearch.isCurrent, true)));

      const [record] = await tx.insert(aiResearch).values({
        leadId: data.leadId,
        pipelineType: data.pipelineType as any,
        promptVersion: data.promptVersion,
        promptUsed: data.promptUsed,
        modelUsed: data.modelUsed,
        outputJson: data.outputJson,
        openerScript: data.openerScript,
        createdByUserId: data.createdByUserId,
        isCurrent: true,
      }).returning();
      return record;
    });
  }

  async markPreviousAiResearchNotCurrent(leadId: number): Promise<void> {
    await db.update(aiResearch)
      .set({ isCurrent: false })
      .where(and(eq(aiResearch.leadId, leadId), eq(aiResearch.isCurrent, true)));
  }

  async getAiResearchHistory(leadId: number): Promise<AiResearchRecord[]> {
    return db.select().from(aiResearch)
      .where(eq(aiResearch.leadId, leadId))
      .orderBy(desc(aiResearch.createdAt));
  }

  async createSignupEvent(data: { leadId: number; leadToken: string; eventType: string; payloadRaw: any; sourceIp?: string | null; userAgent?: string | null; idempotencyKey?: string | null }): Promise<SignupEvent> {
    const [event] = await db.insert(signupEvents).values({
      leadId: data.leadId,
      leadToken: data.leadToken,
      eventType: data.eventType,
      payloadRaw: data.payloadRaw,
      sourceIp: data.sourceIp || null,
      userAgent: data.userAgent || null,
      idempotencyKey: data.idempotencyKey || null,
    }).returning();
    return event;
  }

  async processWebhookSignup(eventData: { leadId: number; leadToken: string; eventType: string; payloadRaw: any; sourceIp?: string | null; userAgent?: string | null; idempotencyKey?: string | null }, leadUpdate: { statusSignup: string; signedUpAt: Date; signedUpEmail: string | null; signedUpUserId: string | null; signupSource: string }): Promise<SignupEvent> {
    return db.transaction(async (tx) => {
      const [event] = await tx.insert(signupEvents).values({
        leadId: eventData.leadId,
        leadToken: eventData.leadToken,
        eventType: eventData.eventType,
        payloadRaw: eventData.payloadRaw,
        sourceIp: eventData.sourceIp || null,
        userAgent: eventData.userAgent || null,
        idempotencyKey: eventData.idempotencyKey || null,
      }).returning();

      await tx.update(leads)
        .set({
          statusSignup: leadUpdate.statusSignup,
          signedUpAt: leadUpdate.signedUpAt,
          signedUpEmail: leadUpdate.signedUpEmail,
          signedUpUserId: leadUpdate.signedUpUserId,
          signupSource: leadUpdate.signupSource,
        })
        .where(eq(leads.id, eventData.leadId));

      return event;
    });
  }

  async getSignupEventsByLeadId(leadId: number): Promise<SignupEvent[]> {
    return db.select().from(signupEvents)
      .where(eq(signupEvents.leadId, leadId))
      .orderBy(desc(signupEvents.receivedAt));
  }

  async getSignupMetrics(range: "today" | "week" | "month"): Promise<{ total: number; byCaller: { userId: number; userName: string; count: number }[] }> {
    let startDate: Date;
    const now = new Date();
    if (range === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "week") {
      const day = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const rows = await db.select({
      assignedToUserId: leads.assignedToUserId,
      userName: users.name,
      cnt: count(leads.id),
    }).from(leads)
      .leftJoin(users, eq(leads.assignedToUserId, users.id))
      .where(and(
        eq(leads.statusSignup, "SIGNED_UP"),
        gte(leads.signedUpAt, startDate)
      ))
      .groupBy(leads.assignedToUserId, users.name);

    let total = 0;
    const byCaller: { userId: number; userName: string; count: number }[] = [];
    for (const row of rows) {
      const c = Number(row.cnt);
      total += c;
      if (row.assignedToUserId) {
        byCaller.push({ userId: row.assignedToUserId, userName: row.userName || "Unknown", count: c });
      }
    }
    byCaller.sort((a, b) => b.count - a.count);

    return { total, byCaller };
  }

  async getPerformanceMetrics(range: "today" | "week" | "month"): Promise<PerformanceMetrics> {
    let startDate: Date;
    const now = new Date();
    if (range === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "week") {
      const day = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [callRows, emailRows, replyRows, eventRows, signupRows, unreachableRows, avgAttemptsRows, signupsByStateRows, signupsByCategoryRows, timingRows, hourlyRows] = await Promise.all([
      db.select({
        userId: callLogs.userId,
        userName: users.name,
        cnt: count(callLogs.id),
      }).from(callLogs)
        .leftJoin(users, eq(callLogs.userId, users.id))
        .where(gte(callLogs.calledAt, startDate))
        .groupBy(callLogs.userId, users.name),

      db.select({
        userId: emailLogs.userId,
        userName: users.name,
        cnt: count(emailLogs.id),
      }).from(emailLogs)
        .leftJoin(users, eq(emailLogs.userId, users.id))
        .where(gte(emailLogs.createdAt, startDate))
        .groupBy(emailLogs.userId, users.name),

      db.select({
        userId: emailLogs.userId,
        userName: users.name,
        cnt: count(emailLogs.id),
      }).from(emailLogs)
        .leftJoin(users, eq(emailLogs.userId, users.id))
        .where(and(gte(emailLogs.createdAt, startDate), eq(emailLogs.isReply, true)))
        .groupBy(emailLogs.userId, users.name),

      db.select({
        eventType: emailEvents.eventType,
        cnt: count(emailEvents.id),
      }).from(emailEvents)
        .where(gte(emailEvents.createdAt, startDate))
        .groupBy(emailEvents.eventType),

      db.select({
        userId: leads.assignedToUserId,
        userName: users.name,
        cnt: count(leads.id),
      }).from(leads)
        .leftJoin(users, eq(leads.assignedToUserId, users.id))
        .where(and(
          eq(leads.statusSignup, "SIGNED_UP"),
          gte(leads.signedUpAt, startDate)
        ))
        .groupBy(leads.assignedToUserId, users.name),

      db.select({
        userId: leads.assignedToUserId,
        cnt: count(leads.id),
      }).from(leads)
        .where(and(
          eq(leads.unreachable, true),
          eq(leads.pipelineType, "vendor"),
        ))
        .groupBy(leads.assignedToUserId),

      db.select({
        userId: leads.assignedToUserId,
        avgAttempts: sql<number>`ROUND(AVG(${leads.attemptCount})::numeric, 1)`,
      }).from(leads)
        .where(and(
          eq(leads.pipelineType, "vendor"),
          sql`${leads.assignedToUserId} IS NOT NULL`,
          sql`${leads.attemptCount} > 0`,
        ))
        .groupBy(leads.assignedToUserId),

      db.select({
        state: leads.state,
        cnt: count(leads.id),
      }).from(leads)
        .where(and(
          eq(leads.statusSignup, "SIGNED_UP"),
          gte(leads.signedUpAt, startDate),
          sql`${leads.state} IS NOT NULL AND ${leads.state} != ''`,
        ))
        .groupBy(leads.state),

      db.select({
        category: leads.categoryKeyword,
        cnt: count(leads.id),
      }).from(leads)
        .where(and(
          eq(leads.statusSignup, "SIGNED_UP"),
          gte(leads.signedUpAt, startDate),
          sql`${leads.categoryKeyword} IS NOT NULL AND ${leads.categoryKeyword} != ''`,
        ))
        .groupBy(leads.categoryKeyword),

      db.select({
        badTimingTotal: sql<number>`COUNT(*) FILTER (WHERE ${callLogs.withinBadTimingWindow} = true)`,
        badTimingNoAnswer: sql<number>`COUNT(*) FILTER (WHERE ${callLogs.withinBadTimingWindow} = true AND ${callLogs.outcome} = 'NO_ANSWER')`,
        totalCalls: count(callLogs.id),
      }).from(callLogs)
        .where(gte(callLogs.calledAt, startDate)),

      db.select({
        hour: sql<number>`EXTRACT(HOUR FROM ${callLogs.calledAt})::int`,
        calls: count(callLogs.id),
        connects: sql<number>`COUNT(*) FILTER (WHERE ${callLogs.outcome} LIKE 'SPOKE_%')`,
      }).from(callLogs)
        .where(gte(callLogs.calledAt, startDate))
        .groupBy(sql`EXTRACT(HOUR FROM ${callLogs.calledAt})::int`),
    ]);

    const callerMap = new Map<number, CallerPerformance>();
    const getOrCreate = (userId: number, userName: string): CallerPerformance => {
      if (!callerMap.has(userId)) {
        callerMap.set(userId, { userId, userName, callsMade: 0, emailsSent: 0, repliesSent: 0, emailsOpened: 0, emailsClicked: 0, emailsBounced: 0, signups: 0, unreachableCount: 0, avgAttemptsPerLead: 0, callToEmailPct: 0, clickToSignupPct: 0 });
      }
      return callerMap.get(userId)!;
    };

    let totalCalls = 0, totalEmails = 0, totalReplies = 0, totalSignups = 0;
    let totalOpened = 0, totalClicked = 0, totalBounced = 0;

    for (const row of callRows) {
      const c = Number(row.cnt);
      totalCalls += c;
      if (row.userId) getOrCreate(row.userId, row.userName || "Unknown").callsMade = c;
    }

    for (const row of emailRows) {
      const c = Number(row.cnt);
      totalEmails += c;
      if (row.userId) getOrCreate(row.userId, row.userName || "Unknown").emailsSent = c;
    }

    for (const row of replyRows) {
      const c = Number(row.cnt);
      totalReplies += c;
      if (row.userId) getOrCreate(row.userId, row.userName || "Unknown").repliesSent = c;
    }

    for (const row of eventRows) {
      const c = Number(row.cnt);
      if (row.eventType === "open") totalOpened += c;
      else if (row.eventType === "click") totalClicked += c;
      else if (row.eventType === "bounce" || row.eventType === "dropped") totalBounced += c;
    }

    for (const row of signupRows) {
      const c = Number(row.cnt);
      totalSignups += c;
      if (row.userId) getOrCreate(row.userId, row.userName || "Unknown").signups = c;
    }

    for (const row of unreachableRows) {
      if (row.userId) {
        const caller = callerMap.get(row.userId);
        if (caller) caller.unreachableCount = Number(row.cnt);
      }
    }

    for (const row of avgAttemptsRows) {
      if (row.userId) {
        const caller = callerMap.get(row.userId);
        if (caller) caller.avgAttemptsPerLead = Number(row.avgAttempts);
      }
    }

    for (const caller of callerMap.values()) {
      caller.callToEmailPct = caller.callsMade > 0 ? Math.round((caller.emailsSent / caller.callsMade) * 1000) / 10 : 0;
      caller.clickToSignupPct = caller.emailsClicked > 0 ? Math.round((caller.signups / caller.emailsClicked) * 1000) / 10 : 0;
    }

    const byCaller = Array.from(callerMap.values()).sort((a, b) => b.callsMade - a.callsMade);

    const signupsByState = signupsByStateRows
      .map(r => ({ state: r.state || "Unknown", count: Number(r.cnt) }))
      .sort((a, b) => b.count - a.count);

    const signupsByCategory = signupsByCategoryRows
      .map(r => ({ category: r.category || "Unknown", count: Number(r.cnt) }))
      .sort((a, b) => b.count - a.count);

    const timingData = timingRows[0] || { badTimingTotal: 0, badTimingNoAnswer: 0, totalCalls: 0 };
    const badTimingCalls = Number(timingData.badTimingTotal);
    const badTimingNoAnswer = Number(timingData.badTimingNoAnswer);

    const bestHours = hourlyRows
      .map(r => ({
        hour: Number(r.hour),
        calls: Number(r.calls),
        connectRate: Number(r.calls) > 0 ? Math.round((Number(r.connects) / Number(r.calls)) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.connectRate - a.connectRate);

    return {
      totals: {
        calls: totalCalls,
        emails: totalEmails,
        repliesSent: totalReplies,
        emailsOpened: totalOpened,
        emailsClicked: totalClicked,
        emailsBounced: totalBounced,
        signups: totalSignups,
      },
      rates: {
        callToEmailPct: totalCalls > 0 ? Math.round((totalEmails / totalCalls) * 1000) / 10 : 0,
        emailOpenPct: totalEmails > 0 ? Math.round((totalOpened / totalEmails) * 1000) / 10 : 0,
        emailClickPct: totalEmails > 0 ? Math.round((totalClicked / totalEmails) * 1000) / 10 : 0,
        replyRatePct: totalEmails > 0 ? Math.round((totalReplies / totalEmails) * 1000) / 10 : 0,
        clickToSignupPct: totalClicked > 0 ? Math.round((totalSignups / totalClicked) * 1000) / 10 : 0,
        callToSignupPct: totalCalls > 0 ? Math.round((totalSignups / totalCalls) * 1000) / 10 : 0,
      },
      byCaller,
      signupsByState,
      signupsByCategory,
      callTimingAnalysis: {
        badTimingCalls,
        totalCalls,
        badTimingNoAnswerRate: badTimingCalls > 0 ? Math.round((badTimingNoAnswer / badTimingCalls) * 1000) / 10 : 0,
        bestHours,
      },
    };
  }

  async getSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return row?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(systemSettings).values({ key, value }).onConflictDoUpdate({
      target: systemSettings.key,
      set: { value },
    });
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data as any).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.update(leads).set({ assignedToUserId: null }).where(eq(leads.assignedToUserId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async deleteLead(id: number): Promise<void> {
    const relatedCalls = await db.select({ id: callLogs.id }).from(callLogs).where(eq(callLogs.leadId, id));
    if (relatedCalls.length > 0) {
      const callIds = relatedCalls.map(c => c.id);
      await db.delete(callEvents).where(inArray(callEvents.callLogId, callIds));
    }
    await db.delete(aiResearch).where(eq(aiResearch.leadId, id));
    await db.delete(signupEvents).where(eq(signupEvents.leadId, id));
    await db.delete(emailEvents).where(eq(emailEvents.leadId, id));
    await db.delete(callLogs).where(eq(callLogs.leadId, id));
    await db.delete(leadNotes).where(eq(leadNotes.leadId, id));
    await db.delete(emailLogs).where(eq(emailLogs.leadId, id));
    await db.delete(inboundEmails).where(eq(inboundEmails.leadId, id));
    await db.delete(leads).where(eq(leads.id, id));
  }

  async bulkDeleteLeads(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const relatedCalls = await db.select({ id: callLogs.id }).from(callLogs).where(inArray(callLogs.leadId, ids));
    if (relatedCalls.length > 0) {
      const callIds = relatedCalls.map(c => c.id);
      await db.delete(callEvents).where(inArray(callEvents.callLogId, callIds));
    }
    await db.delete(aiResearch).where(inArray(aiResearch.leadId, ids));
    await db.delete(signupEvents).where(inArray(signupEvents.leadId, ids));
    await db.delete(emailEvents).where(inArray(emailEvents.leadId, ids));
    await db.delete(callLogs).where(inArray(callLogs.leadId, ids));
    await db.delete(leadNotes).where(inArray(leadNotes.leadId, ids));
    await db.delete(emailLogs).where(inArray(emailLogs.leadId, ids));
    await db.delete(inboundEmails).where(inArray(inboundEmails.leadId, ids));
    const deleted = await db.delete(leads).where(inArray(leads.id, ids)).returning();
    return deleted.length;
  }

  async getFilteredLeads(filters: { state?: string; category?: string; minRating?: number; hasPhone?: boolean; hasEmail?: boolean; unassigned?: boolean }, limit?: number): Promise<Lead[]> {
    const conditions: any[] = [eq(leads.pipelineType, "vendor"), eq(leads.isArchived, false)];
    if (filters.unassigned) conditions.push(sql`${leads.assignedToUserId} IS NULL`);
    if (filters.state) conditions.push(sql`LOWER(${leads.state}) = LOWER(${filters.state})`);
    if (filters.category) conditions.push(sql`LOWER(${leads.categoryKeyword}) LIKE LOWER(${'%' + filters.category + '%'})`);
    if (filters.minRating) conditions.push(gte(leads.rating, String(filters.minRating)));
    if (filters.hasPhone) conditions.push(sql`${leads.phone} IS NOT NULL AND ${leads.phone} != ''`);
    if (filters.hasEmail) conditions.push(sql`(${leads.scrapedEmail} IS NOT NULL AND ${leads.scrapedEmail} != '') OR (${leads.confirmedEmail} IS NOT NULL AND ${leads.confirmedEmail} != '')`);
    let query = db.select().from(leads).where(and(...conditions)).orderBy(leads.id);
    if (limit && limit > 0) return (query as any).limit(limit);
    return query;
  }

  async getLeadsAssignedToday(): Promise<Lead[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return db.select().from(leads)
      .where(and(
        sql`${leads.assignedAt} >= ${today}`,
        sql`${leads.assignedToUserId} IS NOT NULL`
      ))
      .orderBy(leads.assignedToUserId, leads.id);
  }

  async getCallerQueues(): Promise<{ userId: number; userName: string; uncalledCount: number; totalAssigned: number }[]> {
    const allAssigned = await db.select().from(leads)
      .where(and(
        sql`${leads.assignedToUserId} IS NOT NULL`,
        eq(leads.pipelineType, "vendor")
      ));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));

    const grouped: Record<number, { total: number; uncalled: number }> = {};
    for (const lead of allAssigned) {
      const uid = lead.assignedToUserId!;
      if (!grouped[uid]) grouped[uid] = { total: 0, uncalled: 0 };
      grouped[uid].total++;
      if (lead.statusCall === "NOT_CALLED") grouped[uid].uncalled++;
    }

    return Object.entries(grouped).map(([uid, stats]) => ({
      userId: parseInt(uid),
      userName: userMap.get(parseInt(uid)) ?? `User #${uid}`,
      uncalledCount: stats.uncalled,
      totalAssigned: stats.total,
    }));
  }

  async getDailyAssignmentHistory(days: number): Promise<{ date: string; totalAssigned: number; totalCalled: number; callers: { userId: number; userName: string; assigned: number; called: number }[] }[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const assigned = await db.select().from(leads)
      .where(and(
        sql`${leads.assignedAt} >= ${since}`,
        sql`${leads.assignedToUserId} IS NOT NULL`
      ));

    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));

    const byDate: Record<string, Record<number, Lead[]>> = {};
    for (const lead of assigned) {
      if (!lead.assignedAt) continue;
      const dateStr = new Date(lead.assignedAt).toISOString().split("T")[0];
      const uid = lead.assignedToUserId!;
      if (!byDate[dateStr]) byDate[dateStr] = {};
      if (!byDate[dateStr][uid]) byDate[dateStr][uid] = [];
      byDate[dateStr][uid].push(lead);
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, callerLeads]) => {
        const callers = Object.entries(callerLeads).map(([uid, lds]) => ({
          userId: parseInt(uid),
          userName: userMap.get(parseInt(uid)) ?? `User #${uid}`,
          assigned: lds.length,
          called: lds.filter(l => l.statusCall !== "NOT_CALLED").length,
        }));
        const totalAssigned = callers.reduce((s, c) => s + c.assigned, 0);
        const totalCalled = callers.reduce((s, c) => s + c.called, 0);
        return { date, totalAssigned, totalCalled, callers };
      });
  }

  async getLeadsAssignedOnDate(dateStr: string): Promise<Lead[]> {
    const startOfDay = new Date(dateStr + "T00:00:00.000Z");
    const endOfDay = new Date(dateStr + "T23:59:59.999Z");
    return db.select().from(leads)
      .where(and(
        sql`${leads.assignedAt} >= ${startOfDay}`,
        sql`${leads.assignedAt} <= ${endOfDay}`,
        sql`${leads.assignedToUserId} IS NOT NULL`
      ))
      .orderBy(leads.assignedToUserId, leads.id);
  }

  async getCallLogByTwilioSid(sid: string): Promise<CallLog | undefined> {
    const [row] = await db.select().from(callLogs).where(eq(callLogs.twilioCallSid, sid));
    return row;
  }

  async updateCallLog(id: number, data: Partial<CallLog>): Promise<CallLog | undefined> {
    const [row] = await db.update(callLogs).set(data as any).where(eq(callLogs.id, id)).returning();
    return row;
  }

  async createCallEvent(data: { callLogId: number; twilioCallSid?: string; eventType: string; raw?: any }): Promise<CallEvent> {
    const [row] = await db.insert(callEvents).values({
      callLogId: data.callLogId,
      twilioCallSid: data.twilioCallSid || null,
      eventType: data.eventType,
      raw: data.raw || null,
    }).returning();
    return row;
  }

  async getCallEventsByCallLogId(callLogId: number): Promise<CallEvent[]> {
    return db.select().from(callEvents).where(eq(callEvents.callLogId, callLogId)).orderBy(asc(callEvents.createdAt));
  }

  async getPendingTranscriptions(): Promise<CallLog[]> {
    return db.select().from(callLogs).where(
      and(
        eq(callLogs.transcriptStatus, "PENDING"),
        sql`${callLogs.recordingUrl} IS NOT NULL`,
      )
    ).limit(5);
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(systemSettings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async getPipelineHealth(): Promise<{
    totalUncontacted: number;
    untouchedAssigned: number;
    retryQueueSize: number;
    unreachableCount: number;
    activePending: number;
    clickedNotSignedUp: number;
  }> {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const [totalUncontactedR, untouchedAssignedR, retryQueueR, unreachableR, activePendingR, clickedNotSignedUpR] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(eq(leads.statusCall, "NOT_CALLED")),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(
          sql`${leads.assignedToUserId} IS NOT NULL`,
          eq(leads.statusCall, "NOT_CALLED"),
          lte(leads.assignedAt, threeDaysAgo)
        )),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(
          sql`${leads.retryNextEligibleAt} IS NOT NULL`,
          lte(leads.retryNextEligibleAt, now)
        )),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(eq(leads.unreachable, true)),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(
          sql`${leads.statusCall} IN ('SPOKE_SEND_INFO', 'SPOKE_FOLLOW_UP', 'SPOKE_INTERESTED', 'SPOKE_NOT_INTERESTED')`,
          eq(leads.statusEmail, "NOT_SENT")
        )),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(
          eq(leads.statusEmail, "CLICKED"),
          sql`${leads.statusSignup} != 'SIGNED_UP'`
        )),
    ]);

    return {
      totalUncontacted: Number(totalUncontactedR[0].count),
      untouchedAssigned: Number(untouchedAssignedR[0].count),
      retryQueueSize: Number(retryQueueR[0].count),
      unreachableCount: Number(unreachableR[0].count),
      activePending: Number(activePendingR[0].count),
      clickedNotSignedUp: Number(clickedNotSignedUpR[0].count),
    };
  }

  async getCallReviewQueue(filters: {
    callerId?: number;
    outcome?: string;
    dateFrom?: string;
    dateTo?: string;
    hasRecording?: boolean;
    qualityTag?: string;
    limit: number;
    offset: number;
  }): Promise<any[]> {
    const conditions: any[] = [];

    if (filters.callerId) {
      conditions.push(eq(callLogs.userId, filters.callerId));
    }
    if (filters.outcome) {
      conditions.push(eq(callLogs.outcome, filters.outcome as any));
    }
    if (filters.dateFrom) {
      conditions.push(gte(callLogs.calledAt, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
      conditions.push(lte(callLogs.calledAt, new Date(filters.dateTo)));
    }
    if (filters.hasRecording === true) {
      conditions.push(sql`${callLogs.recordingUrl} IS NOT NULL`);
    } else if (filters.hasRecording === false) {
      conditions.push(sql`${callLogs.recordingUrl} IS NULL`);
    }
    if (filters.qualityTag) {
      conditions.push(eq(callLogs.qualityTag, filters.qualityTag));
    }

    const query = db.select({
      id: callLogs.id,
      leadId: callLogs.leadId,
      userId: callLogs.userId,
      calledAt: callLogs.calledAt,
      outcome: callLogs.outcome,
      durationSeconds: callLogs.durationSeconds,
      notes: callLogs.notes,
      withinBadTimingWindow: callLogs.withinBadTimingWindow,
      twilioCallSid: callLogs.twilioCallSid,
      callMode: callLogs.callMode,
      callStatus: callLogs.callStatus,
      recordingSid: callLogs.recordingSid,
      recordingUrl: callLogs.recordingUrl,
      recordingDurationSeconds: callLogs.recordingDurationSeconds,
      transcriptStatus: callLogs.transcriptStatus,
      transcriptText: callLogs.transcriptText,
      coachNote: callLogs.coachNote,
      qualityTag: callLogs.qualityTag,
      coachNoteByUserId: callLogs.coachNoteByUserId,
      coachNoteAt: callLogs.coachNoteAt,
      createdAt: callLogs.createdAt,
      callerName: users.name,
      companyName: leads.companyName,
    })
      .from(callLogs)
      .leftJoin(users, eq(callLogs.userId, users.id))
      .leftJoin(leads, eq(callLogs.leadId, leads.id));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = whereClause
      ? await query.where(whereClause).orderBy(desc(callLogs.calledAt)).limit(filters.limit).offset(filters.offset)
      : await query.orderBy(desc(callLogs.calledAt)).limit(filters.limit).offset(filters.offset);

    return rows;
  }

  async getAllCallLogs(): Promise<CallLog[]> {
    return db.select().from(callLogs).orderBy(desc(callLogs.calledAt));
  }

  async getAllEmailLogs(): Promise<EmailLog[]> {
    return db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt));
  }

  async getAllSignupEvents(): Promise<SignupEvent[]> {
    return db.select().from(signupEvents).orderBy(desc(signupEvents.receivedAt));
  }

  async getCallerDetail(userId: number, range: "today" | "week" | "month"): Promise<{
    user: { id: number; name: string; email: string; role: string; dailyCallTarget: number | null };
    metrics: {
      totalCalls: number;
      totalEmails: number;
      totalSignups: number;
      callToEmailPct: number;
      clickToSignupPct: number;
      unreachableRate: number;
      outcomeDistribution: { outcome: string; count: number }[];
    };
    dailyTrend: { date: string; calls: number; emails: number; signups: number }[];
  }> {
    const now = new Date();
    let startDate: Date;
    if (range === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === "week") {
      const day = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const user = await this.getUserById(userId);
    if (!user) throw new Error("User not found");

    const [callCountR, emailCountR, signupCountR, clickedCountR, unreachableR, outcomeRows, dailyCallRows, dailyEmailRows, dailySignupRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(callLogs)
        .where(and(eq(callLogs.userId, userId), gte(callLogs.calledAt, startDate))),
      db.select({ count: sql<number>`count(*)` }).from(emailLogs)
        .where(and(eq(emailLogs.userId, userId), gte(emailLogs.createdAt, startDate))),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(eq(leads.assignedToUserId, userId), eq(leads.statusSignup, "SIGNED_UP"), gte(leads.signedUpAt, startDate))),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(eq(leads.assignedToUserId, userId), eq(leads.statusEmail, "CLICKED"))),
      db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(and(eq(leads.assignedToUserId, userId), eq(leads.unreachable, true))),
      db.select({
        outcome: callLogs.outcome,
        count: sql<number>`count(*)`,
      }).from(callLogs)
        .where(and(eq(callLogs.userId, userId), gte(callLogs.calledAt, startDate)))
        .groupBy(callLogs.outcome),
      db.select({
        date: sql<string>`TO_CHAR(${callLogs.calledAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(callLogs)
        .where(and(eq(callLogs.userId, userId), gte(callLogs.calledAt, startDate)))
        .groupBy(sql`TO_CHAR(${callLogs.calledAt}, 'YYYY-MM-DD')`),
      db.select({
        date: sql<string>`TO_CHAR(${emailLogs.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(emailLogs)
        .where(and(eq(emailLogs.userId, userId), gte(emailLogs.createdAt, startDate)))
        .groupBy(sql`TO_CHAR(${emailLogs.createdAt}, 'YYYY-MM-DD')`),
      db.select({
        date: sql<string>`TO_CHAR(${leads.signedUpAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      }).from(leads)
        .where(and(eq(leads.assignedToUserId, userId), eq(leads.statusSignup, "SIGNED_UP"), gte(leads.signedUpAt, startDate)))
        .groupBy(sql`TO_CHAR(${leads.signedUpAt}, 'YYYY-MM-DD')`),
    ]);

    const totalCalls = Number(callCountR[0].count);
    const totalEmails = Number(emailCountR[0].count);
    const totalSignups = Number(signupCountR[0].count);
    const totalClicked = Number(clickedCountR[0].count);
    const totalUnreachable = Number(unreachableR[0].count);
    const totalAssigned = await db.select({ count: sql<number>`count(*)` }).from(leads)
      .where(eq(leads.assignedToUserId, userId));
    const totalAssignedCount = Number(totalAssigned[0].count);

    const outcomeDistribution = outcomeRows.map(r => ({
      outcome: r.outcome || "UNKNOWN",
      count: Number(r.count),
    }));

    const dailyMap = new Map<string, { calls: number; emails: number; signups: number }>();
    for (const r of dailyCallRows) {
      const d = dailyMap.get(r.date) || { calls: 0, emails: 0, signups: 0 };
      d.calls = Number(r.count);
      dailyMap.set(r.date, d);
    }
    for (const r of dailyEmailRows) {
      const d = dailyMap.get(r.date) || { calls: 0, emails: 0, signups: 0 };
      d.emails = Number(r.count);
      dailyMap.set(r.date, d);
    }
    for (const r of dailySignupRows) {
      const d = dailyMap.get(r.date) || { calls: 0, emails: 0, signups: 0 };
      d.signups = Number(r.count);
      dailyMap.set(r.date, d);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        dailyCallTarget: user.dailyCallTarget,
      },
      metrics: {
        totalCalls,
        totalEmails,
        totalSignups,
        callToEmailPct: totalCalls > 0 ? Math.round((totalEmails / totalCalls) * 1000) / 10 : 0,
        clickToSignupPct: totalClicked > 0 ? Math.round((totalSignups / totalClicked) * 1000) / 10 : 0,
        unreachableRate: totalAssignedCount > 0 ? Math.round((totalUnreachable / totalAssignedCount) * 1000) / 10 : 0,
        outcomeDistribution,
      },
      dailyTrend,
    };
  }
  async getLeadScoreWeights(): Promise<Record<string, number>> {
    const defaults: Record<string, number> = {
      score_weight_email: 20,
      score_weight_website: 15,
      score_weight_rating: 20,
      score_weight_reviews: 15,
      score_weight_phone: 10,
      score_weight_clicked: 20,
    };
    const rows = await db.select().from(systemSettings)
      .where(sql`${systemSettings.key} LIKE 'score_weight_%'`);
    for (const row of rows) {
      defaults[row.key] = parseInt(row.value) || defaults[row.key] || 0;
    }
    return defaults;
  }

  async getLeakReport(): Promise<{
    clickedNotSignedUp: Lead[];
    spokeNoEmail: Lead[];
    retriedNeverMoved: Lead[];
    assignedUntouched: Lead[];
  }> {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const [clickedNotSignedUp, spokeNoEmail, retriedNeverMoved, assignedUntouched] = await Promise.all([
      db.select().from(leads)
        .where(and(
          eq(leads.statusEmail, "CLICKED"),
          sql`${leads.statusSignup} != 'SIGNED_UP'`
        ))
        .orderBy(desc(leads.emailLastSentAt))
        .limit(50),
      db.select().from(leads)
        .where(and(
          sql`${leads.statusCall} IN ('SPOKE_SEND_INFO', 'SPOKE_FOLLOW_UP', 'SPOKE_INTERESTED')`,
          eq(leads.statusEmail, "NOT_SENT")
        ))
        .orderBy(desc(leads.createdAt))
        .limit(50),
      db.select().from(leads)
        .where(and(
          gte(leads.attemptCount, 3),
          sql`${leads.statusCall} IN ('NOT_CALLED', 'NO_ANSWER', 'VOICEMAIL', 'GATEKEEPER', 'CALL_DROPPED')`
        ))
        .orderBy(desc(leads.attemptCount))
        .limit(50),
      db.select().from(leads)
        .where(and(
          sql`${leads.assignedToUserId} IS NOT NULL`,
          eq(leads.statusCall, "NOT_CALLED"),
          lte(leads.assignedAt, threeDaysAgo)
        ))
        .orderBy(asc(leads.assignedAt))
        .limit(50),
    ]);

    return { clickedNotSignedUp, spokeNoEmail, retriedNeverMoved, assignedUntouched };
  }

  async getCallerAlerts(): Promise<Array<{
    type: 'low_conversion' | 'high_unreachable' | 'no_activity' | 'high_no_answer';
    callerId: number;
    callerName: string;
    message: string;
    severity: 'warning' | 'info';
  }>> {
    const alerts: Array<{
      type: 'low_conversion' | 'high_unreachable' | 'no_activity' | 'high_no_answer';
      callerId: number;
      callerName: string;
      message: string;
      severity: 'warning' | 'info';
    }> = [];

    const allCallers = await db.select().from(users)
      .where(sql`${users.role} IN ('vendor_caller', 'buyer_caller')`);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const currentHour = now.getHours();

    for (const caller of allCallers) {
      const [callsTodayR] = await db.select({ count: sql<number>`count(*)` }).from(callLogs)
        .where(and(eq(callLogs.userId, caller.id), gte(callLogs.calledAt, todayStart)));
      const callsToday = Number(callsTodayR.count);

      if (callsToday === 0 && currentHour >= 11) {
        alerts.push({
          type: 'no_activity',
          callerId: caller.id,
          callerName: caller.name,
          message: `${caller.name} has made 0 calls today`,
          severity: 'warning',
        });
      }

      const [calls7dR] = await db.select({ count: sql<number>`count(*)` }).from(callLogs)
        .where(and(eq(callLogs.userId, caller.id), gte(callLogs.calledAt, sevenDaysAgo)));
      const calls7d = Number(calls7dR.count);

      if (calls7d >= 10) {
        const [emails7dR] = await db.select({ count: sql<number>`count(*)` }).from(emailLogs)
          .where(and(eq(emailLogs.userId, caller.id), gte(emailLogs.createdAt, sevenDaysAgo)));
        const emails7d = Number(emails7dR.count);
        const callToEmailPct = (emails7d / calls7d) * 100;

        if (callToEmailPct < 20) {
          alerts.push({
            type: 'low_conversion',
            callerId: caller.id,
            callerName: caller.name,
            message: `${caller.name} has ${callToEmailPct.toFixed(1)}% call-to-email rate (last 7 days)`,
            severity: 'warning',
          });
        }

        const [noAnswer7dR] = await db.select({ count: sql<number>`count(*)` }).from(callLogs)
          .where(and(eq(callLogs.userId, caller.id), gte(callLogs.calledAt, sevenDaysAgo), eq(callLogs.outcome, "NO_ANSWER")));
        const noAnswer7d = Number(noAnswer7dR.count);
        const noAnswerPct = (noAnswer7d / calls7d) * 100;

        if (noAnswerPct > 70) {
          alerts.push({
            type: 'high_no_answer',
            callerId: caller.id,
            callerName: caller.name,
            message: `${caller.name} has ${noAnswerPct.toFixed(1)}% NO_ANSWER rate (last 7 days)`,
            severity: 'info',
          });
        }
      }

      const [assignedR] = await db.select({ count: sql<number>`count(*)` }).from(leads)
        .where(eq(leads.assignedToUserId, caller.id));
      const assigned = Number(assignedR.count);

      if (assigned > 0) {
        const [unreachableR] = await db.select({ count: sql<number>`count(*)` }).from(leads)
          .where(and(eq(leads.assignedToUserId, caller.id), eq(leads.unreachable, true)));
        const unreachable = Number(unreachableR.count);
        const unreachablePct = (unreachable / assigned) * 100;

        if (unreachablePct > 30) {
          alerts.push({
            type: 'high_unreachable',
            callerId: caller.id,
            callerName: caller.name,
            message: `${caller.name} has ${unreachablePct.toFixed(1)}% unreachable leads`,
            severity: 'warning',
          });
        }
      }
    }

    return alerts;
  }

  async getCategoryStateAnalysis(range: "week" | "month" | "all"): Promise<{
    byState: { state: string; calls: number; emails: number; signups: number; conversionPct: number }[];
    byCategory: { category: string; calls: number; emails: number; signups: number; conversionPct: number }[];
    byRatingBand: { band: string; calls: number; signups: number; conversionPct: number }[];
    bySourceFile: { sourceFile: string; totalLeads: number; calls: number; signups: number; conversionPct: number }[];
  }> {
    const now = new Date();
    let startDate: Date | null = null;
    if (range === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dateFilter = startDate ? gte(callLogs.calledAt, startDate) : sql`1=1`;
    const leadDateFilter = startDate ? gte(leads.signedUpAt, startDate) : sql`1=1`;

    const [stateCallRows, stateEmailRows, stateSignupRows] = await Promise.all([
      db.select({
        state: leads.state,
        cnt: count(callLogs.id),
      }).from(callLogs)
        .innerJoin(leads, eq(callLogs.leadId, leads.id))
        .where(and(dateFilter, sql`${leads.state} IS NOT NULL AND ${leads.state} != ''`))
        .groupBy(leads.state),
      db.select({
        state: leads.state,
        cnt: count(emailLogs.id),
      }).from(emailLogs)
        .innerJoin(leads, eq(emailLogs.leadId, leads.id))
        .where(and(startDate ? gte(emailLogs.createdAt, startDate) : sql`1=1`, sql`${leads.state} IS NOT NULL AND ${leads.state} != ''`))
        .groupBy(leads.state),
      db.select({
        state: leads.state,
        cnt: count(leads.id),
      }).from(leads)
        .where(and(eq(leads.statusSignup, "SIGNED_UP"), leadDateFilter, sql`${leads.state} IS NOT NULL AND ${leads.state} != ''`))
        .groupBy(leads.state),
    ]);

    const stateMap = new Map<string, { calls: number; emails: number; signups: number }>();
    for (const r of stateCallRows) {
      const s = r.state || "Unknown";
      const entry = stateMap.get(s) || { calls: 0, emails: 0, signups: 0 };
      entry.calls = Number(r.cnt);
      stateMap.set(s, entry);
    }
    for (const r of stateEmailRows) {
      const s = r.state || "Unknown";
      const entry = stateMap.get(s) || { calls: 0, emails: 0, signups: 0 };
      entry.emails = Number(r.cnt);
      stateMap.set(s, entry);
    }
    for (const r of stateSignupRows) {
      const s = r.state || "Unknown";
      const entry = stateMap.get(s) || { calls: 0, emails: 0, signups: 0 };
      entry.signups = Number(r.cnt);
      stateMap.set(s, entry);
    }
    const byState = Array.from(stateMap.entries()).map(([state, d]) => ({
      state, ...d, conversionPct: d.calls > 0 ? Math.round((d.signups / d.calls) * 10000) / 100 : 0,
    })).sort((a, b) => b.calls - a.calls);

    const [catCallRows, catEmailRows, catSignupRows] = await Promise.all([
      db.select({
        category: leads.categoryKeyword,
        cnt: count(callLogs.id),
      }).from(callLogs)
        .innerJoin(leads, eq(callLogs.leadId, leads.id))
        .where(and(dateFilter, sql`${leads.categoryKeyword} IS NOT NULL AND ${leads.categoryKeyword} != ''`))
        .groupBy(leads.categoryKeyword),
      db.select({
        category: leads.categoryKeyword,
        cnt: count(emailLogs.id),
      }).from(emailLogs)
        .innerJoin(leads, eq(emailLogs.leadId, leads.id))
        .where(and(startDate ? gte(emailLogs.createdAt, startDate) : sql`1=1`, sql`${leads.categoryKeyword} IS NOT NULL AND ${leads.categoryKeyword} != ''`))
        .groupBy(leads.categoryKeyword),
      db.select({
        category: leads.categoryKeyword,
        cnt: count(leads.id),
      }).from(leads)
        .where(and(eq(leads.statusSignup, "SIGNED_UP"), leadDateFilter, sql`${leads.categoryKeyword} IS NOT NULL AND ${leads.categoryKeyword} != ''`))
        .groupBy(leads.categoryKeyword),
    ]);

    const catMap = new Map<string, { calls: number; emails: number; signups: number }>();
    for (const r of catCallRows) {
      const c = r.category || "Unknown";
      const entry = catMap.get(c) || { calls: 0, emails: 0, signups: 0 };
      entry.calls = Number(r.cnt);
      catMap.set(c, entry);
    }
    for (const r of catEmailRows) {
      const c = r.category || "Unknown";
      const entry = catMap.get(c) || { calls: 0, emails: 0, signups: 0 };
      entry.emails = Number(r.cnt);
      catMap.set(c, entry);
    }
    for (const r of catSignupRows) {
      const c = r.category || "Unknown";
      const entry = catMap.get(c) || { calls: 0, emails: 0, signups: 0 };
      entry.signups = Number(r.cnt);
      catMap.set(c, entry);
    }
    const byCategory = Array.from(catMap.entries()).map(([category, d]) => ({
      category, ...d, conversionPct: d.calls > 0 ? Math.round((d.signups / d.calls) * 10000) / 100 : 0,
    })).sort((a, b) => b.calls - a.calls);

    const ratingBands = [
      { band: "No Rating", condition: sql`(${leads.rating} IS NULL OR ${leads.rating}::text = '')` },
      { band: "1-2", condition: sql`${leads.rating}::numeric >= 1 AND ${leads.rating}::numeric < 2` },
      { band: "2-3", condition: sql`${leads.rating}::numeric >= 2 AND ${leads.rating}::numeric < 3` },
      { band: "3-4", condition: sql`${leads.rating}::numeric >= 3 AND ${leads.rating}::numeric < 4` },
      { band: "4-5", condition: sql`${leads.rating}::numeric >= 4 AND ${leads.rating}::numeric <= 5` },
    ];

    const byRatingBand: { band: string; calls: number; signups: number; conversionPct: number }[] = [];
    for (const rb of ratingBands) {
      const [callR] = await db.select({ cnt: count(callLogs.id) }).from(callLogs)
        .innerJoin(leads, eq(callLogs.leadId, leads.id))
        .where(and(dateFilter, rb.condition));
      const [signupR] = await db.select({ cnt: count(leads.id) }).from(leads)
        .where(and(eq(leads.statusSignup, "SIGNED_UP"), leadDateFilter, rb.condition));
      const calls = Number(callR.cnt);
      const signups = Number(signupR.cnt);
      byRatingBand.push({
        band: rb.band,
        calls,
        signups,
        conversionPct: calls > 0 ? Math.round((signups / calls) * 10000) / 100 : 0,
      });
    }

    const [sfCallRows, sfSignupRows, sfTotalRows] = await Promise.all([
      db.select({
        sourceFile: leads.sourceFile,
        cnt: count(callLogs.id),
      }).from(callLogs)
        .innerJoin(leads, eq(callLogs.leadId, leads.id))
        .where(and(dateFilter, sql`${leads.sourceFile} IS NOT NULL AND ${leads.sourceFile} != ''`))
        .groupBy(leads.sourceFile),
      db.select({
        sourceFile: leads.sourceFile,
        cnt: count(leads.id),
      }).from(leads)
        .where(and(eq(leads.statusSignup, "SIGNED_UP"), leadDateFilter, sql`${leads.sourceFile} IS NOT NULL AND ${leads.sourceFile} != ''`))
        .groupBy(leads.sourceFile),
      db.select({
        sourceFile: leads.sourceFile,
        cnt: count(leads.id),
      }).from(leads)
        .where(sql`${leads.sourceFile} IS NOT NULL AND ${leads.sourceFile} != ''`)
        .groupBy(leads.sourceFile),
    ]);

    const sfMap = new Map<string, { totalLeads: number; calls: number; signups: number }>();
    for (const r of sfTotalRows) {
      const sf = r.sourceFile || "Unknown";
      const entry = sfMap.get(sf) || { totalLeads: 0, calls: 0, signups: 0 };
      entry.totalLeads = Number(r.cnt);
      sfMap.set(sf, entry);
    }
    for (const r of sfCallRows) {
      const sf = r.sourceFile || "Unknown";
      const entry = sfMap.get(sf) || { totalLeads: 0, calls: 0, signups: 0 };
      entry.calls = Number(r.cnt);
      sfMap.set(sf, entry);
    }
    for (const r of sfSignupRows) {
      const sf = r.sourceFile || "Unknown";
      const entry = sfMap.get(sf) || { totalLeads: 0, calls: 0, signups: 0 };
      entry.signups = Number(r.cnt);
      sfMap.set(sf, entry);
    }
    const bySourceFile = Array.from(sfMap.entries()).map(([sourceFile, d]) => ({
      sourceFile, ...d, conversionPct: d.calls > 0 ? Math.round((d.signups / d.calls) * 10000) / 100 : 0,
    })).sort((a, b) => b.totalLeads - a.totalLeads);

    return { byState, byCategory, byRatingBand, bySourceFile };
  }

  async createInboundEmail(data: any): Promise<any> {
    const [result] = await db.insert(inboundEmails).values(data).returning();
    return result;
  }

  async getInboundEmailsByLeadId(leadId: number): Promise<any[]> {
    return db.select().from(inboundEmails).where(eq(inboundEmails.leadId, leadId)).orderBy(desc(inboundEmails.receivedAt));
  }

  async markInboundEmailRead(id: number, userId: number): Promise<void> {
    await db.update(inboundEmails).set({ isRead: true, readByUserId: userId, readAt: new Date() }).where(eq(inboundEmails.id, id));
  }

  async getEmailThread(leadId: number): Promise<{ sent: any[]; received: any[] }> {
    const sent = await db.select().from(emailLogs).where(eq(emailLogs.leadId, leadId)).orderBy(asc(emailLogs.createdAt));
    const received = await db.select().from(inboundEmails).where(eq(inboundEmails.leadId, leadId)).orderBy(asc(inboundEmails.receivedAt));
    return { sent, received };
  }

  async getEmailThreads(opts: { filter: string; currentUserId: number; leadId?: number; assignedCallerId?: number }): Promise<any[]> {
    const conditions: any[] = [];

    if (opts.leadId) {
      conditions.push(eq(leads.id, opts.leadId));
    }
    if (opts.filter === "mine" || opts.assignedCallerId) {
      conditions.push(eq(leads.assignedToUserId, opts.assignedCallerId || opts.currentUserId));
    }

    conditions.push(sql`(EXISTS (SELECT 1 FROM email_logs el WHERE el.lead_id = ${leads.id}) OR EXISTS (SELECT 1 FROM inbound_emails ie WHERE ie.lead_id = ${leads.id}))`);

    if (opts.filter === "unread") {
      conditions.push(sql`EXISTS (SELECT 1 FROM inbound_emails ie WHERE ie.lead_id = ${leads.id} AND ie.is_read = false)`);
    }

    const rows = await db.select({
      leadId: leads.id,
      companyName: leads.companyName,
      confirmedEmail: leads.confirmedEmail,
      contactName: leads.contactName,
      assignedToUserId: leads.assignedToUserId,
      statusEmail: leads.statusEmail,
    })
    .from(leads)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(leads.id))
    .limit(100);

    const enriched = await Promise.all(rows.map(async (row) => {
      const [unread] = await db.select({ count: sql<number>`count(*)` }).from(inboundEmails).where(and(eq(inboundEmails.leadId, row.leadId), eq(inboundEmails.isRead, false)));
      const [sentCount] = await db.select({ count: sql<number>`count(*)` }).from(emailLogs).where(eq(emailLogs.leadId, row.leadId));
      const [receivedCount] = await db.select({ count: sql<number>`count(*)` }).from(inboundEmails).where(eq(inboundEmails.leadId, row.leadId));
      const lastSent = await db.select({ subject: emailLogs.subject, createdAt: emailLogs.createdAt }).from(emailLogs).where(eq(emailLogs.leadId, row.leadId)).orderBy(desc(emailLogs.createdAt)).limit(1);
      const lastReceived = await db.select({ receivedAt: inboundEmails.receivedAt }).from(inboundEmails).where(eq(inboundEmails.leadId, row.leadId)).orderBy(desc(inboundEmails.receivedAt)).limit(1);

      const lastActivity = lastReceived[0]?.receivedAt && lastSent[0]?.createdAt
        ? (lastReceived[0].receivedAt > lastSent[0].createdAt ? lastReceived[0].receivedAt : lastSent[0].createdAt)
        : lastReceived[0]?.receivedAt || lastSent[0]?.createdAt || null;

      return {
        ...row,
        unreadCount: Number(unread?.count || 0),
        sentCount: Number(sentCount?.count || 0),
        receivedCount: Number(receivedCount?.count || 0),
        lastSubject: lastSent[0]?.subject || null,
        lastActivity,
      };
    }));

    enriched.sort((a, b) => {
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });

    return enriched;
  }
}

export const storage = new DatabaseStorage();
