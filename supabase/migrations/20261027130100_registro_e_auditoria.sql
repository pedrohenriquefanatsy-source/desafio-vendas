-- Fatia 1: quem criou/alterou e quando, e tabela de auditoria (Seção 4.7).

-- Preenche criado_por/criado_em e alterado_por/alterado_em. Ninguém escolhe esses valores.
create function public.preencher_registro()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.criado_por := auth.uid();
    new.alterado_em := null;
    new.alterado_por := null;
  else
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
    new.alterado_em := now();
    new.alterado_por := auth.uid();
  end if;
  return new;
end
$$;

create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text not null,
  acao text not null check (acao in ('inclusao', 'alteracao', 'exclusao')),
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  em timestamptz not null default now()
);

create index auditoria_registro on public.auditoria (tabela, registro_id);
create index auditoria_em on public.auditoria (em desc);

alter table public.auditoria enable row level security;
revoke insert, update, delete on public.auditoria from authenticated;
create policy auditoria_leitura_admin on public.auditoria
  for select to authenticated
  using (public.eh_admin());

-- Grava valor anterior e novo de cada inclusão, alteração ou exclusão.
create function public.registrar_auditoria()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.auditoria (tabela, registro_id, acao, antes, depois, usuario_id)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    case tg_op when 'INSERT' then 'inclusao' when 'UPDATE' then 'alteracao' else 'exclusao' end,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end
$$;

create trigger perfis_registro before insert or update on public.perfis
  for each row execute function public.preencher_registro();
create trigger perfis_auditoria after insert or update or delete on public.perfis
  for each row execute function public.registrar_auditoria();
