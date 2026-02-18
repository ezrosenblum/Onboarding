# SupplyStreamline Onboarding

## Overview
Internal calling + email + tracking system for onboarding vendors and buyers. Stage 1 MVP implements the Vendor pipeline with Admin and Vendor Caller roles. Stage 2 adds the calling engine with retry logic. Stage 3 adds outbound email capabilities with SendGrid integration. Stage 4 adds AI Research Engine for personalized call opener scripts.

## Architecture
- **Frontend**: React + Vite + Tailwind + Shadcn UI + wouter routing + TanStack Query
- **Backend**: Express + Passport.js (local strategy) + PostgreSQL + Drizzle ORM
- **Auth**: Email/password with session-based auth (connect-pg-simple for session store)
- **Email**: SendGrid integration for outbound emails with webhook event tracking
- **AI**: Replit AI Integrations (OpenAI) for generating personalized call opener scripts

## Key Files
- `shared/schema.ts` - All database schemas and types (users, leads, call_logs, lead_notes, email_logs, email_events, email_templates, ai_prompts, ai_research_cache, system_settings)
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

## AI Research Engine (Stage 4)
### Overview
- Generates personalized call opener scripts using OpenAI (via Replit AI Integrations)
- Per-lead caching with prompt version tracking for stale detection
- Mock fallback when AI not configured (returns placeholder scripts)

### Prompt Management
- Admin-only page at `/admin/ai-prompts`
- Prompts stored per pipeline in `ai_prompts` table (pipeline_type unique)
- Template variables: {{company_name}}, {{category_keyword}}, {{city}}, {{state}}, {{phone}}, {{website}}, {{rating}}, {{reviews_count}}, {{scraped_email}}, {{confirmed_email}}, {{full_address}}
- Each save auto-increments version; cached scripts become stale when prompt version changes
- Restore Default resets to hardcoded default prompt

### Cache System
- Results cached in `ai_research_cache` table (lead_id unique)
- Cache stores prompt version snapshot to detect staleness
- Force-regenerate overwrites existing cache via POST endpoint
- Stale indicator shown when cached prompt version < current prompt version

### Frontend Integration
- **Lead Detail Page**: "AI Script" tab shows cached script, generate/regenerate buttons, stale warning, metadata (model, tokens, version)
- **Call Modal**: Collapsible "AI Opener Script" section with same generate/view/regenerate UX

### API Endpoints
- `GET /api/leads/:id/ai-research` - Get cached AI research for lead (includes stale detection)
- `POST /api/leads/:id/ai-research` - Generate/regenerate AI opener script
- `GET /api/admin/ai-prompts` - Get all AI prompts (admin only)
- `PUT /api/admin/ai-prompts` - Save/update AI prompt (admin only)
- `POST /api/admin/ai-prompts/restore-default` - Restore prompt to default (admin only)

## Seed Data
- Default admin: admin@supplystreamline.com / admin123
- System settings: max_retry_attempts=3, retry_delay_business_days=2
- Created automatically on first run if no users exist

## Database
- PostgreSQL with Drizzle ORM
- Push schema: `npm run db:push`
- Tables: users, leads, call_logs, lead_notes, email_logs, email_events, email_templates, ai_prompts, ai_research_cache, system_settings
- Unique index: (pipeline_type, place_id) WHERE place_id IS NOT NULL

## Running
- `npm run dev` starts Express + Vite on port 5000
