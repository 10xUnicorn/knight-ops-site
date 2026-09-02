#!/usr/bin/env python3
"""
Run `node --check` on every inline <script> block of a single-file HTML page.

CLAUDE.md: an unescaped apostrophe inside a single-quoted JS string once broke the
entire main <script> block and took the whole admin dead. This catches that instantly.
READ THE FULL OUTPUT - never pipe it to `tail -1`.

The onclick-target check (tools/onclick-check.py) does NOT catch a broken block.
Run both after any surgical edit to a big single-file page.

    python3 tools/script-check.py admin.html
    python3 tools/script-check.py mobile-intake.html mb.html
"""
import os
import re
import subprocess
import sys
import tempfile


def check(path: str) -> bool:
    src = open(path, encoding='utf-8').read()
    blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S)
    print('file          : %s' % path)
    print('inline blocks : %d' % len(blocks))
    ok = True
    for i, b in enumerate(blocks):
        fd, tmp = tempfile.mkstemp(suffix='.js')
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            fh.write(b)
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        os.unlink(tmp)
        status = 'OK' if r.returncode == 0 else 'FAIL'
        print('  block %d: %-4s (%d chars)' % (i, status, len(b)))
        if r.returncode != 0:
            ok = False
            if r.stdout:
                print(r.stdout)
            if r.stderr:
                print(r.stderr)
    print('  => %s\n' % ('PASS' if ok else 'BROKEN'))
    return ok


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    bad = 0
    for p in sys.argv[1:]:
        if not check(p):
            bad = 1
    raise SystemExit(bad)
