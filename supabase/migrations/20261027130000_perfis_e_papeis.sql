-- Fatia 1: participantes e papéis (Seção 4.7, decisões D3 e D15).
-- Cada usuário do Supabase Auth ganha um perfil. Dois papéis: administrador e membro.
-- Segurança: todo participante novo começa DESATIVADO, até o administrador ativar.
-- Exceção: o primeiro usuário criado vira administrador ativo (é quem configura tudo).

create type public.papel as enum ('administrador', 'membro');

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text check (nome is null or char_length(btrim(nome)) between 2 and 60),
  papel public.papel not null default 'membro',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid
);

alter table public.perfis enable row level security;
-- Escrita só pelas funções abaixo.
revoke insert, update, delete on public.perfis from authenticated;

-- Papel de quem está logado (nulo se não tem perfil ou está desativado).
create function public.papel_atual()
returns public.papel
language sql stable security definer set search_path = ''
as $$
  select p.papel from public.perfis p where p.id = auth.uid() and p.ativo
$$;

create function public.eh_participante()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.papel_atual() is not null
$$;

create function public.eh_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.papel_atual() = 'administrador', false)
$$;

grant execute on function public.papel_atual(), public.eh_participante(), public.eh_admin()
  to authenticated;

-- Participante ativo vê todos os perfis. Qualquer um vê o próprio (para saber se está desativado).
create policy perfis_leitura on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.eh_participante());

-- Cria o perfil quando um usuário é criado no Supabase Auth.
create function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_primeiro boolean;
begin
  lock table public.perfis in share row exclusive mode;
  v_primeiro := not exists (select 1 from public.perfis where papel = 'administrador');
  insert into public.perfis (id, nome, papel, ativo)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
    case when v_primeiro then 'administrador' else 'membro' end::public.papel,
    v_primeiro
  );
  return new;
end
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- O próprio participante informa o nome (primeiro acesso).
create function public.definir_meu_nome(p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login para continuar.';
  end if;
  if p_nome is null or char_length(btrim(p_nome)) not between 2 and 60 then
    raise exception 'O nome precisa ter de 2 a 60 letras.';
  end if;
  update public.perfis set nome = btrim(p_nome) where id = auth.uid();
end
$$;

-- Administrador muda nome, papel e situação de um participante.
-- Nunca deixa o sistema sem nenhum administrador ativo.
create function public.admin_atualizar_participante(
  p_id uuid, p_nome text, p_papel public.papel, p_ativo boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Só o administrador pode alterar participantes.';
  end if;
  if p_nome is not null and char_length(btrim(p_nome)) not between 2 and 60 then
    raise exception 'O nome precisa ter de 2 a 60 letras.';
  end if;
  lock table public.perfis in share row exclusive mode;
  update public.perfis
     set nome = coalesce(nullif(btrim(p_nome), ''), nome),
         papel = p_papel,
         ativo = p_ativo
   where id = p_id;
  if not found then
    raise exception 'Participante não encontrado.';
  end if;
  if not exists (select 1 from public.perfis where papel = 'administrador' and ativo) then
    raise exception 'O sistema precisa de pelo menos um administrador ativo.';
  end if;
end
$$;

grant execute on function public.definir_meu_nome(text),
  public.admin_atualizar_participante(uuid, text, public.papel, boolean)
  to authenticated;
