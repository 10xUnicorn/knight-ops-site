# Knight Ops Prospecting Dashboard — Technical Spec

> **Purpose:** Reference document for building integrations (voice AI agent, automation tools, etc.) against the Knight Ops prospecting system.
> **Owner:** Daniel Knight (dknightunicorn@gmail.com)
> **Dashboard URL:** https://knightops.biz/prospecting (password-gated)
> **Last Updated:** 2026-05-24

---

## 1. Architecture Overview

The prospecting dashboard is a single-page application served from `prospecting.html`. The entire app is base64-encoded behind a password gate. After authentication, the decoded SPA loads and connects directly to a **Supabase** PostgreSQL backend via the REST API (PostgREST).

### Infrastructure

| Layer | Service | Details |
|-------|---------|---------|
| **Hosting** | Vercel | Static HTML, no build step |
| **Database** | Supabase | Project ID: `trpnlkntvulkjerevngm` |
| **API** | Supabase REST (PostgREST) | `https://trpnlkntvulkjerevngm.supabase.co/rest/v1/` |
| **Auth** | Password gate (client-side) | Not Supabase Auth — simple password check |
| **Email** | Resend | Sending from `Daniel Knight <daniel@knightops.biz>` |
| **Enrichment** | Apollo API + Vibe Prospecting | Lead enrichment and discovery |
| **Edge Functions** | Supabase Deno | 42 total, ~15 relevant to prospecting |

### Supabase Connection

```
URL: https://trpnlkntvulkjerevngm.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM
```

The dashboard uses three helper functions for all DB access:

```javascript
// GET from key-value settings table
function sbGet(key) { /* fetches from settings/config tables */ }

// UPDATE key-value settings
function sbUpdate(key, value) { /* updates settings/config tables */ }

// SELECT from any table with PostgREST query string
function sbSelect(table, query) {
  // Calls: GET ${SB_URL}/rest/v1/${table}?${query}
  // Headers: apikey + Authorization (anon key), Accept: application/json
}
```

---

## 2. Dashboard Tabs (UI Sections)

The prospecting dashboard has 9 tabs:

| Tab | Purpose | Primary Data |
|-----|---------|--------------|
| **leads** | Main prospect list — table view with filtering, sorting, status management | `leads` table (lead_type='prospect') |
| **linkedin** | LinkedIn prospect tracking — connection status, messaging | `linkedin_prospects` table |
| **finder** | Lead discovery tool — search and filter for new prospects | Apollo/Vibe Prospecting APIs |
| **nurture** | Drip campaign management — sequence builder, scheduling | `drip_queue`, `drip_config` tables |
| **email** | Email composition and template management | `drip_queue` (channel='email') |
| **sent** | Sent email log with open/click tracking | `drip_queue` (status='sent') |
| **tracking** | Website visitor tracking and intent signals | `prospect_insights`, visitor data |
| **speaking** | Speaking engagement pipeline — kanban board, outreach tracking | `speaking_opportunities`, `speaking_events` |
| **filters** | Industry filters, intent topics, channel config | `prospect_filters`, `intent_topics`, `channels_enabled` |

---

## 3. Database Schema

### 3.1 `leads` Table (Primary)

This is the main table. **Prospecting leads use `lead_type = 'prospect'`**. The same table also holds inbound leads (`lead_type = 'inbound'`) which appear in the admin dashboard at `/admin` — never mix them.

```sql
-- Core query used by the prospecting dashboard:
SELECT * FROM leads 
WHERE lead_type = 'prospect' 
ORDER BY lead_score DESC NULLS LAST, created_at DESC;
```

**Full Column List:**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | uuid | gen_random_uuid() | Primary key |
| `profile_id` | uuid | null | Links to auth profile if converted |
| `source` | enum `lead_source` | 'intake_form' | How the lead was acquired |
| `name` | text | null | Full name (display) |
| `first_name` | text | null | First name |
| `last_name` | text | null | Last name |
| `email` | text | null | Email address |
| `phone` | text | null | Phone number |
| `company` | text | null | Company name |
| `job_title` | text | null | Job title / role |
| `company_size` | text | null | Company size range |
| `company_domain` | text | null | Company website domain |
| `company_industry` | text | null | Industry classification |
| `linkedin_url` | text | null | LinkedIn profile URL |
| `linkedin_headline` | text | null | LinkedIn headline text |
| `linkedin_summary` | text | null | LinkedIn about/summary |
| `website` | text | null | Personal/company website |
| `location` | text | null | Geographic location |
| `lead_score` | integer | 0 | Composite score (0-200+) — higher = better |
| `lead_type` | text | 'prospect' | **CRITICAL: 'prospect' or 'inbound'** |
| `status` | enum `lead_status` | 'new' | Current pipeline status |
| `nurture_status` | text | 'pending' | Drip campaign status |
| `lead_potential` | text | 'unknown' | Manual quality assessment |
| `engagement_tier` | text | 'cold' | cold/warm/hot based on interactions |
| `personality_type` | text | null | Derived personality (action/nurture/etc.) |
| `personality_confidence` | numeric | 0 | Confidence in personality classification |
| `personality_signals` | jsonb | {} | Raw signals used for personality |
| `intent_topics` | jsonb | [] | Topics/keywords showing buying intent |
| `opportunity_tags` | jsonb | [] | Opportunity classification tags |
| `tags` | text[] | {} | General-purpose tags array |
| `enrichment_source` | text | null | Where enrichment data came from |
| `enrichment_data` | jsonb | null | Raw enrichment payload |
| `enriched_at` | timestamptz | null | When last enriched |
| `icp_match_score` | integer | null | Ideal Customer Profile match score |
| `source` | enum | varies | Lead source (see enum below) |
| `added_by` | text | 'system' | Who/what created this lead |
| `prospecting_run_id` | uuid | null | Links to batch prospecting run |
| `external_id` | text | null | ID in external system (Apollo, etc.) |
| `campaign_assigned` | uuid | null | Assigned drip campaign |
| `contact_count` | integer | 0 | Number of times contacted |
| `last_contacted_at` | timestamptz | null | Last outreach timestamp |
| `replied_at` | timestamptz | null | When prospect replied |
| `reply_gmail_id` | text | null | Gmail thread ID of reply |
| `booking_event_id` | text | null | If they booked a call |
| `booked_at` | timestamptz | null | When they booked |
| `disqualified_reason` | text | null | Why disqualified |
| `disqualified_at` | timestamptz | null | When disqualified |
| `metadata` | jsonb | {} | Flexible metadata store |
| `notes` | text | null | Legacy notes field |
| `service_interest` | text | null | Service they're interested in |
| `budget_range` | text | null | Budget range |
| `timeline` | text | null | Project timeline |
| `where_we_met` | text | null | Meeting context |
| `created_at` | timestamptz | now() | Record creation |
| `updated_at` | timestamptz | now() | Last update |

### 3.2 Enum: `lead_source`

```
intake_form, marketplace, event, manual, referral, website, 
vibe_prospecting, apollo, automated, mini_blueprint, 
website_intake, filter_score, assessment
```

Prospecting leads typically have source = `vibe_prospecting`, `apollo`, `automated`, or `manual`.

### 3.3 Enum: `lead_status`

```
new → contacted → replied → qualified → proposal_sent → negotiation → won → converted
                                                                    → lost
                                                      → disqualified
                                                      → bad_lead
                                                      → not_qualified
```

**Current distribution (3,769 prospect leads):**
- new: 2,346
- contacted: 1,181
- disqualified: 218
- qualified: 10
- negotiation: 6
- proposal_sent: 5
- replied: 3

### 3.4 `prospect_notes` Table

```sql
CREATE TABLE prospect_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id),
  note_type text,        -- 'call', 'email', 'research', 'general'
  content text,          -- Note content
  outcome text,          -- Result of interaction
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 3.5 `drip_queue` Table (Email Outreach)

Each row = one scheduled or sent email in a drip sequence.

```sql
CREATE TABLE drip_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,                    -- Recipient email
  name text,                     -- Recipient name
  lead_id uuid REFERENCES leads(id),
  sequence text,                 -- Sequence name (e.g., 'prospecting_nurture')
  step integer,                  -- Step number in sequence
  next_send_at timestamptz,      -- When to send
  last_sent_at timestamptz,      -- When it was sent
  status text,                   -- 'pending', 'sent', 'failed', 'skipped'
  channel text,                  -- 'email', 'sms'
  subject text,                  -- Email subject
  body text,                     -- Email body (HTML)
  template_id text,              -- Template reference
  sent_via text,                 -- 'resend', 'gmail'
  campaign_id uuid,              -- Campaign reference
  variant_id uuid,               -- A/B test variant
  opened_at timestamptz,         -- First open
  clicked_at timestamptz,        -- First click
  replied_at timestamptz,        -- Reply received
  bounced boolean DEFAULT false,
  opens integer DEFAULT 0,       -- Open count
  clicks integer DEFAULT 0,      -- Click count
  replies integer DEFAULT 0,     -- Reply count
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 3.6 `drip_config` Table (Send Settings)

```sql
CREATE TABLE drip_config (
  id uuid PRIMARY KEY,
  timezone text,              -- e.g., 'America/Phoenix'
  send_window_start integer,  -- Hour (24h) to start sending
  send_window_end integer,    -- Hour (24h) to stop sending
  max_per_batch integer,      -- Max emails per batch (currently 150)
  max_per_day integer,        -- Daily send limit
  daily_ramp_pct numeric,     -- Daily ramp-up percentage
  max_per_day_ceiling integer, -- Absolute daily ceiling
  last_ramp_at timestamptz
);
```

### 3.7 Other Tables Referenced

| Table | Purpose |
|-------|---------|
| `prospect_filters` | Saved filter configurations for lead discovery |
| `prospect_insights` | Website visitor tracking data |
| `linkedin_prospects` | LinkedIn connection/messaging tracking |
| `channels_enabled` | Which outreach channels are active (email, LinkedIn, SMS) |
| `intent_topics` | Topic/keyword categories for intent scoring |
| `speaking_opportunities` | Speaking gig pipeline (kanban) |
| `speaking_events` | Upcoming/past speaking events |

---

## 4. Edge Functions (Prospecting-Relevant)

All edge functions are Supabase Deno functions called via:
```
POST https://trpnlkntvulkjerevngm.supabase.co/functions/v1/{function-name}
Headers: Authorization: Bearer {anon_key}
Body: JSON
```

### Email & Outreach

| Function | Purpose | Key Inputs |
|----------|---------|------------|
| `process-drip` (v18) | Main drip processor — picks up pending queue items and sends them | Called on schedule, no inputs needed |
| `send-plain-email` | Send a single email via Resend | `{ to, subject, body, from_name }` |
| `send-email` | Branded email sender | `{ to, subject, html, lead_id }` |
| `speaker-campaign` (v3) | Speaker lead drip campaign | `{ cohort_id }` |
| `quick-blast` | Bulk email blast to a segment | `{ segment, subject, body }` |
| `send-sms` | SMS outreach | `{ to, message, lead_id }` |

### Tracking & Analytics

| Function | Purpose | Key Inputs |
|----------|---------|------------|
| `track-open` | Email open tracking (1x1 pixel) | `{ queue_id }` via query param |
| `track-click` | Email click tracking (redirect) | `{ queue_id, url }` via query params |
| `track-visitor` | Website visitor identification | `{ visitor_id, page, referrer }` |

### Lead Management

| Function | Purpose | Key Inputs |
|----------|---------|------------|
| `enrich-lead-apollo` | Enrich a single lead via Apollo People Match API | `{ lead_id }` |
| `search-leads` | Lead search/discovery API | `{ filters, limit }` |
| `enrich-leads` | Bulk lead enrichment (Apollo) | `{ lead_ids[] }` |
| `manage-drip` | Add/remove leads from drip sequences | `{ action, lead_id, sequence }` |
| `process-drip-queue` | Process the drip queue (batch sender) | Called on schedule |

### AI Agents

| Function | Purpose |
|----------|---------|
| `marketing-agent` | Automated marketing content generation |
| `orchestrator-briefing` | Daily briefing compilation |
| `orchestrator-manager` | Agent orchestration layer |

---

## 5. Lead Lifecycle & Pipeline

### 5.1 Lead Sources (How Prospects Enter)

1. **Apollo API** — Bulk prospecting searches by ICP criteria (industry, title, company size)
2. **Vibe Prospecting** — Alternative enrichment/discovery tool
3. **Overnight Scraper** — Automated scheduled task that runs Apollo searches and inserts new prospects
4. **Manual Entry** — Daniel adds leads manually from networking, events, etc.
5. **LinkedIn** — Tracked via the LinkedIn tab, linked to leads

### 5.2 Lead Scoring

`lead_score` is a composite integer (0-200+) based on:
- Company fit (industry, size, domain presence)
- Role fit (C-suite, VP, Director = higher)
- Engagement signals (opened emails, clicked links, replied)
- Intent signals (topics matching service offerings)
- Enrichment completeness

### 5.3 Engagement Tiers

| Tier | Meaning |
|------|---------|
| `cold` | No interaction yet |
| `warm` | Some engagement (opened, clicked) |
| `hot` | Active engagement (replied, booked, multiple interactions) |

### 5.4 Nurture Status

| Status | Meaning |
|--------|---------|
| `pending` | Not yet in a drip sequence |
| `active` | Currently receiving drip emails |
| `paused` | Drip paused (manual or auto) |
| `completed` | Finished all sequence steps |
| `opted_out` | Unsubscribed |

### 5.5 Personality Types

Leads are classified into personality types for outreach personalization:
- `action` — Direct, results-oriented (respond to ROI, speed, outcomes)
- `nurture` — Relationship-oriented (respond to trust, testimonials, community)
- Other types may exist based on enrichment signals

---

## 6. Outreach System

### 6.1 Drip Sequences

Sequences are defined by name in the `drip_queue.sequence` column. Each lead gets one row per step. The `process-drip` edge function runs on a schedule and sends pending items within the send window.

**Send Configuration:**
- Timezone: America/Phoenix
- Send window: configurable hours (e.g., 8am-6pm)
- Max per batch: 150
- Emails sent via: Resend API
- From: `Daniel Knight <daniel@knightops.biz>`

### 6.2 Email Tracking

Every sent email includes:
- **Open tracking:** 1x1 invisible pixel → calls `track-open` edge function → updates `drip_queue.opens`, `opened_at`
- **Click tracking:** Links rewritten to pass through `track-click` → updates `drip_queue.clicks`, `clicked_at` → redirects to original URL

### 6.3 SMS Outreach

The `send-sms` edge function handles SMS. SMS templates are stored in the dashboard and support variable substitution (`{name}`, `{company}`, etc.).

---

## 7. Key Queries for Integration

### Get all prospect leads (sorted by score)
```
GET /rest/v1/leads?lead_type=eq.prospect&order=lead_score.desc.nullslast,created_at.desc
```

### Get leads by status
```
GET /rest/v1/leads?lead_type=eq.prospect&status=eq.new&order=lead_score.desc.nullslast
```

### Get hot leads ready for outreach
```
GET /rest/v1/leads?lead_type=eq.prospect&engagement_tier=eq.hot&status=neq.disqualified
```

### Get leads with phone numbers (for voice AI)
```
GET /rest/v1/leads?lead_type=eq.prospect&phone=not.is.null&status=in.(new,contacted,qualified)
```

### Get notes for a lead
```
GET /rest/v1/prospect_notes?lead_id=eq.{lead_id}&order=created_at.desc
```

### Update lead status after call
```
PATCH /rest/v1/leads?id=eq.{lead_id}
Body: { "status": "contacted", "last_contacted_at": "2026-05-24T12:00:00Z", "contact_count": 4 }
```

### Add a note after call
```
POST /rest/v1/prospect_notes
Body: { "lead_id": "{id}", "note_type": "call", "content": "Discussed AI consulting needs...", "outcome": "interested" }
```

### Add to drip sequence
```
POST /rest/v1/drip_queue
Body: { "lead_id": "{id}", "email": "...", "name": "...", "sequence": "post_call_nurture", "step": 1, "status": "pending", "next_send_at": "..." }
```

---

## 8. Sample Prospect Lead (Data Shape)

```json
{
  "id": "b39d3d82-5a6b-4fd4-b729-2dec756c3686",
  "name": "Jason Lawhorn",
  "first_name": "Jason",
  "last_name": "Lawhorn",
  "email": "jason.lawhorn@lawhorncpa.com",
  "phone": null,
  "company": "Lawhorn CPA Group",
  "job_title": "President & CEO",
  "company_domain": "lawhorncpa.com",
  "company_industry": "Accounting & Tax",
  "linkedin_url": "https://www.linkedin.com/in/jason-lawhorn-a508949/",
  "lead_score": 178,
  "status": "contacted",
  "nurture_status": "pending",
  "source": "automated",
  "lead_type": "prospect",
  "lead_potential": "unknown",
  "engagement_tier": "hot",
  "personality_type": "action",
  "intent_topics": "client portal, document management app, tax workflow automation, client onboarding",
  "contact_count": 2,
  "last_contacted_at": "2026-05-15T14:13:16.119Z",
  "location": null,
  "tags": []
}
```

---

## 9. Critical Rules for Any Integration

### Rule 1: Never Mix Prospect and Inbound Leads
- Prospecting leads: `lead_type = 'prospect'` — visible at `/prospecting`
- Inbound leads: `lead_type = 'inbound'` — visible at `/admin`
- **Always filter by `lead_type = 'prospect'`** when querying for this dashboard

### Rule 2: Enrichment Source Naming
When enriching leads, use `enrichment_source = 'apollo_user_enrichment'` (not just `'apollo'`). The system has a filter that checks `enrichment_source ILIKE '%apollo%' AND added_by IN ('nighthawk_scraper', 'system')` to segregate automated prospecting from user-triggered enrichment.

### Rule 3: Status Transitions
Follow the natural pipeline flow:
```
new → contacted → replied → qualified → proposal_sent → negotiation → won
                                                                    → lost
Any stage → disqualified (with disqualified_reason + disqualified_at)
Any stage → bad_lead
Any stage → not_qualified
```

### Rule 4: Contact Tracking
When making outreach (call, email, SMS), always update:
- `contact_count` (increment by 1)
- `last_contacted_at` (current timestamp)
- `status` (to 'contacted' if currently 'new')
- Add a `prospect_notes` entry with `note_type` and `content`

### Rule 5: Supabase Auth Headers
All API calls require:
```
apikey: {anon_key}
Authorization: Bearer {anon_key}
Content-Type: application/json
```

For mutations (INSERT/UPDATE/DELETE), also include:
```
Prefer: return=representation
```

---

## 10. Business Context for Voice AI

**What Knight Ops Sells:**
- Night Launch ($1,497) — Overnight website delivery
- Night Build ($7,497) — Full-stack web/mobile app
- Night Build Pro ($14,997) — Full app store deployment
- AI Marketing Machine ($99/mo) — Marketing automation
- Speed to Value VIP Day — Intensive strategy session

**Who the Prospects Are:**
- Small business owners, founders, CEOs (5-200 employees)
- Industries: Real estate, accounting, coaching, legal, marketing agencies, e-commerce
- Pain points: Need custom apps, want to automate, outdated websites, no CRM
- Decision makers with budget authority

**Daniel's Voice/Tone:**
- Confident but not pushy
- Value-first approach — lead with what you can do for them
- References community (Unicorn Universe) and relationships
- Frames conversations around ROI and speed ("overnight delivery")
- Uses phrases like "send business your way," "exponential growth," "purpose-driven"

**Default Opening Template:**
> "Hey {name}, this is Daniel Knight. Let's find a time when you can tell me more about what you do, and I'll see if I can send some business your way."

---

## 11. Dashboard Functions Reference (99 Functions)

Organized by category:

### Lead Management
`renderLeadsTable`, `sortAndRenderLeads`, `sortByCol`, `toggleSortDir`, `setLeadStatus`, `setLeadPotential`, `scoreLeadForOffer`, `selectOffer`

### LinkedIn
`loadLinkedInProspects`, `renderLiProspects`, `filterLiProspects`, `setLiStatus`, `toggleLiCard`, `copyLiMsg`, `switchLiMsg`

### Lead Finder
`runLeadFinder`, `renderFinderResults`, `renderFinderFilters`, `clearFinderResults`

### Nurture / Drip
`loadUpcomingSends`, `renderSequenceFlow`, `addSequenceStep`, `loadEditStep`, `saveSendConfig`, `showPreview`, `showQueuedPreview`

### Email
`loadSentEmails`, `renderOutreachLog`, `sentNextPage`, `sentPrevPage`, `updateSentPagination`

### Tracking
`loadTrackingData`, `renderVisitorsTable`, `renderVisitorKPIs`, `renderTrackedSites`, `toggleSiteActive`, `addTrackedSite`

### Speaking
`loadSpeakingData`, `renderSpeakingPipeline`, `renderSpeakingStats`, `renderUpcomingEvents`, `openSI`, `closeSI`, `initSIDragDrop`, `spkFetch`, `spkInsert`, `spkUpdate`, `spkCallEdge`

### Filters / Config
`loadIndustryFilters`, `renderIndustryFilters`, `addIndustryFilter`, `removeIndustryFilter`, `loadChannelConfig`, `saveChannelConfig`, `saveAllFilters`, `saveTopicsConfig`, `addTopicCategory`, `removeTopicCategory`, `addKeywordToCategory`, `showAddKeyword`, `updateTopicCount`

### SMS
`loadSmsTemplate`, `saveSmsTemplate`, `updateSmsPreview`, `buildSmsText`

### Utilities
`sbGet`, `sbSelect`, `sbUpdate`, `esc`, `escHtml`, `formatDate`, `formatTime`, `timeAgo`, `capitalizeFirst`, `maskText`, `copyText`, `copySnippet`, `updateSnippetDropdown`, `fitBar`, `getDateRange`, `setKPIRange`, `updateKPIs`, `togglePrivacy`, `toggleConfigEdit`, `detailField`, `showTab`, `saveNote`, `populateActionSelect`, `buildCompanyOverview`, `openVD`, `closeVD`, `loadDashboardData`
