-- Run in the dedicated iPhone project's SQL Editor.
create table if not exists public.iphone_research (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('records','watchlist')),
  item text not null,
  data jsonb not null,
  primary key(owner,kind,item)
);
alter table public.iphone_research enable row level security;
drop policy if exists own_research on public.iphone_research;
create policy own_research on public.iphone_research to authenticated
using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
revoke all on public.iphone_research from public, anon, authenticated;
grant select,insert,update on public.iphone_research to authenticated;

create or replace function public.save_iphone_research(k text, v jsonb, expected int)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  item_key text := case when k='watchlist' then v->>'code' else v->>'id' end;
  old_data jsonb;
  ver int;
  saved jsonb;
begin
  if uid is null or k not in ('watchlist','records') or item_key is null or item_key='' or expected is null or expected<0 then
    raise exception '無效的研究資料';
  end if;
  if k='watchlist' and item_key !~ '^[0-9]{4,5}$' then raise exception '股票代號格式有誤'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||':'||k||':'||item_key,0));
  select data into old_data from public.iphone_research where owner=uid and kind=k and item=item_key;
  ver := coalesce((old_data->>'version')::int,0);
  v := v - array['version','versions','updatedAt','_pending','_offline'];
  if (old_data - array['version','versions','updatedAt'])=v then return old_data; end if;
  if ver<>expected then raise sqlstate 'PT409' using message='資料已有新版本，請比較後再套用'; end if;
  saved := v || jsonb_build_object('version',ver+1,'updatedAt',now());
  if k='records' then
    saved := saved || jsonb_build_object('versions',coalesce(old_data->'versions','[]'::jsonb) ||
      case when old_data is null then '[]'::jsonb else jsonb_build_array(old_data-'versions') end);
  end if;
  insert into public.iphone_research(owner,kind,item,data) values(uid,k,item_key,saved)
  on conflict(owner,kind,item) do update set data=excluded.data;
  return saved;
end $$;
revoke all on function public.save_iphone_research(text,jsonb,int) from public, anon;
grant execute on function public.save_iphone_research(text,jsonb,int) to authenticated;
