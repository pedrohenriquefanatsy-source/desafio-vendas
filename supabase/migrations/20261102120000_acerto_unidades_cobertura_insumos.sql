-- Fatia 20: acerto da pessoa (pegou − sobrou = vendido), potinhos vendidos e quantos dias duram os insumos.

-- ── Potinhos vendidos por dia e sabor (sem doações; kit conta pelos potinhos que o formam) ─────────────────
-- O dia é o mesmo do faturamento: o da venda, ou o do pagamento para encomenda paga por inteiro.
create view public.v_unidades_vendidas with (security_invoker = true) as
with vendas_dia as (
  select v.id, v.desafio_id,
         (case when v.reconhecida_em is not null
               then (case when v.tipo = 'encomenda' and v.total > 0 and v.recebido >= v.total
                          then least(v.reconhecida_em, coalesce((select max(r.recebido_em) from public.recebimentos r where r.venda_id = v.id and r.valor > 0), v.reconhecida_em))
                          else v.reconhecida_em end)
               else coalesce((select max(r.recebido_em) from public.recebimentos r where r.venda_id = v.id and r.valor > 0), v.criado_em) end
            at time zone 'America/Fortaleza')::date as dia
  from public.vendas v
  where v.situacao = 'ativa' and v.tipo <> 'doacao'
    and (v.reconhecida_em is not null or (v.tipo = 'encomenda' and v.total > 0 and v.recebido >= v.total))
),
itens as (
  select d.desafio_id, d.dia, pr.tipo, vi.variacao_id, vi.quantidade
  from vendas_dia d
  join public.venda_itens vi on vi.venda_id = d.id
  join public.variacoes va on va.id = vi.variacao_id
  join public.produtos pr on pr.id = va.produto_id
),
potinhos as (
  select desafio_id, dia, variacao_id, quantidade as unidades from itens where tipo = 'simples'
  union all
  select i.desafio_id, i.dia, k.componente_variacao_id, i.quantidade * k.quantidade
  from itens i join public.kit_componentes k on k.kit_variacao_id = i.variacao_id
  where i.tipo = 'kit'
)
select p.desafio_id, p.dia, p.variacao_id, pr.nome as produto, va.nome as variacao, sum(p.unidades) as unidades
from potinhos p
join public.variacoes va on va.id = p.variacao_id
join public.produtos pr on pr.id = va.produto_id
group by p.desafio_id, p.dia, p.variacao_id, pr.nome, va.nome;
revoke insert, update, delete on public.v_unidades_vendidas from authenticated;

-- ── Quantos dias duram os insumos: consumo médio por dia do desafio (produção e kits vendidos) ────────────
-- Dias do desafio contando hoje. Só com 2 dias ou mais; saldo negativo (faltou lançar compra) fica com 0 dia.
create view public.v_cobertura_insumos with (security_invoker = true) as
with desafio as (
  select id, least(greatest(hoje - inicio + 1, 1), dias_total) as dias from public.v_desafios where situacao = 'em_andamento' limit 1
),
consumo as (
  select m.insumo_id, sum(-m.quantidade_base) as consumido
  from public.movimentos_estoque m
  where m.insumo_id is not null and m.origem_tipo in ('producao', 'venda') and m.desafio_id = (select id from desafio)
  group by m.insumo_id
)
select
  e.insumo_id, e.nome, e.tipo, e.unidade_base, e.saldo,
  coalesce(c.consumido, 0) as consumido,
  (select dias from desafio) as dias_do_desafio,
  case when (select dias from desafio) >= 2 and coalesce(c.consumido, 0) > 0
       then round(c.consumido / (select dias from desafio), 4) end as consumo_dia,
  case when (select dias from desafio) >= 2 and coalesce(c.consumido, 0) > 0
       then round(greatest(e.saldo, 0) / (c.consumido / (select dias from desafio)), 1) end as dias_cobertura
from public.v_estoque_insumos e
left join consumo c on c.insumo_id = e.insumo_id
where e.ativo;
revoke insert, update, delete on public.v_cobertura_insumos from authenticated;

-- ── Acerto da pessoa ─────────────────────────────────────────────────────────
-- A pessoa conta o que sobrou de cada sabor. O que está com ela (no sistema) menos o que sobrou é o que vendeu:
-- vira UMA venda "Acerto: vendas sem registro" (preço de tabela, paga por inteiro, cliente desconhecido).
-- Com p_devolver, o que sobrou volta para o estoque geral. p_itens: [{"variacao_id", "sobrou"}].
create function public.acertar_estoque_pessoa(p_chave uuid, p_itens jsonb, p_forma uuid default null, p_devolver boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_pessoa uuid := auth.uid();
  v_chave_venda uuid;
  v_chave_devolucao uuid;
  v_item jsonb;
  v_var uuid;
  v_sobrou numeric;
  v_saldo numeric;
  v_nome text;
  v_vendidos jsonb := '[]'::jsonb;
  v_sobras jsonb := '[]'::jsonb;
  v_unidades numeric := 0;
  v_venda jsonb;
  v_existente public.vendas;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Preencha quanto sobrou de pelo menos um sabor.';
  end if;
  v_chave_venda := md5(p_chave::text || ':venda')::uuid;
  v_chave_devolucao := md5(p_chave::text || ':devolucao')::uuid;
  select * into v_existente from public.vendas where chave_idempotencia = v_chave_venda;
  if v_existente.id is not null then
    return jsonb_build_object('ok', true, 'repetida', true, 'venda_id', v_existente.id, 'numero', v_existente.numero);
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_var := (v_item ->> 'variacao_id')::uuid;
    v_sobrou := round((v_item ->> 'sobrou')::numeric, 2);
    perform privado.travar_saldo_variacao(v_var);
    v_saldo := privado.saldo_pessoa(v_pessoa, v_var);
    select pr.nome || case when va.nome is null or va.nome = 'Única' then '' else ' · ' || va.nome end into v_nome
      from public.variacoes va join public.produtos pr on pr.id = va.produto_id where va.id = v_var;
    if v_sobrou is null or v_sobrou < 0 then
      raise exception 'Confira quanto sobrou de %: use zero ou mais, como 3.', coalesce(v_nome, 'um sabor');
    end if;
    if v_sobrou > v_saldo then
      raise exception 'Você informou % de %, mas o sistema acha que só tem % com você. Se pegou mais, registre em "Peguei para vender" antes.',
        trim_scale(v_sobrou), v_nome, trim_scale(greatest(v_saldo, 0));
    end if;
    if v_saldo - v_sobrou > 0 then
      v_vendidos := v_vendidos || jsonb_build_object('variacao_id', v_var, 'quantidade', v_saldo - v_sobrou);
      v_unidades := v_unidades + (v_saldo - v_sobrou);
    end if;
    if v_sobrou > 0 then
      v_sobras := v_sobras || jsonb_build_object('variacao_id', v_var, 'quantidade', v_sobrou);
    end if;
  end loop;

  if jsonb_array_length(v_vendidos) > 0 then
    if p_forma is null then
      raise exception 'Escolha a forma de pagamento das vendas sem registro.';
    end if;
    v_venda := public.registrar_venda(
      v_chave_venda, 'venda', v_vendidos, p_forma, null, 0, null, 'Acerto: vendas sem registro', null, true, null, true, null);
  end if;
  if coalesce(p_devolver, false) and jsonb_array_length(v_sobras) > 0 then
    perform public.mover_estoque_pessoa(v_chave_devolucao, 'devolucao', v_sobras, v_pessoa);
  end if;

  return jsonb_build_object(
    'ok', true, 'unidades', v_unidades,
    'venda_id', v_venda ->> 'venda_id', 'numero', v_venda ->> 'numero',
    'devolvido', coalesce(p_devolver, false) and jsonb_array_length(v_sobras) > 0);
end
$$;
grant execute on function public.acertar_estoque_pessoa(uuid, jsonb, uuid, boolean) to authenticated;
