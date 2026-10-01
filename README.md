# BD10 Mandarin Learning Hub

Mandarin learning platform built with React, Vite, Tailwind CSS and Lucide icons. Learning content uses Traditional Chinese, Pinyin and English.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure your own Supabase project URL, public anon key and admin email in `.env.local`. Never commit service-role keys, passwords or auth tokens. The live application has separate backend configuration; copying this repository does not grant access to production accounts or materials.

```sh
npm run build
npm run preview
```

The Cloudflare Worker uses D1 and R2; see `wrangler.jsonc`, `db/`, `drizzle/` and `worker/`. Supabase setup scripts and demo-account Edge Function are under `supabase/`. Backend provisioning and secrets must be configured separately for your own environment.

## Contributing

Open an Issue with reproduction steps, expected behavior, browser version and screenshots without private account information. Fork the repository, make a focused change and open a Pull Request. Please preserve existing page behavior and avoid unrelated redesigns.

The finalized A0 vocabulary dataset is read-only: do not rewrite, normalize or reorder it. Keep stroke geometry and order unchanged when fixing animation. Dataset/content and branding rights are not granted by making this repository public; no redistribution license is supplied.

This is a sanitized source snapshot. Local secrets, production user data, build output and historical Git commits are not included.

## Latest update — 2026-10-02

Synced with Site version 72 (source `dd4930047c29ead1bfb349bf4d20fa174d9c394f`). Includes direct-route refresh handling, admin session recovery fixes, English/Traditional Chinese admin controls, and Student Record reporting.

For Student Record, apply `supabase/admin_student_records.sql` to your own Supabase project. The endpoint checks administrator permissions, preserves learner RLS, and reports actual lesson progress and active study time. Replace the sample `admin@example.com` owner fallback with your configured administrator email or use server-managed `app_metadata.role = "admin"`. No production student records or credentials are included.
