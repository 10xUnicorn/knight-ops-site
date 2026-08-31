// booking-cancel v12 — token-gated cancel; deletes the Google event too.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { deleteBookingEvent } from "../_shared/gcal.ts";
import { hostNotify, send, fmtDate, fmtTime, esc, HOST_NOTIFY } from "../_shared/booking-mail.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { booking_id, token, reason } = await req.json().catch(() => ({}));
    if (!booking_id || !token) return json({ error: "booking_id and token required" }, 400);
    const { data: bk } = await sb.from("bookings").select("*, booking_types(*)").eq("id", booking_id).or(`cancel_token.eq.${token},reschedule_token.eq.${token}`).maybeSingle();
    if (!bk) return json({ error: "Booking not found or invalid token" }, 404);
    if (bk.status === "cancelled") return json({ error: "Booking is already cancelled" }, 400);
    const t = bk.booking_types || { name: "Booking" };

    const { error } = await sb.from("bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason ? String(reason).slice(0, 1000) : null }).eq("id", booking_id);
    if (error) return json({ error: "Failed to cancel booking" }, 500);
    await sb.from("booking_reminders").delete().eq("booking_id", booking_id).eq("sent", false);

    if (bk.google_event_id) {
      try { await deleteBookingEvent(sb, bk.google_event_id); await sb.from("bookings").update({ google_sync_error: null }).eq("id", booking_id); }
      catch (e) { await sb.from("bookings").update({ google_sync_error: `cancel: ${String(e).slice(0, 250)}` }).eq("id", booking_id); }
    }

    const tz = bk.timezone || "America/Phoenix";
    const { data: tzRow } = await sb.from("booking_settings").select("value").eq("key", "timezone").maybeSingle();
    const hostTz = tzRow?.value ? String(tzRow.value).replace(/"/g, "") : "America/Phoenix";
    const guestHtml = `<!DOCTYPE html><html><body style="margin:0;background:#0A0A0B;font-family:'Segoe UI',system-ui,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 24px"><div style="background:#111113;border:1px solid rgba(255,100,100,.2);border-radius:16px;padding:32px"><h1 style="color:#ff6464;font-size:20px;margin:0 0 12px">Booking cancelled</h1><p style="color:#aaa;font-size:14px;margin:0 0 20px">Your ${esc(t.name)} on ${fmtDate(bk.start_time, tz)} at ${fmtTime(bk.start_time, tz)} has been cancelled.${reason ? `<br><span style="color:#777">Reason: ${esc(reason)}</span>` : ""}</p><a href="https://knightops.biz/booking" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#C8A456,#A08636);color:#0A0A0B;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Book again</a></div></div></body></html>`;
    await send([bk.booker_email], `Cancelled: ${t.name} on ${fmtDate(bk.start_time, tz)}`, guestHtml).catch(() => null);
    await send(HOST_NOTIFY, `Cancelled: ${t.name} — ${bk.booker_name}`, hostNotify(bk, t, "Cancelled", reason ? `<tr><td style="color:#888;padding:6px 0;font-size:13px">Reason</td><td style="color:#ddd;padding:6px 0;font-size:14px">${esc(reason)}</td></tr>` : "", hostTz), "Knight Ops Booking").catch(() => null);
    await sb.from("notifications").insert({ title: `Booking cancelled: ${t.name}`, message: `${bk.booker_name} cancelled ${fmtDate(bk.start_time, hostTz)}${reason ? ` — ${reason}` : ""}`, type: "booking", entity_type: "booking", entity_id: booking_id }).then(() => null, () => null);
    return json({ success: true });
  } catch (err) { return json({ error: String(err) }, 500); }
});
