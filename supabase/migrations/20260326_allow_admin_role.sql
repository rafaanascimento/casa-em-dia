alter table public.family_members
drop constraint if exists family_members_role_check;

alter table public.family_members
add constraint family_members_role_check
check (role in ('owner', 'admin', 'member'));
