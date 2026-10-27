# Diagnóstico — Checkpoint 1

> Etapas 1 (análise) e 2 (diagnóstico) da `docs/especificacao.md`.
> Data: 27/10/2026. Nenhum código da aplicação foi escrito e nenhuma migration foi aplicada.

## Resumo em 6 linhas

1. A planilha foi aberta com fórmulas (`openpyxl`, sem `data_only`). A Seção 2 da especificação está quase toda certa, mas tem **3 correções** e **9 problemas novos** (marcados com **[novo]** e **[correção]**).
2. Os materiais de **Nielsen** e **Leis de UX** não vieram no arquivo enviado. Fiz as matrizes de UX com a versão clássica de cada material. O **vídeo** chegou depois, pelo chat, e foi analisado na Seção 2: é um painel de computador mostrado dentro de um *Reel* do Instagram.
3. Esta pasta (`gamificacao-vp`) já tem uma aplicação, mas é **outro projeto**: um protótipo de gamificação da VP, sem login e sem banco. Não serve de base para o sistema de vendas.
4. Seus dois projetos no Supabase estão **pausados** (INACTIVE). Não consegui ler tabelas nem políticas. Também não reativei nenhum, porque isso é decisão sua.
5. Os maiores riscos: conexão ruim na rua, estoque com dois participantes ao mesmo tempo, conversão de unidades (cx, und), e o plano gratuito do Supabase, que pausa projetos parados.
6. No fim há **perguntas** que mudam a estrutura do sistema. Preciso das respostas antes da Etapa 3.

---

## 1. Mapeamento da planilha

### 1.1 Visão geral das abas

| Aba | Finalidade | Campos | Fórmulas reais | Relações | O que preservar | Problemas | Como vira funcionalidade |
|---|---|---|---|---|---|---|---|
| **Fluxo de Caixa** | Livro único de entradas e saídas | Data, Descrição (texto livre), Categoria (`Entrada` / `Saida `), Valor, Forma de pagamento, Quantidade | Só uma: `D415 = C6`, que aponta para célula vazia (sobra). Validação de dados: datas fixas 19–26/05/2025, categorias `"Saida ,Entrada"`, pagamento `"Pix,Dinheiro"` | Lida pela aba Acompanhamento da Meta | Um livro único, em ordem de data. Ideia de forma de pagamento por lançamento | P1, P2, P3, P5, P6, P11, P13, N1–N5 | **Fluxo de caixa**, só com dinheiro real. Recebimentos são gerados pelas vendas. Despesas, compras, reembolsos e aportes têm tipo próprio |
| **Acompanhamento da Meta** | Resumo | Faturamento Total, Despesas Totais, Lucro Bruto | `E7 = SUMIF('Fluxo de Caixa'!C5:C1467,"Entrada",D5:D1467)` → 7.674,15. `F7 = SUMIF(…,"Saida ",…)` → 2.598,45. `G7 = E7-F7` → 5.075,70 | Lê o Fluxo de Caixa | A pergunta "quanto falta para a meta" | P5, P6, N1. **Não há meta cadastrada** em nenhuma célula, apesar do nome da aba | **Painel da meta**, com saldo de caixa e resultado em quadros separados |
| **Planilha de Vendas** | Venda por cliente | Data, Cliente, Qtd Casadinhas, Qtd Clássicos, Qtd Avelã, Qtd Piscininhas, Qtd Total, Produziu?, Entregou? | `G = (C*2)+D+E+F` em 326 linhas. Outras 5 linhas têm o total digitado (os valores conferem). Validação: datas fixas 19–26/05 | Lida pela aba Vendas. **Não tem relação com o Fluxo de Caixa** | Itens por produto, cliente opcional, situação de produção e de entrega | P1, P4, P11, P12, N6, N7 | **Venda com itens**, **encomenda** (situação e data de entrega), **doação** como tipo próprio |
| **Vendas** (nome com espaço no final) | Totais por produto e por dia | Total geral e um bloco por dia da semana | `D10:G10 = SUM('Planilha de Vendas'!C5:C1328)` etc. `H10 = D10*2+E10+F10+G10` → 1.077. Os blocos diários são **valores digitados**, e só o total do bloco é fórmula. `H70 = D70*2+G70` ignora clássicos e avelã | Lê a Planilha de Vendas | Vendas por produto e por dia | P7, P8, N8 | **Consulta de vendas** por dia e produto, sempre calculada a partir dos registros |
| **Estoque Atual** (nome com espaço) | Estoque, compras, consumo e estoque ideal | Cinco blocos: Estoque Atual, Compras (qtd, preço, valor), Gasto por Dia (12), Estoque Ideal, Gasto por Fornada | `H = F*G` (compras). `K5:K17 = K22*12 … K34*12` | **Nenhuma ligação** com compras do Fluxo de Caixa nem com vendas | Lista de insumos, consumo por fornada, ideia de estoque mínimo | P9, P10, **[correção]** C3 | **Livro de movimentações de estoque**, saldo derivado, "quanto conseguimos produzir", lista de compras |
| **Custeio e Precificação** | Custo unitário por produto | 5 blocos (bolo chocolate, bolo Nutella, piscininha chocolate, piscininha Nutella, casadinho): custo de cada insumo por unidade, custo total, "margem de lucro", preço final | **Nenhuma fórmula.** Custos digitados como texto (`'R$ 0,13'`) ou como número, misturados. "Margem de lucro" também digitada | Nenhuma: a aba Indicadores redigita os mesmos números | Custos unitários de referência para o teste de aceite 2 | P9, N9 | **Receita** com insumos, quantidades e rendimento. **Custo calculado**, nunca digitado |
| **Indicadores** (nome com espaço) | Markup, MC, lucratividade, ROI | Por produto: custo, preço, markup, MC. Tabela de lucratividade: preço, custo, quantidade, lucro unitário, lucro total, lucratividade | `Markup = preço/custo`. `MC = preço − custo`. `Lucro total = qtd × MC`. `Lucratividade = lucro total / (preço × qtd)`. Custos, preços e **quantidades digitados** | Nenhuma ligação com outras abas | Markup e MC por produto (os valores são a referência do teste de aceite 2) | P8, P15, N10, N11 | **Indicadores por produto**, calculados pelo banco com o custo atual. Indicadores do desafio usam o custo do momento da venda |

### 1.2 Conferência dos 15 problemas da Seção 2.2

| # | Problema descrito | Situação | Evidência |
|---|---|---|---|
| P1 | Duas fontes de venda que não conversam | **Confirmado, e pior que o descrito** | Fluxo de Caixa vai até 24/05. A Planilha de Vendas vai até 26/05 (19 vendas a mais). Unidades: 1.146 (coluna Quantidade do Fluxo) contra 1.081 (Planilha de Vendas). Pelo preço de tabela, a Planilha de Vendas dá R$ 6.795,00, sem a doação. As entradas de venda do Fluxo somam R$ 7.577,50. Não dá para conciliar |
| P2 | Texto livre gera erro | Confirmado | Linha 65: "10 classicos" com quantidade 2. Linha 252: "combinado + piscina" por R$ 8,00. Há **51** lançamentos em que o valor não bate com o preço de tabela do que está descrito. Parte é promoção ou desconto, parte é texto incompleto ("Clássicos" por R$ 60,00), e não dá para saber qual é qual. Há **28** em que a coluna Quantidade não bate com a descrição |
| P3 | Mesmo produto com vários nomes | Confirmado, com mais nomes | Casadinha / Casadinho / Combinado / Combo. Avelã / Nutella / "bolinho de Nutella". Piscina / Piscininha. **[novo]** Clássico = "Bolo de cenoura com cobertura de chocolate". **[novo]** A "Piscininha de Chocolate" do Custeio se chama "Piscininha de Brigadeiro" nos Indicadores. "Bolinhos" sem sabor (13, 16 e 5 unidades) |
| P4 | Kits e variações sem estrutura | **Confirmado, com correção** | **[correção C1]** A casadinha não é "2 bolos quaisquer". O custo dela (3,77) é **exatamente** clássico (1,45) + avelã (2,32): é **1 bolo de chocolate + 1 de Nutella**. O preço do kit (R$ 12,00) é menor que a soma avulsa (R$ 14,00). A piscininha tem duas variações (2,08 e 2,95), mas uma só coluna de venda |
| P5 | "Lucro Bruto" é saldo de caixa | Confirmado | Entradas que não são venda: "Investimento Produtiva" R$ 50,00 (aporte), "Troco compras Pedro" R$ 50,40, "uber" R$ 1,25, "completar" e "completar valor" R$ 1,50 cada. Saídas que não são custo de venda: reembolsos de R$ 524,05, adiantamento "Dinheiro pedro compras" de R$ 450,00 e estorno de R$ 2,00. Compras de insumo somam cerca de R$ 1.478,60, e não se sabe quanto sobrou em estoque |
| P6 | Fórmula frágil (`"Saida "`) | Confirmado | A validação da coluna oferece `"Saida "` com espaço. Quem digitar "Saída" ou "Saida" sem espaço some do total |
| P7 | Intervalo errado na aba Vendas | **Confirmado, com correção do efeito** | **[correção C2]** As somas começam na linha 5. As linhas 3 e 4 (1 casadinha e 2 piscininhas) ficam de fora. O total certo de piscininhas é **163**, e não 161. O **163 da aba Indicadores é o certo**. Lá, quem está errada é a casadinha: 202, quando o certo é **203** |
| P8 | Valores digitados que deveriam ser calculados | Confirmado | Os blocos diários da aba Vendas não batem com a Planilha de Vendas em 7 dos 8 dias. Exemplos: segunda 19/05 tem 26 casadinhas digitadas e 27 calculadas; domingo 25/05 tem 19 piscininhas digitadas e 17 calculadas. Os rótulos são dias da semana, sem data, e há duas segundas |
| P9 | Custeio sem receita | Confirmado | O rendimento de 24 unidades por fornada é coerente com os números. Se a aba Gasto por Fornada (6 ovos, 1,17 cx de leite condensado…) for dividida por 24, os custos unitários do Custeio correspondem a preços de mercado plausíveis. É **dedução minha**: a planilha não tem preço de compra de nenhum insumo |
| P10 | Estoque desconectado | Confirmado | Estoque Atual e Compras estão **todos zerados ou vazios**. Unidades misturadas: kg, g, cx e und. O texto "depende da demanda" aparece em 3 campos numéricos (potinhos) |
| P11 | Doação aparece como venda | Confirmado, local exato | Está na **Planilha de Vendas** (linha 22, cliente "Doação", 50 clássicos, 24/05), e não no Fluxo. Os 50 entram nos 460 clássicos e por isso viram **receita** na aba Indicadores (50 × 5,05 = R$ 252,50 de "lucro" que não existiu) |
| P12 | Encomendas | Confirmado | Pedidos de 50, 100, 30, 24, 21 e 20 unidades. Clientes "CSA", "Beach Tenis", "Zeze". Todas as 331 linhas têm Produziu? = Entregou? = VERDADEIRO, então a planilha não mostra nenhum pedido em andamento |
| P13 | Reembolsos | Confirmado | Reembolsos a Gabriel (R$ 382,03) e a Victor (R$ 92,02 e R$ 50,00), sem a compra original. **[novo]** Há também **adiantamento**: R$ 450,00 dados ao Pedro para compras, com "troco" de R$ 50,40 devolvido. Isso é um quarto caso, prestação de contas (ver pergunta 10) |
| P14 | Taxas | Confirmado | Todos os 361 lançamentos são Pix, apesar de a validação também oferecer "Dinheiro" |
| P15 | ROI = 101,5 sem definição | Confirmado, e mais estranho | Valor digitado: 101,5176, **formatado como porcentagem**, por isso aparece como "10.151,76%". A hipótese mais próxima é Lucro Bruto ÷ aporte de R$ 50 = 101,514, que não é exato. **Não vou reproduzir sem a sua definição** |

### 1.3 Problemas novos (não estavam na Seção 2)

| # | Problema | Evidência | Como o sistema resolve |
|---|---|---|---|
| N1 | **O faturamento também perde a primeira linha** | O `SUMIF` começa em C5, mas o primeiro lançamento está na linha 4 (R$ 8,00). Faturamento real das entradas: 7.682,15. A planilha mostra 7.674,15 | Totais calculados por consulta ao banco, sem intervalo de células |
| N2 | Lançamentos sem data ou sem descrição | Linha 188: R$ 362,56 "Insumos", sem data. Linha 110: R$ 427,90, sem descrição | Data e tipo obrigatórios. Descrição obrigatória para despesas |
| N3 | Vendas agregadas, sem produto | "Vendas Pedro" (R$ 130, 20 und), "Vendas UFRN", "Promoção", "Zeze" (R$ 348, 48 und), "Beach Tennis" | Venda sempre com itens. Lançamento em lote no fim do dia, se você quiser (pergunta 9) |
| N4 | Ajustes de centavos como entrada | "completar" e "completar valor" (R$ 1,50 cada), "extorno para valor certo" (R$ 2,00) | Tipo "ajuste", com justificativa obrigatória |
| N5 | A coluna Quantidade mede coisas diferentes | A mesma descrição "1 combinado" aparece com quantidade 1 e com quantidade 2 | A quantidade é sempre de **itens vendidos**. As unidades físicas saem do cadastro do kit |
| N6 | Promoções e descontos sem registro | "Clássico promoção" por R$ 6,00 (tabela R$ 6,50). "3 combinados" por R$ 32 (tabela R$ 36) | Campo de desconto na venda. O preço sugerido é editável e o desconto fica registrado |
| N7 | Validação com datas fixas | As listas de datas só aceitam 19 a 26/05/2025 | Datas do desafio configuráveis. A data de hoje vem preenchida |
| N8 | Fórmula incompleta no último dia | `H70 = D70*2+G70` não soma clássicos nem avelã | Não se aplica: nada de fórmula célula a célula |
| N9 | Custos como texto | `'R$ 0,13'` é texto: nenhuma conta funcionaria com ele | Valores sempre numéricos |
| **[correção C3]** | **O consumo diário é sempre zero** | A especificação diz "consumo por fornada × 12". Na verdade `K5 = K22*12`, e as células K22:K34 estão **vazias**: o bloco "Gasto por Fornada" foi movido para P:Q e as fórmulas não acompanharam. Todo o "Gasto por Dia" dá 0 | Consumo calculado pela receita × fornadas planejadas |
| N10 | A lucratividade da piscininha usa só o custo de Nutella | 163 piscininhas × custo 2,95. Não se sabe quantas eram de chocolate (2,08) | Variação registrada em cada venda |
| N11 | A lucratividade ignora descontos e doações | Usa o preço de tabela × quantidade, com os 50 doados incluídos | MC calculada com o preço efetivamente praticado. Doação vira custo |

### 1.4 Números de referência para os testes (aba Custeio)

Recalculei cada custo total somando os itens do Custeio. **Todos conferem** com o total digitado:

| Produto | Composição do custo | Custo | Preço | MC (planilha) | Markup (planilha) |
|---|---|---|---|---|---|
| Clássico (bolo, cobertura de chocolate) | massa 0,60 + cobertura de chocolate 0,77 + embalagem 0,08 | 1,45 | 6,50 | 5,05 | 4,48 |
| Avelã / Nutella (bolo) | massa 0,60 + Nutella 1,64 + embalagem 0,08 | 2,32 | 7,50 | 5,18 | 3,23 |
| Piscininha de chocolate ("de brigadeiro") | massa 0,60 + cobertura de chocolate 0,77 + pote 0,71 | 2,08 | 8,00 | 5,92 | 3,85 |
| Piscininha de Nutella | massa 0,60 + Nutella 1,64 + pote 0,71 | 2,95 | 8,00 | 5,05 | 2,71 |
| Casadinha (kit) | 1 clássico + 1 avelã | 3,77 | 12,00 | 8,23 | 3,18 |

"Massa" = ovos 0,13 + óleo 0,12 + açúcar 0,11 + farinha 0,10 + cenoura 0,14. "Cobertura de chocolate" = chocolate em pó 0,12 + creme de leite 0,17 + leite condensado 0,46 + margarina 0,02.

Isso sugere uma estrutura de **massa base + cobertura + embalagem** (pergunta 7).

---

## 2. Análise do vídeo

### 2.1 Como foi feita

- O vídeo chegou depois, pelo chat (`WhatsApp Video 2026-10-27 at 00.27.41.mp4`), e foi salvo como `docs/referencias/video-design.mp4`.
- Duração: 7,1 s. Formato retrato, 480 × 1040.
- Extraí os quadros com `ffmpeg`. A detecção de cena devolveu só 1 quadro, porque as transições são suaves. Por isso aumentei a frequência para 2 quadros por segundo (14 quadros).
- Recortei e ampliei 3 vezes a faixa onde o painel aparece. Os quadros ficam em `docs/referencias/frames/`.
- **O que o vídeo é:** uma gravação de tela do celular mostrando um *Reel* do Instagram ("Dashboard V16 — React & CSS Source Code", perfil `code.xr`). O painel em si é uma **interface de computador (desktop)**, exibida numa faixa de uns 480 × 290 px no meio da tela. Em volta estão os elementos do Instagram (curtir, comentar, seguir, legenda e um trecho de código), que **não fazem parte da referência**.
- Por causa da resolução baixa, a maior parte dos textos pequenos fica ilegível. Descrevo só o que deu para ver.

### 2.2 O que vi nos quadros

**Estrutura e navegação**

- Barra superior com o nome "Dashboard" e um logotipo à esquerda.
- No centro, navegação em "pílula" com 5 abas: Dashboard, Customers, Deals, Analytic, Report. A aba ativa fica preenchida em preto com texto branco.
- À direita: alternador claro/escuro (sol e lua), dois ícones (notificações, com ponto vermelho) e o avatar com o nome do usuário.
- O vídeo mostra três telas: **Dashboard**, **Customers** e **Analytic**. Deals e Report não aparecem abertas.

**Tela Dashboard**

- Grade de cartões em 3 colunas.
- Cartão principal "Total revenue" com um número grande ($48,855.53), um ícone de olho ao lado e uma linha de contexto com selo verde ("+12% Revenue increase, Good progress").
- Filtros em pílula ("USD", "ALL TIME") e três botões em pílula: primário azul ("+ Add Deal"), escuro ("Send Invoice") e fantasma ("Import Leads").
- Cartões "Deals won" (ícone verde, seta para baixo) e "Deals lost" (ícone vermelho, seta para cima), com valor grande e **centavos menores** ($4,755.28), selo de variação colorido e subvalores lado a lado.
- Cartão escuro "Q4 Revenue" com medidor semicircular: "Target $9,430 / $20,000".
- Barras mensais (JAN–JUN) com o mês atual destacado em azul e verde-limão, e um marcador de valor.
- Cartão promocional "Get Premium Feature", pequenos cartões "Today's Leads 105" com selo vermelho e "Sales Report", e lista "Recent deals" com busca e colunas NAME, VALUE, SOURCE, DATE, STATUS.

**Tela Customers**

- Título e subtítulo cinza.
- À direita: busca, alternador "Table / Cards", ícone de download e botão primário azul "Add customer".
- 4 cartões de indicador (Total customers 9, Active this month 7, Lifetime value $34,135, Churned 0), cada um com ícone em círculo, rótulo, número e nota cinza.
- Cartão "All customers" com **chips de filtro com contagem** (All, Lead, Prospect, Customer, Churned).
- Tabela com avatar de iniciais coloridas, nome e e-mail, logo da empresa, **selo de situação colorido** (verde "Customer", vermelho "Churned", laranja "Prospect"), valor, responsável e último contato em tempo relativo ("2d ago", "1w ago").

**Tela Analytic**

- Título, seletor "MONTH" e botão de download.
- 4 indicadores. O primeiro é destacado em cartão azul cheio, com variação "▲ 9.1%" em cada um.
- Gráfico de área "Revenue" com curva suavizada e caixa de valor sobre o ponto ($13,573), eixo de dias (Oct 1 … Oct 25).
- Gráfico "Revenue vs target" com a linha do realizado e uma linha horizontal da meta.
- Rosca "Lead sources" com legenda em porcentagem, funil "Sales funnel" em barras horizontais e ranking "Top sales reps" com barra de progresso por pessoa.

**Estilo**

- Fundo cinza muito claro, levemente rosado. Cartões brancos com cantos bem arredondados, sombra muito leve e bastante espaço interno.
- Uma família tipográfica sem serifa. Números grandes em negrito, rótulos pequenos em cinza.
- Cores: azul forte como ação principal e destaque; verde-limão como segunda cor dos gráficos; preto nos elementos ativos; verde e vermelho nos selos de variação.
- **Tema escuro** (último segmento): mesma estrutura com fundo quase preto e cartões cinza-escuros, ativado pelo alternador sol/lua.

**Estados**

- Só um estado de **entrada / carregamento**: os cartões surgem aos poucos, os números aparecem como "$0.00" e "$0" antes do valor final, e a linha do gráfico aparece parcialmente desenhada.
- **Não aparecem** estados de vazio, erro ou sucesso, nem formulários.

### 2.3 O que adaptar, adaptar com mudanças ou descartar

| Elemento do vídeo | Decisão | Como entra no sistema |
|---|---|---|
| Cartões brancos arredondados, sombra leve, fundo neutro, bastante espaço | **Adaptar** | Base visual de todas as telas, neutra como pede a Seção 6.4 |
| Cartão de indicador: rótulo, número grande, linha de contexto | **Adaptar** | Painel: caixa, resultado, a receber, falta para a meta. O número inteiro é clicável e leva aos registros (Seção 6.2) |
| Centavos menores que o valor principal | **Adaptar** | Destaca a ordem de grandeza sem perder a precisão |
| Selo de situação colorido | **Adaptar com mudança** | Situações de pagamento, encomenda e estoque. **Sempre com texto**, nunca só cor, e com contraste para uso no sol |
| Chips de filtro com contagem | **Adaptar** | Vendas: Todas / Pendentes 3 / Encomendas 2 / Canceladas |
| Botão primário azul em pílula | **Adaptar** | "Nova venda" e confirmações. Azul só para a ação principal |
| "Revenue vs target" (realizado contra linha de meta) | **Adaptar com mudança** | Linha **acumulada** do resultado contra a meta, nos 7 dias. Pontos por dia ligados por **reta**: a curva suavizada sugere valores entre os dias que não existem |
| Barras por período com o atual destacado | **Adaptar com mudança** | Barras por **dia** do desafio, com hoje destacado. Uma cor só, sem o par azul e verde-limão decorativo |
| Medidor semicircular da meta | **Adaptar com mudança** | Barra horizontal simples com "R$ X de R$ Y" e "faltam R$ Z": lê-se melhor numa tela estreita |
| Ranking "Top sales reps" com barras | **Adaptar com mudança** | Vendas por participante, como consulta. Sem foto e sem tom de competição até você decidir |
| Lista com busca e colunas | **Adaptar com mudança** | No celular vira **lista de cartões** (uma venda por linha, com valor e situação). Sem tabela larga |
| Tempo relativo ("2d ago") | **Adaptar com mudança** | "Hoje, 14:32" e "Ontem, 09:10": num desafio de 7 dias a hora exata importa |
| Tema escuro | **Adaptar depois** | Útil à noite, mas o tema claro lê melhor no sol. Fica como refinamento da fatia 8 |
| Navegação em pílula no topo | **Descartar** | No celular, navegação **inferior** ao alcance do polegar (Seção 6.2, Lei de Fitts) |
| Grade de 3 colunas para computador | **Descartar** | Uma coluna no celular. Duas, no máximo, em tela grande |
| Caixa de valor ao passar o mouse sobre o gráfico | **Descartar** | Não existe "passar o mouse" no celular. O valor aparece ao **tocar** no ponto ou barra, ou escrito ao lado |
| Números contando a partir de "$0.00" e cartões surgindo em sequência | **Descartar** | Animação decorativa (vetada na Seção 6.4) e **perigosa num sistema financeiro**: mostrar "R$ 0,00" enquanto carrega parece um valor real. Carregamento será um bloco cinza estático (*skeleton*), sem número |
| Rosca de origens, funil de vendas, cartão "Get Premium", seletor de moeda | **Descartar** | Não há problema deste sistema que eles resolvam |
| Primeiro indicador em cartão azul cheio; verde-limão nos gráficos | **Descartar** | Cor só com significado (Seção 6.4) |
| Avatares com foto, logos de empresas, nome do usuário no topo | **Descartar** | Sem identidade inventada. Participante identificado por nome |
| Texto cinza muito claro e pequeno | **Descartar** | Pouco contraste para uso na rua. Rótulos com contraste mínimo AA (4,5:1) |

### 2.4 O que não deu para observar

- **Movimento e tempo das transições:** só vi o começo e o fim em quadros soltos. Não sei a duração nem a curva das animações. Como vou descartar as animações decorativas, isso não atrapalha.
- **Áudio:** é a música do *Reel*, sem relação com o design.
- **Telas Deals e Report**, e qualquer **formulário** (o que acontece ao tocar em "Add Deal" ou "Add customer").
- **Estados de vazio, erro e sucesso.**
- **Versão para celular do painel:** o vídeo só mostra a versão de computador.
- **Nome da fonte e cores exatas:** a resolução não permite. Vou propor uma fonte sem serifa comum e legível (ex.: Inter) e uma paleta neutra própria.
- Se algum desses pontos importa para você (por exemplo, um formulário do mesmo autor), mande capturas de tela.

---

## 3. Matrizes de UX

> **Atenção:** os arquivos `heuristicas-nielsen.*` e `leis-ux.*` também não vieram. Usei a versão clássica de cada material: as 10 heurísticas de Jakob Nielsen (1994, revisadas em 2020) e a lista de leis do site *Laws of UX* (Jon Yablonski). Quando o material de vocês chegar, confiro se a lista é a mesma e ajusto as matrizes.

### 3.1 Nielsen

| Heurística | Aplicação concreta no sistema | Problema que evita | Como verificar |
|---|---|---|---|
| 1. Visibilidade do estado do sistema | Cada envio mostra "salvando…", depois "salvo" ou "não salvo — tocar para reenviar". Faixa fixa quando a conexão cai. Ao vender, mostrar o estoque restante. Situação do pagamento visível na lista de vendas | Venda perdida sem ninguém perceber, ou lançada duas vezes "por garantia" | Simular rede lenta e sem rede no navegador (modo 3G / offline) e conferir cada mensagem. Teste de aceite 14 |
| 2. Correspondência com o mundo real | Usar os nomes que o grupo usa ("casadinha", "fornada", "a receber"). Apelidos cadastrados como sinônimos na busca. "Saldo de caixa" e "Resultado" com uma frase curta explicando a diferença | Confusão do tipo "Lucro Bruto" que na verdade é caixa (P5) | Perguntar a 2 participantes o que significa cada número do painel, sem explicar antes |
| 3. Controle e liberdade do usuário | "Desfazer" por alguns segundos depois de lançamentos não financeiros. Cancelar ou estornar venda com motivo, sem apagar. Voltar no formulário sem perder o que já foi preenchido | Medo de errar. Apagar e perder o histórico | Lançar, desfazer e conferir. Cancelar uma venda e conferir a auditoria (teste 12) |
| 4. Consistência e padrões | Um só componente para valor, quantidade e seleção de produto em todas as telas. As mesmas palavras para as situações (paga, pendente…). Cada cor sempre com o mesmo significado | "Combinado / Combo / Casadinha" (P3) e "Saida " com espaço (P6) | Lista de termos e de componentes revisada em todas as telas antes de cada entrega |
| 5. Prevenção de erros | Produto escolhido em lista, nunca digitado. Total calculado. Teclado numérico. Bloqueio por falta de estoque. Chave única por formulário. Bloqueio de unidades incompatíveis. Confirmação só para quantidades fora do comum | "10 classicos" com quantidade 2, "combinado + piscina" por R$ 8 (P2) | Tentar lançar valores inválidos e o mesmo envio duas vezes (testes 5, 14 e 15) |
| 6. Reconhecer em vez de lembrar | Botões dos produtos mais vendidos, com preço. Última forma de pagamento e participante logado já preenchidos. Total parcial sempre na tela | Esquecer preço, promoção ou quem vendeu | Registrar uma venda sem digitar nenhum nome de produto |
| 7. Flexibilidade e eficiência | Botões + e − na quantidade. "Repetir última venda". Lançamento em lote de várias vendas no fim do dia (a confirmar, pergunta 9) | Lançamentos agregados sem produto, como "Vendas Pedro" (N3) | Contar toques: meta de até 4 para uma venda de 1 item pago no Pix |
| 8. Estética e design minimalista | Painel com poucos números, em ordem de importância. Detalhes só ao tocar | Aba Indicadores com 5 blocos repetidos e números sem contexto | Em tela de 375 px, os 3 ou 4 números principais aparecem sem rolar |
| 9. Ajudar a reconhecer, diagnosticar e corrigir erros | Mensagens que dizem o que fazer, por exemplo: "Faltam 300 g de farinha para 2 fornadas. Registrar compra ou ajustar estoque" | Erro genérico que trava o participante na rua | Provocar cada erro previsto e conferir que a mensagem diz como resolver |
| 10. Ajuda e documentação | Tela "Como calculamos", gerada a partir de `docs/regras-de-negocio.md`. Ícone de informação em cada indicador. Rótulos "realizado", "projeção" e "estimativa" | Desconfiança nos números e ROI sem definição (P15) | Cada indicador do painel tem a explicação da fórmula a um toque |

### 3.2 Leis de UX (só as que resolvem algo real aqui)

| Lei | Aplicação concreta no sistema | Problema que evita | Como verificar |
|---|---|---|---|
| Lei de Fitts | Ações principais na metade de baixo da tela, ao alcance do polegar. Botão "Nova venda" fixo. Alvos de toque de 44 px ou mais | Toque errado usando uma mão, em pé | Medir os alvos no inspetor. Testar com uma mão em tela de 375 px |
| Lei de Hick | Na venda, mostrar primeiro só os produtos ativos, com os mais vendidos no topo. Opções raras (desconto, observação, cliente) recolhidas | Demora para escolher entre muitas opções | Cronometrar uma venda simples: meta de menos de 10 segundos |
| Princípio de Pareto | Otimizar primeiro o fluxo de venda. Na planilha, 344 de 361 lançamentos (95%) são entradas, quase todas de venda | Gastar esforço em telas pouco usadas | Contar os toques do fluxo de venda antes de refinar as outras telas |
| Limiar de Doherty | Resposta visual em menos de 0,4 s a cada toque (botão muda de estado na hora), mesmo que o banco demore mais. Nunca mostrar como "salvo" o que ainda não foi salvo | Toque repetido por falta de retorno, que gera duplicidade | Medir com a rede lenta simulada. Teste 14 |
| Lei de Jakob | Padrões que todo mundo já usa no celular: navegação inferior, teclado numérico, lista com toque para detalhe | Ter que aprender um jeito novo de usar | Um participante novo registra uma venda sem instrução |
| Lei de Tesler (conservação da complexidade) | A complexidade fica no sistema: conversão de unidades, custo da receita, baixa de kits. O participante só escolhe produto e quantidade | Participante fazendo conta de cabeça ou na calculadora | Nenhum campo pede um valor que o sistema pode calcular |
| Modelo mental | Separar visualmente "dinheiro no caixa" de "resultado" e "a receber" de "recebido", com os termos do grupo | A crença de que o saldo de caixa é o lucro (P5) | Perguntar a um participante "quanto lucramos?" e ver qual número ele lê |
| Carga cognitiva / Lei de Miller | Formulário curto (no máximo 5 a 7 decisões na venda), total sempre visível, padrões preenchidos | Erro por excesso de campos na pressa | Contar os campos obrigatórios de cada formulário |
| Lei da proximidade / da região comum | Itens da venda agrupados num cartão com o total logo abaixo. Caixa e resultado em quadros separados | Ler um número no contexto errado | Revisão visual: cada número está colado ao seu rótulo |
| Efeito Von Restorff | Só a ação principal com cor de destaque. Cor reservada para positivo, negativo e alerta | Excesso de destaque que esconde o alerta importante | Contar quantos elementos em destaque há por tela (ideal: um) |
| Efeito Zeigarnik | Pendências sempre visíveis: encomendas a entregar, vendas a receber, reembolsos a pagar | Encomenda esquecida e dinheiro não cobrado (P12, P13) | Criar uma encomenda e uma venda pendente e conferir que aparecem no painel |
| Efeito do gradiente de meta | Barra de progresso da meta com "quanto falta" e "ritmo necessário por dia", sempre como realizado, nunca como promessa | Desmotivação por não saber se o esforço está rendendo | Conferir à mão o progresso e o ritmo (teste 13) |
| Regra do pico-final | Fim da venda com confirmação clara (valor, forma de pagamento) e opção de desfazer | Dúvida se a venda entrou, que leva a lançar de novo | Observar se o participante confere a venda depois de lançar |
| Lei de Postel | Aceitar "1,5", "1.5" e "R$ 6,50" nos campos de valor e guardar sempre como número | Erro de digitação bloqueando a venda | Digitar valores em formatos diferentes |
| Paradoxo do usuário ativo | Nada de tutorial obrigatório. Dicas curtas no próprio campo | Ninguém lê manual antes de vender | Um participante novo completa o fluxo sem ajuda |

**Deixadas de fora, com o motivo:**

- Efeito estética-usabilidade: pode esconder erro de dado atrás de um visual bonito, e a especificação põe a precisão acima da aparência.
- Sobrecarga de escolha: já coberta pela Lei de Hick neste contexto.
- Agrupamento (*chunking*): já coberto por Miller e pela proximidade.
- Viés cognitivo: genérico demais para virar um requisito verificável aqui.
- Fluxo (*flow*): tarefas de segundos, sem imersão.
- Navalha de Occam: é um princípio geral, já aplicado em todo o resto.
- Lei de Parkinson: não há tarefa com prazo longo dentro da interface.
- Lei de Prägnanz: princípio visual geral, sem problema específico a resolver.
- Atenção seletiva: só vale para o aviso de "sem conexão", que já está coberto por Nielsen 1.
- Efeito de posição serial: com 4 ou 5 abas na navegação, o efeito é pequeno.
- Lei da similaridade: já coberta pela consistência (Nielsen 4).
- Lei da conectividade uniforme: já coberta pela proximidade e pela região comum.
- Memória de trabalho: já coberta por carga cognitiva e Miller.

---

## 4. Situação do projeto e do Supabase

### 4.1 Esta pasta

- **Existe uma aplicação, mas de outro assunto.** `gamificacao-vp` é um protótipo de gamificação da Vice-Presidência da Produtiva Júnior. Stack: Vite + React + TypeScript + Tailwind + Recharts + react-router (HashRouter). Publicado para ser incorporado no Google Sites.
- Não tem **login**, **Supabase** nem **banco**: os dados são fictícios e ficam em memória (`src/data/demo.ts`).
- Não há nada dele que eu possa aproveitar como código para o sistema de vendas. No máximo, a ideia de concentrar as regras num lugar só (`src/config/regras.ts`, `src/lib/calculos.ts`).
- **Não alterei nada do protótipo.** Só acrescentei `docs/especificacao.md`, `docs/referencias/` e este diagnóstico, no branch `claude/especificacao-etapa-1-xj93al`.
- O `CLAUDE.md` do zip **não foi copiado** para a raiz: ele passaria a valer para o projeto de gamificação também. Vai junto quando decidirmos onde o sistema novo fica (pergunta 1).
- Stack recomendada para o sistema novo, a detalhar no Checkpoint 2: **Next.js (App Router) + TypeScript + Tailwind + Supabase**, na Vercel, como a especificação prefere. Não vejo motivo para outra.

### 4.2 Supabase

Uma organização com dois projetos, **os dois pausados**:

| Projeto | Região | Criado em | Situação |
|---|---|---|---|
| `appgestãogeladinho` (`iebzbiccuwrchgdsojgn`) | sa-east-1 (São Paulo) | 18/12/2025 | INACTIVE |
| `pedrohenriquefanatsy-source's Project` (`dfzawglgkgconblqrmwf`) | us-east-1 (EUA) | 18/12/2025 | INACTIVE |

- Na primeira leitura, os dois responderam "banco inacessível no momento".
- **Atualização de 27/10/2026:** com a sua autorização, reativei o `appgestãogeladinho` e ele está ativo (ACTIVE_HEALTHY). Conteúdo, lido sem alterar nada:
  - **1 tabela**, `public."bancogestão"`, com só `id` e `created_at` e **0 linhas**;
  - RLS ligada, mas com **uma política `acesso_total_publico` que libera tudo para qualquer pessoa** (ler, inserir, alterar e apagar, mesmo sem login);
  - **0 usuários** no Auth, **0 migrations**, 0 funções, 0 gatilhos, 0 *buckets* de arquivos;
  - os *advisors* de segurança só apontam essa tabela, visível pela chave pública.
  - **Conclusão:** não há dados a preservar. A tabela vazia deve ser removida na primeira migration, mas isso é **destrutivo** e só faço com o seu "pode" (ver plano).
- O segundo projeto (`pedrohenriquefanatsy-source's Project`, EUA) continua pausado e não foi lido.
- Para o Brasil, São Paulo (sa-east-1) dá menos atraso que os EUA.
- **Credenciais que vão faltar** (não inventei nenhuma):
  - `NEXT_PUBLIC_SUPABASE_URL` e a chave pública (*anon* ou *publishable*). No painel: projeto → **Project Settings → API Keys**, ou botão **Connect** no topo. Com o projeto ativo, eu também consigo ler as duas pelo MCP do Supabase.
  - A chave `service_role` / *secret* **não vai para o navegador**. Só será usada, se for preciso, em variável de ambiente do servidor na Vercel.
  - Na Vercel, essas mesmas variáveis vão em **Project → Settings → Environment Variables**.
- **Ambiente de teste:** *branches* do Supabase exigem plano pago. No plano gratuito, as opções são usar o segundo projeto como teste ou criar um desafio marcado como **TESTE** no mesmo banco (pergunta 2).

---

## 5. Riscos técnicos

| Risco | Por que importa | Mitigação proposta |
|---|---|---|
| Plano gratuito pausa projeto parado | Os dois projetos já estão pausados. Entre um desafio e outro, o banco pode ficar pausado. Projetos pausados há muito tempo podem não ser mais restauráveis (o painel informa o prazo) | Exportação completa a qualquer momento (Seção 4.8). Avisar antes de cada desafio para reativar. Avaliar o plano pago se o uso for contínuo |
| Conexão ruim na rua | Venda perdida ou duplicada | Chave única por formulário, botão travado durante o envio, aviso claro de "não salvo". Fila offline só se você pedir (pergunta 5): ela aumenta muito a complexidade, porque o estoque pode mudar enquanto o celular está sem rede |
| Dois participantes vendendo o último item ao mesmo tempo | Estoque negativo ou venda sem produto | Baixa dentro de função do banco com bloqueio de linha (teste 15) |
| Precisão do custo por grama | Um custo como R$ 0,0098/g não cabe em `numeric(12,2)`. Arredondar cedo distorce a MC | Dinheiro final em `numeric(12,2)`. Custo por unidade base com mais casas (ex.: `numeric(14,6)`), arredondado só no valor final. A detalhar no plano |
| Conversões "cx", "und", "pacote" | "1,17 cx de leite condensado" só vira gramas com uma regra | Regra de conversão obrigatória no cadastro do insumo. Massa e volume nunca convertidos entre si |
| Custo "do momento da venda" vs. custo real do lote | O produto pode ter sido feito com insumo comprado a outro preço | Seguir a especificação: guardar na venda o custo padrão atual da receita. A diferença para o custo real fica documentada como limitação |
| Kits | Se a casadinha é montada na hora da venda, a baixa é dos bolos. Se é montada antes, é um produto em estoque | Depende da pergunta 3 |
| Encomendas pagas antes da entrega | Quando reconhecer a MC: no pedido ou na entrega? | Proposta: o recebimento entra no caixa quando o dinheiro entra, e a MC entra no resultado na entrega, junto com a baixa de estoque (pergunta 11) |
| Fuso America/Fortaleza | Venda às 22h não pode cair no dia seguinte por causa do horário UTC | Datas gravadas com fuso. "Dia" sempre calculado em America/Fortaleza |
| Funções do banco com privilégios | Funções RPC mal configuradas furam a RLS | Checagem de papel dentro de cada função, `search_path` fixo e advisors de segurança rodados a cada migration |
| Desconto em venda com vários itens | É preciso repartir o desconto entre os produtos para calcular a MC por produto | Rateio proporcional ao valor dos itens, documentado em `regras-de-negocio.md` |
| Materiais de UX e vídeo ausentes | A direção visual fica incompleta | Recebê-los antes do Checkpoint 2 |

---

## 6. Perguntas que mudam a estrutura

Para cada uma, deixei a minha recomendação. Se concordar com todas, basta dizer "de acordo com as recomendações" e responder só as que não têm recomendação (2, 6 e 12).

**Sobre o projeto (Seção 8)**

1. **Onde fica o sistema novo?** Esta pasta é o protótipo de gamificação. *Recomendo um repositório novo (ex.: `desafio-vendas`)*, para não misturar os dois. Se preferir esta pasta, o protótipo vai para uma subpasta.
2. **Qual projeto do Supabase usar?** Os dois estão pausados. Posso reativar o `appgestãogeladinho` (São Paulo) e ver o que tem dentro? Ele tem dados que precisam ser preservados? O teste fica num segundo projeto ou num desafio marcado TESTE no mesmo banco?
3. **Kits e encomendas.** Vai haver kits? O kit é fixo (como a casadinha: 1 de chocolate + 1 de Nutella) ou o cliente escolhe os componentes? É montado na hora da venda ou antes? Vai haver encomenda com entrega posterior? *Recomendo suportar as duas coisas, com kit fixo montado na venda.*
4. **Cliente:** identificado só em encomendas e vendas a receber, ou em toda venda? *Recomendo só nesses dois casos* (na planilha, todas as 331 vendas têm cliente, mas isso custa tempo na rua).
5. **Sem internet:** basta avisar quando a conexão cair, ou precisa de fila que sincroniza depois? *Recomendo começar só com aviso e proteção contra duplicidade.* A fila pode vir depois, como fatia extra.
6. **Sucesso e ROI:** o desafio mede resultado (lucro), faturamento ou outra coisa? Como a organização calcula o ROI? (Na planilha: 101,5176, sem fórmula e formatado como "10.151,76%".) Qual é a meta?
7. **Publicação:** na Vercel? Quem terá acesso ao link: só participantes logados, ou também alguém da organização só para ver?

**Sobre o negócio**

8. **Participantes:** quantos, e quem será administrador? *Os nomes que aparecem na planilha (Pedro, Gabriel, Victor) são só para referência. Não vou cadastrar ninguém sem você dizer.*
9. **Como as vendas são lançadas na prática?** Na hora, venda por venda, ou acumuladas no fim do dia ("Vendas Pedro: 20 un")? *Recomendo venda por venda, com um lançamento em lote opcional para o fim do dia.*
10. **Quem fica com o dinheiro?** Há uma conta única (Pix da PJ?) e dinheiro em espécie na mão de cada participante? E o adiantamento para compras (os R$ 450 do Pedro com troco)? *Recomendo controlar o caixa por "conta"* (ex.: Pix da equipe, dinheiro com fulano) *e tratar o adiantamento como prestação de contas.* Isso muda o modelo de dados.
11. **Encomenda paga antes:** o resultado entra no pedido ou na entrega? *Recomendo na entrega* (o dinheiro entra no caixa quando é recebido).
12. **Receitas:** cada produto tem receita própria, ou existe uma **massa base** usada por vários produtos, mais cobertura e embalagem? (O Custeio sugere a segunda opção.) "Fornada" é a massa base que rende 24 unidades? Cobertura e massa são feitas juntas?
13. **Produção e estoque de produto pronto:** produzem antes e vendem do estoque, ou produzem sob demanda? Isso define se a venda é bloqueada quando não há produto pronto. *Recomendo avisar, sem bloquear a venda, mas bloquear a entrega de encomenda sem produto pronto.*
14. **Materiais faltantes:** você pode enviar `heuristicas-nielsen`, `leis-ux` e `video-design.mp4`? Sem o vídeo, a direção visual do Checkpoint 2 vai seguir só a Seção 6.4.

---

## 7. Respostas recebidas (27/10/2026)

| Pergunta | Resposta | Consequência |
|---|---|---|
| 1. Onde fica o sistema | Repositório novo no seu GitHub | Repositório `desafio-vendas`. **Ainda não criado:** a integração do Claude não tem permissão para criar repositórios na sua conta (erro 403). Você cria, e eu passo tudo para lá |
| 2. Reativar o Supabase | Pode | `appgestãogeladinho` (São Paulo) reativado em 27/10/2026. Conteúdo na Seção 4.2 |
| Meta / ROI | "A meta a gente define" | Meta cadastrável pelo administrador. **ROI fica fora** até haver uma definição |
| Participantes | 4 a 5, você como administrador | Papéis administrador e membro, como na especificação |
| Massa base | "No momento não" | Cada produto (ou variação) tem a própria receita. Uma massa base compartilhada pode entrar depois sem refazer o modelo |
| Dinheiro | Única conta Pix | **Um caixa só.** Formas de pagamento continuam configuráveis (Pix, dinheiro, cartão), mas todas entram no mesmo caixa. Adiantamento a participante não será um caso próprio: quem paga do bolso é reembolsado (Seção 4.5 da especificação) |
| Vídeo | Enviado | Analisado (Seção 2) |

Perguntas sem resposta explícita (kits, cliente, sem internet, publicação, forma de lançar, encomenda paga antes, produção): **sigo as minhas recomendações da Seção 6** e marco cada uma no plano para você confirmar no Checkpoint 2.

---

*Arquivos analisados: `docs/referencias/Planilha Cakenoura.xlsx` (7 abas). Os dados da planilha **não** foram importados para lugar nenhum. Foram usados só para conferir cálculos.*
