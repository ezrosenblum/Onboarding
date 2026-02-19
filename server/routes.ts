import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, requireAuth, requireAdmin } from "./auth";
import { insertUserSchema, loginSchema, callOutcomeEnum, retryOutcomes, emailTemplateTypeEnum, callLogs, leads, inboundEmails } from "@shared/schema";
import type { InsertLead, CallOutcome, EmailTemplateType } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { buildEmailContent, sendEmail, getDefaultTemplates, extractLeadTokenFromReplyTo, buildReplyToAddress } from "./email-service";
import { generateStructuredResearch, getDefaultAiPrompt, getDefaultAiPromptForPipeline, isAiConfigured, buildFinalPrompt } from "./services/aiProvider";
import {
  isTwilioConfigured,
  generateAccessToken,
  getTwilioFromPhoneNumber,
  initiateCallBrowser,
  initiateBridgedCall,
  getRecordingAudioUrl,
  transcribeRecording,
  getTwilioClient,
} from "./services/twilioService";
import twilio from "twilio";

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

function calculateLeadScore(lead: any, weights: Record<string, number>): number {
  let score = 0;

  if (lead.confirmedEmail?.trim() || lead.scrapedEmail?.trim()) {
    score += weights.score_weight_email || 20;
  }

  if (lead.website?.trim()) {
    score += weights.score_weight_website || 15;
  }

  const maxRatingWeight = weights.score_weight_rating || 20;
  if (lead.rating != null && lead.rating !== "") {
    const rating = parseFloat(lead.rating);
    if (!isNaN(rating)) {
      score += Math.round((rating / 5) * maxRatingWeight);
    } else {
      score += Math.round(maxRatingWeight / 2);
    }
  } else {
    score += Math.round(maxRatingWeight / 2);
  }

  const maxReviewWeight = weights.score_weight_reviews || 15;
  const reviews = lead.reviewsCount || 0;
  if (reviews === 0) {
    score += 0;
  } else if (reviews <= 10) {
    score += Math.round(maxReviewWeight / 3);
  } else if (reviews <= 50) {
    score += Math.round((maxReviewWeight * 2) / 3);
  } else {
    score += maxReviewWeight;
  }

  if (lead.phone?.trim()) {
    score += weights.score_weight_phone || 10;
  }

  if (lead.statusEmail === "CLICKED") {
    score += weights.score_weight_clicked || 20;
  }

  return Math.min(100, Math.max(0, score));
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

  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { name, email, role, password } = req.body;
    const update: any = {};
    if (name) update.name = name;
    if (email) update.email = email;
    if (role) update.role = role;
    if (password) {
      const bcrypt = await import("bcryptjs");
      update.passwordHash = await bcrypt.hash(password, 10);
    }
    const user = await storage.updateUser(userId, update);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { passwordHash, ...safe } = user;
    res.json(safe);
  });

  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.id);
    if (userId === req.user!.id) {
      return res.status(400).json({ message: "Cannot delete yourself" });
    }
    await storage.deleteUser(userId);
    res.json({ ok: true });
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
    const includeUnreachable = req.query.includeUnreachable === "true";

    const [newLeads, retryLeads, activeLeads, completedLeads, callsToday, allAssigned, retryEligibleCount, emailsToday, weeklyStats] = await Promise.all([
      storage.getNewLeads(userId, includeUnreachable),
      storage.getRetryLeads(userId, includeUnreachable),
      storage.getActiveLeads(userId, includeUnreachable),
      storage.getCompletedLeads(userId),
      storage.getCallLogsTodayByUserId(userId),
      storage.getLeadsByUserId(userId),
      storage.getRetryEligibleCount(userId),
      storage.getEmailsSentTodayByUserId(userId),
      storage.getCallerWeeklyStats(userId),
    ]);

    res.json({
      newLeads,
      retryLeads,
      activeLeads,
      completedLeads,
      counters: {
        totalAssigned: allAssigned.length,
        retryEligible: retryEligibleCount,
        attemptsMadeToday: callsToday,
        emailsSentToday: emailsToday,
      },
      weeklyStats,
      dailyCallTarget: req.user!.dailyCallTarget || null,
    });
  });

  app.get("/api/leads/assigned-today", requireAdmin, async (req, res) => {
    const result = await storage.getLeadsAssignedToday();
    res.json(result);
  });

  app.get("/api/leads/filtered", requireAdmin, async (req, res) => {
    const filters: any = {};
    if (req.query.state) filters.state = req.query.state as string;
    if (req.query.category) filters.category = req.query.category as string;
    if (req.query.minRating) filters.minRating = parseFloat(req.query.minRating as string);
    if (req.query.hasPhone === "true") filters.hasPhone = true;
    if (req.query.hasEmail === "true") filters.hasEmail = true;
    if (req.query.unassigned === "true") filters.unassigned = true;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const leads = await storage.getFilteredLeads(filters, limit);
    res.json(leads);
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

    const { phone, confirmedEmail, bestTimeToCall, businessName, contactName, scrapedEmail, state, categoryKeyword, website, rating, statusCall, statusSignup, assignedToUserId } = req.body;
    const updateData: any = {};
    if (phone !== undefined) updateData.phone = phone;
    if (confirmedEmail !== undefined) updateData.confirmedEmail = confirmedEmail;
    if (bestTimeToCall !== undefined) updateData.bestTimeToCall = bestTimeToCall;
    if (isAdmin) {
      if (businessName !== undefined) updateData.businessName = businessName;
      if (contactName !== undefined) updateData.contactName = contactName;
      if (scrapedEmail !== undefined) updateData.scrapedEmail = scrapedEmail;
      if (state !== undefined) updateData.state = state;
      if (categoryKeyword !== undefined) updateData.categoryKeyword = categoryKeyword;
      if (website !== undefined) updateData.website = website;
      if (rating !== undefined) updateData.rating = rating;
      if (statusCall !== undefined) updateData.statusCall = statusCall;
      if (statusSignup !== undefined) updateData.statusSignup = statusSignup;
      if (assignedToUserId !== undefined) {
        updateData.assignedToUserId = assignedToUserId;
        if (assignedToUserId === null) {
          updateData.assignedAt = null;
        } else {
          updateData.assignedAt = new Date();
        }
      }
    }
    const updated = await storage.updateLead(id, updateData);
    res.json(updated);
  });

  app.delete("/api/leads/:id", requireAdmin, async (req, res) => {
    await storage.deleteLead(parseInt(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/leads/bulk-delete", requireAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Must provide an array of lead ids" });
    }
    const count = await storage.bulkDeleteLeads(ids);
    res.json({ deleted: count });
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
    const { callerId, count, stateFilter, categoryFilter, minRating, hasPhone, hasEmail } = req.body;
    if (!callerId || !count) return res.status(400).json({ message: "callerId and count are required" });

    const assigned = await storage.assignLeads(callerId, count, {
      state: stateFilter,
      category: categoryFilter,
      minRating: minRating != null ? parseFloat(minRating) : undefined,
      hasPhone: hasPhone || undefined,
      hasEmail: hasEmail || undefined,
    });

    res.json({ assigned });
  });

  app.post("/api/leads/self-pull", requireAuth, async (req, res) => {
    const count = Math.min(Math.max(parseInt(req.body.count) || 5, 1), 50);
    const stateFilter = req.body.stateFilter || undefined;
    const categoryFilter = req.body.categoryFilter || undefined;

    const assigned = await storage.assignLeads(req.user!.id, count, {
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

    const { outcome, notes, durationSeconds, withinBadTimingWindow } = req.body;
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
        withinBadTimingWindow: withinBadTimingWindow === true,
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

  app.get("/api/leads/:id/emails", requireAuth, async (req, res) => {
    const emails = await storage.getEmailLogsByLeadId(parseInt(req.params.id));
    res.json(emails);
  });

  app.get("/api/leads/:id/email-eligibility", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const callLogs = await storage.getCallLogsByLeadId(leadId);
    const hasCallLog = callLogs.length > 0;
    const hasConfirmedEmail = !!lead.confirmedEmail?.trim();
    const hasContactName = !!lead.contactName?.trim();
    const hasAnyEmail = hasConfirmedEmail || !!lead.scrapedEmail?.trim();
    const hasSendInfoEmail = await storage.hasEmailLogForLead(leadId, "SEND_INFO");
    const maxRetryStr = await storage.getSetting("max_retry_attempts");
    const maxRetry = parseInt(maxRetryStr || "3");
    const maxedRetries = lead.attemptCount >= maxRetry;
    const isSuppressed = !!lead.emailSuppressed;

    const suppressionReasons = isSuppressed ? [`Email suppressed: ${lead.emailInvalidReason || "Unknown reason"}`] : [];

    res.json({
      sendInfo: {
        eligible: hasCallLog && hasConfirmedEmail && hasContactName && !lead.unreachable && !isSuppressed,
        reasons: [
          ...suppressionReasons,
          ...(!hasCallLog ? ["Log a call first"] : []),
          ...(!hasConfirmedEmail ? ["Add confirmed email first"] : []),
          ...(!hasContactName ? ["Add contact name first"] : []),
          ...(lead.unreachable ? ["Lead is unreachable"] : []),
        ],
      },
      followUp: {
        eligible: hasCallLog && hasConfirmedEmail && hasSendInfoEmail && !lead.unreachable && !isSuppressed,
        reasons: [
          ...suppressionReasons,
          ...(!hasCallLog ? ["Log a call first"] : []),
          ...(!hasConfirmedEmail ? ["Add confirmed email first"] : []),
          ...(!hasSendInfoEmail ? ["Send initial info email first"] : []),
          ...(lead.unreachable ? ["Lead is unreachable"] : []),
        ],
      },
      unreachableOutreach: {
        eligible: (lead.unreachable || maxedRetries) && hasAnyEmail && !isSuppressed,
        reasons: [
          ...suppressionReasons,
          ...(!lead.unreachable && !maxedRetries ? ["Lead is not unreachable or max retries not reached"] : []),
          ...(!hasAnyEmail ? ["No email address available"] : []),
        ],
      },
    });
  });

  app.post("/api/leads/:id/email/send", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { templateType } = req.body;
    if (!templateType || !(emailTemplateTypeEnum as readonly string[]).includes(templateType)) {
      return res.status(400).json({ message: "Invalid template type" });
    }

    const typedTemplate = templateType as EmailTemplateType;

    const callLogsList = await storage.getCallLogsByLeadId(leadId);
    const hasCallLog = callLogsList.length > 0;
    const hasConfirmedEmail = !!lead.confirmedEmail?.trim();
    const hasAnyEmail = hasConfirmedEmail || !!lead.scrapedEmail?.trim();
    const maxRetryStr = await storage.getSetting("max_retry_attempts");
    const maxRetry = parseInt(maxRetryStr || "3");

    if (lead.emailSuppressed) {
      return res.status(400).json({ message: "Email sending is suppressed for this lead" });
    }

    if (typedTemplate === "SEND_INFO") {
      if (!hasCallLog) return res.status(400).json({ message: "Log a call before sending info email" });
      if (!hasConfirmedEmail) return res.status(400).json({ message: "Confirmed email required" });
      if (!lead.contactName?.trim()) return res.status(400).json({ message: "Contact name is required before sending email" });
      if (lead.unreachable) return res.status(400).json({ message: "Lead is unreachable" });
    } else if (typedTemplate === "FOLLOW_UP") {
      if (!hasCallLog) return res.status(400).json({ message: "Log a call before sending follow-up" });
      if (!hasConfirmedEmail) return res.status(400).json({ message: "Confirmed email required" });
      const hasSendInfo = await storage.hasEmailLogForLead(leadId, "SEND_INFO");
      if (!hasSendInfo) return res.status(400).json({ message: "Send initial info email first" });
      if (lead.unreachable) return res.status(400).json({ message: "Lead is unreachable" });
    } else if (typedTemplate === "UNREACHABLE_OUTREACH") {
      const maxedRetries = lead.attemptCount >= maxRetry;
      if (!lead.unreachable && !maxedRetries) return res.status(400).json({ message: "Lead must be unreachable or max retries reached" });
      if (!hasAnyEmail) return res.status(400).json({ message: "No email address available" });
    }

    const toEmail = typedTemplate === "UNREACHABLE_OUTREACH"
      ? (lead.confirmedEmail?.trim() || lead.scrapedEmail?.trim()!)
      : lead.confirmedEmail!.trim();

    const { subject, bodyHtml } = await buildEmailContent(typedTemplate, lead, req.user!.name);

    const sendResult = await sendEmail(toEmail, subject, bodyHtml, lead.leadToken, lead.id);

    const emailLog = await storage.createEmailLog({
      leadId: lead.id,
      userId: req.user!.id,
      templateType: typedTemplate,
      toEmail,
      fromEmail: "connect@supplystreamline.com",
      subject,
      bodyHtml,
      sendgridMessageId: sendResult.messageId || null,
      status: sendResult.success ? (sendResult.mock ? "MOCK_SENT" : "SENT") : "FAILED",
    });

    if (sendResult.success) {
      const emailStatusUpdate: any = {
        emailSentCount: (lead.emailSentCount || 0) + 1,
        emailLastSentAt: new Date(),
      };
      if (lead.statusEmail === "NOT_SENT") {
        emailStatusUpdate.statusEmail = "SENT";
      }
      await storage.updateLead(lead.id, emailStatusUpdate);
    }

    if (!sendResult.success) {
      return res.status(500).json({ message: sendResult.error || "Failed to send email", emailLog });
    }

    res.status(201).json(emailLog);
  });

  app.post("/api/sendgrid/events", async (req, res) => {
    const events = req.body;
    if (!Array.isArray(events)) {
      return res.status(400).json({ message: "Expected array of events" });
    }

    for (const event of events) {
      try {
        const leadToken = event.lead_token || event.custom_args?.lead_token;
        const sgMessageId = event.sg_message_id;
        const eventType = event.event;

        let lead: any = null;

        if (leadToken) {
          lead = await storage.getLeadByToken(leadToken);
        }
        if (!lead && sgMessageId) {
          const emailLog = await storage.getEmailLogByMessageId(sgMessageId);
          if (emailLog) {
            lead = await storage.getLeadById(emailLog.leadId);
          }
        }

        if (!lead) continue;

        await storage.createEmailEvent({
          leadId: lead.id,
          eventType: eventType || "unknown",
          sgMessageId: sgMessageId || null,
          timestamp: event.timestamp ? new Date(event.timestamp * 1000) : new Date(),
          url: event.url || null,
          raw: event,
        });

        if (eventType === "open" && lead.statusEmail !== "CLICKED") {
          await storage.updateLead(lead.id, { statusEmail: "OPENED" });
        } else if (eventType === "click") {
          await storage.updateLead(lead.id, { statusEmail: "CLICKED" });
        } else if (eventType === "bounce" || eventType === "dropped") {
          await storage.updateLead(lead.id, { 
            statusEmail: "BOUNCED", 
            emailSuppressed: true, 
            emailInvalidReason: eventType === "bounce" ? "Email bounced" : "Email dropped" 
          });
        } else if (eventType === "spamreport") {
          await storage.updateLead(lead.id, { 
            emailSuppressed: true, 
            emailInvalidReason: "Spam report received" 
          });
        }
      } catch (err) {
        console.error("[WEBHOOK] Error processing event:", err);
      }
    }

    res.status(200).json({ ok: true });
  });

  app.get("/api/templates", requireAdmin, async (req, res) => {
    const pipeline = (req.query.pipeline as string) || "vendor";
    const templates = await storage.getEmailTemplates(pipeline);
    const defaults = getDefaultTemplates();
    const result = (["SEND_INFO", "FOLLOW_UP", "UNREACHABLE_OUTREACH"] as const).map((type) => {
      const saved = templates.find((t) => t.templateType === type);
      if (saved) {
        return { ...saved, isDefault: false };
      }
      return {
        id: null,
        pipelineType: pipeline,
        templateType: type,
        name: "",
        subject: defaults[type].subject,
        bodyHtml: defaults[type].bodyHtml,
        sequence: 0,
        updatedAt: null,
        isDefault: true,
      };
    });
    res.json(result);
  });

  app.post("/api/templates", requireAdmin, async (req, res) => {
    const { pipelineType, templateType, subject, bodyHtml, name, sequence } = req.body;
    if (!pipelineType || !templateType || !subject || !bodyHtml) {
      return res.status(400).json({ message: "pipelineType, templateType, subject, bodyHtml are required" });
    }
    if (!(emailTemplateTypeEnum as readonly string[]).includes(templateType)) {
      return res.status(400).json({ message: "Invalid template type" });
    }
    const templateData: any = {
      pipelineType,
      templateType,
      subject,
      bodyHtml,
    };
    if (name !== undefined) templateData.name = name;
    if (sequence !== undefined) templateData.sequence = parseInt(sequence) || 0;
    const template = await storage.upsertEmailTemplate(templateData);
    res.json(template);
  });

  app.post("/api/templates/restore-default", requireAdmin, async (req, res) => {
    const { pipelineType, templateType } = req.body;
    if (!pipelineType || !templateType) {
      return res.status(400).json({ message: "pipelineType and templateType are required" });
    }
    const defaults = getDefaultTemplates();
    if (!(templateType in defaults)) {
      return res.status(400).json({ message: "Invalid template type" });
    }
    const defaultContent = defaults[templateType as EmailTemplateType];
    const template = await storage.upsertEmailTemplate({
      pipelineType,
      templateType,
      subject: defaultContent.subject,
      bodyHtml: defaultContent.bodyHtml,
    });
    res.json(template);
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

  app.get("/api/leads/:id/ai-research", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const current = await storage.getCurrentAiResearch(leadId);
    const prompt = await storage.getAiPrompt(lead.pipelineType);
    const currentVersion = prompt?.version ?? 0;
    const isStale = current ? current.promptVersion < currentVersion : false;

    res.json({
      exists: !!current,
      current: current || null,
      isStale,
      currentPromptVersion: currentVersion,
      aiConfigured: isAiConfigured(),
    });
  });

  app.post("/api/leads/:id/ai-research", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const force = req.body.force === true;

    const existing = await storage.getCurrentAiResearch(leadId);
    if (existing && !force) {
      const prompt = await storage.getAiPrompt(lead.pipelineType);
      const currentVersion = prompt?.version ?? 0;
      return res.json({
        exists: true,
        current: existing,
        isStale: existing.promptVersion < currentVersion,
        currentPromptVersion: currentVersion,
        aiConfigured: isAiConfigured(),
        mock: false,
      });
    }

    const prompt = await storage.getAiPrompt(lead.pipelineType);
    const promptTemplate = prompt?.promptTemplate ?? getDefaultAiPrompt();
    const promptVersion = prompt?.version ?? 0;

    try {
      const result = await generateStructuredResearch(promptTemplate, lead);

      const record = await storage.createAiResearchVersioned({
        leadId,
        pipelineType: lead.pipelineType,
        promptVersion,
        promptUsed: result.promptUsed,
        modelUsed: result.modelUsed,
        outputJson: result.outputJson,
        openerScript: result.openerScript,
        createdByUserId: req.user!.id,
      });

      res.json({
        exists: true,
        current: record,
        isStale: false,
        currentPromptVersion: promptVersion,
        aiConfigured: isAiConfigured(),
        mock: result.mock,
      });
    } catch (err: any) {
      console.error("[AI] Error generating research:", err);
      res.status(500).json({ message: "AI generation failed: " + (err.message || "Unknown error") });
    }
  });

  app.get("/api/admin/ai-prompts", requireAdmin, async (_req, res) => {
    const prompts = await storage.getAllAiPrompts();
    const pipelineTypes = ["vendor", "buyer"] as const;
    const result = pipelineTypes.map((pipeline) => {
      const saved = prompts.find((p) => p.pipelineType === pipeline);
      if (saved) return { ...saved, isDefault: false };
      return {
        id: null,
        pipelineType: pipeline,
        promptTemplate: getDefaultAiPromptForPipeline(pipeline),
        version: 0,
        updatedByUserId: null,
        updatedAt: null,
        createdAt: null,
        isDefault: true,
      };
    });
    res.json(result);
  });

  app.put("/api/admin/ai-prompts", requireAdmin, async (req, res) => {
    const { pipelineType, promptTemplate } = req.body;
    if (!pipelineType || !promptTemplate?.trim()) {
      return res.status(400).json({ message: "pipelineType and promptTemplate are required" });
    }
    if (!["vendor", "buyer"].includes(pipelineType)) {
      return res.status(400).json({ message: "Invalid pipeline type" });
    }
    const prompt = await storage.upsertAiPrompt(pipelineType, promptTemplate.trim(), req.user!.id);
    res.json(prompt);
  });

  app.post("/api/admin/ai-prompts/restore-default", requireAdmin, async (req, res) => {
    const { pipelineType } = req.body;
    if (!pipelineType) {
      return res.status(400).json({ message: "pipelineType is required" });
    }
    if (!["vendor", "buyer"].includes(pipelineType)) {
      return res.status(400).json({ message: "Invalid pipeline type" });
    }
    const defaultPrompt = getDefaultAiPromptForPipeline(pipelineType);
    const prompt = await storage.upsertAiPrompt(pipelineType, defaultPrompt, req.user!.id);
    res.json(prompt);
  });

  // ──────────── Stage 6: Signup Webhook + Admin Endpoints ────────────

  app.post("/api/signup/webhook", async (req, res) => {
    const webhookSecret = process.env.SIGNUP_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("SIGNUP_WEBHOOK_SECRET not configured - webhook disabled");
      return res.status(503).json({ message: "Webhook not configured" });
    }
    const headerSecret = req.headers["x-webhook-secret"];
    if (headerSecret !== webhookSecret) {
      return res.status(401).json({ message: "Invalid webhook secret" });
    }

    const webhookSchema = z.object({
      lead_token: z.string().min(1),
      event: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      member_id: z.string().optional().nullable(),
      user_id: z.string().optional().nullable(),
      confirmed_at: z.string().optional().nullable(),
      idempotency_key: z.string().optional().nullable(),
    });
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid payload", errors: parsed.error.flatten().fieldErrors });
    }
    const { lead_token, email, member_id, user_id, confirmed_at, idempotency_key } = parsed.data;

    const lead = await storage.getLeadByToken(lead_token);
    if (!lead) {
      return res.status(404).json({ ok: false, message: "Lead not found for token" });
    }

    if (lead.statusSignup === "SIGNED_UP" && idempotency_key) {
      const existing = await storage.getSignupEventsByLeadId(lead.id);
      const dup = existing.find(e => e.idempotencyKey === idempotency_key);
      if (dup) {
        return res.json({ ok: true, already_signed_up: true, leadId: lead.id });
      }
    }

    const signedUpAt = confirmed_at ? new Date(confirmed_at) : new Date();
    const effectiveUserId = member_id || user_id || null;

    try {
      await storage.processWebhookSignup(
        {
          leadId: lead.id,
          leadToken: lead_token,
          eventType: "webhook_signup",
          payloadRaw: req.body,
          sourceIp: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
          idempotencyKey: idempotency_key || null,
        },
        {
          statusSignup: "SIGNED_UP",
          signedUpAt,
          signedUpEmail: email || null,
          signedUpUserId: effectiveUserId,
          signupSource: "webhook",
        }
      );
    } catch (err: any) {
      if (err.code === "23505" && err.constraint?.includes("idempotency")) {
        return res.json({ ok: true, already_signed_up: true, leadId: lead.id });
      }
      throw err;
    }

    res.json({ ok: true, already_signed_up: false, leadId: lead.id });
  });

  app.post("/api/admin/leads/:id/mark-signed-up", requireAuth, requireAdmin, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    const signedUpAt = req.body.signedUpAt ? new Date(req.body.signedUpAt) : new Date();
    const signedUpEmail = req.body.email || lead.confirmedEmail || lead.scrapedEmail || null;

    await storage.createSignupEvent({
      leadId: lead.id,
      leadToken: lead.leadToken,
      eventType: "admin_manual",
      payloadRaw: { markedBy: req.user!.id, email: signedUpEmail, signedUpAt: signedUpAt.toISOString(), note: req.body.note || null },
      sourceIp: null,
      userAgent: null,
      idempotencyKey: null,
    });

    await storage.updateLead(lead.id, {
      statusSignup: "SIGNED_UP",
      signedUpAt,
      signedUpEmail,
      signedUpUserId: null,
      signupSource: "admin_manual",
    });

    res.json({ message: "Lead marked as signed up", leadId: lead.id });
  });

  app.get("/api/admin/leads/:id/signup-events", requireAuth, requireAdmin, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const events = await storage.getSignupEventsByLeadId(leadId);
    res.json(events);
  });

  app.get("/api/admin/metrics/performance", requireAuth, requireAdmin, async (req, res) => {
    const range = (req.query.range as string) || "today";
    if (!["today", "week", "month"].includes(range)) {
      return res.status(400).json({ message: "Range must be today, week, or month" });
    }
    const metrics = await storage.getPerformanceMetrics(range as "today" | "week" | "month");
    res.json(metrics);
  });

  app.get("/api/admin/metrics/signups", requireAuth, requireAdmin, async (req, res) => {
    const range = (req.query.range as string) || "today";
    if (!["today", "week", "month"].includes(range)) {
      return res.status(400).json({ message: "Range must be today, week, or month" });
    }
    const metrics = await storage.getSignupMetrics(range as "today" | "week" | "month");
    res.json(metrics);
  });

  app.get("/api/twilio/status-check", requireAuth, async (req, res) => {
    const configured = await isTwilioConfigured();
    res.json({ configured });
  });

  app.get("/api/twilio/token", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const token = await generateAccessToken(`user_${user.id}`);
      const fromNumber = await getTwilioFromPhoneNumber();
      res.json({ token, fromNumber });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate token" });
    }
  });

  app.post("/api/leads/:id/call/start", requireAuth, async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const user = req.user as any;
      const { callMode, phoneOverride, agentPhone } = req.body;

      const lead = await storage.getLeadById(leadId);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      if (user.role !== "admin" && lead.assignedToUserId !== user.id) {
        return res.status(403).json({ message: "Not authorized for this lead" });
      }

      const toNumber = phoneOverride || lead.phone;
      if (!toNumber) return res.status(400).json({ message: "No phone number available" });

      const fromNumber = await getTwilioFromPhoneNumber();

      const callLog = await storage.createCallLog({
        leadId,
        userId: user.id,
        callMode: callMode || "BROWSER",
        callStatus: "initiated",
        fromNumber,
        toNumber,
        withinBadTimingWindow: false,
      } as any);

      if (callMode === "AGENT_PHONE") {
        const effectiveAgentPhone = agentPhone || user.agentPhone;
        if (!effectiveAgentPhone) {
          return res.status(400).json({ message: "Agent phone not configured" });
        }

        if (agentPhone && agentPhone !== user.agentPhone) {
          await storage.updateUser(user.id, { agentPhone });
        }

        const callSid = await initiateBridgedCall(callLog.id, effectiveAgentPhone, toNumber, fromNumber);
        await storage.updateCallLog(callLog.id, { twilioCallSid: callSid } as any);
        await storage.createCallEvent({ callLogId: callLog.id, twilioCallSid: callSid, eventType: "initiated" });
        res.json({ callLogId: callLog.id, callSid, mode: "AGENT_PHONE" });
      } else {
        const token = await generateAccessToken(`user_${user.id}`);
        res.json({ callLogId: callLog.id, token, fromNumber, toNumber, mode: "BROWSER" });
      }
    } catch (err: any) {
      console.error("Call start error:", err);
      res.status(500).json({ message: err.message || "Failed to start call" });
    }
  });

  app.post("/api/leads/:id/call/:callLogId/wrap-up", requireAuth, async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const callLogId = parseInt(req.params.callLogId);
      const user = req.user as any;
      const { outcome, notes, confirmedEmail, contactName, bestTimeToCall, withinBadTimingWindow } = req.body;

      if (!outcome || !callOutcomeEnum.includes(outcome)) {
        return res.status(400).json({ message: "Valid outcome required" });
      }

      const lead = await storage.getLeadById(leadId);
      if (!lead) return res.status(404).json({ message: "Lead not found" });

      await storage.updateCallLog(callLogId, {
        outcome,
        notes: notes || null,
        withinBadTimingWindow: withinBadTimingWindow || false,
      } as any);

      const leadUpdate: any = {
        statusCall: outcome,
        attemptCount: lead.attemptCount + 1,
      };

      if (confirmedEmail) leadUpdate.confirmedEmail = confirmedEmail;
      if (contactName) leadUpdate.contactName = contactName;
      if (bestTimeToCall) leadUpdate.bestTimeToCall = bestTimeToCall;

      if (retryOutcomes.includes(outcome as CallOutcome)) {
        const maxRetries = parseInt((await storage.getSetting("max_retry_attempts")) || "3");
        const retryDelay = parseInt((await storage.getSetting("retry_delay_business_days")) || "2");

        if (lead.attemptCount + 1 >= maxRetries) {
          leadUpdate.unreachable = true;
          leadUpdate.retryNextEligibleAt = null;
        } else {
          leadUpdate.retryNextEligibleAt = addBusinessDays(new Date(), retryDelay);
        }
      } else if (outcome === "SPOKE_NOT_INTERESTED") {
        leadUpdate.unreachable = true;
      } else {
        leadUpdate.retryNextEligibleAt = null;
      }

      await storage.updateLead(leadId, leadUpdate);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Wrap-up failed" });
    }
  });

  app.post("/api/call/:callLogId/update-sid", requireAuth, async (req, res) => {
    try {
      const callLogId = parseInt(req.params.callLogId);
      const { twilioCallSid } = req.body;
      if (!twilioCallSid) return res.status(400).json({ message: "Call SID required" });
      await storage.updateCallLog(callLogId, { twilioCallSid } as any);
      await storage.createCallEvent({ callLogId, twilioCallSid, eventType: "sid_registered" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update SID" });
    }
  });

  app.post("/api/call/:callLogId/end", requireAuth, async (req, res) => {
    try {
      const callLogId = parseInt(req.params.callLogId);
      const { durationSeconds } = req.body;
      await storage.updateCallLog(callLogId, {
        callStatus: "completed",
        endedAt: new Date(),
        durationSeconds: durationSeconds || null,
      } as any);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to end call" });
    }
  });

  app.post("/api/twilio/voice", (req, res) => {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();
    const to = req.body.To;
    const callLogId = req.body.callLogId;

    if (to) {
      const dial = twiml.dial({
        callerId: req.body.From || req.body.Caller,
        record: "record-from-answer-dual" as any,
        recordingStatusCallback: "/api/twilio/recording",
        recordingStatusCallbackEvent: "completed",
      });
      dial.number(to);
    } else {
      twiml.say("No destination number provided.");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/api/twilio/bridge", (req, res) => {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();
    const to = req.query.to as string;

    if (to) {
      const dial = twiml.dial({
        record: "record-from-answer-dual" as any,
        recordingStatusCallback: "/api/twilio/recording",
        recordingStatusCallbackEvent: "completed",
      });
      dial.number(to);
    } else {
      twiml.say("No destination number provided.");
    }

    res.type("text/xml");
    res.send(twiml.toString());
  });

  app.post("/api/twilio/status", async (req, res) => {
    try {
      const { CallSid, CallStatus, CallDuration, Timestamp } = req.body;

      if (!CallSid) return res.sendStatus(200);

      const callLog = await storage.getCallLogByTwilioSid(CallSid);
      if (!callLog) return res.sendStatus(200);

      const update: any = { callStatus: CallStatus };

      if (CallStatus === "in-progress" || CallStatus === "in_progress") {
        update.callStatus = "in_progress";
        update.startedAt = new Date();
      } else if (CallStatus === "completed") {
        update.endedAt = new Date();
        if (CallDuration) update.durationSeconds = parseInt(CallDuration);
      }

      await storage.updateCallLog(callLog.id, update);
      await storage.createCallEvent({
        callLogId: callLog.id,
        twilioCallSid: CallSid,
        eventType: CallStatus,
        raw: req.body,
      });

      res.sendStatus(200);
    } catch (err) {
      console.error("Twilio status webhook error:", err);
      res.sendStatus(200);
    }
  });

  app.post("/api/twilio/recording", async (req, res) => {
    try {
      const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, RecordingStatus } = req.body;

      if (!CallSid || RecordingStatus !== "completed") return res.sendStatus(200);

      const callLog = await storage.getCallLogByTwilioSid(CallSid);
      if (!callLog) return res.sendStatus(200);

      await storage.updateCallLog(callLog.id, {
        recordingSid: RecordingSid,
        recordingUrl: RecordingUrl,
        recordingDurationSeconds: RecordingDuration ? parseInt(RecordingDuration) : null,
        transcriptStatus: "PENDING",
      } as any);

      await storage.createCallEvent({
        callLogId: callLog.id,
        twilioCallSid: CallSid,
        eventType: "recording_completed",
        raw: req.body,
      });

      processTranscription(callLog.id, RecordingUrl).catch(err =>
        console.error(`Transcription failed for call ${callLog.id}:`, err)
      );

      res.sendStatus(200);
    } catch (err) {
      console.error("Twilio recording webhook error:", err);
      res.sendStatus(200);
    }
  });

  async function processTranscription(callLogId: number, recordingUrl: string) {
    try {
      await storage.updateCallLog(callLogId, { transcriptStatus: "PROCESSING" } as any);
      const text = await transcribeRecording(recordingUrl);
      await storage.updateCallLog(callLogId, {
        transcriptStatus: "READY",
        transcriptText: text,
        transcriptProvider: "openai-whisper",
      } as any);
    } catch (err: any) {
      await storage.updateCallLog(callLogId, {
        transcriptStatus: "FAILED",
        transcriptError: err.message || "Transcription failed",
      } as any);
    }
  }

  app.post("/api/admin/call/:callLogId/retry-transcription", requireAuth, requireAdmin, async (req, res) => {
    try {
      const callLogId = parseInt(req.params.callLogId);
      const callLog = await storage.getCallLogsByLeadId(0);
      const cl = (await db.select().from(callLogs).where(eq(callLogs.id, callLogId)))[0];
      if (!cl) return res.status(404).json({ message: "Call log not found" });
      if (!cl.recordingUrl) return res.status(400).json({ message: "No recording available" });

      processTranscription(callLogId, cl.recordingUrl).catch(err =>
        console.error(`Retry transcription failed for call ${callLogId}:`, err)
      );
      res.json({ success: true, message: "Transcription retry started" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to retry transcription" });
    }
  });

  app.get("/api/call/:callLogId/recording", requireAuth, async (req, res) => {
    try {
      const callLogId = parseInt(req.params.callLogId);
      const user = req.user as any;
      const [cl] = await db.select().from(callLogs).where(eq(callLogs.id, callLogId));

      if (!cl) return res.status(404).json({ message: "Call log not found" });

      if (user.role !== "admin") {
        const lead = await storage.getLeadById(cl.leadId);
        if (!lead || lead.assignedToUserId !== user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      if (!cl.recordingSid) return res.status(404).json({ message: "No recording" });

      const url = await getRecordingAudioUrl(cl.recordingSid);
      const audioRes = await fetch(url);
      if (!audioRes.ok) return res.status(502).json({ message: "Failed to fetch recording" });
      res.setHeader("Content-Type", audioRes.headers.get("content-type") || "audio/mpeg");
      res.setHeader("Content-Length", audioRes.headers.get("content-length") || "0");
      const arrayBuf = await audioRes.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get recording" });
    }
  });

  app.get("/api/call/:callLogId/transcript", requireAuth, async (req, res) => {
    try {
      const callLogId = parseInt(req.params.callLogId);
      const user = req.user as any;
      const [cl] = await db.select().from(callLogs).where(eq(callLogs.id, callLogId));

      if (!cl) return res.status(404).json({ message: "Call log not found" });

      if (user.role !== "admin") {
        const lead = await storage.getLeadById(cl.leadId);
        if (!lead || lead.assignedToUserId !== user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      res.json({
        status: cl.transcriptStatus,
        transcript: cl.transcriptText,
        error: cl.transcriptError,
        provider: cl.transcriptProvider,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to get transcript" });
    }
  });

  app.put("/api/user/agent-phone", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { agentPhone } = req.body;
      if (!agentPhone) return res.status(400).json({ message: "Phone number required" });
      await storage.updateUser(user.id, { agentPhone });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to update agent phone" });
    }
  });

  app.get("/api/user/agent-phone", requireAuth, async (req, res) => {
    const user = req.user as any;
    const u = await storage.getUserById(user.id);
    res.json({ agentPhone: u?.agentPhone || null });
  });

  app.get("/api/admin/settings/call-disclaimer", requireAuth, requireAdmin, async (req, res) => {
    const disclaimer = await storage.getSetting("call_recording_disclaimer");
    res.json({ disclaimer: disclaimer || "This call may be recorded for quality and training purposes." });
  });

  app.put("/api/admin/settings/call-disclaimer", requireAuth, requireAdmin, async (req, res) => {
    const { disclaimer } = req.body;
    if (!disclaimer) return res.status(400).json({ message: "Disclaimer text required" });
    await storage.setSetting("call_recording_disclaimer", disclaimer);
    res.json({ success: true });
  });

  // ──────────── Stage 7: Admin Ops Layer ────────────

  app.get("/api/admin/settings", requireAuth, requireAdmin, async (_req, res) => {
    const settings = await storage.getAllSettings();
    res.json(settings);
  });

  app.put("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ message: "key and value are required" });
    }
    await storage.setSetting(key, String(value));
    res.json({ success: true });
  });

  app.get("/api/admin/pipeline-health", requireAuth, requireAdmin, async (_req, res) => {
    const health = await storage.getPipelineHealth();
    res.json(health);
  });

  app.get("/api/admin/call-review", requireAuth, requireAdmin, async (req, res) => {
    const filters = {
      callerId: req.query.callerId ? parseInt(req.query.callerId as string) : undefined,
      outcome: (req.query.outcome as string) || undefined,
      dateFrom: (req.query.dateFrom as string) || undefined,
      dateTo: (req.query.dateTo as string) || undefined,
      hasRecording: req.query.hasRecording === "true" ? true : req.query.hasRecording === "false" ? false : undefined,
      qualityTag: (req.query.qualityTag as string) || undefined,
      limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
      offset: parseInt(req.query.offset as string) || 0,
    };
    const rows = await storage.getCallReviewQueue(filters);
    res.json(rows);
  });

  app.put("/api/admin/call/:callLogId/coach", requireAuth, requireAdmin, async (req, res) => {
    const callLogId = parseInt(req.params.callLogId);
    const user = req.user as any;
    const { coachNote, qualityTag } = req.body;

    if (qualityTag !== undefined && qualityTag !== null && !["great", "needs_improvement"].includes(qualityTag)) {
      return res.status(400).json({ message: "qualityTag must be 'great', 'needs_improvement', or null" });
    }

    const updated = await storage.updateCallLog(callLogId, {
      coachNote: coachNote || null,
      qualityTag: qualityTag || null,
      coachNoteByUserId: user.id,
      coachNoteAt: new Date(),
    } as any);

    if (!updated) {
      return res.status(404).json({ message: "Call log not found" });
    }

    res.json(updated);
  });

  function arrayToCsv(data: any[]): string {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const escapeCsvField = (field: any): string => {
      if (field === null || field === undefined) return "";
      const str = typeof field === "object" ? JSON.stringify(field) : String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    const lines = [headers.join(",")];
    for (const row of data) {
      lines.push(headers.map((h) => escapeCsvField(row[h])).join(","));
    }
    return lines.join("\n");
  }

  app.get("/api/admin/export/leads", requireAuth, requireAdmin, async (_req, res) => {
    const allLeads = await storage.getAllLeads();
    const csv = arrayToCsv(allLeads);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="leads-export.csv"');
    res.send(csv);
  });

  app.get("/api/admin/export/call-logs", requireAuth, requireAdmin, async (_req, res) => {
    const allCallLogs = await storage.getAllCallLogs();
    const csv = arrayToCsv(allCallLogs);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="call-logs-export.csv"');
    res.send(csv);
  });

  app.get("/api/admin/export/email-logs", requireAuth, requireAdmin, async (_req, res) => {
    const allEmailLogs = await storage.getAllEmailLogs();
    const csv = arrayToCsv(allEmailLogs);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="email-logs-export.csv"');
    res.send(csv);
  });

  app.get("/api/admin/export/signups", requireAuth, requireAdmin, async (_req, res) => {
    const allSignups = await storage.getAllSignupEvents();
    const csv = arrayToCsv(allSignups);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="signups-export.csv"');
    res.send(csv);
  });

  app.get("/api/admin/caller/:userId/detail", requireAuth, requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const range = (req.query.range as string) || "month";
    if (!["today", "week", "month"].includes(range)) {
      return res.status(400).json({ message: "Range must be today, week, or month" });
    }
    try {
      const detail = await storage.getCallerDetail(userId, range as "today" | "week" | "month");
      res.json(detail);
    } catch (err: any) {
      res.status(404).json({ message: err.message || "User not found" });
    }
  });

  // ──────────── Stage 8: Scaling, Optimization & Automation ────────────

  app.get("/api/admin/lead-score-weights", requireAuth, requireAdmin, async (_req, res) => {
    const weights = await storage.getLeadScoreWeights();
    res.json(weights);
  });

  app.put("/api/admin/lead-score-weights", requireAuth, requireAdmin, async (req, res) => {
    const { weights } = req.body;
    if (!weights || typeof weights !== "object") {
      return res.status(400).json({ message: "weights object is required" });
    }
    for (const [key, value] of Object.entries(weights)) {
      if (key.startsWith("score_weight_")) {
        await storage.setSetting(key, String(value));
      }
    }
    res.json({ success: true });
  });

  app.post("/api/admin/leads/recalculate-scores", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const allLeads = await storage.getAllLeads();
      const weights = await storage.getLeadScoreWeights();
      let updated = 0;
      const now = new Date();
      for (const lead of allLeads) {
        const score = calculateLeadScore(lead, weights);
        await storage.updateLead(lead.id, { leadScore: score, leadScoreUpdatedAt: now });
        updated++;
      }
      res.json({ updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to recalculate scores" });
    }
  });

  app.get("/api/admin/leak-report", requireAuth, requireAdmin, async (_req, res) => {
    const report = await storage.getLeakReport();
    res.json(report);
  });

  app.get("/api/admin/alerts", requireAuth, requireAdmin, async (_req, res) => {
    const alerts = await storage.getCallerAlerts();
    res.json(alerts);
  });

  app.get("/api/admin/analytics/category-state", requireAuth, requireAdmin, async (req, res) => {
    const range = (req.query.range as string) || "month";
    if (!["week", "month", "all"].includes(range)) {
      return res.status(400).json({ message: "Range must be week, month, or all" });
    }
    const analysis = await storage.getCategoryStateAnalysis(range as "week" | "month" | "all");
    res.json(analysis);
  });

  app.get("/api/admin/caller-queues", requireAuth, requireAdmin, async (_req, res) => {
    const queues = await storage.getCallerQueues();
    res.json(queues);
  });

  app.get("/api/admin/daily-assignments", requireAuth, requireAdmin, async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string) : 14;
    const history = await storage.getDailyAssignmentHistory(days);
    res.json(history);
  });

  app.get("/api/admin/daily-assignments/:date", requireAuth, requireAdmin, async (req, res) => {
    const dateStr = req.params.date;
    const leads = await storage.getLeadsAssignedOnDate(dateStr);
    res.json(leads);
  });

  app.post("/api/sendgrid/inbound", async (req, res) => {
    try {
      const { to, from, subject, text, html, envelope } = req.body;
      
      let leadToken: string | null = null;
      
      if (to) {
        const toAddresses = to.split(",").map((e: string) => e.trim());
        for (const addr of toAddresses) {
          const emailPart = addr.match(/<([^>]+)>/)?.[1] || addr;
          leadToken = extractLeadTokenFromReplyTo(emailPart);
          if (leadToken) break;
        }
      }
      
      if (!leadToken && envelope) {
        try {
          const env = typeof envelope === "string" ? JSON.parse(envelope) : envelope;
          if (Array.isArray(env.to)) {
            for (const addr of env.to) {
              leadToken = extractLeadTokenFromReplyTo(addr);
              if (leadToken) break;
            }
          }
        } catch {}
      }
      
      if (!leadToken) {
        console.log("[INBOUND] Could not extract lead token from:", to);
        return res.status(200).json({ ok: true, matched: false });
      }
      
      const lead = await storage.getLeadByToken(leadToken);
      if (!lead) {
        console.log("[INBOUND] No lead found for token:", leadToken);
        return res.status(200).json({ ok: true, matched: false });
      }
      
      const fromEmail = from?.match(/<([^>]+)>/)?.[1] || from || "unknown";
      const fromName = from?.match(/^([^<]+)/)?.[1]?.trim() || null;
      
      const sanitizedHtml = html ? html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/on\w+="[^"]*"/gi, "") : null;
      
      await storage.createInboundEmail({
        leadId: lead.id,
        fromEmail,
        fromName,
        toEmail: to || "",
        subject: subject || "(No Subject)",
        bodyText: text || null,
        bodyHtml: sanitizedHtml,
        isRead: false,
        receivedAt: new Date(),
      });
      
      if (lead.statusEmail !== "REPLIED") {
        await storage.updateLead(lead.id, { statusEmail: "REPLIED" });
      }
      
      console.log(`[INBOUND] Email from ${fromEmail} attached to lead ${lead.id} (${lead.companyName})`);
      res.status(200).json({ ok: true, matched: true, leadId: lead.id });
    } catch (err) {
      console.error("[INBOUND] Error processing inbound email:", err);
      res.status(200).json({ ok: true, error: "Processing error" });
    }
  });

  app.post("/api/leads/:id/email/reply", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    
    const isAdmin = req.user!.role === "admin";
    const isAssigned = lead.assignedToUserId === req.user!.id;
    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized" });
    }
    
    if (lead.emailSuppressed) {
      return res.status(400).json({ message: "Email sending is suppressed for this lead" });
    }
    
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ message: "Reply message is required" });
    }
    
    const toEmail = lead.confirmedEmail?.trim() || lead.scrapedEmail?.trim();
    if (!toEmail) {
      return res.status(400).json({ message: "No email address available for this lead" });
    }
    
    const emailLogsList = await storage.getEmailLogsByLeadId(leadId);
    const lastSent = emailLogsList[0];
    
    const replySubject = lastSent ? `Re: ${lastSent.subject.replace(/^Re:\s*/i, "")}` : `Re: SupplyStreamline`;
    const replyHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
<p>${message.trim().replace(/\n/g, "<br/>")}</p>
<p>Best,<br/>${req.user!.name}</p>
</div>`;
    
    const sendResult = await sendEmail(
      toEmail, replySubject, replyHtml, lead.leadToken, lead.id,
      { 
        inReplyTo: lastSent?.sendgridMessageId || undefined,
        bodyText: message.trim() 
      }
    );
    
    const emailLog = await storage.createEmailLog({
      leadId: lead.id,
      userId: req.user!.id,
      templateType: "FOLLOW_UP" as any,
      toEmail,
      fromEmail: "connect@supplystreamline.com",
      subject: replySubject,
      bodyHtml: replyHtml,
      bodyText: message.trim(),
      sendgridMessageId: sendResult.messageId || null,
      inReplyToMessageId: lastSent?.sendgridMessageId || null,
      isReply: true,
      status: sendResult.success ? (sendResult.mock ? "MOCK_SENT" : "SENT") : "FAILED",
    });
    
    if (!sendResult.success) {
      return res.status(500).json({ message: sendResult.error || "Failed to send reply", emailLog });
    }
    
    res.status(201).json(emailLog);
  });

  app.get("/api/emails/inbox", requireAuth, async (req, res) => {
    const filter = (req.query.filter as string) || "all";
    const leadId = req.query.leadId ? parseInt(req.query.leadId as string) : undefined;
    const userId = req.user!.role === "admin" ? (req.query.callerId ? parseInt(req.query.callerId as string) : undefined) : req.user!.id;
    
    const threads = await storage.getEmailThreads({
      filter: filter as "all" | "unread" | "mine",
      currentUserId: req.user!.id,
      leadId,
      assignedCallerId: filter === "mine" ? req.user!.id : userId,
    });
    
    res.json(threads);
  });

  app.post("/api/emails/inbound/:id/read", requireAuth, async (req, res) => {
    const inboundId = parseInt(req.params.id);
    await storage.markInboundEmailRead(inboundId, req.user!.id);
    res.json({ ok: true });
  });

  app.get("/api/leads/:id/email-thread", requireAuth, async (req, res) => {
    const leadId = parseInt(req.params.id);
    const lead = await storage.getLeadById(leadId);
    if (!lead) return res.status(404).json({ message: "Lead not found" });
    
    const thread = await storage.getEmailThread(leadId);

    const unreadReceived = (thread.received || []).filter((r: any) => !r.isRead);
    for (const msg of unreadReceived) {
      await storage.markInboundEmailRead(msg.id, req.user!.id);
    }

    res.json(thread);
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
