-- Read-only reporting endpoint. Never expose Auth users or learner records publicly.
create schema if not exists bd10_private;
grant usage on schema bd10_private to authenticated;
create or replace function bd10_private.admin_student_records()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id = auth.uid()
    and (raw_app_meta_data->>'role' = 'admin' or lower(email) = 'admin@example.com')
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(record order by record->>'name') from (
    select jsonb_build_object(
      'id', u.id, 'name', coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',split_part(u.email,'@',1)),
      'loginId', coalesce(u.raw_user_meta_data->>'employee_id',split_part(u.email,'@',1)),
      'lastSignIn', u.last_sign_in_at,
      'todaySeconds', coalesce((select sum(s.active_seconds) from public.learning_time_sessions s where s.user_id=u.id and s.study_date=(now() at time zone 'Asia/Taipei')::date),0),
      'totalSeconds', coalesce((select sum(s.active_seconds) from public.learning_time_sessions s where s.user_id=u.id),0),
      'lastActivity', (select max(s.updated_at) from public.learning_time_sessions s where s.user_id=u.id),
      'lessons', coalesce((select jsonb_agg(jsonb_build_object('lessonId',p.lesson_id,'progress',p.progress,'activeSeconds',p.active_seconds,'completed',p.completed,'updatedAt',p.updated_at,'slideCount',p.slide_count,'currentSlide',p.current_slide) order by p.updated_at desc) from public.lesson_progress p where p.user_id=u.id),'[]'::jsonb)
    ) as record from auth.users u
    where coalesce(u.raw_app_meta_data->>'role','') <> 'admin' and lower(u.email) <> 'admin@example.com'
  ) records),'[]'::jsonb);
end;
$$;
revoke all on function bd10_private.admin_student_records() from public, anon;
grant execute on function bd10_private.admin_student_records() to authenticated;
create or replace function public.admin_student_records()
returns jsonb language sql security invoker set search_path = ''
as $$ select bd10_private.admin_student_records(); $$;
revoke all on function public.admin_student_records() from public, anon;
grant execute on function public.admin_student_records() to authenticated;
