#!/usr/bin/env python3
"""
Check that every BARE function call inside a region of a page's inline JS resolves
to something defined in that page (or a known global).

The onclick-target check only sees on* handlers, so a bad call inside a function body
slips past it -- e.g. calling toast() in admin.html, which defines showToast().

    python3 tools/callcheck.py admin.html "MOBILE APP BUILDER" "MOBILE APP BUILDER END"
    python3 tools/callcheck.py admin.html            # whole file

KNOWN LIMITATION: this is a regex, not a parser, so English prose inside a string that
happens to be followed by "(" reads as a call -- e.g. "...repackaged websites (4.2)"
reports `websites`. Treat the output as a list to eyeball, not a hard gate. It earns its
keep on the real cases: it caught a call to toast() in admin.html, which defines showToast().
"""
import re
import sys

GLOBALS = {
    'if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'delete', 'void', 'catch',
    'function', 'await', 'async', 'else', 'try', 'do', 'in', 'of', 'yield', 'case',
    'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'String', 'Number',
    'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'RegExp', 'Promise', 'Map', 'Set',
    'Error', 'Symbol', 'BigInt', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI',
    'decodeURI', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch',
    'require', 'import', 'atob', 'btoa', 'structuredClone', 'queueMicrotask',
    # CSS functions that appear inside inline style strings
    'var', 'calc', 'rgb', 'rgba', 'hsl', 'hsla', 'url', 'translateX', 'translateY',
    'translate', 'scale', 'rotate', 'blur', 'linear', 'ease', 'nav', 'not', 'minmax', 'repeat',
}


def main():
    path = sys.argv[1]
    start = sys.argv[2] if len(sys.argv) > 2 else None
    end = sys.argv[3] if len(sys.argv) > 3 else None

    src = open(path, encoding='utf-8').read()
    js = "\n".join(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S))

    defs = set(re.findall(r'function\s+([A-Za-z_$][\w$]*)\s*\(', js))
    defs |= set(re.findall(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)', js))
    defs |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=', js))
    # destructured and parameter names are noisy; treat any declared identifier as defined
    defs |= set(re.findall(r'\bfunction\s*\(([^)]*)\)', js) and [] or [])

    region = js
    if start:
        i = js.find(start)
        if i < 0:
            print('region start not found: %s' % start)
            raise SystemExit(2)
        j = js.find(end, i) if end else len(js)
        region = js[i:j if j > 0 else len(js)]

    calls = set(re.findall(r'(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(', region))
    missing = sorted(c for c in calls if c not in defs and c not in GLOBALS)

    print('file          : %s' % path)
    print('region        : %s' % (start or '(whole file)'))
    print('calls in region: %d' % len(calls))
    print('UNRESOLVED    : %s' % (', '.join(missing) if missing else 'none - all resolve'))
    raise SystemExit(1 if missing else 0)


if __name__ == '__main__':
    main()
