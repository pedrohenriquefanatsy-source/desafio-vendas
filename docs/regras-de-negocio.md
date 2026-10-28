# Regras de negócio

> Onde cada regra mora e como ela é calculada. Atualizado a cada fatia.
> Regra de ouro: **o banco decide**. A tela só mostra e ajuda a preencher; quem grava,
> calcula e bloqueia é o Postgres (funções RPC, gatilhos e RLS), numa transação só.

## 1. Participantes e permissões (fatia 1)

| Regra | Como funciona | Onde |
|---|---|---|
| Papéis | Dois: **administrador** e **membro** | `perfis.papel` |
| Primeiro usuário | O primeiro usuário criado no Supabase vira **administrador ativo** | gatilho `privado.criar_perfil_novo_usuario` |
| Novos participantes | Começam **desativados**. Só acessam depois que o administrador ativa | idem; tela Mais → Participantes |
| Sem administrador | O sistema recusa qualquer mudança que deixe zero administradores ativos | `admin_atualizar_participante` |
| Quem vê o quê | Participante ativo vê todos os dados do desafio (D15). Desativado vê só o próprio perfil. Quem não está logado não vê nada | RLS + `privado.eh_participante()` |
| Quem altera cadastro | Desafio, metas e formas de pagamento: só o administrador | RLS + `privado.eh_admin()` |
| Exclusão | Nada de desafio, forma de pagamento ou perfil é apagado pelo sistema. Forma de pagamento é **desativada** | `revoke delete` |
| Cadastro aberto | Desligado no Supabase ("Allow new users to sign up" = não). Usuários são criados pelo administrador no painel | painel do Supabase |

## 2. Registro e auditoria (fatia 1)

- Toda tabela importante tem `criado_por`, `criado_em`, `alterado_por` e `alterado_em`, preenchidos **pelo banco** (`privado.preencher_registro`). O que a tela mandar nesses campos é ignorado.
- A tabela `auditoria` guarda, para cada inclusão, alteração ou exclusão, o **valor anterior** (`antes`), o **novo** (`depois`), quem fez e quando (`privado.registrar_auditoria`). Só o administrador lê.
- Tabelas auditadas até agora: `perfis`, `desafios`, `formas_pagamento`, `insumos`, `insumo_conversoes`, `receitas`, `receita_itens`, `produtos`, `variacoes`, `variacao_embalagens`, `kit_componentes` (e o histórico de preço de insumo). As próximas fatias acrescentam vendas, recebimentos, despesas, compras, preços, receitas, estoque e produção.

## 3. Desafio e meta (fatia 1)

- Datas do desafio: `inicio` e `fim` (o fim não pode ser antes do início).
- No máximo **um desafio em andamento** por vez.
- "Hoje" é sempre a data em **America/Fortaleza** (UTC−3, sem horário de verão).
- **Dias no total** = fim − início + 1.
- **Dias decorridos** = dias completos antes de hoje dentro do período (0 antes de começar; o total depois de acabar).
- **Dias restantes** = total − decorridos, **contando hoje**. É a base do ritmo necessário por dia.
- Exemplo: desafio de 25/10 a 31/10, hoje 27/10 → 7 no total, 2 decorridos, 5 restantes.
- Meta de resultado e meta de vendas são opcionais e maiores que zero. Mudanças ficam na auditoria.
- ROI: **não calculado** até haver uma definição (decisão D14).

## 4. Formas de pagamento (fatia 1)

- Nome único (sem diferenciar maiúsculas: "pix" = "Pix").
- Taxa percentual de 0 a 99,99. Pix já vem cadastrado com 0%.
- Todas as formas caem **no mesmo caixa** (conta Pix única).
- A taxa entra na margem de contribuição de cada venda (fatia 4).

## 5. Envio de formulários (fatia 1, vale para todas)

- **Chave única por registro** (idempotência): o formulário gera uma chave ao enviar; se o sinal falhar e a pessoa tocar de novo, a mesma chave é reenviada e o banco não duplica. Depois de um envio que deu certo, a chave muda.
- Botão travado durante o envio; um segundo toque é ignorado.
- Se o envio falhar, o que foi digitado **continua na tela** e aparece "Não foi salvo".
- Números aceitam "6,50", "6.50", "R$ 1.234,56" e "3,99%". Guardados sempre como número.
- Dinheiro: `numeric(12,2)`. Nunca `float`.

## 6. Insumos, receitas, produtos e custeio (fatia 2)

### Unidades

- Todo insumo tem uma **unidade base**: `g` (o que se pesa), `ml` (o que se mede em volume) ou `und` (o que se conta). Ela não muda depois de criada.
- **Conversões automáticas**, só dentro da mesma grandeza: 1 kg = 1000 g; 1 l = 1000 ml.
- **Conversões do insumo** para caixa, pacote, bandeja etc.: o administrador diz quanto cabe ("1 cx = 395 g"). Sem essa regra, a unidade é recusada com uma mensagem que diz onde cadastrar.
- **Massa nunca vira volume** (g ↔ ml é recusado).
- Uma conversão em uso em receita ou embalagem não pode ser apagada. Mudar a quantidade dela recalcula tudo na hora.

### Preço e custo do insumo

- O preço é informado **como se compra**: "R$ 7,90 por cx".
- **Custo por unidade base** = preço ÷ (quantas unidades base tem a unidade de compra), com 6 casas decimais. Ex.: R$ 7,90 ÷ 395 g = R$ 0,020000/g.
- Cada mudança de preço fica no **histórico** (preço, unidade, custo por base, quem, quando). O preço só muda por essa função, nunca direto na tabela.

### Receita (fornada)

- **Custo da receita** = Σ (quantidade do insumo em unidade base × custo por unidade base).
- **Custo por unidade produzida** = custo da receita ÷ rendimento.
- Exemplo do teste de aceite 1 (rende 24): 0,4 kg de farinha a R$ 6,00/kg = R$ 2,40; 1,17 cx de leite condensado (462,15 g a R$ 0,02/g) = R$ 9,243; 6 ovos a R$ 0,52 = R$ 3,12; 550 g de açúcar a R$ 4,80/kg = R$ 2,64. **Total R$ 17,403; R$ 0,725125 por unidade.**
- Se algum insumo está **sem preço**, o custo fica **em branco** e o sistema diz qual falta (nunca mostra um custo menor que o real).

### Produto, variação, embalagem e kit

- O que se vende é a **variação** (sabor, cobertura). Produto sem sabor tem a variação "Única".
- **Custo variável unitário** (produto simples) = custo por unidade da receita + Σ embalagens por unidade vendida.
- Produto sem receita (comprado pronto): custo = só as embalagens.
- **Kit** = Σ (custo de cada produto que o forma × quantidade) + embalagens do kit. Kit não tem receita própria e não pode conter outro kit.
- **MC unitária** = preço − custo variável unitário. **MC %** = MC ÷ preço. **Markup** = preço ÷ custo.
- **MC por forma de pagamento** = MC − preço × taxa %. Ex.: Clássico a R$ 6,50 no cartão de 3,99% → 5,05 − 0,25935 = 4,79065.
- Conferido com a planilha Cakenoura (teste de aceite 2): Clássico 1,45 / 5,05; Avelã 2,32 / 5,18; Piscininha chocolate 2,08 / 5,92; Piscininha Nutella 2,95 / 5,05; Casadinha (kit) 3,77 / 8,23.
- Mudar preço de venda, receita, embalagem ou preço de insumo muda o **custo atual** na hora. Vendas (fatia 4) guardam o custo e a margem **do momento da venda**.

### Permissões do cadastro

- Todos os participantes **veem** custos e margens. Só o administrador cadastra e altera.
- Insumos, receitas, produtos e variações não se apagam (desativa). Itens de receita, embalagens e componentes de kit podem ser removidos pelo administrador (fica na auditoria).
- O tipo do produto (simples/kit) não muda depois de criado.

## 7. Compras, estoque e produção (fatia 3)

### Livro de estoque

- Todo movimento de estoque é uma linha num livro único: compra, uso na produção, produto
  produzido, venda, doação, perda, ajuste de contagem e cancelamento. Ninguém apaga nem
  altera uma linha.
- O saldo de cada insumo e de cada produto pronto é a soma do livro. Uma tabela de saldos é
  mantida pelo banco a cada movimento (ninguém digita saldo) e serve para travar o item
  quando duas pessoas mexem nele ao mesmo tempo. Os testes conferem que saldo = soma do livro.
- Insumo fica na unidade base (g, ml ou und). A tela mostra "2,5 kg" ou "1,2 L" quando passa de 1000.
- O estoque não fica negativo: produção e perda que levariam a negativo são recusadas, com
  a quantidade que falta. (Venda sem produto lançado avisa sem bloquear: fatia 4, D8.)

### Compra

- Cada item: insumo, quantidade, unidade (as que o banco sabe converter) e **quanto custou
  no total**. O total da compra é a soma dos itens.
- O custo atual do insumo passa a ser o da **última compra** (D9): valor ÷ quantidade em
  unidade base. Ex.: 3 cx de leite condensado (395 g cada) por R$ 23,70 → R$ 0,02/g. O
  histórico de custo registra a compra que mudou o preço.
- **Paga pelo caixa**: sai do caixa na hora. **Paga do bolso de um participante**: não mexe
  no caixa; fica "a reembolsar" para aquela pessoa (telas de reembolso na fatia 5).
- Compra **não entra no resultado**. O custo entra quando o produto é vendido (Seção 4.5).
- Cancelar: devolve o estoque e, se foi pelo caixa, o dinheiro. Exige motivo. Se parte do
  insumo já foi usada, o cancelamento é recusado e a orientação é corrigir a contagem.
  Membro cancela a própria compra em até 30 minutos; depois disso, só o administrador (D11).

### Produção

- **Planejada**: só um plano (produto e número de fornadas). Não mexe no estoque. Qualquer
  participante ativo cancela uma planejada.
- **Concluir**, numa única transação: trava os insumos (sempre na mesma ordem, para duas
  produções ao mesmo tempo não se travarem), confere se há tudo, e:
  - se **falta** algum insumo ou embalagem: **nada é gravado** e a tela mostra, para cada um,
    quanto precisa, quanto tem e quanto falta, com os botões "Registrar compra" (já
    preenchida com o que falta) e "Ajustar estoque";
  - se **há tudo**: baixa os insumos da receita × fornadas e as embalagens × unidades boas
    (D10), dá entrada nas unidades boas como produto pronto e registra as perdidas.
- Necessidade de insumo = quantidade na receita (em unidade base) × fornadas + embalagens por
  unidade × unidades boas.
- **Custo de cada unidade boa** = custo variável unitário do momento (receita ÷ rendimento +
  embalagens). Ele fica gravado no movimento; mudar o preço depois não muda o que já foi produzido.
- **Unidade perdida na produção**: custo só da parte da receita (a embalagem dela não foi
  usada). Entra no resultado como perda.
- Ex. testado: receita com 500 g de farinha (R$ 0,006/g), 1 cx de leite condensado (395 g a
  R$ 0,02/g) e 4 ovos (R$ 0,52), rende 10, 1 pote de R$ 0,50 por unidade → custo da unidade
  = (3,00 + 7,90 + 2,08) ÷ 10 + 0,50 = **R$ 1,798**; perdida = **R$ 1,298**.
- Concluir duas vezes (reenvio) não baixa duas vezes.

### Quanto dá para produzir e lista de compras

- **Fornadas possíveis** = para cada insumo da receita (e embalagem, contando o rendimento da
  fornada), saldo ÷ quanto a fornada usa, arredondado para baixo; vale o menor. O insumo
  desse menor valor é o que **limita**.
- **Lista de compras** = (o que as produções planejadas precisam + estoque mínimo) − saldo,
  só quando dá mais que zero. Custo estimado com o último preço de cada insumo.

### Ajuste de contagem e perda

- **Ajuste**: a pessoa conta e informa o total que tem; o banco lança a diferença (+ ou −),
  com o motivo. É correção de registro: **não entra no resultado**.
- **Perda** (estragou, caiu, venceu): baixa o estoque, com o motivo; o custo (atual) entra
  no resultado como perda. Não pode ser maior que o estoque registrado.
- Membro e administrador fazem os dois; o motivo é obrigatório e fica no histórico do item.

### Permissões

- Compras, livro de estoque, saldos, produções e livro de caixa: participantes ativos leem;
  **ninguém grava direto** (nem o administrador). Só pelas funções do banco, que conferem quem
  pode o quê. Usuário não logado não lê nada.

## 8. Vendas, recebimentos, encomendas e doações (fatia 4)

### Registrar uma venda

- Itens: produto (variação), quantidade e preço. O preço vem do cadastro e pode ser mudado
  na hora ("Mais opções"). Um mesmo envio pode ter vários produtos e kits.
- **Subtotal** = Σ (quantidade × preço). **Total** = subtotal − desconto. O desconto é da venda
  inteira e é **rateado** entre os itens pelo valor de cada um (arredondado em centavos; o
  último item fica com a diferença, para a soma bater).
  Ex. testado: 2 × 6,50 + 1 × 12,00 = 25,00, desconto 1,00 → 0,52 no primeiro item e 0,48 no kit.
- Tudo é calculado pelo banco, numa transação: o celular mostra só uma prévia do total.
- **Forma de pagamento** obrigatória (menos na doação). A taxa da forma (%) fica gravada na venda.
- **Paga / Pendente / Parcial**: paga = recebe o total agora; pendente = não recebe nada agora;
  parcial = recebe o valor informado. Pendente ou parcial exige o nome do cliente (para saber
  de quem cobrar).

### Custo e margem congelados

- No momento em que a venda é **reconhecida** (venda e doação: na hora; encomenda: na
  entrega, D7), cada item guarda o custo unitário daquele momento e a margem:
  - **Taxa do item** = valor líquido × taxa da forma (arredondada em centavos).
  - **MC do item** = valor líquido − custo do momento × quantidade − taxa do item.
- Mudar o preço de um insumo depois **não muda** vendas passadas (teste de aceite 3).
- Produto sem custo cadastrado: a venda é registrada, mas a margem fica em branco e a tela avisa.

### Estoque

- Produto simples: sai ele mesmo. **Kit**: saem os produtos que o formam (ex.: casadinha =
  1 clássico + 1 avelã) e as **embalagens próprias do kit** (D10). O kit não tem estoque
  próprio; a tela mostra quantos kits os componentes formam.
- **Falta de produto pronto (D8)**: a venda **não é bloqueada**. O banco avisa o que falta
  ("precisa 7, tem 6") sem gravar nada; se a pessoa confirmar ("Vender mesmo assim"), a venda
  entra, o estoque pode ficar negativo e o aviso fica registrado na venda.
- Duas pessoas vendendo o último item ao mesmo tempo: a segunda espera a primeira terminar e
  recebe o aviso (trava de linha; teste de aceite 15).

### Recebimentos

- Venda ≠ dinheiro. Cada recebimento é um registro próprio: entra no caixa o valor e sai a
  taxa da forma usada (se houver). Uma venda pode ter vários recebimentos, até o total.
- **A receber** = total − recebido (só vendas ativas; doação nunca tem).
- Situação: **paga** (recebido = total), **parcial** (recebeu parte), **pendente** (nada).
- A margem conta desde a venda; o caixa só quando o dinheiro entra.

### Encomenda

- Venda com data de entrega (hoje ou depois). Situações: aguardando produção → pronta → entregue.
- O dinheiro entra no caixa quando é recebido (pode ter sinal). **Estoque e resultado só na
  entrega** (D7): ao marcar entregue, o banco baixa o estoque e congela custo e margem.

### Doação ou brinde

- Total zero, sem forma de pagamento e sem recebimento. Baixa o estoque e o custo entra no
  resultado como margem negativa (ex.: −1,50 para um produto de custo 1,50).

### Cancelar ou corrigir

- Nada é apagado. Cancelar exige motivo e: devolve ao estoque exatamente o que saiu, estorna
  cada recebimento (o dinheiro e a taxa voltam no caixa) e marca a venda como cancelada.
  Cancelar duas vezes não estorna em dobro. A auditoria guarda o antes e o depois.
- Quem cancela: o administrador sempre; quem lançou, em até 30 minutos (D11).
- **Corrigir** = cancelar e "Lançar de novo, já preenchida" (abre a nova venda com os mesmos
  itens, forma, cliente e observação).

### Envio repetido

- Cada formulário tem uma chave única. Duplo toque ou reenvio depois de falha devolvem a
  mesma venda (teste de aceite 14). O mesmo vale para recebimentos.

### Consulta

- Vendas por chips (Hoje, Todas, A receber, Encomendas, Doações, Canceladas), com contagem, e
  filtros por dia, produto, quem vendeu e forma de pagamento. "Dia" é a data em Fortaleza.

## 9. Caixa, despesas, reembolsos, aportes e resultado (fatia 5)

### Duas contas separadas

- **Saldo de caixa** = soma do livro de caixa: só dinheiro que entrou ou saiu
  (recebimentos de vendas, taxas, compras e despesas pagas pelo caixa, reembolsos, aportes,
  ajustes e estornos). Uma conta só (Pix), como decidido.
- **Resultado** = Σ margem das vendas reconhecidas (doações entram com margem negativa)
  − custo das perdas − despesas. Compras, aportes, reembolsos e ajustes **não** entram.
  Conta por dia, na data de Fortaleza (venda: quando foi reconhecida; perda: quando foi
  registrada; despesa: a data informada). O resultado mostrado é o do desafio em andamento.
- Ex. testado: venda de 2 × (5,00 − 1,00) = +8,00; perda de 1 unidade de custo 1,00 = −1,00;
  compra de insumo = 0 no resultado (só baixa o caixa).

### Despesa

- Gasto que não vira estoque (Uber, adesivos…): valor, categoria, descrição e data.
- **Entra no resultado uma vez**, na data dela.
- Pago pelo caixa: sai do caixa na hora. **Do bolso**: não mexe no caixa; fica "a reembolsar"
  para quem pagou.
- Cancelar: o caixa volta (se foi pelo caixa) e sai do resultado. Membro cancela a própria em
  até 30 minutos; depois, só o administrador. Despesa do bolso já reembolsada não pode ser
  cancelada antes de cancelar o reembolso (a dívida ficaria negativa). O mesmo vale para
  compra do bolso.

### Reembolso (três estados, Seção 4.5)

1. Compra ou despesa paga do bolso → reconhecida uma vez e gera "a reembolsar".
2. **Devido** a cada participante = compras e despesas pagas do bolso (ativas) − reembolsos
   pagos (ativos). Aparece no Caixa.
3. **Reembolso pago** (só o administrador): sai do caixa e liquida a dívida, sem mexer no
   resultado de novo. Não pode passar do devido (trava por participante: dois reembolsos ao
   mesmo tempo não passam).

### Aporte

- Dinheiro colocado no caixa por um participante ou pela PJ (só o administrador registra).
  Aumenta o caixa e **não** é receita: não muda o resultado. Cancelar tira do caixa.

### Conferência e ajuste do caixa

- O administrador informa o saldo real da conta (extrato do Pix). O banco lança a diferença
  como ajuste, com o motivo. Mexe no caixa, não no resultado. Reenvio não repete.

## 10. Painel, meta, projeção e cobertura (fatia 6)

### Meta (do desafio em andamento)

- **Realizado** = resultado acumulado do desafio (Seção 9).
- **% alcançado** = realizado ÷ meta × 100 (uma casa decimal). **Falta** = meta − realizado
  (nunca negativo: passou da meta, falta 0).
- **Dias**: total = fim − início + 1; decorridos = dias antes de hoje; **restantes contam hoje**.
- **Ritmo necessário por dia** = falta ÷ dias restantes.
- **Média por dia até agora** = realizado ÷ dias desde o início, contando hoje (as vendas de
  hoje já estão no realizado).
- **Projeção** (rotulada "projeção"): unidades que faltam vender = falta ÷ margem média por
  unidade vendida até agora (pelo mix real; doações fora). Premissas escritas na tela: mesma
  margem média, sem novas despesas nem perdas. É uma conta, não uma promessa.
- Meta de vendas (opcional): vendido (valor líquido, sem doações) ÷ meta de vendas.
- Ex. testado (aceite 13): desafio de 7 dias que começou anteontem, meta 100,00; 3 vendas com
  margem 4,00 cada e despesa de 2,00 → realizado 10,00; 10,0%; falta 90,00; restam 5 dias;
  ritmo 18,00 por dia; média 3,33 por dia (10 ÷ 3); projeção 23 unidades (90 ÷ 4 = 22,5).

### Painel do Início

- Resultado e barra da meta, dias, ritmo, média e projeção; saldo de caixa; a receber;
  pendências (encomendas a entregar, reembolsos devidos, insumos abaixo do mínimo); gráficos
  do desafio dia a dia. Cada número leva à tela com os registros que o formam.
- Gráficos: resultado de cada dia (barras; dia negativo em vermelho) e acumulado contra a
  meta (linha e meta tracejada). Dias futuros ficam em branco, não como zero. Os mesmos
  números aparecem em tabela.

### Cobertura de estoque (Seção 4.4)

- Para quantos dias o estoque de cada produto pronto dá = saldo ÷ demanda por dia.
- Com **2 dias ou mais com venda** no desafio: demanda = unidades que saíram (vendas, doações
  e componentes de kits) ÷ dias com venda.
- Antes disso: a **demanda estimada** que o administrador informar para o desafio
  (Mais → Desafio e meta), sempre rotulada "estimativa". Sem estimativa, fica em branco.

## 11. Exportação (fatia 7)

- Mais → Exportar: escolher o que exportar, período, produto e participante → XLSX ou CSV.
- 14 exportações: vendas, itens das vendas, recebimentos, produtos e preços, receitas,
  insumos e estoque, compras (um item por linha), movimentações de estoque, produção,
  despesas, reembolsos, fluxo de caixa, metas e indicadores, resultado por dia.
- Os dados saem **do Supabase**, lidos com a permissão de quem pediu (não da tela). Sem login
  ou com usuário inativo, nada sai.
- A **primeira coluna é sempre o ID** do registro.
- **XLSX**: números como número, datas como data da planilha (dd/mm/aaaa e dd/mm/aaaa hh:mm,
  no horário de Fortaleza), cabeçalho congelado.
- **CSV**: separado por ";" e com vírgula decimal (o Excel em português abre direto), datas
  como 2026-10-27 e 2026-10-27 14:05 (Fortaleza), UTF-8 com acentos.
- Filtros só onde fazem sentido: período nas listas com data (o dia é o de Fortaleza);
  produto em vendas, itens, estoque e produção; participante em vendas, compras, despesas e
  reembolsos. O período vem preenchido com as datas do desafio.

## 12. Cadastro simplificado e marca (fatia 9, 28/10/2026)

Mudanças pedidas pelo administrador depois de usar o sistema: menos passos, a receita dentro do
produto e poder excluir o que nunca foi usado. Nenhuma conta mudou (custo, estoque, margem e
caixa saem das mesmas tabelas e views).

### Insumo em uma tela
- O insumo nasce com **embalagem e preço**: "pacote de 500 g por R$ 16,00". Por baixo, vira a
  unidade de compra `embalagem` do insumo (1 embalagem = 500 g) e o preço é salvo por ela.
- O custo por grama (ou ml, ou unidade) = preço ÷ quanto vem na embalagem, calculado pelo banco
  sem arredondar antes (R$ 7,90 ÷ 395 g = R$ 0,02/g). A tela mostra a conta antes de salvar.
- Quantidade que já existe em estoque pode ser informada no cadastro: entra como **contagem**
  ("Estoque inicial"), não mexe no caixa. Estoque só muda por compra, produção, venda, perda ou
  contagem; ninguém digita saldo solto.
- Embalagem e preço ficam em branco juntos ou preenchidos juntos. Sem eles, o insumo fica "sem
  preço" e o custo dos produtos que o usam fica em branco (nunca um custo menor que o real).
- Na compra, a unidade já vem como `embalagem` quando o insumo tem uma. Cada compra continua
  atualizando o preço (custo atual = última compra, D9).
- Outras unidades de compra (lata, caixa…) ficam em "Outras unidades de compra" (avançado).

### Receita dentro do sabor
- Não há mais tela de Receitas. Cada **sabor** (variação) de um produto simples tem a receita
  dele, na tela do produto: quantas unidades uma fornada rende e os ingredientes.
- Por baixo continua existindo uma receita ligada ao sabor, com o nome "Produto · Sabor". O nome
  acompanha quando o produto ou o sabor é renomeado.
- **Copiar de outro sabor**: copia ingredientes, rendimento e embalagem. A cópia é independente
  (mudar um sabor não muda o outro). Ao criar um sabor novo já dá para começar com a cópia.
- Kit continua sem receita: o custo vem dos produtos que o formam mais a embalagem própria.
- Nos textos das telas, "variação" virou **sabor** e "MC" virou **sobra** (preço − custo). As
  planilhas exportadas mantêm os nomes técnicos.

### Excluir só o que nunca foi usado
- **Pode excluir** (só o administrador): insumo, sabor e produto **sem** compra, venda, produção,
  receita em uso, embalagem de produto ou kit. Contagens de estoque (estoque inicial, correção
  de contagem) não contam como uso e saem junto, deixando rastro na auditoria.
- **Não pode** quando já tem histórico: aí só se **desativa** ("Em uso" / "À venda"), que tira
  das telas sem apagar o passado. Compra cancelada continua sendo histórico.
- O último sabor de um produto não se exclui sozinho (exclui-se o produto).
- Excluir um sabor leva a receita, os ingredientes e a embalagem dele; excluir um produto leva
  todos os sabores. Tudo fica na Auditoria (quem, quando e o que existia).
- A tela só mostra "Excluir" quando o banco diz que dá; quando não dá, explica o motivo e o que
  fazer. O banco confere de novo na hora de excluir (mesma regra, não só na tela).

### Meta com resultado negativo
- O resultado pode ficar negativo (despesas e perdas maiores que a margem das vendas). O Início
  mostra o valor em vermelho, a barra da meta fica vazia (0%), não mostra porcentagem negativa e
  explica: "o resultado está negativo… a meta só volta a andar quando as vendas cobrirem esse
  valor". "Falta" = meta − resultado (passa da meta).

### Marca e aplicativo
- Identidade visual da logo Choc Bites: creme (fundo), chocolate (ação e texto) e rosa (acento
  só decorativo). Contraste AA conferido; o tema escuro usa chocolate escuro com o rosa como cor
  de ação. A logo aparece na entrada e no topo.
- O site pode ser instalado no celular ("Adicionar à tela inicial") com o ícone da logo, nome
  "Choc Bites", abrindo como aplicativo (manifesto + ícone do iPhone + ícone redondo do Android).
- Menu Mais em grupos: Cadastros, Desafio, Relatórios e ajuda. A lista de passos iniciais
  aparece no Início do administrador enquanto faltar o essencial.
