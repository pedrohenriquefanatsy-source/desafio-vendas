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

## 8. Cálculos das próximas fatias (aprovados no plano, ainda não implementados)

Detalhados em `docs/plano.md`, Seção 2.7. Resumo:

- MC do item vendido = valor líquido − custo do momento × quantidade − taxa rateada.
- Resultado = Σ MC das vendas reconhecidas − custo de doações e perdas − despesas.
- Saldo de caixa = soma do livro de caixa (só dinheiro que entrou ou saiu).
- Ritmo necessário por dia = (meta − realizado) ÷ dias restantes (contando hoje).
