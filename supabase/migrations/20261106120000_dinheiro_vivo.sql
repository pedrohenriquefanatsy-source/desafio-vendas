-- Fatia 23: dinheiro vivo × banco. O livro de caixa continua sendo um só (saldo total); o dinheiro vivo é o que entrou em
-- dinheiro nas vendas, menos o que saiu em dinheiro nas compras e despesas pagas pelo caixa, mais as conferências de
-- dinheiro. O banco/Pix é o saldo total menos o dinheiro vivo.
alter table public.formas_pagamento add column em_dinheiro boolean not null default false;
update public.formas_pagamento set em_dinheiro = true where nome = 'Dinheiro';

alter table public.compras add column pago_em_dinheiro numeric(12, 2) not null default 0
  check (pago_em_dinheiro >= 0 and pago_em_dinheiro <= total);
alter table public.despesas add column valor_em_dinheiro numeric(12, 2) not null default 0
  check (valor_em_dinheiro >= 0 and valor_em_dinheiro <= valor);

create table public.ajustes_dinheiro (
  id bigint generated always as identity primary key,
  desafio_id uuid references public.desafios (id),
  valor numeric(12, 2) not null check (valor <> 0),
  motivo text not null check (char_length(btrim(motivo)) >= 3),
  chave_idempotencia uuid unique,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
alter table public.ajustes_dinheiro enable row level security;
create policy ajustes_dinheiro_leitura on public.ajustes_dinheiro for select to authenticated using (privado.eh_participante());
grant select on public.ajustes_dinheiro to authenticated;
revoke insert, update, delete, truncate on public.ajustes_dinheiro from authenticated;

create view public.v_dinheiro_vivo with (security_invoker = true) as
with d as (
  select
    coalesce((select sum(r.valor) from public.recebimentos r join public.formas_pagamento f on f.id = r.forma_pagamento_id where f.em_dinheiro), 0)
    + coalesce((select sum(x.valor) from public.valores_a_mais x join public.formas_pagamento f on f.id = x.forma_pagamento_id
                 where f.em_dinheiro and x.estornado_em is null), 0)
    - coalesce((select sum(c.pago_em_dinheiro) from public.compras c where c.situacao = 'ativa' and c.pago_por = 'caixa'), 0)
    - coalesce((select sum(d2.valor_em_dinheiro) from public.despesas d2 where d2.situacao = 'ativa' and d2.pago_por = 'caixa'), 0)
    + coalesce((select sum(a.valor) from public.ajustes_dinheiro a), 0) as dinheiro
)
select d.dinheiro as dinheiro_vivo, s.saldo - d.dinheiro as banco, s.saldo
from d cross join public.v_saldo_caixa s;
revoke insert, update, delete on public.v_dinheiro_vivo from authenticated;

-- Quanto de uma compra ou despesa paga pelo caixa saiu em dinheiro vivo (o resto foi Pix ou cartão).
create function public.definir_dinheiro_pago(p_tipo text, p_id uuid, p_valor numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_valor numeric := round(coalesce(p_valor, 0), 2);
  c public.compras;
  d public.despesas;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if v_valor < 0 then
    raise exception 'O valor em dinheiro não pode ser negativo.';
  end if;
  if p_tipo = 'compra' then
    select * into c from public.compras where id = p_id for update;
    if c.id is null or c.situacao <> 'ativa' then
      raise exception 'Compra não encontrada ou cancelada.';
    end if;
    if not privado.pode_cancelar(c.criado_por, c.criado_em) then
      raise exception 'Só o administrador muda uma compra de outra pessoa ou com mais de 30 minutos.';
    end if;
    if v_valor > 0 and c.pago_por <> 'caixa' then
      raise exception 'Só compra paga pelo caixa tem parte em dinheiro vivo.';
    end if;
    if v_valor > c.total then
      raise exception 'O dinheiro vivo não pode passar do total da compra (%).', c.total;
    end if;
    update public.compras set pago_em_dinheiro = v_valor where id = c.id;
  elsif p_tipo = 'despesa' then
    select * into d from public.despesas where id = p_id for update;
    if d.id is null or d.situacao <> 'ativa' then
      raise exception 'Despesa não encontrada ou cancelada.';
    end if;
    if not privado.pode_cancelar(d.criado_por, d.criado_em) then
      raise exception 'Só o administrador muda uma despesa de outra pessoa ou com mais de 30 minutos.';
    end if;
    if v_valor > 0 and d.pago_por <> 'caixa' then
      raise exception 'Só despesa paga pelo caixa tem parte em dinheiro vivo.';
    end if;
    if v_valor > d.valor then
      raise exception 'O dinheiro vivo não pode passar do valor da despesa (%).', d.valor;
    end if;
    update public.despesas set valor_em_dinheiro = v_valor where id = d.id;
  else
    raise exception 'Escolha compra ou despesa.';
  end if;
end
$$;
grant execute on function public.definir_dinheiro_pago(text, uuid, numeric) to authenticated;

-- Conferência do dinheiro vivo (só o administrador): informa quanto tem em dinheiro, contado. Lança a diferença, com motivo.
-- Muda só a divisão entre dinheiro vivo e banco (um depósito, por exemplo); o saldo total continua o mesmo.
create function public.ajustar_dinheiro(p_chave uuid, p_contado numeric, p_motivo text)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_atual numeric;
  v_dif numeric;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador confere o dinheiro vivo.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  if exists (select 1 from public.ajustes_dinheiro where chave_idempotencia = p_chave) then
    return 0;
  end if;
  if p_contado is null or p_contado < 0 then
    raise exception 'Informe quanto tem em dinheiro vivo, como 60,00.';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo (ex.: contei o dinheiro, depositei no banco).';
  end if;
  perform pg_advisory_xact_lock(hashtext('ajuste_dinheiro'));
  v_atual := (select dinheiro_vivo from public.v_dinheiro_vivo);
  v_dif := round(p_contado, 2) - v_atual;
  if v_dif <> 0 then
    insert into public.ajustes_dinheiro (desafio_id, valor, motivo, chave_idempotencia, criado_por)
    values (privado.desafio_atual_id(), v_dif, btrim(p_motivo), p_chave, auth.uid());
  end if;
  return v_dif;
end
$$;
grant execute on function public.ajustar_dinheiro(uuid, numeric, text) to authenticated;
