-- Iguala os dois ambientes (principal e teste) e deixa explícito o que o usuário
-- logado (papel authenticated) recebe em tabelas e sequências novas do schema public:
-- só ler, incluir, alterar e apagar linhas, sempre filtrado pela RLS de cada tabela.
-- Nada de TRUNCATE, REFERENCES ou TRIGGER. Tabelas financeiras e de estoque revogam
-- a escrita na própria migration (escrita só pelas funções RPC).
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated;
