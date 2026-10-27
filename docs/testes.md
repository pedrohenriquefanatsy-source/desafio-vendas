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
| Script `supabase/scripts/limpar-projeto-teste.sql` sem a trava de confirmação: deve recusar | Postgres 16 local | Passou |
| O mesmo script com a trava: remove tabelas, views, políticas, gatilhos, funções, procedimentos, sequências, tipos, usuários e histórico de migrations; mantém extensões funcionando | Postgres 16 local | Passou (0 objetos restantes; `gen_random_uuid()` da extensão continua funcionando) |
| Rodar o script de novo | Postgres 16 local | Passou |
| Projeto de teste depois da limpeza | Supabase teste (consulta) | Passou: 0 objetos, funções, tipos, políticas, usuários e migrations em `public` |
| Migration `privilegios_authenticated` num banco que imita o principal e noutro que imita o teste: `authenticated` lê e inclui, não faz TRUNCATE; `anon` não lê; sequência utilizável; rodar 2 vezes | Postgres 16 local | Passou nos dois |
| Privilégios padrão iguais nos dois projetos depois da migration | Supabase principal e teste (consulta) | Passou: listas idênticas |
| *Advisors* de segurança | Supabase principal e teste | Passou: nenhum alerta |

## Fatia 1 — Base: login, papéis, desafio, formas de pagamento (27/10/2026)

### Banco (`supabase/testes/fatia1.sql`, 25 verificações, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local (simulação do Supabase) | Passou (25/25). Teste de mutação: alterar a expectativa de dias restantes faz o teste falhar (T8), como deveria |
| Supabase de teste | Passou (25/25) |
| Supabase principal, antes de ter usuários | Passou (24 verificações; sem as que só leem dados de teste). Conferido depois: 0 usuários, 0 perfis, 0 desafios, só "Pix" |

Verificações: primeiro usuário vira admin; novos começam desativados; desativado vê só o
próprio perfil; membro não se promove; nunca fica sem admin; `criado_por` não pode ser
falsificado; dias do desafio (7/2/5); chave de envio repetida é recusada; dois desafios em
andamento são recusados; datas invertidas são recusadas; ninguém apaga desafio; alteração
registra quem e quando; auditoria guarda meta anterior e nova; membro não lê auditoria, não
cria desafio, não altera taxa nem meta, não cria perfil, não chama função interna; nome com
espaços aparados e nome curto recusado; `anon` não lê tabelas nem chama funções internas;
funções internas fora do schema público; serviço de login alcança a função que cria o perfil.

### Regras de leitura de números e datas (`npm test`)

4 testes, todos passaram (formatos "6,50", "R$ 1.234,56", "3,99%"; textos inválidos; reais; fuso de Fortaleza na virada do dia).

### Telas no navegador em 375 px (`testes-e2e/fatia1.mjs`, Supabase de teste)

**29 de 29 verificações passaram** na rodada final.

| Rodada | Resultado | O que foi corrigido |
|---|---|---|
| 1ª | Falhou ao entrar | O servidor local não alcançava o Supabase (proxy do ambiente de testes; não afeta a Vercel). Rodado com `NODE_USE_ENV_PROXY=1` |
| 2ª | Várias falhas | Falhas do próprio teste (lia a tela antes de carregar). Botão de entrar mostrava "Salvando…": passou a mostrar "Entrando…" |
| 3ª | Parou no cadastro de desafio | **Erro real:** depois de um erro, o formulário apagava o que tinha sido digitado. Corrigido: os dados ficam na tela; também passou a avisar "Não foi salvo" quando a conexão cai no envio |
| 4ª | 28 de 29 | Falha do teste (contou a palavra "Aguardando" duas vezes) |
| 5ª | 29 de 29 | Depois, as telas de formas de pagamento e participantes viraram linhas que abrem ao tocar; rodada final: 29 de 29 |

Verificações: sem login leva para Entrar; senha errada explica o que fazer; primeiro acesso
pede o nome; Início vazio mostra ação; meta inválida explica o formato; **duplo toque grava um
desafio só**; Início mostra meta e dias certos; forma de pagamento nova aparece; nome repetido
recusado; membro novo cai em "acesso pendente"; admin ativa; não deixa ficar sem admin; membro
ativado vê o desafio e não altera cadastro; faixa "sem conexão"; **envio sem conexão avisa e
mantém os dados**; reenvio salva; sair. Em todas as telas verificadas: sem rolagem lateral em
375 px e alvos de toque com 44 px ou mais.
