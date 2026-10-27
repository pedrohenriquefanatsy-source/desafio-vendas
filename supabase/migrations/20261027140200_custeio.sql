-- Fatia 2: custeio variável, sem rateio de custos fixos (Seção 4.1).
-- Custo da receita         = Σ (quantidade do insumo em unidade base × custo atual por unidade base)
-- Custo variável unitário  = custo da receita ÷ rendimento + embalagens por unidade
-- Kit                      = Σ (custo do componente × quantidade) + embalagens do kit
-- MC unitária              = preço − custo variável unitário (− taxa da forma de pagamento)
-- MC %                     = MC unitária ÷ preço;   Markup = preço ÷ custo
-- Se algum insumo está sem preço, o custo fica vazio (nunca um custo menor que o real).

create view public.v_custo_receita_itens with (security_invoker = true) as
select
  ri.id, ri.receita_id, ri.insumo_id, i.nome as insumo, i.tipo, ri.quantidade, ri.unidade,
  i.unidade_base,
  ri.quantidade * privado.fator_unidade(ri.insumo_id, ri.unidade) as quantidade_base,
  i.custo_atual,
  ri.quantidade * privado.fator_unidade(ri.insumo_id, ri.unidade) * i.custo_atual as custo
from public.receita_itens ri
join public.insumos i on i.id = ri.insumo_id;

create view public.v_custo_receitas with (security_invoker = true) as
select
  r.id as receita_id, r.nome, r.rendimento_unidades, r.ativa,
  count(it.id) as itens,
  count(it.id) filter (where it.custo_atual is null) as itens_sem_preco,
  string_agg(it.insumo, ', ' order by it.insumo) filter (where it.custo_atual is null) as insumos_sem_preco,
  case when count(it.id) filter (where it.custo_atual is null) > 0 then null
       else coalesce(sum(it.custo), 0) end as custo_receita,
  case when count(it.id) filter (where it.custo_atual is null) > 0 then null
       else coalesce(sum(it.custo), 0) / r.rendimento_unidades end as custo_por_unidade
from public.receitas r
left join public.v_custo_receita_itens it on it.receita_id = r.id
group by r.id;

create view public.v_custo_embalagens with (security_invoker = true) as
select
  ve.id, ve.variacao_id, ve.insumo_id, i.nome as insumo, ve.quantidade, ve.unidade, i.unidade_base,
  ve.quantidade * privado.fator_unidade(ve.insumo_id, ve.unidade) * i.custo_atual as custo,
  i.custo_atual is null as sem_preco
from public.variacao_embalagens ve
join public.insumos i on i.id = ve.insumo_id;

create view public.v_custo_variacoes with (security_invoker = true) as
with emb as (
  select variacao_id, sum(custo) as custo, bool_or(sem_preco) as sem_preco
  from public.v_custo_embalagens group by variacao_id
),
simples as (
  select
    v.id as variacao_id,
    case when v.receita_id is null then 0 else cr.custo_por_unidade end + coalesce(e.custo, 0) as custo,
    (v.receita_id is not null and cr.custo_por_unidade is null) or coalesce(e.sem_preco, false) as sem_preco
  from public.variacoes v
  join public.produtos p on p.id = v.produto_id and p.tipo = 'simples'
  left join public.v_custo_receitas cr on cr.receita_id = v.receita_id
  left join emb e on e.variacao_id = v.id
),
kits as (
  select k.kit_variacao_id as variacao_id,
         sum(k.quantidade * s.custo) as custo_componentes,
         bool_or(s.sem_preco) as sem_preco,
         count(*) as componentes
  from public.kit_componentes k
  join simples s on s.variacao_id = k.componente_variacao_id
  group by k.kit_variacao_id
),
custos as (
  select
    v.id as variacao_id,
    case when p.tipo = 'simples' then s.custo else coalesce(k.custo_componentes, 0) + coalesce(e.custo, 0) end as custo,
    case when p.tipo = 'simples' then s.sem_preco else coalesce(k.sem_preco, false) or coalesce(e.sem_preco, false) end as sem_preco,
    coalesce(k.componentes, 0) as componentes
  from public.variacoes v
  join public.produtos p on p.id = v.produto_id
  left join simples s on s.variacao_id = v.id
  left join kits k on k.variacao_id = v.id
  left join emb e on e.variacao_id = v.id
)
select
  v.id as variacao_id, v.produto_id, p.nome as produto, v.nome as variacao, p.tipo, p.categoria,
  v.receita_id, v.preco_venda, p.ativo and v.ativa as ativa, v.ordem, p.ordem as ordem_produto,
  c.sem_preco,
  p.tipo = 'simples' and v.receita_id is null as sem_receita,
  p.tipo = 'kit' and c.componentes = 0 as kit_sem_componentes,
  case when c.sem_preco then null else c.custo end as custo_unitario,
  case when c.sem_preco then null else v.preco_venda - c.custo end as mc_unitaria,
  case when c.sem_preco or v.preco_venda = 0 then null else (v.preco_venda - c.custo) / v.preco_venda end as mc_percentual,
  case when c.sem_preco or c.custo = 0 then null else v.preco_venda / c.custo end as markup
from public.variacoes v
join public.produtos p on p.id = v.produto_id
join custos c on c.variacao_id = v.id;

-- MC considerando a taxa de cada forma de pagamento ativa.
create view public.v_margem_formas with (security_invoker = true) as
select
  cv.variacao_id, f.id as forma_pagamento_id, f.nome as forma_pagamento, f.taxa_percentual,
  round(cv.preco_venda * f.taxa_percentual / 100, 6) as taxa_valor,
  cv.mc_unitaria - cv.preco_venda * f.taxa_percentual / 100 as mc_unitaria
from public.v_custo_variacoes cv
cross join public.formas_pagamento f
where f.ativa;

revoke insert, update, delete on public.v_custo_receita_itens, public.v_custo_receitas, public.v_custo_embalagens,
  public.v_custo_variacoes, public.v_margem_formas from authenticated;
