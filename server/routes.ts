import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, requireAuth, requireAdmin } from "./auth";
import { insertUserSchema, loginSchema, callOutcomeEnum, retryOutcomes, callLogs, leads } from "@shared/schema";
import type { InsertLead, CallOutcome } from "@shared/schema";
import { eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const FIELD_TO_COLUMN: Record<string, keyof InsertLead> = {
  company_name: "companyName",
  phone: "phone",
  scraped_email: "scrapedEmail",
  website: "website",
  full_address: "fullAddress",
  city: "city",
  state: "state",
  zip: "zip",
  place_id: "placeId",
  cid: "cid",
  gmb_url: "gmbUrl",
  rating: "rating",
  reviews_count: "reviewsCount",
  hours_raw: "hoursRaw",
  category_keyword: "categoryKeyword",
  timezone: "timezone",
  domain: "domain",
};

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return result;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  await seedAdmin();

  app.post("/api/auth/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        const { passwordHash, ...safe } = user;
        return res.json(safe);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { passwordHash, ...safe } = req.user!;
    res.json(safe);
  });

  app.get("/api/users", requireAdmin, async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users.map(({ passwordHash, ...u }) => u));
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors.map(e => e.message).join(", ") });
    }
    try {
      const existing = await storage.getUserByEmail(parsed.data.email);
      if (existing) return res.status(409).json({ message: "Email already in use" });

      const user = await storage.createUser({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        role: parsed.data.role || "vendor_caller",
      });
      const { passwordHash, ...safe } = user;
      res.status(201).json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/leads", requireAuth, async (req, res) => {
    const leads = await storage.getAllLeads("vendor");
    res.json(leads);
  });

  app.get("/api/leads/my", requireAuth, async (req, res) => {
    const leads = await storage.getLeadsByUserId(req.user!.id);
    res.json(leads);
  });

  app.get("/api/leads/today", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const [newLeads, retryLeads, completedLeads, callsToday, allAssigned] = await Promise.all([
      storage.getNewLeads(userId),
      storage.getRetryLeads(userId),
      storage.getCompletedLeads(userId),
      storage.getCallLogsTodayByUserId(userId),
      storage.getLeadsByUserId(userId),
    ]);

    res.json({
      newLeads,
      retryLeads,
      completedLeads,
      counters: {
        totalAssigned: allAssigned.length,
        retryEligible: retryLeads.length,
        attemptsMadeToday: callsToday,
      },
      dailyCallTarget: req.user!.dailyCallTarget || null,
    });
  });

  app.get("/api/leads/:id", requireAuth, async (req, res) => {
    const lead = await storage.getLeadById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
  });

  app.patch("/api/leads/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const lead = await storage.getLeadById(id);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to edit this lead" });
    }

    const { phone, confirmedEmail, bestTimeToCall } = req.body;
    const updated = await storage.updateLead(id, {
      ...(phone !== undefined && { phone }),
      ...(confirmedEmail !== undefined && { confirmedEmail }),
      ...(bestTimeToCall !== undefined && { bestTimeToCall }),
    });
    res.json(updated);
  });

  app.post("/api/leads/preview", requireAdmin, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    try {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const columns = data.length > 0 ? Object.keys(data[0]) : [];
      const rows = data.slice(0, 20);
      res.json({ columns, rows });
    } catch (err: any) {
      res.status(400).json({ message: "Failed to parse file: " + err.message });
    }
  });

  app.post("/api/leads/import", requireAdmin, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    let mappingRaw: Record<string, string>;
    try {
      mappingRaw = JSON.parse(req.body.mapping);
    } catch {
      return res.status(400).json({ message: "Invalid mapping" });
    }

    const pipelineType = req.body.pipelineType || "vendor";

    const mapping: Record<string, string> = {};
    for (const [spreadsheetCol, standardField] of Object.entries(mappingRaw)) {
      if (standardField && FIELD_TO_COLUMN[standardField]) {
        mapping[spreadsheetCol] = FIELD_TO_COLUMN[standardField] as string;
      }
    }

    try {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      let imported = 0;
      let duplicatesSkipped = 0;
      let invalidSkipped = 0;

      for (const row of data) {
        const leadData: any = { pipelineType, sourceFile: req.file.originalname };

        for (const [spreadsheetCol, dbField] of Object.entries(mapping)) {
          const val = row[spreadsheetCol];
          if (val !== undefined && val !== "") {
            if (dbField === "reviewsCount") {
              leadData[dbField] = parseInt(String(val)) || 0;
            } else if (dbField === "rating") {
              leadData[dbField] = String(val);
            } else {
              leadData[dbField] = String(val);
            }
          }
        }

        if (!leadData.companyName) {
          invalidSkipped++;
          continue;
        }

        if (leadData.placeId) {
          const existing = await storage.getLeadByPlaceIdAndPipeline(leadData.placeId, pipelineType);
          if (existing) {
            duplicatesSkipped++;
            continue;
          }
        }

        await storage.createLead(leadData);
        imported++;
      }

      res.json({ imported, duplicatesSkipped, invalidSkipped, total: data.length });
    } catch (err: any) {
      res.status(500).json({ message: "Import failed: " + err.message });
    }
  });

  app.post("/api/leads/assign", requireAdmin, async (req, res) => {
    const { callerId, count, stateFilter, categoryFilter } = req.body;
    if (!callerId || !count) return res.status(400).json({ message: "callerId and count are required" });

    const assigned = await storage.assignLeads(callerId, count, {
      state: stateFilter,
      category: categoryFilter,
    });

    res.json({ assigned });
  });

  app.get("/api/leads/:id/calls", requireAuth, async (req, res) => {
    const logs = await storage.getCallLogsByLeadId(parseInt(req.params.id));
    res.json(logs);
  });

  app.post("/api/leads/:id/calls", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to log calls for this lead" });
    }

    const { outcome, notes, durationSeconds } = req.body;
    if (!outcome) return res.status(400).json({ message: "Outcome is required" });
    if (!(callOutcomeEnum as readonly string[]).includes(outcome)) {
      return res.status(400).json({ message: "Invalid outcome" });
    }

    const typedOutcome = outcome as CallOutcome;

    const newAttemptCount = (lead.attemptCount || 0) + 1;

    const maxRetryStr = await storage.getSetting("max_retry_attempts");
    const retryDelayStr = await storage.getSetting("retry_delay_business_days");
    const maxRetry = parseInt(maxRetryStr || "3");
    const retryDelay = parseInt(retryDelayStr || "2");

    const leadUpdate: any = {
      statusCall: typedOutcome,
      attemptCount: newAttemptCount,
    };

    if (typedOutcome === "SPOKE_NOT_INTERESTED") {
      leadUpdate.unreachable = true;
      leadUpdate.retryNextEligibleAt = null;
    } else if ((retryOutcomes as readonly string[]).includes(typedOutcome)) {
      if (newAttemptCount >= maxRetry) {
        leadUpdate.unreachable = true;
        leadUpdate.retryNextEligibleAt = null;
      } else {
        leadUpdate.retryNextEligibleAt = addBusinessDays(new Date(), retryDelay);
      }
    } else {
      leadUpdate.retryNextEligibleAt = null;
    }

    const log = await db.transaction(async (tx) => {
      const [callLog] = await tx.insert(callLogs).values({
        leadId,
        userId: req.user!.id,
        calledAt: new Date(),
        outcome: typedOutcome,
        notes: notes || null,
        durationSeconds: durationSeconds || null,
        withinBadTimingWindow: false,
      }).returning();

      await tx.update(leads).set(leadUpdate).where(eq(leads.id, leadId));

      return callLog;
    });

    res.status(201).json(log);
  });

  app.get("/api/leads/:id/notes", requireAuth, async (req, res) => {
    const notes = await storage.getNotesByLeadId(parseInt(req.params.id));
    res.json(notes);
  });

  app.post("/api/leads/:id/notes", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to add notes to this lead" });
    }

    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ message: "Note is required" });

    const created = await storage.createLeadNote({
      leadId,
      userId: req.user!.id,
      note: note.trim(),
    });
    res.status(201).json(created);
  });

  app.get("/api/settings", requireAuth, async (_req, res) => {
    const [maxRetry, retryDelay] = await Promise.all([
      storage.getSetting("max_retry_attempts"),
      storage.getSetting("retry_delay_business_days"),
    ]);
    res.json({
      maxRetryAttempts: parseInt(maxRetry || "3"),
      retryDelayBusinessDays: parseInt(retryDelay || "2"),
    });
  });

  return httpServer;
}

async function seedAdmin() {
  try {
    const count = await storage.getUserCount();
    if (count === 0) {
      await storage.createUser({
        name: "Admin",
        email: "admin@supplystreamline.com",
        password: "admin123",
        role: "admin",
      });
      console.log("Seeded admin user: admin@supplystreamline.com / admin123");
    }
  } catch (err) {
    console.log("Seed check skipped (tables may not exist yet)");
  }
}
