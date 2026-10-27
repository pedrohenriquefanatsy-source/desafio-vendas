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

## Fatia 2 — Insumos, receitas, produtos, kits e custeio (27/10/2026)

### Banco (`supabase/testes/fatia2.sql`, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local | Passou (todas). Teste de mutação: trocar o custo esperado da casadinha de 3,77 para 3,78 faz o teste falhar, como deveria |
| Supabase de teste | Passou. Sem os 2 comandos de apagar (o Supabase pede confirmação para eles); esses 2 rodaram só no Postgres local |
| Supabase principal | Passou (aceites 1 e 2, unidade massa→volume recusada, membro não cadastra nem muda custo, `anon` não lê) |

- **Aceite 1** (receita com g, kg, cx e und): custo da receita **17,403**; por unidade **0,725125**; 1,17 cx = 462,15 g. **Passou.**
- **Aceite 2** (Cakenoura): custo / MC / markup — Clássico 1,45 / 5,05 / 4,48 (MC 77,69%); Avelã 2,32 / 5,18 / 3,23; Piscininha chocolate 2,08 / 5,92 / 3,85; Piscininha Nutella 2,95 / 5,05 / 2,71; Casadinha (kit) 3,77 / 8,23 / 3,18. **Passou.**
- **Aceite 3 (parte de custo)**: farinha de R$ 6,00 para R$ 7,20/kg → custo da receita de 17,403 para 17,883; histórico com os dois preços. **Passou.** (A parte "vendas anteriores não mudam" entra na fatia 4.)
- Outras: unidade sem conversão e massa→volume recusadas com mensagem que diz onde cadastrar; conversão para "kg" recusada; conversão em uso não pode ser apagada; mudar a conversão (395 g → 400 g) recalcula; insumo sem preço deixa o custo em branco e diz qual falta; MC com taxa de 3,99% = 4,79065; kit não aceita receita nem outro kit; mudança de preço de venda vai para a auditoria; membro não cria insumo, não muda preço (nem pela função nem direto na tabela), não altera preço de venda, não apaga item de receita; admin não muda custo direto, tipo do produto nem unidade base; `anon` não lê.

### Telas no navegador em 375 px (`testes-e2e/fatia2.mjs`, Supabase de teste)

**25 de 25 verificações passaram** (2ª rodada; na 1ª, 4 falharam porque o teste lia a tela ainda no estado "carregando" — corrigido no teste).

Cadastro de 5 insumos pelas telas (farinha em g com preço por kg; leite condensado com caixa de 395 g; ovos com bandeja de 30; açúcar; embalagem); conversão "kg" recusada; receita montada pela tela → **R$ 17,40 a fornada, R$ 0,73 cada, "1,17 cx = 462,15 g"**; produto sem receita avisa o que falta; bolo com a receita → custo R$ 0,73, MC R$ 5,77; com embalagem de R$ 0,08 → custo R$ 0,81, MC R$ 5,69; kit com 2 bolos → custo R$ 1,61, MC R$ 10,39; mudar o preço da farinha → fornada R$ 17,88; membro vê tudo sem campos de edição. Sem rolagem lateral e alvos de toque ≥ 44 px em todas as telas verificadas.

### Regras de leitura de números (`npm test`)

5 testes, todos passaram (inclui quantidades "0,4", "462,15" e custo por unidade "R$ 0,0048/g").

## Fatia 3 — Compras, estoque e produção (27/10/2026)

### Banco (`supabase/testes/fatia3.sql`, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local | Passou (todas), junto com `fatia1.sql` e `fatia2.sql` num banco novo com todas as migrations |
| Supabase de teste | Passou. Sem o comando de apagar (o Supabase pede confirmação para ele); esse rodou só no Postgres local |
| Supabase principal | Passou (compra, reenvio, inativo, gravação direta recusada, aceites 4 e 5, quanto dá para produzir, lista de compras, saldo = livro, `anon` não lê) |

- **Aceite 4** (concluir produção): 2 fornadas, 18 boas e 2 perdidas → farinha 2000 → 1000 g, leite condensado 1185 → 395 g, ovos 30 → 22, potes 20 → 2 (só as boas), 18 bolos prontos; custo da unidade boa **1,798**, perdida **1,298**; tudo no mesmo instante (mesma transação); concluir de novo não baixa duas vezes. **Passou.**
- **Aceite 5** (estoque insuficiente): outras 2 fornadas → bloqueado, lista "leite condensado: precisa 790 g, tem 395, falta 395" e "potes: falta 18"; **nenhum movimento gravado**, produção segue planejada. **Passou.**
- **Aceite 3** (parte de estoque): farinha comprada a R$ 8/kg → custo atual da unidade de 1,798 para 1,898; o que já foi produzido mantém 1,798. **Passou.** (A parte "vendas anteriores não mudam" entra na fatia 4.)
- **Concorrência** (Postgres local, duas sessões ao mesmo tempo, farinha para só 1 fornada): a 1ª concluiu; a 2ª esperou a trava e foi bloqueada com "disponível 0, falta 500 g". Estoque final 0, nunca negativo. **Passou.**
- Outras: compra pelo caixa (R$ 61,30) baixa o caixa; reenvio com a mesma chave não duplica compra, estoque nem caixa; compra do bolso não mexe no caixa e fica no nome de quem pagou; histórico de custo aponta a compra; unidade sem conversão, compra sem itens e data futura recusadas com mensagem; inativo não registra nem lê; ninguém grava direto em estoque, saldo, caixa ou compras; quanto dá para produzir (o pote limita: 0 fornadas); lista de compras (planejado + mínimo); ajuste por contagem (−2, motivo obrigatório, reenvio não repete); perda (maior que o estoque é recusada); membro não cancela compra de outra pessoa; prazo de 30 minutos; compra já usada não pode ser cancelada; cancelar compra pelo caixa devolve o dinheiro uma vez só; planejada cancelada sai da lista de compras; concluída não se cancela; auditoria registra compras, produções e movimentos.

### Telas no navegador em 375 px (`testes-e2e/fatia3.mjs`, Supabase de teste)

**32 de 32 verificações passaram** (4ª rodada). Nas anteriores:
- 1 falha real, corrigida: ao concluir uma produção, ela sai da lista e a confirmação sumia junto; agora a tela volta para a aba Produção com "Produção concluída" no topo.
- 3 falhas do próprio teste, também corrigidas: ele esperava os itens numa ordem fixa e lia uma mensagem antiga.

Cadastro de farinha, leite condensado (cx de 395 g) e pote; receita que rende 10; bolo com 1 pote por unidade. Compra com 3 itens em kg, cx e und (total R$ 18,90 antes de salvar) → estoque 1 kg, 395 g, 10 und. Produção de 2 fornadas planejada; lista de compras mostra o leite e os potes que faltam. Concluir → **bloqueado**, com "faltam 395 g (precisa 790, tem 395)" e "faltam 10 und". O botão "Registrar compra" abre a compra já preenchida com 395 g e 10 und. Depois da compra, concluir → **20 bolos prontos**, insumos zerados. Contagem da farinha +200 g com motivo; histórico do item mostra compra, uso na produção e ajuste. Perda de 1 bolo → 19. Membro: compra do próprio bolso ("Do bolso de Membro Teste"), cancela dentro de 30 minutos (a farinha volta a 200 g) e não vê "Cancelar" na compra de outra pessoa. Sem rolagem lateral e alvos de toque ≥ 44 px em todas as telas verificadas. Os testes de tela das fatias 1 (29/29) e 2 (25/25) foram rodados de novo e passaram.

### Regras de leitura de números e datas (`npm test`)

7 testes, todos passaram (novos: saldo "2,5 kg", "1,185 L", "18 und"; data e hora "27/10, 14:05" em Fortaleza).

