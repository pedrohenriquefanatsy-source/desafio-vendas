# Banco de dados (Supabase)

Toda mudança de banco é uma migration versionada nesta pasta (`migrations/`).
Ordem: testar no Postgres local → aplicar no projeto de **teste** → aplicar no **principal**.

## Ambientes

| Ambiente | Projeto | Região | Uso |
|---|---|---|---|
| Principal | `appgestãogeladinho` (`iebzbiccuwrchgdsojgn`) | sa-east-1 (São Paulo) | Dados reais. Usado pelo site de produção na Vercel |
| Teste | `pedrohenriquefanatsy-source's Project` (`dfzawglgkgconblqrmwf`) | us-east-1 | Testes de aceite e prévias (decisão D1) |

### Origem do projeto de teste

Reativado em 27/10/2026. Continha outro sistema (cobrança: 21 tabelas, 60 funções,
4 usuários e dados). Por decisão do usuário (opção B, confirmada depois de ver o
conteúdo e o aviso de que não havia como guardar cópia), foi limpo pelo script
`scripts/limpar-projeto-teste.sql`, rodado pelo usuário no SQL Editor. Conferido no
mesmo dia: 0 tabelas, funções, tipos, políticas, usuários e migrations no schema public.

## Migrations aplicadas

| Migration | Teste | Principal |
|---|---|---|
| `20261027120000_remove_bancogestao.sql` | Não se aplica (a tabela não existia lá) | 27/10/2026, SQL Editor |
| `20261027120100_fecha_acesso_publico.sql` | 27/10/2026, SQL Editor | 27/10/2026, SQL Editor |
| `20261027120200_privilegios_authenticated.sql` | 27/10/2026, MCP (no histórico) | 27/10/2026, MCP (no histórico) |
| `20261027130000_perfis_e_papeis.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027130100_registro_e_auditoria.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027130200_desafios.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027130300_formas_pagamento.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027130400_funcoes_internas.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027130500_desliga_graphql.sql` | 27/10/2026, SQL Editor (usuário) | 27/10/2026, SQL Editor (usuário) |
| `20261027130600_perfil_pelo_servico_de_login.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027140000_unidades_e_insumos.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027140100_receitas_e_produtos.sql` | 27/10/2026, MCP | 27/10/2026, MCP |
| `20261027140200_custeio.sql` | 27/10/2026, MCP | 27/10/2026, MCP |

As aplicadas pelo SQL Editor **não aparecem** no histórico de migrations do Supabase
(`supabase_migrations`), porque a confirmação pedida pela integração não chegou a tempo.
O efeito foi conferido por consulta.

### Estado conferido em 27/10/2026 (igual nos dois)

- Privilégios padrão para tabelas novas em `public`: `authenticated` só lê, inclui,
  altera e apaga (sempre sob RLS); `anon` nada.
- Funções novas: EXECUTE só para `postgres` e `service_role`. Cada RPC concede o seu.
- *Advisors* de segurança: nenhum alerta (antes da fatia 1).

### Alertas aceitos de propósito

- `admin_atualizar_participante`, `definir_meu_nome` e `definir_custo_insumo` são funções da
  API usadas pelas telas (alerta 0029). Cada uma confere quem está chamando antes de fazer
  qualquer coisa.
- "Leaked password protection" (alerta de Auth): opcional; ligar no painel em
  Authentication → Policies/Passwords, se disponível no plano.

### Testes

- `testes/fatia1.sql`: testes do banco, desfazem tudo no fim. Rodar no Postgres local
  (`testes/simulacao-supabase-local.sql` antes das migrations) ou no projeto de teste.
- `testes/fatia2.sql`: idem, com os testes de aceite 1 e 2.
- `testes/preparar-e2e-fatia1.sql` e `testes/preparar-e2e-fatia2.sql`: deixam o projeto de teste
  pronto para `testes-e2e/fatia1.mjs` e `testes-e2e/fatia2.mjs` sem apagar nada.
- Comandos com "apagar" (delete/drop) fora de blocos fazem a integração do Supabase pedir
  confirmação; nos testes remotos eles ficam de fora e rodam só no Postgres local.
