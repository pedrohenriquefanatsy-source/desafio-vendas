-- Fatia 18: valor a mais numa venda (cliente pagou mais do que o produto: gorjeta, troco que ficou).
-- Entra no caixa (com a taxa da forma, se houver), no faturamento e no lucro do dia em que foi registrado.
-- Cancelar a venda devolve no caixa.
create table public.valores_a_mais (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id),
  valor numeric(12, 2) not null check (valor > 0),
  forma_pagamento_id uuid not null references public.formas_pagamento (id),
  taxa_percentual numeric(5, 2) not null default 0,
  taxa_valor numeric(12, 2) not null default 0,
  chave_idempotencia uuid not null unique,
  estornado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index valores_a_mais_venda on public.valores_a_mais (venda_id);
alter table public.valores_a_mais enable row level security;
create policy valores_a_mais_leitura on public.valores_a_mais for select to authenticated using (privado.eh_participante());
grant select on public.valores_a_mais to authenticated;
revoke insert, update, delete, truncate on public.valores_a_mais from authenticated;

create function public.registrar_valor_a_mais(p_chave uuid, p_venda uuid, p_valor numeric, p_forma uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vendas;
  f public.formas_pagamento;
  v_valor numeric := round(p_valor, 2);
  v_taxa numeric;
  v_id uuid;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  if exists (select 1 from public.valores_a_mais where chave_idempotencia = p_chave) then
    return;
  end if;
  select * into v from public.vendas where id = p_venda for update;
  if v.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  if v.situacao = 'cancelada' then
    raise exception 'Esta venda foi cancelada.';
  end if;
  if v.tipo = 'doacao' then
    raise exception 'Doação não tem pagamento.';
  end if;
  if v_valor is null or v_valor <= 0 or v_valor > 10000 then
    raise exception 'Informe o valor a mais, como 2,00.';
  end if;
  select * into f from public.formas_pagamento where id = p_forma and ativa;
  if f.id is null then
    raise exception 'Escolha a forma de pagamento.';
  end if;
  v_taxa := round(v_valor * f.taxa_percentual / 100, 2);
  insert into public.valores_a_mais (venda_id, valor, forma_pagamento_id, taxa_percentual, taxa_valor, chave_idempotencia, criado_por)
  values (v.id, v_valor, f.id, f.taxa_percentual, v_taxa, p_chave, auth.uid())
  returning id into v_id;
  insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
  values (v.desafio_id, 'recebimento', v_valor, 'Valor a mais · venda nº ' || v.numero || ' · ' || f.nome, 'valor_a_mais', v_id, auth.uid());
  if v_taxa > 0 then
    insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
    values (v.desafio_id, 'taxa', -v_taxa, 'Taxa ' || f.nome || ' · valor a mais da venda nº ' || v.numero, 'valor_a_mais', v_id, auth.uid());
  end if;
end
$$;
grant execute on function public.registrar_valor_a_mais(uuid, uuid, numeric, uuid) to authenticated;

-- Cancelar a venda devolve no caixa o valor a mais (e a taxa).
create function privado.estornar_valor_a_mais()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  x record;
  l record;
begin
  for x in select * from public.valores_a_mais where venda_id = new.id and estornado_em is null loop
    for l in select * from public.lancamentos_caixa where origem_tipo = 'valor_a_mais' and origem_id = x.id loop
      insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
      values (l.desafio_id, 'estorno', -l.valor, 'Cancelamento da venda nº ' || new.numero || ': valor a mais', 'valor_a_mais', x.id, auth.uid());
    end loop;
    update public.valores_a_mais set estornado_em = now() where id = x.id;
  end loop;
  return null;
end
$$;
create trigger vendas_estornar_valor_a_mais after update of situacao on public.vendas
  for each row when (old.situacao = 'ativa' and new.situacao = 'cancelada')
  execute function privado.estornar_valor_a_mais();

create or replace view public.v_resultado_diario with (security_invoker = true) as
with vendas_dia as (
  select v.*,
         (case when v.tipo = 'encomenda' and v.total > 0 and v.recebido >= v.total
               then least(v.reconhecida_em,
                          coalesce((select max(r.recebido_em) from public.recebimentos r where r.venda_id = v.id and r.valor > 0), v.reconhecida_em))
               else v.reconhecida_em end at time zone 'America/Fortaleza')::date as dia_faturamento
  from public.vendas v
  where v.situacao = 'ativa' and v.reconhecida_em is not null
),
partes as (
  select v.desafio_id, v.dia_faturamento as dia,
         sum(vi.margem_contribuicao) as margem, 0::numeric as perdas, 0::numeric as despesas,
         sum(vi.valor_liquido) filter (where v.tipo <> 'doacao') as vendido,
         count(distinct v.id) filter (where v.tipo <> 'doacao') as vendas,
         sum(vi.quantidade) filter (where v.tipo <> 'doacao') as unidades,
         bool_or(vi.margem_contribuicao is null) as sem_custo
  from vendas_dia v join public.venda_itens vi on vi.venda_id = v.id
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
  select v.desafio_id, (x.criado_em at time zone 'America/Fortaleza')::date,
         sum(x.valor - x.taxa_valor), 0, 0, sum(x.valor), 0, 0, false
  from public.valores_a_mais x join public.vendas v on v.id = x.venda_id
  where x.estornado_em is null and v.situacao = 'ativa'
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

create or replace view public.v_vendas with (security_invoker = true) as
select
  v.id, v.numero, v.desafio_id, v.data_hora, (v.data_hora at time zone 'America/Fortaleza')::date as dia,
  v.tipo, v.participante_id, pe.nome as participante, v.cliente, v.observacao,
  v.forma_pagamento_id, f.nome as forma_pagamento, v.taxa_percentual,
  v.subtotal, v.desconto, v.total, v.recebido,
  case when v.situacao = 'ativa' and v.tipo <> 'doacao' then v.total - v.recebido else 0 end as a_receber,
  v.situacao_pagamento, v.situacao_entrega, v.entrega_prevista, v.entregue_em, v.reconhecida_em,
  v.estoque_negativo_confirmado, v.situacao, v.cancelado_em, v.cancelado_por, v.motivo_cancelamento,
  v.criado_por, v.criado_em,
  it.resumo as itens_resumo, it.variacoes, it.margem as margem_total, it.sem_custo,
  v.bairro, v.cliente_desconhecido,
  coalesce((select sum(x.valor) from public.valores_a_mais x where x.venda_id = v.id and x.estornado_em is null), 0) as valor_a_mais
from public.vendas v
left join public.perfis pe on pe.id = v.participante_id
left join public.formas_pagamento f on f.id = v.forma_pagamento_id
left join lateral (
  select
    string_agg(trim_scale(vi.quantidade)::text || '× ' || privado.nome_variacao(vi.variacao_id), ', ' order by vi.ordem) as resumo,
    array_agg(distinct vi.variacao_id) as variacoes,
    sum(vi.margem_contribuicao) as margem,
    v.reconhecida_em is not null and bool_or(vi.custo_unitario_momento is null) as sem_custo
  from public.venda_itens vi where vi.venda_id = v.id
) it on true;
revoke insert, update, delete on public.v_vendas from authenticated;
