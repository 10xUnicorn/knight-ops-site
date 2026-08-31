// booking-reschedule v13 — token-gated move; patches the Google event in place
// and sends an updated invite (same UID, higher SEQUENCE) from daniel@knightops.biz.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { syncBookingEvent, googleBusy, overlaps } from "../_shared/gcal.ts";
import { guestConfirm, hostNotify, send, fmtDate, fmtTime, HOST_NOTIFY, buildIcs, icsAttachment } from "../_shared/booking-mail.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const { booking_id, token, new_start_time } = await req.json().catch(() => ({}));
    if (!booking_id || !token || !new_start_time) return json({ error: "booking_id, token, and new_start_time required" }, 400);
    const { data: bk } = await sb.from("bookings").select("*, booking_types(*)").eq("id", booking_id).or(`cancel_token.eq.${token},reschedule_token.eq.${token}`).maybeSingle();
    if (!bk) return json({ error: "Booking not found or invalid token" }, 404);
    if (bk.status === "cancelled") return json({ error: "Cannot reschedule a cancelled booking" }, 400);
    const t = bk.booking_types;
    if (t.max_reschedules && (bk.reschedule_count || 0) >= t.max_reschedules) return json({ error: "This booking has been rescheduled the maximum number of times." }, 400);

    const newStart = new Date(new_start_time);
    if (isNaN(newStart.getTime())) return json({ error: "Bad new_start_time" }, 400);
    const newEnd = new Date(newStart.getTime() + (t.duration_minutes || 30) * 60000);
    if (newStart.getTime() < Date.now() + (t.min_notice_hours ?? 2) * 3600000) return json({ error: "That time is too soon. Please pick a later slot." }, 409);
    const bufStart = new Date(newStart.getTime() - (t.buffer_before_minutes || 0) * 60000).toISOString();
    const bufEnd = new Date(newEnd.getTime() + (t.buffer_after_minutes || 0) * 60000).toISOString();

    const { data: conflicts } = await sb.from("bookings").select("id").in("status", ["confirmed", "rescheduled", "pending"]).neq("id", booking_id).lt("start_time", bufEnd).gt("end_time", bufStart);
    if (conflicts && conflicts.length) return json({ error: "This time slot is no longer available." }, 409);
    try {
      const busy = await googleBusy(sb, bufStart, bufEnd);
      // The booking's own event is busy too — ignore an exact match with itself.
      if (busy.some((w) => overlaps(bufStart, bufEnd, w.start, w.end) && !(w.start === bk.start_time && w.end === bk.end_time))) return json({ error: "That time is taken on Daniel's calendar. Please choose another slot." }, 409);
    } catch (e) { console.error("freebusy skipped:", String(e)); }

    const oldStart = bk.start_time;
    const { data: upd, error } = await sb.from("bookings").update({
      start_time: newStart.toISOString(), end_time: newEnd.toISOString(), status: "rescheduled",
      rescheduled_from: oldStart, reschedule_count: (bk.reschedule_count || 0) + 1,
    }).eq("id", booking_id).select("*").single();
    if (error || !upd) return json({ error: "Failed to reschedule" }, 500);

    await sb.from("booking_reminders").delete().eq("booking_id", booking_id).eq("sent", false);
    await sb.from("booking_reminders").insert([
      { booking_id, type: "24h", channel: "email", remind_at: new Date(newStart.getTime() - 86400000).toISOString() },
      { booking_id, type: "1h", channel: "email", remind_at: new Date(newStart.getTime() - 3600000).toISOString() },
    ]);

    const { data: tzRow } = await sb.from("booking_settings").select("value").eq("key", "timezone").maybeSingle();
    const hostTz = tzRow?.value ? String(tzRow.value).replace(/"/g, "") : "America/Phoenix";
    let meet = upd.meet_link;
    try {
      const g = await syncBookingEvent(sb, upd, t, hostTz);
      if (g) { meet = g.meet_link || meet; await sb.from("bookings").update({ google_event_id: g.event_id, google_event_link: g.link, meet_link: meet, google_sync_error: null }).eq("id", booking_id); }
    } catch (e) { await sb.from("bookings").update({ google_sync_error: `reschedule: ${String(e).slice(0, 250)}` }).eq("id", booking_id); }

    const full = { ...upd, meet_link: meet };
    const tz = upd.timezone || "America/Phoenix";
    await send([upd.booker_email], `Updated invitation: ${t.name} with Daniel Knight — ${fmtDate(upd.start_time, tz)}`, guestConfirm(full, t, "rescheduled", oldStart), "Daniel Knight", [icsAttachment(buildIcs(full, t, "REQUEST", upd.reschedule_count || 1))]).catch(() => null);
    await send(HOST_NOTIFY, `Rescheduled: ${t.name} — ${upd.booker_name}`, hostNotify(full, t, "Rescheduled", `<tr><td style="color:#888;padding:6px 0;font-size:13px">Was</td><td style="color:#777;padding:6px 0;font-size:13px"><s>${fmtDate(oldStart, hostTz)} ${fmtTime(oldStart, hostTz)}</s></td></tr>`, hostTz), "Knight Ops Booking").catch(() => null);
    await sb.from("notifications").insert({ title: `Booking rescheduled: ${t.name}`, message: `${upd.booker_name}: ${fmtDate(oldStart, hostTz)} → ${fmtDate(upd.start_time, hostTz)} ${fmtTime(upd.start_time, hostTz)}`, type: "booking", entity_type: "booking", entity_id: booking_id }).then(() => null, () => null);
    return json({ success: true, booking: { id: booking_id, start_time: upd.start_time, end_time: upd.end_time, status: "rescheduled", meet_link: meet } });
  } catch (err) { return json({ error: String(err) }, 500); }
});
