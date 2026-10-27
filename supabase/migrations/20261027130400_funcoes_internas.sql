-- Corrige o alerta 0029 dos advisors de segurança (Seção 5).
-- Funções internas saem do schema public, que é exposto pela API (alerta 0029).
--    Elas continuam funcionando nas políticas RLS e nos gatilhos; só não podem mais
--    ser chamadas pela internet em /rest/v1/rpc.
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

alter function public.papel_atual() set schema privado;
alter function public.eh_participante() set schema privado;
alter function public.eh_admin() set schema privado;
alter function public.criar_perfil_novo_usuario() set schema privado;
alter function public.preencher_registro() set schema privado;
alter function public.registrar_auditoria() set schema privado;

-- Funções privadas novas não ficam executáveis por ninguém até um GRANT explícito.
alter default privileges for role postgres in schema privado revoke execute on functions from anon, authenticated;

-- As funções com search_path vazio chamam umas às outras pelo nome completo.
create or replace function privado.eh_participante()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select privado.papel_atual() is not null
$$;

create or replace function privado.eh_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(privado.papel_atual() = 'administrador', false)
$$;

create or replace function public.admin_atualizar_participante(
  p_id uuid, p_nome text, p_papel public.papel, p_ativo boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
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
