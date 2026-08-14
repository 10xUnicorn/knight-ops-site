# Knight Ops Video System — deploy & setup

Everything is built. These are the only steps that need your hands, because they
involve secrets and an interactive Cloudflare login.

**Your recorder token (generated for this system — treat it like a password):**

```
tpXIZA-ewunV97z85AFFTOT_tyjFjuQGXDIr_ruAL-2uJy3y
```

The same value goes in three places: the Cloudflare Worker, Supabase, and the
Chrome extension options.

---

## 1. Deploy the storage worker (Terminal on your Mac)

```bash
cd ~/knight-ops-site/ko-video-worker

# One-time: authorise wrangler (opens your browser)
npx wrangler login

# Deploy — creates the worker and binds the knight-ops-videos R2 bucket
npx wrangler deploy

# Set the upload secret (paste the token above when prompted)
npx wrangler secret put UPLOAD_SECRET
```

`wrangler deploy` prints the live URL, something like:

```
https://ko-video.<your-subdomain>.workers.dev
```

**Copy that URL — you need it in step 2.**

Verify it:

```bash
curl https://ko-video.<your-subdomain>.workers.dev/health
# {"ok":true,"service":"ko-video"}
```

### Optional: custom domain
If knightops.biz is on Cloudflare DNS, add a Worker custom domain
(`video.knightops.biz`) in the Cloudflare dashboard under Workers → ko-video →
Settings → Domains & Routes. Then use that URL everywhere instead of the
workers.dev one. Cleaner links, and it survives a subdomain change.

---

## 2. Set the Supabase secrets

Dashboard → Project Settings → Edge Functions → Secrets, or via CLI:

```bash
supabase secrets set \
  KO_VIDEO_SECRET='tpXIZA-ewunV97z85AFFTOT_tyjFjuQGXDIr_ruAL-2uJy3y' \
  KO_VIDEO_WORKER='https://ko-video.<your-subdomain>.workers.dev' \
  DEEPGRAM_API_KEY='<your deepgram key>' \
  --project-ref trpnlkntvulkjerevngm
```

| Secret | What it does | Required |
|---|---|---|
| `KO_VIDEO_SECRET` | Authorises the Chrome extension to create and upload videos | Yes |
| `KO_VIDEO_WORKER` | Where the edge functions look for media (no trailing slash) | Yes |
| `DEEPGRAM_API_KEY` | Transcription. Get one at deepgram.com — $200 free credit, then ~$0.0043/min | Yes, for transcripts |
| `ANTHROPIC_API_KEY` | AI title, summary, chapters, action items | Already set |

Without `DEEPGRAM_API_KEY` everything still records and shares — videos just
land with `transcript_status = failed` and no summary.

---

## 3. Install the Chrome extension

1. `chrome://extensions` → toggle **Developer mode** on (top right)
2. **Load unpacked** → select `~/knight-ops-site/chrome-extension`
3. Click the extension → **Settings** (bottom right of the popup)
4. Paste the recorder token, leave the worker URL blank, hit **Save & test connection**

It should say *"Connected. Dashboard and storage worker both responding."*

Pin the extension to your toolbar.

---

## 4. Verify end to end

1. Open any page, press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>
2. Pick a screen, talk for ~20 seconds, hit **Stop**
3. The share link lands on your clipboard and the video opens in a new tab
4. Within about a minute, refresh — transcript, summary, and chapters appear
5. Confirm it shows in `knightops.biz/admin` → Content → **Videos**

---

## What got built

| Piece | Where |
|---|---|
| Chrome extension (MV3) | `chrome-extension/` |
| Storage worker (R2 + range streaming) | `ko-video-worker/` |
| Watch page | `watch.html` → `/v/:slug` |
| Embed player | `embed.html` → `/embed/:slug` |
| Standalone library | `videos.html` → `/videos` |
| Admin library | `admin.html` → Content → Videos |
| OG link previews | `api/v.js` → `video-serve` edge fn |
| Public API | `video-api` edge fn |
| Authed CRUD | `video-manage` edge fn |
| Transcription + AI | `video-transcribe` edge fn |
| Tables | `videos`, `video_transcripts`, `video_comments`, `video_reactions`, `video_views` |
| Bucket | Cloudflare R2 `knight-ops-videos` |

## Running cost

R2 storage is $0.015/GB/month with **zero egress fees** — the reason this beats
storing video in Supabase. A heavy month of ~100 recordings lands around
$0.75–2.00. Deepgram runs about $0.26 per hour of video. Loom Business is $17
per seat per month.

## Rotating the token

If the token ever leaks: run `npx wrangler secret put UPLOAD_SECRET` with a new
value, update `KO_VIDEO_SECRET` in Supabase to match, and re-paste it in the
extension options. Existing videos are unaffected — the token only gates uploads.
