-- Run once in Supabase SQL Editor after supabase/schema.sql.
-- Learners are provisioned in Supabase Auth as employee-<employee ID>@bd10.local.
-- The client uses the public anon key; RLS keeps each learner's rows private.

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null references public.lesson_materials(id) on delete cascade,
  current_slide integer not null default 0 check (current_slide >= 0),
  max_viewed_slide integer not null default -1 check (max_viewed_slide >= -1),
  slide_count integer not null default 0 check (slide_count >= 0),
  progress integer not null default 0 check (progress between 0 and 100),
  status text not null default 'new' check (status in ('new', 'progress', 'completed')),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  completed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);

alter table public.lesson_progress enable row level security;
revoke all on public.lesson_progress from anon;
grant select, insert, update on public.lesson_progress to authenticated;

drop policy if exists "learner reads own lesson progress" on public.lesson_progress;
create policy "learner reads own lesson progress"
  on public.lesson_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "learner inserts own lesson progress" on public.lesson_progress;
create policy "learner inserts own lesson progress"
  on public.lesson_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "learner updates own lesson progress" on public.lesson_progress;
create policy "learner updates own lesson progress"
  on public.lesson_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Each active viewer session contributes its own elapsed time. Independent
-- session IDs allow study on two devices without replacing the other device's
-- time. Daily and lifetime totals are sums of these authenticated rows.
create table if not exists public.learning_time_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  lesson_id text not null,
  study_date date not null,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

create index if not exists learning_time_sessions_user_date_idx
  on public.learning_time_sessions (user_id, study_date);

alter table public.learning_time_sessions enable row level security;
revoke all on public.learning_time_sessions from anon;
grant select, insert, update on public.learning_time_sessions to authenticated;

drop policy if exists "learner reads own learning time" on public.learning_time_sessions;
create policy "learner reads own learning time"
  on public.learning_time_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "learner inserts own learning time" on public.learning_time_sessions;
create policy "learner inserts own learning time"
  on public.learning_time_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "learner updates own learning time" on public.learning_time_sessions;
create policy "learner updates own learning time"
  on public.learning_time_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
