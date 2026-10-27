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

## 7. Cálculos das próximas fatias (aprovados no plano, ainda não implementados)

Detalhados em `docs/plano.md`, Seção 2.7. Resumo:

- MC do item vendido = valor líquido − custo do momento × quantidade − taxa rateada.
- Resultado = Σ MC das vendas reconhecidas − custo de doações e perdas − despesas.
- Saldo de caixa = soma do livro de caixa (só dinheiro que entrou ou saiu).
- Ritmo necessário por dia = (meta − realizado) ÷ dias restantes (contando hoje).
