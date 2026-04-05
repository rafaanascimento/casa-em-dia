create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'sistema',
  updated_at timestamptz not null default now(),
  constraint user_preferences_theme_check check (theme in ('claro', 'escuro', 'sistema'))
);

create index if not exists user_preferences_user_id_idx on public.user_preferences (user_id);
