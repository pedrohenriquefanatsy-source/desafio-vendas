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
- Tabelas auditadas até agora: `perfis`, `desafios`, `formas_pagamento`. As próximas fatias acrescentam vendas, recebimentos, despesas, compras, preços, receitas, estoque e produção.

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

## 6. Cálculos das próximas fatias (aprovados no plano, ainda não implementados)

Detalhados em `docs/plano.md`, Seção 2.7. Resumo:

- Custo da receita = Σ (quantidade base do insumo × custo atual por unidade base).
- Custo variável unitário = custo da receita ÷ rendimento + embalagens por unidade (kit: soma dos componentes).
- MC do item vendido = valor líquido − custo do momento × quantidade − taxa rateada.
- Resultado = Σ MC das vendas reconhecidas − custo de doações e perdas − despesas.
- Saldo de caixa = soma do livro de caixa (só dinheiro que entrou ou saiu).
- Ritmo necessário por dia = (meta − realizado) ÷ dias restantes (contando hoje).
