module.exports = async function handler(req, res) {
  const file = req.query.file;

  if (!file) {
    res.status(400).send('Missing file');
    return;
  }

  const supabaseUrl = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-app?file=' + encodeURIComponent(file);

  try {
    const resp = await fetch(supabaseUrl, {
      headers: { 'User-Agent': req.headers['user-agent'] || 'VercelProxy/1.0' },
    });

    const contentType = resp.headers.get('content-type') || 'text/html; charset=utf-8';
    const disposition = resp.headers.get('content-disposition');

    // For binary content types, pipe as buffer
    if (contentType.includes('application/pdf') || contentType.startsWith('image/') || contentType.includes('octet-stream') || contentType.includes('zip') || contentType.includes('officedocument')) {
      const buf = Buffer.from(await resp.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      if (disposition) res.setHeader('Content-Disposition', disposition);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.status(resp.status).end(buf);
    } else {
      // Text/HTML content — use res.writeHead + res.end to prevent Vercel from overriding Content-Type
      const html = await resp.text();
      res.writeHead(resp.status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      });
      res.end(html);
    }
  } catch (err) {
    res.status(502).send('Upstream error: ' + err.message);
  }
};
