export default async function handler(req, res) {
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
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    const xRobots = upstream.headers.get('x-robots-tag');
    if (xRobots) res.setHeader('X-Robots-Tag', xRobots);

    res.status(upstream.status).send(buffer);
  } catch (err) {
    res.status(502).send('Upstream error: ' + err.message);
  }
}
