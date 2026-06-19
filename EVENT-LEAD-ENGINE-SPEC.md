# Event Lead Engine — Project Spec & Source of Truth

> **Owner:** Daniel Knight (dknightunicorn@gmail.com)
> **Part of:** KnightOps.biz (knight-ops-site)
> **Folder:** `/Users/danknightunicorn/knight-ops-site`
> **Deploy command:** git push ONLY (GitHub → Vercel auto-deploy). NEVER `vercel` CLI. See main CLAUDE.md Rule 4–5.
> **Supabase project:** Knight Ops — `trpnlkntvulkjerevngm`
> **Vercel project:** `prj_mXMrnTboMFpBt5QsCdFeR2t7aerz`
> **Last updated:** 2026-06-19

---

## What this is

A near-zero-touch system that lets event speakers, sponsors, and exhibitors get a custom **interactive lead-capture experience** built for them. Event hosts hand out a free coupon; vendors fill out one form; AI builds a branded magnet; Daniel one-click approves; it's delivered automatically. Every lead is captured to the vendor AND to the Knight Ops list (marketing rights). The whole point: distribution + brand reach + recurring hosting + downstream Knight Ops deals, from rooms Daniel isn't even in.

---

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Confirm Supabase/Vercel targets | ✅ Done |
| 2 | DB schema + storage (`ele_*` tables, `ele-assets` bucket) | ✅ Done |
| 3 | Example gallery assets (`assets/ele-examples/`) | ✅ Done |
| 4 | `event-lead-engine.html` offer landing page | ✅ Done |
| 5 | `event-lead-engine-intake.html` intake form (live preview, review-with-AI, approve/revise/edit, save) | ✅ Done |
| 5 | `templates/ele-magnet-engine.html` config-driven magnet engine | ✅ Done |
| **6** | **Edge functions (intake, build/Sonnet, review, save/resume, capture, approve, regenerate, stripe-webhook, host-coupon)** | ⏳ Next |
| **7** | **Stripe products + coupons + payment links** | ⏳ Next |
| **8** | **Admin wiring (ELE applications, preview link, Approve/Regenerate/Decline, hosted clients, ele_leads view, 24h auto-send cron)** | ⏳ Next |
| 9 | `/le/:slug` routing (surgical vercel.json edit) | ⏳ Next |
| 10 | End-to-end test + git push deploy | ⏳ Next |

---

## Locked decisions (from interview)

- **Money:** $1,497 Stripe product; vendors redeem FREE via a per-event-host 100%-off coupon. No coupon = pay $1,497.
- **Build gate:** AI auto-builds → posts preview to /admin → Daniel 1-click **Approve** sends delivery email. **Regenerate** and **Decline/Revise** buttons too. **Auto-sends after 24h** if no action.
- **Lead capture:** EVERY magnet (self-hosted or hosted) posts each lead to the Knight Ops capture endpoint AND the vendor's destination.
- **KO disclosure:** One visible consent line on the capture form, doubling as the required "Powered by Knight Ops" tag: *"I agree {Company} and Knight Ops may follow up by email."* Pre-checked.
- **Opt-in:** Pre-checked. Vendor = email + SMS. Knight Ops = **email only** (no KO SMS automations, ever).
- **Hosting:** $97/mo, served at `knightops.biz/le/{title-slug}` (reuse `serve-app`). Weekly lead spreadsheet on request while active.
- **Transfer:** $249 for full file + DB. No branded custom domain (URL stays on knightops.biz / vercel).
- **Mechanisms:** Vendor picks ONE; the engine supports all. Premium (AI scorer, Live Results) = book a call, not auto-built.
- **Support email:** `eden@knightops.biz` (revisions/questions). ⚠️ CONFIRM with Daniel — voice note said "eden@", verify vs daniel@.
- **API keys:** Stripe secret + Anthropic key to live in Supabase Edge Function secrets.

---

## Files

| File | Route | Purpose |
|---|---|---|
| `event-lead-engine.html` | `/event-lead-engine` | Offer landing page. NLP copy, mechanism + CTA galleries (real screenshots), 4 design styles, event-host section (bottom), agreements, FAQ. CTA → intake. |
| `event-lead-engine-intake.html` | `/event-lead-engine-intake` | Standalone intake form. Live preview, file/logo upload → `ele-assets`, Save & resume, Review-with-AI (mockup + outline), Approve/Revise(prompt)/Edit, build progress, confirmation. Passes `?code=`. |
| `templates/ele-magnet-engine.html` | (template) | Config-driven magnet. Renders all mechanisms + 4 styles, captures lead, dual-posts, routes to CTA. `ele-build` injects `window.ELE_CONFIG`. |
| `assets/ele-examples/*.png` | static | Real example screenshots for the galleries. |

---

## Database schema (applied to `trpnlkntvulkjerevngm`)

Migration: `event_lead_engine_schema`.

### `ele_event_hosts`
Coupon distribution. `id, created_at, host_name, host_email, company, event_name, event_date, coupon_code (unique), stripe_coupon_id, stripe_promo_id, max_redemptions, redemptions, status (active|expired|disabled), notes`.

### `ele_builds`
Vendor intake + generated magnet. Key cols: `status (draft|submitted|generating|preview_ready|approved|revise_requested|delivered|live|declined)`, `resume_token (unique)`, `host_coupon_code`, `event_name`, vendor identity (`vendor_name, company, website, email, phone`), `mechanism`, `mechanism_config jsonb`, gift (`free_gift, free_gift_value, free_gift_file_path, free_gift_url`), `cta_type`, `cta_config jsonb`, design (`design_style, design_notes, tonality, brand_colors jsonb, logo_path`), `hosting (self|hosted)`, `magnet_title`, `slug (unique)`, `consent_config jsonb`, `ai_mockup jsonb`, `html_path`, `preview_url`, `proposal_id`, `intake_submission_id`, `lead_id`, `revision_notes`, `revision_count`, `stripe_payment_status`, `stripe_session_id`, `hosting_subscription_id`, `approved_at, declined_at, delivered_at, submitted_at, auto_send_at`. `updated_at` auto-trigger.

### `ele_leads`
Attendee leads from live magnets. `id, created_at, build_id (fk→ele_builds), name, email, phone, interactive_type (answer|guess|spin_result|scratch_result|archetype|entry|door), interactive_data jsonb, consent_vendor_email, consent_vendor_sms, consent_ko_email, event_name, vendor_company, delivered_to_vendor, delivered_to_vendor_at, ko_lead_id, source_tag('ele-magnet'), ip, user_agent`.

**RLS:** enabled. anon may INSERT `ele_builds` + `ele_leads`. All reads/updates/coupon validation via edge functions (service role). Storage `ele-assets` bucket is public-read with anon insert (gift/logo uploads).

---

## Magnet engine config contract (`window.ELE_CONFIG`)

`ele-build` writes a final HTML by injecting this JSON into `templates/ele-magnet-engine.html`:

```js
{
  build_id, event_name, magnet_title, company, logo_url,
  design_style: "cosmic_gold|clean_light|bold_neon|elegant_editorial",
  colors:{primary,accent,secondary,text},
  mechanism: "quiz|guess_win|spin_win|contest|archetype|scratch|pick_door",
  config:{ /* mechanism-specific: question/choices/correct/result/explain,
            label/number/prize_win/prize_all, prizes[], prompt/traits[]/result,
            reveal/options[], prize/rules */ },
  gift:{name,value,file_url,url},
  cta:{type:"download|calendar|text_keyword|offer|redirect"},
  cta_config:{ calendar:{url|embed}, text_keyword:{keyword,phone}, offer:{offer_url,checkout}, redirect:{url} },
  consent_text, // "...{company} and Knight Ops may follow up by email."
  endpoints:{ capture, anon, vendor_webhook }
}
```

Engine guarantees on EVERY build: pre-checked consent, dual-post (capture + webhook), interactive data passthrough, "Powered by Knight Ops" footer link, client copyright. **Spin-to-win passes the won prize; guess passes the number; quiz passes the answer — all to webhook + DB.**

---

## Edge functions to build (Phase 6)

All on `trpnlkntvulkjerevngm`. Service role.

| Function | Trigger | Job |
|---|---|---|
| `ele-host-coupon` | host request / admin | Create Stripe coupon (100% off) + promo code, insert `ele_event_hosts`, return code. |
| `ele-save` | intake "Save" | Upsert `ele_builds` (status=draft) by `resume_token`; email resume link `…/event-lead-engine-intake?resume={token}`. |
| `ele-resume` | intake load `?resume=` | Return saved build by token to repopulate form. |
| `ele-review` | intake "Review with AI" | Call Anthropic **Sonnet** → return polished `mockup_html` + `outline_html` (no persistence). Form falls back to client mockup if unavailable. |
| `ele-intake` | intake "Approve & build" | Validate coupon; insert `leads` (vendor; `source='event'`, `lead_type='inbound'`, tags `['event-lead-engine', event, company]`); insert `intake_submissions` (form_type='ele', title=magnet_title, source='event_lead_engine', lead_id); insert/finalize `ele_builds` (status=submitted, submitted_at, auto_send_at=now+24h); notify Daniel; trigger `ele-build`. |
| `ele-build` | from `ele-intake` | Build `ELE_CONFIG` from the row (use Sonnet for copy polish + slug), inject into engine template, upload HTML to `proposals` bucket `{slug}/proposal.html`, create `proposals` row (slug, lead_id, intake_id, html_path) → admin preview at `/proposal/{slug}`, set `ele_builds.status=preview_ready, html_path, proposal_id, preview_url`. |
| `ele-approve` | admin "Approve" OR 24h cron | Send delivery email (Resend, from daniel@knightops.biz): self-host → attach HTML file + instructions + /book link; hosted → publish to `/le/{slug}` + Stripe $97/mo link + confirmation. Set status=delivered/live, delivered_at. |
| `ele-regenerate` | admin "Regenerate" | Re-run `ele-build` (optionally with `revision_notes`), bump `revision_count`. |
| `ele-capture` | live magnet submit | Insert `ele_leads`; forward to vendor webhook (server-side, reliable); if `consent_ko_email` insert KO copy into `leads` (`source='event'`, `lead_type='inbound'`, tags `['ele-magnet', event, vendor]`, metadata=interactive_data) and set `ko_lead_id`; enqueue KO email nurture (email only). |
| `ele-stripe-webhook` | Stripe | $1,497 checkout completed → mark paid; $97/mo subscription created/canceled → set `hosting_subscription_id`, toggle hosting. |

**24h auto-send:** pg_cron job (like roundtable reminders) calls `ele-approve` for rows where `status='preview_ready' AND auto_send_at < now()`.

---

## Stripe to create (Phase 7) — Stripe MCP available

1. **Product:** "Event Lead Engine" — one-time **$1,497** → payment link (no-coupon path).
2. **Per-host coupons:** 100%-off coupons + unique promo codes, created by `ele-host-coupon`, stored in `ele_event_hosts`.
3. **Product:** "Event Lead Engine Hosting" — recurring **$97/mo** → subscription link (sent after submit if hosted).
4. **Transfer fee:** **$249** one-time (manual invoice / payment link on request).
Confirm test vs live mode before creating.

---

## Admin integration (Phase 8) — `admin.html`

- ELE builds appear in **Applications** (via `intake_submissions`, form_type='ele'); the **vendor** appears in **Leads** (source='event').
- Application detail panel: render `ele_builds` fields + **preview link** `/proposal/{slug}` + **[Approve & Send]**, **[Regenerate]**, **[Decline/Revise]** buttons (call edge functions). Show `auto_send_at` countdown.
- New **Event Lead Engine** view: hosted clients ($97/mo) + `ele_leads` volume per build (kept out of main Leads to avoid flooding; KO-marketing copies are tagged `ele-magnet` in `leads`).
- Per Rule 2: ELE attendee leads are inbound/event, never prospects.

---

## Compliance (baked in)

Visible co-disclosure consent (pre-checked), Knight Ops email-only (no SMS), one-click unsubscribe + physical address in KO email (Phase 6 nurture), vendor agrees to marketing rights via intake checkboxes. Value-first nurture, not cold blast, to protect deliverability.

---

## Open / confirm

- [ ] Confirm support email: `eden@knightops.biz` vs `daniel@knightops.biz`.
- [ ] Confirm Anthropic + Stripe keys present in Supabase secrets.
- [ ] Decide nurture sequence copy for KO-captured leads (Phase 6).
- [ ] Premium (AI scorer / Live Results) intake path = `/book` only for now.

---

## Next session opens with
"Resuming Event Lead Engine at Knight Ops. Phase 1–5 shipped (schema, offer page, intake form, magnet engine). Build Phase 6 edge functions next: ele-intake, ele-build (Sonnet), ele-capture, ele-approve, ele-review, ele-save/resume, ele-stripe-webhook, ele-host-coupon. Then Stripe products/coupons, admin wiring, /le/:slug route, deploy via git push.
Folder: /Users/danknightunicorn/knight-ops-site
Supabase: trpnlkntvulkjerevngm · Deploy: git push only"
