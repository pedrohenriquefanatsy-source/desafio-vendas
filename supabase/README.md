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

As aplicadas pelo SQL Editor **não aparecem** no histórico de migrations do Supabase
(`supabase_migrations`), porque a confirmação pedida pela integração não chegou a tempo.
O efeito foi conferido por consulta.

### Estado conferido em 27/10/2026 (igual nos dois)

- Privilégios padrão para tabelas novas em `public`: `authenticated` só lê, inclui,
  altera e apaga (sempre sob RLS); `anon` nada.
- Funções novas: EXECUTE só para `postgres` e `service_role`. Cada RPC concede o seu.
- *Advisors* de segurança: nenhum alerta.
