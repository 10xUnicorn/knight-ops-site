#!/usr/bin/env python3
"""
Registry sync for Claude Cowork scheduled tasks → public.automations (kind='cowork_task').

The admin dashboard's System → Automations map reads public.automations. pg_cron jobs and
DB triggers refresh themselves live; Cowork tasks live only as SKILL.md files on this Mac,
so something on the Mac has to publish them. This script does that:

  1. reads every  ~/Claude Home/Scheduled/<name>/SKILL.md
  2. extracts frontmatter + a handful of structured facts by regex (cadence sentence,
     models named, MCP/table sources it reads, edge functions it calls, booking links it
     emits, whether it looks dated/one-off)
  3. emits ONE SQL file of upserts keyed 'task:<name>' that you (or the daily
     `automations-registry-sync` Cowork task) run through the Supabase MCP / SQL editor.

It never deletes. A task whose folder disappeared is marked status='gone' on the next run
because the SQL ends with an UPDATE for keys not in this batch.

    python3 tools/automations-sync-tasks.py                 # writes automations-tasks.sql next to this script
    python3 tools/automations-sync-tasks.py --json out.json # also dump the parsed facts

No secrets, no network. Safe to run any time.
"""
import io, json, os, re, sys, datetime

SCHED = os.path.expanduser('~/Claude Home/Scheduled')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_SQL = os.path.join(HERE, 'automations-tasks.sql')

GROUP_RULES = [
    ('meeting-intake', r'fathom|plaud|meeting|transcript|fireflies'),
    ('autobuild',      r'autobuild|orchestrator|build worker|claude code|buildlock'),
    ('bloomstack',     r'bloomstack'),
    ('gravity',        r'gravity|orion'),
    ('uu',             r'unicorn universe|uu-|10xunicorn|nightvibe|night vibe'),
    ('drip',           r'drip|nurture|sequence'),
    ('social',         r'linkedin|social|post(er|ing)|instagram|twitter|x\.com'),
    ('seo-aeo',        r'aeo|seo|blog|semrush|quora|article|content'),
    ('prospecting',    r'prospect|apollo|lead[- ]gen|intent|outreach|speaking'),
    ('email',          r'email|gmail|inbox|reply'),
    ('partner',        r'partner|affiliate|commission'),
    ('briefing',       r'briefing|digest|report|weekly|usage'),
    ('sales',          r'sales|deal|proposal|pipeline'),
]
RETIRED_MODEL = re.compile(r'claude-(opus|sonnet)-4[\w.-]*|claude-3[\w.-]*|\bopus-4\b|\bsonnet-4\b', re.I)
MODEL = re.compile(r'claude-(?:opus|sonnet|haiku|fable)-[a-z0-9.-]+', re.I)
EDGE = re.compile(r'functions/v1/([a-z0-9-]+)', re.I)
TABLE = re.compile(r'\b(?:from|into|update|join)\s+(?:public\.)?([a-z_]{4,})\b', re.I)
BOOK = re.compile(r'/(book-tech-call|mini-blueprint|book|booking)\b')
CADENCE = re.compile(r'(?:you run|runs?|run|fires?|scheduled)\s+(every|\d+x/day|\d+x|daily|hourly|weekly|once|at|on|nightly|each)[^.\n]{0,70}', re.I)
DATED = re.compile(r'20\d\d-\d\d-\d\d')

def frontmatter(s):
    m = re.match(r'^---\n(.*?)\n---', s, re.S)
    fm = {}
    if m:
        for line in m.group(1).split('\n'):
            if ':' in line:
                k, v = line.split(':', 1); fm[k.strip()] = v.strip()
    return fm

def q(v):
    if v is None: return 'null'
    return "'" + str(v).replace("'", "''") + "'"

def arr(xs):
    xs = sorted(set(x for x in xs if x))
    return "array[" + ",".join(q(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"

def parse(name, s):
    lo = s.lower()
    fm = frontmatter(s)
    group = 'other'
    for g, rx in GROUP_RULES:
        if re.search(rx, lo): group = g; break
    models = sorted(set(m.lower() for m in MODEL.findall(s)))
    retired = sorted(set(m.group(0).lower() for m in RETIRED_MODEL.finditer(s)))
    edges = sorted(set(e.lower() for e in EDGE.findall(s)))
    tables = sorted(set(t.lower() for t in TABLE.findall(s) if t.lower() not in ('select','where','values','the','this','that','each','every','now','interval','public','cron')))
    books = sorted(set('/' + b for b in BOOK.findall(s)))
    cad = CADENCE.search(s)
    dated_name = bool(DATED.search(name))
    one_off = dated_name or 'one-off' in lo or 'one off' in lo
    head = lo[:700]
    dead = any(w in head for w in ('disabled', 'retired', 'do not run', '[paused', 'paused 20', 'superseded'))
    sources = []
    for tok, label in [('fathom','fathom'),('plaud','plaud'),('gmail','gmail'),('apple note','apple-notes'),('obsidian','obsidian'),
                       ('github','github'),('vercel','vercel'),('gohighlevel','ghl'),(' ghl','ghl'),('semrush','semrush'),
                       ('stripe','stripe'),('linkedin','linkedin'),('apollo','apollo'),('supabase','supabase'),('fireflies','fireflies')]:
        if tok in lo: sources.append(label)
    gaps = []
    if retired: gaps.append({'severity':'medium','summary':f'References retired model id(s): {", ".join(retired)}','fix':'Update to claude-fable-5-1 (builds), claude-sonnet-5 (writing) or claude-haiku-4-5 (scanning).'})
    if 'fathom' in lo and 'plaud' not in lo and group == 'meeting-intake':
        gaps.append({'severity':'medium','summary':'Reads Fathom but never Plaud','fix':'Add Plaud list_files as an independent second queue (see client-meeting-autobuild STEP 0B).'})
    for b in books:
        if b in ('/book-tech-call','/mini-blueprint'):
            # A mention is usually the "STEP 2, invitation-only, never send" rule itself (verified 2026-09-04
            # across all 8 tasks that mention it), so this is a verify-me, not a confirmed leak.
            gaps.append({'severity':'low','summary':f'Mentions {b} — confirm it never reaches a prospect (step 2 is invitation-only)','fix':'If it is a CTA in anything outbound, point it at /book. If it is the never-send rule, nothing to do.'})
    if one_off: gaps.append({'severity':'low','summary':'Dated one-off task still present','fix':'Disable it in Cowork once the send is confirmed done.'})
    return dict(
        key='task:'+name, name=name, description=((fm.get('description') or '')[:260] or None), group=group,
        schedule=cad.group(0).strip()[:140] if cad else None,
        model=(models[0] if models else None), models=models, retired=retired, edges=edges, tables=tables,
        books=books, sources=sources, one_off=one_off, dead=dead, gaps=gaps, lines=s.count('\n'),
        path=os.path.join(SCHED, name, 'SKILL.md'),
    )

def main():
    tasks = []
    for d in sorted(os.listdir(SCHED)):
        f = os.path.join(SCHED, d, 'SKILL.md')
        if not os.path.isfile(f): continue
        s = io.open(f, encoding='utf-8', errors='surrogateescape').read()
        tasks.append(parse(d, s))

    now = datetime.datetime.utcnow().isoformat() + 'Z'
    out = [f"-- generated by tools/automations-sync-tasks.py at {now}; {len(tasks)} Cowork tasks. Upsert-only, then mark missing as gone."]
    for t in tasks:
        status = 'dead' if t['dead'] else ('one_off' if t['one_off'] else 'active')
        stage = 'ingest' if t['group'] == 'meeting-intake' else ('build' if t['group'] == 'autobuild' else 'process')
        out.append(
            "insert into public.automations (key, kind, name, description, group_key, stage, schedule, timezone, model, runtime, status, source_ref, reads, writes, tags, gaps, meta, is_live, last_seen_at) values ("
            + ", ".join([q(t['key']), q('cowork_task'), q(t['name']), q(t['description']), q(t['group']), q(stage), q(t['schedule']), q('America/Phoenix'),
                         q(t['model']), q('cowork mac'), q(status), q(t['path']), arr(t['sources']), arr(t['edges']), arr(t['books'] + (['retired-model'] if t['retired'] else [])),
                         q(json.dumps(t['gaps'])) + "::jsonb",
                         q(json.dumps({'models': t['models'], 'retired': t['retired'], 'lines': t['lines']})) + "::jsonb",
                         'false', 'now()'])
            + ") on conflict (key) do update set description=excluded.description, group_key=coalesce(automations.group_key, excluded.group_key), schedule=coalesce(excluded.schedule, automations.schedule), model=excluded.model, status=case when automations.status='disabled' then automations.status else excluded.status end, source_ref=excluded.source_ref, reads=excluded.reads, writes=excluded.writes, tags=excluded.tags, gaps=excluded.gaps, meta=automations.meta || excluded.meta, last_seen_at=now();"
        )
        for e in t['edges']:
            out.append(f"insert into public.automations (key, kind, name, description, stage, runtime, status) values ({q('edge:'+e)}, 'edge_fn', {q(e)}, 'Supabase edge function', 'process', 'supabase edge', 'active') on conflict (key) do nothing;")
            out.append(f"insert into public.automation_edges (from_key, to_key, relation, label) values ({q(t['key'])}, {q('edge:'+e)}, 'calls', null) on conflict do nothing;")
    keys = ",".join(q(t['key']) for t in tasks)
    out.append(f"update public.automations set status='gone' where kind='cowork_task' and key not in ({keys}) and status <> 'gone';")
    io.open(OUT_SQL, 'w', encoding='utf-8').write("\n".join(out) + "\n")
    print(f"{len(tasks)} tasks → {OUT_SQL} ({os.path.getsize(OUT_SQL)} bytes)")
    if '--json' in sys.argv:
        p = sys.argv[sys.argv.index('--json') + 1]
        io.open(p, 'w').write(json.dumps(tasks, indent=1))
        print('facts →', p)

if __name__ == '__main__':
    main()
