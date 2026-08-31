// Branded booking emails. Times are rendered in the GUEST's timezone with
// the real abbreviation — the old templates hardcoded "ET" for everyone.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
export const SITE = "https://knightops.biz";
export const HOST_NOTIFY = ["daniel@knightops.biz", "dknightunicorn@gmail.com"];

export function fmtDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
}
export function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz, timeZoneName: "short" });
}
export function esc(s: unknown) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function shell(inner: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:'Segoe UI',system-ui,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 24px">
<div style="text-align:center;margin-bottom:28px"><div style="display:inline-block;width:48px;height:48px;background:linear-gradient(135deg,#C8A456,#A08636);border-radius:12px;line-height:48px;font-size:24px;font-weight:900;color:#0A0A0B">K</div></div>
${inner}
<p style="color:#555;font-size:12px;text-align:center;margin:24px 0 0">Knight Ops &bull; knightops.biz</p></div></body></html>`;
}
function row(k: string, v: string, strong = false) {
  return `<tr><td style="color:#888;padding:6px 0;font-size:13px;width:110px;vertical-align:top">${k}</td><td style="color:${strong ? "#F5F5F5" : "#ddd"};padding:6px 0;font-size:14px;${strong ? "font-weight:600" : ""}">${v}</td></tr>`;
}
function btn(href: string, label: string, primary = true) {
  return primary
    ? `<a href="${href}" style="display:inline-block;padding:11px 24px;background:linear-gradient(135deg,#C8A456,#A08636);color:#0A0A0B;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;margin:4px">${label}</a>`
    : `<a href="${href}" style="display:inline-block;padding:10px 22px;border:1px solid rgba(200,164,86,.35);color:#C8A456;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin:4px">${label}</a>`;
}

export type B = { id: string; booker_name: string; booker_email: string; booker_phone?: string | null; start_time: string; end_time: string; timezone?: string | null; notes?: string | null; cancel_token?: string | null; meet_link?: string | null; location_value?: string | null; custom_responses?: any };
export type T = { name: string; duration_minutes?: number; location_type?: string | null; location_value?: string | null };

function whereRow(b: B, t: T) {
  const link = b.meet_link || b.location_value || t.location_value;
  if (link && /^https?:/i.test(link)) return row("Where", `<a href="${link}" style="color:#C8A456">${esc(link)}</a>`);
  if (link) return row("Where", esc(link));
  const l = String(t.location_type || "").toLowerCase();
  if (l === "phone") return row("Where", "Phone call" + (b.booker_phone ? ` — we'll call ${esc(b.booker_phone)}` : ""));
  if (l === "in_person") return row("Where", "In person");
  return row("Where", "Video call — the link is on the calendar invite");
}

export function guestConfirm(b: B, t: T, kind: "confirmed" | "rescheduled", oldStart?: string) {
  const tz = b.timezone || "America/Phoenix";
  const manage = b.cancel_token ? `<div style="text-align:center;margin-top:14px">${btn(`${SITE}/booking?action=reschedule&id=${b.id}&token=${b.cancel_token}`, "Reschedule", false)}${btn(`${SITE}/booking?action=cancel&id=${b.id}&token=${b.cancel_token}`, "Cancel", false)}</div>` : "";
  return shell(`<div style="background:#111113;border:1px solid rgba(200,164,86,.15);border-radius:16px;padding:32px">
<h1 style="color:#F5F5F5;font-size:22px;margin:0 0 6px">${kind === "confirmed" ? "You're booked" : "Your booking moved"}</h1>
<p style="color:#888;margin:0 0 22px;font-size:14px">${esc(t.name)} with Daniel Knight. A Google Calendar invite is on its way to ${esc(b.booker_email)}.</p>
<div style="background:rgba(200,164,86,.08);border:1px solid rgba(200,164,86,.2);border-radius:12px;padding:18px 20px;margin-bottom:18px"><table style="width:100%;border-collapse:collapse">
${oldStart ? row("Was", `<s style="color:#666">${fmtDate(oldStart, tz)} at ${fmtTime(oldStart, tz)}</s>`) : ""}
${row("When", `${fmtDate(b.start_time, tz)}<br>${fmtTime(b.start_time, tz)} – ${fmtTime(b.end_time, tz)}`, true)}
${row("Length", `${t.duration_minutes || 30} minutes`)}
${whereRow(b, t)}
</table></div>
${manage}
</div>`);
}

export function hostNotify(b: B, t: T, kind: "New booking" | "Rescheduled" | "Cancelled", extra = "", hostTz = "America/Phoenix") {
  const cr = b.custom_responses && typeof b.custom_responses === "object" ? Object.entries(b.custom_responses).map(([k, v]) => row(esc(k), esc(v))).join("") : "";
  return shell(`<div style="background:#111113;border:1px solid rgba(200,164,86,.15);border-radius:16px;padding:32px">
<h1 style="color:${kind === "Cancelled" ? "#ff6464" : "#C8A456"};font-size:20px;margin:0 0 16px">${kind}: ${esc(t.name)}</h1>
<table style="width:100%;border-collapse:collapse">
${row("Guest", esc(b.booker_name), true)}${row("Email", `<a href="mailto:${esc(b.booker_email)}" style="color:#C8A456">${esc(b.booker_email)}</a>`)}
${b.booker_phone ? row("Phone", esc(b.booker_phone)) : ""}
${row("When", `${fmtDate(b.start_time, hostTz)}<br>${fmtTime(b.start_time, hostTz)} – ${fmtTime(b.end_time, hostTz)}`, true)}
${b.timezone && b.timezone !== hostTz ? row("Guest tz", esc(b.timezone)) : ""}
${whereRow(b, t)}${cr}${b.notes ? row("Notes", esc(b.notes)) : ""}${extra}
</table>
<div style="text-align:center;margin-top:18px">${btn(`${SITE}/admin#bookings/${b.id}`, "Open in admin")}</div></div>`);
}

export async function send(to: string[], subject: string, html: string, fromName = "Daniel Knight") {
  if (!RESEND_API_KEY) return { ok: false, reason: "no_resend_key" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${fromName} <daniel@knightops.biz>`, to, subject, html, reply_to: "daniel@knightops.biz" }),
  });
  return { ok: r.ok, status: r.status };
}
