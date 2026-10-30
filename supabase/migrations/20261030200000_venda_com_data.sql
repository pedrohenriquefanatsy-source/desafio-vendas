-- Fatia 14: vendas e doações podem ser registradas com a data em que aconteceram (esquecimento do dia).
-- A data vale para o faturamento, a lista de vendas e o resultado do dia; o caixa e o estoque seguem pela hora do registro.
drop function public.registrar_venda(uuid, public.tipo_venda, jsonb, uuid, numeric, numeric, text, text, date, boolean, text, boolean);
create function public.registrar_venda(
  p_chave uuid, p_tipo public.tipo_venda, p_itens jsonb, p_forma uuid default null,
  p_valor_recebido numeric default 0, p_desconto numeric default 0,
  p_cliente text default null, p_observacao text default null,
  p_entrega_prevista date default null, p_confirmar_estoque boolean default false,
  p_bairro text default null, p_cliente_desconhecido boolean default false,
  p_data date default null
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
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_quando timestamptz := now();
  v_inicio date;
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
  if p_data is not null then
    if p_tipo = 'encomenda' then
      raise exception 'A data da venda vale para venda e doação. A encomenda usa a data de entrega.';
    end if;
    if p_data > v_hoje then
      raise exception 'A data da venda não pode ser no futuro.';
    end if;
    select inicio into v_inicio from public.desafios where id = privado.desafio_atual_id();
    if v_inicio is not null and p_data < v_inicio then
      raise exception 'A data da venda não pode ser antes do início do desafio (%).', to_char(v_inicio, 'DD/MM/YYYY');
    end if;
    if p_data < v_hoje then
      v_quando := (p_data::timestamp + (now() at time zone 'America/Fortaleza')::time) at time zone 'America/Fortaleza';
    end if;
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
                             bairro, cliente_desconhecido, data_hora)
  values (privado.desafio_atual_id(), p_tipo, auth.uid(), nullif(btrim(p_cliente), ''), nullif(btrim(p_observacao), ''),
          case when p_tipo = 'doacao' then null else p_forma end, v_taxa,
          v_subtotal, v_desconto, v_total,
          case when p_tipo = 'doacao' then null else privado.situacao_pagamento(v_total, 0) end,
          case when p_tipo = 'encomenda' then 'aguardando'::public.situacao_entrega end, p_entrega_prevista,
          case when v_imediata then v_quando end, v_imediata, jsonb_array_length(v_faltas) > 0, p_chave,
          nullif(btrim(p_bairro), ''), coalesce(p_cliente_desconhecido, false), v_quando)
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
  public.registrar_venda(uuid, public.tipo_venda, jsonb, uuid, numeric, numeric, text, text, date, boolean, text, boolean, date)
  to authenticated;
