-- Fatia 1: desafio e metas (Seção 4.6). Só o administrador cria e altera.

create type public.situacao_desafio as enum ('planejado', 'em_andamento', 'encerrado');

create table public.desafios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  inicio date not null,
  fim date not null,
  meta_resultado numeric(12, 2) check (meta_resultado is null or meta_resultado > 0),
  meta_vendas numeric(12, 2) check (meta_vendas is null or meta_vendas > 0),
  situacao public.situacao_desafio not null default 'planejado',
  chave_idempotencia uuid unique,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  constraint desafios_periodo check (fim >= inicio)
);

-- No máximo um desafio em andamento.
create unique index desafios_um_em_andamento on public.desafios ((true))
  where situacao = 'em_andamento';

alter table public.desafios enable row level security;
revoke delete on public.desafios from authenticated;

create policy desafios_leitura on public.desafios
  for select to authenticated using (public.eh_participante());
create policy desafios_inclusao_admin on public.desafios
  for insert to authenticated with check (public.eh_admin());
create policy desafios_alteracao_admin on public.desafios
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

create trigger desafios_registro before insert or update on public.desafios
  for each row execute function public.preencher_registro();
create trigger desafios_auditoria after insert or update or delete on public.desafios
  for each row execute function public.registrar_auditoria();

-- Dias do desafio, contados no fuso America/Fortaleza.
-- dias_decorridos = dias completos antes de hoje dentro do período.
-- dias_restantes = dias que faltam, contando hoje (base do ritmo necessário).
create view public.v_desafios with (security_invoker = true) as
select
  d.*,
  h.hoje,
  (d.fim - d.inicio + 1) as dias_total,
  least(greatest(h.hoje - d.inicio, 0), d.fim - d.inicio + 1) as dias_decorridos,
  (d.fim - d.inicio + 1) - least(greatest(h.hoje - d.inicio, 0), d.fim - d.inicio + 1) as dias_restantes
from public.desafios d
cross join (select (now() at time zone 'America/Fortaleza')::date as hoje) h;

revoke insert, update, delete on public.v_desafios from authenticated;
