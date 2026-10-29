-- Fatia 11: custeio por peso (cubos de brownie com cobertura de chocolate).
-- A receita pode ser custeada pelo peso: massa (ingredientes) + chocolate gasto, que se descobre pesando os
-- cubos antes e depois de molhar. O potinho tem uma gramagem padrão; o custo dele é gramagem x custo por grama
-- + embalagem. O custo por grama vem da última fornada pesada (as proporções reais) com os preços de hoje.

alter table public.receitas
  add column custeio_por_peso boolean not null default false,
  add column cobertura_insumo_id uuid references public.insumos (id),
  add column peso_cubos_estimado numeric(12, 2) check (peso_cubos_estimado is null or peso_cubos_estimado > 0),
  add column cobertura_estimada numeric(12, 2) check (cobertura_estimada is null or cobertura_estimada > 0),
  add column gramagem_unidade numeric(10, 2) check (gramagem_unidade is null or gramagem_unidade > 0),
  add constraint receitas_peso_completo check (
    not custeio_por_peso
    or (cobertura_insumo_id is not null and peso_cubos_estimado is not null and cobertura_estimada is not null and gramagem_unidade is not null)
  );

alter table public.producoes
  add column peso_cubos numeric(12, 2) check (peso_cubos is null or peso_cubos > 0),
  add column peso_final numeric(12, 2),
  add column custo_massa numeric(14, 4),
  add column custo_cobertura numeric(14, 4),
  add column custo_por_grama numeric(14, 8),
  add constraint producoes_peso_coerente check (peso_final is null or (peso_cubos is not null and peso_final > peso_cubos));

-- Custo por grama de cada receita custeada por peso: usa a última fornada pesada; sem ela, a estimativa da receita.
create view public.v_custeio_peso with (security_invoker = true) as
with massa as (
  select r.id as receita_id,
         case when count(it.id) filter (where it.custo_atual is null) > 0 then null
              else coalesce(sum(it.custo), 0) end as custo_massa_fornada
  from public.receitas r
  left join public.v_custo_receita_itens it on it.receita_id = r.id
  where r.custeio_por_peso
  group by r.id
),
ultima as (
  select distinct on (p.receita_id) p.receita_id, p.fornadas, p.peso_cubos, p.peso_final, p.concluida_em
  from public.producoes p
  where p.situacao = 'concluida' and p.peso_final is not null
  order by p.receita_id, p.concluida_em desc, p.id
),
base as (
  select r.id as receita_id, r.gramagem_unidade, r.cobertura_insumo_id, m.custo_massa_fornada,
         i.nome as cobertura, i.custo_atual as custo_cobertura_g,
         coalesce(u.fornadas, 1) as fornadas_base,
         coalesce(u.peso_cubos, r.peso_cubos_estimado) as cubos_base,
         coalesce(u.peso_final, r.peso_cubos_estimado + r.cobertura_estimada) as final_base,
         u.receita_id is not null as pesada,
         u.concluida_em as pesada_em
  from public.receitas r
  join massa m on m.receita_id = r.id
  join public.insumos i on i.id = r.cobertura_insumo_id
  left join ultima u on u.receita_id = r.id
)
select
  b.receita_id, b.gramagem_unidade as gramagem, b.cobertura_insumo_id, b.cobertura,
  b.custo_massa_fornada, b.custo_cobertura_g,
  b.fornadas_base, b.cubos_base, b.final_base, b.final_base - b.cubos_base as cobertura_base,
  case when b.pesada then 'ultima_fornada' else 'estimativa' end as origem,
  b.pesada_em,
  b.custo_massa_fornada is null or b.custo_cobertura_g is null as sem_preco,
  b.custo_cobertura_g is null as cobertura_sem_preco,
  case when b.custo_massa_fornada is null or b.custo_cobertura_g is null then null
       else (b.custo_massa_fornada * b.fornadas_base + (b.final_base - b.cubos_base) * b.custo_cobertura_g) / b.final_base end as custo_por_grama,
  case when b.custo_massa_fornada is null or b.custo_cobertura_g is null then null
       else b.gramagem_unidade * (b.custo_massa_fornada * b.fornadas_base + (b.final_base - b.cubos_base) * b.custo_cobertura_g) / b.final_base end as custo_unidade
from base b;

create or replace view public.v_custo_receitas with (security_invoker = true) as
with base as (
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
  group by r.id
)
select
  b.receita_id, b.nome, b.rendimento_unidades, b.ativa, b.itens, b.itens_sem_preco, b.insumos_sem_preco, b.custo_receita,
  case when vp.receita_id is not null then vp.custo_unidade else b.custo_por_unidade end as custo_por_unidade,
  vp.receita_id is not null as custeio_por_peso,
  vp.custo_por_grama, vp.origem as origem_custo_peso, vp.gramagem as gramagem_unidade
from base b
left join public.v_custeio_peso vp on vp.receita_id = b.receita_id;

create function privado.necessidade_producao_peso(p_producao uuid, p_unidades numeric, p_cobertura numeric)
returns table (insumo_id uuid, necessario numeric)
language sql stable security definer set search_path = ''
as $$
  select x.insumo_id, round(sum(x.necessario), 4)
  from (
    select n.insumo_id, n.necessario from privado.necessidade_producao(p_producao, p_unidades) n
    union all
    select r.cobertura_insumo_id, p_cobertura
      from public.producoes p join public.receitas r on r.id = p.receita_id
     where p.id = p_producao and r.custeio_por_peso and coalesce(p_cobertura, 0) > 0
  ) x
  group by x.insumo_id
$$;
grant execute on function privado.necessidade_producao_peso(uuid, numeric, numeric) to authenticated;

create or replace view public.v_lista_compras with (security_invoker = true) as
with planejado as (
  select n.insumo_id, sum(n.necessario) as necessario
  from public.producoes p
  join public.receitas r on r.id = p.receita_id
  cross join lateral privado.necessidade_producao_peso(
    p.id, p.unidades_previstas, case when r.custeio_por_peso then r.cobertura_estimada * p.fornadas else 0 end) n
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

revoke insert, update, delete on public.v_custeio_peso from authenticated;

create function public.definir_custeio_peso(
  p_receita uuid, p_cobertura_insumo uuid, p_peso_cubos numeric, p_cobertura numeric, p_gramagem numeric
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_base text;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador altera receitas.';
  end if;
  perform 1 from public.receitas where id = p_receita for update;
  if not found then
    raise exception 'Receita não encontrada.';
  end if;
  if p_peso_cubos is null or p_peso_cubos <= 0 then
    raise exception 'Informe o peso esperado dos cubos de uma fornada, em gramas, como 2000.';
  end if;
  if p_cobertura is null or p_cobertura <= 0 then
    raise exception 'Informe quanto chocolate se espera gastar em uma fornada, em gramas, como 700.';
  end if;
  if p_gramagem is null or p_gramagem <= 0 then
    raise exception 'Informe a gramagem de cada potinho, em gramas, como 150.';
  end if;
  select unidade_base into v_base from public.insumos where id = p_cobertura_insumo and ativo;
  if v_base is null then
    raise exception 'Escolha o insumo da cobertura (o chocolate).';
  end if;
  if v_base <> 'g' then
    raise exception 'A cobertura precisa ser um insumo medido em gramas. Cadastre o chocolate com a medida g.';
  end if;
  update public.receitas
     set custeio_por_peso = true, cobertura_insumo_id = p_cobertura_insumo, peso_cubos_estimado = round(p_peso_cubos, 2),
         cobertura_estimada = round(p_cobertura, 2), gramagem_unidade = round(p_gramagem, 2),
         rendimento_unidades = greatest(0.01, round((p_peso_cubos + p_cobertura) / p_gramagem, 2))
   where id = p_receita;
end
$$;

create function public.voltar_custeio_por_rendimento(p_receita uuid, p_rendimento numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador altera receitas.';
  end if;
  if p_rendimento is null or p_rendimento <= 0 then
    raise exception 'Informe quantas unidades a receita rende, como 24.';
  end if;
  update public.receitas
     set custeio_por_peso = false, cobertura_insumo_id = null, peso_cubos_estimado = null, cobertura_estimada = null,
         gramagem_unidade = null, rendimento_unidades = p_rendimento
   where id = p_receita;
  if not found then
    raise exception 'Receita não encontrada.';
  end if;
end
$$;

create function public.cadastrar_receita_peso(
  p_variacao uuid, p_itens jsonb, p_cobertura_insumo uuid, p_peso_cubos numeric, p_cobertura numeric, p_gramagem numeric
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_receita uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cadastra receitas.';
  end if;
  if p_gramagem is null or p_gramagem <= 0 then
    raise exception 'Informe a gramagem de cada potinho, em gramas, como 150.';
  end if;
  if p_peso_cubos is null or p_cobertura is null or p_peso_cubos <= 0 or p_cobertura <= 0 then
    raise exception 'Informe o peso esperado dos cubos e o chocolate esperado de uma fornada, em gramas.';
  end if;
  v_receita := public.cadastrar_receita_variacao(p_variacao, greatest(0.01, round((p_peso_cubos + p_cobertura) / p_gramagem, 2)), p_itens);
  perform public.definir_custeio_peso(v_receita, p_cobertura_insumo, p_peso_cubos, p_cobertura, p_gramagem);
  return v_receita;
end
$$;

drop function public.concluir_producao(uuid, numeric, numeric);
create function public.concluir_producao(
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
    raise exception 'Informe quantas unidades ficaram boas (e as perdidas, se houver).';
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
  if jsonb_array_length(v_faltas) > 0 then
    return jsonb_build_object('ok', false, 'faltas', v_faltas);
  end if;

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
    v_emb := (select case when bool_or(e.sem_preco) then null else coalesce(sum(e.custo), 0) end
                from public.v_custo_embalagens e where e.variacao_id = p.variacao_id);
  end if;

  for n in select * from privado.necessidade_producao_peso(p.id, p_unidades_boas, v_cobertura) order by insumo_id loop
    perform privado.movimentar(n.insumo_id, null, 'consumo_producao', -n.necessario,
                               (select custo_atual from public.insumos where id = n.insumo_id), 'producao', p.id, null);
  end loop;
  if r.custeio_por_peso then
    v_custo := case when v_emb is null then null else round(r.gramagem_unidade * v_custo_g + v_emb, 6) end;
  else
    v_custo := (select custo_unitario from public.v_custo_variacoes where variacao_id = p.variacao_id);
  end if;
  perform privado.travar_saldo_variacao(p.variacao_id);
  if p_unidades_boas > 0 then
    perform privado.movimentar(null, p.variacao_id, 'entrada_producao', p_unidades_boas, v_custo, 'producao', p.id, null);
  end if;
  if v_perdidas > 0 then
    if r.custeio_por_peso then
      v_custo := round(r.gramagem_unidade * v_custo_g, 6);
    else
      v_custo := (select custo_por_unidade from public.v_custo_receitas where receita_id = p.receita_id);
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
  return jsonb_build_object('ok', true);
end
$$;

grant execute on function
  public.definir_custeio_peso(uuid, uuid, numeric, numeric, numeric),
  public.voltar_custeio_por_rendimento(uuid, numeric),
  public.cadastrar_receita_peso(uuid, jsonb, uuid, numeric, numeric, numeric),
  public.concluir_producao(uuid, numeric, numeric, numeric, numeric)
  to authenticated;

create or replace function public.copiar_receita_variacao(p_origem uuid, p_destino uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  o public.variacoes;
  d public.variacoes;
  v_receita uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cadastra receitas.';
  end if;
  select * into o from public.variacoes where id = p_origem;
  select * into d from public.variacoes where id = p_destino for update;
  if o.id is null or d.id is null or o.id = d.id then
    raise exception 'Escolha outro sabor para copiar.';
  end if;
  if o.receita_id is null then
    raise exception 'O sabor escolhido ainda não tem receita.';
  end if;
  if (select tipo from public.produtos where id = d.produto_id) = 'kit' then
    raise exception 'Kit não tem receita: o custo vem dos produtos que formam o kit.';
  end if;
  if d.receita_id is not null and exists (select 1 from public.receita_itens where receita_id = d.receita_id) then
    raise exception 'Este sabor já tem ingredientes. Tire-os antes de copiar de outro sabor.';
  end if;

  v_receita := d.receita_id;
  if v_receita is null then
    insert into public.receitas (nome, rendimento_unidades, observacao, custeio_por_peso, cobertura_insumo_id,
                                 peso_cubos_estimado, cobertura_estimada, gramagem_unidade)
    select privado.nome_receita(p_destino), rendimento_unidades, observacao, custeio_por_peso, cobertura_insumo_id,
           peso_cubos_estimado, cobertura_estimada, gramagem_unidade from public.receitas where id = o.receita_id
    returning id into v_receita;
    update public.variacoes set receita_id = v_receita where id = p_destino;
  else
    update public.receitas r set rendimento_unidades = o2.rendimento_unidades, observacao = o2.observacao,
           custeio_por_peso = o2.custeio_por_peso, cobertura_insumo_id = o2.cobertura_insumo_id,
           peso_cubos_estimado = o2.peso_cubos_estimado, cobertura_estimada = o2.cobertura_estimada,
           gramagem_unidade = o2.gramagem_unidade
      from public.receitas o2 where o2.id = o.receita_id and r.id = v_receita;
  end if;
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
  select v_receita, insumo_id, quantidade, unidade from public.receita_itens where receita_id = o.receita_id;
  if not exists (select 1 from public.variacao_embalagens where variacao_id = p_destino) then
    insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade)
    select p_destino, insumo_id, quantidade, unidade from public.variacao_embalagens where variacao_id = p_origem;
  end if;
  return v_receita;
end
$$;

create or replace function privado.bloqueio_exclusao(p_tipo text, p_id uuid, p_ignorar_ultimo boolean default false)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_nome text;
begin
  if p_tipo = 'insumo' then
    select nome into v_nome from public.insumos where id = p_id;
    if v_nome is null then
      return 'Insumo não encontrado.';
    end if;
    if exists (select 1 from public.receita_itens where insumo_id = p_id)
       or exists (select 1 from public.receitas where cobertura_insumo_id = p_id)
       or exists (select 1 from public.variacao_embalagens where insumo_id = p_id) then
      return 'Está em uma receita ou em uma embalagem de produto. Tire-o de lá antes de excluir.';
    end if;
    if exists (select 1 from public.compra_itens where insumo_id = p_id)
       or exists (select 1 from public.movimentos_estoque where insumo_id = p_id and tipo <> 'ajuste') then
      return 'Já tem compras ou movimentações no estoque. Para o histórico continuar certo, desative em vez de excluir.';
    end if;
    return null;
  elsif p_tipo = 'variacao' then
    select privado.nome_variacao(id) into v_nome from public.variacoes where id = p_id;
    if v_nome is null then
      return 'Sabor não encontrado.';
    end if;
    if exists (select 1 from public.venda_itens where variacao_id = p_id) then
      return v_nome || ' já tem vendas. Para o histórico continuar certo, desative em vez de excluir.';
    end if;
    if exists (select 1 from public.producoes where variacao_id = p_id)
       or exists (select 1 from public.movimentos_estoque where variacao_id = p_id and tipo <> 'ajuste') then
      return v_nome || ' já tem produção ou movimentações no estoque. Desative em vez de excluir.';
    end if;
    if exists (select 1 from public.kit_componentes where componente_variacao_id = p_id) then
      return v_nome || ' faz parte de um kit. Tire-o do kit antes de excluir.';
    end if;
    if not p_ignorar_ultimo
       and (select count(*) from public.variacoes where produto_id = (select produto_id from public.variacoes where id = p_id)) = 1 then
      return 'É o único sabor do produto. Para tirar tudo, exclua o produto.';
    end if;
    return null;
  elsif p_tipo = 'produto' then
    if not exists (select 1 from public.produtos where id = p_id) then
      return 'Produto não encontrado.';
    end if;
    return (select min(privado.bloqueio_exclusao('variacao', va.id, true)) from public.variacoes va where va.produto_id = p_id);
  end if;
  return 'Tipo desconhecido.';
end
$$;
