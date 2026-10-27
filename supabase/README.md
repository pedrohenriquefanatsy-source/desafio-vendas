# Banco de dados (Supabase)

Toda mudança de banco é uma migration versionada nesta pasta (`migrations/`).
Ordem: testar no Postgres local → aplicar no projeto de **teste** → aplicar no **principal**.

## Ambientes

| Ambiente | Projeto | Região | Uso |
|---|---|---|---|
| Principal | `appgestãogeladinho` (`iebzbiccuwrchgdsojgn`) | sa-east-1 (São Paulo) | Dados reais. Usado pelo site de produção na Vercel |
| Teste | `pedrohenriquefanatsy-source's Project` (`dfzawglgkgconblqrmwf`) | us-east-1 | Testes de aceite e prévias (decisão D1, aprovada em 27/10/2026) |

## Migrations aplicadas

| Migration | Teste | Principal |
|---|---|---|
| `20261027120000_remove_bancogestao.sql` | — | 27/10/2026, pelo SQL Editor (aplicada pelo usuário) |
| `20261027120100_fecha_acesso_publico.sql` | — | 27/10/2026, pelo SQL Editor (aplicada pelo usuário) |

As duas primeiras foram aplicadas no principal pelo SQL Editor, porque a confirmação
pedida pela integração do Supabase não chegou a tempo. Por isso elas **não aparecem**
no histórico de migrations do Supabase (`supabase_migrations`). O efeito foi conferido
por consulta no mesmo dia: tabela removida e privilégios padrão sem `anon`.
