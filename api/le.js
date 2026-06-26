module.exports = async function handler(req, res) {
  const slug = req.query.slug;
  const v = req.query.v;

  if (!slug) {
    res.status(400).send('Missing slug');
    return;
  }

  let url = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-le?slug=' + encodeURIComponent(slug);
  if (v) url += '&v=' + encodeURIComponent(v);

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': req.headers['user-agent'] || 'VercelProxy/1.0' },
    });

    const html = await resp.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.status(resp.status === 404 ? 404 : 200).send(html);
  } catch (err) {
    res.status(502).send('Upstream error: ' + err.message);
  }
};
