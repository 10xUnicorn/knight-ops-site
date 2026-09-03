// IndexNow submitter (2026-09-03).
//
// Bing / ChatGPT search / Yandex / Naver index via IndexNow in minutes instead
// of waiting on sitemap crawls, and ~87% of ChatGPT search citations match
// Bing's top results. GET /api/indexnow submits every post published or
// updated in the last `hours` (default 48, max 720) plus the core pages.
//   /api/indexnow?hours=24        recent posts only
//   /api/indexnow?all=1           every published post (max 1000 URLs/call)
//   /api/indexnow?url=/blog/slug  a single URL
// Key file lives at /<KEY>.txt in the repo root (static, served before rewrites).

const SB_URL = 'https://trpnlkntvulkjerevngm.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM';
const HOST = 'www.knightops.biz';
const ORIGIN = 'https://' + HOST;
const KEY = 'a7c3e9f1b2d4485f9e6c0b1d2f3a4c5e';
const CORE = ['/', '/blog', '/fractional-ai-officer', '/services', '/pricing', '/about', '/book', '/case-studies', '/audit'];

module.exports = async function handler(req, res) {
  const q = req.query || {};
  let urls = [];

  if (q.url) {
    urls = [String(q.url)].map(function (u) { return u.startsWith('http') ? u : ORIGIN + (u.startsWith('/') ? u : '/' + u); });
  } else {
    const hours = Math.min(720, Math.max(1, parseInt(q.hours || '48', 10) || 48));
    let sel = SB_URL + '/rest/v1/blog_posts?select=slug&status=eq.published&order=published_at.desc&limit=1000';
    if (!q.all) {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      sel += '&or=(published_at.gte.' + since + ',updated_at.gte.' + since + ')';
    }
    try {
      const r = await fetch(sel, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
      const data = await r.json();
      if (Array.isArray(data)) urls = data.map(function (p) { return ORIGIN + '/blog/' + p.slug; });
    } catch (e) { /* fall through */ }
    urls = CORE.map(function (p) { return ORIGIN + p; }).concat(urls);
  }

  urls = Array.from(new Set(urls)).slice(0, 10000);
  if (!urls.length) { res.status(200).json({ submitted: 0, note: 'nothing to submit' }); return; }

  const payload = { host: HOST, key: KEY, keyLocation: ORIGIN + '/' + KEY + '.txt', urlList: urls };
  let status = null, text = '';
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    status = r.status;
    text = await r.text();
  } catch (e) { text = String(e && e.message || e); }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ submitted: urls.length, indexnow_status: status, indexnow_response: text.slice(0, 300), sample: urls.slice(0, 5) });
};
