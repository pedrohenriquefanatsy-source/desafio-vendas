-- Fatia 10: cliente, bairro e "cliente desconhecido" nas vendas (para ver quem mais compra e de onde),
-- rankings de clientes e bairros, e receita montada de uma vez (ingredientes primeiro, rendimento no fim).

alter table public.vendas
  add column bairro text check (bairro is null or char_length(btrim(bairro)) between 2 and 60),
  add column cliente_desconhecido boolean not null default false,
  add constraint vendas_cliente_ou_desconhecido check (not (cliente_desconhecido and cliente is not null));

-- A função ganha dois parâmetros no fim (bairro e cliente desconhecido); quem chama como antes continua funcionando.
-- Cliente desconhecido não tem nome e não pode ficar devendo (venda pendente, parcial ou encomenda pede o nome).
drop function public.registrar_venda(uuid, public.tipo_venda, jsonb, uuid, numeric, numeric, text, text, date, boolean);
create function public.registrar_venda(
  p_chave uuid, p_tipo public.tipo_venda, p_itens jsonb, p_forma uuid default null,
  p_valor_recebido numeric default 0, p_desconto numeric default 0,
  p_cliente text default null, p_observacao text default null,
  p_entrega_prevista date default null, p_confirmar_estoque boolean default false,
  p_bairro text default null, p_cliente_desconhecido boolean default false
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_existente public.vendas;
  v_id uuid;
  v_numero bigint;
  v_taxa numeric := 0;
  v_itens jsonb := '[]'::jsonb;
  v_item jsonb;
  v_var record;
  v_qtd numeric;
  v_preco numeric;
  v_subtotal numeric := 0;
  v_desconto numeric := round(coalesce(p_desconto, 0), 2);
  v_total numeric;
  v_recebido numeric;
  v_faltas jsonb := '[]'::jsonb;
  v_rateado numeric := 0;
  v_desc_item numeric;
  v_n int := 0;
  v_qtd_itens int;
  v_imediata boolean := p_tipo <> 'encomenda';
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar vendas.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  select * into v_existente from public.vendas where chave_idempotencia = p_chave;
  if v_existente.id is not null then
    return jsonb_build_object('ok', true, 'venda_id', v_existente.id, 'numero', v_existente.numero, 'repetida', true);
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha pelo menos um produto.';
  end if;

  if p_tipo = 'doacao' then
    if v_desconto <> 0 or coalesce(p_valor_recebido, 0) <> 0 then
      raise exception 'Doação não tem desconto nem pagamento.';
    end if;
  else
    select taxa_percentual into v_taxa from public.formas_pagamento where id = p_forma and ativa;
    if not found then
      raise exception 'Escolha a forma de pagamento.';
    end if;
  end if;
  if p_tipo = 'encomenda' and p_entrega_prevista is null then
    raise exception 'Informe a data de entrega da encomenda.';
  end if;
  if p_tipo = 'encomenda' and p_entrega_prevista < (now() at time zone 'America/Fortaleza')::date then
    raise exception 'A data de entrega não pode ser no passado.';
  end if;
  if p_bairro is not null and nullif(btrim(p_bairro), '') is not null and char_length(btrim(p_bairro)) not between 2 and 60 then
    raise exception 'O bairro precisa ter de 2 a 60 letras.';
  end if;
  if coalesce(p_cliente_desconhecido, false) and nullif(btrim(p_cliente), '') is not null then
    raise exception 'Cliente desconhecido não tem nome. Escolha um ou outro.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select v.id, v.preco_venda into v_var
      from public.variacoes v join public.produtos p on p.id = v.produto_id
     where v.id = (v_item ->> 'variacao_id')::uuid and v.ativa and p.ativo;
    if v_var.id is null then
      raise exception 'Produto não encontrado ou desativado. Atualize a página.';
    end if;
    v_qtd := (v_item ->> 'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_qtd > 1000 then
      raise exception 'A quantidade de cada produto precisa ser maior que zero.';
    end if;
    v_preco := case when p_tipo = 'doacao' then 0 else round(coalesce((v_item ->> 'preco_unitario')::numeric, v_var.preco_venda), 2) end;
    if v_preco < 0 then
      raise exception 'O preço não pode ser negativo.';
    end if;
    v_itens := v_itens || jsonb_build_object('variacao_id', v_var.id, 'quantidade', v_qtd, 'preco', v_preco, 'bruto', round(v_qtd * v_preco, 2));
    v_subtotal := v_subtotal + round(v_qtd * v_preco, 2);
  end loop;
  if v_desconto < 0 or v_desconto > v_subtotal then
    raise exception 'O desconto precisa ficar entre zero e o valor dos produtos (%).', v_subtotal;
  end if;
  v_total := v_subtotal - v_desconto;
  v_recebido := coalesce(round(p_valor_recebido, 2), v_total);
  if v_recebido < 0 or v_recebido > v_total then
    raise exception 'O valor recebido precisa ficar entre zero e o total da venda (%).', v_total;
  end if;
  if p_tipo <> 'doacao' and v_recebido < v_total and coalesce(p_cliente_desconhecido, false) then
    raise exception 'Venda pendente, parcial ou encomenda precisa do nome do cliente, para saber de quem cobrar.';
  end if;

  if v_imediata then
    v_faltas := privado.conferir_estoque_venda(v_itens);
    if jsonb_array_length(v_faltas) > 0 and not coalesce(p_confirmar_estoque, false) then
      return jsonb_build_object('ok', false, 'faltas', v_faltas);
    end if;
  end if;

  insert into public.vendas (desafio_id, tipo, participante_id, cliente, observacao, forma_pagamento_id, taxa_percentual,
                             subtotal, desconto, total, situacao_pagamento, situacao_entrega, entrega_prevista,
                             reconhecida_em, estoque_baixado, estoque_negativo_confirmado, chave_idempotencia,
                             bairro, cliente_desconhecido)
  values (privado.desafio_atual_id(), p_tipo, auth.uid(), nullif(btrim(p_cliente), ''), nullif(btrim(p_observacao), ''),
          case when p_tipo = 'doacao' then null else p_forma end, v_taxa,
          v_subtotal, v_desconto, v_total,
          case when p_tipo = 'doacao' then null else privado.situacao_pagamento(v_total, 0) end,
          case when p_tipo = 'encomenda' then 'aguardando'::public.situacao_entrega end, p_entrega_prevista,
          case when v_imediata then now() end, v_imediata, jsonb_array_length(v_faltas) > 0, p_chave,
          nullif(btrim(p_bairro), ''), coalesce(p_cliente_desconhecido, false))
  returning id, numero into v_id, v_numero;

  v_qtd_itens := jsonb_array_length(v_itens);
  for v_item in select * from jsonb_array_elements(v_itens) loop
    v_n := v_n + 1;
    v_desc_item := case when v_n = v_qtd_itens then v_desconto - v_rateado
                        when v_subtotal = 0 then 0
                        else round(v_desconto * (v_item ->> 'bruto')::numeric / v_subtotal, 2) end;
    v_rateado := v_rateado + v_desc_item;
    insert into public.venda_itens (venda_id, ordem, variacao_id, quantidade, preco_unitario, valor_bruto, desconto_rateado, valor_liquido, taxa_rateada)
    values (v_id, v_n, (v_item ->> 'variacao_id')::uuid, (v_item ->> 'quantidade')::numeric, (v_item ->> 'preco')::numeric,
            (v_item ->> 'bruto')::numeric, v_desc_item, (v_item ->> 'bruto')::numeric - v_desc_item,
            round(((v_item ->> 'bruto')::numeric - v_desc_item) * v_taxa / 100, 2));
  end loop;

  if v_imediata then
    perform privado.baixar_estoque_venda(v_itens, case when p_tipo = 'doacao' then 'doacao' else 'venda' end::public.tipo_movimento, v_id);
    perform privado.congelar_custos_venda(v_id);
  end if;
  if v_recebido > 0 then
    perform privado.receber(v_id, v_recebido, p_forma, null);
  end if;

  return jsonb_build_object(
    'ok', true, 'venda_id', v_id, 'numero', v_numero,
    'estoque_negativo', jsonb_array_length(v_faltas) > 0,
    'sem_custo', (select coalesce(jsonb_agg(privado.nome_variacao(variacao_id)), '[]'::jsonb)
                    from public.venda_itens where venda_id = v_id and v_imediata and custo_unitario_momento is null));
end
$$;

grant execute on function
  public.registrar_venda(uuid, public.tipo_venda, jsonb, uuid, numeric, numeric, text, text, date, boolean, text, boolean)
  to authenticated;

-- A lista de vendas passa a trazer bairro e cliente desconhecido (colunas novas no fim da view).
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
  v.bairro, v.cliente_desconhecido
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

-- Ranking de clientes: só venda e encomenda entregue, sem cancelada e sem doação; "Maria" e "maria" são a mesma pessoa.
create view public.v_clientes with (security_invoker = true) as
select
  lower(btrim(v.cliente)) as chave,
  (array_agg(v.cliente order by v.data_hora desc))[1] as cliente,
  (array_agg(v.bairro order by v.data_hora desc) filter (where v.bairro is not null))[1] as bairro,
  count(*) as compras,
  sum(v.total) as total,
  max(v.data_hora) as ultima_compra
from public.vendas v
where v.situacao = 'ativa' and v.tipo <> 'doacao' and v.reconhecida_em is not null
  and v.cliente is not null and not v.cliente_desconhecido
group by lower(btrim(v.cliente));

-- Ranking de bairros: inclui as vendas a clientes desconhecidos quando o bairro foi informado.
create view public.v_bairros with (security_invoker = true) as
select
  lower(btrim(v.bairro)) as chave,
  (array_agg(v.bairro order by v.data_hora desc))[1] as bairro,
  count(*) as vendas,
  sum(v.total) as total,
  count(distinct lower(btrim(v.cliente))) as clientes_conhecidos,
  count(*) filter (where v.cliente_desconhecido) as vendas_desconhecidos
from public.vendas v
where v.situacao = 'ativa' and v.tipo <> 'doacao' and v.reconhecida_em is not null and v.bairro is not null
group by lower(btrim(v.bairro));
revoke insert, update, delete on public.v_clientes, public.v_bairros from authenticated;

-- Receita montada de uma vez: o administrador lista os ingredientes (e vê o custo) e só no fim diz
-- quantas unidades a fornada rende. Tudo numa transação: se um ingrediente falhar, nada é criado.
create function public.cadastrar_receita_variacao(p_variacao uuid, p_rendimento numeric, p_itens jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_receita uuid;
  v_item jsonb;
  v_insumo uuid;
  v_qtd numeric;
  v_unidade text;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cadastra receitas.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um ingrediente à receita.';
  end if;
  v_receita := public.criar_receita_variacao(p_variacao, p_rendimento);
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_insumo := (v_item ->> 'insumo_id')::uuid;
    v_qtd := (v_item ->> 'quantidade')::numeric;
    v_unidade := v_item ->> 'unidade';
    if v_insumo is null or not exists (select 1 from public.insumos where id = v_insumo and ativo) then
      raise exception 'Insumo não encontrado ou desativado.';
    end if;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'A quantidade de cada ingrediente precisa ser maior que zero.';
    end if;
    if exists (select 1 from public.receita_itens where receita_id = v_receita and insumo_id = v_insumo) then
      raise exception 'O mesmo insumo aparece duas vezes na receita. Some as quantidades numa linha só.';
    end if;
    insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade) values (v_receita, v_insumo, v_qtd, v_unidade);
  end loop;
  return v_receita;
end
$$;
grant execute on function public.cadastrar_receita_variacao(uuid, numeric, jsonb) to authenticated;
