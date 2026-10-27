-- Fatia 2: unidades e insumos (Seção 4.1).
-- Todo insumo tem uma unidade base (g, ml ou und). Custos ficam por unidade base,
-- com 6 casas decimais (ex.: R$ 0,020000 por g). Arredonda só no valor final.

create type public.dimensao as enum ('massa', 'volume', 'contagem');
create type public.tipo_insumo as enum ('ingrediente', 'embalagem', 'outro');

-- Unidades padrão: convertem sozinhas dentro da mesma dimensão (g↔kg, ml↔l).
create table public.unidades (
  codigo text primary key,
  nome text not null,
  dimensao public.dimensao not null,
  fator_para_base numeric(14, 6) not null check (fator_para_base > 0)
);
insert into public.unidades (codigo, nome, dimensao, fator_para_base) values
  ('g', 'grama', 'massa', 1),
  ('kg', 'quilo', 'massa', 1000),
  ('ml', 'mililitro', 'volume', 1),
  ('l', 'litro', 'volume', 1000),
  ('und', 'unidade', 'contagem', 1);
alter table public.unidades enable row level security;
revoke insert, update, delete on public.unidades from authenticated;
create policy unidades_leitura on public.unidades for select to authenticated using (privado.eh_participante());

create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  tipo public.tipo_insumo not null default 'ingrediente',
  unidade_base text not null references public.unidades (codigo) check (unidade_base in ('g', 'ml', 'und')),
  custo_atual numeric(14, 6) check (custo_atual >= 0),
  preco_referencia numeric(12, 2) check (preco_referencia >= 0),
  unidade_referencia text,
  fornecedor text check (fornecedor is null or char_length(fornecedor) <= 80),
  validade date,
  estoque_minimo numeric(14, 3) check (estoque_minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);
create unique index insumos_nome_unico on public.insumos (lower(btrim(nome)));

-- Unidades próprias de cada insumo ("1 cx de leite condensado = 395 g").
create table public.insumo_conversoes (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references public.insumos (id),
  unidade text not null check (char_length(btrim(unidade)) between 1 and 20),
  quantidade_em_base numeric(14, 4) not null check (quantidade_em_base > 0),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);
create unique index insumo_conversoes_unica on public.insumo_conversoes (insumo_id, lower(btrim(unidade)));

-- Histórico de custo: cada mudança de preço fica registrada (Seção 4.1).
create table public.insumo_custos_historico (
  id bigint generated always as identity primary key,
  insumo_id uuid not null references public.insumos (id),
  custo_por_base numeric(14, 6),
  preco_referencia numeric(12, 2),
  unidade_referencia text,
  origem text not null default 'manual',
  registrado_por uuid,
  registrado_em timestamptz not null default now()
);
create index insumo_custos_historico_insumo on public.insumo_custos_historico (insumo_id, registrado_em desc);

-- Quantas unidades base cabem em 1 "unidade" deste insumo. Nulo se não há regra.
-- Padrão da mesma dimensão primeiro (kg → 1000 g); depois as conversões do insumo.
-- Massa nunca vira volume: só converte dentro da dimensão da unidade base.
create function privado.fator_unidade(p_insumo uuid, p_unidade text)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select u.fator_para_base / b.fator_para_base
       from public.insumos i
       join public.unidades b on b.codigo = i.unidade_base
       join public.unidades u on u.dimensao = b.dimensao and u.codigo = lower(btrim(p_unidade))
      where i.id = p_insumo),
    (select c.quantidade_em_base
       from public.insumo_conversoes c
      where c.insumo_id = p_insumo and lower(btrim(c.unidade)) = lower(btrim(p_unidade)))
  )
$$;
grant execute on function privado.fator_unidade(uuid, text) to authenticated;

-- Mesmo cálculo, mas recusa com uma mensagem que diz como resolver.
create function privado.exigir_fator(p_insumo uuid, p_unidade text)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_fator numeric := privado.fator_unidade(p_insumo, p_unidade);
  v_nome text;
  v_base text;
begin
  if v_fator is null then
    select nome, unidade_base into v_nome, v_base from public.insumos where id = p_insumo;
    if v_nome is null then
      raise exception 'Insumo não encontrado.';
    end if;
    raise exception 'Não sei converter "%" de % para %. Cadastre em Insumos → % → Conversões quantos % tem 1 %.',
      btrim(p_unidade), v_nome, v_base, v_nome, v_base, btrim(p_unidade);
  end if;
  return v_fator;
end
$$;

-- Unidades que cada insumo aceita (para as telas).
create view public.v_unidades_insumo with (security_invoker = true) as
select i.id as insumo_id, u.codigo as unidade, u.fator_para_base / b.fator_para_base as quantidade_em_base, false as personalizada
  from public.insumos i
  join public.unidades b on b.codigo = i.unidade_base
  join public.unidades u on u.dimensao = b.dimensao
union all
select c.insumo_id, c.unidade, c.quantidade_em_base, true
  from public.insumo_conversoes c;
revoke insert, update, delete on public.v_unidades_insumo from authenticated;

-- Conversão não pode repetir uma unidade padrão (kg já converte sozinho).
create function privado.validar_conversao()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.unidades where codigo = lower(btrim(new.unidade))) then
    raise exception '"%" já é convertida automaticamente. Use uma unidade como cx, pacote ou bandeja.', btrim(new.unidade);
  end if;
  return new;
end
$$;
create trigger insumo_conversoes_validar before insert or update on public.insumo_conversoes
  for each row execute function privado.validar_conversao();

-- Preço informado como a pessoa compra: "R$ 7,90 por cx" → custo por g.
create function public.definir_custo_insumo(p_insumo uuid, p_preco numeric, p_unidade text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fator numeric;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador altera preços.';
  end if;
  if p_preco is null or p_preco < 0 then
    raise exception 'Informe o preço (zero ou mais), como 7,90.';
  end if;
  v_fator := privado.exigir_fator(p_insumo, p_unidade);
  update public.insumos
     set custo_atual = round(p_preco / v_fator, 6),
         preco_referencia = round(p_preco, 2),
         unidade_referencia = lower(btrim(p_unidade))
   where id = p_insumo;
end
$$;
grant execute on function public.definir_custo_insumo(uuid, numeric, text) to authenticated;

create function privado.registrar_custo_insumo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.insumo_custos_historico (insumo_id, custo_por_base, preco_referencia, unidade_referencia, origem, registrado_por)
  values (new.id, new.custo_atual, new.preco_referencia, new.unidade_referencia,
          coalesce(nullif(current_setting('app.origem_custo', true), ''), 'manual'), auth.uid());
  return new;
end
$$;
create trigger insumos_historico_inclusao after insert on public.insumos
  for each row when (new.custo_atual is not null) execute function privado.registrar_custo_insumo();
create trigger insumos_historico_alteracao after update of custo_atual on public.insumos
  for each row when (old.custo_atual is distinct from new.custo_atual) execute function privado.registrar_custo_insumo();

-- Permissões: todos os participantes leem; só o administrador cadastra.
-- O preço só muda por definir_custo_insumo; a unidade base não muda depois de criada.
alter table public.insumos enable row level security;
alter table public.insumo_conversoes enable row level security;
alter table public.insumo_custos_historico enable row level security;
revoke insert, update, delete on public.insumos from authenticated;
grant insert (nome, tipo, unidade_base, fornecedor, validade, estoque_minimo, ativo) on public.insumos to authenticated;
grant update (nome, tipo, fornecedor, validade, estoque_minimo, ativo) on public.insumos to authenticated;
revoke update on public.insumo_conversoes from authenticated;
grant update (quantidade_em_base) on public.insumo_conversoes to authenticated;
revoke insert, update, delete on public.insumo_custos_historico from authenticated;

create policy insumos_leitura on public.insumos for select to authenticated using (privado.eh_participante());
create policy insumos_inclusao on public.insumos for insert to authenticated with check (privado.eh_admin());
create policy insumos_alteracao on public.insumos for update to authenticated using (privado.eh_admin()) with check (privado.eh_admin());
create policy conversoes_leitura on public.insumo_conversoes for select to authenticated using (privado.eh_participante());
create policy conversoes_inclusao on public.insumo_conversoes for insert to authenticated with check (privado.eh_admin());
create policy conversoes_alteracao on public.insumo_conversoes for update to authenticated using (privado.eh_admin()) with check (privado.eh_admin());
create policy conversoes_exclusao on public.insumo_conversoes for delete to authenticated using (privado.eh_admin());
create policy custos_historico_leitura on public.insumo_custos_historico for select to authenticated using (privado.eh_participante());

create trigger insumos_registro before insert or update on public.insumos
  for each row execute function privado.preencher_registro();
create trigger insumos_auditoria after insert or update or delete on public.insumos
  for each row execute function privado.registrar_auditoria();
create trigger insumo_conversoes_registro before insert or update on public.insumo_conversoes
  for each row execute function privado.preencher_registro();
create trigger insumo_conversoes_auditoria after insert or update or delete on public.insumo_conversoes
  for each row execute function privado.registrar_auditoria();
