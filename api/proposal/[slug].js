export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const slug = url.pathname.split('/').pop();
  const dl = url.searchParams.get('dl');

  const target = `https://trpnlkntvulkjerevngm.supabase.co/functions/v1/serve-proposal?slug=${encodeURIComponent(slug)}${dl ? '&dl=' + encodeURIComponent(dl) : ''}`;

  const resp = await fetch(target, {
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM',
    },
  });

  const body = await resp.arrayBuffer();
  const ct = resp.headers.get('content-type') || 'text/html; charset=utf-8';
  const cd = resp.headers.get('content-disposition');

  const headers = {
    'Content-Type': ct,
    'Cache-Control': 'public, max-age=0, must-revalidate',
  };
  if (cd) headers['Content-Disposition'] = cd;

  return new Response(body, { status: resp.status, headers });
}
