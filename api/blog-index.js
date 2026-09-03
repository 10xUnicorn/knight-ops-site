// Server-rendered /blog index for crawlers (2026-09-03).
//
// WHY: GSC showed 182 posts "Discovered - currently not indexed". The blog
// index rendered its cards client-side as <div onclick>, so Googlebot found
// posts only through the sitemap with zero internal link equity. This handler
// injects real <a href="/blog/slug"> cards (paginated via ?page=N with
// rel=prev/next) into the same blog.html shell; the client JS still hydrates
// on top of it exactly as before.

const fs = require('fs');
const path = require('path');

const SB_URL = 'https://trpnlkntvulkjerevngm.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM';
const ORIGIN = 'https://www.knightops.biz';
const PER_PAGE = 60;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

let shellCache = null;
function loadShell() {
  if (shellCache) return shellCache;
  shellCache = fs.readFileSync(path.join(process.cwd(), 'blog.html'), 'utf8');
  return shellCache;
}

module.exports = async function handler(req, res) {
  let shell;
  try { shell = loadShell(); } catch (e) { res.status(500).send('Shell unavailable'); return; }

  const page = Math.max(0, parseInt(req.query.page || '0', 10) || 0);
  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'count=exact' };

  let posts = [];
  let total = 0;
  try {
    const r = await fetch(
      SB_URL + '/rest/v1/blog_posts?select=slug,title,excerpt,meta_description,published_at,reading_time_min,tags,content_cluster,featured_image_url' +
        '&status=eq.published&order=published_at.desc&offset=' + (page * PER_PAGE) + '&limit=' + PER_PAGE,
      { headers: H }
    );
    const cr = r.headers.get('content-range') || '';
    total = parseInt(cr.split('/')[1] || '0', 10) || 0;
    const data = await r.json();
    if (Array.isArray(data)) posts = data;
  } catch (e) { posts = []; }

  const cards = posts.map(function (p) {
    const d = p.published_at ? new Date(p.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const tags = (Array.isArray(p.tags) ? p.tags : []).slice(0, 3).map(function (t) { return '<span class="blog-card-tag">' + esc(t) + '</span>'; }).join('');
    const img = p.featured_image_url ? '<img class="blog-card-img" src="' + esc(p.featured_image_url) + '" alt="' + esc(p.title) + '" loading="lazy">' : '';
    return '<a class="blog-card" href="/blog/' + esc(p.slug) + '" style="text-decoration:none;color:inherit">' + img +
      '<div class="blog-card-body"><div class="blog-card-tags">' + tags + '</div><h3>' + esc(p.title) + '</h3><p>' + esc(stripTags(p.excerpt || p.meta_description || '').slice(0, 160)) + '</p></div>' +
      '<div class="blog-card-meta"><span>' + esc(d) + ' &middot; ' + esc(p.reading_time_min || 5) + ' min read</span><span class="blog-card-read">Read &rarr;</span></div></a>';
  }).join('');

  const lastPage = total ? Math.ceil(total / PER_PAGE) - 1 : page;
  let pager = '';
  if (page > 0) pager += '<a href="/blog?page=' + (page - 1) + '" rel="prev" style="color:var(--gold);margin-right:18px">&larr; Newer posts</a>';
  if (page < lastPage) pager += '<a href="/blog?page=' + (page + 1) + '" rel="next" style="color:var(--gold)">Older posts &rarr;</a>';
  if (pager) pager = '<nav class="blog-pager" aria-label="Blog pagination" style="text-align:center;padding:24px 0 8px;font-size:.9rem">' + pager + '</nav>';

  let html = shell;
  html = html.replace('<div class="blog-grid" id="blogGrid"></div>', '<div class="blog-grid" id="blogGrid">' + cards + '</div>' + pager);

  // Canonical + prev/next hints for the crawler
  const canonical = ORIGIN + '/blog' + (page > 0 ? '?page=' + page : '');
  html = html.replace(/(<link rel="canonical" id="canonical" href=")[^"]*(")/i, '$1' + canonical + '$2');
  let links = '';
  if (page > 0) links += '<link rel="prev" href="' + ORIGIN + '/blog' + (page - 1 > 0 ? '?page=' + (page - 1) : '') + '">';
  if (page < lastPage) links += '<link rel="next" href="' + ORIGIN + '/blog?page=' + (page + 1) + '">';
  if (links) html = html.replace('</head>', links + '</head>');

  // CollectionPage schema listing this page's posts
  const list = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'The Knight Ops Blog',
    url: canonical,
    isPartOf: { '@type': 'WebSite', url: ORIGIN },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map(function (p, i) {
        return { '@type': 'ListItem', position: page * PER_PAGE + i + 1, url: ORIGIN + '/blog/' + p.slug, name: p.title };
      })
    }
  };
  html = html.replace('</head>', '<script type="application/ld+json">' + JSON.stringify(list) + '</script></head>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(html);
};
