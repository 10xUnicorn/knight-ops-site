# Bloomstack Booth (Gumball Prophecy) — Project Spec
Last updated: 2026-06-08
Folder: /Users/danknightunicorn/knight-ops-site
Page file: bloomstack.html  → live URL: https://knightops.biz/bloomstack (clean-URL rewrite, no .html)
Deploy command: git push only (Rule 4 — never Vercel CLI)
  cd "/Users/danknightunicorn/knight-ops-site" && git add bloomstack.html BLOOMSTACK-BOOTH-CLAUDE.md && git commit -m "Add Bloomstack booth gumball prophecy game" && git push
Vercel project: knight-ops-site (auto-deploys on push to main)
Supabase project: Knight Ops (trpnlkntvulkjerevngm, us-west-1)

## What's Built
- bloomstack.html — single self-contained page, brand-matched (dark #0A0A0B + gold #C8A456, Inter + JetBrains Mono). Sized for the ~1240x560 Gatherly iframe, responsive to full-screen expand. noindex.
  - Screen 1: the game. Live growing gumball jar (SVG), live player + gumball counters polling Supabase every 12s. Two future-prediction questions (attendance + total gumballs). Lead capture (name + email) at the game. Consent pre-checked, minimal. Unlimited guesses.
  - Screen 2: confirm + FREE 10x Systems Blueprint booking (real embed: api.unicornuniverse.io/widget/booking/F2GsBGGCAYHgnQees0pV). "Go to Special Event Offer!" ghost button w/ "Maximize Lead Gen at Events 🚀" subtext.
  - Screen 3: Lead Magnet Engine offer. $1,497 → event price (currently $997 placeholder, EDIT to confirm). Satisfaction guarantee. Claim button → OFFER_CLAIM_URL (currently /book placeholder — swap for Stripe link). "Rather talk first? Book a call" fallback.
  - Eden assistant: floating bubble. LLM-backed via edge function with scripted fallback. Grounded ONLY in verified Knight Ops facts. Always points to play or book.
- Supabase schema (migration bloomstack_booth_schema + bloomstack_fix_player_count):
  - bloomstack_guesses (RLS: anon INSERT only, no public SELECT — protects emails)
  - bloomstack_event_state (single-row live counters; RLS public SELECT; kept in sync by trigger bloomstack_after_guess)
  - bloomstack_results (written at cutoff; RLS public SELECT)
- Edge functions (both ACTIVE on trpnlkntvulkjerevngm):
  - bloomstack-eden (verify_jwt off; public marketing FAQ; uses ANTHROPIC_API_KEY if set, else tells client to use scripted fallback)
  - bloomstack-results (admin-gated by x-admin-secret; service role; emails via Resend; supports dry_run)
- Scheduled task: bloomstack-gumball-results-2026-06-11, fires 6/11 2:22pm PT. Human-in-the-loop: asks Daniel for final attendance, dry-runs, gets approval, then sends all emails.

## Winning rule (published on page)
Best guess per email counts. Score = |guessAttendance - finalAttendance| + |guessGumballs - finalTotalGumballs|. Lowest wins. Earliest timestamp breaks ties. Numbers lock 6/11 2:22pm PT. finalTotalGumballs = SUM of every gumball guess; finalAttendance = actual count (Daniel provides at cutoff).

## Game model (UPDATED)
- Q1 = "How many total guesses will be played?"  Q2 = "What will the AVERAGE gumball guess be?"
- Jar shows TOTAL gumballs climbing live. PLAYER COUNT IS HIDDEN from the client (the unknown variable that keeps the average from being trivially computed). Backend still tracks players for the winner calc.
- Scoring (bloomstack-results v2): finalQ1 = total number of guesses; finalQ2 = round(sum of gumball guesses / total guesses). Combined distance, best guess per email, earliest timestamp breaks ties. Both finals computed from the data, NO external attendance number needed anymore.
- Example helper text on page uses ONE MILLION (not a billion).

## Offer (UPDATED)
- New dedicated page: lead-magnet-engine.html -> https://knightops.biz/lead-magnet-engine
- Price: $797 (from $1,497). Look/feel referenced from speaker-lead-engine.html, simpler, one page.
- PRIMARY CTA = "Text MAGNET to Daniel": sms:6027020807?&body=MAGNET%20[name]. Name auto-prefills from ?name= passed by the booth claim button.
- SECONDARY CTA = $797 Stripe checkout. Set STRIPE_CHECKOUT_URL constant in lead-magnet-engine.html once the payment link exists. Currently falls back to /book.
- Booth Eden "Work with Daniel" answer points to knightops.biz/book.

## Open Tasks (Daniel decisions)
- [ ] STRIPE: Stripe MCP was disconnected this session. Create product "Lead Magnet Engine (Bloomstack)", price $797 one-time, payment link. Paste link into STRIPE_CHECKOUT_URL in lead-magnet-engine.html.
- [ ] CONFIRM voucher value to display. Default "$500" via Supabase secret BLOOMSTACK_VOUCHER_VALUE. Set the secret to change it.
- [ ] (Optional) Set ANTHROPIC_API_KEY secret to turn on Eden's live LLM brain. Without it, Eden uses the built-in scripted FAQ (still fully functional).
- [ ] (Optional) Set BLOOMSTACK_ADMIN_SECRET (defaults to "bloomstack-2026") and BLOOMSTACK_FROM (defaults daniel@knightops.biz) secrets.
- [ ] DEPLOY: not pushed yet. Run the deploy command above when ready.
- [ ] Point the Gatherly booth iframe at https://knightops.biz/bloomstack.

## Known Issues / Blockers
- None. Full pipeline tested end-to-end (insert → counter trigger → distinct-player count → winner dry-run) and test data cleaned. Counters reset to 0.

## Key Decisions Made
- Stored in EXISTING Knight Ops Supabase, isolated under bloomstack_ prefix (no collision with 150+ existing tables). RLS shipped WITH policies (no new security debt).
- Reused existing Resend email path (send infra already configured) instead of building new.
- Game scoring made deterministic (locks real final numbers at cutoff) so the recursive "guess the average" feel stays but a real winner can be named.
- Blueprint framed as "$2,500 value" prize (note: verified pricing doc lists a $750/90-min Blueprint and $300+/hr — the $2,500 is the contest prize framing, does not contradict pricing page).
- Eden grounded strictly in knight_ops_facts; never invents clients.

## Env / Config (reference only — no secrets here)
- Supabase: trpnlkntvulkjerevngm (Knight Ops). Publishable key used client-side in bloomstack.html.
- Edge function secrets needed: RESEND_API_KEY (set), optionally ANTHROPIC_API_KEY, BLOOMSTACK_ADMIN_SECRET, BLOOMSTACK_FROM, BLOOMSTACK_VOUCHER_VALUE.
- Booking embed: api.unicornuniverse.io/widget/booking/F2GsBGGCAYHgnQees0pV (same as /book).

## Next Session Opens With
"Resuming Bloomstack Booth at Knight Ops. The gumball prophecy game (bloomstack.html) + Supabase backend + 6/11 results automation are built and tested but NOT deployed. Next: confirm offer price + voucher value, then git push to go live and point the Gatherly iframe at knightops.biz/bloomstack.
Folder: /Users/danknightunicorn/knight-ops-site
Deploy: git push only"
