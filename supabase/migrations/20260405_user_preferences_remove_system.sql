update public.user_preferences
set theme = 'light'
where lower(trim(theme)) in ('system', 'sistema');

alter table public.user_preferences
drop constraint if exists user_preferences_theme_check;

alter table public.user_preferences
add constraint user_preferences_theme_check
check (theme in ('light', 'dark'));
