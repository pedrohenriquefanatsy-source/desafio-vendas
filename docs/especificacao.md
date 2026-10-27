# ESPECIFICAÇÃO: SISTEMA DE GESTÃO DO DESAFIO DE VENDAS

> Este arquivo é a fonte de verdade do projeto. Releia-o no início de cada sessão.
> Materiais de referência ficam em `docs/referencias/`.

---

## 0. Como você deve trabalhar (leia antes de tudo)

Você vai construir um sistema web real, conectado ao meu Supabase, para gerir um desafio de vendas de alimentos de curta duração (normalmente 7 dias). Eu não sou desenvolvedor: explique decisões em linguagem simples e me diga sempre o que depende de mim.

O trabalho tem **dois pontos de parada obrigatórios**. Nesses pontos você **para, me mostra o resultado e espera minha aprovação** antes de continuar:

- **CHECKPOINT 1** — depois da análise e do diagnóstico (Etapas 1 e 2).
- **CHECKPOINT 2** — depois do plano: modelo de dados, telas e ordem de construção (Etapa 3).

Use o modo de planejamento até o Checkpoint 2. Só escreva código da aplicação e aplique migrations depois da minha aprovação.

Regras gerais:

- Não invente dados, características do vídeo ou regras ausentes. Quando faltar informação, diga o que falta.
- Não afirme que algo funciona sem ter testado.
- Se uma alteração for destrutiva (apagar tabela, coluna ou dados), pare e explique o risco antes.
- Nunca coloque a chave `service_role` ou senhas no código do navegador.

---

## 1. Materiais de referência

| Arquivo | O que representa | Como usar |
|---|---|---|
| `docs/referencias/Planilha Cakenoura.xlsx` | Lógica operacional e financeira de um desafio anterior (bolos de cenoura) | Fonte das regras de negócio. Não é o produto do novo desafio |
| `docs/referencias/heuristicas-nielsen.*` | As 10 heurísticas de usabilidade | Requisitos de comportamento da interface |
| `docs/referencias/leis-ux.*` | Leis psicológicas da UX | Use só as que resolvem um problema concreto deste sistema |
| `docs/referencias/video-design.*` | Referência visual e de interação | Direção visual, navegação e componentes |

### 1.1 Como analisar o vídeo

Você não consegue assistir a um vídeo diretamente. Faça assim:

1. Verifique se o `ffmpeg` está instalado (instale se faltar).
2. Extraia quadros nas mudanças de cena e também a intervalos regulares:
   ```bash
   mkdir -p docs/referencias/frames
   ffmpeg -i docs/referencias/video-design.mp4 -vf "select='gt(scene,0.25)',scale=1280:-1" -vsync vfr docs/referencias/frames/cena_%03d.png
   ffmpeg -i docs/referencias/video-design.mp4 -vf "fps=1/2,scale=1280:-1" docs/referencias/frames/t_%03d.png
   ```
3. Abra e examine os quadros. Se forem poucos ou pouco claros, aumente a frequência.
4. Descreva **apenas o que viu nos quadros**: estrutura das telas, hierarquia, navegação, componentes, estados (vazio, carregando, erro, sucesso), tipografia, espaçamento, uso de cor.
5. Animações e transições não aparecem bem em quadros soltos. Se algo depender de movimento ou de áudio, diga que não conseguiu observar e me peça capturas de tela ou uma descrição.
6. Separe: o que adaptar, o que adaptar com mudanças e o que **não** serve para este contexto (uso no celular, na rua, com pressa, com uma mão).

O vídeo orienta a aparência. Ele não autoriza copiar a interface nem se sobrepõe às regras de usabilidade e integridade dos dados.

---

## 2. O que já sei sobre a planilha (verifique, não confie cegamente)

Fiz uma leitura prévia. Use estes pontos como ponto de partida e confirme tudo abrindo o arquivo com fórmulas (`openpyxl`, sem `data_only`).

### 2.1 Abas e lógica atual

| Aba | Finalidade | Como funciona hoje |
|---|---|---|
| Fluxo de Caixa | Livro único de entradas e saídas | Data, descrição em texto livre ("1 piscina e 1 combinado"), categoria Entrada/Saida, valor, forma de pagamento (só Pix), quantidade |
| Acompanhamento da Meta | Resumo | `SUMIF` de Entrada e de "Saida " → Faturamento, Despesas e "Lucro Bruto" = entradas − saídas |
| Planilha de Vendas | Venda por cliente | Data, cliente, uma coluna por produto, total `=(Casadinhas*2)+Clássicos+Avelã+Piscininhas`, colunas Produziu? e Entregou? |
| Vendas | Totais por produto e por dia | Total geral por `SUM`; blocos por dia da semana com valores digitados à mão |
| Estoque Atual | Estoque, compras, consumo e estoque ideal | Consumo diário = consumo por fornada × 12; compras = qtd × preço; estoque ideal digitado |
| Custeio e Precificação | Custo unitário por produto | Custo de cada insumo por unidade, digitado como texto ("R$ 0,13"); "margem de lucro" = (preço − custo) / preço |
| Indicadores | Markup, margem de contribuição, lucratividade, ROI | Markup = preço/custo; MC = preço − custo; lucratividade por produto = qtd × MC |

### 2.2 Problemas encontrados (o sistema deve resolver cada um)

1. **Duas fontes de venda que não conversam.** O Fluxo de Caixa registra vendas em texto livre; a Planilha de Vendas registra por cliente e produto. Nada garante que batam. → No sistema, a venda é um registro estruturado (produtos e quantidades) e o recebimento é gerado a partir dela.
2. **Texto livre gera erro.** Ex.: "10 classicos" com quantidade 2; "combinado + piscina" por R$ 8,00. → Venda escolhida em lista de produtos, com total calculado.
3. **Mesmo produto com vários nomes.** Casadinha = Casadinho = Combinado = Combo; Avelã = Nutella; Piscina = Piscininha. → Cadastro único de produtos.
4. **Kits e variações sem estrutura.** A casadinha conta como 2 unidades (fórmula `*2`). A piscininha tem dois sabores (chocolate e Nutella) com custos diferentes, mas uma só coluna de venda. → Suportar produto composto (kit) e variações com custo próprio.
5. **"Lucro Bruto" é saldo de caixa, não resultado.** Entram no cálculo: aporte ("Investimento Produtiva"), troco de compras, estornos, reembolsos e compras de estoque ainda não consumido. → Separar caixa de resultado (ver seção 6).
6. **Fórmula frágil.** O `SUMIF` depende do texto "Saida " com espaço no final.
7. **Intervalo errado.** Na aba Vendas, as somas começam na linha 5, mas os dados da Planilha de Vendas começam na linha 3: as duas primeiras vendas ficam de fora.
8. **Valores digitados que deveriam ser calculados.** Totais diários, quantidades da aba Indicadores (piscininhas: 161 em Vendas, 163 em Indicadores), custos e estoque ideal.
9. **Custeio sem receita.** Os custos por unidade foram calculados fora da planilha. Não há quantidade de insumo por receita nem rendimento. Indício: adesivos e papel de embalagem = 24 por fornada, o que sugere rendimento de 24 unidades por fornada.
10. **Estoque desconectado.** Compras não alimentam o estoque e o estoque não é baixado pela produção. Unidades misturadas (kg, g, cx, und). Campo numérico com o texto "depende da demanda".
11. **Movimentos sem venda.** Doação de 50 clássicos aparece como venda. → Tipo de saída "doação/brinde", que baixa estoque e entra no custo, mas não é receita.
12. **Encomendas.** Pedidos grandes (50, 100 unidades) e as colunas Produziu?/Entregou? indicam vendas sob encomenda, com produção e entrega posteriores.
13. **Reembolsos.** Os participantes pagam compras do próprio bolso e são reembolsados depois; hoje isso aparece só como saída de caixa, sem a despesa original.
14. **Taxas.** Só há Pix, sem taxa. O sistema deve aceitar taxa por forma de pagamento (ex.: cartão).
15. **ROI = 101,5** sem fórmula nem definição visível. Pergunte antes de reproduzir.

Os dados da planilha são de um desafio passado (maio de 2025). **Não os importe como dados reais.** Use-os apenas em ambiente de teste, como referência para validar os cálculos (Seção 10).

---

## 3. Antes de desenvolver: inspecione o projeto e o Supabase

Descubra e me relate:

- Se já existe uma aplicação nesta pasta. Se existir: framework, estrutura, autenticação, integração com o Supabase e o que já funciona. Preserve o que funciona.
- Se não existir, proponha a stack no Checkpoint 2. Preferência: **Next.js (App Router) + TypeScript + Tailwind + Supabase**, publicável na Vercel. Justifique se sugerir outra.
- As tabelas, relações e políticas RLS do Supabase (use o MCP do Supabase ou a CLI, se disponíveis).
- Quais variáveis de ambiente e credenciais faltam. Diga onde eu as encontro no painel do Supabase. Não invente credenciais.

Todas as mudanças de banco devem ser **migrations versionadas** em `supabase/migrations/`. Se possível, teste em um branch ou projeto de desenvolvimento antes do principal.

---

## 4. Escopo funcional

O sistema precisa responder, todo dia: quanto vendemos, quanto recebemos, quanto falta receber, quanto gastamos, qual o custo variável do que foi vendido, qual o resultado, quanto falta para a meta, o que temos em estoque, quanto conseguimos produzir, o que precisa ser comprado e quem lançou o quê.

Registrar uma venda, uma despesa ou uma produção deve levar poucos toques.

### 4.1 Produtos, receitas e custeio

- O produto do desafio ainda não está definido: tudo é cadastrável sem mexer em código.
- **Insumo**: nome, tipo (ingrediente, embalagem, outro), unidade base, custo atual por unidade base, fornecedor (opcional), validade (opcional).
- **Receita** (ou "fornada"): lista de insumos com quantidade e unidade, rendimento em unidades.
- **Produto**: nome, categoria, receita, embalagens por unidade, preço de venda, situação (ativo/inativo).
- **Variação**: mesmo produto com sabor ou cobertura diferente e custo próprio (ex.: piscininha de chocolate e de Nutella).
- **Kit/combo**: produto formado por outros produtos (ex.: casadinha = 2 bolos). Vender um kit baixa o estoque dos componentes.
- **Custeio variável**, sem rateio de custos fixos:
  - Custo da receita = Σ (quantidade do insumo × custo por unidade base).
  - Custo variável unitário = custo da receita ÷ rendimento + embalagens por unidade.
  - Margem de contribuição unitária = preço − custo variável unitário − taxa da forma de pagamento.
  - MC % = MC unitária ÷ preço.
  - Mostre também o markup (preço ÷ custo), porque a planilha usa.
- **Unidades**: converter só entre unidades compatíveis (g↔kg, ml↔L). Para "caixa", "unidade" ou "pacote", exigir a regra explícita no cadastro (ex.: 1 cx de leite condensado = 395 g). Nunca converter massa em volume sem regra.
- **Histórico de custo**: quando o preço de um insumo mudar, o custo atual e as projeções mudam. Cada venda guarda o custo unitário e a margem **do momento da venda**. Mudança de preço nunca reescreve vendas passadas.

### 4.2 Vendas

- Fluxo rápido no celular: produto(s) → quantidade → forma de pagamento → confirmar. O total é calculado.
- Uma venda pode ter vários itens (o cliente leva "1 piscina e 1 combinado").
- Campos: data e hora (fuso America/Fortaleza), itens, preço unitário (sugerido pelo cadastro e editável), desconto, total, forma de pagamento, situação do pagamento, participante, cliente (opcional, texto curto) e observação.
- Formas de pagamento configuráveis (Pix, dinheiro, cartão etc.), cada uma com taxa percentual opcional.
- Venda ≠ dinheiro recebido. Situações: paga, pendente, parcialmente paga. Recebimentos são registros próprios ligados à venda.
- **Encomenda**: venda com data de entrega e situação (aguardando produção, pronta, entregue). O estoque só é baixado na entrega.
- **Doação/brinde**: baixa estoque e entra no custo, sem receita.
- Cancelar ou corrigir: nunca apagar. Registrar o cancelamento ou o estorno, reverter estoque e recebimentos e manter o histórico.
- Consulta por dia, produto, participante e forma de pagamento.

### 4.3 Produção

- Produção **planejada** (não movimenta estoque) e **concluída** (movimenta).
- Ao concluir, numa única transação no banco:
  1. verificar disponibilidade de insumos e embalagens;
  2. calcular o consumo pela receita e pela quantidade de fornadas ou unidades;
  3. registrar as saídas de insumos;
  4. registrar a entrada de produtos acabados (quantidade efetivamente produzida, que pode diferir da planejada);
  5. registrar perdas, quando houver, sem complicar o fluxo principal.
- Se faltar insumo: bloquear e mostrar o que falta e quanto. Oferecer "registrar compra" ou "ajustar estoque" com justificativa.

### 4.4 Estoque

- Um único **livro de movimentações** (entrada por compra, saída por produção, entrada de produto acabado, saída por venda, doação, perda, ajuste). O saldo é derivado das movimentações, não digitado.
- Insumos e produtos acabados separados na interface.
- Estoque nunca fica negativo sem aviso.
- **Quanto conseguimos produzir**: fornadas possíveis com o estoque atual e qual insumo limita.
- **Lista de compras**: o que falta para atingir o plano de produção ou o estoque mínimo.
- **Cobertura** (dias que o estoque atende): com 2 ou mais dias de vendas, use a média dos dias com venda; antes disso, use uma demanda estimada que eu informar, sempre rotulada como "estimativa".

### 4.5 Financeiro

- Fluxo de caixa só com dinheiro que efetivamente entrou ou saiu.
- Tipos de lançamento: recebimento de venda, despesa, compra de insumos, reembolso, aporte de participante ou da PJ, ajuste.
- **Compra de insumos**: aumenta o estoque e reduz o caixa. Não é custo do produto vendido; o custo entra no resultado quando o produto é vendido.
- **Despesa** (algo que não vira estoque, ex.: Uber, adesivos de divulgação): reconhecida uma vez no resultado.
- **Reembolso**, em três estados:
  1. despesa ou compra paga com dinheiro do participante → reconhecida uma vez e gera "a reembolsar" para aquele participante;
  2. saldo devido por participante, visível;
  3. reembolso pago → saída de caixa que liquida a dívida, sem afetar o resultado de novo.
- **Aportes** entram no caixa e não são receita.
- Mostrar sempre, separados: **saldo de caixa** e **resultado**.

### 4.6 Resultado e metas

- Resultado = Σ margem de contribuição das vendas (com custo do momento da venda) − custo das doações e perdas − despesas reconhecidas.
- Configurar: data de início, data de fim, meta de resultado, meta de vendas (opcional).
- Painel da meta: realizado, meta, % alcançado, quanto falta, dias decorridos e restantes, ritmo necessário por dia, resultado por dia e acumulado.
- Projeção de unidades necessárias para a meta, usando a MC atual e o mix de produtos vendido até agora (ou um mix informado), com as premissas escritas na tela.
- Distinguir na interface: **realizado**, **projeção** e **estimativa**. Nunca prometer que a meta será atingida.
- Gráficos pensados para 7 dias (barras por dia, linha acumulada contra a meta). Nada que dependa de meses.

### 4.7 Participantes, permissões e auditoria

- Login real com Supabase Auth.
- Dois papéis bastam: **administrador** (configura desafio, produtos, preços, metas; corrige e cancela lançamentos) e **membro** (registra vendas, despesas, compras e produção; corrige os próprios lançamentos dentro de um prazo curto). Proponha outra estrutura no Checkpoint 2 só se tiver motivo.
- Todo registro importante guarda quem criou e quando, quem alterou e quando.
- Tabela de auditoria com valor anterior e novo para vendas, recebimentos, despesas, compras, preços, receitas, estoque, produção e metas (gatilhos no banco).
- Registros financeiros não podem ser apagados por membros; correção por estorno ou cancelamento.

### 4.8 Exportação

- XLSX e CSV, a qualquer momento, com filtro por período, produto e participante quando fizer sentido.
- Exportações: vendas (com itens), recebimentos, produtos e receitas, insumos, compras, movimentações de estoque, produção, despesas, reembolsos, fluxo de caixa, metas e indicadores.
- Datas em formato consistente, valores numéricos como número (não texto) e o ID de cada registro.
- Os dados exportados vêm do Supabase, não da tela.

---

## 5. Integridade dos dados (regras técnicas)

- Dinheiro como `numeric(12,2)` (ou centavos inteiros). Nunca `float`.
- Operações compostas (venda com itens + baixa de estoque + recebimento; conclusão de produção) em **funções do Postgres (RPC)**, numa transação só. O navegador não calcula resultados definitivos.
- **Idempotência**: cada formulário gera um UUID ao abrir; o banco rejeita um segundo envio com a mesma chave. Botão desabilitado durante o envio.
- Concorrência: a baixa de estoque deve ser segura com dois participantes lançando ao mesmo tempo (bloqueio de linha ou verificação dentro da transação).
- Regras de negócio centralizadas (banco e uma camada de serviço). Não repetir cálculos em várias telas.
- Documente os cálculos num arquivo `docs/regras-de-negocio.md`.
- RLS ativa em todas as tabelas. Rode os advisors de segurança do Supabase e corrija os alertas.

---

## 6. Interface e usabilidade

### 6.1 Contexto de uso

Participantes em pé, vendendo na rua ou na universidade, com uma mão, sinal de internet às vezes ruim, pressa. Isso manda mais do que qualquer referência visual.

### 6.2 Requisitos

- Mobile-first. Navegação inferior com as 4 ou 5 áreas principais e um botão de ação rápida para "Nova venda".
- Alvos de toque de no mínimo 44 px. Teclado numérico nos campos de valor e quantidade.
- Formulários curtos, com padrões preenchidos (data de hoje, último método de pagamento usado, participante logado).
- Estados vazio, carregando, erro e sucesso em todas as telas.
- Mensagens de erro que dizem como resolver.
- Confirmação só em ações destrutivas ou financeiras relevantes; para o resto, desfazer.
- Indicador claro quando a conexão cair e o lançamento não foi salvo.
- No painel: os indicadores ordenados por importância, cada número clicável levando aos registros que o formam.

### 6.3 Matrizes que você deve entregar no Checkpoint 1

**Nielsen** — uma linha para cada uma das 10 heurísticas:

| Heurística | Aplicação concreta no sistema | Problema que evita | Como verificar |
|---|---|---|---|

**Leis de UX** — só as que resolvem algo real aqui, com a mesma estrutura. Diga quais leis do material você deixou de fora e por quê, em uma linha cada.

### 6.4 Direção visual

- Neutra e profissional, até que o produto e a marca sejam definidos. Sem logotipo nem identidade inventada.
- Sem emojis, gradientes, animações decorativas, fontes decorativas ou excesso de cor e sombra.
- Uma família tipográfica legível, escala de espaçamento consistente, componentes reutilizáveis.
- Cor reservada para significado (positivo, negativo, alerta, ação principal).
- Aplique do vídeo o que for compatível com tudo acima.

---

## 7. Ordem de execução

### Etapa 1 — Análise
Planilha (com fórmulas), materiais de UX, vídeo (pela Seção 1.1) e projeto ou Supabase existente.

### Etapa 2 — Diagnóstico → **CHECKPOINT 1**
Entregue em `docs/diagnostico.md` e resuma no chat:
- mapeamento da planilha (aba, finalidade, campos, fórmulas, relações, o que preservar, problemas, como vira funcionalidade), confirmando ou corrigindo a Seção 2;
- análise do vídeo (o que viu, o que adaptar, o que descartar, o que não deu para observar);
- as duas matrizes de UX;
- situação do projeto e do Supabase;
- riscos técnicos;
- **perguntas** que mudam a estrutura. Pergunte pelo menos sobre os pontos da Seção 8 que eu ainda não tiver respondido.

Pare e espere minha resposta.

### Etapa 3 — Plano → **CHECKPOINT 2**
Entregue em `docs/plano.md`:
- stack e arquitetura;
- modelo de dados (tabelas, colunas principais, relações, funções RPC, gatilhos e políticas RLS), com um diagrama;
- mapa de telas e o fluxo de cada ação principal em passos (quantos toques);
- ordem de construção em fatias que funcionam de ponta a ponta.

Pare e espere minha aprovação.

### Etapa 4 — Implementação, em fatias
Cada fatia termina funcionando, com dados persistidos e testada:
1. Base: projeto, autenticação, papéis, configuração do desafio, formas de pagamento.
2. Insumos, receitas, produtos, kits e custeio.
3. Compras, estoque e produção.
4. Vendas, recebimentos, encomendas e doações.
5. Despesas, reembolsos, aportes e fluxo de caixa.
6. Painel, metas e projeções.
7. Exportação.
8. Auditoria e refinamento visual.

Ao fim de cada fatia, me diga em 3 a 5 linhas o que ficou pronto e como testar no celular.

### Etapa 5 — Validação (Seção 10)

### Etapa 6 — Entrega
O que foi implementado; tabelas, funções e migrations; variáveis de ambiente; passos manuais no Supabase e na Vercel; como acessar; testes feitos e resultados; limitações; o que depende de mim. Nada marcado como pronto sem teste.

---

## 8. Decisões em aberto (pergunte no Checkpoint 1 se eu não tiver respondido)

1. Já existe um projeto nesta pasta e um projeto no Supabase, ou começamos do zero?
2. Quantos participantes e quem será administrador?
3. Haverá kits ou combos e encomendas com entrega posterior?
4. O cliente precisa ser identificado em toda venda ou só em encomendas e fiado?
5. É necessário funcionar sem internet (fila local que sincroniza depois) ou basta avisar quando a conexão cair?
6. Como o desafio mede sucesso: resultado (lucro), faturamento ou outro? Como a organização calcula o ROI?
7. Onde o sistema vai ficar publicado (Vercel?) e quem terá acesso ao link?

---

## 9. Prioridades

1. Integridade financeira e de estoque.
2. Integração confiável com o Supabase.
3. Rapidez no celular.
4. Clareza das informações.
5. Facilidade de manutenção.
6. Qualidade visual.
7. Exportação confiável.

Não sacrifique precisão por um painel bonito, nem rapidez por funcionalidades sem uso.

---

## 10. Testes de aceite

Use um ambiente ou um desafio marcado como **TESTE**, separado dos dados reais.

1. **Receita**: cadastrar receita com insumos em g, kg, cx e und; conferir o custo unitário à mão.
2. **Reprodução da planilha**: cadastrar os 5 produtos da Cakenoura com os custos unitários da aba Custeio (1,45; 2,32; 2,08; 2,95; 3,77) e os preços (6,50; 7,50; 8,00; 8,00; 12,00); conferir que a MC unitária bate com a aba Indicadores (5,05; 5,18; 5,92; 5,05; 8,23).
3. **Mudança de preço de insumo**: o custo atual e as projeções mudam; vendas anteriores não.
4. **Produção**: concluir produção; insumos baixam e produto acabado entra, na mesma transação.
5. **Estoque insuficiente**: a produção é bloqueada e o sistema mostra o que falta.
6. **Venda com vários itens e kit**: total, baixa de estoque dos componentes, MC e resultado corretos.
7. **Venda pendente e parcial**: não entra no caixa até o recebimento; o saldo pendente aparece.
8. **Encomenda**: estoque só baixa na entrega.
9. **Doação**: baixa estoque, entra no custo, não gera receita.
10. **Despesa com reembolso**: o resultado reconhece o gasto uma vez; o caixa cai só no reembolso; o saldo devido zera.
11. **Aporte**: aumenta o caixa, não altera o resultado.
12. **Cancelamento**: reverte estoque e recebimento e mantém o histórico na auditoria.
13. **Meta**: progresso, valor restante e ritmo necessário conferidos à mão.
14. **Duplicidade**: enviar a mesma venda duas vezes (duplo toque e reenvio após falha simulada) gera um registro só.
15. **Concorrência**: duas vendas simultâneas do último item em estoque; apenas uma passa sem aviso.
16. **Exportação**: totais do XLSX batem com uma consulta SQL no Supabase.
17. **Permissões**: membro não altera preços nem apaga lançamentos de outros; usuário não logado não lê nada.
18. **Celular**: fluxos de venda, despesa, produção e estoque testados em viewport de 375 px.

Registre o resultado de cada teste em `docs/testes.md`.
