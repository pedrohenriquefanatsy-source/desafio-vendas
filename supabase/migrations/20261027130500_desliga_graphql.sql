-- Corrige os alertas 0026/0027 dos advisors de segurança (Seção 5).
-- O sistema não usa GraphQL (só a API REST do Supabase). Desligar a extensão tira as
-- tabelas do esquema GraphQL. A RLS continua valendo. Pode ser religada pelo painel
-- (Database → Extensions → pg_graphql) se um dia for necessária.
drop extension if exists pg_graphql;
