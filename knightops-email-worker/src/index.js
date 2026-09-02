/**
 * knightops-email-worker — Cloudflare Email Routing handler for knightops.biz
 *
 * Receives mail for the knightops.biz addresses, parses it, POSTs it to the
 * Supabase `receive-email` edge function, and forwards the original on to
 * FORWARD_TO.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The previously deployed build did this to every attachment:
 *
 *     attachments = parsed.attachments.map(att => ({
 *       filename: att.filename, mimeType: att.mimeType,
 *       size: att.content?.byteLength || 0        // <-- read the length,
 *     }))                                        //     then drop the bytes
 *
 * It measured each file and threw it away. Every inbound attachment since the
 * worker went live was recorded as a name and a byte count with no retrievable
 * file behind it. This version sends the actual content.
 *
 * WEBHOOK_SECRET is a Cloudflare secret, NOT a [vars] entry — this repo is
 * public, and that value is what authorises writes into the CRM.
 */
import PostalMime from 'postal-mime';

// Per-file and per-message ceilings for inlined bytes. Cloudflare Email Routing
// caps messages around 25MB; base64 adds ~33%, so we stay well under whatever
// the edge function will accept. Anything above the cap is still RECORDED, with
// a reason — it is never silently dropped, which was the original sin here.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000; // fromCharCode blows the stack on very large spreads
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// A signature logo is a small image. Anything bigger, or anything that is not an image at
// all, is the sender's actual content and must stay visible in file lists.
const INLINE_MAX_BYTES = 100 * 1024;

function isInlineNoise(att, size) {
  const flagged = att.disposition === 'inline' || !!att.contentId;
  if (!flagged) return false;
  const mime = String(att.mimeType || '');
  if (!mime.startsWith('image/')) return false;      // a .docx is never a signature
  return size > 0 && size < INLINE_MAX_BYTES;         // a 1.9MB PNG is not a signature
}

function buildAttachments(parsed) {
  const out = [];
  let budget = MAX_TOTAL_BYTES;

  for (const att of parsed.attachments || []) {
    const size = att.content?.byteLength || 0;
    const rec = {
      filename: att.filename || 'unnamed',
      mimeType: att.mimeType || 'application/octet-stream',
      size,
      // Signature logos and embedded images arrive as attachments too. Passing
      // the disposition through lets the CRM keep them off contact records
      // while still making them openable from the email itself.
      //
      // BUT `disposition==='inline' || contentId` ALONE IS FAR TOO BROAD. Mail clients set a
      // Content-ID on anything dragged into the message body, so a client's real work gets
      // flagged as signature noise and vanishes from their file lists. On 2026-09-02 this had
      // swallowed April Little's 1.9MB brand logo, a second logo, her .docx business plan and
      // her .md dev spec - the bytes were in storage the whole time, just filtered out of view.
      //
      // A signature logo is a SMALL IMAGE. So:
      //   - a non-image is NEVER inline noise (a .docx is not a signature)
      //   - an image at or above INLINE_MAX_BYTES is real content, not a signature
      // Erring toward showing costs a little noise; erring toward hiding loses client assets.
      is_inline: isInlineNoise(att, size),
      // postal-mime hands back the raw header value, angle brackets and all.
      content_id: att.contentId ? String(att.contentId).replace(/^<|>$/g, '') : null,
    };

    if (!size) {
      rec.content_omitted = 'empty';
    } else if (size > MAX_FILE_BYTES) {
      rec.content_omitted = 'too_large';
    } else if (size > budget) {
      rec.content_omitted = 'message_budget_exceeded';
    } else {
      try {
        rec.content = toBase64(att.content);
        budget -= size;
      } catch (err) {
        rec.content_omitted = 'encode_failed';
        console.error(`base64 failed for ${rec.filename}: ${err}`);
      }
    }
    out.push(rec);
  }
  return out;
}

// exported for the offline round-trip test in test/parse.test.mjs
export { buildAttachments, toBase64, isInlineNoise };

export default {
  async email(message, env, ctx) {
    const parser = new PostalMime();
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const parsed = await parser.parse(rawEmail);

    const fromAddress = message.from;
    const toAddress = message.to;
    const fromName = parsed.from?.name || fromAddress.split('@')[0];
    const toAddresses = parsed.to?.map((a) => a.address || '') || [toAddress];
    const ccAddresses = parsed.cc?.map((a) => a.address || '') || [];
    const bodyText = parsed.text || '';
    const bodyHtml = parsed.html || '';
    const attachments = buildAttachments(parsed);

    const knightOpsAddresses = [
      'daniel@knightops.biz',
      'team@knightops.biz',
      'info@knightops.biz',
      'hello@knightops.biz',
    ];
    const mailbox =
      knightOpsAddresses.find((a) =>
        toAddresses.some((to) => to.toLowerCase() === a)
      ) || toAddress;

    try {
      const payload = {
        from_address: fromAddress,
        from_name: fromName,
        to_addresses: toAddresses,
        cc_addresses: ccAddresses,
        subject: parsed.subject || '(no subject)',
        body_text: bodyText.substring(0, 5e4), // Cap at 50k chars
        body_html: bodyHtml.substring(0, 1e5), // Cap at 100k chars
        message_id: parsed.messageId || null,
        headers: {
          date: parsed.date || null,
          in_reply_to: parsed.inReplyTo || null,
          references: parsed.references || null,
        },
        attachments,
        raw_size: rawEmail.byteLength,
        mailbox,
      };

      const response = await fetch(env.SUPABASE_RECEIVE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': env.WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Supabase receive-email failed: ${response.status} ${errText}`);
      } else {
        const result = await response.json();
        console.log(
          `Email stored: ${fromAddress} -> ${mailbox} | ID: ${result.email_id} | ` +
            `Lead: ${result.lead_id || 'none'} | ` +
            `attachments: ${result.attachments_stored || 0} stored, ` +
            `${result.attachments_metadata_only || 0} metadata-only`
        );
      }
    } catch (err) {
      console.error('Failed to store email in Supabase:', err);
    }

    // Forwarding is deliberately outside the try above: a CRM failure must never
    // stop the mail reaching a human.
    try {
      await message.forward(env.FORWARD_TO);
      console.log(`Forwarded to ${env.FORWARD_TO}`);
    } catch (err) {
      console.error('Forward failed:', err);
    }
  },
};
