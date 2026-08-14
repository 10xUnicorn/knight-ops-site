/**
 * ko-video — Knight Ops video storage + delivery worker
 * ─────────────────────────────────────────────────────
 * Cloudflare Worker sitting in front of the `knight-ops-videos` R2 bucket.
 *
 * Why a Worker instead of S3 presigned URLs:
 *   - R2 binding means NO access keys to leak or rotate
 *   - Range-request streaming (seek/scrub) is handled natively
 *   - Multipart upload lets the extension stream while it records,
 *     so a 20 minute video is fully uploaded seconds after you stop
 *
 * Routes
 *   POST   /upload/init        {slug, ext, mime, kind}  -> {key, uploadId}
 *   PUT    /upload/part        ?key&uploadId&part       -> {part, etag}
 *   POST   /upload/complete    {key, uploadId, parts}   -> {key, url, size}
 *   POST   /upload/abort       {key, uploadId}          -> {ok}
 *   PUT    /upload/simple      ?key&mime                -> {key, url}   (screenshots, thumbs)
 *   GET    /f/<key...>                                  -> object w/ Range support
 *   HEAD   /f/<key...>                                  -> headers only
 *   DELETE /f/<key...>                                  -> {ok}         (authed)
 *   GET    /health                                      -> {ok}
 *
 * Writes require:  Authorization: Bearer <UPLOAD_SECRET>
 * Reads are public — keys embed a UUID and are unguessable (same model as Loom).
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Chrome extensions send an chrome-extension:// origin that we can't know ahead of time.
  const ok = !origin || origin.startsWith('chrome-extension://') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Ko-Slug,Range',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,ETag',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) },
  });
}

function authed(request, env) {
  const h = request.headers.get('Authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  return !!env.UPLOAD_SECRET && token === env.UPLOAD_SECRET;
}

function safeKey(k) {
  // Keys we mint look like: videos/<uuid>/master.webm — never allow traversal.
  return typeof k === 'string' && /^[a-z0-9][a-z0-9/_\-.]{3,200}$/i.test(k) && !k.includes('..');
}

function publicUrl(request, key) {
  return `${new URL(request.url).origin}/f/${key}`;
}

/** Parse an HTTP Range header into R2's range option. */
function parseRange(header, size) {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return undefined;
  const [, startStr, endStr] = m;
  if (startStr === '' && endStr === '') return undefined;
  if (startStr === '') return { suffix: Number(endStr) };            // last N bytes
  const offset = Number(startStr);
  if (endStr === '') return { offset };                              // offset -> EOF
  return { offset, length: Number(endStr) - offset + 1 };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === '/health') return json({ ok: true, service: 'ko-video' }, 200, request, env);

    // ── DELIVERY ────────────────────────────────────────────
    if (path.startsWith('/f/')) {
      const key = decodeURIComponent(path.slice(3));
      if (!safeKey(key)) return json({ error: 'bad_key' }, 400, request, env);

      if (request.method === 'DELETE') {
        if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, request, env);
        await env.VIDEOS.delete(key);
        return json({ ok: true, deleted: key }, 200, request, env);
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ error: 'method_not_allowed' }, 405, request, env);
      }

      const rangeHeader = request.headers.get('Range');
      const head = await env.VIDEOS.head(key);
      if (!head) return json({ error: 'not_found' }, 404, request, env);

      if (request.method === 'HEAD') {
        const h = new Headers(corsHeaders(request, env));
        head.writeHttpMetadata(h);
        h.set('Content-Length', String(head.size));
        h.set('Accept-Ranges', 'bytes');
        h.set('ETag', head.httpEtag);
        return new Response(null, { status: 200, headers: h });
      }

      const range = parseRange(rangeHeader, head.size);
      const obj = await env.VIDEOS.get(key, {
        range,
        onlyIf: request.headers.get('If-None-Match')
          ? { etagDoesNotMatch: request.headers.get('If-None-Match') }
          : undefined,
      });

      if (!obj) return json({ error: 'not_found' }, 404, request, env);
      if (!('body' in obj) || obj.body === null) {
        // onlyIf matched -> 304
        const h = new Headers(corsHeaders(request, env));
        h.set('ETag', head.httpEtag);
        return new Response(null, { status: 304, headers: h });
      }

      const headers = new Headers(corsHeaders(request, env));
      obj.writeHttpMetadata(headers);
      headers.set('ETag', obj.httpEtag);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (!headers.get('Content-Type')) headers.set('Content-Type', 'application/octet-stream');

      if (obj.range && range) {
        const start = 'offset' in obj.range && obj.range.offset != null
          ? obj.range.offset
          : head.size - (obj.range.suffix || 0);
        const length = obj.range.length != null ? obj.range.length : head.size - start;
        const end = start + length - 1;
        headers.set('Content-Range', `bytes ${start}-${end}/${head.size}`);
        headers.set('Content-Length', String(length));
        return new Response(obj.body, { status: 206, headers });
      }

      headers.set('Content-Length', String(head.size));
      return new Response(obj.body, { status: 200, headers });
    }

    // ── EVERYTHING BELOW REQUIRES AUTH ──────────────────────
    if (!authed(request, env)) return json({ error: 'unauthorized' }, 401, request, env);

    // POST /upload/init
    if (path === '/upload/init' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const id = crypto.randomUUID();
      const ext = (body.ext || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'webm';
      const folder = body.kind === 'screenshot' ? 'shots' : 'videos';
      const key = `${folder}/${id}/master.${ext}`;
      const mpu = await env.VIDEOS.createMultipartUpload(key, {
        httpMetadata: { contentType: body.mime || 'video/webm' },
      });
      return json({ key, uploadId: mpu.uploadId, url: publicUrl(request, key) }, 200, request, env);
    }

    // PUT /upload/part?key=&uploadId=&part=
    if (path === '/upload/part' && request.method === 'PUT') {
      const key = url.searchParams.get('key');
      const uploadId = url.searchParams.get('uploadId');
      const part = parseInt(url.searchParams.get('part') || '0', 10);
      if (!safeKey(key) || !uploadId || !part) {
        return json({ error: 'bad_params' }, 400, request, env);
      }
      const mpu = env.VIDEOS.resumeMultipartUpload(key, uploadId);
      const uploaded = await mpu.uploadPart(part, request.body);
      return json({ part: uploaded.partNumber, etag: uploaded.etag }, 200, request, env);
    }

    // POST /upload/complete
    if (path === '/upload/complete' && request.method === 'POST') {
      const { key, uploadId, parts } = await request.json().catch(() => ({}));
      if (!safeKey(key) || !uploadId || !Array.isArray(parts) || !parts.length) {
        return json({ error: 'bad_params' }, 400, request, env);
      }
      const mpu = env.VIDEOS.resumeMultipartUpload(key, uploadId);
      const obj = await mpu.complete(
        parts
          .slice()
          .sort((a, b) => a.part - b.part)
          .map(p => ({ partNumber: p.part, etag: p.etag }))
      );
      return json(
        { ok: true, key, size: obj.size, etag: obj.httpEtag, url: publicUrl(request, key) },
        200, request, env
      );
    }

    // POST /upload/abort
    if (path === '/upload/abort' && request.method === 'POST') {
      const { key, uploadId } = await request.json().catch(() => ({}));
      if (!safeKey(key) || !uploadId) return json({ error: 'bad_params' }, 400, request, env);
      try {
        await env.VIDEOS.resumeMultipartUpload(key, uploadId).abort();
      } catch (_) { /* already gone */ }
      return json({ ok: true }, 200, request, env);
    }

    // PUT /upload/simple?key=&mime=   (single-shot: screenshots, thumbnails, posters)
    if (path === '/upload/simple' && request.method === 'PUT') {
      let key = url.searchParams.get('key');
      const mime = url.searchParams.get('mime') || 'application/octet-stream';
      if (!key) {
        const id = crypto.randomUUID();
        const ext = (url.searchParams.get('ext') || 'png').replace(/[^a-z0-9]/gi, '');
        key = `shots/${id}/image.${ext}`;
      }
      if (!safeKey(key)) return json({ error: 'bad_key' }, 400, request, env);
      const obj = await env.VIDEOS.put(key, request.body, { httpMetadata: { contentType: mime } });
      return json(
        { ok: true, key, size: obj.size, url: publicUrl(request, key) },
        200, request, env
      );
    }

    return json({ error: 'not_found', path }, 404, request, env);
  },
};
