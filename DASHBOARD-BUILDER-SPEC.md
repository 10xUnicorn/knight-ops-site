# Knight Ops Dashboard Builder — Master Spec & Source of Truth

> **Owner:** Daniel Knight (dknightunicorn@gmail.com)
> **Lives in:** knight-ops-site (github.com/10xUnicorn/knight-ops-site)
> **Pages:** `/dashboard-intake` (builder) · `/admin` (Dashboard Builds + 5th prompt option) · `/db/:slug` (shareable live build)
> **Supabase:** trpnlkntvulkjerevngm · **Vercel:** prj_mXMrnTboMFpBt5QsCdFeR2t7aerz · **Email:** Resend (daniel@knightops.biz)
> **Last Updated:** 2026-06-24 (v1 — research + plan)

---

## 1. What This Is

A self-serve **dashboard build-out engine** that turns an intake form into a complete, ready-to-run Claude Code build. It mirrors the proven Event Lead Engine intake (`/event-lead-engine-intake`) — live preview, AI review, edge-function submit — but for full client dashboards/apps instead of lead magnets.

The system streamlines automated fulfillment of dashboard builds for new clients: answer the intake (or let AI pre-fill it), preview/approve a real AI mockup, then export a goal-function prompt + spec doc that builds the entire dashboard end-to-end in Claude Code.

### The Two Layers (critical distinction)

| Layer | What it is | Who runs it |
|-------|-----------|-------------|
| **A — The Builder** | `/dashboard-intake` + admin integration + AI mockup + stored builds + prompt/spec generators. *This is what we build now.* | Daniel / client, in the browser |
| **B — The Goal-Function Build** | The end-to-end Claude Code prompt + spec doc that Layer A **outputs**. It builds the actual client dashboard (DB, auth, modules, deploy, tests, loop). | Daniel, pasting into Claude Code |

Layer A's job is to make Layer B's prompt perfect and pre-filled. Layer A does **not** itself build client dashboards — it produces the instructions that do.

---

## 2. Architecture & Hard Rules

- **Stack of the builder pages:** single-file HTML (no framework, no build step) — same as the rest of knight-ops-site. Supabase REST + edge functions for data/AI.
- **Stack the builder PRESCRIBES for generated dashboards:** Next.js (App Router) + Supabase (auth + Postgres + RLS) + Resend (email) + Stripe (payments, when selected) + Vercel hosting. This matches the `mad-fresh` production app and the Keira ecosystem spec. (Single-file Cowork artifact remains an option for the lightest internal-only builds.)
- **Deploy:** `git push` only via fresh `/tmp` clone (never Vercel CLI — site Rule 4). Verify READY.
- **Safety:** run `project-selector` before any Supabase/Vercel write (Rule 3). Builder data lives in the existing `trpnlkntvulkjerevngm` project; each *generated client app* gets its **own** Supabase project (Rule 7).
- **Lead hygiene:** dashboard intake leads are `lead_type='inbound'`, `source='dashboard_intake'` (Rule 2 — never pollute prospecting).
- **Reuse existing primitives:** `cpB()`/`ccCopy()` (copy-to-clipboard), `gather()`/`renderPreview()`/`wireChoices()` (live preview), `ele-save`/`ele-review`/`ele-intake` (save/AI/commit), `serve-le`+`api/le.js` (public serve), `convertAppToLead()`/`createProjectFromApp()` (contact linkage).

---

## 3. User Flow

1. **Land on `/dashboard-intake`** → choose how to build:
   - **Build with AI** — describe what you're building + client type, upload docs/transcripts, optional "research their brand/site." AI pre-fills every field.
   - **Build manually** — step through the form.
2. **Step through sections** (each updates the instant **template preview** on the right): Client & Business → Modules → Features → Users/Roles/Permissions → Integrations → Website/Blog/Hosting → Additional details/uploads.
3. **Review with AI** → real branded **mockup** of the actual dashboard. Revise by typing instructions or deselecting modules/features; regenerate until satisfied.
4. **Create Spec** (optional, recommended) → AI writes a full spec/PRD; export, review, adjust.
5. **Finalize** → generates the **goal-function build prompt** + spec, **Copy to Clipboard**, and **Saves the build** (creates the application tied to a contact record).
6. **Share** → review-only link (client approves the plan) or edit link (client adds info). Live URL reloads data on open.
7. **Build** → paste the prompt + spec into Claude Code; the goal function builds it all the way to a tested, deployed dashboard.

---

## 4. Intake Form Sections & Fields

**0. How do you want to build?** — `mode: ai | manual`; free-text brief; file/transcript uploads (Supabase storage `dashboard-assets`); `research_brand` toggle (+ URL).

**1. Client & Business** — link/select existing contact (or new): first/last/email/phone/company; business name, niche/industry, what they do, offers + pricing, target audience, team & roles; brand primary/secondary/accent colors, logo upload, fonts, brand voice, dark/light.

**2. Modules** — multi-select from the Module Library (§5) grouped by category; "add custom module" (name + description). Each toggles live-preview nav + cards. Scope tag per module: admin / client-portal / shared.

**3. Features & Functions** — per selected module, toggle its features (Kanban, inline edit, bulk actions, KPI gauges, activity feed/timeline, saved views/filters, soft-delete + audit, CSV import/export, search, notifications). Custom features allowed.

**4. Users, Roles & Permissions** — `facing: internal_only | client_portal | both`; role templates (super-admin / admin / team / coach / client / partner / viewer) with an **editable permission matrix**; admin↔client interaction (messaging, approvals, materials); **editable ascension / customer-journey statuses** + project/task statuses (modular, admin-editable inside the built app).

**5. Integrations** — Supabase auth (invite + activation email + password set/reset pages), Resend email notifications, Stripe payments (y/n + products), AI/Anthropic features, CRM (GHL/HubSpot), calendar, meeting recorder (Fathom), course platform (Kajabi), ads, generic webhooks. Each selection maps to required edge functions + env vars in the build prompt.

**6. Website, Blog & Hosting** — build a marketing website too? (pages/structure); automate blog posts + manage them in the dashboard? (cadence, source); hosting = we host vs client; domain (or proceed without — build fully functional with placeholder + mockups).

**7. Additional details** — freeform context; multi-file uploads; meeting transcriptions; explicit **file paths** to reference (so the build prompt can point Claude Code at exact assets/folders).

---

## 5. Common Dashboard Module Library (synthesized from Keira, BBB, Stephanie, Mad Fresh)

Seed into `dashboard_modules`. Scope: **A**=admin · **C**=client-portal · **S**=shared.

| Key | Module | Scope | Core features | Needs |
|-----|--------|-------|---------------|-------|
| `overview` | Today / Overview | S | Hero KPI row (1 featured + 3), action items, snapshot | — |
| `kpis` | KPI / CEO Dashboard | A | Animated gauges, trends, revenue/pipeline/leads/engagement, roll-ups | Supabase |
| `leads` | Leads / CRM | A | Capture, routing, temperature G/Y/R, stages, inline edit, activity feed | Supabase, CRM |
| `pipeline` | Sales Pipeline | A | Kanban stages, per-rep scoreboard, deal cards, inactivity alerts | Supabase |
| `deals` | Deals / Revenue | A | Stage↔status auto-link, value, won/lost, channel | Supabase, Stripe |
| `tasks` | Tasks / Projects | S | Priority sort, due dates, assignees, statuses (editable) | Supabase |
| `clients` | Clients / Contacts | A | Universal contact anchor, detail (Details/Activity/AI/Notes/Audit), tags | Supabase |
| `cohort` | Retention & Ascension | A/C | Cohort grid, weekly engagement, drift alerts, ascension triggers/outcomes | Supabase, AI |
| `journey` | Customer Journey / Ascension Map | S | Visual journey, stages, next-best-offer, editable statuses | Supabase, AI |
| `portal` | Client Portal | C | My journey, materials library, next offer, my calls, support chat | Supabase auth |
| `partner` | Partner / JV Portal | C | Unique link stats, commission ledger, payouts | Supabase, Stripe |
| `finance` | Money / Finance | A | Revenue/expense, cash position, P&L, forecast (paid-only totals) | Supabase, Stripe |
| `payments` | Payments / Billing | S | Stripe checkout, subscriptions, refunds, status | Stripe |
| `webinar` | Webinar / Ad Spend | A | Registrations, attendance, ROAS/EPL, spend-vs-enroll anomaly | Supabase, Ads |
| `media` | Media / JV Tracker | A | Guests, attribution links, commissions, episodes ROI | Supabase |
| `events` | Live Event Capture | A | Quick/QR capture, tagging, follow-up | Supabase |
| `aibrain` | AI Brain & Intelligence | S | Transcript ingest, action items, signal detection, pre-call briefs, anomalies | AI, Fathom |
| `content` | Content / Blog | S | Calendar, brand voice, blog automation + management | AI, Resend |
| `notifications` | Notifications | S | In-app bell, email digests, SMS/Slack, per-user prefs | Resend, Twilio, Slack |
| `messaging` | Admin↔Client Messaging | S | Threads, approvals, file share | Supabase, Resend |
| `team` | Team & People | A | User list, role matrix, invites, permission audit log | Supabase auth |
| `settings` | Settings & Admin | A | Profile, integrations vault, module on/off, branding | Supabase |
| `worksheets` | Worksheets / Tools | C | Self-serve interactive worksheets (BBB pattern), JSONB persistence | Supabase |
| `reports` | Client Reports | A | Templatized KPI report generator, export | Supabase |

**10 universal patterns** baked into every module: record-detail two-column + tabs · hero KPI row · G/Y/R status triplet · soft-delete + 30-day undo · audit log on every change · bulk-action bar · empty-state + CTA · filter sidebar + saved views · multi-org/role access (RLS) · activity feed/timeline.

---

## 6. Roles, Permissions & Ascension

- **Role templates:** Super Admin (god mode) · Org Admin (ops/finance) · Sales Lead/Rep · Coach · Media/JV Manager · Client · Partner/Guest · Read-only Viewer. Selectable + editable matrix per build.
- **Enforcement:** RLS on every sensitive table (`auth.uid()` join to `user_org_roles`); field-level masking via role views; permission audit log; soft-delete filtered by default.
- **Ascension model** (editable in the built admin): entry doors → core offer → ascension triggers (e.g., week-6) → outcomes (stayed/upsell/pause/nurture/churn) → renewal + win-back + referral + testimonial loops. Client portal surfaces "where you are / what's next."
- **Editable statuses:** clients, projects, tasks, journey stages — all modular and admin-editable inside the generated app.

---

## 7. Design System

- **Builder pages** use the Knight Ops cosmic brand: void `#05061a`, gold `#C9922A`, teal `#00D4C8`, purple `#7B2FFF`, Playfair Display + Inter. (Matches `event-lead-engine-intake.html` tokens.)
- **Generated dashboards** theme to the **client's** brand (colors/logo/fonts from §4). Design principle (per design:design-system): **flexible in the mockup, consistent in the final product** — tokenized colors/spacing/radius, the 10 universal component patterns, accessible status colors (never color alone).
- Per-client palettes captured for the 3 test builds in §12.

---

## 8. Data Model (builder)

**`dashboard_builds`** — id (uuid), form_type='dashboard', first/last/email/phone/company, business/niche/offers/audience/team, brand_json (colors/logo/fonts/mode/voice), modules_json, features_json, roles_json (+matrix), facing, integrations_json, payments_bool, ai_json, website_json, blog_json, hosting, domain, additional_details, file_paths_json, transcripts, upload_paths_json, status (draft/submitted/reviewed/approved/built), resume_token, share_review_token, share_edit_token, ai_mockup_html, outline_html, spec_md, build_prompt, lead_id, client_id, project_id, created_at, updated_at, admin_notes.

**`dashboard_modules`** — key, label, category, scope (A/C/S), default_features_json, required_integrations, tier (smb/enterprise), sort. (Seed from §5.)

**Linkage** — dedup by email → `leads` (inbound), optional `clients` + `projects`; `intake_submissions` gets `form_type='dashboard'` support for the Forms & Surveys view.

---

## 9. Edge Functions & API Routes

| Function | Purpose |
|----------|---------|
| `dashboard-save` / `dashboard-resume` | Draft autosave + resume token + emailed resume link |
| `dashboard-intake` | Commit build → create application + lead/client + project; confirmation + internal notify |
| `dashboard-review` | Anthropic → real branded mockup HTML + outline; accepts revisions/deselections |
| `dashboard-spec` | Anthropic → spec/PRD via write-spec methodology |
| `dashboard-build-prompt` | Assemble the goal-function Claude Code prompt from all fields + spec |
| `serve-dashboard-build` + `api/dashboard-build.js` | Public live build page at `/db/:slug` (review + edit modes), reloads data on open |

---

## 10. Stored Builds & Shareable URLs

- Builds persist in `dashboard_builds`; re-access from the admin **Dashboard Builds** view.
- **Two share links per build:** `review` (read + approve/comment) and `edit` (client adds/edits info). Token-scoped RLS. Opening the link reloads all current data (live).
- Approve/comment + edit-save write back to the build; status moves accordingly.

---

## 11. Goal-Function Build-Prompt Template (Layer B skeleton)

```
/project-selector

GOAL: Build and deploy {CLIENT}'s {APP_NAME} dashboard to 100% completion — tested, live, and walked through the full admin AND client journey. Do not stop until the goal is met.

CONTEXT  — {business, niche, offers, audience, team}
BRAND    — {primary/secondary/accent, logo path, fonts, mode}
STACK    — Next.js (App Router) + Supabase (auth+RLS) + Resend + {Stripe?} + Vercel
FILE PATHS / ASSETS — {explicit paths + uploads + transcripts}

BUILD STEPS (loop until each verifies):
1. Scaffold + create OWN Supabase project (Rule 7). Env via Zod-validated lib/env.ts.
2. Schema + RLS for every table; soft-delete + audit log; seed data (clearable).
3. Supabase auth: invite + activation email (Resend) + WORKING password set/reset pages. Verify the reset URL flow.
4. Build selected MODULES — {modules} — with the 10 universal patterns. {client portal?} {payments?} {AI?} {website/blog?}
5. Ascension model + editable statuses + role permission matrix editable in admin.
6. Integrations — {list} — with webhook signature verification + idempotency.
7. Deploy to Vercel ({hosting/domain or placeholder}).
8. LIVE TEST LOOP: create → edit → delete test records across every module; add a test user; confirm activation email + password set/reset works; walk the full ADMIN journey and the full CLIENT journey (admin↔client interaction, notifications via Resend). Fix and re-test until all green.
9. Confirm goal complete; output URLs + credentials + a short runbook.

ACCEPTANCE — {per-module acceptance criteria from spec}. Reference SPEC: {spec doc}.
```

---

## 12. Test Builds (pre-fill data)

### A. Stephanie Frank — Planet Calm / BARKType™
- Niche: Calm-First Leadership (dog behavior → human development). Author/speaker/coach; book "What the BARK?" ~Sept 2026.
- Modules: overview, journey (ascension ladder), portal, cohort, content/blog, payments, aibrain (fix community RAG bot), reports, settings.
- Value ladder: free Substack/quiz → $7 ebook → $20 book → $42 chew (subscription) → $49/mo collective → $275/mo studio → $6K/yr Calm Council → $25K Wayfinder.
- Integrations: GHL (×2) + Shopify + Heartbeat + Substack + AWIN + Stripe → unify into one journey dashboard. Client portal: yes. Payments: yes.
- Brand: teal `#1CA2A8`, purple `#5B2A86`, gold `#C9922A`, rose `#c0556f`; system font stack.
- Team: Stephanie, Anke (President), Thomas (dev), VA, Debbie.

### B. Chrissy Bernal — Be a Better Brand (build from scratch; BBB_App/intake are reference only)
- Niche: brand architecture + PR/visibility agency for founders/authors. IP: **Finally Seen™** (Clarity Core → Authority Positioning → Visibility Engine → Proof & Momentum). UpLevel podcast + newsletter.
- Modules: overview, clients/CRM + pipeline (close system), portal + worksheets (Finally Seen framework, Brand Architecture, Visibility Plan, PR Campaign Tracker, Media Targets, Revenue Challenge, Cash Flow, Offer Audit, Content Calendar, Brand Voice), reports (monthly client KPI generator), content (repurposing engine), payments (productized offers).
- Offers: $750 Gap Session → $5K/mo retainer (6-mo) → Book Launch Sprint → Fractional CMO $5–8.5K/mo → Six Figure Chicks tiers.
- Integrations: Supabase auth, Resend, Stripe, GHL, Prowly, Fathom. Client portal: yes. Payments: yes (productize). AI: brand-intelligence (SWOT/State of Union/Brand Audit/AEO/PR), content repurposing, report auto-gen.
- Brand: indigo `#363795`, indigo-deep `#1e1e6a`, violet `#8c52ff`, gold `#c9a055`, warm-white `#faf9f7`; Cormorant Garamond + DM Sans.
- Team: Chrissy, Madi (PR), Hero (podcast), Madison V. (visibility).

### C. Keira Brinton — Author ecosystem (3rd; richest enterprise reference)
- Modules (12): overview, kpis/CEO, webinar, pipeline, cohort/ascension, media/JV, events, finance, aibrain, notifications, settings, team — plus client + JV portals and the **ascension constellation** view.
- Roles: super-admin + multi-org + sales lead/rep + coach + media/JV + finance + client + partner + viewer (full RLS + field masking).
- Integrations: Supabase, GHL, Stripe, Meta Ads, Apollo, Twilio, Kajabi, Fathom, Slack, Resend, Anthropic. Client portal: yes. Payments: yes. Enterprise security: full.
- Brand: cabernet `#5B1A2F` / wine, gold `#C9A961`, magenta `#C9266B`; Fraunces + Inter; light "heavenly" + dark "cosmic" modes.

---

## 13. Enterprise vs SMB Tiering (data:build-dashboard)

Builder exposes a **client size/needs** selector that gates enterprise options: RLS adversarial tests, MFA (TOTP) for finance roles, account lockout, suspicious-login alerts, IP allowlist, encrypted columns, daily backups + restore drill, webhook signature verification + replay protection, strict security headers (CSP/HSTS/X-Frame), SOC2-aligned audit logging. SMB builds default to the essentials (auth + RLS + soft-delete + audit + Resend), with enterprise items opt-in.

---

## 14. Phased Tasks

See the live task list (37 items) — Foundation/Spec (1–4) → Data layer (5–8) → Edge functions (9–14) → Intake front end (15–26) → Admin integration (27–29) → Stored builds (30) → Goal-function template (31) → Test builds (32–34) → Enterprise/QA/Deploy (35–37).

## 15. Open Decisions (confirm before build)
- 3rd test dashboard = Keira Brinton (default).
- Generated-dashboard stack = Next.js + Supabase + Resend + Stripe (default; single-file artifact optional for light internal builds).
- Execution sequencing (front-end-first vs full build this session).
