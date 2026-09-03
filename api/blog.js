// Server-rendered blog post pages for SEO.
// Crawlers previously received the /blog.html shell for every /blog/:slug URL,
// which meant every post shared one <title> and canonicalised to /blog.
// This handler injects per-post metadata + article HTML into the same shell,
// so the client-side hydration in blog.html still works unchanged.

const fs = require('fs');
const path = require('path');

const SB_URL = 'https://trpnlkntvulkjerevngm.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM';

const ORIGIN = 'https://www.knightops.biz';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function setAttrById(html, id, attr, value) {
  const re = new RegExp('(<[^>]*\\bid="' + id + '"[^>]*\\b' + attr + '=")[^"]*(")', 'i');
  if (re.test(html)) return html.replace(re, '$1' + esc(value) + '$2');
  const re2 = new RegExp('(<[^>]*\\bid="' + id + '")', 'i');
  return html.replace(re2, '$1 ' + attr + '="' + esc(value) + '"');
}

function setTitleById(html, id, value) {
  const re = new RegExp('(<title[^>]*\\bid="' + id + '"[^>]*>)[\\s\\S]*?(</title>)', 'i');
  return html.replace(re, '$1' + esc(value) + '$2');
}

module.exports = async function handler(req, res) {
  const slug = String(req.query.slug || '').trim();

  if (!slug) {
    res.setHeader('Location', '/blog');
    res.status(308).end();
    return;
  }

  let shell;
  try {
    shell = loadShell();
  } catch (e) {
    res.status(500).send('Shell unavailable');
    return;
  }

  let post = null;
  try {
    const r = await fetch(
      SB_URL + '/rest/v1/blog_posts?slug=eq.' + encodeURIComponent(slug) + '&status=eq.published&limit=1',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    const data = await r.json();
    if (Array.isArray(data) && data.length) post = data[0];
  } catch (e) {
    // fall through
  }

  if (!post) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.status(404).send(
      shell.replace(
        '<link rel="canonical" id="canonical" href="https://knightops.biz/blog">',
        '<link rel="canonical" id="canonical" href="' + ORIGIN + '/blog"><meta name="robots" content="noindex,follow">'
      )
    );
    return;
  }

  const url = ORIGIN + '/blog/' + post.slug;
  const title = post.title || 'Knight Ops Blog';
  const desc = post.meta_description || post.excerpt || stripTags(post.content).slice(0, 155);
  const image = post.featured_image_url || (ORIGIN + '/og-default.png');
  const published = post.published_at || '';
  const updated = post.updated_at || post.published_at || '';
  const author = post.author_name || 'Daniel Knight';

  let html = shell;
  html = setTitleById(html, 'pageTitle', title + ' — Knight Ops');
  html = setAttrById(html, 'metaDesc', 'content', desc);
  html = setAttrById(html, 'canonical', 'href', url);
  html = setAttrById(html, 'ogUrl', 'content', url);
  html = setAttrById(html, 'ogTitle', 'content', title);
  html = setAttrById(html, 'ogDesc', 'content', desc);
  html = setAttrById(html, 'ogImage', 'content', image);
  html = setAttrById(html, 'twTitle', 'content', title);
  html = setAttrById(html, 'twDesc', 'content', desc);
  html = setAttrById(html, 'twImage', 'content', image);
  html = html.replace('<meta property="og:type" content="website">', '<meta property="og:type" content="article">');

  let schema;
  if (post.schema_json && post.schema_json['@context']) {
    schema = post.schema_json;
  } else {
    schema = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      headline: title,
      description: desc,
      image: image ? [image] : undefined,
      datePublished: published,
      dateModified: updated,
      author: { '@type': 'Person', '@id': ORIGIN + '/#daniel-knight', name: author, url: ORIGIN + '/about' },
      publisher: {
        '@type': 'Organization',
        '@id': ORIGIN + '/#organization',
        name: 'Knight Ops',
        url: ORIGIN
      },
      keywords: Array.isArray(post.tags) ? post.tags.join(', ') : undefined,
      wordCount: stripTags(post.content).split(' ').length
    };
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: ORIGIN + '/blog' },
      { '@type': 'ListItem', position: 3, name: title, item: url }
    ]
  };

  html = html.replace(
    /(<script id="postSchema" type="application\/ld\+json">)[\s\S]*?(<\/script>)/i,
    '$1' + JSON.stringify(schema) + '$2\n<script type="application/ld+json">' + JSON.stringify(breadcrumbs) + '</script>'
  );

  const dateLabel = published
    ? new Date(published).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const tagHtml = (Array.isArray(post.tags) ? post.tags : [])
    .map(function (t) { return '<span class="post-tag">' + esc(t) + '</span>'; })
    .join('');

  const headerHtml =
    '<h1>' + esc(title) + '</h1>' +
    '<div class="post-meta"><span>By ' + esc(author) + '</span>' +
    (published ? '<span><time datetime="' + esc(published) + '">' + esc(dateLabel) + '</time></span>' : '') +
    '<span>' + esc(post.reading_time_min || 5) + ' min read</span></div>' +
    '<div class="post-tags">' + tagHtml + '</div>';

  html = html.replace(
    '<div class="post-header" id="postHeader"></div>',
    '<div class="post-header" id="postHeader">' + headerHtml + '</div>'
  );
  // ── Server-rendered CTA (2026-09-03) ──────────────────────────────────────
  // GSC audit found the top-impression posts rendered ZERO calls to action.
  // Primary blog CTA is the complimentary Tech Discovery Call (/book). The
  // Systems Blueprint Session is step 2 and is only named, never linked.
  const ctaSrc = '/book?src=blog&post=' + encodeURIComponent(post.slug);
  const ctaBox =
    '<aside class="post-cta-box" style="margin:48px 0 8px;padding:32px 28px;border:1px solid var(--gold-b);border-radius:16px;background:linear-gradient(135deg,var(--gold-s),rgba(0,0,0,0)) , var(--card)">' +
      '<div style="font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">Next step</div>' +
      '<h2 style="margin:0 0 12px;font-size:1.5rem;line-height:1.25;color:var(--txt)">Want a 90-day roadmap for your systems?</h2>' +
      '<p style="margin:0 0 20px;color:var(--txt2);line-height:1.65">Start with a complimentary Tech Discovery Call. In 20 to 30 minutes we look at how your organization runs today and decide together whether a Systems Blueprint Session is the logical next step. If it is, that session maps out your 90-day systems roadmap, and you keep the architecture either way.</p>' +
      '<a href="' + ctaSrc + '" class="btn btn-gold" style="display:inline-block;padding:14px 22px;border-radius:10px;background:var(--gold);color:#0A0A0B;font-weight:700;text-decoration:none">Schedule Your Complimentary Tech Discovery Call &rarr;</a>' +
      '<div style="margin-top:14px;font-size:.85rem"><a href="/fractional-ai-officer" style="color:var(--gold)">How the Fractional Chief AI Operations Officer engagement works</a> &middot; <a href="/pricing" style="color:var(--gold)">Pricing</a></div>' +
    '</aside>';

  // Mid-post callout: one line before the 3rd <h2>, so readers who never
  // reach the bottom still see the offer. Skipped if the post has < 3 H2s.
  let body = post.content || '';
  let h2Count = 0;
  body = body.replace(/<h2\b/gi, function (m) {
    h2Count += 1;
    if (h2Count !== 3) return m;
    return '<p class="post-cta-inline" style="margin:28px 0;padding:16px 20px;border-left:3px solid var(--gold);background:var(--gold-s);border-radius:0 10px 10px 0;color:var(--txt2)">' +
      'Is the founder still the system in your company? <a href="' + ctaSrc + '&pos=mid" style="color:var(--gold);font-weight:600">Book a complimentary Tech Discovery Call</a> and in 30 minutes we will tell you whether a 90-day systems roadmap is the right next move.</p>' + m;
  });

  html = html.replace(
    '<div class="post-content" id="postContent"></div>',
    '<div class="post-content" id="postContent" data-ssr="1" data-ssr-slug="' + esc(post.slug) + '">' + body + ctaBox + '</div>'
  );

  // ── Server-rendered related posts as REAL <a href> links (2026-09-03) ────
  // The client renders related cards as <div onclick>, which gives crawlers
  // no link path between posts. Inject 3 same-cluster siblings (fallback:
  // newest) so every post links to 3 others in crawlable HTML.
  let related = [];
  try {
    const sel = 'select=slug,title,excerpt,meta_description,published_at,reading_time_min&status=eq.published&slug=neq.' + encodeURIComponent(post.slug) + '&order=published_at.desc&limit=3';
    let rq = SB_URL + '/rest/v1/blog_posts?' + sel;
    if (post.content_cluster) rq += '&content_cluster=eq.' + encodeURIComponent(post.content_cluster);
    let rr = await fetch(rq, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    related = await rr.json();
    if (!Array.isArray(related) || related.length < 3) {
      rr = await fetch(SB_URL + '/rest/v1/blog_posts?' + sel, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
      const more = await rr.json();
      const seen = new Set((related || []).map(function (p) { return p.slug; }));
      (Array.isArray(more) ? more : []).forEach(function (p) { if (!seen.has(p.slug) && related.length < 3) { related.push(p); seen.add(p.slug); } });
    }
  } catch (e) { related = []; }
  if (related.length) {
    const relHtml = related.map(function (p) {
      const d = p.published_at ? new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return '<a class="blog-card" href="/blog/' + esc(p.slug) + '" style="text-decoration:none;color:inherit"><div class="blog-card-body"><h3 style="font-size:1rem">' + esc(p.title) + '</h3><p style="font-size:.8rem">' + esc(stripTags(p.excerpt || p.meta_description || '').slice(0, 110)) + '</p></div><div class="blog-card-meta"><span>' + esc(d) + '</span><span class="blog-card-read">Read &rarr;</span></div></a>';
    }).join('');
    html = html.replace(
      '<div class="related-section" id="relatedSection" style="display:none">',
      '<div class="related-section" id="relatedSection">'
    );
    html = html.replace('<div class="related-grid" id="relatedGrid"></div>', '<div class="related-grid" id="relatedGrid">' + relHtml + '</div>');
  }

  if (post.featured_image_url) {
    html = html.replace(
      '<img class="post-hero-img" id="postHeroImg" src="" alt="" style="display:none">',
      '<img class="post-hero-img" id="postHeroImg" src="' + esc(post.featured_image_url) + '" alt="' + esc(title) + '" loading="eager">'
    );
  }

  html = html.replace('<div id="blogIndex">', '<div id="blogIndex" style="display:none">');
  html = html.replace('<article class="post-view" id="postView">', '<article class="post-view active" id="postView">');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
};
