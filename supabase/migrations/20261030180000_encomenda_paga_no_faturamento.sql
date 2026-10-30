create or replace view public.v_resultado_diario with (security_invoker = true) as
with partes as (
  select v.desafio_id, (v.reconhecida_em at time zone 'America/Fortaleza')::date as dia,
         sum(vi.margem_contribuicao) as margem, 0::numeric as perdas, 0::numeric as despesas,
         sum(vi.valor_liquido) filter (where v.tipo <> 'doacao') as vendido,
         count(distinct v.id) filter (where v.tipo <> 'doacao') as vendas,
         sum(vi.quantidade) filter (where v.tipo <> 'doacao') as unidades,
         bool_or(vi.margem_contribuicao is null) as sem_custo
  from public.vendas v join public.venda_itens vi on vi.venda_id = v.id
  where v.situacao = 'ativa' and v.reconhecida_em is not null
  group by 1, 2
  union all
  select v.desafio_id,
         (coalesce((select max(r.recebido_em) from public.recebimentos r where r.venda_id = v.id and r.valor > 0), v.criado_em)
            at time zone 'America/Fortaleza')::date,
         0, 0, 0, sum(vi.valor_liquido), count(distinct v.id), sum(vi.quantidade), false
  from public.vendas v join public.venda_itens vi on vi.venda_id = v.id
  where v.situacao = 'ativa' and v.tipo = 'encomenda' and v.reconhecida_em is null and v.total > 0 and v.recebido >= v.total
  group by 1, 2
  union all
  select m.desafio_id, (m.criado_em at time zone 'America/Fortaleza')::date,
         0, sum(round(-m.quantidade_base * coalesce(m.custo_unitario, 0), 2)), 0, 0, 0, 0, bool_or(m.custo_unitario is null)
  from public.movimentos_estoque m
  where m.tipo = 'perda'
  group by 1, 2
  union all
  select d.desafio_id, d.data, 0, 0, sum(d.valor), 0, 0, 0, false
  from public.despesas d where d.situacao = 'ativa'
  group by 1, 2
)
select
  desafio_id, dia,
  coalesce(sum(margem), 0) as margem_vendas,
  coalesce(sum(perdas), 0) as custo_perdas,
  coalesce(sum(despesas), 0) as despesas,
  coalesce(sum(margem), 0) - coalesce(sum(perdas), 0) - coalesce(sum(despesas), 0) as resultado,
  coalesce(sum(vendido), 0) as vendido,
  coalesce(sum(vendas), 0) as vendas,
  coalesce(sum(unidades), 0) as unidades,
  bool_or(sem_custo) as sem_custo
from partes
group by desafio_id, dia;
