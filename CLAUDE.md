# KnightOps.biz — Project Spec & Source of Truth

> **Owner:** Daniel Knight (dknightunicorn@gmail.com)
> **Domain:** knightops.biz
> **Repo:** github.com/10xUnicorn/knight-ops-site (public)
> **Last Updated:** 2026-07-09

---

## Changelog — 2026-08-17c (Knowledge base, Obsidian and scheduled-task repositioning)

- **Canonical positioning note created:** `Obsidian Data/Knight Ops/Knight-Ops-Positioning-2026.md` supersedes every earlier offer/pricing note. Five offers only, four canonical stats (`$200M+` impact · `50+` systems · `85%` time saved · `100%` code ownership), the six money claims that must never be merged, layer 0–9 architecture, four portal states, language rules. `Offers-and-Pricing.md` and both Offer-Architecture notes carry SUPERSEDED banners.
- **Agent-facing sources repositioned:** `daniel-master-instructions.md`, both sales agent brains (with a `POSITIONING — READ FIRST` block prepended), all 6 `Knight Ops/SEO/` generation prompts, `Projects/KnightOps-Biz-Main-Site.md`, `content-system/README.md`, `Auto Deploy to Vercel.md` (now documents the `ko` helper + the never-overwrite-vercel.json rule).
- **16 scheduled-task `SKILL.md` files** under `Claude Home/Claude/Scheduled/` repositioned — retired offers removed, stats corrected to the canonical four, coach-centric ICP → organizations, booking-link labels fixed (**`/book` = Tech Discovery Call, `/book-tech-call` = Systems Blueprint Session** — the inversion trips people up). Sweep verifies clean across all 91 tasks.
- **35 AEO blog drafts flagged DO-NOT-PUBLISH** rather than bulk-rewritten (prices are prose-embedded; mechanical substitution breaks sentences). Historical per-client project logs and meeting records left intact deliberately — rewriting them would make the vault lie about what was actually sold.
- **`blog.html`** meta description + author bio corrected (`~$100M in assets` now attributed to the wealth management firm, not Hertz). `tools.html` coach references → 0.

---

## Changelog — 2026-08-17b (Progressive draft save on the Blueprint intake)

- **`/mini-blueprint` now autosaves.** Client writes through the new **`intake-draft`** edge fn (v3, verify_jwt=false, service role, self-verifying by `draft_token`) — the browser no longer writes `intake_submissions` directly. Actions: `save` (upsert + recompute `completion_pct`), `resume`, `submit`, `email_link`. Debounced 1.5s on input, immediate on blur and step change, `draft_token` in `localStorage.ko_mb_draft`, resume via `?draft=<token>`. Free navigation between steps is preserved — **do not add blocking validation to `goTo()`**.
- **Draft state lives in `submission_state`, NOT `status`.** `intake_submissions.status` is the ADMIN WORKFLOW enum (`new|reviewed|contacted|proposal_sent|converted|archived`, enforced by `intake_submissions_status_check`). Writing draft state into `status` would overwrite pipeline position. Pre-existing rows have a null `submission_state` and read as submitted.
- **The lead is created only on submit.** Flipping `submission_state` draft→submitted is what fires `fn_sync_intake_to_lead` + `trigger_new_intake_notification`. The edge fn must never create the lead itself or every submission duplicates. Verified live: one intake → 1 inbound lead, 1 deal, **0 prospect-typed rows** (Rule 2 clean).
- **Admin → Forms & Surveys is draft-aware:** `Draft` badge, `Progress` column with idle-days, "Drafts In Progress" stat card + drafts-only filter, a detail banner stating plainly that no lead was created and nothing was sent, "📧 Email them a resume link" (`email_link` returns `{ok:true,skipped:'throttled'|'submitted'}` — 1h throttle), and `fsArchiveStaleDrafts()` for drafts idle 14+ days.
- **Verified** with jsdom against production: autosave badge Not saved→Saved, full field restore on a fresh DOM from `?draft=`, submit → success screen + localStorage cleared, zero window errors; test rows removed (intakes back to 63, inbound leads 185).

---

## Changelog — 2026-08-15e (Email bug, dedupe, invite search, rate ladder)

- **PARTNER WELCOME EMAIL WAS BROKEN AND HAD BEEN FOR A LONG TIME.** `partnerWelcomeEmail()` built its commission line with string concatenation **inside a template literal**, so every welcome email literally printed `' + d.commission_rate + '%`. It also said commissions were "paid via PayPal". Now renders the real rate pulled from `system_settings.commissions` and describes the Stripe/15th-of-next-month flow. If you edit these templates, note the file mixes `${}` and `'+ +'` styles — concatenation only works inside `${...}` arguments, never in the literal body.
- **SECURITY: the Resend API key was hardcoded in `partner-emails` source** (`re_29fo...`). Replaced with `Deno.env.get('RESEND_API_KEY')`. **Rotate that key in Resend** — it sat in plaintext in a deployed function.
- **Stripe onboarding links cannot be extended.** Stripe `account_links` are single-use and expire in minutes by design; there is no week-long option. The admin modal now leads with the partner's **portal link (never expires)** — the portal mints a fresh Stripe session on click — and offers "Email setup invite" via `partner-invite`. The raw Stripe link is kept only for in-person setup.
- **Invite picker is searchable**: type-ahead over clients + leads showing name, email, company; picking one autofills all three and links the record. De-duplicated by email so one person can't appear twice. Shows the current headline rate.
- **DEDUPE (destructive, done 2026-08-15).** `ko_merge_records(table, keep, drop)` walks the FK catalog (31 tables reference leads, 21 reference clients) and repoints every reference, deleting child rows only on unique-violation. Merged 11 inbound-lead duplicate groups + 39 groups where a scraped prospect shadowed a real inbound lead + 2 client duplicate groups. Survivor chosen by most linked history, then completeness, then oldest.
- **Duplicates now prevented:** unique `leads(lower(email)) where lead_type='inbound'` (prospects exempt — the scraper legitimately holds many, per Rule 2) and unique `clients(profile_id)`. A lead and a client MAY share an email; `clients.lead_id` links them, kept fresh by triggers from both sides.
- **Profile duplicates resolved.** Aabri Kimball, Daniel A Martinez and Matt each had a same-name empty shell alongside the real record — merged via `ko_merge_records('profiles', keep, drop)`. **Flory Graciano was NOT a duplicate**: different person, 5 deals + 1 project, sitting on `dknightunicorn@gmail.com` because Daniel uses his own address as a placeholder when a form demands one. Her profile was moved to `flory-graciano@placeholder.invalid` and kept intact.
- **PLACEHOLDER EMAIL CONVENTION:** when a real address is unknown use `name@placeholder.invalid`. `.invalid` is an IANA-reserved TLD that can never resolve, so no drip or notification can accidentally mail Daniel (or a stranger) believing it is the client. Never reuse a real inbox belonging to someone else — it silently merges two people once email-uniqueness is enforced.
- **`profiles.email` is now uniquely indexed** (`profiles_email_key`, lower(email)) alongside `leads_inbound_email_key` and `clients_profile_key`. All three duplicate classes are at zero.
- **Portal rate ladder** rebuilt as a 4-card grid with **marginal** labels (First $50K / Next $200K / Next $500K / Above $750K) instead of overlapping ranges that repeated the same number. Dark-themed calculator input, whole-dollar formatting via `koMoney0()`.

---

## Changelog — 2026-08-15d (Payments ledger, refunds/clawbacks, partner invites)

- **DEAL MODEL — one deal per contracted arrangement, payments stack against it.** Never create a deal per payment; that inflates the pipeline (a monthly retainer would look like 12 wins/yr). `stripe_payments` is now the full payments ledger: `payment_source` (stripe|manual|ach|wire|check|other), `payment_method_label`, `refunded_amount`, `refunded_at`, `refund_reason`, `notes`, `created_by`. Manual payments (check/wire) are inserted with `stripe_charge_id` null.
- **`deal_payment_summary` view** reconciles contracted_value vs gross/net collected, refunded, remaining, payment_count, first/last payment. Stephanie Frank's retainer correctly shows $2,497 contracted against $4,994 collected across 2 payments on ONE deal.
- **LEGACY CONSTRAINT BUG (was live).** `commissions_status_check` (original, `pending|approved|paid|rejected`) still existed alongside the newer `commissions_status_chk`. Two overlapping CHECKs means the strictest wins, so **every `void` / `payable` / `failed` write silently failed** — the admin Void button could never have worked. Dropped the legacy constraint and migrated `rejected` → `void`.
- **Refunds + clawbacks (`trg_handle_refund`).** Raising `refunded_amount` reverses commission automatically: **not yet paid → void** (or reduce pro-rata on a partial); **already paid → a NEGATIVE `clawback` commission** that nets against the partner's next payout. We never demand cash back from a partner. Both paths verified live. Industry standard, and the 15th-of-following-month payout rule already gives a 15–45 day natural holding period so most refunds land before payout.
- **Admin deal detail** gains a Payments Received card (contracted / collected / refunded / remaining + per-payment table, Record Payment, Refund). **Client detail** gains Deals & Payments — lifetime collected, contracted across deals, every deal, and every payment.
- **`partner-invite` edge fn + "Invite from Leads"** on the Partners view: pick an existing lead or client (or type a name/email), creates an **active** partner on the sliding schedule with a portal token, and emails a branded activation invite with their referral link. Re-invites reuse an existing partner row rather than duplicating.
- **Payout destination clarified:** platform balance → the partner's connected account → their bank on a **daily schedule with 2-day delay**. Because the account shape is `stripe_dashboard.type=none`, partners have **no Stripe dashboard** — they see commissions in the Knight Ops portal and money in their bank, never a Stripe balance. It does NOT appear in the 10xUnicorn Stripe account. Verified live with transfer `tr_1U4xWc3cMVgmMIujMeECpGNP`.

---

## Changelog — 2026-08-15c (Stripe import, client links, partner notifications)

- **Deals now link to clients.** Root cause: deals carried `lead_id` (163) but almost never `client_id` (3), and clients only resolve through `profiles.email`. Backfilled lead email → profile → client (**3 → 34 linked**). `trg_link_deal_client` (BEFORE insert/update on deals) keeps it resolved going forward and also inherits `partner_id` from the lead.
- **`stripe-backfill` edge fn** (admin JWT, **dry run unless `apply:true`**) pages `/v1/charges`, upserts `stripe_payments`, matches lead/client by email, creates `closed_won` deals, and accrues commissions through the sliding schedule. Platform charges only — Headliner tenant sales live on connected accounts and are never returned. Admin → Partners → **Import from Stripe** (with a days selector + preview table).
- **Imported 2026-08-15:** 6 charges scanned, 4 deals created + 1 matched to an existing deal, $17,494 tracked. `stripe-backfill` v2 adds **`min_amount` (default $5)** so test charges and card-verification pennies are skipped (the $2 "Subscription creation" charge was the reason).
- **Deal close date comes from the payment.** `trg_deal_close_from_payment` on `stripe_payments` sets `won_at` / `actual_close_date` to the **earliest** non-ignored payment on that deal (so installments don't push the date forward) and flips the deal to closed_won unless it's closed_lost. Fires for the webhook, the backfill, and manual attribution alike.
- **`commissions.deal_amount` and `commission_rate` are now nullable** — a flat manual commission (bonus/adjustment/spiff with no base) previously violated a NOT NULL constraint and could not be saved. `commission_amount` is the only required money column.
- **`partner_events` queue + DB triggers** emit `new_lead` (affiliate_leads insert), `stage_change` (leads.status), `deal_closed` (deals.stage → closed_won), `commission_earned` (commissions insert), `commission_paid` (status → paid). Triggers mean notifications don't depend on any code path remembering to fire them.
- **`partner-notify` edge fn** drains the queue, writes a `partner_notifications` row, and sends a branded Resend email per event type. pg_cron **`partner-notify-5min`** (`*/5 * * * *`). Verified live: all 5 event types fired and all 5 emails delivered. Inactive/emailless partners are marked handled so the queue can't stall.
- **Admin attribution is now bidirectional from every record:** partner detail gains **+ Commission** and **+ Attach Referral** (lead or client); client detail gains **Referred By**; lead and deal detail already had pickers. All routes go through `partner-commissions` so the triggers stay authoritative.
- **Portal:** Stripe-branded gradient CTA, an overview banner that persists until `stripe_payouts_enabled`, and earning tiers changed to **Night Build $10K · Night Build Pro $15K · Enterprise Build $50K+ · Fractional AI Ops $5–8K/mo** (Night Launch removed). Tier payouts are computed from the live schedule via `koBracketTotal()` — never hardcode them or they will contradict the calculator.

---

## Changelog — 2026-08-15b (Sliding commission schedule + master rate)

- **Commission is no longer a flat rate.** Master schedule lives in `system_settings.commissions`: `default_rate` 10, `active_partner_rate` 15, `recurring_term_months` 12, `use_brackets` true, and **brackets 10% ≤ $50K · 7.5% ≤ $250K · 3.5% ≤ $750K · 3% above**. Edit from admin → Partners → **Commission Rates** (live preview included).
- **Brackets are MARGINAL and applied against cash already collected on the deal**, so installments total the same as a lump sum — verified 3 × $25K = one $75K payment. `ko_bracket_total(amount, brackets)` + `ko_commission_for_payment(partner, deal, amount, prior)` return `{amount, rate, bracket_from, bracket_to, mode}`. Verified: $8.5K→$850 · $50K→$5,000 · $75K→$6,875 · $250K→$20,000 · $350K→$23,500 · $750K→$37,500 · $1M→$45,000.
- **Per-partner overrides:** `partners.rate_mode` (`default` follows the schedule, `flat` pins `commission_rate`) and `partners.commission_tier` (`referral` | `active_partner`, the latter earning the flat premium rate). Both verified live.
- **Recurring cutoff:** `ko_within_commission_term()` stops commissions on payments more than `recurring_term_months` after the referral's FIRST commissioned payment. 0 = unlimited.
- **`stripe-revenue-webhook` v2** calls both functions instead of `partner.commission_rate * amount`, and stamps `effective_rate` / `bracket_from` / `bracket_to` on each commission for audit.
- **`partner-portal-data` v3** returns `rate_schedule` (respecting flat/active-partner overrides). The portal renders the tier ladder + a live calculator from that payload — **never hardcode rates in the portal**, or displayed rates will drift from what pays. Browser `koBracketTotal()` mirrors `ko_bracket_total()`; both verified identical across 7 amounts.
- **Public `/partners` page says "up to 10%"** and no longer exposes the ladder or claims PayPal payment. Full breakdown + calculator live in the portal.
- **Decision: cash only, no retainer credit.** Credit and cash are identical on taxable profit, but cash defers outflow to the 15th of the following month (2–6 weeks of float) and keeps top-line revenue higher for borrowing.

---

## Changelog — 2026-08-15 (Partner commissions, Stripe Connect payouts, partner RLS lockdown)

- **SECURITY FIX (was live).** `partners` had anon `SELECT` (`status='active'`) + anon `UPDATE` (`USING true`), so the public anon key could read every partner's **`magic_link_token` and `password_hash`** (= log into any partner portal) and rewrite any partner's `commission_rate`/`paypal_email`. `commissions`, `affiliate_leads`, `partner_notifications` were fully anon-readable. All anon SELECT/UPDATE policies dropped. Public referral links still work via **column-level grants**: `GRANT SELECT (id,slug,name,company,avatar_url,bio,website,status) ON partners TO anon` + policy `status='active'` — RLS can't filter columns, column privileges can. Signup keeps `INSERT` but only on non-privileged columns, so a browser can no longer self-activate a partner at any rate. **Rotate all partner magic links.**
- **Schema** (`partner_commissions_stripe_connect` + follow-ups): `partners` +stripe_account_id/stripe_onboarded/stripe_charges_enabled/stripe_payouts_enabled/stripe_requirements/payout_method(stripe_connect|paypal|relay_ach|manual)/total_paid/total_pending. `commissions` +lead_id/client_id/source/description/currency/stripe_payment_intent_id/stripe_charge_id/stripe_transfer_id/cleared_at/**payable_on**/paid_method/payout_reference/void_reason/created_by; status now `pending|approved|payable|paid|void|failed` (**`rejected` is no longer valid** — `rejectCommission()` maps to `void`). `leads` +partner_id/referred_at, `clients` +partner_id. `affiliate_leads` +stage_override. New `stripe_payments` table (RLS on, **zero policies** = service-role only).
- **Payout rule in the DB:** `ko_commission_payable_on()` — a payment clearing in month M is payable on the **15th of M+1** (verified: Aug 14 → Sep 15, Dec 2 → Jan 15). Stamped by trigger `trg_commission_defaults`, which also derives `commission_amount` from base × rate.
- **`partner_referral_pipeline` view** — derived stage **Lead › Discovery › Blueprint App › Proposal › Closed › Paid** (+Lost) from lead status + furthest deal + `intake_submissions` (blueprint) + `proposals`, with `stage_override` to force it. `security_invoker=on`, revoked from anon/authenticated. Commission rollups match on affiliate_lead_id **or** lead_id.
- **Bidirectional attribution:** `trg_stamp_referred_at` (BEFORE) + `trg_sync_lead_partner` (AFTER — must be AFTER, the FK needs the lead row to exist) auto-create the `affiliate_leads` row when a lead is tagged to a partner; `trg_sync_affiliate_lead` stamps `leads.partner_id` in reverse. `trg_recalc_partner_totals` keeps partner rollups accurate.
- **Edge fns (all verify_jwt=false, self-verifying):** `partner-commissions` v1 (admin JWT + `profiles.role` in admin/super_admin — manual commission CRUD, set_status, assign_deal_partner, assign_lead_partner, set_referral_stage, referral_pipeline, **payout_run**, unmatched_payments); `partner-portal-data` v2 (token-gated portal reads/writes + `request_link` email login, no enumeration; never returns token/hash; profile allow-list excludes commission_rate); `partner-stripe-connect` v1 (Express onboarding, status sync, login links, **pay_commissions** transfer with idempotency key derived from the commission set); `stripe-revenue-webhook` v1 (charge.succeeded → `stripe_payments` → closed_won deal → commission on **cash collected**); `partner-signup` v1 (forces status=pending / rate=10).
- **HEADLINER ISOLATION (same Stripe account, different platform).** Headliner uses `type=standard` connected accounts with no metadata. Knight Ops partners are `type=express` **and** tagged `metadata.ko_platform='knight_ops_partners'`. `assertKoAccount()` refuses any account missing that tag, so a Headliner account can never receive a partner commission. The webhook also ignores any event with `event.account` set (connected-account events belong to the other platform).
- **Admin:** Partners view gains + Add Commission (full manual editor: base × rate or flat override, deal/lead links, cleared date, payable date), 💰 Payouts Due (groups everything due, pays via Stripe or marks manual), **Referral Pipeline** card, **Cleared Stripe Payments — Needs Attribution** queue. Deal detail gains a Partner Attribution card (picker + one-click commission); lead detail gains Referred By. Partner detail gains Stripe Connect status + onboarding link.
- **Portal:** referral tracker with stage counters + per-referral commission earned/owed, commission table showing **Payable On**, Getting Paid card with Stripe Connect onboarding and next payout date. All data now via `partner-portal-data`; zero direct table reads remain.
- **Stripe secrets are set** (`STRIPE_SECRET_KEY`, `STRIPE_REVENUE_WEBHOOK_SECRET`). Account creation is verified working live.
- **CONNECT ACCOUNT SHAPE — do not "simplify" this to type=express.** `partner-stripe-connect` v5 tries `SHAPES` in order and keeps the first Stripe accepts. On this platform the winner is **`recipient_no_dashboard`**: `controller.losses.payments=stripe`, `fees.payer=account`, `requirement_collection=stripe`, `stripe_dashboard.type=none`, capabilities `transfers`+`card_payments`, no `type`. Resulting account reports `type:"none"`. Rejected alternatives and why: `type=express` and `stripe_dashboard=express` both force the PLATFORM to accept loss liability, which requires acknowledging responsibilities in the Connect **platform profile that is shared with the Headliner platform on this same Stripe account**; transfers-only (no card_payments) returns "platform needs approval". Verified live: acct_1U4snw44ffDW18yd created with the ko_platform tag.
- **Idempotency keys are params-derived** (`idemKey()` = prefix + SHA-1 of params). A fixed key wedged onboarding for 24h after a failed attempt with older params — do not go back to a static key.
- **Connect site links: DONE** (2026-08-15, all six point at knightops.biz/partner-portal). Live onboarding URLs now generate — verified `https://connect.stripe.com/setup/c/acct_1U4snw44ffDW18yd/...`. Headliner unaffected: its Standard accounts connect via OAuth (`application: ca_Uxx3...` on its Connect webhook) and never use these links; the Stripe settings page confirmed the liability banner applies to **1** account (the KO test account).
- **ISOLATION GUARD VERIFIED LIVE.** Pointed a partner row at Headliner's 10xUnicorn account (`acct_1T8LvwBiXnUmQZ6k`) and all three partner actions (`status`, `onboard_start`, `dashboard_link`) refused with the ko_platform error. A Headliner account cannot be onboarded, linked, or paid through this system.
- **Connect fees:** our accounts set `controller.fees.payer='account'`, which maps to Stripe's "Stripe handles pricing for your users" column = **Included, no platform fees**. Worst case (if the other column applies) is $2/monthly-active-account + 0.25% + 25¢ per payout = ~0.55% on a $750 commission, ~0.26% on a $35K one. Either way negligible; the 15th-of-month batching is already fee-optimal (one active month + one payout fee per partner per month). Confirm the column with Stripe support before high volume.
- **Stripe webhook endpoint** on `charge.succeeded` → `/functions/v1/stripe-revenue-webhook` must exist for cleared-payment→deal automation.
- **Verified:** full pipeline walk lead→discovery→blueprint→proposal→closed→paid; commission $749.70 payable 2026-09-15; anon denied on partners/commissions/affiliate_leads/partner_notifications/stripe_payments; anon slug resolution + referral INSERT still work; privilege-escalation INSERT rejected; webhook rejects unsigned/forged events (0 rows landed); admin UI renders with clean console. All test data removed (deals back to 174).

---

## Changelog — 2026-08-14 (Knight Ops Recorder — Loom replacement)

- **Chrome extension** `chrome-extension/` (MV3): records screen / window / tab / camera, mic + system audio mixed via AudioContext, draggable camera bubble, draw-on-screen, countdown, pause/resume, screenshots (full tab + area crop). MediaRecorder runs in an **offscreen document** (service workers can't hold media). Uploads **stream during recording** as 8MB R2 multipart parts, so stopping is near-instant. Auth = `KO_VIDEO_SECRET` bearer, stored in `chrome.storage.local` via `options.html`.
- **Storage** = Cloudflare **R2 bucket `knight-ops-videos`** behind Worker `ko-video-worker/` (R2 binding, so no S3 keys exist to leak). Routes: `/upload/init|part|complete|abort|simple` (bearer-gated) and `GET /f/<key>` with full **Range-request** support for scrubbing. Deploy with `npx wrangler deploy` — **not** the site's git-push flow.
- **Tables** (migration `create_video_system`): `videos`, `video_transcripts`, `video_comments`, `video_reactions`, `video_views`. RLS on all five: staff roles read/write, **anon fully denied** (verified: anon SELECT `[]`, anon INSERT 401). Every public read goes through `video-api`, which enforces visibility / expiry / password server-side.
- **Edge fns** (all verify_jwt=false): `video-manage` v1 (create/finalize/update/delete/list/detail/retry_transcript/config — accepts EITHER the extension secret OR a staff session JWT), `video-api` v1 (watch/captions/comment/react/view — public, rate-limited comments, emails Daniel on each comment), `video-transcribe` v1 (Deepgram **nova-3** → words/paragraphs/VTT/SRT, then Claude sonnet writes title/summary/chapters/action_items), `video-serve` v1 (injects real OG tags into the static player shell so Slack/iMessage previews work).
- **Pages:** `watch.html` → `/v/:slug` (speed 0.25–4×, chapter markers on the scrubber, click-to-seek transcript with search + live highlight, captions, timestamped threaded comments, emoji reactions, PiP, download, embed builder, view analytics, password gate); `embed.html` → `/embed/:slug`; `videos.html` → `/videos`; **admin.html → Content → Videos** (grid, detail with visibility/password/expiry/embed controls, engagement stats, transcript, deep-link `#videos/{id}`).
- **vercel.json**: surgical additions only — two rewrites (`/v/:slug`, `/embed/:slug` → `/api/v`) above the catch-all, plus Content-Type and `frame-ancestors *` headers for embeds.
- **Setup still required by Daniel:** `wrangler login && wrangler deploy && wrangler secret put UPLOAD_SECRET`, then Supabase secrets `KO_VIDEO_SECRET`, `KO_VIDEO_WORKER`, `DEEPGRAM_API_KEY`. Full runbook: `ko-video-worker/DEPLOY.md`.
- **Cost:** R2 is $0.015/GB/mo with zero egress; Deepgram ~$0.26/hour of video. Replaces Loom Business at $17/seat/mo.

---

## Changelog — 2026-08-13 (Contract prompt + positioning shift)

- **New Contract Prompt generator** in `admin.html` (`generateContractPrompt`, `contractPromptUI`, `copyContractPrompt`). Available on Application detail and Lead detail. Designed to run in the SAME chat as the proposal so the agreement inherits that exact scope, pricing, and phase schedule.
- **Shared prompt constants** added above `// ═══ PROMPT GENERATORS ═══`: `KO_LANGUAGE_RULES`, `KO_BRAND_PRIORITY`, `KO_CONTINUITY_TERMS`, `KO_PHASING_LANGUAGE`. Edit these to change proposal, blueprint, and contract behavior in one place.
- **Continuity standard codified:** 6 months Included Continuity from launch on every build (concurrent for Fractional AI Ops engagements). Ongoing updates, feature requests, quarterly feature push, and quarterly strategy session require the $1,000/mo Continuity Plan.
- **Tagline changed** to "Create Your Impact on Autopilot." All "Built Overnight. Scaled Forever.", overnight, 48hr, and 24hr delivery claims removed from prompts and public pages.
- **Brand priority rule:** proposals and blueprints now pull the client's palette and typography from their website or a provided screenshot first; Knight Ops black/gold is subtle accent only, full fallback only if no client brand source exists.

## Changelog - 2026-08-07 (Diamond Crafts live application asset repair)

- **Scoped static application:** `/app/index-msjnuuz6` now rewrites to the tracked `diamond-crafts-flooring-live.html`, leaving every other `/app/:file` upload on the existing Supabase `serve-app` path.
- **Deployment-safe assets:** the Diamond Crafts logo, eight used portfolio images and downloadable project guide are stored under `/diamond-crafts-assets/` and referenced with root-absolute URLs.
- **Root cause:** the uploaded HTML used relative `assets/...` paths, which resolved under `/app/assets/...`; the flat `app_files` slug service cannot resolve that nested local directory structure.
- **Scope guard:** do not broaden this rewrite or replace the generic app-file proxy. Future uploaded multi-asset HTML should either use hosted root-absolute asset URLs or be deployed as a scoped static application using this pattern.
- **Required verification:** confirm all page images have non-zero natural dimensions, the guide returns a PDF, desktop/mobile have no horizontal overflow and the console is clean.

---

## Changelog — 2026-07-17b (The Shift — /shift guided breakthrough experience)

- **New page `/shift` (shift.html):** guided breakthrough experience (12 sections, 38 inputs, Journey + Mirror + Progress views). Served by the existing catch-all `/:path` → `/:path.html` rewrite — **vercel.json unchanged**.
- **Auth model — deliberately NOT Supabase Auth.** Token links only (same pattern as `project_intake_tokens`/`resolve-link`), so Shift participants never enter `auth.users` and never collide with admin/developer/sales/marketing/client roles or `roleGateNav()`. No passwords, no reset flow.
- **Anti-hijack rule:** `start` with a NEW email returns the token inline (frictionless first run, nothing to steal yet). `start` with an EXISTING email returns `{status:'returning'}` and emails the resume link instead — typing someone else's address never yields their journey.
- **Tables (migration `create_shift_system`):** `shift_users` (email, token, lead_id soft link, guide_calls/guide_day rate limit), `shift_sessions` (one row per user, full client state as `jsonb`), `shift_events`, `shift_deletions` (hashed audit surviving cascade). RLS enabled with **zero policies** — anon and authenticated fully denied, service role only. Verified: rows present, anon REST returns `[]`.
- **Portability by design:** all tables prefixed `shift_`, and `shift_users.lead_id` is intentionally **not** a foreign key. Spinning The Shift out to its own project later is a dump of 4 tables, not schema surgery.
- **Edge fns (both verify_jwt=false):** `shift-data` v2 — start/load/save/event/resend_link/delete_all; 400KB state cap; Resend branded resume email from daniel@knightops.biz. `shift-guide` v1 — server-side Anthropic proxy (claude-sonnet-4-6) using the existing **ANTHROPIC_API_KEY** secret so the key never reaches the browser; **40 messages/user/day** cap; crisis-safety instruction (988 / 741741) added to the system prompt.
- **Client sync:** `save()` still writes localStorage first (instant), then debounces a cloud save at 1.2s so the app's 36 `save()` call sites collapse into one request. `boot()`/`boot2()` are now invoked by an async initializer after `SHIFT.init()` pulls cloud state. Works fully offline and fully logged out; badge in the topbar shows Not saved / Saving / Saved.
- **Privacy:** plain-language notice in the save gate, and a self-service double-confirm **Erase everything** that hard-deletes (cascade) — this content is personal reflective writing, not lead-form data.
- **Lead capture (Rule 2 safe):** first save creates/updates a lead with `source='website'`, `lead_type='inbound'`, tag `the-shift`, `added_by='the-shift'`. Verified 0 prospect-typed rows. Existing leads are tagged rather than duplicated.
- **Verified:** 4 script blocks parse; jsdom boot suite 10/10 on both the token path and the fresh-visitor path with zero runtime errors; live `/shift` byte-identical to source (164,440 bytes); full E2E start → save → resume → delete; RLS denial proven; all test rows removed.
- **Cost note:** a complete journey serialises to ~574 bytes, so this rides on the existing Knight Ops project rather than a new $10/mo Supabase project.
- **Open:** if The Shift gets its own brand, alias a domain to the SAME Vercel project (no new infra). `shift.knightops.biz` or a bought domain both work.

---

## Changelog — 2026-07-17 (Continuity & Team system)

- **Backend (already deployed):** migrations `continuity_team_system` + `team_role_policies` — new tables `team_members` (role: admin/developer/sales/marketing/successor/backup_support, system_access, profile_id), `project_resources` (per-project resource visibility overrides), `system_settings` (jsonb KV: `successor`, `eden`), `eden_responses`; `projects` continuity columns (supabase_ref, supabase_org, build_folder, env_manifest jsonb, compliance_tier standard/hipaa/soc2/iso27001, domain_notes, spec_doc_url, continuity_override, brief_sent_at); `project_members` extended (team_member_id, client_visible, client_title); `resources` extended (category, is_global, client_visible_default, sort_order); role-scoped RLS for `profiles.role` developer/sales/marketing.
- **Edge fns:** `hub-data` v3 (new actions `continuity` — full ownership payload for the client hub — and `export_code` — streams the project repo as a ZIP; needs **GITHUB_TOKEN** Supabase secret for private repos), `team-access` v1 (verify_jwt=true; grant_access/revoke_access/resend_invite → creates auth user + profile role + invite email), `eden-respond` v1 + pg_cron `eden-respond-5min` (AI answers client emails to eden@knightops.biz with live project visibility).
- **Storage/content:** `resources` bucket made public; 7 branded continuity/security PDFs seeded in `resources` (`library/` path, is_global=true): ownership guide, backups, MFA, HIPAA/SOC2/ISO 27001 outlines, continuity plan.
- **client-hub.html:** new 🛡 Ownership tab — "You Own This Project" (repo/Vercel/Supabase/domain/live/spec + env-key manifest), Export Everything (ZIP codebase download via export_code), Team & Contacts (client-visible project members + Eden + successor block), collapsible Developer Handoff Prompt with copy, Resources & Security Docs list.
- **admin.html:** System Settings gains 👥 Team tab (team_members CRUD, role select, grant/revoke/resend via team-access, active toggle) and 🛡 Continuity tab (global successor form → system_settings upsert, Eden read-only info, global Resource Library default-visibility toggles). Project detail gains 🛡 Continuity & Ownership card: status checklist (repo/Vercel/Supabase/contact/brief), editable continuity fields + env-manifest editor, team assignment (project_members ↔ team_members with client_visible/client_title), per-project resource visibility (project_resources upsert), Mark Continuity Brief Sent.
- **Role-gated nav:** admin auth now reads `profiles.role` — admin/super_admin full; developer → Projects/Tasks/Features & Bugs; sales → Leads/Deals/Clients/Bookings/Forms; marketing → Blog/Resources/Education/KPIs; anything else → /portal. `roleGateNav()` hides nav + guards `activateView()`; RLS enforces the data layer.
- **Security amendment (same day):** `hub-data` v4 auth-gates `export_code` — requires a Supabase session JWT (admin/super_admin or the linked client); token links can NO LONGER download code (`continuity` returns can_export:false + portal_url for token calls). client-hub Export card replaced with "🔐 Full Codebase Export — sign in to your client portal" linking to /portal.
- **portal.html:** Overview gains 🛡 Ownership & Continuity card — per-project "⬇ Download complete codebase" button (authenticated POST to hub-data export_code with the session access token → ZIP blob download, JSON reason on failure).
- **admin.html:** Continuity card gains 📧 Send Continuity Brief — modal with editable To/Subject/HTML-body preview (client email resolved via projects→clients→profiles; body lists the project's currently-visible global resources, portal link, Daniel/Eden/continuity-partner contact block) → `send-plain-email` (BCC daniel@knightops.biz) + stamps `projects.brief_sent_at` on success. Mark-sent button kept as manual fallback.
- **Successor:** `system_settings.successor` = Tim Wolfe (tim@timwolf.com, 405-505-6221) — used in client hub, portal, and the brief email (14-day activation note).
- **portal.html Resources:** list cards AND the resource detail view now show 👁 View (opens `resource.url` in a new tab) + ⬇ Download (fetch→blob→anchor with filename from url; falls back to opening the url) whenever the resource has a url (`resBtns()`/`resDownload()`). Detail's legacy `file_url`-only logic replaced (resources table has NO `file_url` column — global docs live in `url`).
- **New public page `/resources` (resources.html):** branded Resource Library — queries `resources` where is_global=true via anon key, grouped by category (continuity → "Business Continuity & Ownership", security → "Security & Access", support → "Support & Delivery", pricing → "Hosting & Pricing", compliance → "Compliance Readiness") with View/Download per doc + /book CTA. RLS blocks anon SELECT on `resources`, so the page ships a static fallback array of the 10 public-bucket PDFs (used on query error/empty — currently the active path). No vercel.json change needed (catch-all `/:path` → `/:path.html` rewrite serves it).
- **build_folder edit confirmed:** the admin 🛡 Continuity & Ownership card already includes the editable "Build folder (Mac)" field (`contInput` build_folder), saved with the other continuity fields — no change needed.
- **Repos flipped private (via API today):** `be-a-better-brand` + `planet-calm` are now private — the **GITHUB_TOKEN** Supabase secret is REQUIRED for their portal codebase export (`hub-data` export_code) to work.
- **Admin Resources = full library CRUD:** admin.html Resources view now has add/edit/delete with Category select (continuity/security/support/pricing/compliance/administrative/general), Sort order, and toggles for `is_global` ("Library resource"), `client_visible_default`, and `public_visible` ("Show on public /resources page"); rows show Library/Public badges + View/Download; files go in the `resources` bucket (`library/` path) or paste any URL.
- **Public /resources is now LIVE-driven by the DB:** new anon RLS lets the public page SELECT `resources` where `is_global=true AND public_visible=true` (ordered by sort_order; 'administrative' + 'general' category groups added; unknown categories group under "General"); the static fallback array remains only as an emergency backup.
- **Master Guide v2:** `knight-ops-master-guide.pdf` replaced with the comprehensive `knight-ops-master-guide-v2.pdf` (resources.html fallback + DB row point at v2).

---

## Changelog — 2026-07-09 (Claude AI Assistant Workshop funnel)

- **New pages:** `/workshop` (registration, date-based tier switching + live countdown), `/workshop-confirmed` (Stripe redirect target: Google/Apple/Outlook add-to-calendar + prep checklist), `/workshop-invite.ics` (both days, 11am–1pm PT Jul 23–24), `/workshop-zoom` (redirect page — **TODO: paste real Zoom URL into `ZOOM_URL` const**, currently shows "room opens soon").
- **Event:** "Use Claude to Build Your AI Assistant" — live 2-day, Thu 7/23 + Fri 7/24 2026, 11:00–1:00 PT, 20-seat cap.
- **Pricing tiers (say "Early Bird", NEVER "Founding"):** Early Bird $197 ends Fri 7/10 midnight PT → Standard $249 ends Sun 7/19 midnight PT → Final $297 until event start. Boundaries in `workshop.html` TIERS array (UTC: 07-11T07:00Z / 07-20T07:00Z / 07-23T18:00Z).
- **Stripe (LIVE, 10xUnicorn acct):** product `prod_Ur6oPVY98cyVmG`; payment links (each capped 20 completed sessions, metadata `workshop=claude-ai-assistant-2026-07` + `tier`): Early Bird https://buy.stripe.com/5kQdR84XB5z49Rz9b08g00T · Standard https://buy.stripe.com/7sYbJ0blZ7HcbZHevk8g00U · Final https://buy.stripe.com/9B6dR8ahVf9EbZHevk8g00V. All redirect to `/workshop-confirmed?session_id={CHECKOUT_SESSION_ID}&tier=...`.
- **Auto confirmation email:** Stripe webhook `we_1TrOo0BiXnUmQZ6kqPEA6Jvj` (checkout.session.completed) → edge fn **`workshop-stripe-webhook`** v2 (verify_jwt=false, HMAC signature verification w/ endpoint signing secret in code). Filters by metadata, inserts `workshop_registrations` (migration `create_workshop_registrations`, RLS locked to service role, idempotent by stripe_session_id), emails attendee (branded, from daniel@mail.knightops.biz, reply-to daniel@knightops.biz, calendar links + Claude-desktop-app/Fathom prep) + owner seat-count alert (N/20, warns at cap). Optional hardening: add `STRIPE_SECRET_KEY` Supabase secret → fn re-fetches session from Stripe API.
- **Particles:** workshop pages use tuned network (speed 0.24, link alpha 0.32 w/ variable width, radii 0.8–3.2).

---

## Changelog — 2026-07-03b (Auto-fix loop fix — claim timestamp + attempt cap + mandatory completion)

- **Root cause of looping bug fixes:** `bug_reports` has no `updated_at`, so the orchestrator's "fixing" cooldown `coalesce(updated_at,created_at)` silently fell back to `created_at` (always stale) — a bug claimed `fixing` but never moved to `fixed` (desktop build finished the code but skipped the status update) was re-picked every run.
- **Schema:** migration `add_autofix_started_at` adds `autofix_started_at` to `bug_reports` + `feature_requests`.
- **`api-autofix` v6 (server-side guards):** skips items already fixed/closed (or built); CLAIMS with `status='fixing'` + `autofix_started_at=now()` + `autofix_attempts+1`; enforces a 20-min claim cooldown + a 3-attempt cap (then sets `autofix_error='max_attempts'`, emails Daniel with action buttons, and stops); reverts status to `new`/`approved` on every failure path so nothing is left stuck in `fixing`. `force:true` bypasses guards for manual re-runs.
- **Orchestrator scheduled task updated:** STEP 0/STEP 1 queues use `autofix_started_at` + `autofix_attempts < 3`; the Terminal claim records `autofix_started_at` + increments attempts; and the desktop bug-fix AND feature-build prompts now END with a MANDATORY `report-completion` curl (marks fixed/built + summary + emails the client 👍/👎) instead of a raw status update — closing the loop for desktop builds too. Bugs past 3 attempts are surfaced to Daniel, not retried.
- **Commit-marker idempotency (`api-autofix` v7):** every fix/build commit now carries a unique marker (`[ko-fix:<id>]` / `[ko-feat:<id>]`). Before fixing, api-autofix scans the repo's recent commits for that marker — if the fix already shipped (even if a prior run forgot to update the DB), it marks the item done + skips. The orchestrator's desktop prompts embed the same marker and pre-check for it. Fast, repo-truth verification that a bug was already completed.
- **RLS was the deeper root cause (Vision Espresso loop):** the admin DB blocks RAW writes to `bug_reports`/`feature_requests` from the anon key, so a desktop build that PATCHed the row directly to mark it fixed was rejected — status never flipped → loop. FIX: **`report-completion` v2** runs as service role (bypasses RLS) and is now the ONLY write path the desktop uses — for shipped (fixed/built) AND for unclaim-to-new/approved (new `status` + `note` params). The orchestrator prompt forbids raw desktop PATCH/SQL and routes every status write through `report-completion`. Note: git-less projects (e.g. Vision Espresso deploys via `vercel deploy --prod`) can't use the commit-marker, so they rely on this. Verified: `report-completion` marked the stuck Vision Espresso bug `fixed` (write succeeded despite RLS); loop stopped.
- **Verified:** `api-autofix` on a fixed bug returns `skipped:already_fixed`; the stuck `fixing` bugs were cleared (0 stuck now).

---

## Changelog — 2026-07-03 (Status control, client thumbs up/down loop, build contract, transcripts)

- **Admin inline status control.** Every bug + feature in the global Features & Bugs module AND the per-project cards now has a status `<select>` (bugs: new/fixing/fixed/closed; features: pending/approved/revisions/rejected/building/built) → `setItemStatus()` writes directly. Setting fixed/built fires the completion notifier; moving off it clears `completion_notified_at` (re-arms so a later completion re-notifies). `statusSelect()`, `BUG_STATUSES`/`FEAT_STATUSES`.
- **Client completion report + 👍/👎.** `notify-completion` v2 mints a `feedback_token`; the client's completion email shows a brief "What we did" report + 👍 Yes / 👎 Not quite. New edge fn **`completion-feedback`**: 👍 sets `client_rating='up'` (bug→closed) + pings Daniel; 👎 serves a branded form (details + screenshot upload to bug-attachments) → sets `client_rating='down'`, appends `client_feedback` + screenshots, **reopens** (bug→new / feature→revisions), re-arms the notifier, emails Daniel the details + deep-link. Admin shows the 👍/👎 badge + client feedback on every card. Migration `add_client_feedback_fields` (feedback_token, client_rating, client_feedback).
- **Build-completion contract.** New **`report-completion`** edge fn: a build (desktop Claude Code or any worker) POSTs `{kind,id,summary,commit_url}` when done → sets status fixed/built + summary + commit → fires the client/owner completion emails. `feature-action` v5 approve stamps the contract into `admin_notes` so orchestrator-built features carry "when done, call report-completion" automatically; admin has a 🛠 copy-contract button per item.
- **Transcript enrichment.** `bug-report` v5 + `feature-request` v3: on submit, any Loom/YouTube URL in the description with no transcript is auto-transcribed via `transcribe-url` and appended to the description (persists → used by autofix vision + desktop builds + admin). 13s timeout, best-effort.
- **Edge fns:** `notify-completion` v2, `completion-feedback` v1 (new), `report-completion` v1 (new), `feature-action` v5, `bug-report` v5, `feature-request` v3. All verify_jwt=false.

---

## Changelog — 2026-07-02b (Attachment-aware autofix + client uploads + completion emails)

- **Autofix now uses screenshots/files (vision).** `api-autofix` v5: a bug/feature's `attachment_paths` (public `bug-attachments` bucket = persistent + re-readable at build time) are passed to Claude sonnet as image blocks (png/jpg/gif/webp) + document blocks (pdf) in BOTH the file-selection and fix steps. Prompts treat screenshots as the primary evidence of which page/element/error is meant, and set `confident=false` when ambiguous. `attachBlocks()` + a `claude()` wrapper that auto-retries text-only if an attachment URL is unfetchable (never hard-fails).
- **Client uploads encouraged.** `client-hub.html` bug + feature forms now have a prominent "📸 Screenshots / files (highly recommended)" multi-upload (images/pdf/docs) → `hubUpload()` posts to `bug-attachments` (`hub/<token>/…`) and passes `attachment_paths` to `bug-report`/`feature-request`. (feedback.html already had attachments.)
- **Attachments visible in admin.** `attHtml()` renders image thumbnails + file chips (public bucket) in the global Features & Bugs module rows and the per-project ✨/🐞 cards, so you can see the evidence before approving/building.
- **Completion emails (owner + client).** New edge fn **`notify-completion`** (verify_jwt=false) + DB triggers `trg_bug_completion` (bug status→fixed) / `trg_feature_completion` (feature status→built) via pg_net. On completion it emails the CLIENT a friendly done note (reporter/requester email, else project client) AND Daniel a technical note (summary + commit + deep-link). Idempotent via `completion_notified_at` (migration `add_completion_notified_at`). `api-autofix` v5 dropped its own success email so completion is single-source (no owner dupes). Covers BOTH API autofix and desktop-built completions.
- **Edge fns:** `api-autofix` v5, `notify-completion` v1 (new). Backfilled `action_token` on all existing bugs.

---

## Changelog — 2026-07-02 (Deep-links, favorites, Features & Bugs module, link types, email actions)

Admin UX + client-link expansion. All in `admin.html` + one new page + edge fns; deployed via git push (commits `d69d6ec`, `385e5f3`).

- **Record-level deep-links.** `admin.html` routing now deep-links every record: `#leads/{id}`, `#clients/{id}`, `#deals/{id}`, `#tasks/{id}`, `#projects/{id}`, plus `#projects/{id}/bug/{bugId}` and `#projects/{id}/feature/{featureId}` (auto-scrolls + highlights the card). Central `routeFromHash()` + `setRecordHash()` + `_ROUTING` guard; every `show*Detail()` pushes its hash; `hashchange`/`popstate` restore it. Survives refresh + back/forward. Feature/bug emails now link to these hashes.
- **Favorite projects.** `projects.is_favorite` (bool, migration `add_projects_is_favorite`). Star toggle in the projects list + detail header (`favStar()`/`toggleProjectFav()`); favorites sort to the top in `renderProjects()`.
- **Features & Bugs module (Delivery).** New nav child + `#v-featbugs` view + `loadFeatBugs()`: all `feature_requests` + `bug_reports` across every project, with type/status/project/search filters. Multi-select + bulk "Approve & build selected", "Approve & build ALL pending features", "Reject selected"; per-row inline "Add details / revise" → approve-with-notes / request revisions (features) or save notes (bugs). Bulk approve loops `feature-action`; bug reject sets `status='closed'`.
- **New permanent link types (4).** `project-link` v2 + `LABELS`/`PATHS` extended: `all_in_one`, `credentials`, `proposal_invoice`, `portal_access` (all → `/client-hub`), alongside existing `features_bugs`/`files_details`. Admin `loadProjectLinks()` renders all 6 rows (generate/copy/open/expiry/revoke).
- **`client-hub.html` (`/client-hub?t=`).** New all-in-one client page: tabs Bugs & Features (reuses `bug-report`/`feature-request` by token), Files (`project-files-view`), Credentials & Access (new `hub-data` → inserts `login_credentials.added_via_token`), Proposal & Invoices (`hub-data` load → invoices by project_id + proposals by lead_id). Default tab chosen by `link_type` via `resolve-link`. New edge fn **`hub-data`** (load + submit_credential; verify_jwt=false).
- **Email-draft composer (#6).** `📧 Draft email` button on every link row → `emailLinkDraft()` opens the in-app editor prefilled per-type (`EMAIL_LINK_TEMPLATES`), editable, `sendLinkDraft()` → `send-plain-email` from daniel@knightops.biz.
- **One-click email actions (#4).** `feature-request` v2 email now has Approve / ✋ Reject / 📝 Add-note buttons (GET links to `feature-action`) + deep-links to `#projects/{id}/feature/{id}`. `feature-action` v4 adds `note` action + branded note-form page. `bug-report` v4 stamps each bug with `action_token` (migration `add_bug_reports_action_token`) and adds 📝 Add-note / ✋ Close / Open-in-admin (deep-link) buttons per bug; new **`bug-action`** edge fn (note/close/reopen GET + note form). Auto-fix trigger preserved.
- **Autofix review emails (#4b).** `api-autofix` v3: the "needs your review" (low_confidence) email now carries one-click Approve/Reject/Note (features) or Note/Close/Open (bugs) buttons via `actionBtns()`. Backfilled `action_token` on all existing `bug_reports`.
- **End-of-day pending digest.** New edge fn **`pending-digest`** (verify_jwt=false): emails a branded queue of pending feature requests (status pending/error) + open bugs (status new/fixing) with one-click action buttons + deep-links, and a link to `#featbugs`. Sends ONLY when the queue is non-empty. pg_cron job **`pending-digest-6pm-pt`** `0 1 * * *` (= 6pm PT / PDT; shift to `0 2 * * *` if PST). Calls the fn via pg_net with the anon apikey (same pattern as roundtable reminders).
- **Edge fns touched:** `project-link` v2, `hub-data` v1 (new), `feature-action` v4, `feature-request` v2, `bug-report` v4, `bug-action` v1 (new), `api-autofix` v3, `pending-digest` v1 (new). All verify_jwt=false.

---

## Changelog — 2026-07-01 (Client Feedback + API Autofix system)

Permanent per-project client links + an API-first bug-fix / feature-build engine.

- **Permanent client links (2 per project).** Admin → project detail → "🔗 Permanent Client Links" generates two never-expire links (expiry configurable Never/7/30/90 + revoke): Features & Bugs (`/feedback?t=<token>`) and Project Files (`/project-files?t=<token>`). Backed by `project_intake_tokens` (+ `link_type`). Edge fns: `project-link` (create/list/revoke/set_expiry), `resolve-link` (validate → project name/brand).
- **feedback.html** (`/feedback?t=`): tabs Bug / Feature / Your Submissions. Auto-saves drafts to localStorage; "Your Submissions" shows live status and lets the client EDIT anything not yet completed (`my-submissions`, `edit-submission`). Capture toolbar on both forms: 🎤 mic dictation (Web Speech), 📋 paste transcript, 🎬 pull transcript from a Loom/YouTube URL (`transcribe-url`, optional TRANSCRIBE_API_KEY for other sources). Uploads → bug-attachments bucket.
- **project-files.html** (`/project-files?t=`): client sees files Daniel marks visible + their own uploads; download + upload (client-files bucket). Admin controls visibility with the 👁 Share toggle per file in Project Files (`admin-file-share` upserts a `project_files` row, client_visible). Edge fn `project-files-view` (load/add_file).
- **Feature requests** (`feature-request`): client submits → emails Daniel (dknightunicorn@gmail.com + daniel@knightops.biz) with an Approve link + admin link. Admin → "✨ Feature Requests": Approve & build / Request revisions (Daniel types notes, no client email) / Reject (`feature-action`). Only status='approved' ever builds.
- **Bugs** (`bug-report`): auto-prioritized. Admin → "🐞 Bug Reports" lists them per project.
- **API AUTOFIX (cloud, no desktop app).** Edge fn `api-autofix` {kind:bug|feature,id,background?}: Claude API (claude-sonnet-4-6) plans → reads repo files via GitHub API → writes the fix → commits (single commit via git data API) to the repo's default branch → Vercel auto-deploys → emails Daniel. Confidence gate: if not safe it sets autofix_error='low_confidence' and emails instead of committing. Event-driven: `bug-report` fires it on submit, `feature-action` fires it on approve (both via EdgeRuntime.waitUntil). Needs projects.repo_url + two Supabase secrets: ANTHROPIC_API_KEY (set) and **GITHUB_TOKEN (MUST be added — repo write for org 10xUnicorn)**. Until GITHUB_TOKEN is set it returns no_github_token and the orchestrator falls back to desktop Claude Code.
- **Schema:** `projects` +repo_url,repo_subpath,deploy_cmd,autofix_enabled. `bug_reports` +fix_summary,fix_commit_url,fixed_at,autofix_attempts,autofix_error. `feature_requests` table (pending→approved/revisions/rejected→building/built) +approval_token. `project_files` +client_visible,added_via_token,storage_path. `client-files` public bucket.
- **Orchestrator v3** (`knight-ops-autobuild-orchestrator`, now **every 15 min** with a cheap count-gate that stops instantly when idle): STEP 0 minimal check; STEP 1 bug SAFETY-NET only (bugs already fix INSTANTLY on submit via the event-driven api-autofix — resolve+backfill projects.repo_url via Vercel/vault, retry, desktop fallback on low_confidence/no_token); STEP 2 approved features → **DESKTOP Claude Code** (features are NOT auto-built by API); STEP 3 net-new dashboard builds → desktop, only in 4-hour slots.
- **Feature routing:** `feature-action` approve NO LONGER fires api-autofix — approved features build via desktop Claude Code (orchestrator STEP 2). Admin "Approve & build" prompts for optional build details appended to `admin_notes`.
- **Admin project detail additions:** `➕ Add a Module (injection prompt)` card — pick any of the 24 `dashboard_modules`, generate a project-tailored module-injection prompt via edge fn `module-injection` (Claude sonnet + universal injection framework + project context; `dashboard_modules.injection_spec` holds curated specs, community seeded), copy/download. `🔧 Recent Fixes & Builds` activity feed (fixed bugs + built features, newest first, commit links). `⚙️ Auto-fix repo` control in the Permanent Links card — set/auto-detect `projects.repo_url` (edge fn `detect-repo` matches the linked Vercel project via VERCEL_TOKEN, manual fallback) + autofix toggle; also on the project editor.
- **New edge fns this wave:** `module-injection`, `detect-repo`, `admin-file-share`, `my-submissions`, `edit-submission`, `transcribe-url`. Optional secrets: `VERCEL_TOKEN` (repo auto-detect), `TRANSCRIBE_API_KEY` (any-video-URL transcripts). `dashboard_modules` +`injection_spec`.
- **Client Project Details hub (renamed from "Client Mockup Approval").** That card now holds a **🔌 Build target** block: GitHub repo (auto-fix), **Vercel project ID** (`projects.vercel_project_id`, for building/deploying when there is no repo), the **working folder** (build_folder or AutoBuilds/<slug>), and an auto-fix toggle. `module-injection` v3 injects this build target into every generated prompt so Claude Code is told which folder to cd into + repo/Vercel target to build with. `dashboard_modules` +`prompt_style` (build/interview/audit); curated specs added for courses, prompt_generator, portal, leads, partner (Affiliate & Partner), email_automation (interview), system_polish + system_test (audit). Link creation fixed (`project_intake_tokens.expires_at` made nullable so "never expire" works). Orchestrator: bug fixes no longer require a linked repo — the Terminal path resolves the repo from Vercel/vault and fixes it.

---

## Changelog — 2026-06-22 (Prospecting overhaul)

- **Prospecting dashboard count bug FIXED.** `prospecting.html` (base64-embedded dashboard) `loadDashboardData()` fetched `leads?lead_type=eq.prospect` with no limit, hitting PostgREST's 1000-row cap, so "Prospects Found" maxed at 1000. Query now `lead_type=eq.prospect&email=not.is.null&...&limit=50000`. Shows true reachable count (~2,267) and auto-excludes no-email leads. To edit the dashboard you must decode `var D` (base64), change, re-encode, replace.
- **No-email phantoms flagged.** 1,627 prospects had NO email (bot-scraper inserts where Apollo found no verified email). Flagged `status='bad_lead'` + tag `no_email_phantom`; empty emails normalized to NULL. Reversible. Reachable prospects = 2,267.
- **Scrapers paused:** `knight-ops-lead-gen-bot` and `knight-ops-intent-hunter` disabled — they were over-feeding email-less junk into a 0%-converting system. Re-enable only after conversion is fixed AND insert enforces a verified email.
- **Conversion problem:** ~2,639 nurture sends → 11 replies, 0 meetings. Cause: no booking link in emails, selling a $7.5k+ build to cold prospects, 15+ overlapping sequences, per-send AI copy that hallucinates. Fix in flight: "Pull Up a Chair" Roundtable invite campaign (no-pitch, drives /roundtable + /book). Segment ~2,010 clean cold prospects.

---

## Architecture Overview

KnightOps.biz is a static-first multi-page site deployed on **Vercel** with a **Supabase** PostgreSQL backend. All frontend pages are single-file HTML (no build step, no framework). The admin dashboard (`admin.html`) is a ~8,000-line single-page application.

### Infrastructure

| Layer | Service | ID |
|-------|---------|-----|
| Hosting | Vercel | Project: `prj_mXMrnTboMFpBt5QsCdFeR2t7aerz`, Team: `team_WHiAYPn3TV95wpQT1hsoDrhm` |
| Database | Supabase | Project: `trpnlkntvulkjerevngm` |
| Email | Resend | Sending from `Daniel Knight <daniel@knightops.biz>` |
| Payments | Stripe | Connected via payment links + webhooks |
| CRM/Drip | Go High Level | Webhook integration (being replaced) |
| Git | GitHub | `10xUnicorn/knight-ops-site` |

### Supabase Anon Key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM
```

---

## HARD RULES — Never Violate

### Rule 1: Never overwrite vercel.json
Only make surgical edits to `vercel.json`. Never write the entire file from memory or outputs. Always read the current file first, then edit specific sections. This has caused production outages before.

### Rule 2: Apollo/prospecting leads must NEVER appear in admin dashboard
The `leads` table uses a `lead_type` column:
- `'inbound'` → shows in admin dashboard (`/admin`)
- `'prospect'` → shows in prospecting dashboard (`/prospecting`)

**Any lead sourced from Apollo, Vibe Prospecting, or the overnight scraper must have `lead_type='prospect'`.** Check BOTH `source` column (enum `lead_source`) AND `enrichment_source` column (text). Leads with `enrichment_source ILIKE '%apollo%'` are prospecting leads regardless of what `source` says.

### Rule 3: Always confirm Supabase/Vercel project targets
Before ANY database write, migration, or deployment, run the `project-selector` skill to confirm you're targeting the correct project. Never assume from a previous conversation.

### Rule 4: NEVER deploy via Vercel CLI — git push ONLY
Deployments MUST go through git push → GitHub → Vercel auto-deploy. NEVER use `vercel deploy`, `vercel --prod`, or any Vercel CLI deployment. Dirty CLI deploys (`gitDirty: "1"`) have caused pages to go missing in production because they deploy from an incomplete local copy instead of the full git repo. This has happened multiple times and wiped 9+ pages from production.

### Rule 5: Run git on the Mac, never from the sandbox mount — use `ko`
**Superseded 2026-08-12.** The old rule said to clone to `/tmp` and push from there, because the
sandbox mount reports an immutable `.git/index.lock`. That lock is a *sandbox artifact only* —
git writes fine natively on the Mac (verified). But every /tmp-clone push left
`~/knight-ops-site` stale, so it drifted further from origin each session. On 2026-08-12 it had
reached **253 commits ahead / 112 behind** after a `git pull --rebase` was aborted mid-conflict,
leaving an orphaned `.git/AUTO_MERGE`. Local content was 130 files / 25k lines behind production.

**Do this instead.** Run git through the Mac shell (osascript `do shell script`, or ask Daniel to
run it in Terminal) against `~/knight-ops-site`. Never `git commit`/`push` from `/sessions/...`.

A helper is installed at `~/bin/ko`:
- `ko status` — ahead/behind/uncommitted at a glance
- `ko sync` — safe fast-forward; auto-stashes, refuses if you'd lose commits
- `ko deploy "message"` — blocks if behind origin, shows the diff, confirms, commits, pushes, then curls production
- `ko rescue` — for a diverged repo: archives commits to `archive/pre-sync-<date>`, stashes the working tree, clears rebase residue, resets to origin. Nothing is destroyed.

**Start every session touching this repo with `ko status`.** If it isn't `IN SYNC`, fix that before
editing anything. Reading/editing files through the mount is fine — only git operations must run
on the Mac.

Recovery from 2026-08-12: old commits are on branch `archive/pre-sync-2026-08-12`; the old working
tree is in `git stash list`.

### Rule 6: Verify every change
After making a change (SQL, deployment, code edit):
1. **Run a verification query or check** — don't just assert it worked
2. **For SQL**: Query the affected rows and confirm the expected state
3. **For deployments**: Check `list_deployments` and confirm state is `READY`
4. **For code changes**: Read the file back and confirm the edit landed
5. **NEVER claim a fix is done without verification evidence**

### Rule 7: One app = one Supabase project
If a task is for a new product or different company, create a new Supabase project. Don't pollute `trpnlkntvulkjerevngm` with unrelated data.

---

## Lead Segmentation System

### Source Enum (`lead_source`)
Valid values: `intake_form`, `marketplace`, `event`, `manual`, `referral`, `website`, `vibe_prospecting`, `apollo`, `automated`, `mini_blueprint`, `website_intake`, `filter_score`, `assessment`

### Lead Type Rules
| Source | Default lead_type | Dashboard |
|--------|------------------|-----------|
| `apollo` | `prospect` | /prospecting |
| `vibe_prospecting` | `prospect` | /prospecting |
| `intake_form` | `inbound` | /admin |
| `event` | `inbound` | /admin |
| `website` | `inbound` | /admin |
| `website_intake` | `inbound` | /admin |
| `referral` | `inbound` | /admin |
| `manual` | depends on context | check added_by |
| `filter_score` | `inbound` | /admin |
| `assessment` | `inbound` | /admin |
| `mini_blueprint` | `inbound` | /admin |

### Enrichment Source Check
If `enrichment_source ILIKE '%apollo%'` AND `added_by IN ('nighthawk_scraper', 'system')`, the lead is a prospecting lead regardless of `source` value.

---

## Database Schema (Key Tables)

### leads
Primary table. Key columns:
- `id` (uuid), `name` (text), `email` (text), `phone` (text)
- `source` (enum `lead_source`), `lead_type` (text: 'inbound'|'prospect')
- `status` (text), `lead_score` (int), `enrichment_source` (text)
- `tags` (text[]), `cohort_id` (text — not a column yet, stored in tags)
- `notes` (text), `added_by` (text), `prospecting_run_id` (uuid)
- `company`, `job_title`, `company_domain`, `company_industry`

### deals
- `id`, `title` (NOT `name`), `deal_value` (NOT `value`), `stage`, `status`
- `sales_channel` (text), `probability`, `expected_close_date`
- `won_date`, `lost_date`, `lost_reason`
- Stages: discovery, qualification, proposal, negotiation, closed_won, closed_lost, on_hold
- Status auto-links with stage (see admin.html `linkDealStageStatus()`)

### tasks
- `id`, `title`, `description`, `status`, `priority`, `due_date`
- `assigned_to`, `project_id`, `created_by`

### projects
- `id`, `name`, `description`, `status`, `client_id`
- Junction table: `project_clients` (many-to-many with clients)

### clients
- `id`, `name`, `email`, `company`, `status`, `phone`

### notifications
- `id`, `title`, `message`, `type`, `read`, `created_at`
- `entity_type` (text), `entity_id` (uuid) — for clickable navigation

### speaker_survey_responses
- `id`, `lead_id`, `answer`, `cohort_id`, `survey_name`, `offer_presented`
- `event_name`, `event_date`

### drip_config / drip_queue
- Drip system: `drip_config` defines sequences, `drip_queue` holds pending sends
- `max_per_batch`: currently 150

---

## Edge Functions (42 total)

### Email & Communication
| Function | Purpose |
|----------|---------|
| `process-drip` (v18) | Main drip processor — handles all sequences |
| `send-notification` | Push notifications |
| `send-plain-email` | Generic email sender |
| `send-email` | Branded email sender |
| `send-intake-confirmation` | Website intake form confirmation |
| `send-survey-email` | Survey distribution |
| `send-section-link` | Section link emails |
| `speaker-campaign` (v3) | Speaker lead drip campaign |
| `quick-blast` (v1) | Generic email blaster |
| `speaker-feedback-email` | Post-event feedback |
| `speaker-outreach` | Speaking opportunity outreach |
| `speaker-inquiry-email` | Inquiry notifications |
| `partner-emails` | Partner portal emails |
| `assessment-drip` | Assessment sequence |
| `send-sms` | SMS outreach |

### Tracking & Analytics
| Function | Purpose |
|----------|---------|
| `track` | General event tracking |
| `track-open` | Email open tracking |
| `track-click` | Email click tracking |
| `track-visitor` | Site visitor tracking |

### Business Logic
| Function | Purpose |
|----------|---------|
| `analyze-offer` | Prospecting filter score analysis |
| `capture-lead` | Lead capture from filter score |
| `receive-email` (v6) | Inbound email processing |
| `serve-proposal` | Proposal page rendering |
| `send-proposal` | Proposal delivery |
| `serve-preview` | Project preview rendering |
| `serve-app` | Client app file serving |
| `speed-to-value-intake` | STV intake processing |
| `speaker-inquiry` | Speaking inquiry processing |
| `manage-drip` | Drip queue management |
| `process-drip-queue` | Queue processor |
| `task-reminders` | Task reminder emails |
| `notify-comment` | Comment notifications |
| `send-magic-link` | Auth magic links |

### Lead Generation Product
| Function | Purpose |
|----------|---------|
| `search-leads` | Lead search API |
| `enrich-leads` | Lead enrichment |
| `deliver-leads` | Lead delivery to purchasers |
| `stripe-lead-webhook` | Stripe payment webhook |
| `send-report-email` | Lead report delivery |

### AI Agents
| Function | Purpose |
|----------|---------|
| `marketing-agent` | Marketing automation |
| `builder-agent` | Build automation |
| `orchestrator-briefing` | Daily briefing |
| `orchestrator-manager` | Agent orchestration |

### Roundtable Reminders (2026-06-17) — NO GHL
`roundtable-reminders` edge function sends branded emails (Resend, from daniel@knightops.biz) to everyone in `roundtable_registrations` (deduped by email). Triggered by `?type=24h|5min|thankyou`. Driven by **pg_cron** jobs (verify_jwt=false; cron passes anon apikey via pg_net):
- `roundtable-24h-reminder` — `0 17 * * 2` (Tue 10am PT) — Zoom link + add-to-calendar
- `roundtable-5min-reminder` — `55 16 * * 3` (Wed 9:55am PT) — "starting in 5 min" + Zoom
- `roundtable-thankyou` — `0 19 * * 3` (Wed 12pm PT) — thanks + book a call (/book)

Zoom = knightops.biz/roundtable-zoom. Times are UTC for PDT (UTC−7); shift +1h hour (18/17:55/20) if PST is ever needed. The roundtable page NO LONGER posts to GoHighLevel — that webhook was removed. Knight Ops does not use GHL anywhere.

---

## Event Lead Engine (2026-06-19)

Free/$1,497 custom interactive lead-capture magnets for event vendors/speakers. Full spec: `EVENT-LEAD-ENGINE-SPEC.md`.
- Pages: `/event-lead-engine` (offer), `/event-lead-engine-intake` (form), `/ele-admin` (approvals), `/le/:slug` (hosted magnet via `api/le.js`→`serve-le`).
- Tables: `ele_builds`, `ele_leads`, `ele_event_hosts`. Attendee leads dual-write to `leads` (source=`event`, tag `ele-magnet`, lead_type inbound — Rule 2 safe).
- Magnet engine template lives in storage `ele-assets/engine/ele-magnet-engine.html` (builder reads from storage). Re-upload after editing `templates/ele-magnet-engine.html`.
- Edge fns: ele-intake, ele-build, ele-capture, ele-approve, ele-autosend (pg_cron 30m → 24h auto-send), ele-review, ele-save, ele-resume, ele-host-coupon, ele-stripe-webhook, serve-le.
- Stripe LIVE: build $1,497, hosting $97/mo, transfer $249. Delivery email from team@knightops.biz, reply-to eden@knightops.biz.
- **2026-06-25 (AI-first + Special Offer):** Intake opens with a "Build it with AI" section — vendor brief + URL → `ele-analyze` edge fn (scans site colors/fonts/action-links/text, Sonnet designs the full config) → form auto-fills + live preview, all editable. New mechanism `special_offer` (Events Special Offer = straight NLP offer/checkout page, no game; engine fn `renderSpecialOffer()`). `ele-analyze` + `ele-revise` MECHS include `special_offer`. AI-first form normalizes `pick_door`→`scratch` and `redirect`→`offer` to a real card. **Free gift is now OPTIONAL** (removed from intake `validate()`). Re-uploaded engine to storage. Deployed `7d2fc8e`.
- **2026-06-25 (Edit/duplicate + candidate versioning + link preview + hosting flip):** `/ele-admin` per-build **✏️ Edit** opens `/event-lead-engine-intake?edit=<id>` — full field + file edit, uploaded files shown as keep-or-replace (gift, logo, link image). New edge fn **ele-edit** (load/save/regenerate/finalize/discard/set_hosting/duplicate). `ele-build` v8 writes a **candidate** page (`builds/<slug>/candidate.html` + `candidate_*` cols) when `candidate:true`, leaving live untouched; admin shows **Use candidate / Discard**; finalize promotes candidate→`magnet.html` (same slug/URL). **Link preview / OG** = cols `link_title`/`link_description`/`link_preview_image`; `serve-le` v3 injects OG fresh at serve time (update WITHOUT rebuild) and serves `?v=candidate`; `ele-build` also bakes OG for downloads; `api/le.js` forwards `?v`. **Turn on hosting** flips a build to hosted + copies/emails the $97/mo pay link. Host mgmt groups codes by host (host_email) with **Copy code / Copy invite link** + **+ New code** (custom-code prompt). Migration `ele_builds_edit_versioning_og`.
- **2026-06-27 (Conversion-first + obey-revise + offer+calendar + embed fix):** `ele-build` v9 aiDesign enforces TIGHT high-converting copy (no walls of text; headline ≤9 words, sub/result/explain ≤18 words, copy cap 240) and NEVER invents a free gift (passes `has_gift`). `buildBase` stopped defaulting gift name to "your free gift" (the phantom-gift bug) and now MERGES `cta_config` (keeps offer_url alongside a calendar). Engine: gift UI only renders when a real gift exists (`hasGift()`); quiz supports `skip_reveal` (answer→capture→CTA, no result screen); new **offer_calendar** CTA = short offer + button AND embedded calendar on the final page; **calendar embeds now execute** via `reactivateScripts` (re-injects `<script>` so GHL `form_embed.js` runs/auto-resizes) + `.cal-wrap iframe{min-height:760px}` so it is never cut off. `ele-revise` v4: user instruction is LAW — obeys removals (gift/step/reveal) with deterministic gift-field clear + quiz `skip_reveal`, keeps copy tight; `CTAS`+`ALLOWED` add `offer_calendar`/link fields. `serve-le` v4 OG default is gift-neutral. Fixed live build `what-is-calling-you-to-write-your-book-right-now` (no gift, skip_reveal, offer brief + button to livedtrue.com/webinar + embedded GHL calendar). Re-uploaded engine to storage.

---

## Dashboard Builder (2026-06-24)

Self-serve engine that turns an intake into a build-ready Claude Code prompt + spec for a full client dashboard. Modeled on the Event Lead Engine. Full spec: `DASHBOARD-BUILDER-SPEC.md`.

**Update 2026-06-24b (streaming mockup + community + grouping + owner emails):**
- **AI mockup now STREAMS** via new edge fn `dashboard-stream` (SSE, model sonnet, max 12k). Fixes the 504: old `dashboard-ai` review at 16k tokens hit the 150s edge gateway wall = "Could not generate". Builder shows a branded skeleton + animated progress bar with time-driven phase labels + elapsed timer; renders the dashboard live into the iframe as `<body>` streams. `db.html` revise uses it too. Resilience: a 16s stall watchdog + completeness check (`</body>`/`</main>`) auto-falls-back to non-streaming `dashboard-ai` (now max **11000** to stay <150s) so an interrupted stream never shows a broken CSS-only result.
- **Community module** added to `dashboard_modules` + builder MODULES + `dashboard-analyze` MODKEYS.
- **Consolidated sidebar**: `MODGROUPS` in builder groups modules into Home / Sales & Revenue / Clients & Success / Client Portal / Community / Growth / AI / System (live preview + AI mockup prompt both consolidate).
- **Owner-only edit emails**: `dashboard-build` save emails DANIEL (NOTIFY = dknightunicorn@gmail.com + daniel@knightops.biz) the builder resume/edit link on first save AND on every manual Save draft (`notify:true`); finalize emails Daniel the client review+edit+admin links (never auto-emails the client). To email an edit link for any existing build without mutating it: POST dashboard-build `{action:'save',resume_token,status:<current>,notify:true}`.

- **Pages:** `/dashboard-intake` (builder: AI-first entry, 7 sections, live preview, AI review, spec, prompt + copy, save/finalize/share), `/db` (`db.html` — public shareable build page, review + edit modes via token).
- **Admin:** project detail Build Prompt Generator now has a 5th button **📊 Dashboard** (`showDashboardPrompt()` in admin.html, next to ⚡ Command Center). Dashboard builds appear in Forms & Surveys (form_type `dashboard`, label "Dashboard Build").
- **Tables:** `dashboard_builds` (submissions, selections, status, resume + review/edit share tokens, ai_mockup_html, spec_md, build_prompt, lead_id/client_id/project_id), `dashboard_modules` (24-row module catalog). RLS mirrors ele_builds (anon insert + anon read + admin + service_role).
- **Edge functions:** `dashboard-build` (save/resume/submit/approve/save_edit + creates lead+project on submit), `dashboard-ai` (review mockup + spec via Anthropic, model `claude-sonnet-4-6`, fallback templates), `dashboard-analyze` (AI pre-fill from a free-text brief), `dashboard-shared` (token-scoped read for `/db`). All verify_jwt=false, called with anon key.
- **Storage:** `dashboard-assets` bucket (public read, anon insert) for logos/docs.
- **Generated dashboards** are prescribed as Next.js + Supabase + Resend + Stripe on Vercel (one Supabase project per client, Rule 7). The builder OUTPUTS the goal-function prompt; the actual client build runs in Claude Code.
- Note: AI mockup/spec generation takes ~30-45s (fine in browser; exceeds the VM bash 45s cap — generate via background curl or the browser, not a blocking shell call).

---

## Frontend Pages

### Admin & Internal
| Page | Path | Description |
|------|------|-------------|
| `admin.html` | /admin | Main CRM dashboard — leads, deals, tasks, projects, clients, KPIs, notifications |
| `prospecting.html` | /prospecting | Prospecting dashboard — prospect leads, LinkedIn, outreach |
| `drip-queue-manager.html` | /drip-queue-manager | Email drip queue management |
| `my-leads.html` | /my-leads | Lead generation customer portal |

### Public Pages
| Page | Path | Description |
|------|------|-------------|
| `index.html` | / | Homepage |
| `services.html` | /services | Service offerings |
| `fractional-ai-officer.html` | /fractional-ai-officer | FAO flagship service page (tiers + pricing) |
| `fractional-chief-ai-officer-services.html` | /fractional-chief-ai-officer-services | FCAO SEO pillar page (targets "fractional chief AI officer services") |
| `fractional-ai-officer-services.html` | /fractional-ai-officer-services | FCAO variant page (targets "fractional AI officer services", ROI angle) |
| `portfolio.html` | /portfolio | Case studies & app showcase |
| `case-studies.html` | /case-studies | Case studies alternate |
| `about.html` | /about | About page |
| `pricing.html` | /pricing | Pricing |
| `blog.html` | /blog, /blog/:slug | Blog with dynamic slugs |
| `tools.html` | /tools | Free tools |
| `faq.html` | /faq | FAQ page |
| `careers.html` | /careers | Job listings |
| `apply.html` | /apply | Job application |
| `book.html` | /book | Booking page (Blueprint Call direct) |
| `booking.html` | /booking | Booking hub (all types) |
| `book-tech-call.html` | /book-tech-call | Tech call booking |
| `challenge.html` | /challenge | 7-Day AI System Challenge ($47) |
| `apps.html` | /apps | Apps showcase |

### Speaker System
| Page | Path | Description |
|------|------|-------------|
| `speaker.html` | /speaker | Speaker profile |
| `speaker-survey-magnet.html` | /speaker-survey-magnet | Live event survey capture |
| `speaker-survey-results.html` | /speaker-survey-results | Survey results page |
| `speaker-lead-engine.html` | /speaker-lead-engine | $297 product landing page |
| `speaker-offer.html` | /speaker-offer | Speaker offer page |
| `speaker-application-answers.html` | /speaker-application-answers | Application Q&A |
| `speaker-feedback.html` | /speaker-feedback | Feedback form |
| `speaker-sizzle-reel.mp4` | /speaker-sizzle-reel | Video reel |

### ICP Landing Pages
| Page | Path | Description |
|------|------|-------------|
| `for-coaches.html` | /for-coaches | ICP page for coaches |
| `for-consultants.html` | /for-consultants | ICP page for consultants |
| `for-course-creators.html` | /for-course-creators | ICP page for course creators |
| `for-speakers.html` | /for-speakers | ICP page for speakers |
| `for-agencies.html` | /for-agencies | ICP page for agencies |
| `apps-for-coaches.html` | /apps-for-coaches | Apps for coaches |
| `apps-for-consultants.html` | /apps-for-consultants | Apps for consultants |
| `apps-for-course-creators.html` | /apps-for-course-creators | Apps for course creators |
| `apps-for-speakers.html` | /apps-for-speakers | Apps for speakers |
| `apps-for-meal-prep.html` | /apps-for-meal-prep | Apps for meal prep businesses |

### Products & Funnels
| Page | Path | Description |
|------|------|-------------|
| `speed-to-value.html` | /speed-to-value | Speed to Value VIP Day |
| `command-center.html` | /command-center | Command Center landing |
| `command-center-build.html` | /command-center-build | CC intake form |
| `prospecting-filter-score.html` | /prospecting-filter-score | Lead scoring tool |
| `assess.html` | /assess | Business assessment |
| `audit.html` | /audit | Tech audit + lead capture |
| `map.html` | /map/:slug | Shareable audit build map results |
| `blueprint.html` | /blueprint | Blueprint call |
| `mini-blueprint.html` | /mini-blueprint | Mini blueprint form |
| `roundtable.html` | /roundtable | Roundtable event |
| `workshop.html` | /workshop | Claude AI Assistant Workshop registration (Jul 23–24, 2026) |
| `workshop-confirmed.html` | /workshop-confirmed | Workshop Stripe redirect: calendar buttons + prep checklist |
| `workshop-zoom.html` | /workshop-zoom | Workshop Zoom redirect (set ZOOM_URL) |
| `website-intake.html` | /website-intake | Website development intake form |

### Portals
| Page | Path | Description |
|------|------|-------------|
| `portal.html` | /portal | Client portal |
| `client-portal.html` | /client-portal | Client portal (alternate) |
| `partner-portal.html` | /partner-portal | Partner portal |
| `partners.html` | /partners | Partner program |

### Community
| Page | Path | Description |
|------|------|-------------|
| `nightvibecommunity.html` | /nightvibecommunity | Night Vibe community |
| `community-survey.html` | /community-survey | Community survey |
| `vision-system.html` | /vision-system | Vision system |
| `vault.html` | /vault | Knowledge vault |

### Utility
| Page | Path | Description |
|------|------|-------------|
| `auth.html` | /auth | Authentication |
| `reset-password.html` | /reset-password | Password reset |
| `review.html` | /review | Client review |
| `ref-redirect.html` | /ref-redirect | Referral redirect |
| `privacy-policy.html` | /privacy-policy | Privacy policy |
| `404.html` | (auto) | Custom 404 page |
| `unsubscribe.html` | /unsubscribe | Email unsubscribe |
| `proposal-viewer.html` | /proposal-viewer | Proposal viewer |
| `llms.txt` | /llms.txt | LLM context file |
| `robots.txt` | /robots.txt | SEO robots |

### Serverless API Routes (`/api/`)
| File | Route | Purpose |
|------|-------|---------|
| `api/app.js` | /app/:file | Client app file serving |
| `api/preview.js` | /preview/:slug | Project preview proxy |
| `api/proposal.js` | /proposal/:slug | Proposal rendering |
| `api/sitemap.js` | /sitemap.xml | Dynamic sitemap |

---

## Admin Dashboard Features (admin.html)

### Navigation Sections
Dashboard, Leads, Deals, Tasks, Projects, Clients, Notifications, KPIs, Settings

### Forms & Surveys View (2026-06-17)
Reads from tables in `FS_TABLE_MAP`: `intake_submissions`, `cc_intake_submissions`, `roundtable_registrations`, `leads` (INBOUND ONLY — `fsQuery()` forces `.eq('lead_type','inbound')`, never prospects per Rule 2), assessment/community/speaker surveys. The "Form Submitted" column shows the REAL per-row origin via `fsLeadOrigin()` + `FS_FORM_LABELS` (derived from `metadata.source`/`capture_tool`/`form_type`/`tags`), not the coarse `source` enum. Detail panel (`showFsDetail`) renders every captured field as readable Q&A. Note: `roundtable_registrations` is a separate table — roundtable signups will NOT appear under Leads.

### Inline Editing
All list views support inline editing via `inlineEdit()` / `inlineSave()` / `inlineCancel()`:
- **Leads**: Status column
- **Deals**: Stage, Status, Channel columns
- **Tasks**: Priority, Status columns
- **Projects**: Status column
- **Clients**: Status column

### Deal Stage ↔ Status Auto-Linking
Function `linkDealStageStatus()` automatically syncs:
- discovery/qualification → active
- proposal/negotiation → active
- closed_won → completed (+ sets won_date, probability=100)
- closed_lost → lost (+ sets lost_date, probability=0)
- on_hold → on_hold

### Sales Channel Options
Website, In-app Sales, Conversation, Social Media, Stage (In-person), Podcast/Online Interview, Referral

### Clickable Notifications
Notifications with `entity_type` + `entity_id` navigate to the related record via `navigateToNotifEntity()`.

### KPI Dashboard
Grouped into categories: Revenue & Deals, Pipeline, Leads, Engagement. Includes trend charts for revenue over time and deals created by dollar amount.

---

## Cohort/Segment System

Speaker survey leads are tagged with a `cohort_id` in the format `YYYY-MM-DD-event-name-slug`. This enables:
- Per-cohort duplicate checking (same person can fill multiple event surveys)
- Segment-targeted drip campaigns
- Tags array on leads: `[cohortId, 'speaker-lead-engine-drip']`

---

## SEO Schema & Meta Status (June 2026)

All 4 key pages now have: FAQPage JSON-LD schema, og:image + twitter:image (`knight-ops-banner-build-the-machine.jpg`), meta description under 160 chars, and og:title/description matching the page title.
- `index.html` — Organization + Person + FAQPage (6 Q&A) schema, logo URL in Organization
- `fractional-chief-ai-officer-services.html` — Organization + Person + Service + FAQPage (8 Q&A) + HowTo + BreadcrumbList
- `fractional-ai-officer-services.html` — Organization + Person + Service + FAQPage (6 Q&A) + BreadcrumbList
- `fractional-ai-officer.html` — WebPage + ItemList (2 tiers) + FAQPage (7 Q&A). Design is conversion-critical, do NOT alter visuals.

---

## Known Issues & Tech Debt

1. **CRITICAL: Dirty Vercel CLI deploys wipe pages** — The "KnightOps.app" session (`pensive-adoring-edison`) deploys via Vercel CLI with `gitDirty: "1"`. These deploys use whatever files the session has locally, NOT the full git repo. This has wiped 9 pages from production (fractional-ai-officer, challenge, faq, for-agencies, for-coaches, for-consultants, for-course-creators, for-speakers, unsubscribe). **FIX: That session must stop using Vercel CLI and deploy via git push only.** See Rule 4.
2. **Duplicate portal routes** — Both `/portal` and `/client-portal` exist.
3. **Analytics tracking** — `ko-track.js` accuracy needs review.
4. **/assessment links broken** — 6 pages link to `/assessment` but the file is `assess.html` (serves at `/assess`). Need to either rename the file or add a redirect.

---

## Verification Protocol

**Every change must include verification. Follow this checklist:**

### For SQL Changes
```
1. Write the UPDATE/INSERT/DELETE
2. Run it
3. Run a SELECT to verify the expected state
4. Report the verification result with row counts
```

### For Code Deployments
```
1. Make the code changes
2. Push to GitHub
3. Check list_deployments — confirm state is READY
4. If possible, fetch the deployed page and verify the change is present
```

### For Edge Function Deployments
```
1. Deploy the function
2. Check list_edge_functions — confirm version incremented
3. If testable, invoke the function and verify response
```

### Anti-Pattern: False Positive Completion
**NEVER do this:**
- Label a task as "Fix 1 done" without actually running the fix
- Claim SQL was executed when it wasn't
- Mark a task complete based on intent rather than verified outcome
- Skip verification because "it should work"

**ALWAYS do this:**
- Run the actual command
- Verify the result with a follow-up query or check
- Include the verification evidence in your response
- If verification fails, say so and debug

---

## Deployment Checklist

1. Read current `vercel.json` — never overwrite
2. Make surgical code edits
3. Push via fresh /tmp clone
4. Verify deployment state is READY
5. Check for build errors if state is ERROR
6. Test critical paths if possible

---

## Business Context

Knight Ops is Daniel Knight's AI/tech consulting & development company. Key offerings:

- **Night Launch** ($1,497) — Multi-page conversion website
- **Night Build** ($7,497) — Full-stack web/mobile app
- **Night Build Pro** ($14,997) — Full app store deployment
- **Unicorn Universe Premium** ($99/mo) — Entrepreneur community
- **10xUnicorn Mastermind** ($10k/yr) — High-performer mastermind
- **Speaker Lead Engine** ($297) — Event lead capture system
- **AI Marketing Machine** ($99/mo) — Marketing automation

Daniel is also a public speaker and music artist. Communities: Unicorn Universe, Future Self Universe, 10xUnicorn Mastermind.
## Changelog — 2026-08-09 (Scale with Systems Live event offers)
- Added /engine + /engine-confirmed: Automation Engine checkout ($5,000 PIF or $1,500 deposit, Stripe payment links, Knight Ops Stripe acct)
- Added /scale-dashboard + /scale-confirmed: Scale Dashboard checkout ($15,000 PIF or $1,500 deposit)
- Deposit flow: confirmed pages read ?opt= and surface balance completion options

