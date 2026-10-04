# PPTX publication with pptxtoimages

The native converter uses [brkcvlk/pptxtoimages](https://github.com/brkcvlk/pptxtoimages), pinned to 0.1.14. It renders the original PowerPoint through LibreOffice and pdf2image/Poppler, then creates whole-slide WebP images (longest edge 1920) and separate WebP thumbnails (longest edge 320). No slide text is reconstructed as HTML. The existing student viewer and admin preview use these saved images. The verified Basic 1 lv 0 images and all vocabulary/UI data remain unchanged.

## Production activation

**The code is integrated; the native service is not deployed.** The current Site is a Cloudflare Worker with D1/R2. It cannot run Python, LibreOffice or Poppler. Deploy this Docker image on a persistent Linux container host behind HTTPS. Then configure server-side environment values:

- Container: `SLIDE_CONVERTER_TOKEN`.
- Site backend: the same secret `SLIDE_CONVERTER_TOKEN` and `SLIDE_CONVERTER_URL=https://<converter-host>/convert`.

Do not use a VITE prefix or send the secret to a browser. Until these values are configured, preparation returns a clear 503 and retains the uploaded PPTX/draft. A Dockerfile or a successful local test does not activate the production service.

### Render Free deployment

The repository's `render.yaml` defines only one Free Docker web service in Singapore, with no database, disk or paid worker. Its root/build context is `services/slide-converter`; unrelated frontend code and material assets are not part of the Docker image. `GET /health` is an unauthenticated readiness endpoint that exposes no configuration. `POST /convert` still requires the server-only bearer token. The server binds to `0.0.0.0:$PORT` (8080 locally; 10000 in the Blueprint).

After the service becomes Live, configure its actual `/convert` HTTPS URL and the same runtime token in the BD10 backend, then redeploy BD10. Do not configure a guessed URL or mark conversion active before a real request succeeds. The Blueprint generates a token on first creation; it can instead be replaced securely in Render's Environment settings to match the BD10 secret.

Free services sleep after inactivity and may take about a minute to wake. This native converter has a 110-second conversion deadline; large presentations may exceed it or the Free instance's memory. Test the real 23-slide and 63-slide materials on the deployed service before declaring production conversion verified. Upgrading to a paid plan requires separate authorization. No periodic keep-alive requests are configured.

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

Use an HTTPS reverse proxy with a request timeout above 120 seconds and rate limits. Block outbound network access from the native container, including private/metadata addresses. Install licensed source fonts when available: Noto CJK is included, but proprietary font substitution can change typography. Admin visual review remains required; pixel-identical PowerPoint output is not guaranteed by LibreOffice. The Docker image itself has not been built here.

## Adapter and service contract

`server.py` subclasses the real `PPTXToImageConverter` and calls its `convert()`. The two hooks preserve the upstream LibreOffice → pdf2image pipeline while adding:

- macro-free PPTX validation and macro security;
- an isolated LibreOffice profile and temporary directory per conversion;
- an overall 110-second conversion deadline;
- one-page-at-a-time rasterization instead of retaining every PIL page;
- actual slide-count matching, bounded output and temporary cleanup;
- one concurrent conversion; overload returns 429.

Authenticated `POST /convert` accepts binary PPTX. With `Accept: application/vnd.bd10.slide-images+zip`, it returns a STORE-only ZIP:

```text
manifest.json                 # version, renderer, source SHA-256, ordered slides
lesson.pdf
slides/0001.webp
thumbnails/0001.webp
...
```

With `Accept: application/pdf` it preserves the previous PDF endpoint. An older deployed converter returning PDF remains compatible: the existing PDF.js path rasterizes that whole-page PDF. The browser HTML/WASM PPTX fallback stays retired.

The Worker limits source and generated bundle sizes to 32 MB and slide count to 300. It rejects compressed ZIPs, traversal, duplicate names, invalid CRCs, wrong source hashes/counts/order, incorrect WebP headers/dimensions or aspect ratios. It stores only validated images/PDFs in project R2; source uploads are unchanged. The service can accept 200 MB, but the Worker bridge still enforces its smaller memory-safe limit. Oversized/slow documents remain drafts with their source safe.

## Prepare → review → publish

1. The admin uploads the original PPTX using the existing editor.
2. `visuals/start` reads real slide count/dimensions and requests the native bundle.
3. The Worker validates and stores the PDF, full images and thumbnails under the current job ID. A complete preview is returned with `approved: false`.
4. The existing editor previews the exact persistent images; no browser rendering or second image upload is necessary for the native bundle.
5. **Approve Slide Preview** and **Publish Lesson** remain explicit admin actions.
6. Only published slide/thumbnail references are accessible to students.

No progress timer simulates conversion. The existing preparation UI shows a processing state during the native request and completion after validated storage. On failure, partial files are never student references; the old published slides remain available. Refresh/retry can reuse a completed preview or saved PDF. Text extraction and Local WebGPU analysis are independent of this pipeline.

## Verification

```sh
node --test tests/pptxtoimages-publication.test.mjs tests/slide-visuals.test.mjs \
  tests/lesson-visual-preparation.test.mjs tests/original-pptx-publication.test.mjs \
  tests/lesson-webp-assets.test.mjs tests/verified-visual-migration.test.mjs
npm run build
```

Contract tests verify validation, source preservation, no browser re-rendering, draft privacy, explicit approval/publication and unchanged legacy PDF support. Real native tests on the published 63-slide B1L1 source produced 63 images at 1920×1080 in 36.3 seconds (11.2 MB bundle). Basic 1 lv 0 produced 23 images in 15.5 seconds (4.2 MB bundle). Both source hashes were unchanged. Samples 3, 12 and 63 were visually inspected. These are local tests, not deployment evidence. The reported private 76-slide B1L2 draft has not been reprocessed or verified.
