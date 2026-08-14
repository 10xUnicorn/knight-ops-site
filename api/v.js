/**
 * /v/:slug and /embed/:slug
 * Proxies to the video-serve edge function, which injects real Open Graph tags
 * into the static player shell so shared links preview properly.
 * Mirrors the existing api/le.js pattern.
 */
const FN = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/video-serve';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM';

export default async function handler(req, res) {
  const slug = String(req.query.slug || '').trim();
  const mode = req.query.mode === 'embed' ? 'embed' : 'watch';

  if (!/^[A-Za-z0-9_-]{4,40}$/.test(slug)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(400).send('<h1>Invalid video link</h1>');
  }

  try {
    const upstream = await fetch(
      `${FN}?slug=${encodeURIComponent(slug)}&mode=${mode}`,
      { headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } }
    );
    const html = await upstream.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Cache-Control',
      upstream.ok
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
        : 'no-store'
    );
    if (mode === 'embed') {
      res.setHeader('Content-Security-Policy', 'frame-ancestors *');
      res.removeHeader('X-Frame-Options');
    }
    return res.status(upstream.status).send(html);
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res
      .status(502)
      .send('<h1>Player temporarily unavailable</h1><p>Please refresh in a moment.</p>');
  }
}
