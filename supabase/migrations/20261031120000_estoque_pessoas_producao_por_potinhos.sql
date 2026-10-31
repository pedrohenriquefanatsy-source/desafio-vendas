-- Fatia 15: encomenda paga antes conta no dia do pagamento (mesmo depois de entregue); produção registrada só
-- pelos potinhos prontos (as fornadas saem do rendimento da receita); estoque de cada pessoa (o que cada uma
-- pegou para vender sai do estoque geral e volta quando devolve; a venda dela consome primeiro o que está com ela).

-- ── Faturamento: encomenda paga antes da entrega fica no dia do pagamento ───
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

-- ── Produção pelos potinhos prontos ─────────────────────────────────────────
alter table public.producoes add column fornadas_pelo_rendimento boolean not null default false;

-- Sem fornadas (nulo), elas saem de quantos ficaram prontos ÷ quanto a receita rende por fornada.
create or replace function public.registrar_producao(
  p_chave uuid, p_variacao uuid, p_fornadas numeric, p_unidades_boas numeric,
  p_unidades_perdidas numeric default 0, p_observacao text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_prod uuid;
  v_res jsonb;
  v_fornadas numeric := p_fornadas;
  v_rendimento numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar produção.';
  end if;
  if v_fornadas is null then
    if p_unidades_boas is null or p_unidades_boas < 0 or coalesce(p_unidades_perdidas, 0) < 0
       or p_unidades_boas + coalesce(p_unidades_perdidas, 0) = 0 then
      raise exception 'Informe quantos potinhos ficaram prontos, como 24.';
    end if;
    select r.rendimento_unidades into v_rendimento
      from public.variacoes v join public.receitas r on r.id = v.receita_id where v.id = p_variacao;
    if coalesce(v_rendimento, 0) <= 0 then
      raise exception 'Este sabor não tem receita com rendimento. Crie a receita em Mais → Produtos e sabores.';
    end if;
    v_fornadas := greatest(round((p_unidades_boas + coalesce(p_unidades_perdidas, 0)) / v_rendimento, 2), 0.01);
  end if;
  v_prod := public.planejar_producao(p_chave, p_variacao, v_fornadas, null, p_observacao);
  if p_fornadas is null then
    update public.producoes set fornadas_pelo_rendimento = true where id = v_prod and situacao = 'planejada';
  end if;
  v_res := public.concluir_producao(v_prod, p_unidades_boas, p_unidades_perdidas);
  return v_res || jsonb_build_object('producao_id', v_prod, 'fornadas', (select fornadas from public.producoes where id = v_prod));
end
$$;

-- Corrigir quanto rendeu. Se as fornadas vieram do rendimento, elas e os ingredientes também se ajustam.
create or replace function public.corrigir_producao(p_producao uuid, p_unidades_boas numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.producoes;
  v_dif numeric;
  v_custo numeric;
  v_fornadas numeric;
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
  if p_unidades_boas is null or p_unidades_boas < 0 or p_unidades_boas + coalesce(p.unidades_perdidas, 0) = 0 then
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
    if round(-v_dif * e.por_unidade, 4) <> 0 then
      perform privado.travar_saldo_insumo(e.insumo_id);
      perform privado.movimentar(e.insumo_id, null, 'ajuste', round(-v_dif * e.por_unidade, 4),
                                 (select custo_atual from public.insumos where id = e.insumo_id), 'producao', p.id, 'Correção de quanto rendeu');
    end if;
  end loop;
  if p.fornadas_pelo_rendimento then
    v_fornadas := greatest(round(p.fornadas * (p_unidades_boas + coalesce(p.unidades_perdidas, 0))
                                 / (p.unidades_produzidas + coalesce(p.unidades_perdidas, 0)), 2), 0.01);
    for e in select ri.insumo_id, round(-(v_fornadas - p.fornadas) * ri.quantidade * privado.fator_unidade(ri.insumo_id, ri.unidade), 4) as qtd
               from public.receita_itens ri where ri.receita_id = p.receita_id order by ri.insumo_id loop
      if e.qtd <> 0 then
        perform privado.travar_saldo_insumo(e.insumo_id);
        perform privado.movimentar(e.insumo_id, null, 'ajuste', e.qtd,
                                   (select custo_atual from public.insumos where id = e.insumo_id), 'producao', p.id, 'Correção de quanto rendeu');
      end if;
    end loop;
    update public.producoes set fornadas = v_fornadas, unidades_previstas = round(v_fornadas * (p.unidades_previstas / p.fornadas), 2)
     where id = p.id;
  end if;
  update public.producoes set unidades_produzidas = p_unidades_boas where id = p.id;
end
$$;

-- ── Estoque de cada pessoa ──────────────────────────────────────────────────
-- Livro do que cada pessoa leva para vender: + pegou, − devolveu ou vendeu. O estoque geral (freezer) é o saldo
-- do produto menos o que está com as pessoas.
create table public.estoque_pessoas (
  id bigint generated always as identity primary key,
  desafio_id uuid references public.desafios (id),
  participante_id uuid not null references public.perfis (id),
  variacao_id uuid not null references public.variacoes (id),
  tipo text not null check (tipo in ('retirada', 'devolucao', 'venda', 'estorno_venda')),
  quantidade numeric(12, 2) not null check (quantidade <> 0),
  venda_id uuid references public.vendas (id),
  chave_idempotencia uuid,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index estoque_pessoas_saldo on public.estoque_pessoas (participante_id, variacao_id);
create index estoque_pessoas_venda on public.estoque_pessoas (venda_id);
create index estoque_pessoas_variacao on public.estoque_pessoas (variacao_id);
create index estoque_pessoas_chave on public.estoque_pessoas (chave_idempotencia);
alter table public.estoque_pessoas enable row level security;
create policy estoque_pessoas_leitura on public.estoque_pessoas for select to authenticated using (privado.eh_participante());
grant select on public.estoque_pessoas to authenticated;
revoke insert, update, delete, truncate on public.estoque_pessoas from authenticated;

create function privado.saldo_pessoa(p_participante uuid, p_variacao uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(quantidade), 0) from public.estoque_pessoas where participante_id = p_participante and variacao_id = p_variacao
$$;

create function privado.com_pessoas(p_variacao uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(quantidade), 0) from public.estoque_pessoas where variacao_id = p_variacao
$$;

create view public.v_estoque_pessoas with (security_invoker = true) as
select ep.participante_id, pe.nome as participante, ep.variacao_id, pr.nome as produto, va.nome as variacao,
       sum(ep.quantidade) as saldo, max(ep.criado_em) as ultima_movimentacao
from public.estoque_pessoas ep
join public.perfis pe on pe.id = ep.participante_id
join public.variacoes va on va.id = ep.variacao_id
join public.produtos pr on pr.id = va.produto_id
group by ep.participante_id, pe.nome, ep.variacao_id, pr.nome, va.nome
having sum(ep.quantidade) <> 0;
revoke insert, update, delete on public.v_estoque_pessoas from authenticated;

create or replace view public.v_estoque_produtos with (security_invoker = true) as
select
  cv.variacao_id, cv.produto_id, cv.produto, cv.variacao, cv.tipo, cv.ativa, cv.custo_unitario,
  coalesce(s.saldo, 0) as saldo,
  round(coalesce(s.saldo, 0) * cv.custo_unitario, 2) as valor_estoque,
  coalesce(c.com_pessoas, 0) as com_pessoas,
  coalesce(s.saldo, 0) - coalesce(c.com_pessoas, 0) as no_estoque
from public.v_custo_variacoes cv
left join public.saldos_estoque s on s.variacao_id = cv.variacao_id
left join (select variacao_id, sum(quantidade) as com_pessoas from public.estoque_pessoas group by variacao_id) c
  on c.variacao_id = cv.variacao_id
where cv.tipo = 'simples';

-- Pegar para vender (sai do estoque geral) ou devolver (volta). Cada pessoa mexe no próprio; o administrador,
-- no de qualquer participante. p_itens: [{"variacao_id", "quantidade"}].
create function public.mover_estoque_pessoa(p_chave uuid, p_tipo text, p_itens jsonb, p_participante uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pessoa uuid := coalesce(p_participante, auth.uid());
  v_item jsonb;
  v_var uuid;
  v_qtd numeric;
  v_nome text;
  v_disponivel numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  if exists (select 1 from public.estoque_pessoas where chave_idempotencia = p_chave) then
    return;
  end if;
  if p_tipo not in ('retirada', 'devolucao') then
    raise exception 'Escolha pegar ou devolver.';
  end if;
  if v_pessoa <> auth.uid() and not privado.eh_admin() then
    raise exception 'Só o administrador registra para outra pessoa.';
  end if;
  if not exists (select 1 from public.perfis where id = v_pessoa and ativo) then
    raise exception 'Participante não encontrado ou inativo.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha pelo menos um produto.';
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_var := (v_item ->> 'variacao_id')::uuid;
    v_qtd := round((v_item ->> 'quantidade')::numeric, 2);
    if v_qtd is null or v_qtd <= 0 or v_qtd > 1000 then
      raise exception 'A quantidade precisa ser maior que zero, como 10.';
    end if;
    select pr.nome || case when va.nome is null or va.nome = 'Única' then '' else ' · ' || va.nome end into v_nome
      from public.variacoes va join public.produtos pr on pr.id = va.produto_id
     where va.id = v_var and pr.tipo = 'simples';
    if v_nome is null then
      raise exception 'Produto não encontrado (kits não entram: pegue os produtos que formam o kit).';
    end if;
    perform privado.travar_saldo_variacao(v_var);
    if p_tipo = 'retirada' then
      v_disponivel := coalesce((select saldo from public.saldos_estoque where variacao_id = v_var), 0) - privado.com_pessoas(v_var);
      if v_qtd > v_disponivel then
        raise exception 'No estoque geral só tem % de %. Registre a produção ou confira na Contagem do dia.',
          trim_scale(greatest(v_disponivel, 0)), v_nome;
      end if;
    else
      v_disponivel := privado.saldo_pessoa(v_pessoa, v_var);
      if v_qtd > v_disponivel then
        raise exception 'Só tem % de % com esta pessoa.', trim_scale(greatest(v_disponivel, 0)), v_nome;
      end if;
    end if;
    insert into public.estoque_pessoas (desafio_id, participante_id, variacao_id, tipo, quantidade, chave_idempotencia, criado_por)
    values (privado.desafio_atual_id(), v_pessoa, v_var, p_tipo, case when p_tipo = 'retirada' then v_qtd else -v_qtd end, p_chave, auth.uid());
  end loop;
end
$$;
grant execute on function public.mover_estoque_pessoa(uuid, text, jsonb, uuid) to authenticated;

-- Venda (ou doação) baixa o estoque: primeiro sai do que está com quem vendeu. Cancelar devolve para essa pessoa.
create function privado.estoque_pessoa_na_venda()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pessoa uuid;
  v_tem numeric;
  v_usado numeric;
begin
  if new.variacao_id is null or new.origem_tipo is distinct from 'venda' then
    return null;
  end if;
  select participante_id into v_pessoa from public.vendas where id = new.origem_id;
  if v_pessoa is null then
    return null;
  end if;
  if new.tipo in ('venda', 'doacao') and new.quantidade_base < 0 then
    v_tem := privado.saldo_pessoa(v_pessoa, new.variacao_id);
    if v_tem > 0 then
      insert into public.estoque_pessoas (desafio_id, participante_id, variacao_id, tipo, quantidade, venda_id, criado_por)
      values (new.desafio_id, v_pessoa, new.variacao_id, 'venda', -least(v_tem, -new.quantidade_base), new.origem_id, new.criado_por);
    end if;
  elsif new.tipo = 'estorno' and new.quantidade_base > 0 then
    v_usado := -(select coalesce(sum(quantidade), 0) from public.estoque_pessoas
                  where venda_id = new.origem_id and variacao_id = new.variacao_id and participante_id = v_pessoa);
    if v_usado > 0 then
      insert into public.estoque_pessoas (desafio_id, participante_id, variacao_id, tipo, quantidade, venda_id, criado_por)
      values (new.desafio_id, v_pessoa, new.variacao_id, 'estorno_venda', least(v_usado, new.quantidade_base), new.origem_id, new.criado_por);
    end if;
  end if;
  return null;
end
$$;
create trigger estoque_pessoa_na_venda after insert on public.movimentos_estoque
  for each row execute function privado.estoque_pessoa_na_venda();
