# SupplyStreamline Onboarding

## Overview
Internal calling + email + tracking system for onboarding vendors and buyers. Stage 1 MVP implements the Vendor pipeline with Admin and Vendor Caller roles.

## Architecture
- **Frontend**: React + Vite + Tailwind + Shadcn UI + wouter routing + TanStack Query
- **Backend**: Express + Passport.js (local strategy) + PostgreSQL + Drizzle ORM
- **Auth**: Email/password with session-based auth (connect-pg-simple for session store)

## Key Files
- `shared/schema.ts` - All database schemas and types (users, leads, call_logs, lead_notes)
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database operations (IStorage interface + DatabaseStorage)
- `server/auth.ts` - Passport setup, session config, middleware
- `server/db.ts` - Database connection
- `client/src/lib/auth.tsx` - Auth context/provider
- `client/src/components/app-sidebar.tsx` - Navigation sidebar
- `client/src/pages/` - All page components

## Roles
- **Admin**: Full access - upload leads, assign batches, manage users, view all leads
- **Vendor Caller**: View assigned leads, view all vendor leads (read-only), edit assigned leads, log calls, add notes
- **Buyer Caller**: Scaffolded in schema but not yet built

## Seed Data
- Default admin: admin@supplystreamline.com / admin123
- Created automatically on first run if no users exist

## Database
- PostgreSQL with Drizzle ORM
- Push schema: `npm run db:push`
- Tables: users, leads, call_logs, lead_notes

## Running
- `npm run dev` starts Express + Vite on port 5000
