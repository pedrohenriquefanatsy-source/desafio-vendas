# Registro de testes

Cada fatia registra aqui o que foi testado, onde e o resultado. Os 18 testes de
aceite da Seção 10 da especificação entram na Etapa 5.

## Fatia 0 — Preparação (27/10/2026)

| Teste | Onde | Resultado |
|---|---|---|
| Remover `bancogestão` **com** uma linha de dados: a migration deve parar sem apagar | Postgres 16 local | Passou: erro "A tabela … tem dados", tabela intacta |
| Remover `bancogestão` **vazia** | Postgres 16 local | Passou: tabela removida |
| Rodar a mesma migration de novo (não pode dar erro) | Postgres 16 local | Passou |
| Tabela nova não fica acessível ao `anon`; continua acessível ao `authenticated` (a RLS controla) | Postgres 16 local | Passou |
| Função nova não fica executável por `anon` nem `authenticated` até um `GRANT` explícito | Postgres 16 local | **Falhou na 1ª versão** (o `PUBLIC` mantinha EXECUTE). Corrigido com a revogação global; passou na 2ª |
| Migrations aplicadas no principal | Supabase principal (consulta) | Passou: tabela removida; privilégios padrão de `public` sem `anon`; funções só com `postgres` e `service_role` |
| `npm run typecheck`, `npm run lint`, `npm run build` | Local | Passou |
