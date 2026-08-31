// Shared Google Calendar client for the booking functions.
//
// One Google account is connected (google_calendar_connection, single row).
// Its refresh token lives in that table (service-role only); the OAuth client
// id/secret live in Vault and are read through public.ko_secret(), which only
// the service role may execute. Nothing here is reachable with the anon key.
//
// Every booking becomes an event on a dedicated secondary calendar
// ("Knight Ops Bookings") owned by the connected account and shared with
// SHARE_WITH, with the guest and SHARE_WITH as attendees — so it shows up in
// both mailboxes and the guest gets a real Google invite.

export const SHARE_WITH_DEFAULT = "daniel@knightops.biz";
export const BOOKINGS_CALENDAR_NAME = "Knight Ops Bookings";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL = "https://www.googleapis.com/calendar/v3";

export type Conn = {
  id: string; account_email: string; refresh_token: string; calendar_id: string | null;
  calendar_name: string | null; share_with: string | null;
};

export async function getConn(sb: any): Promise<Conn | null> {
  const { data } = await sb.from("google_calendar_connection").select("*").limit(1).maybeSingle();
  return data || null;
}

export async function clientCreds(sb: any) {
  const id = (await sb.rpc("ko_secret", { p_name: "GOOGLE_OAUTH_CLIENT_ID" })).data;
  const secret = (await sb.rpc("ko_secret", { p_name: "GOOGLE_OAUTH_CLIENT_SECRET" })).data;
  if (!id || !secret) throw new Error("google_oauth_client_not_configured");
  return { id: String(id), secret: String(secret) };
}

export async function accessToken(sb: any, conn: Conn): Promise<string> {
  const c = await clientCreds(sb);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.id, client_secret: c.secret,
      refresh_token: conn.refresh_token, grant_type: "refresh_token",
    }),
  });
  const d = await res.json();
  if (!res.ok || !d.access_token) {
    await sb.from("google_calendar_connection").update({ last_error: `refresh_failed: ${d.error || res.status} ${d.error_description || ""}` }).eq("id", conn.id);
    throw new Error(`google_refresh_failed: ${d.error || res.status}`);
  }
  return d.access_token as string;
}

async function gfetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CAL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`google_${res.status}: ${typeof body === "string" ? body : JSON.stringify(body?.error || body).slice(0, 300)}`);
  return body;
}

// Create the dedicated calendar once and share it. Idempotent.
export async function ensureCalendar(sb: any, conn: Conn, tz: string): Promise<Conn> {
  if (conn.calendar_id) return conn;
  const token = await accessToken(sb, conn);
  const cal = await gfetch(token, "/calendars", {
    method: "POST", body: JSON.stringify({ summary: BOOKINGS_CALENDAR_NAME, timeZone: tz }),
  });
  const shareWith = conn.share_with || SHARE_WITH_DEFAULT;
  if (shareWith && shareWith.toLowerCase() !== conn.account_email.toLowerCase()) {
    try {
      await gfetch(token, `/calendars/${encodeURIComponent(cal.id)}/acl?sendNotifications=true`, {
        method: "POST", body: JSON.stringify({ role: "writer", scope: { type: "user", value: shareWith } }),
      });
    } catch (e) { console.error("share failed:", String(e)); }
  }
  // Give it a colour in the owner's list so it is easy to spot.
  try { await gfetch(token, `/users/me/calendarList/${encodeURIComponent(cal.id)}`, { method: "PATCH", body: JSON.stringify({ colorId: "5", selected: true }) }); } catch { /* cosmetic */ }
  const { data } = await sb.from("google_calendar_connection")
    .update({ calendar_id: cal.id, calendar_name: BOOKINGS_CALENDAR_NAME, last_error: null }).eq("id", conn.id).select("*").single();
  return data || { ...conn, calendar_id: cal.id, calendar_name: BOOKINGS_CALENDAR_NAME };
}

export type BookingLike = {
  id: string; booker_name: string; booker_email: string; booker_phone?: string | null;
  start_time: string; end_time: string; timezone?: string | null; status?: string;
  location_type?: string | null; location_value?: string | null; notes?: string | null;
  custom_responses?: any; cancel_token?: string | null; google_event_id?: string | null;
};
export type TypeLike = { name: string; description?: string | null; location_type?: string | null; location_value?: string | null; duration_minutes?: number };

const SITE = "https://knightops.biz";

function eventBody(b: BookingLike, t: TypeLike, tz: string, shareWith: string) {
  const manage = b.cancel_token
    ? `\nReschedule: ${SITE}/booking?action=reschedule&id=${b.id}&token=${b.cancel_token}\nCancel: ${SITE}/booking?action=cancel&id=${b.id}&token=${b.cancel_token}`
    : "";
  const custom = b.custom_responses && typeof b.custom_responses === "object"
    ? Object.entries(b.custom_responses).map(([k, v]) => `${k}: ${v}`).join("\n") : "";
  const desc = [
    `${t.name} booked through knightops.biz`,
    ``,
    `Guest: ${b.booker_name} <${b.booker_email}>${b.booker_phone ? `\nPhone: ${b.booker_phone}` : ""}`,
    b.timezone ? `Guest timezone: ${b.timezone}` : "",
    custom, b.notes ? `Notes: ${b.notes}` : "",
    ``,
    `Admin: ${SITE}/admin#bookings/${b.id}`, manage,
  ].filter((x) => x !== "").join("\n");

  const loc = String(t.location_type || b.location_type || "").toLowerCase();
  const wantsMeet = ["zoom", "video", "google_meet", "meet", "online"].includes(loc) && !(b.location_value || t.location_value);
  const body: any = {
    summary: `${t.name}: ${b.booker_name}`,
    description: desc,
    start: { dateTime: b.start_time, timeZone: tz },
    end: { dateTime: b.end_time, timeZone: tz },
    attendees: [
      { email: b.booker_email, displayName: b.booker_name },
      ...(shareWith ? [{ email: shareWith, responseStatus: "accepted" }] : []),
    ],
    guestsCanInviteOthers: false,
    reminders: { useDefault: false, overrides: [{ method: "email", minutes: 1440 }, { method: "popup", minutes: 30 }] },
    extendedProperties: { private: { ko_booking_id: b.id } },
  };
  const fixedLoc = b.location_value || t.location_value;
  if (fixedLoc) body.location = fixedLoc;
  else if (loc === "phone") body.location = b.booker_phone ? `Phone: ${b.booker_phone}` : "Phone call";
  else if (loc === "in_person") body.location = "In person";
  if (wantsMeet) body.conferenceData = { createRequest: { requestId: `ko-${b.id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return body;
}

// Insert or update the event for a booking. Returns {event_id, link, meet_link}.
export async function syncBookingEvent(sb: any, b: BookingLike, t: TypeLike, tz: string) {
  let conn = await getConn(sb);
  if (!conn) return null;
  conn = await ensureCalendar(sb, conn, tz);
  const token = await accessToken(sb, conn);
  const calId = encodeURIComponent(conn.calendar_id!);
  const body = eventBody(b, t, tz, conn.share_with || SHARE_WITH_DEFAULT);
  const q = "?sendUpdates=all&conferenceDataVersion=1";
  let ev: any;
  if (b.google_event_id) {
    try {
      ev = await gfetch(token, `/calendars/${calId}/events/${encodeURIComponent(b.google_event_id)}${q}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      if (!String(e).includes("google_404")) throw e;
      ev = await gfetch(token, `/calendars/${calId}/events${q}`, { method: "POST", body: JSON.stringify(body) });
    }
  } else {
    ev = await gfetch(token, `/calendars/${calId}/events${q}`, { method: "POST", body: JSON.stringify(body) });
  }
  const meet = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri || null;
  await sb.from("google_calendar_connection").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", conn.id);
  return { event_id: ev.id as string, link: ev.htmlLink as string, meet_link: meet as string | null };
}

export async function deleteBookingEvent(sb: any, eventId: string) {
  const conn = await getConn(sb);
  if (!conn || !conn.calendar_id) return;
  const token = await accessToken(sb, conn);
  try {
    await gfetch(token, `/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
  } catch (e) { if (!String(e).includes("google_404") && !String(e).includes("google_410")) throw e; }
}

// Busy ranges across the owner's real calendar(s) — the guard against booking
// over a meeting that only exists in Google.
export async function googleBusy(sb: any, from: string, to: string): Promise<Array<{ start: string; end: string }>> {
  const conn = await getConn(sb);
  if (!conn) return [];
  const token = await accessToken(sb, conn);
  const items = [{ id: "primary" }];
  if (conn.calendar_id) items.push({ id: conn.calendar_id });
  const d = await gfetch(token, "/freeBusy", { method: "POST", body: JSON.stringify({ timeMin: from, timeMax: to, items }) });
  const out: Array<{ start: string; end: string }> = [];
  for (const k of Object.keys(d.calendars || {})) for (const b of d.calendars[k].busy || []) out.push(b);
  return out;
}

export function overlaps(aS: string, aE: string, bS: string, bE: string) {
  return new Date(aS) < new Date(bE) && new Date(aE) > new Date(bS);
}
