-- Zentraler, atomarer Rate-Limiter für den zeitlich begrenzten Seminarraum.
-- RLS bleibt ohne Client-Policy aktiv; nur die service_role der Edge Function
-- darf die SECURITY-DEFINER-Funktion aufrufen.

create table if not exists public.seminar_rate_limit_buckets (
  bucket text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

alter table public.seminar_rate_limit_buckets enable row level security;
revoke all on table public.seminar_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_seminar_rate_limits(
  p_room_bucket text,
  p_participant_bucket text,
  p_window_seconds integer default 60,
  p_room_limit integer default 28,
  p_participant_limit integer default 4
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval;
  v_participant_allowed boolean := false;
  v_room_allowed boolean := false;
begin
  if
    coalesce(length(p_room_bucket), 0) < 5 or
    coalesce(length(p_participant_bucket), 0) < 8 or
    p_window_seconds < 1 or
    p_room_limit < 1 or
    p_participant_limit < 1
  then
    return false;
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into public.seminar_rate_limit_buckets as buckets (bucket, window_started_at, request_count)
  values (p_participant_bucket, v_now, 1)
  on conflict (bucket) do update
  set
    window_started_at = case
      when buckets.window_started_at <= v_now - v_window then v_now
      else buckets.window_started_at
    end,
    request_count = case
      when buckets.window_started_at <= v_now - v_window then 1
      else buckets.request_count + 1
    end
  where
    buckets.window_started_at <= v_now - v_window or
    buckets.request_count < p_participant_limit
  returning true into v_participant_allowed;

  if not coalesce(v_participant_allowed, false) then
    return false;
  end if;

  insert into public.seminar_rate_limit_buckets as buckets (bucket, window_started_at, request_count)
  values (p_room_bucket, v_now, 1)
  on conflict (bucket) do update
  set
    window_started_at = case
      when buckets.window_started_at <= v_now - v_window then v_now
      else buckets.window_started_at
    end,
    request_count = case
      when buckets.window_started_at <= v_now - v_window then 1
      else buckets.request_count + 1
    end
  where
    buckets.window_started_at <= v_now - v_window or
    buckets.request_count < p_room_limit
  returning true into v_room_allowed;

  return coalesce(v_room_allowed, false);
end;
$$;

revoke all on function public.consume_seminar_rate_limits(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_seminar_rate_limits(text, text, integer, integer, integer)
  to service_role;
