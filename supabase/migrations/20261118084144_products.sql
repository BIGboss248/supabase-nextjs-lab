-- products: schema, access, publication.
-- Three sections, in dependency order. Section 3 needs the table from section 1,
-- and section 2 needs the table before it can be secured.
-- Decisions: issue #2 Lock the products schema and RLS posture.

-- ===========================================================================
-- 1. Schema
-- ===========================================================================

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  price_minor integer not null check (price_minor >= 0),
  currency    char(3) not null default 'USD',
  stock       integer not null default 0 check (stock >= 0),
  image_url   text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.products is
  'Catalogue rows. Reads are public when published; writes are closed to clients.';

-- Kept here rather than in the app: Studio edits and seed.sql bypass the app,
-- so an app-maintained timestamp would be wrong on exactly the rows you inspect.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- ===========================================================================
-- 2. Access
-- ===========================================================================

alter table public.products enable row level security;

-- One policy, two roles: a signed-out visitor and a signed-in one see the
-- same catalogue. No policy for insert/update/delete, so RLS denies them.
create policy "published products are readable by anyone"
  on public.products
  for select
  to anon, authenticated
  using (published = true);

grant select on public.products to anon, authenticated;

-- The second lock. Supabase grants anon and authenticated full DML on public
-- tables by default, so deleting the policy above in Studio would silently
-- re-open writes without this.
revoke insert, update, delete, truncate on public.products from anon, authenticated;

-- The only write path in v1. security definer runs with the owner's rights,
-- so the execute grant is the authorisation: signed-in users only.
-- One conditional UPDATE, so two callers cannot both take the last unit;
-- at zero it returns no row instead of raising.
create function public.sell_one_unit(product_id uuid)
returns public.products
language sql
security definer
set search_path = ''
as $$
  update public.products
     set stock = stock - 1
   where id = product_id
     and stock > 0
  returning *;
$$;

revoke execute on function public.sell_one_unit(uuid) from public, anon;
grant execute on function public.sell_one_unit(uuid) to authenticated;

-- ===========================================================================
-- 3. Publication — depends on the table created above
-- ===========================================================================

-- Bare "alter publication ... add table" is not idempotent; a migration must
-- survive db reset and a shadow-database diff. Membership also disappears if
-- the table is dropped and recreated, so this stays after the create.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;
