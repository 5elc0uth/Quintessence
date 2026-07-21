-- Quintessence commercial catalogue hardening
-- Date: 2026-07-21
-- Purpose:
--   1. Ensure multiple product rows can share the same category.
--   2. Add columns expected by the commercial storefront/admin.
--   3. Add non-unique indexes used by catalogue filtering and sorting.
--
-- Review in a non-production environment first, then run in Supabase SQL Editor.

begin;

alter table public.products
  add column if not exists video_url text,
  add column if not exists is_best_seller boolean not null default false,
  add column if not exists is_in_stock boolean not null default true,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

-- Remove a single-column UNIQUE constraint on category if an earlier build
-- created one. Categories are classifications, not unique product identities.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'products'
      and c.contype = 'u'
      and array_length(c.conkey, 1) = 1
      and exists (
        select 1
        from unnest(c.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = t.oid
         and a.attnum = key.attnum
        where a.attname = 'category'
      )
  loop
    execute format(
      'alter table public.products drop constraint if exists %I',
      constraint_name
    );
  end loop;
end $$;

-- Remove a standalone single-column unique index on category if one exists.
do $$
declare
  index_name text;
begin
  for index_name in
    select index_class.relname
    from pg_index index_meta
    join pg_class table_class
      on table_class.oid = index_meta.indrelid
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    join pg_class index_class
      on index_class.oid = index_meta.indexrelid
    join pg_attribute indexed_column
      on indexed_column.attrelid = table_class.oid
     and indexed_column.attnum = index_meta.indkey[0]
    left join pg_constraint backing_constraint
      on backing_constraint.conindid = index_meta.indexrelid
    where table_namespace.nspname = 'public'
      and table_class.relname = 'products'
      and index_meta.indisunique
      and index_meta.indnatts = 1
      and indexed_column.attname = 'category'
      and backing_constraint.oid is null
  loop
    execute format('drop index if exists public.%I', index_name);
  end loop;
end $$;

create index if not exists products_category_idx
  on public.products (category);

create index if not exists products_visible_created_idx
  on public.products (is_hidden, created_at desc);

create index if not exists products_best_seller_idx
  on public.products (is_best_seller, is_hidden, created_at desc);

commit;

-- Verification: this transaction must succeed and return two rows.
begin;

insert into public.products (
  name,
  category,
  price,
  description,
  is_best_seller,
  is_in_stock,
  is_hidden
)
values
  ('__category_test_one__', '__MULTI_ITEM_TEST__', 1, 'Temporary verification row', false, true, true),
  ('__category_test_two__', '__MULTI_ITEM_TEST__', 1, 'Temporary verification row', false, true, true);

select id, name, category
from public.products
where category = '__MULTI_ITEM_TEST__'
order by name;

delete from public.products
where category = '__MULTI_ITEM_TEST__';

rollback;
