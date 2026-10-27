-- Fatia 3: compras, estoque e produção (Seções 4.3, 4.4 e 4.5).
-- Estoque = um livro único de movimentações (só inclusão). O saldo é derivado dele por
-- gatilho; ninguém digita saldo. Operações compostas são funções numa transação só,
-- com bloqueio de linha nos saldos (dois participantes ao mesmo tempo não furam o estoque).

create type public.tipo_movimento as enum
  ('compra', 'consumo_producao', 'entrada_producao', 'venda', 'doacao', 'perda', 'ajuste', 'estorno');
create type public.situacao_registro as enum ('ativa', 'cancelada');
create type public.pago_por as enum ('caixa', 'participante');
create type public.situacao_producao as enum ('planejada', 'concluida', 'cancelada');
create type public.tipo_lancamento_caixa as enum
  ('recebimento', 'taxa', 'compra', 'despesa', 'reembolso', 'aporte', 'ajuste', 'estorno');

-- Desafio em andamento (os lançamentos ficam ligados a ele; nulo se não há).
create function privado.desafio_atual_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.desafios where situacao = 'em_andamento' limit 1
$$;

-- Quem pode cancelar: administrador sempre; quem lançou, em até 30 minutos (D11).
create function privado.pode_cancelar(p_criado_por uuid, p_criado_em timestamptz)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.eh_admin()
      or (privado.eh_participante() and p_criado_por = auth.uid() and now() - p_criado_em <= interval '30 minutes')
$$;

-- ── Livro de caixa (só dinheiro que entrou ou saiu). Telas e relatórios na fatia 5. ──
create table public.lancamentos_caixa (
  id bigint generated always as identity primary key,
  desafio_id uuid references public.desafios (id),
  tipo public.tipo_lancamento_caixa not null,
  valor numeric(12, 2) not null check (valor <> 0),
  descricao text,
  origem_tipo text,
  origem_id uuid,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index lancamentos_caixa_origem on public.lancamentos_caixa (origem_tipo, origem_id);

-- ── Livro de estoque ─────────────────────────────────────────────────────────
create table public.movimentos_estoque (
  id bigint generated always as identity primary key,
  desafio_id uuid references public.desafios (id),
  insumo_id uuid references public.insumos (id),
  variacao_id uuid references public.variacoes (id),
  tipo public.tipo_movimento not null,
  quantidade_base numeric(14, 4) not null check (quantidade_base <> 0),
  custo_unitario numeric(14, 6),
  origem_tipo text,
  origem_id uuid,
  justificativa text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  check ((insumo_id is null) <> (variacao_id is null))
);
create index movimentos_estoque_insumo on public.movimentos_estoque (insumo_id, criado_em desc);
create index movimentos_estoque_variacao on public.movimentos_estoque (variacao_id, criado_em desc);
create index movimentos_estoque_origem on public.movimentos_estoque (origem_tipo, origem_id);

-- Saldo de cada item, mantido só pelo gatilho do livro (existe para o bloqueio de linha).
create table public.saldos_estoque (
  id bigint generated always as identity primary key,
  insumo_id uuid references public.insumos (id),
  variacao_id uuid references public.variacoes (id),
  saldo numeric(14, 4) not null default 0,
  check ((insumo_id is null) <> (variacao_id is null))
);
create unique index saldos_estoque_insumo on public.saldos_estoque (insumo_id) where insumo_id is not null;
create unique index saldos_estoque_variacao on public.saldos_estoque (variacao_id) where variacao_id is not null;

create function privado.atualizar_saldo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.insumo_id is not null then
    insert into public.saldos_estoque (insumo_id, saldo) values (new.insumo_id, new.quantidade_base)
    on conflict (insumo_id) where insumo_id is not null
    do update set saldo = public.saldos_estoque.saldo + excluded.saldo;
  else
    insert into public.saldos_estoque (variacao_id, saldo) values (new.variacao_id, new.quantidade_base)
    on conflict (variacao_id) where variacao_id is not null
    do update set saldo = public.saldos_estoque.saldo + excluded.saldo;
  end if;
  return new;
end
$$;
create trigger movimentos_estoque_saldo after insert on public.movimentos_estoque
  for each row execute function privado.atualizar_saldo();

-- Garante a linha de saldo e a trava (FOR UPDATE) até o fim da transação.
create function privado.travar_saldo_insumo(p_insumo uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  insert into public.saldos_estoque (insumo_id) values (p_insumo)
  on conflict (insumo_id) where insumo_id is not null do nothing;
  select saldo into v_saldo from public.saldos_estoque where insumo_id = p_insumo for update;
  return v_saldo;
end
$$;

create function privado.travar_saldo_variacao(p_variacao uuid)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  insert into public.saldos_estoque (variacao_id) values (p_variacao)
  on conflict (variacao_id) where variacao_id is not null do nothing;
  select saldo into v_saldo from public.saldos_estoque where variacao_id = p_variacao for update;
  return v_saldo;
end
$$;

create function privado.movimentar(
  p_insumo uuid, p_variacao uuid, p_tipo public.tipo_movimento, p_quantidade numeric,
  p_custo numeric, p_origem_tipo text, p_origem_id uuid, p_justificativa text
)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.movimentos_estoque
    (desafio_id, insumo_id, variacao_id, tipo, quantidade_base, custo_unitario, origem_tipo, origem_id, justificativa, criado_por)
  values
    (privado.desafio_atual_id(), p_insumo, p_variacao, p_tipo, p_quantidade, p_custo, p_origem_tipo, p_origem_id, p_justificativa, auth.uid())
$$;

-- ── Compras ──────────────────────────────────────────────────────────────────
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid references public.desafios (id),
  data date not null default ((now() at time zone 'America/Fortaleza')::date),
  fornecedor text check (fornecedor is null or char_length(fornecedor) <= 80),
  pago_por public.pago_por not null,
  participante_id uuid references public.perfis (id),
  total numeric(12, 2) not null check (total >= 0),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  situacao public.situacao_registro not null default 'ativa',
  chave_idempotencia uuid not null unique,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  check (pago_por = 'caixa' or participante_id is not null)
);

create table public.compra_itens (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references public.compras (id),
  insumo_id uuid not null references public.insumos (id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  unidade text not null,
  quantidade_base numeric(14, 4) not null check (quantidade_base > 0),
  valor numeric(12, 2) not null check (valor >= 0),
  custo_por_base numeric(14, 6) not null
);
create index compra_itens_compra on public.compra_itens (compra_id);

-- O histórico de custo passa a apontar a compra que mudou o preço (D9).
alter table public.insumo_custos_historico add column compra_id uuid references public.compras (id);
create or replace function privado.registrar_custo_insumo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.insumo_custos_historico
    (insumo_id, custo_por_base, preco_referencia, unidade_referencia, origem, compra_id, registrado_por)
  values (new.id, new.custo_atual, new.preco_referencia, new.unidade_referencia,
          coalesce(nullif(current_setting('app.origem_custo', true), ''), 'manual'),
          nullif(current_setting('app.compra_id', true), '')::uuid, auth.uid());
  return new;
end
$$;

-- p_itens: [{"insumo_id": "...", "quantidade": 2, "unidade": "cx", "valor": 15.80}, ...]
-- valor = quanto custou aquele item no total. O custo atual do insumo passa a ser o da
-- última compra (D9). Pago pelo caixa: sai do caixa. Pago pelo participante: vira
-- "a reembolsar" (fatia 5), sem sair do caixa agora.
create function public.registrar_compra(
  p_chave uuid, p_itens jsonb, p_pago_por public.pago_por,
  p_data date default null, p_fornecedor text default null, p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_insumo uuid;
  v_qtd numeric;
  v_unidade text;
  v_valor numeric;
  v_base numeric;
  v_total numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar compras.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  select id into v_id from public.compras where chave_idempotencia = p_chave;
  if v_id is not null then
    return v_id; -- reenvio do mesmo formulário: não duplica
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um item à compra.';
  end if;
  if p_data is not null and p_data > (now() at time zone 'America/Fortaleza')::date then
    raise exception 'A data da compra não pode ser no futuro.';
  end if;

  select coalesce(sum(round((e ->> 'valor')::numeric, 2)), 0) into v_total from jsonb_array_elements(p_itens) e;
  insert into public.compras (desafio_id, data, fornecedor, pago_por, participante_id, total, observacao, chave_idempotencia)
  values (privado.desafio_atual_id(), coalesce(p_data, (now() at time zone 'America/Fortaleza')::date),
          nullif(btrim(p_fornecedor), ''), p_pago_por,
          case when p_pago_por = 'participante' then auth.uid() end, v_total, nullif(btrim(p_observacao), ''), p_chave)
  returning id into v_id;

  perform set_config('app.origem_custo', 'compra', true);
  perform set_config('app.compra_id', v_id::text, true);
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_insumo := (v_item ->> 'insumo_id')::uuid;
    v_qtd := (v_item ->> 'quantidade')::numeric;
    v_unidade := lower(btrim(v_item ->> 'unidade'));
    v_valor := round((v_item ->> 'valor')::numeric, 2);
    if v_insumo is null or not exists (select 1 from public.insumos where id = v_insumo and ativo) then
      raise exception 'Insumo não encontrado ou desativado.';
    end if;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'A quantidade de cada item precisa ser maior que zero.';
    end if;
    if v_valor is null or v_valor < 0 then
      raise exception 'O valor de cada item precisa ser zero ou mais.';
    end if;
    v_base := round(v_qtd * privado.exigir_fator(v_insumo, v_unidade), 4);
    insert into public.compra_itens (compra_id, insumo_id, quantidade, unidade, quantidade_base, valor, custo_por_base)
    values (v_id, v_insumo, v_qtd, v_unidade, v_base, v_valor, round(v_valor / v_base, 6));
    perform privado.travar_saldo_insumo(v_insumo);
    perform privado.movimentar(v_insumo, null, 'compra', v_base, round(v_valor / v_base, 6), 'compra', v_id, null);
    update public.insumos
       set custo_atual = round(v_valor / v_base, 6),
           preco_referencia = round(v_valor / v_qtd, 2),
           unidade_referencia = v_unidade
     where id = v_insumo;
  end loop;
  perform set_config('app.origem_custo', '', true);
  perform set_config('app.compra_id', '', true);

  if p_pago_por = 'caixa' and v_total > 0 then
    insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
    values (privado.desafio_atual_id(), 'compra', -v_total, coalesce('Compra · ' || nullif(btrim(p_fornecedor), ''), 'Compra de insumos'),
            'compra', v_id, auth.uid());
  end if;
  return v_id;
end
$$;

-- Cancelar compra: devolve o estoque e o dinheiro, mantém tudo no histórico.
-- Se parte do insumo já foi usada, não dá para desfazer: oriente a corrigir o estoque.
create function public.cancelar_compra(p_compra uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.compras;
  it record;
  v_saldo numeric;
begin
  select * into c from public.compras where id = p_compra for update;
  if c.id is null then
    raise exception 'Compra não encontrada.';
  end if;
  if c.situacao = 'cancelada' then
    return;
  end if;
  if not privado.pode_cancelar(c.criado_por, c.criado_em) then
    raise exception 'Só o administrador cancela compras de outras pessoas ou com mais de 30 minutos.';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do cancelamento.';
  end if;
  for it in select * from public.compra_itens where compra_id = c.id order by insumo_id loop
    v_saldo := privado.travar_saldo_insumo(it.insumo_id);
    if v_saldo < it.quantidade_base then
      raise exception 'Parte de % já foi usada (sobram % de %). Em vez de cancelar, corrija o estoque com justificativa.',
        (select nome from public.insumos where id = it.insumo_id), round(v_saldo, 3), round(it.quantidade_base, 3);
    end if;
    perform privado.movimentar(it.insumo_id, null, 'estorno', -it.quantidade_base, it.custo_por_base, 'compra', c.id,
                               'Cancelamento: ' || btrim(p_motivo));
  end loop;
  if c.pago_por = 'caixa' and c.total > 0 then
    insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
    values (c.desafio_id, 'estorno', c.total, 'Cancelamento de compra: ' || btrim(p_motivo), 'compra', c.id, auth.uid());
  end if;
  update public.compras
     set situacao = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
   where id = c.id;
end
$$;

-- ── Produção ─────────────────────────────────────────────────────────────────
create table public.producoes (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid references public.desafios (id),
  variacao_id uuid not null references public.variacoes (id),
  receita_id uuid not null references public.receitas (id),
  fornadas numeric(10, 2) not null check (fornadas > 0),
  unidades_previstas numeric(12, 2) not null,
  situacao public.situacao_producao not null default 'planejada',
  unidades_produzidas numeric(12, 2) check (unidades_produzidas >= 0),
  unidades_perdidas numeric(12, 2) check (unidades_perdidas >= 0),
  data_planejada date,
  observacao text check (observacao is null or char_length(observacao) <= 300),
  chave_idempotencia uuid not null unique,
  concluida_em timestamptz,
  concluida_por uuid,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);

create function public.planejar_producao(
  p_chave uuid, p_variacao uuid, p_fornadas numeric, p_data date default null, p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_receita uuid;
  v_rendimento numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para planejar produção.';
  end if;
  select id into v_id from public.producoes where chave_idempotencia = p_chave;
  if v_id is not null then
    return v_id;
  end if;
  if p_fornadas is null or p_fornadas <= 0 then
    raise exception 'Informe quantas fornadas, como 1 ou 2.';
  end if;
  select v.receita_id, r.rendimento_unidades into v_receita, v_rendimento
    from public.variacoes v
    join public.produtos p on p.id = v.produto_id
    left join public.receitas r on r.id = v.receita_id
   where v.id = p_variacao and v.ativa and p.ativo and p.tipo = 'simples';
  if not found then
    raise exception 'Produto não encontrado, desativado ou é um kit (kits não são produzidos; produza os produtos que o formam).';
  end if;
  if v_receita is null then
    raise exception 'Este produto não tem receita. Escolha a receita em Produtos antes de planejar a produção.';
  end if;
  insert into public.producoes (desafio_id, variacao_id, receita_id, fornadas, unidades_previstas, data_planejada, observacao, chave_idempotencia)
  values (privado.desafio_atual_id(), p_variacao, v_receita, p_fornadas, round(p_fornadas * v_rendimento, 2), p_data,
          nullif(btrim(p_observacao), ''), p_chave)
  returning id into v_id;
  return v_id;
end
$$;

-- Necessidade de insumos de uma produção (receita × fornadas + embalagens × unidades).
create function privado.necessidade_producao(p_producao uuid, p_unidades numeric)
returns table (insumo_id uuid, necessario numeric)
language sql stable security definer set search_path = ''
as $$
  with p as (select * from public.producoes where id = p_producao),
  itens as (
    select ri.insumo_id, ri.quantidade * privado.fator_unidade(ri.insumo_id, ri.unidade) * p.fornadas as qtd
      from p join public.receita_itens ri on ri.receita_id = p.receita_id
    union all
    select ve.insumo_id, ve.quantidade * privado.fator_unidade(ve.insumo_id, ve.unidade) * p_unidades
      from p join public.variacao_embalagens ve on ve.variacao_id = p.variacao_id
  )
  select insumo_id, round(sum(qtd), 4) from itens group by insumo_id
$$;

-- Concluir produção, numa transação só (Seção 4.3):
-- 1) trava e confere insumos e embalagens; 2) se faltar, NÃO grava nada e devolve a lista
-- do que falta; 3) se houver, baixa os insumos, dá entrada no produto pronto (boas +
-- perdidas) e registra a perda das perdidas (o custo delas entra no resultado).
-- Devolve {"ok": true} ou {"ok": false, "faltas": [{insumo, unidade, necessario, disponivel, falta}]}.
create function public.concluir_producao(p_producao uuid, p_unidades_boas numeric, p_unidades_perdidas numeric default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.producoes;
  n record;
  v_saldo numeric;
  v_faltas jsonb := '[]'::jsonb;
  v_custo numeric;
  v_perdidas numeric := coalesce(p_unidades_perdidas, 0);
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para concluir a produção.';
  end if;
  select * into p from public.producoes where id = p_producao for update;
  if p.id is null then
    raise exception 'Produção não encontrada.';
  end if;
  if p.situacao = 'concluida' then
    return jsonb_build_object('ok', true, 'ja_concluida', true); -- reenvio: não baixa duas vezes
  end if;
  if p.situacao = 'cancelada' then
    raise exception 'Esta produção foi cancelada.';
  end if;
  if p_unidades_boas is null or p_unidades_boas < 0 or v_perdidas < 0 or p_unidades_boas + v_perdidas = 0 then
    raise exception 'Informe quantas unidades ficaram boas (e as perdidas, se houver).';
  end if;

  -- Trava em ordem fixa (evita impasse entre duas produções ao mesmo tempo).
  for n in select * from privado.necessidade_producao(p.id, p_unidades_boas) order by insumo_id loop
    v_saldo := privado.travar_saldo_insumo(n.insumo_id);
    if v_saldo < n.necessario then
      v_faltas := v_faltas || jsonb_build_object(
        'insumo_id', n.insumo_id,
        'insumo', (select nome from public.insumos where id = n.insumo_id),
        'unidade', (select unidade_base from public.insumos where id = n.insumo_id),
        'necessario', n.necessario, 'disponivel', v_saldo, 'falta', n.necessario - v_saldo);
    end if;
  end loop;
  if jsonb_array_length(v_faltas) > 0 then
    return jsonb_build_object('ok', false, 'faltas', v_faltas);
  end if;

  for n in select * from privado.necessidade_producao(p.id, p_unidades_boas) order by insumo_id loop
    perform privado.movimentar(n.insumo_id, null, 'consumo_producao', -n.necessario,
                               (select custo_atual from public.insumos where id = n.insumo_id), 'producao', p.id, null);
  end loop;
  -- Unidade boa: custo completo (receita + embalagem). Unidade perdida: só a parte da
  -- receita, porque a embalagem dela não foi usada.
  v_custo := (select custo_unitario from public.v_custo_variacoes where variacao_id = p.variacao_id);
  perform privado.travar_saldo_variacao(p.variacao_id);
  if p_unidades_boas > 0 then
    perform privado.movimentar(null, p.variacao_id, 'entrada_producao', p_unidades_boas, v_custo, 'producao', p.id, null);
  end if;
  if v_perdidas > 0 then
    v_custo := (select custo_por_unidade from public.v_custo_receitas where receita_id = p.receita_id);
    perform privado.movimentar(null, p.variacao_id, 'entrada_producao', v_perdidas, v_custo, 'producao', p.id, 'Perdidas na produção');
    perform privado.movimentar(null, p.variacao_id, 'perda', -v_perdidas, v_custo, 'producao', p.id, 'Perda na produção');
  end if;
  update public.producoes
     set situacao = 'concluida', unidades_produzidas = p_unidades_boas, unidades_perdidas = v_perdidas,
         concluida_em = now(), concluida_por = auth.uid()
   where id = p.id;
  return jsonb_build_object('ok', true);
end
$$;

-- Planejada não mexe em estoque nem dinheiro: qualquer participante ativo cancela.
create function public.cancelar_producao(p_producao uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.producoes;
begin
  select * into p from public.producoes where id = p_producao for update;
  if p.id is null then
    raise exception 'Produção não encontrada.';
  end if;
  if p.situacao <> 'planejada' then
    raise exception 'Só produções planejadas podem ser canceladas. Para corrigir uma concluída, ajuste o estoque.';
  end if;
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para cancelar.';
  end if;
  update public.producoes
     set situacao = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = nullif(btrim(p_motivo), '')
   where id = p.id;
end
$$;

-- ── Ajuste (contagem) e perda ────────────────────────────────────────────────
-- Ajuste: a pessoa conta o que tem e informa o total contado; o sistema lança a diferença.
-- Não entra no resultado (é correção de registro). Justificativa obrigatória.
create function public.ajustar_estoque(p_chave uuid, p_insumo uuid, p_variacao uuid, p_contado numeric, p_justificativa text)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_saldo numeric;
  v_dif numeric;
  v_custo numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para ajustar o estoque.';
  end if;
  if exists (select 1 from public.movimentos_estoque where origem_tipo = 'ajuste' and origem_id = p_chave) then
    return 0;
  end if;
  if (p_insumo is null) = (p_variacao is null) then
    raise exception 'Escolha um insumo ou um produto.';
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Informe quanto você contou (zero ou mais).';
  end if;
  if p_justificativa is null or char_length(btrim(p_justificativa)) < 3 then
    raise exception 'Diga o motivo do ajuste (ex.: contagem do fim do dia).';
  end if;
  if p_insumo is not null then
    v_saldo := privado.travar_saldo_insumo(p_insumo);
    v_custo := (select custo_atual from public.insumos where id = p_insumo);
  else
    v_saldo := privado.travar_saldo_variacao(p_variacao);
    v_custo := (select custo_unitario from public.v_custo_variacoes where variacao_id = p_variacao);
  end if;
  v_dif := round(p_contado - v_saldo, 4);
  if v_dif <> 0 then
    perform privado.movimentar(p_insumo, p_variacao, 'ajuste', v_dif, v_custo, 'ajuste', p_chave, btrim(p_justificativa));
  end if;
  return v_dif;
end
$$;

-- Perda: algo estragou, caiu, venceu. Baixa o estoque e o custo entra no resultado.
create function public.registrar_perda(p_chave uuid, p_insumo uuid, p_variacao uuid, p_quantidade numeric, p_unidade text, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_saldo numeric;
  v_base numeric;
  v_custo numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar perdas.';
  end if;
  if exists (select 1 from public.movimentos_estoque where origem_tipo = 'perda' and origem_id = p_chave) then
    return;
  end if;
  if (p_insumo is null) = (p_variacao is null) then
    raise exception 'Escolha um insumo ou um produto.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Informe quanto foi perdido.';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o que aconteceu (ex.: caiu no chão, venceu).';
  end if;
  if p_insumo is not null then
    v_base := round(p_quantidade * privado.exigir_fator(p_insumo, coalesce(p_unidade, (select unidade_base from public.insumos where id = p_insumo))), 4);
    v_saldo := privado.travar_saldo_insumo(p_insumo);
    v_custo := (select custo_atual from public.insumos where id = p_insumo);
  else
    v_base := p_quantidade;
    v_saldo := privado.travar_saldo_variacao(p_variacao);
    v_custo := (select custo_unitario from public.v_custo_variacoes where variacao_id = p_variacao);
  end if;
  if v_base > v_saldo then
    raise exception 'A perda (%) é maior que o estoque registrado (%). Se o estoque está errado, ajuste a contagem antes.', round(v_base, 3), round(v_saldo, 3);
  end if;
  perform privado.movimentar(p_insumo, p_variacao, 'perda', -v_base, v_custo, 'perda', p_chave, btrim(p_motivo));
end
$$;

-- ── Leituras ─────────────────────────────────────────────────────────────────
create view public.v_estoque_insumos with (security_invoker = true) as
select
  i.id as insumo_id, i.nome, i.tipo, i.unidade_base, i.ativo, i.estoque_minimo, i.custo_atual,
  coalesce(s.saldo, 0) as saldo,
  round(coalesce(s.saldo, 0) * i.custo_atual, 2) as valor_estoque,
  i.estoque_minimo is not null and coalesce(s.saldo, 0) < i.estoque_minimo as abaixo_minimo
from public.insumos i
left join public.saldos_estoque s on s.insumo_id = i.id;

create view public.v_estoque_produtos with (security_invoker = true) as
select
  cv.variacao_id, cv.produto_id, cv.produto, cv.variacao, cv.tipo, cv.ativa, cv.custo_unitario,
  coalesce(s.saldo, 0) as saldo,
  round(coalesce(s.saldo, 0) * cv.custo_unitario, 2) as valor_estoque
from public.v_custo_variacoes cv
left join public.saldos_estoque s on s.variacao_id = cv.variacao_id
where cv.tipo = 'simples';

-- Quantas fornadas dá para fazer com o estoque atual e qual insumo limita.
create view public.v_producao_possivel with (security_invoker = true) as
with r as (
  select
    cv.variacao_id, cv.produto, cv.variacao, cv.ativa, rc.id as receita_id, rc.rendimento_unidades,
    ri.insumo_id,
    ri.quantidade * privado.fator_unidade(ri.insumo_id, ri.unidade) as por_fornada
  from public.v_custo_variacoes cv
  join public.receitas rc on rc.id = cv.receita_id
  join public.receita_itens ri on ri.receita_id = rc.id
  where cv.tipo = 'simples'
  union all
  select
    cv.variacao_id, cv.produto, cv.variacao, cv.ativa, rc.id, rc.rendimento_unidades,
    ve.insumo_id,
    ve.quantidade * privado.fator_unidade(ve.insumo_id, ve.unidade) * rc.rendimento_unidades
  from public.v_custo_variacoes cv
  join public.receitas rc on rc.id = cv.receita_id
  join public.variacao_embalagens ve on ve.variacao_id = cv.variacao_id
  where cv.tipo = 'simples'
),
porinsumo as (
  select r.*, coalesce(s.saldo, 0) as saldo, floor(coalesce(s.saldo, 0) / nullif(r.por_fornada, 0)) as fornadas
  from r left join public.saldos_estoque s on s.insumo_id = r.insumo_id
),
limite as (
  select distinct on (variacao_id) variacao_id, insumo_id, fornadas
  from porinsumo order by variacao_id, fornadas, insumo_id
)
select
  p.variacao_id, p.produto, p.variacao, p.ativa, p.receita_id, p.rendimento_unidades,
  l.fornadas as fornadas_possiveis,
  l.fornadas * p.rendimento_unidades as unidades_possiveis,
  i.nome as insumo_limitante
from (select distinct variacao_id, produto, variacao, ativa, receita_id, rendimento_unidades from porinsumo) p
join limite l on l.variacao_id = p.variacao_id
join public.insumos i on i.id = l.insumo_id;

-- Lista de compras: o que falta para as produções planejadas + o estoque mínimo.
create view public.v_lista_compras with (security_invoker = true) as
with planejado as (
  select n.insumo_id, sum(n.necessario) as necessario
  from public.producoes p
  cross join lateral privado.necessidade_producao(p.id, p.unidades_previstas) n
  where p.situacao = 'planejada'
  group by n.insumo_id
)
select
  e.insumo_id, e.nome, e.tipo, e.unidade_base, e.saldo, e.estoque_minimo, e.custo_atual,
  coalesce(pl.necessario, 0) as necessario_planejado,
  coalesce(pl.necessario, 0) + coalesce(e.estoque_minimo, 0) - e.saldo as falta,
  round((coalesce(pl.necessario, 0) + coalesce(e.estoque_minimo, 0) - e.saldo) * e.custo_atual, 2) as custo_estimado
from public.v_estoque_insumos e
left join planejado pl on pl.insumo_id = e.insumo_id
where e.ativo and coalesce(pl.necessario, 0) + coalesce(e.estoque_minimo, 0) - e.saldo > 0;

-- ── Permissões ───────────────────────────────────────────────────────────────
-- Tudo é lido por participantes ativos. Nada é gravado direto: só pelas funções acima.
do $$
declare
  t text;
begin
  foreach t in array array['lancamentos_caixa', 'movimentos_estoque', 'saldos_estoque', 'compras', 'compra_itens', 'producoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (privado.eh_participante())', t || '_leitura', t);
  end loop;
end
$$;
revoke insert, update, delete on public.v_estoque_insumos, public.v_estoque_produtos, public.v_producao_possivel,
  public.v_lista_compras from authenticated;

grant execute on function public.registrar_compra(uuid, jsonb, public.pago_por, date, text, text),
  public.cancelar_compra(uuid, text),
  public.planejar_producao(uuid, uuid, numeric, date, text),
  public.concluir_producao(uuid, numeric, numeric),
  public.cancelar_producao(uuid, text),
  public.ajustar_estoque(uuid, uuid, uuid, numeric, text),
  public.registrar_perda(uuid, uuid, uuid, numeric, text, text)
  to authenticated;
grant execute on function privado.necessidade_producao(uuid, numeric) to authenticated;

create trigger compras_registro before insert or update on public.compras
  for each row execute function privado.preencher_registro();
create trigger compras_auditoria after insert or update or delete on public.compras
  for each row execute function privado.registrar_auditoria();
create trigger producoes_registro before insert or update on public.producoes
  for each row execute function privado.preencher_registro();
create trigger producoes_auditoria after insert or update or delete on public.producoes
  for each row execute function privado.registrar_auditoria();
create trigger movimentos_estoque_auditoria after insert on public.movimentos_estoque
  for each row execute function privado.registrar_auditoria();
create trigger lancamentos_caixa_auditoria after insert on public.lancamentos_caixa
  for each row execute function privado.registrar_auditoria();
