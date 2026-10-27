-- O serviço de login do Supabase (papel supabase_auth_admin) cria os usuários em
-- auth.users, o que dispara privado.criar_perfil_novo_usuario(). Garante que ele
-- alcance a função depois que ela foi para o schema privado.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema privado to supabase_auth_admin;
    grant execute on function privado.criar_perfil_novo_usuario() to supabase_auth_admin;
  end if;
end
$$;
