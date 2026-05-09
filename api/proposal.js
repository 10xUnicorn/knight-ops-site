export default async function handler(req) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  const supabaseUrl = 'https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-proposal?slug=' + encodeURIComponent(slug);

  const dl = url.searchParams.get('dl');
  const fetchUrl = dl ? supabaseUrl + '&dl=' + encodeURIComponent(dl) : supabaseUrl;

  const upstream = await fetch(fetchUrl, {
    headers: {
      'User-Agent': req.headers.get('user-agent') || 'VercelProxy/1.0',
    },
  });

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';

  const responseHeaders = new Headers();
  responseHeaders.set('Content-Type', contentType);
  responseHeaders.set('Cache-Control', 'public, max-age=0, must-revalidate');

  const passHeaders = ['x-robots-tag'];
  for (const h of passHeaders) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders.set(h, v);
  }

  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const config = {
  runtime: 'edge',
};
