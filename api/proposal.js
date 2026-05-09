module.exports = async function handler(req, res) {
  const slug = req.query.slug;

  if (!slug) {
    res.statusCode = 400;
    res.end('Missing slug');
    return;
  }

  const supabaseUrl = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-proposal?slug=' + encodeURIComponent(slug);

  const dl = req.query.dl;
  const fetchUrl = dl ? supabaseUrl + '&dl=' + encodeURIComponent(dl) : supabaseUrl;

  try {
    const resp = await fetch(fetchUrl, {
      headers: { 'User-Agent': req.headers['user-agent'] || 'VercelProxy/1.0' },
    });

    const html = await resp.text();
    const ct = resp.headers.get('content-type') || 'text/html; charset=utf-8';

    res.writeHead(resp.status, {
      'Content-Type': ct,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    });
    res.end(html);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Upstream error: ' + err.message);
  }
};
