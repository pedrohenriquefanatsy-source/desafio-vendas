-- Fatia 12: o resultado da meta passa a ser o faturamento; produção simples (receita fixa por fornada, informa
-- fornadas e quantos potinhos renderam, sem travar por falta de insumo); corrigir quanto rendeu; contagem do dia;
-- simulação de produção (quanto de cada insumo comprar).

-- ── Meta pelo faturamento ────────────────────────────────────────────────────
-- Realizado = faturamento (o que foi vendido, sem doações e sem canceladas). O lucro estimado continua à parte.
create or replace view public.v_painel_meta with (security_invoker = true) as
with r as (
  select desafio_id,
         sum(resultado) as lucro, sum(margem_vendas) as margem, sum(custo_perdas) as perdas, sum(despesas) as despesas,
         sum(vendido) as vendido, sum(vendas) as vendas, count(*) filter (where vendas > 0) as dias_com_venda,
         bool_or(sem_custo) as sem_custo
  from public.v_resultado_diario group by desafio_id
),
mix as (
  select v.desafio_id, sum(vi.margem_contribuicao) as margem, sum(vi.quantidade) as unidades, sum(vi.valor_liquido) as faturado
  from public.vendas v join public.venda_itens vi on vi.venda_id = v.id
  where v.situacao = 'ativa' and v.reconhecida_em is not null and v.tipo <> 'doacao'
  group by v.desafio_id
)
select
  d.id as desafio_id, d.nome, d.inicio, d.fim, d.situacao, d.hoje, d.dias_total, d.dias_decorridos, d.dias_restantes,
  d.meta_resultado, d.meta_vendas,
  coalesce(r.vendido, 0) as realizado,
  coalesce(r.margem, 0) as margem, coalesce(r.perdas, 0) as perdas, coalesce(r.despesas, 0) as despesas,
  coalesce(r.vendido, 0) as vendido, coalesce(r.vendas, 0) as vendas, coalesce(r.dias_com_venda, 0) as dias_com_venda,
  coalesce(r.sem_custo, false) as sem_custo,
  case when d.meta_resultado > 0 then round(coalesce(r.vendido, 0) / d.meta_resultado * 100, 1) end as percentual,
  case when d.meta_resultado is not null then greatest(d.meta_resultado - coalesce(r.vendido, 0), 0) end as falta,
  case when d.meta_resultado is not null and d.dias_restantes > 0
       then round(greatest(d.meta_resultado - coalesce(r.vendido, 0), 0) / d.dias_restantes, 2) end as ritmo_necessario,
  case when d.hoje >= d.inicio
       then round(coalesce(r.vendido, 0) / least(d.hoje - d.inicio + 1, d.dias_total), 2) end as media_por_dia,
  case when coalesce(m.unidades, 0) > 0 and m.margem is not null then round(m.margem / m.unidades, 4) end as mc_media_unidade,
  coalesce(m.unidades, 0) as unidades_vendidas,
  case when d.meta_resultado is not null and coalesce(m.unidades, 0) > 0 and m.faturado > 0
       then ceil(greatest(d.meta_resultado - coalesce(r.vendido, 0), 0) / (m.faturado / m.unidades)) end as unidades_para_meta,
  case when d.meta_vendas > 0 then round(coalesce(r.vendido, 0) / d.meta_vendas * 100, 1) end as percentual_vendas,
  coalesce(r.lucro, 0) as lucro_estimado,
  case when coalesce(m.unidades, 0) > 0 then round(m.faturado / m.unidades, 4) end as preco_medio_unidade
from public.v_desafios d
left join r on r.desafio_id = d.id
left join mix m on m.desafio_id = d.id;

-- ── Custo pelo rendimento real das produções ────────────────────────────────
-- Quantos potinhos uma fornada rende vem da última produção registrada (boas + perdidas ÷ fornadas);
-- sem produção, vale o rendimento esperado da receita. Receita custeada por peso segue como antes.
create or replace view public.v_custo_receitas with (security_invoker = true) as
with ultima as (
  select distinct on (p.receita_id) p.receita_id, (p.unidades_produzidas + coalesce(p.unidades_perdidas, 0)) / p.fornadas as por_fornada
  from public.producoes p
  where p.situacao = 'concluida' and p.unidades_produzidas + coalesce(p.unidades_perdidas, 0) > 0
  order by p.receita_id, p.concluida_em desc, p.id
),
base as (
  select
    r.id as receita_id, r.nome, r.rendimento_unidades, r.ativa,
    count(it.id) as itens,
    count(it.id) filter (where it.custo_atual is null) as itens_sem_preco,
    string_agg(it.insumo, ', ' order by it.insumo) filter (where it.custo_atual is null) as insumos_sem_preco,
    case when count(it.id) filter (where it.custo_atual is null) > 0 then null
         else coalesce(sum(it.custo), 0) end as custo_receita,
    case when count(it.id) filter (where it.custo_atual is null) > 0 then null
         else coalesce(sum(it.custo), 0) / coalesce(u.por_fornada, r.rendimento_unidades) end as custo_por_unidade,
    coalesce(u.por_fornada, r.rendimento_unidades) as rendimento_efetivo,
    case when u.por_fornada is not null then 'ultima_producao' else 'receita' end as origem_rendimento
  from public.receitas r
  left join public.v_custo_receita_itens it on it.receita_id = r.id
  left join ultima u on u.receita_id = r.id
  group by r.id, u.por_fornada
)
select
  b.receita_id, b.nome, b.rendimento_unidades, b.ativa, b.itens, b.itens_sem_preco, b.insumos_sem_preco, b.custo_receita,
  case when vp.receita_id is not null then vp.custo_unidade else b.custo_por_unidade end as custo_por_unidade,
  vp.receita_id is not null as custeio_por_peso,
  vp.custo_por_grama, vp.origem as origem_custo_peso, vp.gramagem as gramagem_unidade,
  b.rendimento_efetivo, b.origem_rendimento
from base b
left join public.v_custeio_peso vp on vp.receita_id = b.receita_id;

-- ── Concluir produção: faltou insumo? avisa, mas conclui ────────────────────
create or replace function public.concluir_producao(
  p_producao uuid, p_unidades_boas numeric, p_unidades_perdidas numeric default 0,
  p_peso_cubos numeric default null, p_peso_final numeric default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.producoes;
  r public.receitas;
  n record;
  v_saldo numeric;
  v_faltas jsonb := '[]'::jsonb;
  v_custo numeric;
  v_perdidas numeric := coalesce(p_unidades_perdidas, 0);
  v_cobertura numeric := 0;
  v_custo_massa numeric;
  v_custo_cobertura numeric;
  v_custo_g numeric;
  v_emb numeric;
  v_preco_cobertura numeric;
  v_unid numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para concluir a produção.';
  end if;
  select * into p from public.producoes where id = p_producao for update;
  if p.id is null then
    raise exception 'Produção não encontrada.';
  end if;
  if p.situacao = 'concluida' then
    return jsonb_build_object('ok', true, 'ja_concluida', true);
  end if;
  if p.situacao = 'cancelada' then
    raise exception 'Esta produção foi cancelada.';
  end if;
  if p_unidades_boas is null or p_unidades_boas < 0 or v_perdidas < 0 or p_unidades_boas + v_perdidas = 0 then
    raise exception 'Informe quantos ficaram prontos (e os perdidos, se houver).';
  end if;
  select * into r from public.receitas where id = p.receita_id;
  if r.custeio_por_peso then
    if p_peso_cubos is null or p_peso_final is null or p_peso_cubos <= 0 then
      raise exception 'Informe o peso dos cubos e o peso depois do chocolate, em gramas.';
    end if;
    if p_peso_final <= p_peso_cubos then
      raise exception 'O peso depois do chocolate precisa ser maior que o peso dos cubos. Confira as duas pesagens.';
    end if;
    v_cobertura := round(p_peso_final - p_peso_cubos, 2);
  end if;

  for n in select * from privado.necessidade_producao_peso(p.id, p_unidades_boas, v_cobertura) order by insumo_id loop
    v_saldo := privado.travar_saldo_insumo(n.insumo_id);
    if v_saldo < n.necessario then
      v_faltas := v_faltas || jsonb_build_object(
        'insumo_id', n.insumo_id,
        'insumo', (select nome from public.insumos where id = n.insumo_id),
        'unidade', (select unidade_base from public.insumos where id = n.insumo_id),
        'necessario', n.necessario, 'disponivel', v_saldo, 'falta', n.necessario - v_saldo);
    end if;
  end loop;

  v_emb := (select case when bool_or(e.sem_preco) then null else coalesce(sum(e.custo), 0) end
              from public.v_custo_embalagens e where e.variacao_id = p.variacao_id);
  if r.custeio_por_peso then
    select case when count(*) filter (where it.custo_atual is null) > 0 then null else coalesce(sum(it.custo), 0) end
      into v_custo_massa from public.v_custo_receita_itens it where it.receita_id = p.receita_id;
    v_preco_cobertura := (select custo_atual from public.insumos where id = r.cobertura_insumo_id);
    if v_custo_massa is null or v_preco_cobertura is null then
      raise exception 'Falta o preço de um ingrediente da receita ou do chocolate da cobertura. Preencha em Mais → Insumos e conclua de novo.';
    end if;
    v_custo_massa := round(v_custo_massa * p.fornadas, 4);
    v_custo_cobertura := round(v_cobertura * v_preco_cobertura, 4);
    v_custo_g := round((v_custo_massa + v_custo_cobertura) / p_peso_final, 8);
    v_custo := case when v_emb is null then null else round(r.gramagem_unidade * v_custo_g + v_emb, 6) end;
  else
    v_custo_massa := (select cr.custo_receita from public.v_custo_receitas cr where cr.receita_id = p.receita_id);
    if v_custo_massa is not null then
      v_custo_massa := round(v_custo_massa * p.fornadas, 4);
      v_unid := round(v_custo_massa / (p_unidades_boas + v_perdidas), 6);
      v_custo := case when v_emb is null then null else round(v_unid + v_emb, 6) end;
    else
      v_unid := null;
      v_custo := null;
    end if;
  end if;

  for n in select * from privado.necessidade_producao_peso(p.id, p_unidades_boas, v_cobertura) order by insumo_id loop
    perform privado.movimentar(n.insumo_id, null, 'consumo_producao', -n.necessario,
                               (select custo_atual from public.insumos where id = n.insumo_id), 'producao', p.id, null);
  end loop;
  perform privado.travar_saldo_variacao(p.variacao_id);
  if p_unidades_boas > 0 then
    perform privado.movimentar(null, p.variacao_id, 'entrada_producao', p_unidades_boas, v_custo, 'producao', p.id, null);
  end if;
  if v_perdidas > 0 then
    if r.custeio_por_peso then
      v_custo := round(r.gramagem_unidade * v_custo_g, 6);
    else
      v_custo := v_unid;
    end if;
    perform privado.movimentar(null, p.variacao_id, 'entrada_producao', v_perdidas, v_custo, 'producao', p.id, 'Perdidas na produção');
    perform privado.movimentar(null, p.variacao_id, 'perda', -v_perdidas, v_custo, 'producao', p.id, 'Perda na produção');
  end if;
  update public.producoes
     set situacao = 'concluida', unidades_produzidas = p_unidades_boas, unidades_perdidas = v_perdidas,
         concluida_em = now(), concluida_por = auth.uid(),
         peso_cubos = case when r.custeio_por_peso then p_peso_cubos end,
         peso_final = case when r.custeio_por_peso then p_peso_final end,
         custo_massa = v_custo_massa, custo_cobertura = v_custo_cobertura, custo_por_grama = v_custo_g
   where id = p.id;
  return jsonb_build_object('ok', true, 'faltas', v_faltas);
end
$$;

-- Registrar uma produção de uma vez: produto, fornadas e quantos renderam.
create function public.registrar_producao(
  p_chave uuid, p_variacao uuid, p_fornadas numeric, p_unidades_boas numeric,
  p_unidades_perdidas numeric default 0, p_observacao text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prod uuid;
  v_res jsonb;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar produção.';
  end if;
  v_prod := public.planejar_producao(p_chave, p_variacao, p_fornadas, null, p_observacao);
  v_res := public.concluir_producao(v_prod, p_unidades_boas, p_unidades_perdidas);
  return v_res || jsonb_build_object('producao_id', v_prod);
end
$$;

-- Corrigir quanto rendeu uma produção já registrada (ajusta o produto pronto e a embalagem).
create function public.corrigir_producao(p_producao uuid, p_unidades_boas numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.producoes;
  v_dif numeric;
  v_custo numeric;
  e record;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para corrigir a produção.';
  end if;
  select * into p from public.producoes where id = p_producao for update;
  if p.id is null or p.situacao <> 'concluida' then
    raise exception 'Só dá para corrigir uma produção já registrada.';
  end if;
  if not privado.pode_cancelar(p.concluida_por, p.concluida_em) then
    raise exception 'Só o administrador corrige produções de outras pessoas ou com mais de 30 minutos.';
  end if;
  if p_unidades_boas is null or p_unidades_boas < 0 then
    raise exception 'Informe quantos renderam, como 24.';
  end if;
  v_dif := round(p_unidades_boas - p.unidades_produzidas, 2);
  if v_dif = 0 then
    return;
  end if;
  v_custo := (select m.custo_unitario from public.movimentos_estoque m
               where m.origem_tipo = 'producao' and m.origem_id = p.id and m.tipo = 'entrada_producao' and m.justificativa is null limit 1);
  perform privado.travar_saldo_variacao(p.variacao_id);
  perform privado.movimentar(null, p.variacao_id, 'ajuste', v_dif, v_custo, 'producao', p.id, 'Correção de quanto rendeu');
  for e in select ve.insumo_id, ve.quantidade * privado.fator_unidade(ve.insumo_id, ve.unidade) as por_unidade
             from public.variacao_embalagens ve where ve.variacao_id = p.variacao_id order by ve.insumo_id loop
    perform privado.travar_saldo_insumo(e.insumo_id);
    perform privado.movimentar(e.insumo_id, null, 'ajuste', round(-v_dif * e.por_unidade, 4),
                               (select custo_atual from public.insumos where id = e.insumo_id), 'producao', p.id, 'Correção de quanto rendeu');
  end loop;
  update public.producoes set unidades_produzidas = p_unidades_boas where id = p.id;
end
$$;

-- Contagem do dia: vários itens de uma vez (o saldo passa a ser o que foi contado).
create function public.registrar_contagem(p_chave uuid, p_itens jsonb, p_justificativa text default 'Contagem do dia')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_insumo uuid;
  v_variacao uuid;
  v_contado numeric;
  v_saldo numeric;
  v_dif numeric;
  v_custo numeric;
  v_n integer := 0;
  v_texto text := coalesce(nullif(btrim(p_justificativa), ''), 'Contagem do dia');
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar a contagem.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  if exists (select 1 from public.movimentos_estoque where origem_tipo = 'contagem' and origem_id = p_chave) then
    return 0;
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Não consegui ler a contagem. Atualize a página e tente de novo.';
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_insumo := nullif(v_item ->> 'insumo_id', '')::uuid;
    v_variacao := nullif(v_item ->> 'variacao_id', '')::uuid;
    v_contado := (v_item ->> 'contado')::numeric;
    if (v_insumo is null) = (v_variacao is null) then
      raise exception 'Escolha um insumo ou um produto em cada linha da contagem.';
    end if;
    if v_contado is null or v_contado < 0 then
      raise exception 'Informe quanto você contou (zero ou mais).';
    end if;
    if v_insumo is not null then
      v_saldo := privado.travar_saldo_insumo(v_insumo);
      v_custo := (select custo_atual from public.insumos where id = v_insumo);
    else
      v_saldo := privado.travar_saldo_variacao(v_variacao);
      v_custo := (select custo_unitario from public.v_custo_variacoes where variacao_id = v_variacao);
    end if;
    v_dif := round(v_contado - v_saldo, 4);
    if v_dif <> 0 then
      perform privado.movimentar(v_insumo, v_variacao, 'ajuste', v_dif, v_custo, 'contagem', p_chave, v_texto);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end
$$;

-- Simulação: quantas fornadas de cada produto, e o que falta comprar.
create function public.simular_producao(p_itens jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_produtos jsonb;
  v_insumos jsonb;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para simular.';
  end if;

  with itens as (
    select (e ->> 'variacao_id')::uuid as variacao_id, (e ->> 'fornadas')::numeric as fornadas
      from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
     where (e ->> 'fornadas')::numeric > 0
  ),
  base as (
    select s.variacao_id, s.fornadas, va.receita_id, r.custeio_por_peso, r.cobertura_insumo_id, r.cobertura_estimada,
           coalesce(cr.rendimento_efetivo, r.rendimento_unidades) as rend
      from itens s
      join public.variacoes va on va.id = s.variacao_id
      join public.receitas r on r.id = va.receita_id
      left join public.v_custo_receitas cr on cr.receita_id = r.id
  ),
  necessidade as (
    select ri.insumo_id, sum(ri.quantidade * privado.fator_unidade(ri.insumo_id, ri.unidade) * b.fornadas) as q
      from base b join public.receita_itens ri on ri.receita_id = b.receita_id group by ri.insumo_id
    union all
    select ve.insumo_id, sum(ve.quantidade * privado.fator_unidade(ve.insumo_id, ve.unidade) * b.fornadas * b.rend)
      from base b join public.variacao_embalagens ve on ve.variacao_id = b.variacao_id group by ve.insumo_id
    union all
    select b.cobertura_insumo_id, sum(b.cobertura_estimada * b.fornadas)
      from base b where b.custeio_por_peso group by b.cobertura_insumo_id
  ),
  total as (select insumo_id, sum(q) as q from necessidade group by insumo_id)
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
              'variacao_id', b.variacao_id, 'produto', privado.nome_variacao(b.variacao_id), 'fornadas', b.fornadas,
              'unidades', round(b.fornadas * b.rend, 1)) order by privado.nome_variacao(b.variacao_id)), '[]'::jsonb) from base b),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'insumo_id', i.id, 'insumo', i.nome, 'unidade', i.unidade_base, 'necessario', round(t.q, 2),
              'saldo', coalesce(sa.saldo, 0), 'falta', round(greatest(t.q - coalesce(sa.saldo, 0), 0), 2),
              'custo_falta', case when i.custo_atual is null then null
                                  else round(greatest(t.q - coalesce(sa.saldo, 0), 0) * i.custo_atual, 2) end)
            order by i.tipo, i.nome), '[]'::jsonb)
       from total t join public.insumos i on i.id = t.insumo_id
       left join public.saldos_estoque sa on sa.insumo_id = i.id)
    into v_produtos, v_insumos;

  return jsonb_build_object('produtos', v_produtos, 'insumos', v_insumos);
end
$$;

grant execute on function
  public.registrar_producao(uuid, uuid, numeric, numeric, numeric, text),
  public.corrigir_producao(uuid, numeric),
  public.registrar_contagem(uuid, jsonb, text),
  public.simular_producao(jsonb)
  to authenticated;
