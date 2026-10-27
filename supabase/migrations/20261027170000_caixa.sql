-- Fatia 5: despesas, reembolsos, aportes, ajustes de caixa e resultado (Seções 4.5 e 4.6).
-- O caixa é só dinheiro que entrou ou saiu (livro lancamentos_caixa, da fatia 3).
-- O resultado é outra conta: margem das vendas − custo das perdas − despesas.
-- Nada é apagado: correção por cancelamento com motivo, que estorna o caixa.

create type public.origem_aporte as enum ('participante', 'pj');

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid references public.desafios (id),
  data date not null default ((now() at time zone 'America/Fortaleza')::date),
  descricao text not null check (char_length(btrim(descricao)) between 2 and 120),
  categoria text check (categoria is null or char_length(categoria) <= 40),
  valor numeric(12, 2) not null check (valor > 0),
  pago_por public.pago_por not null,
  participante_id uuid references public.perfis (id),
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
create index despesas_desafio on public.despesas (desafio_id, data);
create index despesas_participante on public.despesas (participante_id);

create table public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  participante_id uuid not null references public.perfis (id),
  valor numeric(12, 2) not null check (valor > 0),
  data date not null default ((now() at time zone 'America/Fortaleza')::date),
  observacao text check (observacao is null or char_length(observacao) <= 200),
  situacao public.situacao_registro not null default 'ativa',
  chave_idempotencia uuid not null unique,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);
create index reembolsos_participante on public.reembolsos (participante_id);

create table public.aportes (
  id uuid primary key default gen_random_uuid(),
  desafio_id uuid references public.desafios (id),
  origem public.origem_aporte not null,
  participante_id uuid references public.perfis (id),
  valor numeric(12, 2) not null check (valor > 0),
  data date not null default ((now() at time zone 'America/Fortaleza')::date),
  observacao text check (observacao is null or char_length(observacao) <= 200),
  situacao public.situacao_registro not null default 'ativa',
  chave_idempotencia uuid not null unique,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  check (origem = 'pj' or participante_id is not null)
);
create index aportes_participante on public.aportes (participante_id);
create index aportes_desafio on public.aportes (desafio_id);

-- ── A reembolsar (Seção 4.5, três estados) ───────────────────────────────────
-- Devido a cada participante = compras e despesas que pagou do bolso (não canceladas)
-- − reembolsos já pagos a ele (não cancelados).
create view public.v_reembolsos_devidos with (security_invoker = true) as
with pago as (
  select participante_id, total as valor from public.compras where pago_por = 'participante' and situacao = 'ativa'
  union all
  select participante_id, valor from public.despesas where pago_por = 'participante' and situacao = 'ativa'
),
devolvido as (
  select participante_id, sum(valor) as valor from public.reembolsos where situacao = 'ativa' group by participante_id
)
select
  pe.id as participante_id, pe.nome as participante,
  coalesce(sum(pg.valor), 0) as pago_do_bolso,
  coalesce(max(dv.valor), 0) as reembolsado,
  coalesce(sum(pg.valor), 0) - coalesce(max(dv.valor), 0) as devido
from public.perfis pe
left join pago pg on pg.participante_id = pe.id
left join devolvido dv on dv.participante_id = pe.id
group by pe.id, pe.nome
having coalesce(sum(pg.valor), 0) > 0 or coalesce(max(dv.valor), 0) > 0;

create function privado.devido_a(p_participante uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select sum(total) from public.compras where pago_por = 'participante' and situacao = 'ativa' and participante_id = p_participante), 0)
  + coalesce((select sum(valor) from public.despesas where pago_por = 'participante' and situacao = 'ativa' and participante_id = p_participante), 0)
  - coalesce((select sum(valor) from public.reembolsos where situacao = 'ativa' and participante_id = p_participante), 0)
$$;

create function privado.lancar_caixa(p_tipo public.tipo_lancamento_caixa, p_valor numeric, p_descricao text, p_origem_tipo text, p_origem_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
  values (privado.desafio_atual_id(), p_tipo, p_valor, p_descricao, p_origem_tipo, p_origem_id, auth.uid())
$$;

-- Cancelar compra paga do bolso que já foi reembolsada deixaria a dívida negativa: recusa.
create or replace function public.cancelar_compra(p_compra uuid, p_motivo text)
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
  if c.pago_por = 'participante' then
    perform pg_advisory_xact_lock(hashtext('reembolso:' || c.participante_id::text));
    if privado.devido_a(c.participante_id) < c.total then
      raise exception 'Esta compra já foi reembolsada. Cancele o reembolso antes (Caixa → A reembolsar).';
    end if;
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

-- ── Despesa ──────────────────────────────────────────────────────────────────
-- Algo que não vira estoque (Uber, adesivos…). Entra no resultado uma vez, na data dela.
-- Pago pelo caixa: sai do caixa agora. Do bolso: vira "a reembolsar"; o caixa só cai no reembolso.
create function public.registrar_despesa(
  p_chave uuid, p_valor numeric, p_descricao text, p_categoria text, p_pago_por public.pago_por, p_data date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_valor numeric := round(p_valor, 2);
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo para registrar despesas.';
  end if;
  select id into v_id from public.despesas where chave_idempotencia = p_chave;
  if v_id is not null then
    return v_id;
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe o valor da despesa, como 15,00.';
  end if;
  if p_descricao is null or char_length(btrim(p_descricao)) < 2 then
    raise exception 'Diga o que foi a despesa (ex.: Uber, adesivos).';
  end if;
  if p_data is not null and p_data > (now() at time zone 'America/Fortaleza')::date then
    raise exception 'A data da despesa não pode ser no futuro.';
  end if;
  insert into public.despesas (desafio_id, data, descricao, categoria, valor, pago_por, participante_id, chave_idempotencia)
  values (privado.desafio_atual_id(), coalesce(p_data, (now() at time zone 'America/Fortaleza')::date), btrim(p_descricao),
          nullif(btrim(p_categoria), ''), v_valor, p_pago_por,
          case when p_pago_por = 'participante' then auth.uid() end, p_chave)
  returning id into v_id;
  if p_pago_por = 'caixa' then
    perform privado.lancar_caixa('despesa', -v_valor, 'Despesa · ' || btrim(p_descricao), 'despesa', v_id);
  end if;
  return v_id;
end
$$;

create function public.cancelar_despesa(p_despesa uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  d public.despesas;
begin
  select * into d from public.despesas where id = p_despesa for update;
  if d.id is null then
    raise exception 'Despesa não encontrada.';
  end if;
  if d.situacao = 'cancelada' then
    return;
  end if;
  if not privado.pode_cancelar(d.criado_por, d.criado_em) then
    raise exception 'Só o administrador cancela despesas de outras pessoas ou com mais de 30 minutos.';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do cancelamento.';
  end if;
  if d.pago_por = 'participante' then
    perform pg_advisory_xact_lock(hashtext('reembolso:' || d.participante_id::text));
    if privado.devido_a(d.participante_id) < d.valor then
      raise exception 'Esta despesa já foi reembolsada. Cancele o reembolso antes (Caixa → A reembolsar).';
    end if;
  end if;
  update public.despesas
     set situacao = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
   where id = d.id;
  if d.pago_por = 'caixa' then
    perform privado.lancar_caixa('estorno', d.valor, 'Cancelamento de despesa: ' || btrim(p_motivo), 'despesa', d.id);
  end if;
end
$$;

-- ── Reembolso (só o administrador paga) ──────────────────────────────────────
-- Saída de caixa que liquida a dívida com o participante. Não mexe no resultado de novo.
create function public.pagar_reembolso(p_chave uuid, p_participante uuid, p_valor numeric, p_observacao text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_valor numeric := round(p_valor, 2);
  v_devido numeric;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador registra reembolsos.';
  end if;
  select id into v_id from public.reembolsos where chave_idempotencia = p_chave;
  if v_id is not null then
    return v_id;
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe o valor do reembolso.';
  end if;
  -- Trava por participante: dois reembolsos ao mesmo tempo não passam do devido.
  perform pg_advisory_xact_lock(hashtext('reembolso:' || p_participante::text));
  v_devido := privado.devido_a(p_participante);
  if v_valor > v_devido then
    raise exception 'O reembolso (%) passa do que o desafio deve a essa pessoa (%).', v_valor, v_devido;
  end if;
  insert into public.reembolsos (participante_id, valor, observacao, chave_idempotencia)
  values (p_participante, v_valor, nullif(btrim(p_observacao), ''), p_chave)
  returning id into v_id;
  perform privado.lancar_caixa('reembolso', -v_valor,
    'Reembolso · ' || coalesce((select nome from public.perfis where id = p_participante), 'participante'), 'reembolso', v_id);
  return v_id;
end
$$;

create function public.cancelar_reembolso(p_reembolso uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reembolsos;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cancela reembolsos.';
  end if;
  select * into r from public.reembolsos where id = p_reembolso for update;
  if r.id is null then
    raise exception 'Reembolso não encontrado.';
  end if;
  if r.situacao = 'cancelada' then
    return;
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do cancelamento.';
  end if;
  update public.reembolsos
     set situacao = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
   where id = r.id;
  perform privado.lancar_caixa('estorno', r.valor, 'Cancelamento de reembolso: ' || btrim(p_motivo), 'reembolso', r.id);
end
$$;

-- ── Aporte (só o administrador) ──────────────────────────────────────────────
-- Dinheiro colocado no caixa por um participante ou pela PJ. Não é receita.
create function public.registrar_aporte(
  p_chave uuid, p_origem public.origem_aporte, p_participante uuid, p_valor numeric, p_observacao text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_valor numeric := round(p_valor, 2);
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador registra aportes.';
  end if;
  select id into v_id from public.aportes where chave_idempotencia = p_chave;
  if v_id is not null then
    return v_id;
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'Informe o valor do aporte.';
  end if;
  if p_origem = 'participante' and p_participante is null then
    raise exception 'Escolha quem fez o aporte.';
  end if;
  insert into public.aportes (desafio_id, origem, participante_id, valor, observacao, chave_idempotencia)
  values (privado.desafio_atual_id(), p_origem, case when p_origem = 'participante' then p_participante end, v_valor,
          nullif(btrim(p_observacao), ''), p_chave)
  returning id into v_id;
  perform privado.lancar_caixa('aporte', v_valor,
    'Aporte · ' || case when p_origem = 'pj' then 'PJ' else coalesce((select nome from public.perfis where id = p_participante), 'participante') end,
    'aporte', v_id);
  return v_id;
end
$$;

create function public.cancelar_aporte(p_aporte uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a public.aportes;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cancela aportes.';
  end if;
  select * into a from public.aportes where id = p_aporte for update;
  if a.id is null then
    raise exception 'Aporte não encontrado.';
  end if;
  if a.situacao = 'cancelada' then
    return;
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do cancelamento.';
  end if;
  update public.aportes
     set situacao = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
   where id = a.id;
  perform privado.lancar_caixa('estorno', -a.valor, 'Cancelamento de aporte: ' || btrim(p_motivo), 'aporte', a.id);
end
$$;

-- ── Ajuste de caixa (só o administrador) ─────────────────────────────────────
-- Contou o dinheiro e não bateu: informa o saldo contado; o banco lança a diferença.
-- Não entra no resultado. Justificativa obrigatória.
create function public.ajustar_caixa(p_chave uuid, p_saldo_contado numeric, p_justificativa text)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_saldo numeric;
  v_dif numeric;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador ajusta o caixa.';
  end if;
  if exists (select 1 from public.lancamentos_caixa where origem_tipo = 'ajuste' and origem_id = p_chave) then
    return 0;
  end if;
  if p_saldo_contado is null then
    raise exception 'Informe o saldo que você conferiu, como 120,00.';
  end if;
  if p_justificativa is null or char_length(btrim(p_justificativa)) < 3 then
    raise exception 'Diga o motivo do ajuste (ex.: conferência com o extrato do Pix).';
  end if;
  perform pg_advisory_xact_lock(hashtext('ajuste_caixa'));
  v_saldo := (select coalesce(sum(valor), 0) from public.lancamentos_caixa);
  v_dif := round(p_saldo_contado, 2) - v_saldo;
  if v_dif <> 0 then
    perform privado.lancar_caixa('ajuste', v_dif, 'Ajuste: ' || btrim(p_justificativa), 'ajuste', p_chave);
  end if;
  return v_dif;
end
$$;

-- ── Leituras ─────────────────────────────────────────────────────────────────
create view public.v_fluxo_caixa with (security_invoker = true) as
select
  l.id, l.desafio_id, l.tipo, l.valor, l.descricao, l.origem_tipo, l.origem_id, l.criado_por, pe.nome as quem, l.criado_em,
  (l.criado_em at time zone 'America/Fortaleza')::date as dia,
  sum(l.valor) over (order by l.id) as saldo_apos
from public.lancamentos_caixa l
left join public.perfis pe on pe.id = l.criado_por;

create view public.v_saldo_caixa with (security_invoker = true) as
select
  coalesce(sum(valor), 0) as saldo,
  coalesce(sum(valor) filter (where valor > 0), 0) as entradas,
  coalesce(sum(-valor) filter (where valor < 0), 0) as saidas
from public.lancamentos_caixa;

-- Resultado por dia (Seção 4.6): margem das vendas reconhecidas (doação entra com margem
-- negativa) − custo das perdas − despesas. Compras, aportes, reembolsos e ajustes não entram.
create view public.v_resultado_diario with (security_invoker = true) as
with partes as (
  select v.desafio_id, (v.reconhecida_em at time zone 'America/Fortaleza')::date as dia,
         sum(vi.margem_contribuicao) as margem, 0::numeric as perdas, 0::numeric as despesas,
         sum(vi.valor_liquido) filter (where v.tipo <> 'doacao') as vendido,
         count(distinct v.id) filter (where v.tipo <> 'doacao') as vendas,
         sum(vi.quantidade) filter (where v.tipo <> 'doacao') as unidades,
         bool_or(vi.margem_contribuicao is null) as sem_custo
  from public.vendas v join public.venda_itens vi on vi.venda_id = v.id
  where v.situacao = 'ativa' and v.reconhecida_em is not null
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

-- ── Permissões ───────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['despesas', 'reembolsos', 'aportes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (privado.eh_participante())', t || '_leitura', t);
  end loop;
end
$$;
revoke insert, update, delete on public.v_reembolsos_devidos, public.v_fluxo_caixa, public.v_saldo_caixa,
  public.v_resultado_diario from authenticated;

grant execute on function
  public.registrar_despesa(uuid, numeric, text, text, public.pago_por, date),
  public.cancelar_despesa(uuid, text),
  public.pagar_reembolso(uuid, uuid, numeric, text),
  public.cancelar_reembolso(uuid, text),
  public.registrar_aporte(uuid, public.origem_aporte, uuid, numeric, text),
  public.cancelar_aporte(uuid, text),
  public.ajustar_caixa(uuid, numeric, text)
  to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['despesas', 'reembolsos', 'aportes'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function privado.preencher_registro()', t || '_registro', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function privado.registrar_auditoria()', t || '_auditoria', t);
  end loop;
end
$$;
