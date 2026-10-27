# Revisão de usabilidade — fatia 8 (27/10/2026)

Revisão das matrizes do diagnóstico (`docs/diagnostico.md`, Seção 3) com o sistema pronto.
Para cada item: o que foi feito, onde conferir e o que ficou pendente. "Testado" quer dizer
que há verificação automática em `testes-e2e/` (375 px) ou em `supabase/testes/`.

Situação: **Feito** · **Parcial** (feito em parte, com o motivo) · **Pendente** (precisa de vocês).

## Heurísticas de Nielsen

| # | Situação | O que existe | Onde conferir |
|---|---|---|---|
| 1. Visibilidade do estado | Feito | Botão muda para "Salvando…/Registrando…" na hora e trava; "não foi salvo" quando a conexão cai, com o que foi digitado preservado; faixa "Sem conexão"; confirmação no topo depois de concluir produção, receber, entregar e cancelar; estoque de cada produto na grade da venda; situação de pagamento nas listas | Testado nas fatias 1, 3, 4 |
| 2. Mundo real | Feito | Termos do grupo: fornada, prontos, a receber, a reembolsar, do meu bolso; apelidos na busca da venda; "Saldo de caixa" e "Resultado" lado a lado com a frase "Dinheiro na conta" | Caixa e Início |
| 3. Controle e liberdade | Parcial | Cancelar com motivo (nada é apagado) e "Lançar de novo, já preenchida"; membro corrige o próprio lançamento em até 30 minutos. **Não há "desfazer em segundos"**: o cancelamento cumpre o papel e deixa histórico | Teste de aceite 12 |
| 4. Consistência | Feito | Os mesmos componentes em todas as telas (campo, seleção, cartão, selo, formulário); as mesmas palavras de situação; cor só com significado (azul = ação, verde = entrou, vermelho = saiu ou cancelado, âmbar = atenção) | Revisão visual das capturas |
| 5. Prevenção de erros | Feito | Produto escolhido na grade, nunca digitado; total calculado pelo banco; teclado numérico; produção bloqueada por falta de insumo; aviso antes de vender sem estoque; chave única por formulário (duplo toque não duplica); unidade incompatível recusada; reembolso não passa do devido | Testes de aceite 5, 14, 15 |
| 6. Reconhecer em vez de lembrar | Feito | Grade com preço, mais vendidos primeiro; última forma de pagamento já marcada; quem vendeu é quem está logado; valor do saldo já preenchido ao receber e ao reembolsar; compra pela falta já preenchida | Testado nas fatias 3, 4, 5 |
| 7. Flexibilidade e eficiência | Parcial | Venda de 1 item em 3 toques; + e −; "Repetir esta venda" (no aviso de venda registrada e no detalhe); busca por apelido. **Sem lançamento em lote no fim do dia** (a pergunta 9 do diagnóstico não foi respondida) | Testado na fatia 4 |
| 8. Minimalismo | Feito | Início com os números em ordem de importância; detalhes recolhidos ("Mais opções", "Filtros", itens que abrem ao tocar) | Capturas do Início |
| 9. Diagnosticar e corrigir erros | Feito | Mensagens dizem o que fazer: "faltam 395 g (precisa 790, tem 395)" com "Registrar compra"; "Não sei converter cx… Cadastre em Insumos → …"; "O reembolso passa do que o desafio deve (15,00)" | Testes das fatias 2 a 5 |
| 10. Ajuda e documentação | Parcial | Página "Como calculamos" (Mais); fórmula escrita sob o resultado no Início e no Caixa; rótulos "realizado", "projeção" e "estimativa". **Sem ícone de informação em cada indicador**: a explicação fica numa linha logo abaixo, em vez de um toque a mais | Fatia 8 |

## Leis de UX

| Lei | Situação | O que existe |
|---|---|---|
| Fitts | Feito | Navegação inferior; "＋" central; botão Confirmar fixo acima da barra; todos os alvos ≥ 44 px (verificado em todas as telas testadas) |
| Hick | Feito | Só produtos ativos, mais vendidos primeiro; busca aparece com mais de 8 produtos; opções raras recolhidas |
| Pareto | Feito | O fluxo de venda recebeu mais cuidado: 3 toques, total sempre visível, botão fixo |
| Doherty | Feito | O botão responde ao toque na hora; nada aparece como salvo antes do banco confirmar |
| Jakob | Feito | Padrões comuns de celular: barra inferior, teclado numérico, lista com toque para detalhe |
| Tesler | Feito | Conversão de unidades, custo de receita, kits, rateio de desconto, taxas e saldos calculados pelo banco |
| Modelo mental | Feito | Caixa e resultado em quadros separados; "a receber" separado de "recebido" |
| Carga cognitiva / Miller | Feito | Venda: produto, forma, pagamento (3 decisões); o resto recolhido |
| Proximidade | Feito | Itens da venda e total no mesmo cartão; partes do resultado escritas logo abaixo dele |
| Von Restorff | Feito | Um botão em destaque por tela |
| Zeigarnik | Feito | Pendências no Início: encomendas a entregar, reembolsos devidos, insumos abaixo do mínimo; "A receber" com contagem |
| Gradiente de meta | Feito | Barra da meta, quanto falta, ritmo necessário e média por dia; teste de aceite 13 |
| Pico-final | Feito | "Venda nº X registrada" com "Ver a venda" e "Repetir esta venda" |
| Postel | Feito | "6,50", "6.50", "R$ 6,50", "1.234,56" aceitos (`npm test`) |
| Usuário ativo | Feito | Nenhum tutorial; dicas curtas nos campos |

## Tema escuro

Feito, pela configuração do celular. Mesmos papéis de cor, com contraste conferido: texto 15:1,
texto de apoio 8:1, cores de significado ≥ 6:1, botão de ação 7:1. Testado em Início, Nova
venda, Estoque e Caixa (fatia 8).

## O que depende de vocês (não dá para eu medir sozinho)

- Perguntar a 2 participantes o que significa cada número do Início, sem explicar antes (Nielsen 2, modelo mental).
- Cronometrar uma venda simples na rua (meta: menos de 10 segundos) e ver se alguém novo registra sem ajuda (Hick, Jakob, usuário ativo).
- Decidir se querem lançamento em lote no fim do dia (Nielsen 7).
