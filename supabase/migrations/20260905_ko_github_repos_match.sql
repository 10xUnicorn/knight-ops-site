-- Match github_repos to projects by normalised repo_url. Called by automations-sync after every upsert
-- and safe to run any time; only fills project_id where it is null.
-- Why: the first real GitHub sync (2026-09-05) upserted 24 repos with 0 matches because the JS-side
-- projects query returned nothing; doing the match in SQL removes that failure mode entirely.
create or replace function public.ko_github_repos_match() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.github_repos g set project_id = p.id, match_kind = 'repo_url'
    from public.projects p
   where g.project_id is null and p.repo_url is not null
     and lower(regexp_replace(p.repo_url, '\.git$|/+$', '', 'g')) = lower(g.url);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ko_github_repos_match() from public, anon;
grant execute on function public.ko_github_repos_match() to authenticated, service_role;
