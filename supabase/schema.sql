-- BD10 Mandarin Learning Hub lesson backend
-- Run this once in Supabase SQL Editor.

create table if not exists public.lesson_materials (
  id text primary key,
  number text not null,
  title text not null,
  chinese_title text not null,
  pinyin text not null default '',
  description text not null default '',
  level text not null default 'Beginner',
  estimated_time text not null default '15 min',
  practice_type text not null default 'Speaking Mission',
  status text not null default 'draft' check (status in ('draft', 'published')),
  file_names jsonb not null default '[]'::jsonb,
  source_file_type text not null default '',
  source_file_url text,
  slides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lesson_materials enable row level security;

drop policy if exists "published lessons are public" on public.lesson_materials;
create policy "published lessons are public"
  on public.lesson_materials for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists "admin manages lessons" on public.lesson_materials;
create policy "admin manages lessons"
  on public.lesson_materials for all
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@example.com'
    or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@example.com'
    or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

insert into storage.buckets (id, name, public)
values ('lesson-materials', 'lesson-materials', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "lesson files are publicly readable" on storage.objects;
create policy "lesson files are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'lesson-materials');

drop policy if exists "admin uploads lesson files" on storage.objects;
create policy "admin uploads lesson files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson-materials'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@example.com'
      or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    )
  );

drop policy if exists "admin updates lesson files" on storage.objects;
create policy "admin updates lesson files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@example.com'
      or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    )
  )
  with check (
    bucket_id = 'lesson-materials'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@example.com'
      or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    )
  );

drop policy if exists "admin deletes lesson files" on storage.objects;
create policy "admin deletes lesson files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'lesson-materials'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'admin@example.com'
      or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    )
  );
