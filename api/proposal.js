module.exports = async function handler(req, res) {
  const slug = req.query.slug;

  if (!slug) {
    return res.status(400).send('Missing slug');
  }

  const supabaseUrl = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-proposal?slug=' + encodeURIComponent(slug);

  const dl = req.query.dl;
  const fetchUrl = dl ? supabaseUrl + '&dl=' + encodeURIComponent(dl) : supabaseUrl;

  try {
    const upstream = await fetch(fetchUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'VercelProxy/1.0',
      },
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get('content-type') || 'text/html; charset=utf-8';

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    const xr = upstream.headers.get('x-robots-tag');
    if (xr) res.setHeader('X-Robots-Tag', xr);

    res.status(upstream.status).end(buffer);
  } catch (err) {
    res.status(502).send('Upstream error: ' + err.message);
  }
};
