# Knight Ops AI Business OS — Build System

> How an intelligent business operating system gets scoped, sequenced, built, and proven.
> **Last updated:** 2026-08-17

This is the internal counterpart to `llms.txt`. `llms.txt` tells the world what Knight Ops
sells. This tells the machine — and whoever inherits it — how the thing actually gets built.

---

## 1. What we are building

One **intelligent business operating system** per client, which the client owns outright:
repository, Supabase project, Vercel project, and domain all transferred, plus a written
continuity brief naming a successor developer.

It is not a SaaS product, not a template, and not a bundle of automations. It is a single
system, deployed in layers, that keeps evolving after launch.

Two promises govern every build decision:

1. **Functional value throughout the build. Never an empty handoff.** Each layer goes live
   as it is finished. We do not disappear for three months and return with a reveal.
2. **Continuous evolution.** Systems that stop evolving stop earning. Every build is
   followed by AI Business OS Continuity.

---

## 2. The layer architecture

| Layer | Name |
|---|---|
| 0 | Engagement Foundation |
| 1 | Foundation & Business Intelligence |
| 2 | Client Acquisition & Strategy |
| 3 | Client Onboarding & Delivery |
| 4 | Client Ascension |
| 5 | Growth Automation |
| 6 | AI Business Brain & Agents |
| 7 | Team & Operations |
| 8 | Specialized Experiences & Integrations |
| 9 | Continuity |

Everyone walks into the same system and sees only what they need: founders, leadership,
employees, contractors, partners, and clients.

The catalog of concrete modules inside each layer lives in the `os_modules` table, not in
this document. That table is the source of truth — this document explains the rules that
govern it.

---

## 3. Sequencing rules

These are not preferences. They are the reason the deployment model works.

1. **Layer 1 always ships first. Data before decisions.** Every scoping decision in layers
   2–8 is guesswork until the organization can see its own numbers. A client who can see
   their pipeline, margin, and utilization will scope layer 2 differently — and better —
   than the same client guessing.
2. **The revenue-nearest layer goes second.** Whatever is closest to money after
   visibility exists.
3. **The layers are a checklist, not a queue.** The sequence is reordered deliberately when
   the constraint changes, and the reason is recorded. It is never skipped silently.
4. **Each module goes live on its own.** Finished work is never held back for a big-bang
   release. That is what "never an empty handoff" means in practice.
5. **Nothing is excluded without a reason.** `not_in_scope` cannot be saved without an
   `excluded_reason`, and that reason is shown to the client. "We already run this in
   Kajabi and it works" is a perfectly good reason. Silence is not.

The scoping walk in admin deliberately steps through **every layer**, including the ones
that will obviously be excluded, so nothing is missed by accident.

---

## 4. Progress is derived, not typed

**A human marking something done is a claim. A commit is evidence.**

Every module carries a `github_path_glob`. The scanner (`module-scan`) reads the client
repo's commits and matches paths against it. A module reaches **Live** only when:

- its code exists in the repo, **and**
- its Vercel deployment is `READY`.

The client-visible state is a view over that evidence. It is never a manual field. Nobody —
not Daniel, not a build worker, not the orchestrator — types `live`.

This is not pedantry. A status field that can be typed will eventually be typed
optimistically, and the client portal becomes a lie.

---

## 5. The four client-facing states

The portal shows exactly four states and nothing else:

| State | Shown as | Notes |
|---|---|---|
| `live` | **Live** | Links to the commit and the deployment |
| `in_build` | **In build** | |
| `scheduled` | **Scheduled** | |
| `not_in_scope` | **Not in scope** | Always shown with the reason |

Clients never see internal notes, hours, costs, build errors, attempt counts, injection
specs, or path globs. Those columns exist on the row but are not granted to the client role.

---

## 6. Data model

**`os_modules`** — the catalog, shared across all clients.
`id · layer · key · name · description · client_description · github_path_glob ·
injection_spec · default_included · default_sequence · sort · active · created_at`

**`client_modules`** — one row per client per scoped module.
`id · client_id · project_id · module_id · state · excluded_reason · sequence_position ·
commit_url · deployment_id · internal_notes · scheduled_at · started_at · live_at ·
build_started_at · build_attempts · build_error · created_at · updated_at`
Unique on `(client_id, module_id)`.

### RLS filters rows. GRANTs filter columns.

This distinction has already cost a debugging session, so it is written down.

RLS decides **which rows** a role can see. It cannot hide a column. `internal_notes`,
`injection_spec`, `github_path_glob` and `build_error` are simply **not granted** to
`authenticated`, which means a direct `select` of them is denied for admin and client alike.

Admin therefore reads through two `SECURITY DEFINER` functions that re-check `is_admin()`:

- **`ko_os_project_modules(p_project)`** — returns flat, pre-joined rows for one project
  including the internal columns.
- **`ko_os_catalog()`** — returns full `os_modules` rows including `default_included` and
  `default_sequence`.

**If you ever "simplify" admin back to a direct `select` on `client_modules`, it will break
for admins only, silently.** The jsdom suite asserts the RPC path specifically to catch this.

---

## 7. Build pipeline

```
admin scoping walk  →  client_modules rows (scheduled / not_in_scope)
        ↓
module-queue  (peek | claim)   ← the orchestrator calls this
        ↓
returns a full markdown build sequence  →  desktop Claude Code builds it
        ↓
commit with marker [ko-module:<row id>]  →  push  →  Vercel READY
        ↓
report-completion  (kind: module)  →  calls module-scan  →  derives state
```

### Guards — all of them live in `report-completion`

`module-queue` does **not** write `client_modules` itself. It POSTs to `report-completion`
with `{kind:'module', id, claim:true}`. One write path means the guards cannot drift
between callers.

- **20-minute claim cooldown.** A module claimed and abandoned is re-offered after 20
  minutes, not immediately.
- **3-attempt cap.** After three attempts the module stops being offered and is surfaced
  rather than retried forever.
- **Never PATCH `client_modules` or run raw SQL from a build.** RLS blocks it, the status
  never flips, and the orchestrator rebuilds the same module forever. This exact failure
  mode is the 2026-07-03b changelog entry. Route every status write through
  `report-completion`, which runs as service role.

### Claim ordering

`module-queue` ranks candidates as:

```
(layer === 1 ? 0 : 1,  sequence_position ?? 9999,  layer,  sort)
```

Layer 1 wins even when a human gave a layer-2 module a better sequence position — verified
live against an adversarial fixture. After Layer 1 is exhausted, the human-set sequence
governs; layer and sort only break ties.

A module whose project has neither `repo_url` nor `vercel_project_id` is skipped and
reported in a `blocked` list. We never hand a worker a folder it cannot push from.

---

## 8. Orchestrator — the `module` work type

The `knight-ops-autobuild-orchestrator` scheduled task has three work types:

| Type | Marker | Source |
|---|---|---|
| bug | `[ko-fix:<id>]` | `bug_reports` |
| feature | `[ko-feat:<id>]` | `feature_requests` |
| **module** | `[ko-module:<id>]` | `client_modules` |

Modules run **after** bugs and features. A broken system that is being extended is still
broken.

> ⚠ **The scheduled task lives in the Claude cloud UI, not on disk.** The step below has to
> be pasted in by hand once. Everything it depends on is server-side and version-controlled,
> which is why the step itself is only a few lines.

### STEP 3 — Build the next AI Business OS module

```
Peek at the module queue:

curl -s -X POST "https://trpnlkntvulkjerevngm.supabase.co/functions/v1/module-queue" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"action":"peek"}'

If queue_depth is 0, or module is null, STOP. There is nothing to build — do not
invent work.

If a module is returned, claim it by repeating the call with {"action":"claim"}.
The response contains:
  - module.id       the client_modules row id
  - build_folder    the folder to cd into on the Mac
  - prompt          a complete markdown build sequence

Hand `prompt` to desktop Claude Code verbatim. Do not summarise it, do not rewrite
it, and do not add your own instructions — it already carries the sequencing rules,
the injection spec, the evidence paths, the commit marker, and the completion call.

Before building, scan the repo's recent commits for the marker [ko-module:<id>].
If it is already there, the module shipped on a previous run: report completion and
stop rather than building it twice.

When the build is done: commit with the marker, push, wait for Vercel READY, then
call report-completion with {"kind":"module","id":"<id>","summary":"...",
"commit_url":"...","deployment_id":"..."}.

If it cannot be finished, hand it back instead of leaving it claimed:
{"kind":"module","id":"<id>","status":"scheduled","error":"why"}

NEVER PATCH client_modules and NEVER run raw SQL to mark a module done. RLS blocks
it, the status never flips, and this loop rebuilds the same module forever.
```

---

## 9. Edge functions in this system

| Function | verify_jwt | Purpose |
|---|---|---|
| `module-queue` | false | Peek/claim the next unblocked module; assembles the build prompt. Service-role key or an admin session JWT. |
| `module-scan` | false | Scans the client repo + Vercel for evidence and derives module state. |
| `report-completion` | false | The **only** write path for module status. Claim, unclaim, and completion. Runs as service role. |

---

## 10. Admin surfaces (`admin.html`)

On project detail:

- **Scoping walk** (`osScopeWalk` / `osWalkSave`) — steps every layer, checkbox per module,
  reason required to exclude, sequence position optional. Saving never clobbers a derived
  state: an in-flight `in_build` stays `in_build`.
- **Module list** (`loadOsModuleAdmin`) — state control, sequence control, rescan, build
  error surfaced with attempt count.
- **Build prompt** (`osBuildPrompt`) — generates the same deployment sequence
  `module-queue` returns, for manual runs. Copy or download as `.md`.

Constants: `OSA_LAYERS`, `OSA_STATES`, `OSA_COLORS` near the top of the OS admin block.

---

## 11. Tests

`/tmp/ko-jsdom/` (ephemeral; recreate with `npm i jsdom` if missing)

- `test-osadmin.mjs` — 56 assertions over the admin module UI, the scoping walk, and the
  generated build prompt. Asserts the `ko_os_project_modules` / `ko_os_catalog` RPC read
  path explicitly, so a regression to a direct select fails immediately.
- `test-os.mjs` — 15 assertions over the client-facing portal renderer: four states, reason
  escaping, commit/deployment links on live modules only, and **no** internal notes, hours,
  or costs in the output.
- `syn.mjs <file>` — parses every inline `<script>` block that has no `src` and reports
  syntax failures. Run it after any edit to `admin.html` or `portal.html`; these files have
  no build step, so a syntax error ships silently.

---

## 12. Environment notes for whoever inherits this

- **Deploy via `ko deploy "msg"` only** — git push → GitHub → Vercel. Never `vercel deploy`
  or `vercel --prod`. Dirty CLI deploys have wiped 9+ pages from production.
- **Run git natively on the Mac**, never from a sandbox mount.
- **Never overwrite `vercel.json`.** Surgical edits only.
- `perl -0pi` rewrites files as latin1 in this environment and mangles em-dashes and
  box-drawing characters. Use a real editor.
