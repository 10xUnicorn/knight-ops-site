// booking-create v14 — THE single write path for a public booking.
//
// v12 inserted guest_name/guest_email into a table whose columns are
// booker_name/booker_email, so every call failed at the insert; the public page
// had been inserting straight into `bookings` with the anon key instead, which
// skipped confirmation emails, the lead, the reminders — everything. RLS is now
// on and anon cannot touch `bookings`, so this function is the only door.
//
// Order matters: conflict checks (DB + Google free/busy) → insert → Google
// Calendar event (private record on the Knight Ops Bookings calendar) →
// emails → reminders → lead → admin notification. A Google failure never loses
// the booking: it is recorded on the row and surfaced in admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { syncBookingEvent, googleBusy, overlaps } from "../_shared/gcal.ts";
import { guestConfirm, hostNotify, send, fmtDate, HOST_NOTIFY, buildIcs, icsAttachment } from "../_shared/booking-mail.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function token(n = 48) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (x) => a[x % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const booking_type_id = String(b.booking_type_id || "");
    const start_time = String(b.start_time || "");
    const name = String(b.booker_name || b.guest_name || "").trim().slice(0, 120);
    const email = String(b.booker_email || b.guest_email || "").trim().toLowerCase();
    const phone = String(b.booker_phone || b.guest_phone || "").trim().slice(0, 40) || null;
    const tz = String(b.timezone || b.guest_timezone || "America/Phoenix");
    const notes = b.notes ? String(b.notes).slice(0, 4000) : null;
    const custom = b.custom_responses && typeof b.custom_responses === "object" ? b.custom_responses : (b.custom_fields && typeof b.custom_fields === "object" ? b.custom_fields : null);

    if (!booking_type_id || !start_time || !name || !email) return json({ error: "booking_type_id, start_time, booker_name and booker_email are required" }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "That email address does not look right." }, 400);
    const startDt = new Date(start_time);
    if (isNaN(startDt.getTime())) return json({ error: "Bad start_time" }, 400);

    const { data: t } = await sb.from("booking_types").select("*").eq("id", booking_type_id).eq("is_active", true).maybeSingle();
    if (!t) return json({ error: "Booking type not found or inactive" }, 404);

    const endDt = new Date(startDt.getTime() + (t.duration_minutes || 30) * 60000);
    const minNotice = (t.min_notice_hours ?? 2) * 3600000;
    if (startDt.getTime() < Date.now() + minNotice) return json({ error: "That time is too soon. Please pick a later slot." }, 409);
    const bufB = (t.buffer_before_minutes || 0) * 60000, bufA = (t.buffer_after_minutes || 0) * 60000;
    const bufStart = new Date(startDt.getTime() - bufB).toISOString(), bufEnd = new Date(endDt.getTime() + bufA).toISOString();

    // Conflicts across EVERY booking type — Daniel is one person.
    const { data: conflicts } = await sb.from("bookings").select("id").in("status", ["confirmed", "rescheduled", "pending"]).lt("start_time", bufEnd).gt("end_time", bufStart);
    if (conflicts && conflicts.length) return json({ error: "This time slot is no longer available. Please choose another time." }, 409);

    // …and against what is actually on the Google calendar.
    try {
      const busy = await googleBusy(sb, bufStart, bufEnd);
      if (busy.some((w) => overlaps(bufStart, bufEnd, w.start, w.end))) return json({ error: "That time just got taken on Daniel's calendar. Please choose another slot." }, 409);
    } catch (e) { console.error("freebusy skipped:", String(e)); }

    if (t.max_per_day) {
      const day = startDt.toISOString().slice(0, 10);
      const { count } = await sb.from("bookings").select("id", { count: "exact", head: true }).eq("booking_type_id", t.id).in("status", ["confirmed", "rescheduled", "pending"]).gte("start_time", `${day}T00:00:00Z`).lte("start_time", `${day}T23:59:59Z`);
      if ((count || 0) >= t.max_per_day) return json({ error: "No more slots available for this day." }, 409);
    }

    const cancel_token = token(), reschedule_token = token();
    const status = t.price_cents ? "pending" : "confirmed";
    const { data: bk, error: insErr } = await sb.from("bookings").insert({
      booking_type_id: t.id, booker_name: name, booker_email: email, booker_phone: phone,
      start_time: startDt.toISOString(), end_time: endDt.toISOString(), timezone: tz, status,
      location_type: t.location_type || null, location_value: t.location_value || null,
      custom_responses: custom, notes, cancel_token, reschedule_token,
      payment_status: t.price_cents ? "unpaid" : null, payment_amount_cents: t.price_cents || null,
    }).select("*").single();
    if (insErr || !bk) return json({ error: "Failed to create booking", details: insErr?.message }, 500);

    const { data: tzRow } = await sb.from("booking_settings").select("value").eq("key", "timezone").maybeSingle();
    const hostTz = tzRow?.value ? String(tzRow.value).replace(/"/g, "") : "America/Phoenix";

    // Google Calendar
    let gcal: any = null;
    try {
      gcal = await syncBookingEvent(sb, bk, t, hostTz);
      if (gcal) await sb.from("bookings").update({ google_event_id: gcal.event_id, google_event_link: gcal.link, meet_link: gcal.meet_link, google_sync_error: null }).eq("id", bk.id);
    } catch (e) {
      console.error("gcal sync failed:", String(e));
      await sb.from("bookings").update({ google_sync_error: String(e).slice(0, 300) }).eq("id", bk.id);
    }
    const full = { ...bk, meet_link: gcal?.meet_link || null };

    await send([email], `Invitation: ${t.name} with Daniel Knight — ${fmtDate(bk.start_time, tz)}`, guestConfirm(full, t, "confirmed"), "Daniel Knight", [icsAttachment(buildIcs(full, t, "REQUEST", 0))]).catch(() => null);
    await send(HOST_NOTIFY, `New booking: ${t.name} — ${name}`, hostNotify(full, t, "New booking", "", hostTz), "Knight Ops Booking").catch(() => null);

    await sb.from("booking_reminders").insert([
      { booking_id: bk.id, type: "24h", channel: "email", remind_at: new Date(startDt.getTime() - 86400000).toISOString() },
      { booking_id: bk.id, type: "1h", channel: "email", remind_at: new Date(startDt.getTime() - 3600000).toISOString() },
    ]);

    // Lead: update if known, else create an INBOUND lead (Rule 2).
    let leadId: string | null = null;
    // lead_status is an enum with no 'booked' value. A booked call means the
    // lead is qualified; never downgrade someone further along the pipeline.
    const { data: lead } = await sb.from("leads").select("id,status").ilike("email", email).order("lead_type", { ascending: true }).limit(1).maybeSingle();
    if (lead) {
      leadId = lead.id;
      if (["new", "contacted", "replied", "not_qualified"].includes(String(lead.status || ""))) await sb.from("leads").update({ status: "qualified" }).eq("id", lead.id);
    } else {
      const { data: nl } = await sb.from("leads").insert({ name, email, phone, source: "website", lead_type: "inbound", status: "qualified", notes: `Booked: ${t.name} on ${fmtDate(bk.start_time, hostTz)}`, added_by: "booking" }).select("id").maybeSingle();
      leadId = nl?.id || null;
    }
    if (leadId) await sb.from("bookings").update({ lead_id: leadId }).eq("id", bk.id);

    await sb.from("notifications").insert({ title: `New booking: ${t.name}`, message: `${name} (${email}) — ${fmtDate(bk.start_time, hostTz)}`, type: "booking", entity_type: "booking", entity_id: bk.id }).then(() => null, () => null);

    return json({ success: true, booking: { id: bk.id, start_time: bk.start_time, end_time: bk.end_time, status: bk.status, cancel_token, reschedule_token, meet_link: full.meet_link, google_event_link: gcal?.link || null } }, 201);
  } catch (err) {
    console.error("booking-create error:", err);
    return json({ error: String(err) }, 500);
  }
});
