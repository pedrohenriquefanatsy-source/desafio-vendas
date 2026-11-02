-- Fatia 21: acerto com as vendas registradas uma a uma. A pessoa conta o que sobrou; o sistema guarda essa contagem
-- (acerto em andamento) e a pessoa registra cada venda de verdade (cliente, preço, forma de pagamento...), limitada ao
-- que ela vendeu (cota = o que está com ela − o que sobrou). O que não for registrado pode ser fechado numa venda única.
create table public.acertos_abertos (
  participante_id uuid not null references public.perfis (id),
  variacao_id uuid not null references public.variacoes (id),
  sobrou numeric(12, 2) not null check (sobrou >= 0),
  vendidos_inicial numeric(12, 2) not null check (vendidos_inicial >= 0),
  criado_em timestamptz not null default now(),
  primary key (participante_id, variacao_id)
);
alter table public.acertos_abertos enable row level security;
create policy acertos_abertos_leitura on public.acertos_abertos for select to authenticated using (privado.eh_participante());
grant select on public.acertos_abertos to authenticated;
revoke insert, update, delete, truncate on public.acertos_abertos from authenticated;

create view public.v_acerto_aberto with (security_invoker = true) as
select a.participante_id, a.variacao_id, pr.nome as produto, va.nome as variacao, va.preco_venda,
       a.sobrou, a.vendidos_inicial, a.criado_em,
       coalesce(s.saldo, 0) as saldo,
       greatest(coalesce(s.saldo, 0) - a.sobrou, 0) as cota
from public.acertos_abertos a
join public.variacoes va on va.id = a.variacao_id
join public.produtos pr on pr.id = va.produto_id
left join (select participante_id, variacao_id, sum(quantidade) as saldo from public.estoque_pessoas group by 1, 2) s
  on s.participante_id = a.participante_id and s.variacao_id = a.variacao_id;
revoke insert, update, delete on public.v_acerto_aberto from authenticated;

-- Começa o acerto: guarda quanto sobrou de cada sabor (substitui um acerto anterior da mesma pessoa).
create function public.iniciar_acerto_pessoa(p_itens jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pessoa uuid := auth.uid();
  v_item jsonb;
  v_var uuid;
  v_sobrou numeric;
  v_saldo numeric;
  v_nome text;
  v_linhas jsonb := '[]'::jsonb;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Preencha quanto sobrou de pelo menos um sabor.';
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_var := (v_item ->> 'variacao_id')::uuid;
    v_sobrou := round((v_item ->> 'sobrou')::numeric, 2);
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
    v_linhas := v_linhas || jsonb_build_object('variacao_id', v_var, 'sobrou', v_sobrou, 'vendidos', v_saldo - v_sobrou);
  end loop;
  delete from public.acertos_abertos where participante_id = v_pessoa;
  for v_item in select * from jsonb_array_elements(v_linhas) loop
    insert into public.acertos_abertos (participante_id, variacao_id, sobrou, vendidos_inicial)
    values (v_pessoa, (v_item ->> 'variacao_id')::uuid, (v_item ->> 'sobrou')::numeric, (v_item ->> 'vendidos')::numeric);
  end loop;
end
$$;
grant execute on function public.iniciar_acerto_pessoa(jsonb) to authenticated;

-- Desiste do acerto em andamento (nada é vendido nem devolvido).
create function public.cancelar_acerto_pessoa()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  delete from public.acertos_abertos where participante_id = auth.uid();
end
$$;
grant execute on function public.cancelar_acerto_pessoa() to authenticated;

-- Fecha o acerto: o que ainda não foi registrado (cota) vira uma venda única, como no acerto de uma vez; opcionalmente
-- o que sobrou volta para o estoque geral. Depois disso o acerto deixa de existir.
create function public.fechar_acerto_pessoa(p_chave uuid, p_forma uuid default null, p_devolver boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_pessoa uuid := auth.uid();
  v_itens jsonb;
  v_existente public.vendas;
  r jsonb;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  select * into v_existente from public.vendas where chave_idempotencia = md5(p_chave::text || ':venda')::uuid;
  if v_existente.id is not null then
    return jsonb_build_object('ok', true, 'repetida', true, 'venda_id', v_existente.id, 'numero', v_existente.numero);
  end if;
  select jsonb_agg(jsonb_build_object('variacao_id', a.variacao_id, 'sobrou', least(a.sobrou, greatest(coalesce(privado.saldo_pessoa(v_pessoa, a.variacao_id), 0), 0))))
    into v_itens
    from public.acertos_abertos a where a.participante_id = v_pessoa;
  if v_itens is null then
    return jsonb_build_object('ok', true, 'unidades', 0, 'devolvido', false);
  end if;
  r := public.acertar_estoque_pessoa(p_chave, v_itens, p_forma, p_devolver);
  delete from public.acertos_abertos where participante_id = v_pessoa;
  return r;
end
$$;
grant execute on function public.fechar_acerto_pessoa(uuid, uuid, boolean) to authenticated;
