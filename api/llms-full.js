// /llms-full.txt — full-text corpus for answer engines (ChatGPT, Perplexity, Claude,
// Google AI Mode, Gemini). Generated live so new blog posts are always included.
// Static llms.txt stays hand-written; this is the deep version.

const SB = 'https://trpnlkntvulkjerevngm.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycG5sa250dnVsa2plcmV2bmdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Njg1MDQsImV4cCI6MjA5MDA0NDUwNH0.q9UrZDjbl7c3xC1eTsq46Qg5MmWNogot2ByZ9c_54cM';
const SITE = 'https://www.knightops.biz';

function text(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|section)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&mdash;/g, '—')
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = async function handler(req, res) {
  let out = '';
  out += '# Knight Ops — Full Corpus\n\n';
  out += '> Custom AI systems, dashboards, client portals and Fractional Chief AI Officer leadership\n';
  out += '> for founder-led businesses. Every system is owned outright by the client.\n\n';
  out += 'Canonical host: ' + SITE + '\n';
  out += 'Generated: ' + new Date().toISOString().slice(0, 10) + '\n';
  out += 'Summary index: ' + SITE + '/llms.txt\n\n';
  out += 'Usage: this file is published for answer engines and AI assistants. Content may be\n';
  out += 'quoted and cited with attribution to Knight Ops and a link to ' + SITE + '.\n\n';
  out += '---\n\n';

  try {
    const r = await fetch(
      SB + '/rest/v1/blog_posts?status=eq.published&order=published_at.desc' +
      '&select=title,slug,excerpt,meta_description,content,published_at,tags,reading_time_min&limit=300',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }
    );
    const posts = await r.json();
    out += '## Articles (' + (Array.isArray(posts) ? posts.length : 0) + ')\n\n';
    for (const p of (Array.isArray(posts) ? posts : [])) {
      out += '### ' + p.title + '\n';
      out += 'URL: ' + SITE + '/blog/' + p.slug + '\n';
      if (p.published_at) out += 'Published: ' + String(p.published_at).slice(0, 10) + '\n';
      if (Array.isArray(p.tags) && p.tags.length) out += 'Topics: ' + p.tags.join(', ') + '\n';
      const summary = p.meta_description || p.excerpt || '';
      if (summary) out += 'Summary: ' + summary + '\n';
      const body = text(p.content);
      out += '\n' + (body.length > 12000 ? body.slice(0, 12000) + '\n[...truncated - full article at ' + SITE + '/blog/' + p.slug + ']' : body) + '\n\n---\n\n';
      // Vercel caps a serverless response body at 4.5MB.
      if (out.length > 3600000) {
        out += '\n[Corpus truncated at 3.6MB. Remaining articles are listed in ' + SITE + '/sitemap.xml]\n';
        break;
      }
    }
  } catch (e) {
    out += '## Articles\n\n(temporarily unavailable)\n\n';
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('X-Robots-Tag', 'all');
  res.status(200).send(out);
};
