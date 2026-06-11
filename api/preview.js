module.exports = async function handler(req, res) {
  const slug = req.query.slug;
  if (!slug) {
    res.status(400).send('Missing slug');
    return;
  }
  const supabaseUrl = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-preview?slug=' + encodeURIComponent(slug);
  try {
    const resp = await fetch(supabaseUrl, {
      headers: { 'User-Agent': req.headers['user-agent'] || 'VercelProxy/1.0' },
    });
    const html = await resp.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.status(resp.status).send(html);
  } catch (err) {
    res.status(502).send('Upstream error: ' + err.message);
  }
};
