-- Usuário não logado (papel anon) não lê nem grava nada (Seção 4.7 e teste 17).
-- Tabelas e sequências novas do schema public deixam de receber permissão
-- automática para anon. O acesso de quem está logado é controlado pela RLS.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- Funções novas deixam de ser executáveis por qualquer papel. O Postgres concede
-- EXECUTE a PUBLIC por padrão global (não dá para retirar só por schema), e o
-- Supabase ainda concede a anon e authenticated no schema public.
-- Cada RPC passa a conceder EXECUTE explicitamente a quem pode usá-la.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
