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

## Fatia 4 — Vendas, recebimentos, encomendas, doações e cancelamento (27/10/2026)

### Banco (`supabase/testes/fatia4.sql`, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local | Passou (todas), 4 rodadas seguidas, junto com as fatias 1 a 3 num banco novo |
| Supabase de teste | Passou (versão sem o comando de apagar fora de bloco) |
| Supabase principal | Passou (verificação curta: venda com desconto, MC, estoque, cancelamento, gravação direta recusada, `anon` não lê). Funções e views conferidas: idênticas às do teste e do Postgres local |

Cenário: Clássico (custo 1,50, preço 6,50), Avelã (2,50 / 7,50), Casadinha = 1 Clássico + 1 Avelã + caixa de 1,00 (5,00 / 12,00); Pix 0% e cartão 4%.
- **Aceite 6** (vários itens e kit): 2 Clássico + 1 Casadinha, desconto 1,00 → subtotal 25,00, total 24,00, paga; desconto rateado 0,52 e 0,48; estoque clássico 10 → 7, avelã 10 → 9, caixa do kit 5 → 4 (o kit não tem estoque próprio); MC 9,48 + 6,52 = **16,00**; caixa +24,00. Cartão 4%: 1 Avelã → taxa 0,30, MC **4,70**, caixa +7,50 −0,30. **Passou.**
- **Aceite 7** (pendente e parcial): pendente não entra no caixa, a receber 6,50; recebe 3,00 → parcial, caixa +3,00, falta 3,50; receber 5,00 é recusado ("passa do que falta receber (3.50)"); recebe 3,50 → paga. Parcial na hora (pagou 5,00 de 15,00) → falta 10,00. **Passou.**
- **Aceite 8** (encomenda): sem data é recusada; com data, não baixa o estoque, fica fora do resultado e aceita sinal; pronta → entregue baixa 2 e reconhece MC **10,00**; entregar de novo não baixa de novo. **Passou.**
- **Aceite 9** (doação): total 0, sem forma nem recebimento, baixa o estoque, MC **−1,50**, caixa não muda; doação com pagamento é recusada. **Passou.**
- **Aceite 12** (cancelamento): outro membro não cancela; sem motivo é recusado; o dono cancela → estoque volta (3 clássicos, 1 avelã, 1 caixa), caixa −24,00, itens e recebimentos guardados, auditoria com antes "ativa" e depois "cancelada"; cancelar de novo não estorna em dobro; venda no cartão estorna 7,50 e devolve a taxa. **Passou.**
- **Aceite 14** (duplicidade): mesma chave devolve a mesma venda; uma venda só; estoque e caixa não dobram; recebimento reenviado não dobra. **Passou.**
- **Aceite 3** (vendas passadas): farinha sobe → custo atual do clássico 1,50 → 2,50; a venda anterior mantém custo 1,50 e MC 9,48. **Passou.**
- **Aceite 15** (concorrência, Postgres local, duas sessões): 1 bolo em estoque, duas vendas ao mesmo tempo → a 1ª passou; a 2ª esperou a trava e voltou com o aviso "Bolo C4: disponível 0, necessário 1". 1 venda gravada. **Passou.**
- Outras: falta de produto avisa sem gravar e, confirmada, grava com estoque negativo e o aviso; sem forma, desconto maior que o valor, recebido maior que o total e venda sem itens são recusados com mensagem; preço editado na hora (6,00 → MC 4,50); valor recebido nulo = paga pelo total do banco; ninguém grava direto em vendas, itens ou recebimentos; inativo não vende; `anon` não lê; saldo de estoque = soma do livro; caixa das vendas = recebimentos − taxas.

### Telas no navegador em 375 px (`testes-e2e/fatia4.mjs`, Supabase de teste)

**29 de 29 verificações passaram.** Nas rodadas anteriores:
- 1 falha real, corrigida: depois de receber, entregar ou cancelar, o formulário some e a confirmação sumia junto. Agora ela aparece no topo da venda.
- Falhas do próprio teste, também corrigidas: ele não esperava a venda seguinte terminar, lia a tela ainda carregando e somava dados de rodadas anteriores.

Cardápio montado pelas telas (insumos, receita, 2 produtos, kit com caixa, compra, 2 produções). Venda de 1 item em 3 toques (＋ → produto → Confirmar). Aceite 6: 2 Clássico + 1 Casadinha com desconto 1,00 → total **R$ 24,00** antes de confirmar, **MC R$ 21,80** no detalhe, desconto rateado R$ 0,52, estoque 6 e 9. Aceite 7: pendente aparece em "A receber" (R$ 7,50); recebe 3,00 → falta 4,50; o valor do saldo já vem preenchido e quita. Aceite 8: encomenda não baixa o estoque, aparece em "Encomendas", margem "na entrega"; entregue baixa 2. Aceite 9: doação R$ 0,00 com MC −R$ 0,30, baixa o estoque. D8: 7 avelãs com 6 em estoque → aviso "precisa 7 und, tem 6" e "Vender mesmo assim" → estoque −1. Aceite 14: duplo toque no Confirmar → uma venda só. Aceite 12: cancelar com motivo "Cliente desistiu" → estoque volta; "Lançar de novo, já preenchida" abre com os mesmos itens. Membro não vê cancelar na venda de outra pessoa e vê na própria. Sem rolagem lateral e alvos de toque ≥ 44 px. Os testes de tela das fatias 2 (25/25) e 3 (32/32) foram rodados de novo e passaram.


### Como repetir a concorrência e conferir a igualdade entre ambientes

- Concorrência (só no Postgres local): `supabase/testes/concorrencia/preparar.sql`, depois
  `sessao-1.sql` e `sessao-2.sql` em dois terminais ao mesmo tempo. Esperado: a sessão 1
  devolve `"ok": true`; a 2 espera e devolve `"ok": false` com a falta do bolo.
- Igualdade entre local, teste e principal (o resultado tem de ser igual nos três):

```sql
select
  (select md5(string_agg(p.proname || md5(p.prosrc), ',' order by p.proname))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'privado')) as funcoes,
  (select md5(string_agg(c.relname || pg_get_viewdef(c.oid), ',' order by c.relname))
     from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v') as views;
```

Em 27/10/2026, depois da fatia 4: funções `153e6d43…`, views `b32fbc4b…` nos três.

## Fatia 5 — Caixa: despesas, reembolsos, aportes, ajuste e resultado (27/10/2026)

### Banco (`supabase/testes/fatia5.sql`, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local | Passou (todas), junto com as fatias 1 a 4 num banco novo |
| Supabase de teste | Passou |
| Supabase principal | Passou (verificação curta dos aceites 10 e 11). Funções `261c9d5e…` e views `1d4ead9a…` iguais nos três |

- **Resultado**: venda de 2 bolos (preço 5,00, custo 1,00) → resultado +8,00 e caixa +10,00; perda de 1 bolo → resultado −1,00, caixa igual; compra de farinha → caixa −10,00, resultado igual. **Passou.**
- **Aceite 10** (despesa com reembolso): membro lança Uber 15,00 do bolso → resultado −15,00 uma vez, caixa igual, devido 15,00; reenvio não duplica; membro não paga reembolso; reembolso de 20,00 recusado ("passa do que o desafio deve (15.00)"); admin paga 15,00 → caixa −15,00, resultado igual, devido 0; reenvio do reembolso não duplica. **Passou.**
- Despesa reembolsada não cancela antes do reembolso; cancelar o reembolso devolve caixa e dívida; aí a despesa cancela e sai do resultado. Despesa pelo caixa: caixa −10 e resultado −10; cancelada volta, uma vez só. Compra do bolso reembolsada não cancela. Despesa zero ou sem descrição recusada. **Passou.**
- **Aceite 11** (aporte): PJ 100,00 → caixa +100,00, resultado igual; reenvio não duplica; aporte de participante sem pessoa recusado; cancelar tira do caixa. **Passou.**
- Ajuste: contou 5,00 a mais → lança +5,00; reenvio não repete; resultado igual; o livro de caixa termina no saldo. Membro não faz aporte nem ajuste; ninguém grava direto em despesas ou reembolsos; `anon` não lê o resultado. **Passou.**

### Telas no navegador em 375 px (`testes-e2e/fatia5.mjs`, Supabase de teste)

**26 de 26 verificações passaram** (1ª rodada). O teste lê o saldo e o resultado na tela do Caixa antes e depois de cada passo:
- Aceite 11: aporte PJ R$ 100,00 → caixa +100, resultado igual.
- Aceite 10: o membro lança "Uber" R$ 15,00 com "Paguei do meu bolso" → resultado −15, caixa igual, "A reembolsar" +15. O admin paga o reembolso com o valor já preenchido → caixa cai o valor devido, resultado igual, devido zera.
- Despesa pelo caixa R$ 10,00 → caixa e resultado −10. Cancelada pelo próprio membro → voltam.
- Conferência do saldo com +R$ 1,00 → caixa +1, resultado igual. O livro de caixa mostra aporte, reembolso e ajuste.
- O membro não vê aporte nem ajuste.

Sem rolagem lateral e alvos de toque ≥ 44 px em todas as telas.

## Fatia 6 — Painel, metas, projeção e cobertura (27/10/2026)

### Banco (`supabase/testes/fatia6.sql`, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local | Passou, junto com as fatias 1 a 5 num banco novo |
| Supabase de teste | Passou |
| Supabase principal | Migration aplicada; funções `261c9d5e…` e views `99a172d7…` iguais nos três |

- **Aceite 13** (meta conferida à mão): desafio de 7 dias iniciado anteontem, meta 100,00. Sem vendas: realizado 0, falta 100, ritmo 20,00 (100 ÷ 5), sem projeção. Com 3 vendas (margem 4,00 cada) e despesa de 2,00: realizado **10,00**, **10,0%**, falta **90,00**, ritmo **18,00**/dia (90 ÷ 5), média **3,33**/dia (10 ÷ 3), margem média **4,00**/unidade, projeção **23** unidades (22,5 arredondado para cima), meta de vendas 15 de 200 = **7,5%**. Meta de 8,00: falta 0, ritmo 0, **125%**. **Passou.**
- Cobertura: 1 dia com venda e sem estimativa → em branco; estimativa de 2/dia → 7 ÷ 2 = **3,5 dias (estimativa)**; com 2 dias com venda (4 unidades) → média 2/dia, 6 ÷ 2 = **3 dias** pela média. Membro não define demanda; `anon` não lê o painel. **Passou.**

### Telas no navegador em 375 px (`testes-e2e/fatia6.mjs`, Supabase de teste)

**16 de 16 verificações passaram** (3ª rodada). Nas anteriores:
- 1 falha real, corrigida: a tela da demanda estimada ficava 31 px mais larga que o celular.
- 3 falhas do próprio teste: ele lia o percentual junto do número de cima, clicava no botão errado e editava um desafio antigo.

O teste lê os números do Início e refaz as contas à mão antes e depois de uma despesa de R$ 10,00:
- **falta** = meta − realizado;
- **ritmo** = falta ÷ dias restantes;
- **%** = realizado ÷ meta.

A despesa baixou o realizado em exatamente 10,00. Há 2 gráficos e a mesma informação em tabela, e a projeção aparece rotulada. O administrador salva uma demanda estimada, e o Estoque mostra "~N dias (estimativa)". Sem rolagem lateral e alvos de toque ≥ 44 px.

## Fatia 7 — Exportação XLSX e CSV (27/10/2026)

Sem mudança no banco.

- `npm test`: 10 testes. Os 3 novos cobrem o CSV (";", vírgula decimal, aspas e fuso de Fortaleza) e o XLSX (número como número, data como série da planilha com formato de data, 14:05 em Fortaleza, texto escapado, célula vazia).
- Telas no navegador (`testes-e2e/fatia7.mjs`, Supabase de teste): **22 de 22 verificações passaram.**
  - A exportação de vendas baixada pela tela tem o ID na primeira coluna, o total como número e a data e hora como data.
  - O CSV do caixa sai com a coluna Valor.
  - As 14 exportações baixam em XLSX e CSV.
  - Um período sem dados devolve só o cabeçalho.
  - Sem login, nada sai (redireciona para o login).
- **Aceite 16** (totais do XLSX batem com o SQL). **Passou.**

  | Conta | Somado dos arquivos | Consulta SQL no Supabase de teste |
  |---|---|---|
  | Vendas (linhas) | 31 | 31 |
  | Total de todas as vendas | R$ 467,50 | `sum(total)` = 467,50 |
  | Total das vendas ativas | R$ 395,50 | `sum(total) filter (where situacao = 'ativa')` = 395,50 |
  | Saldo de caixa (CSV) | R$ 120,10, em 58 linhas | `sum(valor)` de `lancamentos_caixa` = 120,10, 58 linhas |

## Fatia 8 — Auditoria, acabamento, tema escuro e revisão de usabilidade (27/10/2026)

### Banco (`supabase/testes/fatia8.sql`, desfaz tudo no fim)

| Onde | Resultado |
|---|---|
| Postgres 16 local | Passou (completo, inclusive as tentativas de apagar e de alterar sem filtro) |
| Supabase de teste | Passou, sem os comandos de apagar e de alterar sem filtro (o Supabase pede confirmação para eles; ficam só no Postgres local, com as mesmas regras). **46 tabelas e views** recusadas para usuário não logado |
| Supabase principal | Migration dos itens de compra na auditoria aplicada |

- **Aceite 17** (permissões): outro membro não muda preço de venda, taxa da forma, custo do insumo nem a meta; não cadastra produto; não cancela venda, compra ou despesa de outra pessoa; ninguém apaga vendas, compras, despesas, recebimentos, estoque ou caixa; membro não lê a auditoria; usuário não logado não lê nenhuma tabela ou view nem chama função. **Passou.**
- Auditoria: o cancelamento aparece com antes "ativa", depois "cancelada" e quem cancelou; itens de compra e movimentos de estoque também. **Passou.**

### Telas no navegador em 375 px

- `testes-e2e/fatia8.mjs`: **22 de 22.** A auditoria aparece só para o administrador e mostra o antes e o depois, inclusive de um cancelamento. O membro não a vê nem pelo endereço. "Como calculamos" explica as contas. Início, Nova venda, Estoque e Caixa ficam corretos no tema escuro: fundo escuro, texto claro, sem rolagem lateral e alvos ≥ 44 px.
- **Rodada completa** com o sistema inteiro, da fatia 1 à 8: 29 + 25 + 32 + 29 + 26 + 16 + 22 + 22 = **201 verificações**, todas passando. O teste da fatia 1 foi atualizado para o painel novo do Início, que mostra o período e os dias que faltam no lugar dos três contadores antigos.

Revisão de usabilidade (Nielsen e Leis de UX) em `docs/revisao-ux.md`.

## Fatia 9 — Cadastro simplificado e marca Choc Bites (28/10/2026)

Pedido do administrador depois do uso real: menos passos no cadastro, receita dentro do produto,
poder excluir o que nunca foi usado, meta com resultado negativo e a logo no aplicativo.

### Banco (`supabase/testes/fatia9.sql`, desfaz tudo no fim)
Passou no Postgres local e no projeto de teste (variante sem o `DELETE` direto, que pede
confirmação na integração; o resultado do teste remoto é a mensagem `OK_FATIA9_REMOTO`).
- Insumo em uma chamada: R$ 16,00 por 500 g = R$ 0,032/g; R$ 7,90 por 395 g = R$ 0,02/g exato;
  pacote de 100 por R$ 12 = R$ 0,12 cada; sem embalagem e preço nasce sem custo.
- Estoque inicial entra como contagem ("Estoque inicial"), sem mexer no caixa.
- Recusas com mensagem clara: nome repetido, tamanho sem preço, unidade inválida, tamanho zero;
  membro e usuário não logado não cadastram nem excluem.
- Trocar embalagem e preço não duplica a embalagem e fica no histórico de preço.
- Receita dentro do sabor: nasce ligada, com o nome "Produto · Sabor"; custo do sabor = receita ÷
  rendimento + embalagem (0,795 + 0,12 = 0,915). O nome acompanha produto e sabor renomeados.
- Copiar de outro sabor: ingredientes, rendimento e embalagem; cópia independente; recusa copiar
  de sabor sem receita e por cima de ingredientes existentes.
- Compra em "embalagem" soma 2 × 395 g; produção e venda do sabor com receita embutida funcionam.
- Exclusão: insumo em receita ou embalagem, com compra (mesmo cancelada), sabor com venda ou em
  kit, produto com sabor vendido: bloqueados (na tela e no banco), com o motivo. Insumo só com
  contagem, sabor sem uso, kit e produto sem uso: saem com receita, ingredientes, embalagem,
  componentes e contagens, e ficam na auditoria com o que existia. O último sabor só sai com o produto.

### Telas no navegador em 375 px (`testes-e2e/fatia9.mjs`, Supabase de teste): 46 de 46
Manifesto e ícones abrem sem entrar; ícone do iPhone; logo na entrada e no topo; fundo creme;
tema escuro chocolate; item ativo da barra com o rosa; menu Mais em grupos e sem Receitas; a conta
aparece antes de salvar o insumo; estoque inicial de 1,5 kg; unidade "embalagem" já marcada na
compra; produto com receita (fornada R$ 14,30); novo sabor com receita copiada, independente do
primeiro; excluir sabor, insumo e produto sem uso; insumo em receita sem botão Excluir e com o
motivo; membro sem editar nem excluir; resultado negativo explicado, barra em 0% e sem
porcentagem negativa; sem rolagem lateral e alvos de toque ≥ 44 px.

### Os testes de tela antigos foram adaptados e rodados de novo
Fatias 1 a 8 (cadastro pelos novos formulários, "Sobra da venda", cores do tema escuro):
fatia 1: 29, fatia 2: 25, fatia 3: 32, fatia 4: 29, fatia 5: 26, fatia 6: 16, fatia 7: 22,
fatia 8: 22, fatia 9: 46 — **247 verificações, todas passaram**.
Os testes pegaram um erro meu durante o trabalho: na "compra da lista de compras" a quantidade vem
em gramas e eu tinha deixado a unidade padrão como "embalagem" (compraria 395 embalagens).
Corrigido: a unidade "embalagem" só vem marcada quando a pessoa escolhe o insumo na mão.

## Resumo dos 18 testes de aceite (Seção 10)

| # | Teste | Resultado | Onde está a prova |
|---|---|---|---|
| 1 | Receita com g, kg, cx e und; custo conferido à mão | Passou (17,403 a fornada; 0,725125 a unidade) | Fatia 2: banco e telas |
| 2 | Reprodução da planilha (custos e MC da Cakenoura) | Passou (custos 1,45/2,32/2,08/2,95/3,77; MC 5,05/5,18/5,92/5,05/8,23) | Fatia 2: banco |
| 3 | Mudança de preço de insumo: custo atual muda, vendas passadas não | Passou | Fatias 2, 3 e 4 |
| 4 | Produção: insumos baixam e produto entra, na mesma transação | Passou | Fatia 3: banco e telas |
| 5 | Estoque insuficiente: produção bloqueada e o que falta | Passou | Fatia 3: banco e telas |
| 6 | Venda com vários itens e kit | Passou (total 24,00; MC 16,00; componentes e embalagem do kit baixados) | Fatia 4: banco e telas |
| 7 | Venda pendente e parcial | Passou | Fatia 4: banco e telas |
| 8 | Encomenda: estoque só na entrega | Passou | Fatia 4: banco e telas |
| 9 | Doação: baixa estoque, entra no custo, sem receita | Passou | Fatia 4: banco e telas |
| 10 | Despesa com reembolso | Passou | Fatia 5: banco e telas |
| 11 | Aporte | Passou | Fatia 5: banco e telas |
| 12 | Cancelamento com histórico na auditoria | Passou | Fatias 4 e 8 |
| 13 | Meta: progresso, falta e ritmo conferidos à mão | Passou (10,0%; falta 90,00; ritmo 18,00) | Fatia 6: banco e telas |
| 14 | Duplicidade (duplo toque e reenvio) | Passou | Fatia 4: banco e telas |
| 15 | Concorrência no último item | Passou (a 2ª venda esperou e recebeu o aviso) | Fatia 4: Postgres local, duas sessões |
| 16 | Totais do XLSX batem com o SQL | Passou (31 vendas; R$ 467,50; caixa R$ 120,10) | Fatia 7 |
| 17 | Permissões | Passou | Fatias 1 a 8, consolidado na 8 |
| 18 | Celular (375 px): venda, despesa, produção, estoque | Passou (247 verificações, sem rolagem lateral, alvos ≥ 44 px, claro e escuro) | Fatias 1 a 9 |


## Fatia 10: compra sem unidade, cliente/bairro e receita de uma vez (28/10/2026)

- **Banco** (`supabase/testes/fatia10.sql`, Postgres local e projeto de teste): bairro e
  "desconhecido" gravados; nome + desconhecido juntos recusados; desconhecido não fica pendente;
  bairro curto demais recusado; rankings de clientes e bairros (cliente com maiúsculas
  diferentes conta como um só; doação e venda cancelada ficam de fora);
  `cadastrar_receita_variacao` cria tudo ou nada (lista vazia, rendimento zero, insumo repetido, unidade desconhecida e membro recusados; uma
  tentativa recusada não deixa nada pela metade). Os testes das fatias 1 a 9 continuam passando.
- **Telas** (`testes-e2e/fatia10.mjs`, 375 px): **39 de 39**. Compra sem escolha de unidade, com
  embalagem e último preço, valor sugerido (e valor digitado preservado); receita com custo ao
  vivo (R$ 14,30; R$ 1,43 por unidade rendendo 10; R$ 2,86 rendendo 5) e aviso de insumo sem
  preço; venda a desconhecido, com nome e bairro, bairro preenchido sozinho, pendente exigindo
  nome; ranking de clientes e de bairros; exportações. Sem rolagem lateral e alvos ≥ 44 px.
- **Testes antigos adaptados** (compra sem seletor de unidade, receita pelo novo formulário):
  fatia 2: 25, fatia 3: 32, fatia 4: 29, fatia 5: 26, fatia 6: 16, fatia 7: 24, fatia 8: 22,
  fatia 9: 46 — todos passaram. A fatia 1 (primeiro acesso) não mexe no que mudou e não foi
  repetida.
- Os testes pegaram dois detalhes de tela (link pequeno demais para o toque; frases do resumo
  quebrando mal), já corrigidos.

## Fatia 11: custeio por peso (29/10/2026)

- **Banco** (`supabase/testes/fatia11.sql`, Postgres local e projeto de teste): receita por peso
  guarda cobertura, estimativas e gramagem; recusas (gramagem zero, cobertura em unidades, sem
  cobertura) não deixam receita pela metade; antes de pesar o custo vem da estimativa
  (36,50 ÷ 2800 g); concluir sem pesos ou com peso final igual ao dos cubos é recusado; concluir
  2 fornadas com cubos 3800 g e 5200 g com chocolate baixa **1400 g** de chocolate, a massa e a
  embalagem; a produção guarda pesos e custos (massa 21,80 + chocolate 44,80 = 66,60 ÷ 5200 g);
  potinho bom = gramagem × custo por grama + embalagem, perdido = sem embalagem; concluir de novo
  não baixa duas vezes; preço novo do chocolate muda o custo por grama sem mexer na fornada já
  feita; falta de chocolate bloqueia e diz quanto falta (900 g); chocolate sem preço deixa o
  custo vazio e não conclui; copiar leva os dados de peso; voltar para unidades; membro só lê.
  Os testes das fatias 1 a 10 continuam passando.
- **Telas** (`testes-e2e/fatia11.mjs`, 375 px): **30 de 30**. Receita por peso com custo ao vivo,
  produto custeado por peso, concluir pesando (chocolate gasto, custo por grama, aviso de
  quantidade que destoa), estoque depois de concluir (chocolate 5 kg → 3,6 kg), custo por grama
  vindo da última fornada, voltar para unidades. Sem rolagem lateral e alvos ≥ 44 px.
- **Testes antigos** (fatias 2 a 10) rodados de novo, todos passaram.

## Fatia 12: faturamento, produção simples, contagem e simulação (30/10/2026)

- **Banco** (`supabase/testes/fatia12.sql`): registrar produção em um passo (2 fornadas, 23 renderam: baixa a receita × 2 e 23 potes; custo do potinho = 31,60 ÷ 23 + pote); reenvio não duplica; o custo do produto passa a usar o rendimento real (11,5 por fornada); faltar chocolate **registra e avisa** (1000 g), saldo negativo à vista; corrigir quanto rendeu ajusta produto e embalagem e o rendimento; contagem do dia (só as diferenças, motivo gravado, reenvio não repete, negativo e linha sem item recusados); simulação (chocolate: precisa 800, tem 150, falta 650 = R$ 20,80); membro simula, registra, corrige a própria e conta, mas não corrige a de outra pessoa.
- **Testes antigos ajustados ao comportamento novo**: fatia 3 (faltar insumo avisa em vez de travar), fatia 6 (realizado = faturamento 15,00; lucro estimado 10,00 à parte), fatia 11 (faltar chocolate avisa). Todos os testes de banco das fatias 1 a 12 passam.
- **Telas** (`testes-e2e/fatia12.mjs`, 375 px): **31 de 31**. Faturamento no Início; receita fixa; simulação; registrar produção; rendimento real (23 ÷ 2 = 11,5); corrigir para 24; aviso de falta de chocolate; contagem do dia; encomenda de R$ 24,00 com R$ 10,00 recebidos ("falta receber R$ 14,00") entregue recebendo o restante; título "vendedor - cliente · horário". Sem rolagem lateral e com alvos ≥ 44 px.
- **Testes de tela antigos adaptados** (fatia 3 agora simula e registra a produção; fatia 4 produz pelo novo formulário; fatia 5 lê o lucro estimado; fatia 6 confere faturamento e lucro; fatia 9 troca o "resultado negativo" por "despesa não mexe no faturamento"; fatia 10 com o novo texto de rendimento): fatias 2 a 10 passam. O teste de tela da fatia 11 (pesagem) foi removido junto com a tela.

### A reembolsar com detalhes (30/10/2026)
- Telas: na fatia 5 a despesa do bolso do membro aparece em "Ver no que foi gasto" com dia, horário, descrição e valor (29 de 29); na fatia 3 a compra do bolso aparece com horário, o insumo comprado e o valor (34 de 34). Sem rolagem lateral e alvos ≥ 44 px.

## Fatia 13: encomenda paga por inteiro conta no faturamento

- **Banco** (`supabase/testes/fatia13.sql`): encomenda de R$ 20,00 paga por inteiro já entra no realizado, sem entregar (lucro continua 0 até a entrega); encomenda parcial ou sem pagamento não conta; ao receber o restante passa a contar (R$ 30,00); entregar não duplica; cancelar tira da conta. Testes das fatias 3, 4, 5, 6, 10 e 12 seguem passando.
- **Telas** (`testes-e2e/fatia12.mjs`, 375 px): **32 de 32**. Nova venda tipo encomenda com "Pagou tudo" de R$ 12,00 sobe o faturamento do Início em R$ 12,00 sem entregar (617 → 629). `fatia4.mjs` 29/29 e `fatia6.mjs` 17/17.

## Fatia 14: venda com data e botão de voltar

- **Banco** (`supabase/testes/fatia14.sql`): venda de ontem fica no dia de ontem (lista, resultado diário e meta) e guarda o momento do registro; sem data = hoje; doação com data passada; data futura, antes do desafio e encomenda com data da venda são recusadas. Fatias 3, 4, 6, 10, 12 e 13 seguem passando.
- **Telas** (`testes-e2e/fatia14.mjs`, 375 px): **12 de 12**. Campo de data (começa hoje, máximo hoje; some na encomenda), venda de ontem aparece no dia certo e não em "Hoje", aviso "lançada em", botão de voltar com seta e ≥ 44 px. `fatia4` 29/29, `fatia10` 39/39, `fatia12` 32/32.
