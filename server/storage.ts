import { db } from "./db";
import { eq, and, isNull, ilike, sql, desc, asc, lte, gte } from "drizzle-orm";
import { users, leads, callLogs, leadNotes, systemSettings } from "@shared/schema";
import type { User, InsertLead, Lead, CallLog, InsertCallLog, LeadNote, InsertLeadNote, SystemSetting } from "@shared/schema";
import bcrypt from "bcryptjs";

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
  assignLeads(callerId: number, count: number, filters?: { state?: string; category?: string }): Promise<number>;

  getNewLeads(userId: number): Promise<Lead[]>;
  getRetryLeads(userId: number): Promise<Lead[]>;
  getCompletedLeads(userId: number): Promise<Lead[]>;

  createCallLog(data: InsertCallLog): Promise<CallLog>;
  getCallLogsByLeadId(leadId: number): Promise<CallLog[]>;
  getCallLogsTodayByUserId(userId: number): Promise<number>;
  getLastCallLogForLead(leadId: number): Promise<CallLog | undefined>;

  createLeadNote(data: InsertLeadNote): Promise<LeadNote>;
  getNotesByLeadId(leadId: number): Promise<LeadNote[]>;

  getUserCount(): Promise<number>;

  getSetting(key: string): Promise<string | undefined>;
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

  async assignLeads(callerId: number, count: number, filters?: { state?: string; category?: string }): Promise<number> {
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

  async getNewLeads(userId: number): Promise<Lead[]> {
    return db.select().from(leads)
      .where(and(
        eq(leads.assignedToUserId, userId),
        eq(leads.statusCall, "NOT_CALLED"),
        eq(leads.unreachable, false),
        sql`${leads.statusSignup} != 'SIGNED_UP'`
      ))
      .orderBy(asc(leads.createdAt));
  }

  async getRetryLeads(userId: number): Promise<Lead[]> {
    const now = new Date();
    return db.select().from(leads)
      .where(and(
        eq(leads.assignedToUserId, userId),
        eq(leads.unreachable, false),
        sql`${leads.statusCall} != 'NOT_CALLED'`,
        sql`${leads.statusSignup} != 'SIGNED_UP'`,
        lte(leads.retryNextEligibleAt, now)
      ))
      .orderBy(asc(leads.retryNextEligibleAt));
  }

  async getCompletedLeads(userId: number): Promise<Lead[]> {
    return db.select().from(leads)
      .where(and(
        eq(leads.assignedToUserId, userId),
        sql`(${leads.statusSignup} = 'SIGNED_UP' OR ${leads.unreachable} = true OR ${leads.statusCall} IN ('SPOKE_NOT_INTERESTED', 'SPOKE_INTERESTED', 'SPOKE_SEND_INFO', 'SPOKE_FOLLOW_UP'))`
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

  async getSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return row?.value;
  }
}

export const storage = new DatabaseStorage();
