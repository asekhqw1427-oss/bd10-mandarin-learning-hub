-- Allow trusted Supabase app_metadata admin roles alongside the existing owner admin.
-- app_metadata is server-managed; never use user_metadata for authorization.

drop policy if exists "admin manages lessons" on public.lesson_materials;
create policy "admin manages lessons"
  on public.lesson_materials for all
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'asekh.qw1427@gmail.com'
    or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  )
  with check (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'asekh.qw1427@gmail.com'
    or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
  );

drop policy if exists "admin uploads lesson files" on storage.objects;
create policy "admin uploads lesson files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'lesson-materials'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'asekh.qw1427@gmail.com'
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
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'asekh.qw1427@gmail.com'
      or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    )
  )
  with check (
    bucket_id = 'lesson-materials'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'asekh.qw1427@gmail.com'
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
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'asekh.qw1427@gmail.com'
      or auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    )
  );
