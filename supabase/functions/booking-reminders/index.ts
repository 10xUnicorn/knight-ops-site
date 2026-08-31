// booking-reminders v12 — 24h / 1h guest reminders. Runs on pg_cron every 10 min
// (job: booking-reminders-10min).
// v11 read booking.guest_email (column does not exist), printed "ET" for every
// timezone, linked to /book (the GHL iframe page), and had no cron job at all.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://knightops.biz";
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const fmtDate = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
const fmtTime = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' });
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function html(b: any, btName: string, tz: string, oneHour: boolean) {
  const when = oneHour ? 'in 1 hour' : 'tomorrow';
  const where = b.meet_link || b.location_value;
  const mgr = b.cancel_token ? `<div style="text-align:center;margin-top:14px"><a href="${SITE}/booking?action=reschedule&id=${b.id}&token=${b.cancel_token}" style="display:inline-block;padding:10px 22px;border:1px solid rgba(200,164,86,.35);color:#C8A456;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin:4px">Reschedule</a><a href="${SITE}/booking?action=cancel&id=${b.id}&token=${b.cancel_token}" style="display:inline-block;padding:10px 22px;border:1px solid rgba(255,100,100,.3);color:#ff6464;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin:4px">Cancel</a></div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0A0A0B;font-family:'Segoe UI',system-ui,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 24px"><div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;width:48px;height:48px;background:linear-gradient(135deg,#C8A456,#A08636);border-radius:12px;line-height:48px;font-size:24px;font-weight:900;color:#0A0A0B">K</div></div><div style="background:#111113;border:1px solid rgba(200,164,86,.15);border-radius:16px;padding:32px"><h1 style="color:#F5F5F5;font-size:20px;margin:0 0 8px">Your ${esc(btName)} is ${when}</h1><p style="color:#888;font-size:14px;margin:0 0 20px">With Daniel Knight.</p><div style="background:rgba(200,164,86,.08);border:1px solid rgba(200,164,86,.2);border-radius:12px;padding:18px 20px"><table style="width:100%;border-collapse:collapse"><tr><td style="color:#888;padding:6px 0;font-size:13px;width:90px">When</td><td style="color:#F5F5F5;padding:6px 0;font-size:14px;font-weight:600">${fmtDate(b.start_time, tz)}<br>${fmtTime(b.start_time, tz)} – ${fmtTime(b.end_time, tz)}</td></tr>${where ? `<tr><td style="color:#888;padding:6px 0;font-size:13px">Where</td><td style="padding:6px 0;font-size:14px">${/^https?:/i.test(where) ? `<a href="${where}" style="color:#C8A456">${esc(where)}</a>` : esc(where)}</td></tr>` : ''}</table></div>${mgr}</div><p style="color:#555;font-size:12px;text-align:center;margin:24px 0 0">Knight Ops &bull; knightops.biz</p></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const now = new Date().toISOString();
    const { data: due, error } = await sb.from('booking_reminders').select('*, bookings(*, booking_types(name))').eq('sent', false).not('remind_at', 'is', null).lte('remind_at', now).limit(50);
    if (error) return json({ error: error.message }, 500);
    let sent = 0, skipped = 0, errors = 0;
    for (const r of due || []) {
      const b = r.bookings;
      const dead = !b || !['confirmed', 'rescheduled'].includes(b.status) || new Date(b.start_time) < new Date();
      if (dead) { await sb.from('booking_reminders').update({ sent: true, sent_at: now }).eq('id', r.id); skipped++; continue; }
      const tz = b.timezone || 'America/Phoenix';
      const btName = b.booking_types?.name || 'Booking';
      const oneHour = r.type === '1h';
      try {
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'Daniel Knight <daniel@knightops.biz>', to: [b.booker_email], reply_to: 'daniel@knightops.biz', subject: `Reminder: ${btName} ${oneHour ? 'in 1 hour' : 'tomorrow'} — ${fmtDate(b.start_time, tz)}`, html: html(b, btName, tz, oneHour) }) });
        if (res.ok) { await sb.from('booking_reminders').update({ sent: true, sent_at: now }).eq('id', r.id); sent++; }
        else { errors++; console.error('resend', res.status, await res.text()); }
      } catch (e) { errors++; console.error(String(e)); }
    }
    return json({ sent, skipped, errors, due: (due || []).length });
  } catch (e) { return json({ error: String(e) }, 500); }
});
