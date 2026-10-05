# PPTX publication with pptxtoimages

The native converter uses [brkcvlk/pptxtoimages](https://github.com/brkcvlk/pptxtoimages), pinned to 0.1.14. It renders the original PowerPoint through LibreOffice and pdf2image/Poppler, then creates whole-slide WebP images (longest edge 1920) and separate WebP thumbnails (longest edge 320). No slide text is reconstructed as HTML. The existing student viewer and admin preview use these saved images. The verified Basic 1 lv 0 images and all vocabulary/UI data remain unchanged.

## Production activation

The native service is deployed on Render Free at `https://bd10-slide-converter.onrender.com`. The BD10 Site remains a Cloudflare Worker with D1/R2; Python, LibreOffice and Poppler run only in the separate converter container. Required server-side environment values:

- Container: `SLIDE_CONVERTER_TOKEN`.
- Site backend: the same secret `SLIDE_CONVERTER_TOKEN`, `SLIDE_CONVERTER_URL=https://bd10-slide-converter.onrender.com/convert`, and `SLIDE_CONVERTER_ASYNC=true`.

Do not use a VITE prefix or send the secret to a browser. These values are configured in the production server environments; they are not stored in this repository. Missing configuration returns a clear 503 and retains the uploaded PPTX/draft.

### Render Free deployment

The live service is one Free Docker web service in Singapore, with no database, disk or paid worker. The root Dockerfile is a compatibility entry point; it copies only `services/slide-converter`, excluding frontend code and material assets. `render.yaml` also supports deploying directly from that subdirectory. `GET /health` is an unauthenticated readiness endpoint that exposes no configuration. All conversion/job routes require the server-only bearer token. The server binds to `0.0.0.0:$PORT` (8080 locally; 10000 on Render).

Auto-deploy is disabled on the live service. After changing converter code, trigger a Render deploy and wait for Live; frontend/Worker changes are published separately through Sites. Keep the Render token and BD10 server secret identical.

Free services sleep after inactivity and may take about a minute to wake. BD10 uses asynchronous conversion jobs and polls actual slide progress, avoiding a single long request timing out on larger presentations. Native job deadlines scale with slide count, capped at 30 minutes. Only one conversion runs at a time. No periodic keep-alive requests or paid resources are configured.

On the separate host, after securely setting the token in its environment:

```sh
docker build -t bd10-slide-converter services/slide-converter
docker run --name bd10-slide-converter --restart unless-stopped \
  --read-only --memory 1g --cpus 1 --pids-limit 128 \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,size=512m,mode=1777 \
  -p 127.0.0.1:8080:8080 -e SLIDE_CONVERTER_TOKEN \
  bd10-slide-converter
```

Render built the Docker image successfully and provides HTTPS. For another host, use an HTTPS reverse proxy and rate limits. Install licensed source fonts when available: Noto CJK is included, but proprietary font substitution can change typography. Admin visual review remains required; pixel-identical PowerPoint output is not guaranteed by LibreOffice.

## Adapter and service contract

`server.py` subclasses the real `PPTXToImageConverter` and calls its `convert()`. The two hooks preserve the upstream LibreOffice → pdf2image pipeline while adding:

- macro-free PPTX validation and macro security;
- an isolated LibreOffice profile and temporary directory per conversion;
- a slide-count-based deadline for asynchronous jobs (the legacy synchronous endpoint remains limited to 110 seconds);
- disk-based rasterization in batches of eight pages, encoding only one PIL image at a time;
- actual slide-count matching, bounded output and temporary cleanup;
- one concurrent conversion; overload returns 429.

Authenticated `POST /jobs` accepts binary PPTX and returns a job ID with real source hash/count. `GET /jobs/{id}` reports conversion and rendered-slide progress; `GET /jobs/{id}/result` returns the completed STORE-only ZIP. The older authenticated `POST /convert` endpoint also remains supported:

```text
manifest.json                 # version, renderer, source SHA-256, ordered slides
lesson.pdf
slides/0001.webp
thumbnails/0001.webp
...
```

With `Accept: application/pdf` it preserves the previous PDF endpoint. An older deployed converter returning PDF remains compatible: the existing PDF.js path rasterizes that whole-page PDF. The browser HTML/WASM PPTX fallback stays retired.

The Worker and asynchronous job endpoint limit source and generated bundle sizes to 32 MB and slide count to 300. They reject traversal, duplicates, invalid CRCs, wrong source hashes/counts/order, incorrect WebP headers/dimensions or aspect ratios. Only validated images/PDFs are stored persistently in project R2; source uploads are unchanged. Native jobs/results are held temporarily in memory, expire after an hour, and do not survive a container restart. A restart requires preparing the retained original again. Oversized/slow documents remain drafts with their source safe.

## Prepare → review → publish

1. The admin uploads the original PPTX using the existing editor.
2. `visuals/start` reads real slide count/dimensions and starts an authenticated native job; the job ID is saved with the lesson draft.
3. The existing UI polls `visuals/status` every 2.5 seconds for actual conversion progress. When ready, the Worker validates and stores the PDF, full images and thumbnails under the current job ID, returning a preview with `approved: false`.
4. The existing editor previews the exact persistent images; no browser rendering or second image upload is necessary for the native bundle.
5. **Approve Slide Preview** and **Publish Lesson** remain explicit admin actions.
6. Only published slide/thumbnail references are accessible to students.

No timer simulates conversion progress. On failure, partial files are never student references; the old published slides remain available. Refresh/retry resumes a running native job or reuses a completed preview/saved PDF. Text extraction and Local WebGPU analysis are independent of this pipeline.

## Verification

```sh
node --test tests/pptxtoimages-publication.test.mjs tests/slide-visuals.test.mjs \
  tests/lesson-visual-preparation.test.mjs tests/original-pptx-publication.test.mjs \
  tests/lesson-webp-assets.test.mjs tests/verified-visual-migration.test.mjs
npm run build
```

The 31 contract tests verify validation, source preservation, no browser re-rendering, draft privacy, explicit approval/publication, asynchronous progress/resume, source-hash rejection and unchanged legacy PDF support. The deployed Render service has converted the real Basic 1 lv 0 PPTX into 23 slide images and 23 thumbnails, with its source hash unchanged. The separate 63-slide material is also tested against the deployed service. Native conversion tests and contract tests are distinct from an authenticated admin browser publishing test. The private 76-slide B1L2 draft has not been reprocessed or verified.
