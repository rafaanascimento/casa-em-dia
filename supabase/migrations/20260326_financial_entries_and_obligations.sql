-- Base estrutural de entradas e despesas do Casa em Dia
-- Tabelas: entries, obligations

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  recurrence_type text not null,
  start_date date not null,
  end_date date,
  due_day smallint,
  block_type text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint entries_recurrence_type_check check (recurrence_type in ('monthly', 'one_time')),
  constraint entries_due_day_check check (due_day is null or due_day between 1 and 31),
  constraint entries_block_type_check check (block_type in ('10', '25')),
  constraint entries_date_range_check check (end_date is null or end_date >= start_date)
);

create table if not exists public.obligations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null,
  recurrence_type text not null,
  total_installments integer,
  start_date date not null,
  end_date date,
  due_day smallint,
  block_type text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint obligations_type_check check (type in ('fixa', 'unica', 'parcelada')),
  constraint obligations_recurrence_type_check check (recurrence_type in ('monthly', 'one_time')),
  constraint obligations_total_installments_check check (
    (type = 'parcelada' and total_installments is not null and total_installments > 0)
    or (type <> 'parcelada' and total_installments is null)
  ),
  constraint obligations_due_day_check check (due_day is null or due_day between 1 and 31),
  constraint obligations_block_type_check check (block_type in ('10', '25')),
  constraint obligations_date_range_check check (end_date is null or end_date >= start_date)
);

create index if not exists entries_family_id_idx on public.entries (family_id);
create index if not exists entries_created_by_idx on public.entries (created_by);
create index if not exists entries_is_active_idx on public.entries (is_active);

create index if not exists obligations_family_id_idx on public.obligations (family_id);
create index if not exists obligations_created_by_idx on public.obligations (created_by);
create index if not exists obligations_is_active_idx on public.obligations (is_active);
