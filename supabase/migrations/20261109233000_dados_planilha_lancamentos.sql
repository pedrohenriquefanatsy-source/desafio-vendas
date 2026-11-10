create or replace function public.dados_planilha()
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
with l as (
  select l.id, l.tipo::text tipo, l.valor, l.origem_tipo, l.origem_id, l.criado_em,
    coalesce(
      case when l.origem_tipo = 'recebimento' then (select (case when abs(extract(epoch from (r.criado_em - v.criado_em))) < 120 then v.data_hora else r.recebido_em end at time zone 'America/Fortaleza')::date from recebimentos r join vendas v on v.id = r.venda_id where r.id = l.origem_id)
           when l.origem_tipo = 'valor_a_mais' then (select (v.data_hora at time zone 'America/Fortaleza')::date from valores_a_mais x join vendas v on v.id = x.venda_id where x.id = l.origem_id)
           when l.origem_tipo = 'compra' then (select c.data from compras c where c.id = l.origem_id)
           when l.origem_tipo = 'despesa' then (select x.data from despesas x where x.id = l.origem_id)
           when l.origem_tipo = 'reembolso' then (select x.data from reembolsos x where x.id = l.origem_id)
           when l.origem_tipo = 'aporte' then (select x.data from aportes x where x.id = l.origem_id)
      end, (l.criado_em at time zone 'America/Fortaleza')::date) as dia
  from lancamentos_caixa l
),
linhas as (
  -- vendas e valores a mais
  select l.id::text id, l.dia, l.criado_em,
    case when l.valor < 0 then 'Cancelamento de venda'
         when l.origem_tipo = 'valor_a_mais' then 'Valor a mais'
         else coalesce((select case when count(distinct p.id) = 1 then
                          case when min(p.nome) ilike 'Promo 2%' then 'Promo 2 por R$ 18'
                               when min(p.nome) ilike 'Promo 3%' then 'Promo 3 por R$ 25'
                               when min(p.nome) ilike '%leite%' then 'Chocobite ao leite'
                               when min(p.nome) ilike '%amargo%' then 'Chocobite meio amargo'
                               when min(p.nome) ilike '%branco%' then 'Chocobite branco'
                               else 'Chocobite misto' end
                        else 'Pedido com mais de um produto' end
                 from recebimentos r join venda_itens vi on vi.venda_id = r.venda_id
                 join variacoes va on va.id = vi.variacao_id join produtos p on p.id = va.produto_id
                 where r.id = l.origem_id), 'Venda') end as item,
    l.valor,
    coalesce((select f.nome from recebimentos r join formas_pagamento f on f.id = r.forma_pagamento_id where r.id = l.origem_id and l.origem_tipo = 'recebimento'),
             (select f.nome from valores_a_mais x join formas_pagamento f on f.id = x.forma_pagamento_id where x.id = l.origem_id and l.origem_tipo = 'valor_a_mais'), 'Pix') as forma
  from l where l.origem_tipo in ('recebimento', 'valor_a_mais')
  union all
  -- compras, separadas por insumo
  select l.id::text || '-' || ci.id::text, l.dia, l.criado_em, i.nome,
    round(l.valor * ci.valor / nullif(sum(ci.valor) over (partition by l.id), 0), 2),
    case when coalesce(c.pago_em_dinheiro, 0) > 0 then 'Dinheiro' else 'Pix' end
  from l join compras c on c.id = l.origem_id join compra_itens ci on ci.compra_id = c.id join insumos i on i.id = ci.insumo_id
  where l.origem_tipo = 'compra' and l.tipo = 'compra'
  union all
  select l.id::text, l.dia, l.criado_em,
    case l.origem_tipo when 'compra' then 'Cancelamento de compra'
                       when 'despesa' then coalesce((select x.descricao from despesas x where x.id = l.origem_id), 'Despesa')
                       when 'reembolso' then 'Reembolso'
                       when 'aporte' then 'Investimento inicial'
                       else 'Ajuste pelo extrato' end,
    l.valor,
    case when l.origem_tipo = 'despesa' and coalesce((select x.valor_em_dinheiro from despesas x where x.id = l.origem_id), 0) > 0 then 'Dinheiro' else 'Pix' end
  from l where not (l.origem_tipo in ('recebimento', 'valor_a_mais') or (l.origem_tipo = 'compra' and l.tipo = 'compra'))
),
vq as (
  select vi.venda_id,
    sum(vi.quantidade * coalesce(kc.quantidade, 1)) filter (where cp.nome ilike '%leite%') ql,
    sum(vi.quantidade * coalesce(kc.quantidade, 1)) filter (where cp.nome ilike '%amargo%') qm,
    sum(vi.quantidade * coalesce(kc.quantidade, 1)) filter (where cp.nome ilike '%branco%') qb,
    count(distinct p.id) np, min(p.nome) pn
  from venda_itens vi join variacoes va on va.id = vi.variacao_id join produtos p on p.id = va.produto_id
  left join kit_componentes kc on kc.kit_variacao_id = vi.variacao_id
  left join variacoes cv on cv.id = coalesce(kc.componente_variacao_id, vi.variacao_id)
  left join produtos cp on cp.id = cv.produto_id
  group by vi.venda_id
),
lan as (
  select 'V' || v.numero id, (v.data_hora at time zone 'America/Fortaleza')::date dia,
    case v.tipo::text when 'encomenda' then 'Encomenda' else 'Venda' end tipo,
    case when vq.np = 1 then case when vq.pn ilike 'Promo 2%' then 'Promo 2 por R$ 18' when vq.pn ilike 'Promo 3%' then 'Promo 3 por R$ 25'
         when vq.pn ilike '%leite%' then 'Chocobite ao leite' when vq.pn ilike '%amargo%' then 'Chocobite meio amargo'
         when vq.pn ilike '%branco%' then 'Chocobite branco' else 'Chocobite misto' end else 'Pedido com mais de um produto' end item,
    '' cat, v.total valor,
    case when v.situacao_pagamento::text = 'paga' then 'ENTRADA' else '—' end mov,
    coalesce((select f.nome from formas_pagamento f where f.id = v.forma_pagamento_id), '') forma,
    coalesce((select split_part(pe.nome, ' ', 1) from perfis pe where pe.id = v.participante_id), '') resp,
    coalesce(vq.ql, 0) ql, coalesce(vq.qm, 0) qm, coalesce(vq.qb, 0) qb,
    coalesce(v.bairro, '') bairro, v.situacao_pagamento::text sit, v.criado_em
  from vendas v left join vq on vq.venda_id = v.id where v.situacao = 'ativa'
  union all
  select 'C-' || left(c.id::text, 8), c.data, 'Compra',
    coalesce((select string_agg(i.nome, ', ' order by i.nome) from compra_itens ci join insumos i on i.id = ci.insumo_id where ci.compra_id = c.id), 'Compra de insumos')
      || coalesce(' · ' || nullif(c.fornecedor, ''), ''),
    'Insumos', c.total, case when c.pago_por::text = 'caixa' then 'SAÍDA' else '—' end,
    case when coalesce(c.pago_em_dinheiro, 0) > 0 then 'Dinheiro' else 'Pix' end,
    coalesce((select split_part(pe.nome, ' ', 1) from perfis pe where pe.id = c.participante_id), ''), 0, 0, 0, '',
    case when c.pago_por::text = 'caixa' then '' else 'reembolsar' end, c.criado_em
  from compras c where c.situacao = 'ativa'
  union all
  select 'D-' || left(x.id::text, 8), x.data, 'Despesa', x.descricao, x.categoria, x.valor,
    case when x.pago_por::text = 'caixa' then 'SAÍDA' else '—' end,
    case when coalesce(x.valor_em_dinheiro, 0) > 0 then 'Dinheiro' else 'Pix' end,
    coalesce((select split_part(pe.nome, ' ', 1) from perfis pe where pe.id = x.participante_id), ''), 0, 0, 0, '',
    case when x.pago_por::text = 'caixa' then '' else 'reembolsar' end, x.criado_em
  from despesas x where x.situacao = 'ativa'
  union all
  select 'A-' || left(x.id::text, 8), x.data, 'Aporte', 'Investimento inicial', '', x.valor, 'ENTRADA', 'Pix', '', 0, 0, 0, '', '', x.criado_em
  from aportes x where x.situacao = 'ativa'
  union all
  select 'R-' || left(x.id::text, 8), x.data, 'Reembolso', 'Reembolso', '', x.valor, 'SAÍDA', 'Pix',
    coalesce((select split_part(pe.nome, ' ', 1) from perfis pe where pe.id = x.participante_id), ''), 0, 0, 0, '', '', x.criado_em
  from reembolsos x where x.situacao = 'ativa'
  union all
  select 'AJ-' || l.id, (l.criado_em at time zone 'America/Fortaleza')::date, 'Ajuste', 'Ajuste pelo extrato', '', abs(l.valor),
    case when l.valor >= 0 then 'ENTRADA' else 'SAÍDA' end, 'Pix', '', 0, 0, 0, '', '', l.criado_em
  from lancamentos_caixa l where l.origem_tipo = 'ajuste'
),
sab as (
  select va.id, va.receita_id,
    case when p.nome ilike '%leite%' then 'Ao leite' when p.nome ilike '%amargo%' then 'Meio amargo' when p.nome ilike '%branco%' then 'Branco' end as sabor
  from variacoes va join produtos p on p.id = va.produto_id where p.tipo = 'simples'
)
select json_build_object(
  'atualizado', to_char(now() at time zone 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'),
  'investimento', (select coalesce(sum(valor), 0) from aportes where situacao = 'ativa'),
  'fluxo', (select coalesce(json_agg(json_build_object('id', id, 'dia', dia, 'item', item, 'valor', valor, 'forma', forma) order by dia, criado_em, id), '[]') from linhas),
  'vendas', (select dados_dashboard() -> 'vendas'),
  'pedidos', (select dados_dashboard() -> 'pedidos_dia'),
  'insumos', (select coalesce(json_agg(json_build_object('nome', nome, 'custo', round(custo_atual, 5), 'unidade', unidade_base) order by nome), '[]') from insumos where ativo),
  'receitas', (select coalesce(json_agg(json_build_object('sabor', s.sabor, 'insumo', it.insumo, 'qtd', it.quantidade_base, 'unidade', it.unidade_base) order by s.sabor, it.insumo), '[]')
               from sab s join v_custo_receita_itens it on it.receita_id = s.receita_id where s.sabor is not null),
  'rendimento', (select coalesce(json_agg(json_build_object('sabor', s.sabor, 'rend', round(r.rendimento_efetivo, 2))), '[]')
               from sab s join v_custo_receitas r on r.receita_id = s.receita_id where s.sabor is not null),
  'lancamentos', (select coalesce(json_agg(json_build_object('id', id, 'dia', dia, 'tipo', tipo, 'item', item, 'cat', cat, 'valor', valor,
                 'mov', mov, 'forma', forma, 'resp', resp, 'q', json_build_array(ql, qm, qb), 'bairro', bairro, 'sit', sit,
                 'em', to_char(criado_em at time zone 'America/Fortaleza', 'YYYY-MM-DD HH24:MI')) order by criado_em desc), '[]') from lan),
  'embalagens', (select coalesce(json_agg(json_build_object('sabor', s.sabor, 'insumo', e.insumo, 'qtd', e.quantidade) order by s.sabor, e.insumo), '[]')
               from sab s join v_custo_embalagens e on e.variacao_id = s.id where s.sabor is not null)
)
$function$;

revoke all on function public.dados_planilha() from public;
grant execute on function public.dados_planilha() to anon, authenticated;
