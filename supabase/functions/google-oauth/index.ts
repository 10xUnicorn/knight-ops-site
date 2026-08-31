// google-oauth v3 — connects ONE Google account to the booking system.
// verify_jwt=false: the /callback leg is hit by Google's redirect with no JWT.
// Every other action is gated on an admin session JWT.
//
// Routes:
//   POST {action:'start'}        admin → {url}  (open it; Google redirects back)
//   GET  /callback?code&state    exchanges the code, stores the refresh token,
//                                creates + shares the bookings calendar, then
//                                bounces to /admin#bookingSettings
//   POST {action:'status'}       admin → connection summary (never the token)
//   POST {action:'disconnect'}   admin → revokes at Google and deletes the row
//   POST {action:'test_event'}   admin → creates a 15-min event now + returns link
//   POST {action:'busy',from,to} public → busy ranges (start/end only) for the
//                                slot picker; nothing else is exposed
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getConn, clientCreds, accessToken, ensureCalendar, googleBusy, BOOKINGS_CALENDAR_NAME, SHARE_WITH_DEFAULT } from "../_shared/gcal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://knightops.biz";
const SCOPES = ["https://www.googleapis.com/auth/calendar", "openid", "email"].join(" ");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function redirectUri() { return `${SUPABASE_URL}/functions/v1/google-oauth/callback`; }

// state = base64url(uid.ts).sig — HMAC with the service key, so a forged
// callback cannot attach a stranger's Google account to this system.
async function hmac(s: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function makeState(uid: string) { const p = `${uid}.${Date.now()}`; return `${btoa(p).replace(/=+$/, "")}.${await hmac(p)}`; }
async function checkState(state: string) {
  const [b, sig] = String(state || "").split(".");
  if (!b || !sig) return null;
  const p = atob(b.replace(/-/g, "+").replace(/_/g, "/"));
  if ((await hmac(p)) !== sig) return null;
  const [uid, ts] = p.split(".");
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return null;
  return uid;
}

async function adminUid(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const { data } = await sb.auth.getUser(jwt);
  const uid = data?.user?.id; if (!uid) return null;
  const { data: p } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
  return p && ["admin", "super_admin"].includes(String(p.role || "")) ? uid : null;
}
async function hostTz() {
  const { data } = await sb.from("booking_settings").select("value").eq("key", "timezone").maybeSingle();
  return data?.value ? String(data.value).replace(/"/g, "") : "America/Phoenix";
}
function page(title: string, msg: string, ok: boolean) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="background:#0a0a0b;color:#f5f5f5;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="max-width:440px;text-align:center;padding:32px;border:1px solid ${ok ? "#C8A45644" : "#ff646444"};border-radius:14px"><h2 style="color:${ok ? "#C8A456" : "#ff6464"}">${title}</h2><p style="color:#aaa;line-height:1.6">${msg}</p><a href="${SITE}/admin#bookingSettings" style="color:#C8A456">Back to Booking Settings</a></div>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  try {
    // ── OAuth callback (GET from Google) ─────────────────────────────────
    if (url.pathname.endsWith("/callback")) {
      if (url.searchParams.get("error")) return page("Google said no", `Google returned: ${url.searchParams.get("error")}. Nothing was changed.`, false);
      const uid = await checkState(url.searchParams.get("state") || "");
      if (!uid) return page("Link expired", "That connect link is no longer valid. Go back and click Connect again.", false);
      const code = url.searchParams.get("code") || "";
      const c = await clientCreds(sb);
      const tr = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
      });
      const tok = await tr.json();
      if (!tr.ok || !tok.refresh_token) {
        return page("No refresh token", `Google did not return a refresh token (${tok.error || tr.status}). This happens when the account already granted access once — remove Knight Ops at myaccount.google.com/permissions and connect again.`, false);
      }
      const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json()).catch(() => ({}));
      const email = String(ui.email || "").toLowerCase();
      if (!email) return page("Could not read the account", "Google did not tell us which account was connected.", false);

      // Single connection: replace whatever was there.
      await sb.from("google_calendar_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const { data: conn, error } = await sb.from("google_calendar_connection").insert({
        account_email: email, refresh_token: tok.refresh_token, scopes: tok.scope || SCOPES,
        share_with: SHARE_WITH_DEFAULT, connected_by: uid,
      }).select("*").single();
      if (error) return page("Could not save", error.message, false);
      try { await ensureCalendar(sb, conn, await hostTz()); }
      catch (e) { await sb.from("google_calendar_connection").update({ last_error: `calendar_create: ${String(e)}` }).eq("id", conn.id); }
      return Response.redirect(`${SITE}/admin?gcal=connected#bookingSettings`, 302);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || url.searchParams.get("action") || "status");

    // ── public: busy ranges for the slot picker ──────────────────────────
    if (action === "busy") {
      const from = String(body.from || url.searchParams.get("from") || "");
      const to = String(body.to || url.searchParams.get("to") || "");
      if (!from || !to) return json({ ok: false, reason: "from_to_required" }, 400);
      if (new Date(to).getTime() - new Date(from).getTime() > 62 * 86400000) return json({ ok: false, reason: "range_too_large" }, 400);
      try { return json({ ok: true, busy: await googleBusy(sb, from, to) }); }
      catch (e) { return json({ ok: true, busy: [], warning: String(e).slice(0, 120) }); }
    }

    // ── everything below is admin-only ───────────────────────────────────
    const uid = await adminUid(req);
    if (!uid) return json({ ok: false, reason: "admin_only" }, 401);

    if (action === "start") {
      const c = await clientCreds(sb);
      const p = new URLSearchParams({
        client_id: c.id, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES,
        access_type: "offline", prompt: "consent", include_granted_scopes: "true",
        state: await makeState(uid), ...(body.login_hint ? { login_hint: String(body.login_hint) } : {}),
      });
      return json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${p}`, redirect_uri: redirectUri() });
    }

    if (action === "status") {
      let configured = true;
      try { await clientCreds(sb); } catch { configured = false; }
      const conn = await getConn(sb);
      if (!conn) return json({ ok: true, configured, connected: false, redirect_uri: redirectUri() });
      return json({ ok: true, configured, connected: true, account_email: conn.account_email, calendar_id: conn.calendar_id, calendar_name: conn.calendar_name || BOOKINGS_CALENDAR_NAME, share_with: conn.share_with, connected_at: conn.connected_at, last_sync_at: conn.last_sync_at, last_error: conn.last_error, redirect_uri: redirectUri() });
    }

    if (action === "ensure_calendar") {
      const conn = await getConn(sb); if (!conn) return json({ ok: false, reason: "not_connected" });
      const c2 = await ensureCalendar(sb, conn, await hostTz());
      return json({ ok: true, calendar_id: c2.calendar_id, calendar_name: c2.calendar_name });
    }

    if (action === "set_share_with") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, reason: "bad_email" }, 400);
      const conn = await getConn(sb); if (!conn) return json({ ok: false, reason: "not_connected" });
      await sb.from("google_calendar_connection").update({ share_with: email }).eq("id", conn.id);
      if (conn.calendar_id) {
        const token = await accessToken(sb, conn);
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/acl?sendNotifications=true`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "writer", scope: { type: "user", value: email } }),
        });
      }
      return json({ ok: true, share_with: email });
    }

    if (action === "test_event") {
      const { syncBookingEvent } = await import("../_shared/gcal.ts");
      const start = new Date(Date.now() + 5 * 60000); const end = new Date(start.getTime() + 15 * 60000);
      const fake = { id: `test-${Date.now()}`, booker_name: "Connection test", booker_email: String(body.email || SHARE_WITH_DEFAULT), start_time: start.toISOString(), end_time: end.toISOString(), location_type: "video" } as any;
      const r = await syncBookingEvent(sb, fake, { name: "Knight Ops booking test", location_type: "video" }, await hostTz());
      return json({ ok: true, ...r });
    }

    // Push (or re-push) one booking to the calendar — used by admin "Retry sync"
    // after a transient failure, and to backfill rows created before connect.
    if (action === "resync_booking") {
      const { syncBookingEvent } = await import("../_shared/gcal.ts");
      const { data: bk } = await sb.from("bookings").select("*, booking_types(*)").eq("id", String(body.booking_id || "")).maybeSingle();
      if (!bk) return json({ ok: false, reason: "booking_not_found" }, 404);
      if (!["confirmed", "rescheduled", "pending"].includes(bk.status)) return json({ ok: false, reason: "booking_not_active" }, 400);
      try {
        const g = await syncBookingEvent(sb, bk, bk.booking_types || { name: "Booking" }, await hostTz());
        if (!g) return json({ ok: false, reason: "not_connected" });
        await sb.from("bookings").update({ google_event_id: g.event_id, google_event_link: g.link, meet_link: g.meet_link, google_sync_error: null }).eq("id", bk.id);
        return json({ ok: true, ...g });
      } catch (e) {
        await sb.from("bookings").update({ google_sync_error: String(e).slice(0, 300) }).eq("id", bk.id);
        return json({ ok: false, reason: String(e).slice(0, 300) });
      }
    }

    if (action === "disconnect") {
      const conn = await getConn(sb);
      if (conn) {
        try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, { method: "POST" }); } catch { /* best effort */ }
        await sb.from("google_calendar_connection").delete().eq("id", conn.id);
      }
      return json({ ok: true, connected: false });
    }

    return json({ ok: false, reason: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 300) }, 500);
  }
});
