// automations-sync — keeps the Automations registry current from sources the browser
// cannot reach itself.
//
//   action 'github'   pull every repo owned by 10xUnicorn (a USER account) via GITHUB_TOKEN, upsert
//                     github_repos, and match each to a project by repo_url (exact,
//                     case-insensitive, with/without .git) then by slug.
//   action 'refresh'  run ko_automations_refresh_live() (cron + triggers) as service role.
//   action 'all'      both.
//
// Auth: an admin's Supabase session JWT (profiles.role in admin/super_admin), same
// self-verifying pattern as email-ai / email-files. verify_jwt=false at the gateway so
// the function can return a readable JSON error instead of a bare 401.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') || '';
const ORG          = Deno.env.get('GITHUB_ORG') || '10xUnicorn';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return { error: 'no_auth' };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { error: 'bad_token' };
  const svc = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: prof } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!prof || !['admin', 'super_admin'].includes(prof.role)) return { error: 'not_admin' };
  return { svc, user };
}

function normRepo(u: string | null | undefined) {
  if (!u) return '';
  return u.trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
}
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function syncGithub(svc: ReturnType<typeof createClient>) {
  if (!GITHUB_TOKEN) return { error: 'no_github_token', hint: 'Set GITHUB_TOKEN in Supabase secrets (repo read on org 10xUnicorn).' };
  // 10xUnicorn is a GitHub USER account, not an organization (verified 2026-09-04: /users/10xUnicorn → type "User"),
  // so /orgs/<name>/repos returns 404. Ask GitHub which it is, then use the endpoint that matches. For a user,
  // /user/repos?affiliation=owner (the token's own repos, private included) beats /users/<name>/repos (public only).
  const gh = (url: string) => fetch(url, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'knight-ops-automations-sync' } });
  const who = await gh(`https://api.github.com/users/${ORG}`);
  if (!who.ok) return { error: 'github_' + who.status, detail: (await who.text()).slice(0, 300), hint: `GitHub does not know "${ORG}" for this token.` };
  const kind = ((await who.json()).type || 'User') as string;
  const base = kind === 'Organization'
    ? `https://api.github.com/orgs/${ORG}/repos?type=all&sort=pushed`
    : `https://api.github.com/user/repos?affiliation=owner&sort=pushed`;
  const repos: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await gh(`${base}&per_page=100&page=${page}`);
    if (!r.ok) return { error: 'github_' + r.status, detail: (await r.text()).slice(0, 300), account_type: kind };
    const batch = await r.json();
    repos.push(...batch.filter((g: any) => (g.owner?.login || '').toLowerCase() === ORG.toLowerCase()));
    if (batch.length < 100) break;
  }

  // Two .neq() calls rather than .not('status','in',...): the first sync matched 0 of 24 repos because that
  // filter returned no projects at all (status is an enum; the in-list form is fragile). Verified 2026-09-05.
  const { data: projects, error: pErr } = await svc.from('projects').select('id,name,repo_url').neq('status', 'cancelled').neq('status', 'archived');
  if (pErr) return { error: 'projects_query_failed', detail: pErr.message };
  const byUrl = new Map<string, string>();
  const bySlug = new Map<string, string>();
  for (const p of projects || []) {
    if (p.repo_url) byUrl.set(normRepo(p.repo_url), p.id);
    bySlug.set(slug(p.name), p.id);
  }

  const rows = repos.map((g) => {
    let project_id: string | null = byUrl.get(normRepo(g.html_url)) || null;
    let match_kind: string | null = project_id ? 'repo_url' : null;
    if (!project_id) {
      const s = slug(g.name);
      for (const [ps, pid] of bySlug) {
        if (ps === s || ps.includes(s) || s.includes(ps.split('-')[0] + '-' + (ps.split('-')[1] || ''))) { project_id = pid; match_kind = 'name'; break; }
      }
    }
    return {
      id: g.id, name: g.name, full_name: g.full_name, url: g.html_url, description: g.description,
      is_private: g.private, is_archived: g.archived, default_branch: g.default_branch, language: g.language,
      pushed_at: g.pushed_at, open_issues: g.open_issues_count, project_id, match_kind, synced_at: new Date().toISOString(),
    };
  });

  // Keep a manual match if one was set by hand.
  const { data: existing } = await svc.from('github_repos').select('id,project_id,match_kind').eq('match_kind', 'manual');
  const manual = new Map((existing || []).map((e: any) => [e.id, e.project_id]));
  for (const r of rows) if (manual.has(r.id)) { r.project_id = manual.get(r.id); r.match_kind = 'manual'; }

  const { error } = await svc.from('github_repos').upsert(rows, { onConflict: 'id' });
  if (error) return { error: 'upsert_failed', detail: error.message };

  // Repos deleted on GitHub stop coming back. Upsert alone would keep them forever (planet-calm-dashboard
  // survived its own deletion on 2026-09-05), so drop any row this sync did not see.
  // Guard: an empty GitHub answer must never wipe the table.
  const seen = rows.map((r) => r.id);
  let gone: any[] = [];
  if (seen.length > 0) {
    const g = await svc.from('github_repos').select('id,full_name').not('id', 'in', `(${seen.join(',')})`);
    gone = g.data || [];
    if (gone.length) await svc.from('github_repos').delete().in('id', gone.map((x: any) => x.id));
  }

  // Belt and braces: match by normalised URL in SQL too, in case the JS map missed a case/suffix variant.
  await svc.rpc('ko_github_repos_match');

  // Backfill projects.repo_url when a name match found a repo and the project has none (additive only).
  let backfilled = 0;
  for (const r of rows) {
    if (r.project_id && r.match_kind === 'name') {
      const p = (projects || []).find((x: any) => x.id === r.project_id);
      if (p && !p.repo_url) {
        const { error: e2 } = await svc.from('projects').update({ repo_url: r.url }).eq('id', r.project_id).is('repo_url', null);
        if (!e2) backfilled++;
      }
    }
  }
  const { count: matchedNow } = await svc.from('github_repos').select('id', { count: 'exact', head: true }).not('project_id', 'is', null);
  return { ok: true, account_type: kind, repos: rows.length, matched: matchedNow ?? rows.filter((r) => r.project_id).length, removed: gone.map((g: any) => g.full_name), unmatched: rows.filter((r) => !r.project_id).map((r) => r.name), backfilled_repo_url: backfilled };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const gate = await requireAdmin(req);
  if ('error' in gate) return json({ error: gate.error }, 401);
  const { svc } = gate;
  let body: any = {};
  try { body = await req.json(); } catch { /* GET-style */ }
  const action = body.action || 'all';
  const out: Record<string, unknown> = { action };
  if (action === 'github' || action === 'all') out.github = await syncGithub(svc);
  if (action === 'refresh' || action === 'all') {
    const { data, error } = await svc.rpc('ko_automations_refresh_live');
    out.refresh = error ? { error: error.message } : data;
  }
  return json(out);
});
