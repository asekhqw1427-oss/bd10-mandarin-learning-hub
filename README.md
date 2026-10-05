# BD10 Mandarin Learning Hub

Panduan lengkap menjalankan, mensimulasikan, dan mengedit BD10. Dibangun dengan React, Vite, Tailwind CSS, Lucide, Cloudflare Worker + D1/R2, serta Supabase untuk autentikasi dan progres belajar. Konten menggunakan **Traditional Chinese + Pinyin + English**.

**Web demo:** https://bd10-engineer-learning-demo-qw1427.qw1427.chatgpt.site

## Daftar isi

1. [Status source dan web live](#1-status-source-dan-web-live)
2. [Persiapan komputer](#2-persiapan-komputer)
3. [Clone dan instalasi](#3-clone-dan-instalasi)
4. [Konfigurasi frontend dan backend lokal](#4-konfigurasi-frontend-dan-backend-lokal)
5. [Menjalankan web](#5-menjalankan-web)
6. [Supabase dan akun pengujian](#6-supabase-dan-akun-pengujian)
7. [Simulasi pelajar dan admin](#7-simulasi-pelajar-dan-admin)
8. [Converter PowerPoint](#8-converter-powerpoint)
9. [Cara mengedit kode](#9-cara-mengedit-kode)
10. [Build dan publikasi](#10-build-dan-publikasi)
11. [Pemecahan masalah](#11-pemecahan-masalah)
12. [Kontribusi dan perlindungan data](#12-kontribusi-dan-perlindungan-data)

## 1. Status source dan web live

**Baca ini sebelum mencoba clone.** Repository ini belum merupakan salinan identik dari seluruh source web live.

| Bagian | Status dokumentasi 6 Oktober 2026 |
| --- | --- |
| Frontend dan Worker di GitHub | Snapshot Site versi 72, source `dd4930047c29ead1bfb349bf4d20fa174d9c394f`; mencakup routing, pemulihan sesi admin, bahasa admin, dan Student Record |
| Converter GitHub | Diperbarui pada commit `8e2d6f9b958b69abf2c16f7ba9d2b1137c119b05`; endpoint async menerima PPTX hingga 200 MiB |
| Web live ChatGPT | Source yang lebih baru, termasuk upload multipart dan alur saved images → Preview → Approve → Publish |
| Database, akun, secret, materi yang diupload | Tidak ikut ter-clone; harus dikonfigurasi terpisah |

Menjalankan repository ini **tidak otomatis menghadirkan seluruh perubahan terbaru web live**. Secara khusus, frontend/Worker snapshot masih memakai converter browser lama (`src/utils/pptxSlideConverter.js`). Menjalankan service Python saja tidak menghubungkan frontend lama ke service tersebut. Dukungan upload multipart 200 MB dan alur preview/approval terbaru memerlukan source frontend/Worker terbaru; jangan menganggap keduanya sudah tersedia hanya karena `server.py` terbaru ada di repository.

Panduan berikut memisahkan instruksi yang berlaku untuk **checkout GitHub sekarang** dari alur pada **web live**. Tidak ada perubahan aplikasi atau dataset yang dilakukan oleh penambahan dokumentasi ini.

### Komponen sistem

| Komponen | Tugas |
| --- | --- |
| `src/` | Antarmuka React, routing, Word List, lesson viewer, dashboard admin |
| `worker/index.js` | API `/api/*`, verifikasi admin, penyimpanan materi |
| Cloudflare D1 (`DB`) | Metadata lesson: status, payload, waktu pembaruan |
| Cloudflare R2 (`BUCKET`) | File sumber, gambar slide, thumbnail |
| Supabase | Login, identitas/role, progres dan learning time; sumber lesson legacy |
| `services/slide-converter/` | Service Python: PPTX → LibreOffice PDF → gambar slide/thumbnail |

Frontend dan API Worker dijalankan bersama lewat Vite + Cloudflare plugin. Jangan membuat server Express tambahan untuk menjalankan snapshot ini. D1 lokal dan R2 lokal tidak berisi materi produksi.

## 2. Persiapan komputer

Instal:

- **Git** untuk clone dan branch.
- **Node.js 22.12 atau lebih baru**; Node.js 24 juga dapat digunakan. npm disertakan bersama Node.
- **Visual Studio Code** atau editor lain.
- Browser modern, misalnya Chrome atau Edge.
- Internet untuk instalasi dependency dan login Supabase. “Lokal” bukan berarti autentikasi bekerja offline.
- **Docker** hanya jika ingin menjalankan converter Python lokal.

Periksa di terminal:

```sh
git --version
node --version
npm --version
```

Gunakan terminal di folder proyek. Pada Windows, PowerShell dapat digunakan. Apabila runtime Cloudflare tidak didukung lingkungan Windows Anda, gunakan WSL2/Linux dan jalankan semua perintah proyek di lingkungan yang sama.

## 3. Clone dan instalasi

```sh
git clone https://github.com/asekhqw1427-oss/bd10-mandarin-learning-hub.git
cd bd10-mandarin-learning-hub
npm ci
```

`npm ci` memakai versi dari `package-lock.json`. Jangan langsung mengubah dependency ke versi terbaru untuk sekadar menjalankan demo.

Buka folder di VS Code:

```sh
code .
```

Alternatif: VS Code → **File → Open Folder** → pilih `bd10-mandarin-learning-hub`.

## 4. Konfigurasi frontend dan backend lokal

Gunakan **Supabase pengujian milik Anda**, bukan secret atau database produksi pemilik proyek.

### 4.1 Frontend: `.env.local`

macOS/Linux/Git Bash:

```sh
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Isi `.env.local` dengan nilai dari proyek Supabase pengujian:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_ADMIN_EMAIL=admin@your-domain.example
VITE_LEARNER_EMAIL_DOMAIN=bd10.local
```

Variabel `VITE_*` masuk ke browser. `VITE_SUPABASE_ANON_KEY` adalah public/anon key yang digunakan client sekarang, **bukan** `service_role`. Public key tetap memerlukan aturan RLS yang benar.

### 4.2 Worker: `.dev.vars`

Buat file `.dev.vars` di root proyek. Ini untuk konfigurasi server lokal:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
ADMIN_EMAIL=admin@your-domain.example
```

Worker di snapshot membaca `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `ADMIN_EMAIL`, atau alternatif bernama `VITE_*`. Contoh ini memisahkan konfigurasi server dan browser secara jelas. URL/key harus menunjuk Supabase yang sama dengan frontend.

**Jangan** menambahkan converter token, service-role key, OpenAI key, password, atau access token sebagai `VITE_*`. Jangan commit `.env.local`, `.dev.vars`, ataupun file kredensial.

Periksa file yang diabaikan Git sebelum commit:

```sh
git check-ignore .env.local .dev.vars
git status --short
```

Jika file secret belum diabaikan, tambahkan namanya ke `.gitignore` sebelum melanjutkan. Setelah mengubah env, hentikan dev server dan jalankan kembali.

### 4.3 Database D1 lokal

Buat tabel metadata lesson pada **database lokal**:

```sh
npx wrangler d1 migrations apply bd10-learning-hub --local
```

Jawab konfirmasi migrasi jika diminta. Konfigurasi memakai binding `DB`, database `bd10-learning-hub`, dan migration `drizzle/0000_common_luckman.sql`.

Verifikasi:

```sh
npx wrangler d1 execute bd10-learning-hub --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Tabel `lesson_materials` harus muncul. `--local` penting: perintah ini tidak dimaksudkan untuk migrasi database produksi.

R2 lokal dibuat oleh runtime dev melalui binding `BUCKET`. File dan database lokal disimpan di state Wrangler, biasanya `.wrangler/state`. Jangan hapus state tersebut jika masih membutuhkan materi pengujian. Placeholder `database_id` dalam checkout bukan ID database produksi dan tidak perlu diganti hanya untuk simulasi lokal.

## 5. Menjalankan web

Dari root proyek:

```sh
npm run dev
```

Buka alamat **Local** yang dicetak terminal, biasanya:

```text
http://localhost:5173
```

Jika port 5173 dipakai aplikasi lain, Vite dapat memilih port lain. Gunakan alamat yang benar-benar dicetak terminal. Biarkan terminal tetap berjalan. Hentikan dengan `Ctrl+C`.

### Pemeriksaan awal

- Halaman login muncul.
- Console browser tidak menunjukkan error import.
- Akses `/api/materials` pada origin lokal yang sama memberi JSON, bukan HTML.
- Database lokal baru boleh menghasilkan daftar lesson kosong; ini bukan bukti bahwa materi produksi hilang.
- Tanpa konfigurasi Supabase, halaman login bisa tampil tetapi **login pelajar/admin tidak tersedia**. Tidak ada password universal `123` yang otomatis dibuat oleh clone.

### Build dan preview

```sh
npm run build
npm run preview
```

Gunakan URL preview yang dicetak terminal. `dist/client` berisi frontend, `dist/server` berisi build Worker. `scripts/prepare-spa-shell.mjs` menyiapkan fallback route dengan asset build yang sama.

Preview digunakan untuk pemeriksaan build lokal. Build berhasil bukan bukti login, R2, Supabase, converter, atau publikasi sudah bekerja end-to-end. Jangan membuka `index.html` dengan `file://`; API, routing, dan autentikasi membutuhkan server HTTP.

## 6. Supabase dan akun pengujian

### 6.1 Persiapkan Supabase sendiri

1. Buat/pilih proyek Supabase pengujian.
2. Ambil Project URL dan public/anon key, lalu isi kedua file env di atas.
3. Buka SQL Editor di proyek pengujian.
4. Baca script dan ganti fallback `admin@example.com` dengan email admin pengujian yang sama, jika Anda menggunakan jalur email owner.
5. Jalankan urutan berikut:

| Urutan | File | Kegunaan |
| --- | --- | --- |
| 1 | `supabase/schema.sql` | Tabel lesson legacy, bucket legacy, RLS |
| 2 | `supabase/role_access.sql` | Aturan akses admin berbasis email/`app_metadata` |
| 3 | `supabase/lesson_progress.sql` | Progres pelajar dan sesi learning time |
| 4 | `supabase/admin_student_records.sql` | RPC Student Record untuk admin |

Script `schema.sql` membuat **bucket legacy publik**. Jangan gunakan bucket tersebut untuk dokumen rahasia. Web terbaru menyimpan draft/gambar melalui jalur R2 yang dikendalikan Worker; itu berbeda dari bucket legacy snapshot.

Jika Data API proyek tidak memberi grant otomatis pada tabel baru, periksa grant bersama RLS. Jangan menonaktifkan RLS untuk memperbaiki permission error. Perhatikan juga bahwa `lesson_progress.lesson_id` merujuk `public.lesson_materials` di Supabase: lesson yang hanya ada di D1 tanpa pasangan row Supabase dapat gagal disimpan progres cloud-nya pada snapshot ini. Ini perlu ditelusuri sebagai integrasi, bukan “diperbaiki” dengan menghapus foreign key sembarangan.

### 6.2 Buat akun pelajar

Di Supabase **Authentication → Users**, buat user pengujian dengan email dan password yang Anda tentukan, lalu pastikan email sudah terkonfirmasi.

Contoh pemetaan ID — contoh ini **bukan akun yang otomatis tersedia**:

| Input login | Email yang dicari aplikasi |
| --- | --- |
| `DEMO01` | `employee-demo01@bd10.local` |
| `123` | `employee-123@bd10.local` |
| `dimas@example.com` | `dimas@example.com` secara langsung |

Aplikasi memakai `learnerEmailForLogin()` dalam `src/utils/supabaseClient.js`. Email lengkap dapat digunakan agar tidak salah pemetaan ID. Email `bd10.local` bukan inbox email nyata; untuk ID pengujian seperti itu, provision akun terkonfirmasi melalui jalur admin yang tepercaya. Untuk alur konfirmasi email biasa, gunakan alamat yang bisa menerima email.

Nama yang tampil berasal dari `user_metadata.display_name` atau `full_name`; `user_metadata` **bukan** sumber otorisasi admin.

### 6.3 Masuk sebagai admin

**Owner admin:**

1. Buat user Supabase dengan email persis sama dengan `VITE_ADMIN_EMAIL` dan `ADMIN_EMAIL`.
2. Gunakan password akun tersebut.
3. Pada login BD10, isi ID `ADMIN` dan password owner admin.
4. Setelah berhasil, aplikasi membuka `/admin`.

**Admin tambahan:** user dapat masuk memakai email lengkap atau ID yang dipetakan di atas, tetapi harus memiliki `app_metadata.role = "admin"` yang dipasang melalui backend/Supabase Admin API tepercaya. Mengubah React, sessionStorage, atau `user_metadata.role` tidak memberi akses API admin.

Jangan menyimpan service-role key atau skrip provisioning dengan secret di frontend. Jika ingin memakai fungsi 5 akun pelajar + 2 admin yang sudah ada, source-nya berada di `supabase/functions/provision-demo-accounts/index.ts`. Fungsi tersebut harus dideploy dan dipanggil oleh admin yang sudah terautentikasi; tidak berjalan otomatis setelah clone. Password dibuat saat provisioning, bukan ditulis dalam README. Pemanggilan ulang default tidak menerbitkan kembali password akun lama; `rotateExisting` mengubah password dan bukan langkah pengujian rutin.

### 6.4 Link email dan redirect

Untuk simulasi, gunakan **login password** dahulu. Supabase Authentication → URL Configuration harus mengizinkan origin callback yang dipakai, termasuk port localhost aktual dan URL produksi yang diperlukan.

Ada batasan source saat ini: `adminAuthRedirectUrl` di `src/utils/supabaseClient.js` menunjuk `/admin` pada domain ChatGPT secara hard-coded. Menambahkan localhost di Supabase saja tidak mengubah redirect yang dikirim aplikasi. Jika mengembangkan salinan milik sendiri dan membutuhkan magic link lokal, ubah referensi redirect itu pada branch pengujian Anda ke URL lokal yang sesuai dan allowlist di Supabase. Jangan mengubah redirect produksi tanpa review. Link akses mengandung token — jangan tempelkan di Issue atau README.

## 7. Simulasi pelajar dan admin

Gunakan akun dan proyek pengujian. Jangan menghapus/mengganti lesson produksi untuk mencoba fitur.

### Pelajar

1. Login dengan akun pengujian.
2. Buka Home lalu Lessons.
3. Pilih satu lesson yang sudah dipublish.
4. Periksa gambar slide, thumbnail, Previous/Next, fullscreen, dan timer.
5. Keluar lalu buka lesson kembali untuk memeriksa pemulihan progres.
6. Bandingkan learning time dan status di Home/Lessons.
7. Periksa Vocabulary: search Hanzi/Pinyin/English, level CEFR, pemilihan kata, dan scrollbar internal.

Lesson lokal tidak otomatis sama dengan lesson web live. Daftar kosong dapat berarti D1 lokal belum memiliki materi, bukan masalah filter.

### Admin di checkout GitHub sekarang

1. Login sebagai admin → `/admin`.
2. Buat lesson pengujian dengan judul/deskripsi yang jelas.
3. Untuk simulasi ringan dan menjaga format, gunakan **gambar slide asli yang sudah diekspor dari PowerPoint**, jika input gambar tersedia di editor.
4. Simpan draft, periksa materi, lalu publish memakai fungsi editor snapshot.
5. Buka jendela incognito/browser lain sebagai pelajar pada **origin lokal yang sama**.
6. Periksa apakah lesson published muncul dan draft tidak muncul.
7. Uji edit judul/deskripsi tanpa upload ulang dan periksa lagi dari akun pelajar.

Converter PPTX browser lama dalam snapshot dapat menghasilkan format berbeda dari PowerPoint. Jangan menganggap hasil itu setara dengan service LibreOffice terbaru.

### Admin di web live terbaru

Alur yang dituju dan dipakai source live:

**Upload PowerPoint → saved slide images → Preview → Approve → Publish**.

- Gambar dan thumbnail disimpan terlebih dahulu.
- Preview harus menggunakan gambar yang sudah tersimpan.
- Admin memeriksa hasil dan menyetujui preview secara eksplisit.
- Publish dilakukan setelah persetujuan; upload atau konversi tidak boleh otomatis menerbitkan lesson.
- Jika konversi gagal, original dan draft harus tetap tersedia.
- AI/WebGPU bukan syarat konversi maupun publikasi.

Frontend/Worker terbaru harus disinkronkan ke checkout sebelum menilai alur ini lewat clone. Dokumentasi tidak mengaktifkan fitur yang belum ada dalam kode snapshot.

## 8. Converter PowerPoint

### 8.1 Menjalankan service lokal dengan Docker

Dari root repository:

```sh
docker build -t bd10-slide-converter services/slide-converter
```

Buat file lokal `.converter.env` dan pastikan masuk `.gitignore`:

```dotenv
SLIDE_CONVERTER_TOKEN=YOUR_RANDOM_SERVER_ONLY_TOKEN
```

Gunakan secret acak milik lingkungan pengujian; jangan memakai token produksi. Jalankan:

```sh
docker run --rm --name bd10-slide-converter --env-file .converter.env -p 127.0.0.1:8080:8080 bd10-slide-converter
```

Buka `http://127.0.0.1:8080/health`. Respons sehat:

```json
{"status":"ok","service":"bd10-slide-converter"}
```

Docker menjalankan LibreOffice, Poppler, Python, dan `pptxtoimages@0.1.14`; tidak membutuhkan PowerPoint dipasang di browser. Docker harus tetap berjalan selama konversi.

### 8.2 Kontrak service

Semua endpoint selain `/health` membutuhkan bearer token **server-only**.

| Endpoint | Fungsi |
| --- | --- |
| `POST /jobs` | Upload binary PPTX, menerima ID job dan jumlah slide/hash asli |
| `GET /jobs/{id}` | Memeriksa status dan jumlah slide yang sudah dirender |
| `GET /jobs/{id}/result` | Mengambil ZIP berisi PDF, gambar, thumbnail, manifest |
| `POST /convert` | Endpoint sinkron legacy; untuk file besar gunakan async `/jobs` |

Endpoint `/jobs` menerima hingga **200 MiB**, maksimal 300 slide, macro-free PPTX. File sumber di-stream ke disk. **Paket hasil tetap maksimal 32 MiB**; dokumen dengan banyak gambar/slide berat dapat melewati batas output walaupun input kurang dari 200 MB. Urutan dan jumlah slide diverifikasi. Font yang tidak tersedia dapat disubstitusi; admin tetap harus review hasil visual.

Job native bersifat sementara: restart service atau masa kedaluwarsa dapat menghilangkan job/result yang belum disimpan. Original yang telah disimpan di R2 merupakan sumber untuk retry.

### 8.3 Menghubungkan source live yang sudah memiliki pipeline native

**Bagian ini hanya berlaku jika checkout memiliki `worker/services/slideConversion.js` dan `worker/services/lessonVisuals.js` terbaru. Keduanya tidak tersedia dalam snapshot frontend/Worker GitHub yang didokumentasikan di atas.**

Konfigurasi `.dev.vars`/server runtime:

```dotenv
SLIDE_CONVERTER_URL=http://127.0.0.1:8080/convert
SLIDE_CONVERTER_TOKEN=THE_SAME_LOCAL_TOKEN_AS_THE_CONTAINER
SLIDE_CONVERTER_ASYNC=true
SLIDE_CONVERTER_LARGE_UPLOADS=true
```

Pada hosting produksi, URL harus memakai HTTPS service converter Anda. Set token yang sama pada Worker dan converter. Jangan menambahkan `VITE_SLIDE_CONVERTER_TOKEN`. Jalur upload >32 MB juga membutuhkan kode upload multipart terbaru; flag saja tidak menambah fungsi ke snapshot lama.

Hosting ChatGPT menjalankan aplikasi/Worker, sedangkan LibreOffice berjalan di service converter terpisah. Commit GitHub tidak otomatis memperbarui web ChatGPT. Service Render yang sekarang digunakan menonaktifkan auto-deploy; perubahan converter membutuhkan deploy Render terpisah dan konfirmasi status Live.

Detail: [`services/slide-converter/server.py`](services/slide-converter/server.py), [`Dockerfile`](Dockerfile), [`render.yaml`](render.yaml). README converter lama mungkin masih menyebut batas input 32 MB; kontrak input terbaru berada dalam `server.py` commit yang disebut pada bagian 1.

## 9. Cara mengedit kode

### 9.1 Buat branch terlebih dahulu

```sh
git switch -c docs-or-fix/my-change
```

Jika Anda bukan pemilik repository, fork dahulu lalu clone fork. Hindari mengedit langsung `main` untuk eksperimen.

### 9.2 Pilih file sesuai bagian yang ingin diubah

| Bagian | File utama |
| --- | --- |
| Login, sesi, pemilihan dashboard | `src/main.jsx` |
| Konfigurasi dan fungsi login | `src/utils/supabaseClient.js` |
| Sidebar/header/komposisi dashboard | `src/Dashboard.jsx`, `src/dashboard.css` |
| Home | `src/HomePage.jsx`, `src/home.css` |
| Daftar Lessons | `src/LessonsPage.jsx`, `src/lessons.css` |
| Lesson viewer, slide/timer | `src/LessonViewer.jsx`, `src/lesson-viewer.css` |
| Admin | `src/AdminDashboard.jsx`, `src/admin.css`, `src/adminTranslations.js` |
| Student Record | `src/AdminStudentRecords.jsx`, `supabase/admin_student_records.sql` |
| Penyimpanan/load materi | `src/utils/adminLessonStore.js`, `worker/index.js` |
| Routing | `src/utils/appRouting.js` |
| Progres dan learning time | `src/utils/lessonProgress.js`, `src/utils/learningTime.js` |
| Vocabulary dan virtual scrolling | `src/VocabularyPage.jsx`, `src/vocabulary.css`, `src/vocabulary-ref.css` |
| Dataset TOCFL per level | `src/data/tocfl/`, central export `src/data/tocfl/index.js` |
| Stroke A0 | `src/A0StrokePanel.jsx`, `src/utils/hanziStrokeParser.js`, `src/data/a0Stroke.js` |
| Branding/gambar | `public/` dan referensi asset di komponen |
| API dan file materi | `worker/index.js`, binding `DB`/`BUCKET` |
| Schema D1 | `db/schema.ts`, `drizzle/` |
| Converter server | `services/slide-converter/server.py` |

Cek nama file dalam checkout sebelum mengedit; struktur source live yang lebih baru dapat menambah komponen. Cari teks di VS Code dengan **Ctrl+Shift+F** / **Cmd+Shift+F**.

### 9.3 Contoh perubahan sederhana

1. Ingin mengganti teks heading Lessons? Cari teksnya di `src/LessonsPage.jsx`.
2. Ingin menyesuaikan padding card Lessons? Cari class card di `src/lessons.css`.
3. Simpan file; Vite biasanya memperbarui browser otomatis.
4. Periksa desktop dan layar kecil melalui DevTools.
5. Periksa console dan build sebelum commit.

Untuk mengubah **materi lesson, judul, deskripsi, dan waktu belajar**, gunakan editor admin bila field sudah tersedia. Jangan mengubah source untuk setiap upload lesson. Source digunakan untuk perubahan perilaku/antarmuka aplikasi.

### 9.4 Aturan dataset dan renderer

- **A0 / TOCFL 1 finalized bersifat read-only.** Jangan mengubah ID, Hanzi, Pinyin, definisi, contoh, metadata, atau urutan `src/data/tocfl/a0.js`.
- Jangan menjalankan generator dataset hanya untuk mengedit CSS atau memperbaiki UI.
- Jangan menyalin ribuan vocabulary ke komponen React.
- Pertahankan virtual scrolling, memoization, search index, dan filter level.
- Stroke harus memakai geometri asli; jangan membalik array stroke untuk memperbaiki orientasi SVG.
- Jangan mengubah halaman lain untuk perubahan kecil pada Lessons/Admin.

### 9.5 Simpan perubahan ke GitHub

```sh
git diff
git status --short
npm run build
git add path/to/file-you-changed
git commit -m "Describe the specific change"
git push -u origin docs-or-fix/my-change
```

Ganti `path/to/file-you-changed` dengan file nyata yang diedit. Buka Pull Request dan tuliskan masalah, hasil perubahan, serta validasi. Hindari `git add .` tanpa memeriksa apakah ada secret/file materi pribadi.

## 10. Build dan publikasi

### GitHub, Render, dan web ChatGPT merupakan deployment berbeda

| Tindakan | Hasil |
| --- | --- |
| `git push` | Source tersimpan di GitHub |
| `npm run build` | Build lokal dibuat; belum mengubah website live |
| Deploy Render | Memperbarui service converter, bukan otomatis frontend ChatGPT |
| Publish Sites pada proyek ChatGPT yang sama | Memperbarui website pada domain ChatGPT |

Untuk memperbarui domain ChatGPT yang ada, pemilik proyek harus memakai alur **Sites** dengan source terbaru, build yang benar, dan project ID yang sudah ada. Repository ini tidak menyediakan perintah `npm run deploy` untuk domain ChatGPT. Jangan membuat Site baru atau menimpa live memakai snapshot lama hanya untuk mempublish perubahan dokumentasi.

Untuk hosting Cloudflare mandiri, gunakan akun dan D1/R2 milik Anda, konfigurasi ID resource nyata, migrasi ke database tujuan yang benar, lalu ikuti dokumentasi Cloudflare. Menjalankan `wrangler deploy` pada komputer tidak menerbitkan ke domain ChatGPT milik proyek ini. Jangan gunakan ID atau secret production pemilik tanpa otorisasi.

### Checklist sebelum rilis perubahan aplikasi

- Build berhasil.
- Login pelajar dan admin diuji memakai akun pengujian.
- Route refresh `/lessons` dan `/admin` tidak 404.
- Lesson draft tidak muncul pada pelajar.
- Published lesson muncul dan gambar yang dibuka sama dengan preview admin.
- Batas waktu pembelajaran dan syarat completion diuji.
- Search/filter/virtual scrolling Vocabulary tidak berubah.
- A0 dan level lain yang tidak menjadi scope tetap utuh.
- Tidak ada secret, private lesson, password, token, atau data pelajar dalam commit.

Snapshot GitHub belum menyediakan script `npm test`. Jika memakai source terbaru dengan folder `tests/`, jalankan pengujian yang tersedia untuk perubahan tersebut; jangan mengklaim tes source live sudah dijalankan pada clone snapshot.

## 11. Pemecahan masalah

| Gejala | Periksa / tindakan |
| --- | --- |
| `npm`/`node` tidak dikenali | Instal Node, buka terminal baru, cek versi |
| `npm ci` gagal | Cek versi Node, jaringan, dan kesesuaian lockfile; jangan hapus lockfile sebagai langkah pertama |
| `no such table: lesson_materials` | Jalankan migrasi D1 dengan `--local`; pastikan config/state yang dipakai sama |
| Login ditolak | URL/key frontend benar, akun ada di Supabase yang sama, email terkonfirmasi, password benar |
| ID `123` tidak bisa masuk | Buat akun `employee-123@bd10.local`, atau masuk dengan email lengkap yang benar; clone tidak membuat akun ini |
| Admin mendapat 401 | Sesi tidak ada/kedaluwarsa; login ulang dan periksa Worker mengarah ke Supabase yang sama |
| Admin mendapat 403 | Role `app_metadata` atau owner email belum sesuai; role React bukan hak akses server |
| `Admin verification is not configured` | Isi `.dev.vars` Worker; `.env.local` frontend saja belum cukup |
| Magic link kembali ke domain produksi | Source mempunyai `adminAuthRedirectUrl` hard-coded; gunakan password untuk simulasi lokal atau sesuaikan redirect pada branch pengujian |
| Lesson lokal kosong | D1/R2 lokal baru tidak memuat materi produksi; buat materi pengujian |
| Perubahan env tidak terlihat | Restart dev server; frontend env dibaca saat dev/build |
| Refresh route 404 saat hosting | Periksa SPA fallback dan `prepare-spa-shell.mjs`; jangan hanya mengunggah `index.html` |
| Console Supabase permission/RLS/FK error | Periksa script SQL, grants, role tepercaya, dan kecocokan lesson ID; jangan matikan RLS |
| Converter `/health` sehat tetapi upload 403 | Bearer token Worker dan converter harus identik; token tidak boleh berada di browser |
| Converter sehat tetapi UI masih memakai renderer lama | Checkout snapshot belum memiliki integrasi Worker native; env saja tidak mengganti import converter |
| PPTX hasilnya berbeda dari PowerPoint | Cek source pipeline dan font; review saved images sebelum publish |
| File input 200 MB diterima tetapi konversi gagal | Periksa limit 300 slide, macro-free PPTX, timeout/memori, dan paket output 32 MiB |
| Perubahan GitHub tidak muncul di live | GitHub commit, deploy Render, dan publish Sites merupakan langkah terpisah |

Saat melaporkan bug, sertakan langkah reproduksi, browser, status HTTP, pesan error, dan screenshot. **Sensor token, email pribadi, password, isi `.dev.vars`, dan header Authorization.** Jangan mengirim seluruh dataset atau document pribadi jika tidak diperlukan.

## 12. Kontribusi dan perlindungan data

Fork → branch → perubahan terfokus → build/check → Pull Request. Deskripsikan perilaku sebelum/sesudah dan batas verifikasi. Jangan mengklaim end-to-end berhasil hanya karena build pass.

Repository publik ini tidak menyertakan production credentials, user records, ataupun otomatis memberikan akses ke materi private. A0 vocabulary finalized tetap read-only. Hak atas dataset, materi, BD10/ASE branding, dan aset pihak ketiga tidak otomatis diberikan oleh status repository publik; tidak ada lisensi redistribusi yang disediakan.

### Referensi teknis resmi

- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Environment variables dan secrets lokal Worker](https://developers.cloudflare.com/workers/local-development/environment-variables/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Admin API: updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [pptxtoimages](https://github.com/brkcvlk/pptxtoimages)

*Dokumentasi diperbarui 6 Oktober 2026. Panduan mengacu pada file yang benar-benar tersedia di repository saat diperiksa; status source live dan snapshot dijelaskan secara terpisah.*
