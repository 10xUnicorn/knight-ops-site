// Offline proof that a real MIME message survives the worker's attachment path
// byte-for-byte. Run: node test/parse.test.mjs
import PostalMime from 'postal-mime';
import { buildAttachments } from '../src/index.js';

const DOC = Buffer.from(
  'PK\x03\x04fake-docx-bytes\x00\x01\x02\xff\xfe payload for the round trip test',
  'binary'
);
const LOGO = Buffer.from('\x89PNG\r\n\x1a\n fake inline signature logo', 'binary');

const raw = [
  'From: April Little <april@example.com>',
  'To: daniel@knightops.biz',
  'Subject: Re: App Proposal',
  'Message-ID: <round-trip-test@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="B"',
  '',
  '--B',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'This is what AI and I came up with ...',
  '',
  '--B',
  'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'Content-Disposition: attachment; filename="WWR_App_Business_Plan.docx"',
  'Content-Transfer-Encoding: base64',
  '',
  DOC.toString('base64'),
  '',
  '--B',
  'Content-Type: image/png',
  'Content-Disposition: inline; filename="logo.png"',
  'Content-ID: <logo123>',
  'Content-Transfer-Encoding: base64',
  '',
  LOGO.toString('base64'),
  '',
  '--B--',
  '',
].join('\r\n');

const parsed = await new PostalMime().parse(new TextEncoder().encode(raw).buffer);
const atts = buildAttachments(parsed);

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
  }
}

console.log(`parsed ${atts.length} attachment(s)\n`);

const doc = atts.find((a) => a.filename === 'WWR_App_Business_Plan.docx');
check('the .docx is present', !!doc);
check('the .docx carries content', !!doc?.content);
check(
  'the .docx round-trips byte-for-byte',
  !!doc?.content && Buffer.from(doc.content, 'base64').equals(DOC),
  doc?.content ? 'bytes differ' : 'no content at all'
);
check('the .docx reported size matches', doc?.size === DOC.length, `got ${doc?.size}, want ${DOC.length}`);
check('the .docx is NOT flagged inline', doc?.is_inline === false);

const logo = atts.find((a) => a.filename === 'logo.png');
check('the inline logo is present', !!logo);
check('the inline logo round-trips', !!logo?.content && Buffer.from(logo.content, 'base64').equals(LOGO));
check('the inline logo IS flagged inline', logo?.is_inline === true);
check('the inline logo keeps its content id', logo?.content_id === 'logo123');

check('nothing was silently dropped', atts.every((a) => a.content || a.content_omitted));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
