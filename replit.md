# SupplyStreamline Onboarding

## Overview
SupplyStreamline is an internal system designed to streamline the onboarding of vendors and buyers through integrated calling, emailing, and tracking functionalities. The project aims to provide a comprehensive platform for managing leads, facilitating communication, and tracking conversion funnels. Key capabilities include a multi-stage vendor onboarding pipeline, robust call and email systems with retry logic, AI-powered call preparation, real-time phone calling via Twilio with transcription, and signup completion tracking with detailed analytics. The long-term vision is to expand to buyer onboarding and continuously enhance AI capabilities for personalized outreach and efficient lead management.

## User Preferences
I want iterative development. Ask before making major changes.

## System Architecture
The application features a modern full-stack architecture. The **frontend** is built with React, Vite, Tailwind CSS, Shadcn UI for components, wouter for routing, and TanStack Query for data fetching. The **backend** uses Express.js with Passport.js for authentication (local strategy with session-based auth and `connect-pg-simple` for session store), PostgreSQL as the database, and Drizzle ORM for database interactions.

**UI/UX Decisions:**
- **Design System:** Shadcn UI components ensure a consistent and modern aesthetic.
- **Color Scheme:** Utilizes Tailwind CSS for flexible styling and a clean, professional appearance.
- **User Roles:** Distinct interfaces and access levels for Admin and Vendor Caller roles, with future expansion for Buyer Callers.

**Technical Implementations & Feature Specifications:**

1.  **Lead Management:**
    *   Leads are categorized by pipeline (Vendor, Buyer).
    *   Leads progress through various call statuses (NOT_CALLED, SPOKE_INTERESTED, etc.) and signup statuses (NOT_SIGNED_UP, SIGNED_UP).
    *   A "Today View" dashboard organizes leads into NEW, RETRY, ACTIVE/PENDING, and COMPLETED tabs based on their status and eligibility for action.
    *   Unreachable leads can be toggled for visibility.

2.  **Call System:**
    *   **Call Outcomes:** Fixed set of outcomes (e.g., NO_ANSWER, SPOKE_INTERESTED)
    *   **Retry Logic:** Automated scheduling of retries for specific outcomes (e.g., NO_ANSWER) after a configurable number of business days, with a maximum retry limit.
    *   **Twilio Integration:**
        *   Supports WebRTC browser calls and bridged agent phone calls.
        *   Automatic call recording with access-controlled playback.
        *   OpenAI Whisper transcription of recordings, with status tracking.
        *   Pre-call timing warning based on lead's business hours.
        *   Comprehensive API endpoints for call initiation, wrap-up, and status updates.
    *   **Caller Tools:** Call logging modal, AI opener script display, lead detail view with call history.
    *   **Caller Self-Pull:** Callers can pull unassigned leads based on filters.

3.  **Email System:**
    *   **Outbound Emails:** SendGrid integration for sending various templated emails (Send Info, Follow Up, Unreachable Outreach). Reply-To headers use `lead_<token>@reply.supplystreamline.com` for automatic inbound routing.
    *   **Inbound Email Capture:** SendGrid Inbound Parse webhook (`POST /api/sendgrid/inbound`) receives replies, extracts lead token from Reply-To address, stores in `inbound_emails` table with HTML sanitization (script/event handler removal).
    *   **Email Threading:** Merged chronological view of sent and received emails per lead. Global Email Inbox page with Unread/All/Assigned to Me filters and click-through to lead threads.
    *   **Controlled Replies:** Callers can reply to leads from the app via a simple reply UI (no free-text email composition). Replies are gated by suppression status.
    *   **Gating Rules:** Emails require call log + confirmed email + contact name + not unreachable + not suppressed. Contact name collected during call wrap-up for SPOKE_SEND_INFO outcomes.
    *   **Email Suppression:** Bounce and spam report events mark `emailSuppressed: true` on leads, blocking all future email sends and replies.
    *   **Email Tracking:** SendGrid webhooks process open, click, bounce, and dropped events, updating email status per lead.
    *   **Template Management:** Admin users can manage email templates via a dedicated interface, supporting variable substitution and defaulting.

4.  **AI Research Engine:**
    *   **AI-Powered Call Prep:** Generates structured call preparation content (opener script, key facts, discovery questions, objections, next steps) using OpenAI.
    *   **Versioned History:** Stores multiple versions of AI research per lead, with a `is_current` flag, allowing for prompt evolution without losing historical context.
    *   **Prompt Management:** Admins can manage AI prompt templates with variable substitution, and changes invalidate cached AI scripts.
    *   **Frontend Integration:** AI scripts are prominently displayed in the call modal and on the lead detail page.

5.  **Signup Completion Tracking:**
    *   Tracks lead signup completion via an external webhook or admin manual override.
    *   Records audit trails for all signup events, ensuring data integrity and idempotency.
    *   Integrates signup status into lead details and the Today View.

6.  **Admin & Reporting:**
    *   **Admin Dashboard:** Provides tools for lead assignment, user management, and system settings.
    *   **Performance Dashboard:** Offers detailed metrics on caller activity (calls, emails), email engagement rates, and conversion funnels (Calls → Signup%, Click → Signup%). Includes breakdowns by caller, state, category, and call timing analysis. Also includes caller alerts panel, funnel leak report, and conversion analysis by state/category/rating/source.
    *   **Signup Metrics Dashboard:** Tracks total signups and per-caller signup performance over selectable date ranges.
    *   **AI Prompt & Email Template Management:** Dedicated admin pages for managing AI prompts and email templates.
    *   **Call Review Queue:** Admin page for reviewing calls with quality tagging and coaching notes.
    *   **Caller Detail Drilldown:** Per-caller metrics, outcome distribution, and daily trends.
    *   **Settings Hub:** Unified admin page for retry settings, call settings, webhook status, pipeline health, lead scoring weights, and CSV data export.

8.  **Scaling & Optimization (Stage 8):**
    *   **Lead Scoring Engine:** Configurable scoring (0-100) based on weighted factors (email, website, rating, reviews, phone, email clicked). Weights managed in admin settings, scores auto-calculated and stored on leads. NEW tab sorts by score descending.
    *   **Funnel Leak Detection:** Identifies leads stuck at various pipeline stages (clicked but not signed up, spoke but no email, retried 3+ times without progress, assigned but untouched 3+ days).
    *   **Caller Performance Alerts:** Automated alert generation for no activity, low conversion, high unreachable, and high no-answer rates.
    *   **Conversion Analysis:** Breakdown by state, category, rating band, and source file with conversion percentages.
    *   **CSV Data Export:** Export leads, call logs, email logs, and signup events as CSV files.

7.  **Database & Schema:**
    *   PostgreSQL database managed with Drizzle ORM.
    *   Schema defines tables for users, leads, call logs, notes, email logs, email events, email templates, AI prompts, AI research, signup events, inbound emails, and system settings.
    *   Unique indexing ensures data integrity, especially for leads.

## External Dependencies
*   **SendGrid:** For sending outbound emails and tracking email events via webhooks.
*   **Replit AI Integrations (OpenAI):** Utilized by the AI Research Engine for generating structured call preparation content.
*   **Twilio:** Powers real-time phone calling functionalities, including WebRTC and bridged calls, call recording, and webhook events for call status and recording completion.
*   **PostgreSQL:** The primary database for all application data.