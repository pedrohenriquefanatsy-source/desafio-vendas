-- Fatia 4: vendas, recebimentos, encomendas, doações e cancelamento (Seção 4.2).
-- Cada operação é uma função do banco, numa transação só: calcula preços, rateia o
-- desconto, congela custo, taxa e margem por item, baixa o estoque com trava de linha
-- (kit → componentes) e grava recebimento e caixa. O navegador não calcula nada definitivo.

create type public.tipo_venda as enum ('venda', 'encomenda', 'doacao');
create type public.situacao_pagamento as enum ('paga', 'parcial', 'pendente');
create type public.situacao_entrega as enum ('aguardando', 'pronta', 'entregue');

create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  desafio_id uuid references public.desafios (id),
  data_hora timestamptz not null default now(),
  tipo public.tipo_venda not null,
  participante_id uuid not null references public.perfis (id),
  cliente text check (cliente is null or char_length(cliente) <= 60),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  forma_pagamento_id uuid references public.formas_pagamento (id),
  taxa_percentual numeric(5, 2) not null default 0,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  desconto numeric(12, 2) not null default 0 check (desconto >= 0),
  total numeric(12, 2) not null check (total >= 0),
  recebido numeric(12, 2) not null default 0,
  situacao_pagamento public.situacao_pagamento,
  situacao_entrega public.situacao_entrega,
  entrega_prevista date,
  entregue_em timestamptz,
  -- Quando a venda entra no resultado: venda e doação na hora; encomenda na entrega (D7).
  reconhecida_em timestamptz,
  estoque_baixado boolean not null default false,
  estoque_negativo_confirmado boolean not null default false,
  situacao public.situacao_registro not null default 'ativa',
  chave_idempotencia uuid not null unique,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  check (total = subtotal - desconto),
  check (tipo = 'doacao' or forma_pagamento_id is not null),
  check (tipo <> 'doacao' or (total = 0 and recebido = 0))
);
create index vendas_desafio on public.vendas (desafio_id, data_hora desc);
create index vendas_participante on public.vendas (participante_id);
create index vendas_forma on public.vendas (forma_pagamento_id);

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id),
  ordem smallint not null default 0, -- ordem em que os produtos foram escolhidos
  variacao_id uuid not null references public.variacoes (id),
  quantidade numeric(10, 2) not null check (quantidade > 0),
  preco_unitario numeric(12, 2) not null check (preco_unitario >= 0),
  valor_bruto numeric(12, 2) not null,
  desconto_rateado numeric(12, 2) not null default 0,
  valor_liquido numeric(12, 2) not null,
  taxa_rateada numeric(12, 2) not null default 0,
  -- Congelados quando a venda é reconhecida. Mudança de preço depois não reescreve.
  custo_unitario_momento numeric(14, 6),
  margem_contribuicao numeric(12, 2)
);
create index venda_itens_venda on public.venda_itens (venda_id);
create index venda_itens_variacao on public.venda_itens (variacao_id);

create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id),
  valor numeric(12, 2) not null check (valor <> 0),
  forma_pagamento_id uuid not null references public.formas_pagamento (id),
  taxa_percentual numeric(5, 2) not null default 0,
  taxa_valor numeric(12, 2) not null default 0,
  recebido_em timestamptz not null default now(),
  estorno_de uuid references public.recebimentos (id),
  chave_idempotencia uuid unique,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index recebimentos_venda on public.recebimentos (venda_id);
create index recebimentos_forma on public.recebimentos (forma_pagamento_id);
create index recebimentos_estorno on public.recebimentos (estorno_de);

-- ── Funções internas ─────────────────────────────────────────────────────────

create function privado.nome_variacao(p_variacao uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case when v.nome = 'Única' then p.nome else p.nome || ' · ' || v.nome end
  from public.variacoes v join public.produtos p on p.id = v.produto_id where v.id = p_variacao
$$;

-- O que sai do estoque para estes itens: produto simples sai ele mesmo; kit sai pelos
-- componentes e pelas embalagens próprias do kit (D10). p_itens: [{variacao_id, quantidade}].
create function privado.necessidade_venda(p_itens jsonb)
returns table (insumo_id uuid, variacao_id uuid, quantidade numeric)
language sql stable security definer set search_path = ''
as $$
  with it as (
    select (e ->> 'variacao_id')::uuid as variacao_id, (e ->> 'quantidade')::numeric as qtd, p.tipo
    from jsonb_array_elements(p_itens) e
    join public.variacoes v on v.id = (e ->> 'variacao_id')::uuid
    join public.produtos p on p.id = v.produto_id
  ),
  x as (
    select null::uuid as insumo_id, it.variacao_id, it.qtd as q from it where it.tipo = 'simples'
    union all
    select null::uuid, k.componente_variacao_id, it.qtd * k.quantidade
      from it join public.kit_componentes k on k.kit_variacao_id = it.variacao_id where it.tipo = 'kit'
    union all
    select ve.insumo_id, null::uuid, it.qtd * ve.quantidade * privado.fator_unidade(ve.insumo_id, ve.unidade)
      from it join public.variacao_embalagens ve on ve.variacao_id = it.variacao_id where it.tipo = 'kit'
  )
  select x.insumo_id, x.variacao_id, round(sum(x.q), 4) from x group by x.insumo_id, x.variacao_id
$$;

-- Trava os itens (insumos primeiro, depois produtos, sempre na mesma ordem que a produção
-- usa) e devolve o que falta. Não grava nada.
create function privado.conferir_estoque_venda(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  n record;
  v_saldo numeric;
  v_faltas jsonb := '[]'::jsonb;
begin
  for n in select * from privado.necessidade_venda(p_itens) order by insumo_id nulls last, variacao_id loop
    if n.insumo_id is not null then
      v_saldo := privado.travar_saldo_insumo(n.insumo_id);
    else
      v_saldo := privado.travar_saldo_variacao(n.variacao_id);
    end if;
    if v_saldo < n.quantidade then
      v_faltas := v_faltas || jsonb_build_object(
        'item', coalesce((select nome from public.insumos where id = n.insumo_id), privado.nome_variacao(n.variacao_id)),
        'unidade', coalesce((select unidade_base from public.insumos where id = n.insumo_id), 'und'),
        'necessario', n.quantidade, 'disponivel', v_saldo);
    end if;
  end loop;
  return v_faltas;
end
$$;

create function privado.baixar_estoque_venda(p_itens jsonb, p_tipo public.tipo_movimento, p_venda uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  n record;
begin
  for n in select * from privado.necessidade_venda(p_itens) order by insumo_id nulls last, variacao_id loop
    perform privado.movimentar(
      n.insumo_id, n.variacao_id, p_tipo, -n.quantidade,
      case when n.insumo_id is not null then (select custo_atual from public.insumos where id = n.insumo_id)
           else (select custo_unitario from public.v_custo_variacoes where variacao_id = n.variacao_id) end,
      'venda', p_venda, null);
  end loop;
end
$$;

-- Congela custo e margem de cada item com o custo atual (momento em que a venda é reconhecida).
-- MC = valor líquido − custo × quantidade − taxa rateada. Sem custo cadastrado, fica em branco.
create function privado.congelar_custos_venda(p_venda uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.venda_itens vi
     set custo_unitario_momento = cv.custo_unitario,
         margem_contribuicao = round(vi.valor_liquido - cv.custo_unitario * vi.quantidade - vi.taxa_rateada, 2)
    from public.v_custo_variacoes cv
   where vi.venda_id = p_venda and cv.variacao_id = vi.variacao_id
$$;

create function privado.itens_da_venda(p_venda uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('variacao_id', variacao_id, 'quantidade', quantidade)), '[]'::jsonb)
  from public.venda_itens where venda_id = p_venda
$$;

create function privado.situacao_pagamento(p_total numeric, p_recebido numeric)
returns public.situacao_pagamento
language sql immutable set search_path = ''
as $$
  select case when p_recebido >= p_total then 'paga'::public.situacao_pagamento
              when p_recebido > 0 then 'parcial'::public.situacao_pagamento
              else 'pendente'::public.situacao_pagamento end
$$;

-- Recebimento: registro próprio + entrada no caixa (e a taxa da forma, se houver, como saída).
create function privado.receber(p_venda uuid, p_valor numeric, p_forma uuid, p_chave uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vendas;
  f public.formas_pagamento;
  v_rec uuid;
  v_taxa numeric;
begin
  select * into v from public.vendas where id = p_venda;
  select * into f from public.formas_pagamento where id = p_forma;
  v_taxa := round(p_valor * f.taxa_percentual / 100, 2);
  insert into public.recebimentos (venda_id, valor, forma_pagamento_id, taxa_percentual, taxa_valor, chave_idempotencia, criado_por)
  values (p_venda, p_valor, p_forma, f.taxa_percentual, v_taxa, p_chave, auth.uid())
  returning id into v_rec;
  insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
  values (v.desafio_id, 'recebimento', p_valor, 'Venda nº ' || v.numero || ' · ' || f.nome, 'recebimento', v_rec, auth.uid());
  if v_taxa > 0 then
    insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
    values (v.desafio_id, 'taxa', -v_taxa, 'Taxa ' || f.nome || ' · venda nº ' || v.numero, 'recebimento', v_rec, auth.uid());
  end if;
  update public.vendas
     set recebido = recebido + p_valor, situacao_pagamento = privado.situacao_pagamento(total, recebido + p_valor)
   where id = p_venda;
end
$$;

-- ── Registrar venda, encomenda ou doação ─────────────────────────────────────
-- p_itens: [{"variacao_id": "...", "quantidade": 2, "preco_unitario": 6.50 (opcional)}]
-- p_valor_recebido: quanto foi pago agora (0 = pendente; nulo = paga, o total calculado aqui).
-- Falta de produto pronto (venda/doação): devolve {"ok": false, "faltas": [...]} sem gravar;
-- a tela pergunta e reenvia com p_confirmar_estoque = true (D8: avisa, não bloqueia).
-- Devolve {"ok": true, "venda_id", "numero", "sem_custo": [...]} ou, no reenvio da mesma
-- chave, a venda já gravada ("repetida": true).
create function public.registrar_venda(
  p_chave uuid, p_tipo public.tipo_venda, p_itens jsonb, p_forma uuid default null,
  p_valor_recebido numeric default 0, p_desconto numeric default 0,
  p_cliente text default null, p_observacao text default null,
  p_entrega_prevista date default null, p_confirmar_estoque boolean default false
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

  -- 1) Confere os itens e calcula o subtotal (preço do cadastro, ou o informado).
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

  -- 2) Venda e doação baixam o estoque agora. Se faltar produto, pergunta antes (D8).
  if v_imediata then
    v_faltas := privado.conferir_estoque_venda(v_itens);
    if jsonb_array_length(v_faltas) > 0 and not coalesce(p_confirmar_estoque, false) then
      return jsonb_build_object('ok', false, 'faltas', v_faltas);
    end if;
  end if;

  -- 3) Grava a venda, os itens (desconto rateado pelo valor de cada item), o recebimento e o estoque.
  insert into public.vendas (desafio_id, tipo, participante_id, cliente, observacao, forma_pagamento_id, taxa_percentual,
                             subtotal, desconto, total, situacao_pagamento, situacao_entrega, entrega_prevista,
                             reconhecida_em, estoque_baixado, estoque_negativo_confirmado, chave_idempotencia)
  values (privado.desafio_atual_id(), p_tipo, auth.uid(), nullif(btrim(p_cliente), ''), nullif(btrim(p_observacao), ''),
          case when p_tipo = 'doacao' then null else p_forma end, v_taxa,
          v_subtotal, v_desconto, v_total,
          case when p_tipo = 'doacao' then null else privado.situacao_pagamento(v_total, 0) end,
          case when p_tipo = 'encomenda' then 'aguardando'::public.situacao_entrega end, p_entrega_prevista,
          case when v_imediata then now() end, v_imediata, jsonb_array_length(v_faltas) > 0, p_chave)
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

-- ── Receber (venda pendente ou parcial) ──────────────────────────────────────
create function public.registrar_recebimento(p_chave uuid, p_venda uuid, p_valor numeric, p_forma uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vendas;
  v_valor numeric := round(p_valor, 2);
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar recebimentos.';
  end if;
  if exists (select 1 from public.recebimentos where chave_idempotencia = p_chave) then
    return; -- reenvio
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
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe o valor recebido, como 10,00.';
  end if;
  if v_valor > v.total - v.recebido then
    raise exception 'O valor passa do que falta receber (%).', v.total - v.recebido;
  end if;
  if not exists (select 1 from public.formas_pagamento where id = p_forma and ativa) then
    raise exception 'Escolha a forma de pagamento.';
  end if;
  perform privado.receber(v.id, v_valor, p_forma, p_chave);
end
$$;

-- ── Encomenda ────────────────────────────────────────────────────────────────
create function public.marcar_encomenda_pronta(p_venda uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  update public.vendas set situacao_entrega = 'pronta'
   where id = p_venda and tipo = 'encomenda' and situacao = 'ativa' and situacao_entrega = 'aguardando';
end
$$;

-- Entregar: baixa o estoque e reconhece a margem na data da entrega (D7).
create function public.entregar_encomenda(p_venda uuid, p_confirmar_estoque boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vendas;
  v_itens jsonb;
  v_faltas jsonb;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para entregar encomendas.';
  end if;
  select * into v from public.vendas where id = p_venda for update;
  if v.id is null or v.tipo <> 'encomenda' then
    raise exception 'Encomenda não encontrada.';
  end if;
  if v.situacao = 'cancelada' then
    raise exception 'Esta encomenda foi cancelada.';
  end if;
  if v.situacao_entrega = 'entregue' then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;
  v_itens := privado.itens_da_venda(v.id);
  v_faltas := privado.conferir_estoque_venda(v_itens);
  if jsonb_array_length(v_faltas) > 0 and not coalesce(p_confirmar_estoque, false) then
    return jsonb_build_object('ok', false, 'faltas', v_faltas);
  end if;
  perform privado.baixar_estoque_venda(v_itens, 'venda', v.id);
  perform privado.congelar_custos_venda(v.id);
  update public.vendas
     set situacao_entrega = 'entregue', entregue_em = now(), reconhecida_em = now(), estoque_baixado = true,
         estoque_negativo_confirmado = estoque_negativo_confirmado or jsonb_array_length(v_faltas) > 0
   where id = v.id;
  return jsonb_build_object('ok', true);
end
$$;

-- ── Cancelar ─────────────────────────────────────────────────────────────────
-- Nada é apagado: devolve o estoque (se já tinha baixado), estorna os recebimentos no caixa
-- e marca a venda como cancelada, com motivo. Admin sempre; membro na própria, em até 30 min (D11).
create function public.cancelar_venda(p_venda uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.vendas;
  m record;
  r record;
  l record;
  v_estorno uuid;
begin
  select * into v from public.vendas where id = p_venda for update;
  if v.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  if v.situacao = 'cancelada' then
    return;
  end if;
  if not privado.pode_cancelar(v.criado_por, v.criado_em) then
    raise exception 'Só o administrador cancela vendas de outras pessoas ou com mais de 30 minutos.';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do cancelamento.';
  end if;

  -- Estoque: devolve exatamente o que saiu, item por item, na ordem das travas.
  for m in
    select insumo_id, variacao_id, sum(quantidade_base) as qtd, max(custo_unitario) as custo
      from public.movimentos_estoque where origem_tipo = 'venda' and origem_id = v.id
     group by insumo_id, variacao_id order by insumo_id nulls last, variacao_id
  loop
    if m.insumo_id is not null then
      perform privado.travar_saldo_insumo(m.insumo_id);
    else
      perform privado.travar_saldo_variacao(m.variacao_id);
    end if;
    if m.qtd <> 0 then
      perform privado.movimentar(m.insumo_id, m.variacao_id, 'estorno', -m.qtd, m.custo, 'venda', v.id,
                                 'Cancelamento da venda nº ' || v.numero || ': ' || btrim(p_motivo));
    end if;
  end loop;

  -- Recebimentos: um estorno para cada um (o dinheiro e a taxa voltam no caixa).
  for r in select * from public.recebimentos where venda_id = v.id and estorno_de is null
             and not exists (select 1 from public.recebimentos e where e.estorno_de = recebimentos.id) loop
    insert into public.recebimentos (venda_id, valor, forma_pagamento_id, taxa_percentual, taxa_valor, estorno_de, criado_por)
    values (v.id, -r.valor, r.forma_pagamento_id, r.taxa_percentual, -r.taxa_valor, r.id, auth.uid())
    returning id into v_estorno;
    for l in select * from public.lancamentos_caixa where origem_tipo = 'recebimento' and origem_id = r.id loop
      insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
      values (l.desafio_id, 'estorno', -l.valor, 'Cancelamento da venda nº ' || v.numero || ': ' || btrim(p_motivo),
              'recebimento', v_estorno, auth.uid());
    end loop;
  end loop;

  update public.vendas
     set situacao = 'cancelada', recebido = 0, cancelado_em = now(), cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo)
   where id = v.id;
end
$$;

-- ── Leituras ─────────────────────────────────────────────────────────────────
create view public.v_vendas with (security_invoker = true) as
select
  v.id, v.numero, v.desafio_id, v.data_hora, (v.data_hora at time zone 'America/Fortaleza')::date as dia,
  v.tipo, v.participante_id, pe.nome as participante, v.cliente, v.observacao,
  v.forma_pagamento_id, f.nome as forma_pagamento, v.taxa_percentual,
  v.subtotal, v.desconto, v.total, v.recebido,
  case when v.situacao = 'ativa' and v.tipo <> 'doacao' then v.total - v.recebido else 0 end as a_receber,
  v.situacao_pagamento, v.situacao_entrega, v.entrega_prevista, v.entregue_em, v.reconhecida_em,
  v.estoque_negativo_confirmado, v.situacao, v.cancelado_em, v.cancelado_por, v.motivo_cancelamento,
  v.criado_por, v.criado_em,
  it.resumo as itens_resumo, it.variacoes, it.margem as margem_total, it.sem_custo
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

-- Grade da nova venda: produtos ativos, mais vendidos primeiro, com preço e estoque.
-- Estoque de kit = quantos kits os componentes formam.
create view public.v_produtos_venda with (security_invoker = true) as
with saldo as (
  select variacao_id, saldo from public.saldos_estoque where variacao_id is not null
),
kits as (
  select k.kit_variacao_id as variacao_id, min(floor(coalesce(s.saldo, 0) / k.quantidade)) as saldo
  from public.kit_componentes k left join saldo s on s.variacao_id = k.componente_variacao_id
  group by k.kit_variacao_id
),
vendidos as (
  select vi.variacao_id, sum(vi.quantidade) as unidades
  from public.venda_itens vi join public.vendas v on v.id = vi.venda_id
  where v.situacao = 'ativa' and v.tipo <> 'doacao'
  group by vi.variacao_id
)
select
  cv.variacao_id, cv.produto_id, cv.produto, cv.variacao, privado.nome_variacao(cv.variacao_id) as nome,
  cv.tipo, cv.categoria, p.apelidos, cv.preco_venda, cv.custo_unitario,
  case when cv.tipo = 'kit' then coalesce(k.saldo, 0) else coalesce(s.saldo, 0) end as estoque,
  coalesce(vd.unidades, 0) as vendidos, cv.ordem_produto, cv.ordem
from public.v_custo_variacoes cv
join public.produtos p on p.id = cv.produto_id
left join saldo s on s.variacao_id = cv.variacao_id
left join kits k on k.variacao_id = cv.variacao_id
left join vendidos vd on vd.variacao_id = cv.variacao_id
where cv.ativa;

-- ── Permissões ───────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['vendas', 'venda_itens', 'recebimentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (privado.eh_participante())', t || '_leitura', t);
  end loop;
end
$$;
revoke insert, update, delete on public.v_vendas, public.v_produtos_venda from authenticated;

grant execute on function
  public.registrar_venda(uuid, public.tipo_venda, jsonb, uuid, numeric, numeric, text, text, date, boolean),
  public.registrar_recebimento(uuid, uuid, numeric, uuid),
  public.marcar_encomenda_pronta(uuid),
  public.entregar_encomenda(uuid, boolean),
  public.cancelar_venda(uuid, text)
  to authenticated;
grant execute on function privado.nome_variacao(uuid) to authenticated;

create trigger vendas_registro before insert or update on public.vendas
  for each row execute function privado.preencher_registro();
create trigger vendas_auditoria after insert or update or delete on public.vendas
  for each row execute function privado.registrar_auditoria();
create trigger venda_itens_auditoria after insert or update or delete on public.venda_itens
  for each row execute function privado.registrar_auditoria();
create trigger recebimentos_auditoria after insert or update or delete on public.recebimentos
  for each row execute function privado.registrar_auditoria();
