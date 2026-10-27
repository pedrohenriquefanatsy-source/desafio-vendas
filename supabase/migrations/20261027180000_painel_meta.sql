-- Fatia 6: painel da meta, projeção e cobertura de estoque (Seções 4.4 e 4.6).
-- Tudo calculado no banco, em views de leitura. Realizado, projeção e estimativa vêm
-- separados para a tela rotular cada um.

-- Demanda estimada por produto, informada pelo administrador. Usada na cobertura de
-- estoque enquanto o desafio tem menos de 2 dias com venda (sempre rotulada "estimativa").
create table public.demanda_estimada (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid not null references public.desafios (id),
  variacao_id uuid not null references public.variacoes (id),
  unidades_por_dia numeric(10, 2) not null check (unidades_por_dia > 0),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  unique (desafio_id, variacao_id)
);
create index demanda_estimada_variacao on public.demanda_estimada (variacao_id);

alter table public.demanda_estimada enable row level security;
create policy demanda_estimada_leitura on public.demanda_estimada for select to authenticated using (privado.eh_participante());
create policy demanda_estimada_inclusao on public.demanda_estimada for insert to authenticated with check (privado.eh_admin());
create policy demanda_estimada_alteracao on public.demanda_estimada for update to authenticated using (privado.eh_admin()) with check (privado.eh_admin());
create policy demanda_estimada_exclusao on public.demanda_estimada for delete to authenticated using (privado.eh_admin());
revoke update on public.demanda_estimada from authenticated;
grant update (unidades_por_dia) on public.demanda_estimada to authenticated;
create trigger demanda_estimada_registro before insert or update on public.demanda_estimada
  for each row execute function privado.preencher_registro();
create trigger demanda_estimada_auditoria after insert or update or delete on public.demanda_estimada
  for each row execute function privado.registrar_auditoria();

-- ── Painel da meta ───────────────────────────────────────────────────────────
-- Realizado = resultado acumulado do desafio (v_resultado_diario).
-- Ritmo necessário por dia = (meta − realizado) ÷ dias restantes, contando hoje.
-- Projeção de unidades = (meta − realizado) ÷ MC média por unidade vendida até agora (mix real).
create view public.v_painel_meta with (security_invoker = true) as
with r as (
  select desafio_id,
         sum(resultado) as realizado, sum(margem_vendas) as margem, sum(custo_perdas) as perdas, sum(despesas) as despesas,
         sum(vendido) as vendido, sum(vendas) as vendas, count(*) filter (where vendas > 0) as dias_com_venda,
         bool_or(sem_custo) as sem_custo
  from public.v_resultado_diario group by desafio_id
),
mix as (
  -- Só vendas (não doações): margem e unidades, para a MC média por unidade.
  select v.desafio_id, sum(vi.margem_contribuicao) as margem, sum(vi.quantidade) as unidades
  from public.vendas v join public.venda_itens vi on vi.venda_id = v.id
  where v.situacao = 'ativa' and v.reconhecida_em is not null and v.tipo <> 'doacao' and vi.margem_contribuicao is not null
  group by v.desafio_id
)
select
  d.id as desafio_id, d.nome, d.inicio, d.fim, d.situacao, d.hoje, d.dias_total, d.dias_decorridos, d.dias_restantes,
  d.meta_resultado, d.meta_vendas,
  coalesce(r.realizado, 0) as realizado,
  coalesce(r.margem, 0) as margem, coalesce(r.perdas, 0) as perdas, coalesce(r.despesas, 0) as despesas,
  coalesce(r.vendido, 0) as vendido, coalesce(r.vendas, 0) as vendas, coalesce(r.dias_com_venda, 0) as dias_com_venda,
  coalesce(r.sem_custo, false) as sem_custo,
  case when d.meta_resultado > 0 then round(coalesce(r.realizado, 0) / d.meta_resultado * 100, 1) end as percentual,
  case when d.meta_resultado is not null then greatest(d.meta_resultado - coalesce(r.realizado, 0), 0) end as falta,
  case when d.meta_resultado is not null and d.dias_restantes > 0
       then round(greatest(d.meta_resultado - coalesce(r.realizado, 0), 0) / d.dias_restantes, 2) end as ritmo_necessario,
  -- Média por dia até agora, contando hoje (o realizado já inclui as vendas de hoje).
  case when d.hoje >= d.inicio
       then round(coalesce(r.realizado, 0) / least(d.hoje - d.inicio + 1, d.dias_total), 2) end as media_por_dia,
  case when coalesce(m.unidades, 0) > 0 then round(m.margem / m.unidades, 4) end as mc_media_unidade,
  coalesce(m.unidades, 0) as unidades_vendidas,
  case when d.meta_resultado is not null and coalesce(m.unidades, 0) > 0 and m.margem > 0
       then ceil(greatest(d.meta_resultado - coalesce(r.realizado, 0), 0) / (m.margem / m.unidades)) end as unidades_para_meta,
  case when d.meta_vendas > 0 then round(coalesce(r.vendido, 0) / d.meta_vendas * 100, 1) end as percentual_vendas
from public.v_desafios d
left join r on r.desafio_id = d.id
left join mix m on m.desafio_id = d.id;

-- ── Cobertura de estoque ─────────────────────────────────────────────────────
-- Dias que o estoque de cada produto pronto atende. Demanda = média de unidades por dia
-- com venda no desafio (vendas, doações e componentes de kits), quando há 2 dias ou mais
-- com venda; antes disso, a demanda estimada pelo administrador (rotulada "estimativa").
create view public.v_cobertura_estoque with (security_invoker = true) as
with desafio as (
  select id from public.desafios where situacao = 'em_andamento' limit 1
),
saidas as (
  select m.variacao_id, (m.criado_em at time zone 'America/Fortaleza')::date as dia, sum(-m.quantidade_base) as unidades
  from public.movimentos_estoque m
  where m.variacao_id is not null and m.tipo in ('venda', 'doacao') and m.desafio_id = (select id from desafio)
  group by 1, 2
),
dias as (
  select count(distinct dia) as n from saidas
),
media as (
  select variacao_id, sum(unidades) / nullif((select n from dias), 0) as por_dia from saidas group by variacao_id
)
select
  e.variacao_id, e.produto, e.variacao, e.saldo,
  case when (select n from dias) >= 2 then coalesce(me.por_dia, 0) else de.unidades_por_dia end as demanda_dia,
  case when (select n from dias) >= 2 then 'media' when de.unidades_por_dia is not null then 'estimativa' end as fonte,
  (select n from dias) as dias_com_venda,
  case
    when (select n from dias) >= 2 and coalesce(me.por_dia, 0) > 0 then round(greatest(e.saldo, 0) / me.por_dia, 1)
    when (select n from dias) < 2 and de.unidades_por_dia > 0 then round(greatest(e.saldo, 0) / de.unidades_por_dia, 1)
  end as dias_cobertura
from public.v_estoque_produtos e
left join media me on me.variacao_id = e.variacao_id
left join public.demanda_estimada de on de.variacao_id = e.variacao_id and de.desafio_id = (select id from desafio)
where e.ativa;

revoke insert, update, delete on public.v_painel_meta, public.v_cobertura_estoque from authenticated;
