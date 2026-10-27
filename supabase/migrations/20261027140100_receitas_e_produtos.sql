-- Fatia 2: receitas (fornadas), produtos, variações, embalagens e kits (Seção 4.1).
-- As quantidades ficam como a pessoa digitou (0,4 kg; 1,17 cx). A conversão para a
-- unidade base acontece na hora do cálculo, então mudar uma conversão atualiza tudo.

create type public.tipo_produto as enum ('simples', 'kit');

create table public.receitas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  rendimento_unidades numeric(10, 2) not null check (rendimento_unidades > 0),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);
create unique index receitas_nome_unico on public.receitas (lower(btrim(nome)));

create table public.receita_itens (
  id uuid primary key default gen_random_uuid(),
  receita_id uuid not null references public.receitas (id),
  insumo_id uuid not null references public.insumos (id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  unidade text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  unique (receita_id, insumo_id)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  categoria text check (categoria is null or char_length(categoria) <= 40),
  tipo public.tipo_produto not null default 'simples',
  apelidos text[] not null default '{}',
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);
create unique index produtos_nome_unico on public.produtos (lower(btrim(nome)));

-- O que se vende e se estoca é a variação (sabor, cobertura). Produto sem sabor
-- tem uma variação "Única".
create table public.variacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id),
  nome text not null default 'Única' check (char_length(btrim(nome)) between 1 and 40),
  receita_id uuid references public.receitas (id),
  preco_venda numeric(12, 2) not null check (preco_venda >= 0),
  ordem integer not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);
create unique index variacoes_nome_unico on public.variacoes (produto_id, lower(btrim(nome)));

create table public.variacao_embalagens (
  id uuid primary key default gen_random_uuid(),
  variacao_id uuid not null references public.variacoes (id),
  insumo_id uuid not null references public.insumos (id),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  unidade text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  unique (variacao_id, insumo_id)
);

-- Kit: formado por outras variações (casadinha = 1 clássico + 1 avelã).
create table public.kit_componentes (
  id uuid primary key default gen_random_uuid(),
  kit_variacao_id uuid not null references public.variacoes (id),
  componente_variacao_id uuid not null references public.variacoes (id),
  quantidade numeric(10, 3) not null check (quantidade > 0),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  unique (kit_variacao_id, componente_variacao_id),
  check (kit_variacao_id <> componente_variacao_id)
);

-- Validações com mensagem que diz como resolver.
create function privado.validar_item_com_unidade()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform privado.exigir_fator(new.insumo_id, new.unidade);
  new.unidade := lower(btrim(new.unidade));
  return new;
end
$$;
create trigger receita_itens_validar before insert or update on public.receita_itens
  for each row execute function privado.validar_item_com_unidade();
create trigger variacao_embalagens_validar before insert or update on public.variacao_embalagens
  for each row execute function privado.validar_item_com_unidade();

create function privado.validar_variacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.receita_id is not null and (select tipo from public.produtos where id = new.produto_id) = 'kit' then
    raise exception 'Kit não tem receita: o custo vem dos produtos que formam o kit.';
  end if;
  return new;
end
$$;
create trigger variacoes_validar before insert or update on public.variacoes
  for each row execute function privado.validar_variacao();

create function privado.validar_kit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select p.tipo from public.variacoes v join public.produtos p on p.id = v.produto_id where v.id = new.kit_variacao_id) <> 'kit' then
    raise exception 'Só produtos do tipo kit têm componentes.';
  end if;
  if (select p.tipo from public.variacoes v join public.produtos p on p.id = v.produto_id where v.id = new.componente_variacao_id) <> 'simples' then
    raise exception 'Um kit não pode conter outro kit. Use os produtos simples que formam o outro kit.';
  end if;
  return new;
end
$$;
create trigger kit_componentes_validar before insert or update on public.kit_componentes
  for each row execute function privado.validar_kit();

-- Conversão em uso não pode ser apagada (o custo das receitas ficaria sem base).
create function privado.proteger_conversao_em_uso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.receita_itens where insumo_id = old.insumo_id and unidade = lower(btrim(old.unidade)))
     or exists (select 1 from public.variacao_embalagens where insumo_id = old.insumo_id and unidade = lower(btrim(old.unidade))) then
    raise exception 'A unidade "%" está em uso em receitas ou embalagens. Troque a unidade nesses itens antes de apagar a conversão.', old.unidade;
  end if;
  return old;
end
$$;
create trigger insumo_conversoes_proteger before delete on public.insumo_conversoes
  for each row execute function privado.proteger_conversao_em_uso();

-- Permissões: participantes leem; só o administrador cadastra. Receitas, produtos e
-- variações não se apagam (desativa). Itens de receita, embalagens e componentes podem
-- ser removidos pelo administrador (fica na auditoria).
alter table public.receitas enable row level security;
alter table public.receita_itens enable row level security;
alter table public.produtos enable row level security;
alter table public.variacoes enable row level security;
alter table public.variacao_embalagens enable row level security;
alter table public.kit_componentes enable row level security;

revoke delete on public.receitas, public.produtos, public.variacoes from authenticated;
-- O tipo do produto (simples/kit) não muda depois de criado.
revoke update on public.produtos from authenticated;
grant update (nome, categoria, apelidos, ordem, ativo) on public.produtos to authenticated;
-- A variação não troca de produto.
revoke update on public.variacoes from authenticated;
grant update (nome, receita_id, preco_venda, ordem, ativa) on public.variacoes to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['receitas', 'receita_itens', 'produtos', 'variacoes', 'variacao_embalagens', 'kit_componentes'] loop
    execute format('create policy %I on public.%I for select to authenticated using (privado.eh_participante())', t || '_leitura', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (privado.eh_admin())', t || '_inclusao', t);
    execute format('create policy %I on public.%I for update to authenticated using (privado.eh_admin()) with check (privado.eh_admin())', t || '_alteracao', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function privado.preencher_registro()', t || '_registro', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function privado.registrar_auditoria()', t || '_auditoria', t);
  end loop;
  foreach t in array array['receita_itens', 'variacao_embalagens', 'kit_componentes'] loop
    execute format('create policy %I on public.%I for delete to authenticated using (privado.eh_admin())', t || '_exclusao', t);
  end loop;
end
$$;
