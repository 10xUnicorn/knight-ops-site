// Dynamic sitemap — queries Supabase blog_posts live so every published post is always indexed.
// Served at /sitemap.xml via vercel.json rewrite.
const SUPABASE_URL = 'https://trpnlkntvulkjerevngm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM';
const SITE = 'https://knightops.biz';

// Static pages with priorities
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.7' },
  { path: '/blog', changefreq: 'daily', priority: '0.9' },
  { path: '/audit', changefreq: 'monthly', priority: '0.9' },
  { path: '/book', changefreq: 'monthly', priority: '0.9' },
  { path: '/services', changefreq: 'monthly', priority: '0.9' },
  { path: '/portfolio', changefreq: 'monthly', priority: '0.8' },
  { path: '/apply', changefreq: 'monthly', priority: '0.9' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.8' },
  { path: '/partners', changefreq: 'monthly', priority: '0.6' },
  { path: '/faq', changefreq: 'weekly', priority: '0.7' },
  { path: '/fractional-ai-officer', changefreq: 'monthly', priority: '0.9' },
  { path: '/fractional-chief-ai-officer-services', changefreq: 'weekly', priority: '0.95' },
  { path: '/fractional-ai-officer-services', changefreq: 'weekly', priority: '0.9' },
  { path: '/challenge', changefreq: 'monthly', priority: '0.8' },
  { path: '/for-coaches', changefreq: 'monthly', priority: '0.8' },
  { path: '/for-consultants', changefreq: 'monthly', priority: '0.8' },
  { path: '/for-course-creators', changefreq: 'monthly', priority: '0.8' },
  { path: '/for-speakers', changefreq: 'monthly', priority: '0.8' },
  { path: '/for-agencies', changefreq: 'monthly', priority: '0.8' },
  { path: '/apps-for-coaches', changefreq: 'monthly', priority: '0.7' },
  { path: '/apps-for-consultants', changefreq: 'monthly', priority: '0.7' },
  { path: '/apps-for-course-creators', changefreq: 'monthly', priority: '0.7' },
  { path: '/apps-for-speakers', changefreq: 'monthly', priority: '0.7' },
  { path: '/apps-for-meal-prep', changefreq: 'monthly', priority: '0.7' },
  { path: '/case-studies', changefreq: 'weekly', priority: '0.8' },
  { path: '/speaker', changefreq: 'monthly', priority: '0.6' },
  { path: '/tools', changefreq: 'weekly', priority: '0.8' },
  { path: '/booking', changefreq: 'monthly', priority: '0.7' },
  { path: '/assess', changefreq: 'monthly', priority: '0.7' },
  { path: '/blueprint', changefreq: 'monthly', priority: '0.7' },
  { path: '/speed-to-value', changefreq: 'monthly', priority: '0.7' },
  { path: '/careers', changefreq: 'monthly', priority: '0.5' },
];

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = async function handler(req, res) {
  let posts = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?select=slug,published_at,updated_at&status=eq.published&order=published_at.desc&limit=2000`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    if (r.ok) posts = await r.json();
  } catch (e) {
    console.error('sitemap: blog fetch failed', e);
  }

  const today = new Date().toISOString().split('T')[0];
  let urls = '';

  // Static pages
  for (const p of STATIC_PAGES) {
    urls += `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
  }

  // Blog posts
  for (const post of posts) {
    if (!post.slug) continue;
    const lastmod = (post.updated_at || post.published_at || today).split('T')[0];
    urls += `  <url>\n    <loc>${SITE}/blog/${xmlEscape(post.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
