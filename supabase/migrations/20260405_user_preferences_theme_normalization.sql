update public.user_preferences
set theme = case
  when lower(trim(theme)) = 'claro' then 'light'
  when lower(trim(theme)) = 'escuro' then 'dark'
  when lower(trim(theme)) = 'sistema' then 'system'
  else lower(trim(theme))
end;

alter table public.user_preferences
drop constraint if exists user_preferences_theme_check;

alter table public.user_preferences
add constraint user_preferences_theme_check
check (theme in ('light', 'dark', 'system'));
