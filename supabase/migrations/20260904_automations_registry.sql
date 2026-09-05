-- Automations registry: one catalog of every automation in the Knight Ops ecosystem
-- (pg_cron jobs, DB triggers, edge functions, Claude cloud routines, Cowork scheduled
-- tasks, Cloudflare workers), the edges between them, the GitHub repos, and the
-- computed gaps. Feeds admin.html → System → Automations.
--
-- Two kinds of node:
--   is_live = true   refreshed from a live source on every ko_automations_refresh_live()
--                    (cron.job, pg_trigger). Never hand-edit these; they are overwritten.
--   is_live = false  catalog rows (routines, cowork tasks, workers, edge fns) — seeded,
--                    then kept current by tools/automations-sync-tasks.py and the
--                    automations-registry-sync scheduled task.

create table if not exists public.automations (
  id             uuid primary key default gen_random_uuid(),
  key            text unique not null,            -- 'cron:<jobname>' 'trigger:<table>.<name>' 'edge:<fn>' 'routine:<name>' 'task:<name>' 'worker:<name>'
  kind           text not null check (kind in ('cron','trigger','edge_fn','cloud_routine','cowork_task','worker','webhook','external','source','output')),
  name           text not null,
  description    text,
  group_key      text,                            -- meeting-intake | autobuild | email | drip | social | seo-aeo | prospecting | partner | booking | billing | video | mobile | dashboard-builder | ele | shift | system | gravity | uu | bloomstack | other
  stage          text,                            -- source | ingest | process | build | deliver  (diagram column)
  schedule       text,                            -- cron expression or human text
  timezone       text default 'UTC',
  model          text,
  runtime        text,                            -- 'supabase pg_cron' | 'supabase trigger' | 'supabase edge' | 'claude cloud' | 'cowork mac' | 'cloudflare worker' | 'vercel' | 'external'
  status         text default 'active' check (status in ('active','disabled','dead','one_off','unknown','gone')),
  source_ref     text,                            -- file path, trigger id, jobid, function name
  url            text,                            -- deep link (routine url, wrangler folder, github path)
  reads          text[] default '{}',
  writes         text[] default '{}',
  project_ids    uuid[] default '{}',
  tags           text[] default '{}',
  health         jsonb default '{}'::jsonb,       -- {runs_7d, fails_7d, last_run, last_status, last_error}
  gaps           jsonb default '[]'::jsonb,       -- [{severity, summary, fix}]
  meta           jsonb default '{}'::jsonb,
  is_live        boolean default false,
  last_seen_at   timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists automations_kind_idx on public.automations(kind);
create index if not exists automations_group_idx on public.automations(group_key);

create table if not exists public.automation_edges (
  id        uuid primary key default gen_random_uuid(),
  from_key  text not null references public.automations(key) on delete cascade,
  to_key    text not null references public.automations(key) on delete cascade,
  relation  text not null,                        -- triggers | calls | feeds | reads | writes | depends_on | twin_of | builds | fallback_of
  label     text,
  is_live   boolean default false,
  created_at timestamptz default now(),
  unique (from_key, to_key, relation)
);

create table if not exists public.github_repos (
  id             bigint primary key,              -- GitHub repo id
  name           text not null,
  full_name      text not null,
  url            text not null,
  description    text,
  is_private     boolean,
  is_archived    boolean,
  default_branch text,
  language       text,
  pushed_at      timestamptz,
  open_issues    int,
  project_id     uuid references public.projects(id) on delete set null,
  match_kind     text,                            -- 'repo_url' | 'name' | 'manual' | null
  synced_at      timestamptz default now()
);

alter table public.automations       enable row level security;
alter table public.automation_edges  enable row level security;
alter table public.github_repos      enable row level security;

-- Admins read/write. No anon policy of any kind.
drop policy if exists automations_admin on public.automations;
create policy automations_admin on public.automations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists automation_edges_admin on public.automation_edges;
create policy automation_edges_admin on public.automation_edges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists github_repos_admin on public.github_repos;
create policy github_repos_admin on public.github_repos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.tg_automations_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_automations_touch on public.automations;
create trigger trg_automations_touch before update on public.automations
  for each row execute function public.tg_automations_touch();

-- ---------------------------------------------------------------------------
-- Live refresh: pg_cron jobs (+7-day health) and public-schema triggers.
-- SECURITY DEFINER so the admin browser session can call it; cron.* is not
-- readable by authenticated otherwise. Admin-gated inside.
-- ---------------------------------------------------------------------------
create or replace function public.ko_automations_refresh_live() returns jsonb
language plpgsql security definer set search_path = public, cron, pg_catalog as $$
declare
  v_seen  text[] := '{}';
  v_cron  int := 0;
  v_trig  int := 0;
  r       record;
  v_target text;
  v_key    text;
begin
  if not public.is_admin() and current_user <> 'postgres' and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'admin only';
  end if;

  -- pg_cron jobs -----------------------------------------------------------
  for r in
    select j.jobid, j.jobname, j.schedule, j.active, j.command,
           (select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '7 days') as runs_7d,
           (select count(*) from cron.job_run_details d where d.jobid=j.jobid and d.start_time > now()-interval '7 days' and d.status='failed') as fails_7d,
           (select max(d.end_time) from cron.job_run_details d where d.jobid=j.jobid) as last_run,
           (select d.status from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) as last_status,
           (select d.return_message from cron.job_run_details d where d.jobid=j.jobid and d.status='failed' order by d.start_time desc limit 1) as last_error
    from cron.job j
  loop
    v_key := 'cron:'||coalesce(r.jobname, 'job-'||r.jobid);
    v_target := substring(r.command from 'functions/v1/([a-zA-Z0-9_-]+)');
    v_seen := v_seen || v_key;
    insert into public.automations as a (key, kind, name, description, stage, schedule, runtime, status, source_ref, health, meta, is_live, last_seen_at)
    values (v_key, 'cron', coalesce(r.jobname,'job-'||r.jobid), 'pg_cron job'||case when v_target is not null then ' → edge fn '||v_target else '' end,
            'process', r.schedule, 'supabase pg_cron', case when r.active then 'active' else 'disabled' end,
            'jobid '||r.jobid,
            jsonb_build_object('runs_7d',r.runs_7d,'fails_7d',r.fails_7d,'last_run',r.last_run,'last_status',r.last_status,'last_error',left(r.last_error,300)),
            jsonb_build_object('command', left(r.command, 600), 'target_edge_fn', v_target),
            true, now())
    on conflict (key) do update set
      schedule=excluded.schedule, status=excluded.status, health=excluded.health, meta=excluded.meta,
      description=excluded.description, is_live=true, last_seen_at=now();
    v_cron := v_cron + 1;

    -- live edge cron → edge fn (only if that edge fn is catalogued)
    if v_target is not null then
      insert into public.automations (key, kind, name, description, stage, runtime, status, is_live, last_seen_at)
      values ('edge:'||v_target, 'edge_fn', v_target, 'Supabase edge function', 'process', 'supabase edge', 'active', false, now())
      on conflict (key) do update set last_seen_at = now();
      insert into public.automation_edges (from_key, to_key, relation, label, is_live)
      values (v_key, 'edge:'||v_target, 'calls', r.schedule, true)
      on conflict (from_key, to_key, relation) do update set label=excluded.label;
    end if;
  end loop;

  -- triggers ----------------------------------------------------------------
  for r in
    select c.relname as tbl, t.tgname, t.tgenabled, p.proname, p.prosrc,
           pg_get_triggerdef(t.oid) as def
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    where n.nspname='public' and not t.tgisinternal
  loop
    v_key := 'trigger:'||r.tbl||'.'||r.tgname;
    v_target := substring(r.prosrc from 'functions/v1/([a-zA-Z0-9_-]+)');
    v_seen := v_seen || v_key;
    insert into public.automations as a (key, kind, name, description, stage, runtime, status, source_ref, reads, writes, meta, is_live, last_seen_at)
    values (v_key, 'trigger', r.tgname, 'DB trigger on '||r.tbl||' → '||r.proname||'()'||case when v_target is not null then ' → edge fn '||v_target else '' end,
            'process', 'supabase trigger', case when r.tgenabled='D' then 'disabled' else 'active' end,
            r.proname, array[r.tbl], '{}',
            jsonb_build_object('table', r.tbl, 'function', r.proname, 'definition', left(r.def, 500), 'target_edge_fn', v_target),
            true, now())
    on conflict (key) do update set
      status=excluded.status, description=excluded.description, meta=excluded.meta, is_live=true, last_seen_at=now();
    v_trig := v_trig + 1;
    if v_target is not null then
      insert into public.automations (key, kind, name, description, stage, runtime, status, is_live, last_seen_at)
      values ('edge:'||v_target, 'edge_fn', v_target, 'Supabase edge function', 'process', 'supabase edge', 'active', false, now())
      on conflict (key) do update set last_seen_at = now();
      insert into public.automation_edges (from_key, to_key, relation, label, is_live)
      values (v_key, 'edge:'||v_target, 'calls', 'on '||r.tbl, true)
      on conflict (from_key, to_key, relation) do nothing;
    end if;
  end loop;

  -- live rows that no longer exist at the source
  update public.automations set status='gone'
   where is_live and kind in ('cron','trigger') and not (key = any(v_seen)) and status <> 'gone';

  return jsonb_build_object('cron', v_cron, 'triggers', v_trig, 'refreshed_at', now());
end $$;
revoke all on function public.ko_automations_refresh_live() from public, anon;
grant execute on function public.ko_automations_refresh_live() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Graph read: nodes + edges + projects (with URLs, people, open work) + repos
-- + computed gaps. One call, one payload, so the diagram renders from one fetch.
-- ---------------------------------------------------------------------------
create or replace function public.ko_automation_graph() returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v jsonb;
begin
  if not public.is_admin() and current_user <> 'postgres' and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'admin only';
  end if;

  with
  nodes as (
    select jsonb_agg(to_jsonb(a) order by a.stage, a.group_key, a.name) j from public.automations a where a.status <> 'gone'
  ),
  edges as (
    select jsonb_agg(to_jsonb(e)) j from public.automation_edges e
  ),
  proj as (
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'status', p.status::text, 'is_favorite', p.is_favorite,
      'repo_url', p.repo_url, 'build_folder', p.build_folder, 'app_site_url', p.app_site_url,
      'staging_url', p.staging_url, 'vercel_project_id', p.vercel_project_id, 'supabase_ref', p.supabase_ref,
      'last_activity_at', p.last_activity_at,
      'client', jsonb_build_object('name', pr.full_name, 'email', pr.email, 'company', pr.company, 'client_id', c.id),
      'members', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(pm.full_name, tm.name, mp.full_name, pm.email), 'email', coalesce(pm.email, tm.email, mp.email), 'role', coalesce(pm.client_title, pm.role, tm.role), 'client_visible', pm.client_visible)), '[]'::jsonb)
                    from public.project_members pm
                    left join public.team_members tm on tm.id = pm.team_member_id
                    left join public.profiles mp on mp.id = pm.user_id
                   where pm.project_id = p.id),
      'open_features', (select count(*) from public.feature_requests f where f.project_id=p.id and f.status not in ('built','rejected')),
      'open_bugs',     (select count(*) from public.bug_reports b where b.project_id=p.id and b.status not in ('fixed','closed','resolved')),
      'building',      (select count(*) from public.feature_requests f where f.project_id=p.id and f.status='building')
                     + (select count(*) from public.bug_reports b where b.project_id=p.id and b.status='fixing'),
      'shipped_30d',   (select count(*) from public.feature_requests f where f.project_id=p.id and f.built_at > now()-interval '30 days')
                     + (select count(*) from public.bug_reports b where b.project_id=p.id and b.fixed_at > now()-interval '30 days'),
      'recordings_30d',(select count(*) from public.meeting_follow_ups m where m.type='autobuild' and m.notes ilike '%project '||p.id||'%' and m.created_at > now()-interval '30 days'),
      'automations',   (select coalesce(jsonb_agg(a.key), '[]'::jsonb) from public.automations a where p.id = any(a.project_ids)),
      'repo',          (select to_jsonb(g) from public.github_repos g where g.project_id = p.id limit 1)
    ) order by p.is_favorite desc, p.last_activity_at desc nulls last) j
    from public.projects p
    left join public.clients c on c.id = p.client_id
    left join public.profiles pr on pr.id = c.profile_id
    where p.status::text not in ('cancelled','archived')
  ),
  repos as (
    select jsonb_agg(to_jsonb(g) order by g.pushed_at desc nulls last) j from public.github_repos g
  ),
  gaps as (
    select jsonb_agg(g) j from (
      -- failing / silent cron
      select jsonb_build_object('severity','high','kind','cron','ref',a.key,'summary',a.name||' failed '||(a.health->>'fails_7d')||'× in 7 days','detail',a.health->>'last_error','fix','Open the job in Supabase → Integrations → Cron and read the last return_message.') g
        from public.automations a where a.kind='cron' and coalesce((a.health->>'fails_7d')::int,0) > 0
      union all
      select jsonb_build_object('severity','medium','kind','cron','ref',a.key,'summary',a.name||' is scheduled but has not run in 7 days','fix','Confirm the schedule is still wanted; disable it if not.')
        from public.automations a where a.kind='cron' and a.status='active' and coalesce((a.health->>'runs_7d')::int,0) = 0
      union all
      select jsonb_build_object('severity','low','kind','trigger','ref',a.key,'summary','Trigger '||a.name||' on '||(a.meta->>'table')||' is DISABLED','fix','Drop it if it is retired, or re-enable it if it was meant to run.')
        from public.automations a where a.kind='trigger' and a.status='disabled'
      union all
      -- catalogued automations that are flagged dead / one-off
      select jsonb_build_object('severity','low','kind',a.kind,'ref',a.key,'summary',a.name||' is marked '||a.status,'fix','Disable or delete the task in Cowork; it is past its date or retired.')
        from public.automations a where a.status in ('dead','one_off')
      union all
      -- catalog-supplied gaps
      select jsonb_build_object('severity',coalesce(x->>'severity','medium'),'kind',a.kind,'ref',a.key,'summary',x->>'summary','fix',x->>'fix')
        from public.automations a, jsonb_array_elements(a.gaps) x where jsonb_typeof(a.gaps)='array'
      union all
      -- projects
      select jsonb_build_object('severity','medium','kind','project','ref',p.id,'summary',p.name||' has a repo but no build_folder','fix','Set the working folder in Client Project Details → Build target so auto-builds know where to cd.')
        from public.projects p where p.status::text in ('in_progress','scoping','discovery','review') and p.repo_url is not null and p.build_folder is null
      union all
      select jsonb_build_object('severity','medium','kind','project','ref',p.id,'summary',p.name||' build_folder points inside a Cowork session output dir','detail',p.build_folder,'fix','Move the canonical checkout to AutoBuilds/<slug> or Projects/<name> and update projects.build_folder — session output folders are not durable.')
        from public.projects p where p.build_folder ilike '%local-agent-mode-sessions%'
      union all
      select jsonb_build_object('severity','low','kind','project','ref',p.id,'summary',p.name||' has nobody in project_members','fix','Add Daniel and any collaborator so the Automations map can show who is on it.')
        from public.projects p where p.status::text in ('in_progress') and not exists (select 1 from public.project_members m where m.project_id=p.id)
      union all
      select jsonb_build_object('severity','low','kind','project','ref',p.id,'summary',p.name||' is active but has no repo_url','fix','Link the repo (auto-detect in Permanent Links card) or mark the project as non-code.')
        from public.projects p where p.status::text in ('in_progress') and p.repo_url is null
      union all
      select jsonb_build_object('severity','medium','kind','project','ref',p.id,'summary',p.name||' repo is outside the 10xUnicorn org','detail',p.repo_url,'fix','Fork or transfer into 10xUnicorn so GITHUB_TOKEN-based auto-fix and export work.')
        from public.projects p where p.repo_url is not null and p.repo_url not ilike 'https://github.com/10xUnicorn/%'
      union all
      select jsonb_build_object('severity','low','kind','project','ref',p.id,'summary','Looks like a test or placeholder project: '||left(p.name,60),'fix','Archive it so it stops appearing in every list and count.')
        from public.projects p
        left join public.clients c on c.id=p.client_id left join public.profiles pr on pr.id=c.profile_id
        where p.status::text not in ('cancelled','archived','completed')
          and (pr.full_name ilike '%test%' or pr.email ilike '%placeholder.invalid' or p.name ilike '%test%' or length(p.name) > 90)
      union all
      -- repos with no project
      select jsonb_build_object('severity','low','kind','repo','ref',g.full_name,'summary','Repo '||g.name||' is not linked to any project','fix','Create the project or set projects.repo_url so it appears on the map.')
        from public.github_repos g where g.project_id is null and not g.is_archived
      union all
      -- zombies
      select jsonb_build_object('severity','high','kind','work','ref',f.id,'summary','Feature stuck in building with an expired claim: '||left(f.title,70),'detail','claimed_by '||coalesce(f.claimed_by,'?')||', expired '||coalesce(f.claim_expires_at::text,'?'),'fix','If the commit marker [ko-feat:'||f.id||'] is in the repo, close it via report-completion; otherwise release the claim.')
        from public.feature_requests f where f.status='building' and f.claim_expires_at < now() - interval '1 hour'
      union all
      select jsonb_build_object('severity','high','kind','work','ref',b.id,'summary','Bug stuck in fixing with an expired claim: '||left(b.title,70),'fix','Same as features: check the [ko-fix:id] marker, then close or release.')
        from public.bug_reports b where b.status='fixing' and b.claim_expires_at < now() - interval '1 hour'
      union all
      select jsonb_build_object('severity','medium','kind','work','ref',m.id,'summary','Recording claim stuck in processing for '||round(extract(epoch from now()-m.created_at)/3600)||'h: '||left(m.subject,60),'fix','A run died mid-flight. The next client-meeting-autobuild run takes it over after 3h; or set it to skipped by hand.')
        from public.meeting_follow_ups m where m.type='autobuild' and m.status='processing' and m.created_at < now()-interval '3 hours'
    ) s
  )
  select jsonb_build_object(
    'nodes', coalesce((select j from nodes), '[]'::jsonb),
    'edges', coalesce((select j from edges), '[]'::jsonb),
    'projects', coalesce((select j from proj), '[]'::jsonb),
    'repos', coalesce((select j from repos), '[]'::jsonb),
    'gaps', coalesce((select j from gaps), '[]'::jsonb),
    'generated_at', now()
  ) into v;
  return v;
end $$;
revoke all on function public.ko_automation_graph() from public, anon;
grant execute on function public.ko_automation_graph() to authenticated, service_role;
