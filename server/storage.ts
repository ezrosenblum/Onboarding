import { db } from "./db";
import { eq, and, isNull, ilike, sql, desc, asc, lte, gte, count } from "drizzle-orm";
import { users, leads, callLogs, leadNotes, emailLogs, emailEvents, emailTemplates, aiPrompts, aiResearch, signupEvents, systemSettings, callEvents } from "@shared/schema";
import type { User, InsertLead, Lead, CallLog, InsertCallLog, LeadNote, InsertLeadNote, EmailLog, InsertEmailLog, EmailEvent, InsertEmailEvent, EmailTemplate, InsertEmailTemplate, AiPrompt, AiResearchRecord, AiOutputJson, SignupEvent, SystemSetting, CallEvent } from "@shared/schema";
import bcrypt from "bcryptjs";

export interface CallerPerformance {
  userId: number;
  userName: string;
  callsMade: number;
  emailsSent: number;
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
    emailsOpened: number;
    emailsClicked: number;
    emailsBounced: number;
    signups: number;
  };
  rates: {
    callToEmailPct: number;
    emailOpenPct: number;
    emailClickPct: number;
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

  getNewLeads(userId: number, includeUnreachable?: boolean): Promise<Lead[]>;
  getRetryLeads(userId: number, includeUnreachable?: boolean): Promise<Lead[]>;
  getRetryEligibleCount(userId: number): Promise<number>;
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

  getCallLogByTwilioSid(sid: string): Promise<CallLog | undefined>;
  updateCallLog(id: number, data: Partial<CallLog>): Promise<CallLog | undefined>;
  createCallEvent(data: { callLogId: number; twilioCallSid?: string; eventType: string; raw?: any }): Promise<CallEvent>;
  getCallEventsByCallLogId(callLogId: number): Promise<CallEvent[]>;
  getPendingTranscriptions(): Promise<CallLog[]>;

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
        .where(eq(leads.pipelineType, pipelineType as any))
        .orderBy(desc(leads.createdAt));
    }
    return db.select().from(leads).orderBy(desc(leads.createdAt));
  }

  async getLeadsByUserId(userId: number): Promise<Lead[]> {
    return db.select().from(leads)
      .where(eq(leads.assignedToUserId, userId))
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
      sql`${leads.statusSignup} != 'SIGNED_UP'`,
    ];
    if (!includeUnreachable) conditions.push(eq(leads.unreachable, false));
    return db.select().from(leads)
      .where(and(...conditions))
      .orderBy(asc(leads.createdAt));
  }

  async getRetryLeads(userId: number, includeUnreachable = false): Promise<Lead[]> {
    const conditions = [
      eq(leads.assignedToUserId, userId),
      sql`${leads.statusCall} != 'NOT_CALLED'`,
      sql`${leads.statusSignup} != 'SIGNED_UP'`,
      sql`${leads.retryNextEligibleAt} IS NOT NULL`,
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
        sql`${leads.statusSignup} != 'SIGNED_UP'`,
        sql`${leads.retryNextEligibleAt} IS NOT NULL`,
        lte(leads.retryNextEligibleAt, now)
      ));
    return Number(result[0].count);
  }

  async getActiveLeads(userId: number, includeUnreachable = false): Promise<Lead[]> {
    const conditions = [
      eq(leads.assignedToUserId, userId),
      sql`${leads.statusSignup} != 'SIGNED_UP'`,
      sql`${leads.statusCall} IN ('SPOKE_SEND_INFO', 'SPOKE_FOLLOW_UP', 'SPOKE_INTERESTED', 'SPOKE_NOT_INTERESTED')`,
      sql`${leads.retryNextEligibleAt} IS NULL`,
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
      const [updated] = await db.update(emailTemplates)
        .set({ subject: data.subject, bodyHtml: data.bodyHtml, updatedAt: new Date() })
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

    const [callRows, emailRows, eventRows, signupRows, unreachableRows, avgAttemptsRows, signupsByStateRows, signupsByCategoryRows, timingRows, hourlyRows] = await Promise.all([
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
        callerMap.set(userId, { userId, userName, callsMade: 0, emailsSent: 0, emailsOpened: 0, emailsClicked: 0, emailsBounced: 0, signups: 0, unreachableCount: 0, avgAttemptsPerLead: 0, callToEmailPct: 0, clickToSignupPct: 0 });
      }
      return callerMap.get(userId)!;
    };

    let totalCalls = 0, totalEmails = 0, totalSignups = 0;
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
        emailsOpened: totalOpened,
        emailsClicked: totalClicked,
        emailsBounced: totalBounced,
        signups: totalSignups,
      },
      rates: {
        callToEmailPct: totalCalls > 0 ? Math.round((totalEmails / totalCalls) * 1000) / 10 : 0,
        emailOpenPct: totalEmails > 0 ? Math.round((totalOpened / totalEmails) * 1000) / 10 : 0,
        emailClickPct: totalEmails > 0 ? Math.round((totalClicked / totalEmails) * 1000) / 10 : 0,
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
}

export const storage = new DatabaseStorage();
