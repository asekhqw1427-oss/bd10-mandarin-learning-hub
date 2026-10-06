# BD10 Mandarin Learning Hub

A complete guide to running, simulating, and editing BD10. Built with React, Vite, Tailwind CSS, Lucide, Cloudflare Worker + D1/R2, and Supabase for authentication and learning progress. Learning content uses **Traditional Chinese + Pinyin + English**.

**Web demo:** https://bd10-engineer-learning-demo-qw1427.qw1427.chatgpt.site

## Table of contents

1. [Source and live website status](#1-source-and-live-website-status)
2. [Prerequisites](#2-prerequisites)
3. [Clone and install](#3-clone-and-install)
4. [Local frontend and backend configuration](#4-local-frontend-and-backend-configuration)
5. [Run the website](#5-run-the-website)
6. [Supabase and test accounts](#6-supabase-and-test-accounts)
7. [Student and admin walkthroughs](#7-student-and-admin-walkthroughs)
8. [PowerPoint converter](#8-powerpoint-converter)
9. [Edit the code](#9-edit-the-code)
10. [Build and publish](#10-build-and-publish)
11. [Troubleshooting](#11-troubleshooting)
12. [Contributing and data protection](#12-contributing-and-data-protection)

## 1. Source and live website status

**Read this before cloning.** This repository is not yet an identical copy of the entire live website source.

| Component | Documented status as of October 6, 2026 |
| --- | --- |
| GitHub frontend and Worker | Site version 72 snapshot, source `dd4930047c29ead1bfb349bf4d20fa174d9c394f`; includes routing, admin session restoration, admin language selection, and Student Record |
| GitHub converter | Updated in commit `8e2d6f9b958b69abf2c16f7ba9d2b1137c119b05`; the async endpoint accepts PPTX files up to 200 MiB |
| Live ChatGPT website | Newer source, including multipart uploads and the saved images → Preview → Approve → Publish workflow |
| Database, accounts, secrets, uploaded materials | Not included when cloning; must be configured separately |

Running this repository **does not automatically include every recent change on the live website**. In particular, the frontend/Worker snapshot still uses the older browser converter (`src/utils/pptxSlideConverter.js`). Running the Python service alone does not connect the older frontend to that service. Support for 200 MB multipart uploads and the latest preview/approval workflow requires the latest frontend/Worker source; do not assume these features are available simply because the updated `server.py` is in the repository.

This guide distinguishes instructions for the **current GitHub checkout** from the workflow on the **live website**. Adding this documentation does not change the application or its datasets.

### System components

| Component | Responsibility |
| --- | --- |
| `src/` | React interface, routing, Word List, lesson viewer, admin dashboard |
| `worker/index.js` | `/api/*` API, admin verification, material storage |
| Cloudflare D1 (`DB`) | Lesson metadata: status, payload, update timestamps |
| Cloudflare R2 (`BUCKET`) | Source files, slide images, thumbnails |
| Supabase | Login, identity/roles, progress and learning time; legacy lesson source |
| `services/slide-converter/` | Python service: PPTX → LibreOffice PDF → slide images/thumbnails |

The frontend and Worker API run together through Vite + the Cloudflare plugin. Do not create an additional Express server to run this snapshot. Local D1 and R2 do not contain production materials.

## 2. Prerequisites

Install:

- **Git** for cloning and branches.
- **Node.js 22.12 or newer**; Node.js 24 also works. npm is included with Node.
- **Visual Studio Code** or another editor.
- A modern browser, such as Chrome or Edge.
- Internet access for dependency installation and Supabase login. “Local” does not mean authentication works offline.
- **Docker** only if you want to run the Python converter locally.

Check in your terminal:

```sh
git --version
node --version
npm --version
```

Use a terminal in the project folder. On Windows, PowerShell is supported. If the Cloudflare runtime is not supported in your Windows environment, use WSL2/Linux and run all project commands in that same environment.

## 3. Clone and install

```sh
git clone https://github.com/asekhqw1427-oss/bd10-mandarin-learning-hub.git
cd bd10-mandarin-learning-hub
npm ci
```

`npm ci` uses the versions in `package-lock.json`. Do not immediately upgrade dependencies just to run the demo.

Open the folder in VS Code:

```sh
code .
```

Alternatively: VS Code → **File → Open Folder** → select `bd10-mandarin-learning-hub`.

## 4. Local frontend and backend configuration

Use **your own test Supabase project**, rather than the project owner's production secrets or database.

### 4.1 Frontend: `.env.local`

macOS/Linux/Git Bash:

```sh
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill `.env.local` with values from your test Supabase project:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_ADMIN_EMAIL=admin@your-domain.example
VITE_LEARNER_EMAIL_DOMAIN=bd10.local
```

`VITE_*` variables are exposed to the browser. `VITE_SUPABASE_ANON_KEY` is the public/anon key used by the current client, **not** a `service_role` key. Public keys still require correct RLS policies.

### 4.2 Worker: `.dev.vars`

Create `.dev.vars` in the project root. This configures the local server:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
ADMIN_EMAIL=admin@your-domain.example
```

The snapshot Worker reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `ADMIN_EMAIL`, or corresponding `VITE_*` alternatives. This example keeps server and browser configuration clearly separate. The URL/key must point to the same Supabase project as the frontend.

**Do not** add converter tokens, service-role keys, OpenAI keys, passwords, or access tokens as `VITE_*` variables. Do not commit `.env.local`, `.dev.vars`, or credential files.

Check ignored files before committing:

```sh
git check-ignore .env.local .dev.vars
git status --short
```

If a secret file is not ignored, add its name to `.gitignore` before continuing. After changing environment variables, stop and restart the development server.

### 4.3 Local D1 database

Create the lesson metadata tables in the **local database**:

```sh
npx wrangler d1 migrations apply bd10-learning-hub --local
```

Confirm the migration if prompted. The configuration uses binding `DB`, database `bd10-learning-hub`, and migration `drizzle/0000_common_luckman.sql`.

Verify:

```sh
npx wrangler d1 execute bd10-learning-hub --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

The `lesson_materials` table should appear. `--local` matters: this command is not intended to migrate the production database.

Local R2 is created by the development runtime through binding `BUCKET`. Local files and databases are stored in Wrangler state, usually `.wrangler/state`. Do not delete this state if you still need your test materials. The checkout's placeholder `database_id` is not a production database ID and does not need replacing just for local simulation.

## 5. Run the website

From the project root:

```sh
npm run dev
```

Open the **Local** address printed in the terminal, usually:

```text
http://localhost:5173
```

If another application uses port 5173, Vite may choose another port. Use the actual address printed in your terminal. Keep the terminal running. Stop the server with `Ctrl+C`.

### Initial checks

- The login page appears.
- The browser console has no import errors.
- Visiting `/api/materials` on the same local origin returns JSON, not HTML.
- A new local database may return an empty lesson list; this does not mean production materials have disappeared.
- Without Supabase configuration, the login page can appear, but **student/admin login is unavailable**. Cloning does not automatically create a universal `123` password.

### Build and preview

```sh
npm run build
npm run preview
```

Use the preview URL printed in the terminal. `dist/client` contains the frontend and `dist/server` contains the Worker build. `scripts/prepare-spa-shell.mjs` prepares route fallback using the same built assets.

Preview is for checking the local build. A successful build does not prove that login, R2, Supabase, conversion, or publishing works end to end. Do not open `index.html` through `file://`; the API, routing, and authentication require an HTTP server.

## 6. Supabase and test accounts

### 6.1 Prepare your own Supabase project

1. Create/select a test Supabase project.
2. Obtain the Project URL and public/anon key, then complete both environment files above.
3. Open SQL Editor in your test project.
4. Read the scripts and replace the `admin@example.com` fallback with the same test admin email if you use the owner-email authorization path.
5. Run the scripts in this order:

| Order | File | Purpose |
| --- | --- | --- |
| 1 | `supabase/schema.sql` | Legacy lesson tables, legacy bucket, RLS |
| 2 | `supabase/role_access.sql` | Admin access rules based on email/`app_metadata` |
| 3 | `supabase/lesson_progress.sql` | Student progress and learning-time sessions |
| 4 | `supabase/admin_student_records.sql` | Admin Student Record RPC |

`schema.sql` creates a **public legacy bucket**. Do not use it for confidential documents. The latest website stores drafts/images through Worker-controlled R2, which differs from the snapshot's legacy bucket.

If your project's Data API does not automatically grant access to new tables, check grants along with RLS. Do not disable RLS to fix permission errors. Also note that `lesson_progress.lesson_id` references `public.lesson_materials` in Supabase: lessons that exist only in D1 without matching Supabase rows can fail to save cloud progress in this snapshot. Investigate this as an integration issue; do not arbitrarily remove the foreign key.

### 6.2 Create student accounts

In Supabase **Authentication → Users**, create a test user with an email and password you choose, and ensure the email is confirmed.

Example ID mapping — these are **not automatically available accounts**:

| Login input | Email looked up by the application |
| --- | --- |
| `DEMO01` | `employee-demo01@bd10.local` |
| `123` | `employee-123@bd10.local` |
| `dimas@example.com` | `dimas@example.com` directly |

The application uses `learnerEmailForLogin()` in `src/utils/supabaseClient.js`. You can use a full email address to avoid ID-mapping mistakes. `bd10.local` addresses are not real email inboxes; provision confirmed test accounts through a trusted admin flow. For normal email confirmation, use an address that can receive email.

The display name comes from `user_metadata.display_name` or `full_name`; `user_metadata` is **not** an admin authorization source.

### 6.3 Log in as an admin

**Owner admin:**

1. Create a Supabase user whose email exactly matches `VITE_ADMIN_EMAIL` and `ADMIN_EMAIL`.
2. Use that account's password.
3. On the BD10 login page, enter ID `ADMIN` and the owner admin password.
4. After successful login, the application opens `/admin`.

**Additional admins:** users can log in with their full email or an ID mapped as above, but must have `app_metadata.role = "admin"` set through a trusted backend/Supabase Admin API. Changing React, sessionStorage, or `user_metadata.role` does not grant admin API access.

Do not put service-role keys or provisioning scripts containing secrets in the frontend. The existing five-student/two-admin provisioning function is at `supabase/functions/provision-demo-accounts/index.ts`. It must be deployed and called by an already authenticated admin; it does not run automatically after cloning. Passwords are generated during provisioning, not written in this README. By default, calling it again does not reissue existing account passwords; `rotateExisting` changes passwords and is not a routine test step.

### 6.4 Email links and redirects

Use **password login** first for simulation. Supabase Authentication → URL Configuration must allow the callback origin you use, including the actual localhost port and any required production URLs.

The current source has a limitation: `adminAuthRedirectUrl` in `src/utils/supabaseClient.js` hard-codes `/admin` on the ChatGPT domain. Adding localhost in Supabase alone does not change the redirect sent by the application. If you develop your own copy and need a local magic link, change that redirect reference on your test branch to the appropriate local URL and allowlist it in Supabase. Do not change production redirects without review. Access links contain tokens — do not paste them into Issues or this README.

## 7. Student and admin walkthroughs

Use test accounts and a test project. Do not delete/replace production lessons to test features.

### Student

1. Log in with a test account.
2. Open Home, then Lessons.
3. Select a published lesson.
4. Check slide images, thumbnails, Previous/Next, fullscreen, and the timer.
5. Exit and reopen the lesson to check progress restoration.
6. Compare learning time and status on Home/Lessons.
7. Check Vocabulary: Hanzi/Pinyin/English search, CEFR levels, word selection, and the internal scrollbar.

Local lessons do not automatically match live website lessons. An empty list may mean local D1 has no materials yet, rather than a filter problem.

### Admin in the current GitHub checkout

1. Log in as an admin → `/admin`.
2. Create a test lesson with a clear title/description.
3. For a lightweight simulation that preserves formatting, use **real slide images exported from PowerPoint**, if the editor provides an image input.
4. Save the draft, review the material, then publish using the snapshot editor's functionality.
5. Open an incognito window/another browser as a student on the **same local origin**.
6. Confirm that published lessons appear and drafts do not.
7. Test editing the title/description without uploading again, then check from the student account.

The snapshot's older browser PPTX converter can produce formatting that differs from PowerPoint. Do not assume its output matches the latest LibreOffice service.

### Admin on the latest live website

The intended workflow used by the live source is:

**Upload PowerPoint → saved slide images → Preview → Approve → Publish**.

- Images and thumbnails are saved first.
- Preview must use the saved images.
- The admin reviews the output and explicitly approves the preview.
- Publishing happens after approval; uploading or converting must not automatically publish lessons.
- If conversion fails, the original file and draft must remain available.
- AI/WebGPU is not required for conversion or publishing.

The latest frontend/Worker source must be synchronized into the checkout before testing this flow from a clone. Documentation does not activate features missing from the snapshot code.

## 8. PowerPoint converter

### 8.1 Run the local service with Docker

From the repository root:

```sh
docker build -t bd10-slide-converter services/slide-converter
```

Create a local `.converter.env` file and ensure it is in `.gitignore`:

```dotenv
SLIDE_CONVERTER_TOKEN=YOUR_RANDOM_SERVER_ONLY_TOKEN
```

Use a random secret for your test environment, not a production token. Run:

```sh
docker run --rm --name bd10-slide-converter --env-file .converter.env -p 127.0.0.1:8080:8080 bd10-slide-converter
```

Open `http://127.0.0.1:8080/health`. A healthy response is:

```json
{"status":"ok","service":"bd10-slide-converter"}
```

Docker runs LibreOffice, Poppler, Python, and `pptxtoimages@0.1.14`; PowerPoint does not need to be installed in the browser. Keep Docker running during conversion.

### 8.2 Service contract

All endpoints except `/health` require a **server-only** bearer token.

| Endpoint | Purpose |
| --- | --- |
| `POST /jobs` | Upload PPTX binary; returns a job ID and original slide count/hash |
| `GET /jobs/{id}` | Check status and rendered slide count |
| `GET /jobs/{id}/result` | Retrieve a ZIP containing PDF, images, thumbnails, and manifest |
| `POST /convert` | Legacy synchronous endpoint; use async `/jobs` for large files |

The `/jobs` endpoint accepts **200 MiB** maximum, up to 300 slides, and macro-free PPTX files. Source files are streamed to disk. **The result package is still limited to 32 MiB**; documents with many images/heavy slides can exceed the output limit even when the input is below 200 MB. Slide order and count are verified. Unavailable fonts may be substituted, so admins must still review the visual output.

Native jobs are temporary: service restarts or expiration can remove jobs/results that have not been saved. Originals already saved in R2 are the source for retries.

### 8.3 Connect live source that already has the native pipeline

**This section applies only if your checkout contains the latest `worker/services/slideConversion.js` and `worker/services/lessonVisuals.js`. Neither is available in the GitHub frontend/Worker snapshot documented above.**

Configure `.dev.vars`/the server runtime:

```dotenv
SLIDE_CONVERTER_URL=http://127.0.0.1:8080/convert
SLIDE_CONVERTER_TOKEN=THE_SAME_LOCAL_TOKEN_AS_THE_CONTAINER
SLIDE_CONVERTER_ASYNC=true
SLIDE_CONVERTER_LARGE_UPLOADS=true
```

For production hosting, use your converter service's HTTPS URL. Set the same token on the Worker and converter. Do not add `VITE_SLIDE_CONVERTER_TOKEN`. Uploads above 32 MB also require the latest multipart upload code; a flag alone does not add that feature to an older snapshot.

ChatGPT hosting runs the application/Worker, while LibreOffice runs in a separate converter service. GitHub commits do not automatically update the ChatGPT website. Auto-deploy is disabled on the Render service currently used; converter changes require a separate Render deployment and confirmation of Live status.

Details: [`services/slide-converter/server.py`](services/slide-converter/server.py), [`Dockerfile`](Dockerfile), [`render.yaml`](render.yaml). The older converter README may still mention a 32 MB input limit; the latest input contract is in `server.py` at the commit listed in section 1.

## 9. Edit the code

### 9.1 Create a branch first

```sh
git switch -c docs-or-fix/my-change
```

If you do not own the repository, fork it first and clone your fork. Avoid experimenting directly on `main`.

### 9.2 Choose files for the area you want to change

| Area | Main files |
| --- | --- |
| Login, sessions, dashboard selection | `src/main.jsx` |
| Login configuration and functions | `src/utils/supabaseClient.js` |
| Sidebar/header/dashboard composition | `src/Dashboard.jsx`, `src/dashboard.css` |
| Home | `src/HomePage.jsx`, `src/home.css` |
| Lessons list | `src/LessonsPage.jsx`, `src/lessons.css` |
| Lesson viewer, slides/timer | `src/LessonViewer.jsx`, `src/lesson-viewer.css` |
| Admin | `src/AdminDashboard.jsx`, `src/admin.css`, `src/adminTranslations.js` |
| Student Record | `src/AdminStudentRecords.jsx`, `supabase/admin_student_records.sql` |
| Material storage/loading | `src/utils/adminLessonStore.js`, `worker/index.js` |
| Routing | `src/utils/appRouting.js` |
| Progress and learning time | `src/utils/lessonProgress.js`, `src/utils/learningTime.js` |
| Vocabulary and virtual scrolling | `src/VocabularyPage.jsx`, `src/vocabulary.css`, `src/vocabulary-ref.css` |
| TOCFL datasets by level | `src/data/tocfl/`, central export `src/data/tocfl/index.js` |
| A0 strokes | `src/A0StrokePanel.jsx`, `src/utils/hanziStrokeParser.js`, `src/data/a0Stroke.js` |
| Branding/images | `public/` and component asset references |
| API and material files | `worker/index.js`, `DB`/`BUCKET` bindings |
| D1 schema | `db/schema.ts`, `drizzle/` |
| Converter server | `services/slide-converter/server.py` |

Check file names in your checkout before editing; newer live source may add components. Search text in VS Code using **Ctrl+Shift+F** / **Cmd+Shift+F**.

### 9.3 Simple change examples

1. Want to change the Lessons heading? Find the text in `src/LessonsPage.jsx`.
2. Want to adjust Lessons card padding? Find the card class in `src/lessons.css`.
3. Save the file; Vite normally updates the browser automatically.
4. Check desktop and smaller screens using DevTools.
5. Check the console and build before committing.

To change **lesson materials, titles, descriptions, and learning time**, use the admin editor when those fields are available. Do not change source code for every lesson upload. Source edits are for application behavior/interface changes.

### 9.4 Dataset and renderer rules

- **Finalized A0 / TOCFL 1 is read-only.** Do not change IDs, Hanzi, Pinyin, definitions, examples, metadata, or order in `src/data/tocfl/a0.js`.
- Do not run dataset generators just to edit CSS or fix the UI.
- Do not copy thousands of vocabulary entries into React components.
- Preserve virtual scrolling, memoization, the search index, and level filters.
- Strokes must use original geometry; do not reverse stroke arrays to fix SVG orientation.
- Do not change other pages for a small Lessons/Admin update.

### 9.5 Save changes to GitHub

```sh
git diff
git status --short
npm run build
git add path/to/file-you-changed
git commit -m "Describe the specific change"
git push -u origin docs-or-fix/my-change
```

Replace `path/to/file-you-changed` with the actual edited file. Open a Pull Request describing the problem, resulting change, and validation. Avoid `git add .` without checking for secrets/private material files.

## 10. Build and publish

### GitHub, Render, and the ChatGPT website have separate deployments

| Action | Result |
| --- | --- |
| `git push` | Saves source to GitHub |
| `npm run build` | Creates a local build; does not update the live website |
| Deploy Render | Updates the converter service, not automatically the ChatGPT frontend |
| Publish Sites in the same ChatGPT project | Updates the website on the ChatGPT domain |

To update the existing ChatGPT domain, the project owner must use the **Sites** workflow with the latest source, a correct build, and the existing project ID. This repository does not provide an `npm run deploy` command for the ChatGPT domain. Do not create a new Site or overwrite live source with an older snapshot just to publish documentation changes.

For independent Cloudflare hosting, use your own account and D1/R2 resources, configure real resource IDs, migrate the correct target database, and follow Cloudflare documentation. Running `wrangler deploy` on your computer does not publish to this project's ChatGPT domain. Do not use the owner's production IDs or secrets without authorization.

### Checklist before releasing application changes

- Build succeeds.
- Student and admin login are tested with test accounts.
- Refreshing `/lessons` and `/admin` does not return 404.
- Draft lessons are not visible to students.
- Published lessons appear, and student slide images match the admin preview.
- Learning-time limits and completion requirements are tested.
- Vocabulary search/filter/virtual scrolling are unchanged.
- A0 and any other out-of-scope levels remain intact.
- No secrets, private lessons, passwords, tokens, or student data are committed.

The GitHub snapshot does not yet provide an `npm test` script. If you use newer source with a `tests/` folder, run the available tests relevant to your changes; do not claim that live-source tests were run on the snapshot clone.

## 11. Troubleshooting

| Symptom | Check / action |
| --- | --- |
| `npm`/`node` not recognized | Install Node, open a new terminal, check versions |
| `npm ci` fails | Check Node version, network, and lockfile consistency; do not delete the lockfile as your first step |
| `no such table: lesson_materials` | Run D1 migrations with `--local`; ensure the same configuration/state is used |
| Login rejected | Verify frontend URL/key, account existence in the same Supabase project, confirmed email, and password |
| ID `123` cannot log in | Create `employee-123@bd10.local`, or use the correct full email; cloning does not create this account |
| Admin receives 401 | Session missing/expired; log in again and check that the Worker points to the same Supabase project |
| Admin receives 403 | `app_metadata` role or owner email does not match; React roles do not grant server access |
| `Admin verification is not configured` | Configure Worker `.dev.vars`; frontend `.env.local` alone is insufficient |
| Magic link returns to production | Source hard-codes `adminAuthRedirectUrl`; use password login locally or adjust the redirect on a test branch |
| Local lesson list is empty | New local D1/R2 does not contain production materials; create test materials |
| Environment changes are not visible | Restart the dev server; frontend environment variables are read during development/build |
| Route refresh returns 404 on hosting | Check SPA fallback and `prepare-spa-shell.mjs`; do not upload only `index.html` |
| Supabase permission/RLS/FK errors in console | Check SQL scripts, grants, trusted roles, and matching lesson IDs; do not disable RLS |
| Converter `/health` succeeds but uploads return 403 | Worker and converter bearer tokens must match; the token must not be in the browser |
| Converter healthy but UI still uses the old renderer | The snapshot lacks native Worker integration; environment variables alone do not replace converter imports |
| PPTX output differs from PowerPoint | Check the source pipeline and fonts; review saved images before publishing |
| A 200 MB input is accepted but conversion fails | Check the 300-slide limit, macro-free PPTX requirement, timeout/memory, and 32 MiB output package limit |
| GitHub changes do not appear live | GitHub commits, Render deployments, and Sites publishing are separate steps |

When reporting bugs, include reproduction steps, browser, HTTP status, error messages, and screenshots. **Redact tokens, personal emails, passwords, `.dev.vars` contents, and Authorization headers.** Do not send entire datasets or private documents unless needed.

## 12. Contributing and data protection

Fork → branch → focused changes → build/check → Pull Request. Describe before/after behavior and verification limits. Do not claim end-to-end success just because the build passes.

This public repository does not include production credentials or user records, and does not automatically grant access to private materials. Finalized A0 vocabulary remains read-only. Public repository status does not automatically grant rights to datasets, materials, BD10/ASE branding, or third-party assets; no redistribution license is provided.

### Official technical references

- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Local Worker environment variables and secrets](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Admin API: updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [pptxtoimages](https://github.com/brkcvlk/pptxtoimages)

*Documentation updated October 6, 2026. This guide refers to files actually available in the repository when checked; live-source and snapshot status are documented separately.*
