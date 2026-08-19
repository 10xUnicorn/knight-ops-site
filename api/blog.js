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
  html = html.replace(
    '<div class="post-content" id="postContent"></div>',
    '<div class="post-content" id="postContent">' + (post.content || '') + '</div>'
  );

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
