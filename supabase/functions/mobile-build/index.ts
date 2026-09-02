import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mobile App Builder - core state machine for mobile_builds.
// Actions: save | resume | submit | approve | save_edit | add_mockup | choose_mockup | build_status
//
// Deliberate differences from dashboard-build:
//   * ONE FIELDS allow-list for every action here. dashboard-build (41 entries) and
//     dashboard-mockups (34) have already drifted, so a field saved by one path is silently
//     dropped by the other.
//   * ONE ready state: 'approved'. The dashboard writes 'approved' from one path and 'queued'
//     from two others, and the orchestrator polled for the wrong one for months.
//   * Mockup add/choose live here rather than in a separate function, so they share FIELDS.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPA = Deno.env.get('SUPABASE_URL')!;
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY');
const sb = createClient(SUPA, SVC, { auth: { persistSession: false } });
const NOTIFY = ['dknightunicorn@gmail.com', 'daniel@knightops.biz'];
const TOK = /^[a-zA-Z0-9]+$/;

// THE allow-list. Any field added to gather() in mobile-intake.html MUST be added here AND
// exist as a column on mobile_builds, or the save silently drops it.
const FIELDS = [
  'mode', 'first_name', 'last_name', 'email', 'phone', 'company', 'business_name', 'niche',
  'what_they_do', 'offers', 'audience', 'team', 'brand',
  'target', 'target_reason', 'archetype',
  'web_dashboard', 'web_app', 'ops_modules', 'ops_kpis', 'dashboard_mockup_html',
  'screens', 'features', 'tabs', 'capabilities', 'screen_notes', 'max_tabs',
  'auth_methods', 'roles', 'role_matrix', 'monetization', 'integrations', 'ai_features',
  'data_model', 'goal_criteria', 'store', 'store_md',
  'hosting', 'domain', 'client_size',
  'additional_details', 'transcripts', 'final_notes', 'file_paths', 'upload_paths',
  'ai_mockup_html', 'outline_html', 'spec_md', 'build_prompt'
];

function pick(p: any) {
  const o: any = {};
  for (const f of FIELDS) if (p[f] !== undefined) o[f] = p[f];
  return o;
}
const uuid = () => crypto.randomUUID().replace(/-/g, '');
const slugify = (s: string) =>
  String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function mail(subject: string, html: string, to: string[] = NOTIFY) {
  if (!RESEND) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Daniel Knight <daniel@knightops.biz>', to, subject, html })
    });
  } catch (_e) { /* never block a save on email */ }
}

async function byToken(body: any) {
  if (body.id) return await sb.from('mobile_builds').select('*').eq('id', body.id).maybeSingle();
  if (body.resume_token && TOK.test(String(body.resume_token)))
    return await sb.from('mobile_builds').select('*').eq('resume_token', body.resume_token).maybeSingle();
  return { data: null, error: null } as any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'save';

    // ---------- resume ----------
    if (action === 'resume') {
      const t = String(body.resume_token || '');
      if (!TOK.test(t)) return json({ error: 'bad token' }, 400);
      const g = await sb.from('mobile_builds').select('*').eq('resume_token', t).maybeSingle();
      if (!g.data) return json({ error: 'not found' }, 404);
      return json({ ok: true, build: g.data });
    }

    // ---------- save (upsert by resume_token) ----------
    if (action === 'save') {
      const patch = pick(body);
      patch.status = body.status || 'draft';
      let rt = body.resume_token && TOK.test(String(body.resume_token)) ? String(body.resume_token) : null;
      let isNew = false;
      let row: any = null;

      if (rt) {
        const up = await sb.from('mobile_builds').update(patch).eq('resume_token', rt).select().maybeSingle();
        row = up.data;
      }
      if (!row) {
        // Do not mint a row for an empty POST. This endpoint is anon-reachable, so without
        // this guard a bot (or a stray `curl -d '{}'`) accumulates blank drafts forever.
        const meaningful = patch.email || patch.business_name || patch.company ||
          (Array.isArray(patch.screens) && patch.screens.length) || patch.what_they_do;
        if (!meaningful) return json({ error: 'nothing to save yet' }, 400);
        isNew = true;
        rt = rt || (uuid() + uuid());
        const ins = await sb.from('mobile_builds').insert({
          ...patch,
          resume_token: rt,
          share_review_token: uuid(),
          share_edit_token: uuid()
        }).select().single();
        if (ins.error) return json({ error: ins.error.message }, 500);
        row = ins.data;
      }

      if (isNew || body.notify) {
        const link = 'https://knightops.biz/mobile-intake?resume=' + row.resume_token;
        await mail(
          '📱 Mobile app build saved: ' + (row.business_name || row.company || 'Untitled'),
          `<p>Edit / resume this mobile app build:</p><p><a href="${link}">${link}</a></p>`
        );
      }
      return json({ ok: true, build: row });
    }

    // ---------- submit ----------
    if (action === 'submit') {
      const patch = pick(body);
      patch.status = 'submitted';
      let rt = body.resume_token && TOK.test(String(body.resume_token)) ? String(body.resume_token) : null;
      let row: any = null;

      if (rt) {
        const up = await sb.from('mobile_builds').update(patch).eq('resume_token', rt).select().maybeSingle();
        row = up.data;
      }
      if (!row) {
        rt = rt || (uuid() + uuid());
        const ins = await sb.from('mobile_builds').insert({
          ...patch, resume_token: rt, share_review_token: uuid(), share_edit_token: uuid()
        }).select().single();
        if (ins.error) return json({ error: ins.error.message }, 500);
        row = ins.data;
      }

      if (!row.slug) {
        const slug = slugify(row.company || row.business_name) + '-' + Math.random().toString(36).slice(2, 7);
        await sb.from('mobile_builds').update({ slug }).eq('id', row.id);
        row.slug = slug;
      }

      // lead (dedupe by email + inbound)
      let lead_id = row.lead_id || null;
      if (!lead_id && row.email) {
        const ex = await sb.from('leads').select('id').eq('email', row.email).eq('lead_type', 'inbound').maybeSingle();
        if (ex.data) lead_id = ex.data.id;
        else {
          const li = await sb.from('leads').insert({
            name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.company,
            email: row.email, phone: row.phone, company: row.company,
            source: 'intake_form', lead_type: 'inbound', status: 'new',
            tags: ['mobile-app-build'],
            notes: 'Mobile App Builder intake: ' + (row.business_name || row.company || '')
          }).select('id').maybeSingle();
          lead_id = li.data?.id || null;
        }
      }

      // project
      let project_id = row.project_id || null;
      if (!project_id) {
        try {
          const pi = await sb.from('projects').insert({
            name: (row.company || row.business_name || 'Client') + ' App',
            description: String(row.what_they_do || '').slice(0, 500),
            status: 'discovery',
            lead_id,
            platform: (row.target === 'web') ? 'web' : ((row.target === 'both' || row.web_app || row.web_dashboard) ? 'both' : 'native'),
            build_target: 'desktop', // initial scaffold provisions new infra + needs EAS tooling
            intake_data: {
              industry: row.niche, brand_color: (row.brand || {}).primary,
              core_outcome: row.what_they_do, archetype: row.archetype,
              target: row.target, source: 'mobile_builder'
            },
            additional_app_details: row.build_prompt || null
          }).select('id').maybeSingle();
          project_id = pi.data?.id || null;
        } catch (_e) { /* non-fatal */ }
      }

      try {
        await sb.from('intake_submissions').insert({
          form_type: 'mobile_app', first_name: row.first_name, last_name: row.last_name,
          email: row.email, company: row.company, source: 'mobile_intake', status: 'new', lead_id
        });
      } catch (_e) { /* non-fatal */ }

      await sb.from('mobile_builds').update({ lead_id, project_id }).eq('id', row.id);
      row.lead_id = lead_id; row.project_id = project_id;

      const rev = 'https://knightops.biz/mb?t=' + row.share_review_token;
      const edt = 'https://knightops.biz/mb?t=' + row.share_edit_token;
      await mail(
        '📱 New mobile app build submitted: ' + (row.business_name || row.company || ''),
        `<p><b>${row.business_name || row.company || ''}</b> — target <b>${row.target || 'native'}</b></p>
         <p>Review link: <a href="${rev}">${rev}</a><br>Edit link: <a href="${edt}">${edt}</a></p>
         <p>Admin: <a href="https://knightops.biz/admin#mobileApps/${row.id}">open in admin</a></p>`
      );

      return json({
        ok: true, build: row,
        share_review_token: row.share_review_token,
        share_edit_token: row.share_edit_token
      });
    }

    // ---------- approve (the ONE ready state) ----------
    if (action === 'approve') {
      let key: string | null = null, val: string | null = null;
      if (body.id) { key = 'id'; val = body.id; }
      else if (body.share_review_token && TOK.test(String(body.share_review_token))) { key = 'share_review_token'; val = body.share_review_token; }
      else if (body.resume_token && TOK.test(String(body.resume_token))) { key = 'resume_token'; val = body.resume_token; }
      if (!key) return json({ error: 'no key' }, 400);

      const patch: any = { admin_notes: body.admin_notes ?? undefined };
      if (body.ai_mockup_html) patch.ai_mockup_html = body.ai_mockup_html;
      if (body.spec_md) patch.spec_md = body.spec_md;
      if (body.store_md) patch.store_md = body.store_md;
      if (body.build_prompt) patch.build_prompt = body.build_prompt;
      if (body.chosen_mockup) patch.chosen_mockup = body.chosen_mockup;

      // note_only lets a client leave feedback without flipping the build to ready
      if (!body.note_only) {
        patch.status = 'approved';
        patch.approved_at = new Date().toISOString();
        patch.approved_by = body.approved_by || 'client';
        patch.build_requested_at = new Date().toISOString();
        patch.build_source = body.build_source || 'approval';
        patch.build_error = null;
      }
      Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

      const up = await sb.from('mobile_builds').update(patch).eq(key, val).select().maybeSingle();
      if (!up.data) return json({ error: 'not found' }, 404);

      if (body.build_prompt && up.data.project_id) {
        try { await sb.from('projects').update({ additional_app_details: body.build_prompt }).eq('id', up.data.project_id); } catch (_e) { /* noop */ }
      }
      await mail(
        (body.note_only ? '📝 Note on' : '✅ Approved') + ' mobile app build: ' + (up.data.business_name || ''),
        `<p>${body.note_only ? 'Client left a note' : 'Approved and queued for build'}.</p>
         <p>${body.admin_notes ? String(body.admin_notes).slice(0, 2000) : ''}</p>
         <p><a href="https://knightops.biz/admin#mobileApps/${up.data.id}">Open in admin</a></p>`
      );
      return json({ ok: true, build: up.data });
    }

    // ---------- save_edit (client-facing narrow edit) ----------
    if (action === 'save_edit') {
      const t = String(body.share_edit_token || '');
      if (!TOK.test(t)) return json({ error: 'bad token' }, 400);
      const allow = ['business_name', 'company', 'niche', 'what_they_do', 'offers', 'audience', 'team', 'additional_details'];
      const patch: any = {};
      for (const f of allow) if (body[f] !== undefined) patch[f] = body[f];
      const up = await sb.from('mobile_builds').update(patch).eq('share_edit_token', t).select().maybeSingle();
      if (!up.data) return json({ error: 'not found' }, 404);
      return json({ ok: true, build: up.data });
    }

    // ---------- add_mockup (SHA-256 dedupe) ----------
    if (action === 'add_mockup') {
      const g = await byToken(body);
      if (!g.data) return json({ error: 'not found' }, 404);
      const html = String(body.html || '');
      if (html.length < 200) return json({ error: 'empty mockup' }, 400);
      const hash = await sha256(html);
      const list = Array.isArray(g.data.mockups) ? g.data.mockups.slice() : [];
      const dup = list.find((m: any) => m && m.hash === hash);
      if (dup) {
        if (body.label && dup.label !== body.label) {
          dup.label = body.label;
          await sb.from('mobile_builds').update({ mockups: list }).eq('id', g.data.id);
        }
        return json({ ok: true, duplicate: true, mockup_id: dup.id, count: list.length });
      }
      const entry = { id: crypto.randomUUID(), label: body.label || ('Version ' + (list.length + 1)), html, hash, created_at: new Date().toISOString() };
      list.push(entry);
      const trimmed = list.slice(-16);
      const patch: any = { mockups: trimmed, ai_mockup_html: html };
      if (g.data.status === 'draft' || g.data.status === 'submitted') patch.status = 'reviewed';
      await sb.from('mobile_builds').update(patch).eq('id', g.data.id);
      return json({ ok: true, mockup_id: entry.id, count: trimmed.length });
    }

    // ---------- choose_mockup ----------
    if (action === 'choose_mockup') {
      const t = String(body.token || '');
      let g: any;
      if (body.id) g = await sb.from('mobile_builds').select('*').eq('id', body.id).maybeSingle();
      else if (TOK.test(t)) g = await sb.from('mobile_builds').select('*').or(`share_review_token.eq.${t},share_edit_token.eq.${t},resume_token.eq.${t}`).maybeSingle();
      else return json({ error: 'bad token' }, 400);
      if (!g.data) return json({ error: 'not found' }, 404);
      const list = Array.isArray(g.data.mockups) ? g.data.mockups : [];
      const m = list.find((x: any) => x && x.id === body.mockup_id);
      if (!m) return json({ error: 'mockup not found' }, 404);
      await sb.from('mobile_builds').update({ chosen_mockup: m.id, ai_mockup_html: m.html }).eq('id', g.data.id);
      return json({ ok: true, chosen: m.id });
    }

    // ---------- build_status (progress reporting from the desktop build) ----------
    if (action === 'build_status') {
      const id = body.build_id || body.id;
      if (!id) return json({ error: 'missing build_id' }, 400);
      const patch: any = { build_last_update: new Date().toISOString() };
      if (body.stage !== undefined) patch.build_stage = String(body.stage).slice(0, 240);
      if (body.progress !== undefined) patch.build_progress = Math.max(0, Math.min(100, parseInt(body.progress, 10) || 0));
      if (body.live_url) patch.build_live_url = String(body.live_url).slice(0, 500);
      if (body.repo_url) patch.build_repo_url = String(body.repo_url).slice(0, 500);
      if (body.eas_project_id) patch.eas_project_id = String(body.eas_project_id).slice(0, 200);
      if (body.error) patch.build_error = String(body.error).slice(0, 4000);
      if (['building', 'built', 'error'].includes(body.status)) {
        patch.status = body.status;
        if (body.status === 'built') { patch.built_at = new Date().toISOString(); patch.build_progress = 100; }
        if (body.status === 'building' && !body.no_start) patch.build_started_at = new Date().toISOString();
      }
      const up = await sb.from('mobile_builds').update(patch).eq('id', id).select().maybeSingle();
      if (!up.data) return json({ error: 'not found' }, 404);
      if (up.data.project_id && (body.repo_url || body.live_url)) {
        try {
          const pp: any = {};
          if (body.repo_url) pp.repo_url = body.repo_url;
          if (body.live_url) pp.app_site_url = body.live_url;
          if (Object.keys(pp).length) await sb.from('projects').update(pp).eq('id', up.data.project_id);
        } catch (_e) { /* noop */ }
      }
      return json({ ok: true, build: up.data });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
