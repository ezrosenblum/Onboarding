# SupplyStreamline Onboarding

## Overview
Internal calling + email + tracking system for onboarding vendors and buyers. Stage 1 MVP implements the Vendor pipeline with Admin and Vendor Caller roles. Stage 2 adds the calling engine with retry logic. Stage 3 adds outbound email capabilities with SendGrid integration. Stage 4 adds AI Research Engine for personalized call opener scripts. Stage 6 adds signup completion tracking via webhook + admin manual override with metrics dashboard.

## Architecture
- **Frontend**: React + Vite + Tailwind + Shadcn UI + wouter routing + TanStack Query
- **Backend**: Express + Passport.js (local strategy) + PostgreSQL + Drizzle ORM
- **Auth**: Email/password with session-based auth (connect-pg-simple for session store)
- **Email**: SendGrid integration for outbound emails with webhook event tracking
- **AI**: Replit AI Integrations (OpenAI) for structured call prep output (opener script, key facts, discovery questions, objections, next step)

## Key Files
- `shared/schema.ts` - All database schemas and types (users, leads, call_logs, lead_notes, email_logs, email_events, email_templates, ai_prompts, ai_research, signup_events, system_settings)
- `server/routes.ts` - API endpoints + retry logic + email endpoints + webhook + AI endpoints
- `server/storage.ts` - Database operations (IStorage interface + DatabaseStorage)
- `server/auth.ts` - Passport setup, session config, middleware
- `server/email-service.ts` - SendGrid email sending + template builder
- `server/services/aiProvider.ts` - AI opener script generation with OpenAI + mock fallback
- `server/db.ts` - Database connection
- `client/src/lib/auth.tsx` - Auth context/provider
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/components/call-modal.tsx` - Call logging popup modal with AI opener section
- `client/src/pages/today-view.tsx` - Caller Today View (NEW/RETRY/ACTIVE-PENDING/COMPLETED tabs)
- `client/src/pages/lead-detail.tsx` - Lead detail with Overview/Call Logs/Emails/Notes/AI Script tabs
- `client/src/pages/admin/ai-prompts.tsx` - Admin AI prompt template management
- `client/src/pages/` - All page components

## Roles
- **Admin**: Full access - upload leads, assign batches, manage users, view all leads, send emails, manage AI prompts
- **Vendor Caller**: Today View, My Assigned, All Vendor Leads (read-only), edit assigned leads, log calls, add notes, send emails to assigned leads, generate/view AI scripts
- **Buyer Caller**: Scaffolded in schema but not yet built

## Call Outcomes (Stage 2)
Fixed outcomes: NO_ANSWER, VOICEMAIL, GATEKEEPER, CALL_DROPPED, SPOKE_NOT_INTERESTED, SPOKE_SEND_INFO, SPOKE_FOLLOW_UP, SPOKE_INTERESTED

### Retry Logic
- Retry outcomes (NO_ANSWER, VOICEMAIL, GATEKEEPER, CALL_DROPPED): schedule retry after N business days
- SPOKE_NOT_INTERESTED: marks lead unreachable
- SPOKE_SEND_INFO, SPOKE_FOLLOW_UP, SPOKE_INTERESTED: no retry, no unreachable — goes to ACTIVE/PENDING tab
- Max retry attempts and delay configurable via system_settings table
- Business day calculation skips Saturday and Sunday

### Today View Tab Mapping (Stage 2.1)
- **NEW**: statusCall=NOT_CALLED, unreachable=false, statusSignup!=SIGNED_UP
- **RETRY**: retryNextEligibleAt IS NOT NULL, unreachable=false, statusSignup!=SIGNED_UP
  - Shows both eligible-now and future-retry leads (with date indicators)
  - Stats bar "Retry Eligible" count only counts eligible-now leads
- **ACTIVE/PENDING**: statusCall IN (SPOKE_SEND_INFO, SPOKE_FOLLOW_UP, SPOKE_INTERESTED, SPOKE_NOT_INTERESTED) AND retryNextEligibleAt IS NULL, unreachable=false, statusSignup!=SIGNED_UP
- **COMPLETED**: statusSignup=SIGNED_UP only (placeholder for webhook)
- Unreachable leads hidden by default; toggle "Show Unreachable" checkbox to include them in NEW/RETRY/ACTIVE tabs
- Invariant: retry outcomes always set either retryNextEligibleAt or unreachable=true, ensuring no lead disappears

## Email System (Stage 3)
### Templates
- **Send Info**: Initial information email with signup link
- **Follow Up**: Follow-up email referencing previous communication
- **Unreachable Outreach**: Last-resort email for unreachable/max-retry leads

### Gating Rules
- **Send Info**: Requires call log + confirmed email + not unreachable
- **Follow Up**: Requires Send Info email sent first + call log + confirmed email + not unreachable
- **Unreachable Outreach**: Requires lead unreachable or max retries reached + any email available

### Email Tracking
- Each lead gets a unique `leadToken` (UUID) embedded in signup URLs
- SendGrid webhook (POST /api/sendgrid/events) processes open/click/bounce/dropped events
- Email status tracked per lead: NOT_SENT → SENT → OPENED → CLICKED / BOUNCED
- Email logs stored with template type, status, SendGrid message ID
- Mock mode available when SendGrid API key not configured

### Template Management
- Admin-only page at `/admin/email-templates`
- Templates stored in `email_templates` table (pipeline_type + template_type unique)
- Templates use variable substitution: {{company_name}}, {{contact_email}}, {{caller_name}}, {{signup_link}}, {{city}}, {{state}}
- Default templates auto-loaded if no DB record exists
- Restore Default button resets template to hardcoded defaults
- Email sending pulls latest template from DB at send time (dynamic, not hardcoded)

### API Endpoints
- `GET /api/leads/:id/emails` - Get email logs for a lead
- `GET /api/leads/:id/email-eligibility` - Check which templates can be sent
- `POST /api/leads/:id/email/send` - Send email (body: { templateType })
- `POST /api/sendgrid/events` - SendGrid webhook receiver
- `GET /api/templates?pipeline=vendor` - Get templates for pipeline (admin only)
- `POST /api/templates` - Save/update a template (admin only)
- `POST /api/templates/restore-default` - Restore template to default (admin only)

## AI Research Engine (Stage 4 V2 - Versioned History + Structured Output)
### Overview
- Generates structured call prep using OpenAI (via Replit AI Integrations)
- **Structured JSON output**: opener_script, summary_bullets, discovery_questions, objections, suggested_next_step
- Versioned history in `ai_research` table with `is_current` flag (replaces old `ai_research_cache`)
- Mock fallback when AI not configured (returns placeholder structured data)

### Structured Output Schema (AiOutputJson)
- `opener_script`: Personalized opening script for calls
- `summary_bullets`: Key facts about the business (array)
- `discovery_questions`: Questions to ask during the call (array)
- `objections`: Common objections and responses (array)
- `suggested_next_step`: Recommended follow-up action

### Prompt Management
- Admin-only page at `/admin/ai-prompts`
- Prompts stored per pipeline in `ai_prompts` table (pipeline_type unique)
- Template variables: {{company_name}}, {{category_keyword}}, {{city}}, {{state}}, {{phone}}, {{website}}, {{rating}}, {{reviews_count}}, {{scraped_email}}, {{confirmed_email}}, {{full_address}}
- Each save auto-increments version; cached scripts become stale when prompt version changes
- Restore Default resets to hardcoded default prompt

### Versioned History System
- Results stored in `ai_research` table (multiple records per lead, `is_current` flag)
- Each generation marks previous records as `is_current=false`, inserts new `is_current=true`
- Stores: `prompt_used` (full prompt text), `output_json` (structured), `opener_script` (extracted top-level)
- Stale detection: cached prompt version < current prompt version
- Force-regenerate creates new version, marks old not current

### Frontend Integration
- **Lead Detail Page**: "AI Call Prep" tab with Opener Script / More Details sub-tabs
  - Opener Script: prominent card with copy button
  - More Details: Key Facts, Discovery Questions, Objection Handling, Suggested Next Step
- **Call Modal**: Always-visible AI Opener Script panel with generate/regenerate/copy

### Pre-Call Timing Warning
- Parses `hours_raw` field from lead data for business hours
- Detects if current time is within 15 minutes of open/close in lead's timezone
- Shows AlertDialog warning before logging call
- Logs `within_bad_timing_window` boolean on call_logs table

### API Endpoints
- `GET /api/leads/:id/ai-research` - Get current AI research for lead (includes stale detection)
- `POST /api/leads/:id/ai-research` - Generate/regenerate AI research (body: { force })
- `GET /api/admin/ai-prompts` - Get all AI prompts (admin only)
- `PUT /api/admin/ai-prompts` - Save/update AI prompt (admin only)
- `POST /api/admin/ai-prompts/restore-default` - Restore prompt to default (admin only)

## Signup Completion Tracking (Stage 6)
### Overview
- Tracks when vendors complete signup via webhook or admin manual override
- Signup fields on leads: statusSignup, signedUpAt, signedUpEmail, signedUpUserId, signupSource
- Audit trail in signup_events table with full payload, source IP, user agent
- Idempotency via unique index on idempotency_key (nullable)

### Webhook
- POST /api/signup/webhook - External webhook receiver
- Requires `X-Webhook-Secret` header matching SIGNUP_WEBHOOK_SECRET env var (mandatory)
- Validates payload with Zod: lead_token (required), email, user_id, idempotency_key
- Returns 503 if secret not configured, 401 if wrong secret, 400 if invalid payload
- Duplicate idempotency_key returns success without re-processing

### Admin Manual Override
- POST /api/admin/leads/:id/mark-signed-up - Admin marks lead as signed up
- Records audit event with admin user ID

### Signup Metrics Dashboard
- GET /api/admin/metrics/signups?range=today|week|month - Metrics with caller leaderboard
- Admin page at /admin/signup-metrics with range selector
- Shows total signups and per-caller breakdown

### Lead Detail Integration
- Signup Status card on Overview tab showing status, date, source
- Admin "Mark as Signed Up" button for non-signed-up leads

### Today View Integration
- COMPLETED tab shows leads with statusSignup=SIGNED_UP

### API Endpoints
- `POST /api/signup/webhook` - External signup webhook (requires X-Webhook-Secret header)
- `POST /api/admin/leads/:id/mark-signed-up` - Admin manual override (admin only)
- `GET /api/admin/leads/:id/signup-events` - Signup audit trail (admin only)
- `GET /api/admin/metrics/signups?range=today|week|month` - Signup metrics (admin only)

## Seed Data
- Default admin: admin@supplystreamline.com / admin123
- System settings: max_retry_attempts=3, retry_delay_business_days=2
- Created automatically on first run if no users exist

## Database
- PostgreSQL with Drizzle ORM
- Push schema: `npm run db:push`
- Tables: users, leads, call_logs, lead_notes, email_logs, email_events, email_templates, ai_prompts, ai_research, signup_events, system_settings
- Unique index: (pipeline_type, place_id) WHERE place_id IS NOT NULL

## Running
- `npm run dev` starts Express + Vite on port 5000
