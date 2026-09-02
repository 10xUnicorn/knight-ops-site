#!/usr/bin/env python3
"""
Verify every on* handler in a single-file HTML page resolves to something defined
in that page's inline <script> blocks.

CLAUDE.md mandates this check after any surgical edit to a big single-file page
(admin.html especially). It was introduced after a rewrite silently deleted
saveMockStyle()/approveMock(), leaving two live buttons throwing ReferenceError,
and it later caught a dead openDetail() call.

NOTE: this does NOT replace `node --check` on each inline block. The onclick check
alone cannot catch a broken script block (e.g. an unescaped apostrophe inside a
single-quoted string, which once took the whole admin dead). Run both.

    python3 tools/onclick-check.py admin.html
    python3 tools/onclick-check.py mobile-intake.html mb.html
"""
import re
import sys


def check(path: str) -> list:
    src = open(path, encoding='utf-8').read()
    blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S)
    js = "\n".join(blocks)

    defs = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', js))
    defs |= set(re.findall(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=', js))
    defs |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', js))

    # A bare call only - NOT a method call. `foo(` counts; `obj.foo(` does not,
    # because the target of a method call is resolved at runtime on the object.
    CALL = r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\('

    calls = set()
    # on* attributes written directly in the HTML
    for _attr, body in re.findall(r'\son(\w+)\s*=\s*"([^"]*)"', src):
        for m in re.findall(CALL, body):
            calls.add(m)
    # handlers emitted from inside JS template/quoted strings
    for body in re.findall(r"on(?:click|change|input|submit)=\\?'([^']*)", js):
        for m in re.findall(CALL, body):
            calls.add(m)

    builtin = {
        'if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'delete', 'void',
        'catch', 'then', 'function', 'alert', 'confirm', 'prompt', 'parseInt',
        'parseFloat', 'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON',
        'Math', 'Date', 'RegExp', 'Promise', 'Map', 'Set', 'encodeURIComponent',
        'decodeURIComponent', 'setTimeout', 'clearTimeout', 'setInterval',
        'clearInterval', 'fetch', 'require', 'import', 'event', 'this',
        # CSS functions and selectors that appear inside inline style strings
        'var', 'calc', 'rgb', 'rgba', 'hsl', 'hsla', 'url', 'translateX', 'translateY',
        'translate', 'scale', 'rotate', 'blur', 'linear', 'ease', 'nav', 'not',
    }
    missing = sorted(c for c in calls if c not in defs and c not in builtin)

    print('file               : %s' % path)
    print('inline blocks      : %d' % len(blocks))
    print('handlers referenced: %d' % len(calls))
    print('defined names      : %d' % len(defs))
    print('MISSING TARGETS    : %s' % (', '.join(missing) if missing else 'none - all resolve'))
    print('')
    return missing


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    bad = 0
    for p in sys.argv[1:]:
        if check(p):
            bad = 1
    raise SystemExit(bad)
