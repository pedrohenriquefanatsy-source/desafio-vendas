# Projeto: Sistema de Gestão do Desafio de Vendas

- A especificação completa está em `docs/especificacao.md`. Leia-a por inteiro no início de cada sessão e siga-a.
- Materiais de referência ficam em `docs/referencias/`.
- Respeite os checkpoints da especificação: pare e espere aprovação ao fim do diagnóstico e ao fim do plano.
- Responda em português, em linguagem simples. O usuário não é desenvolvedor.
- Diagnóstico, plano, regras de negócio e testes ficam registrados em `docs/` (diagnostico.md, plano.md, regras-de-negocio.md, testes.md).

## Situação

- Checkpoint 1 (diagnóstico) e Checkpoint 2 (plano) **aprovados** em 27/10/2026. Decisão D2 aprovada.
- D1 aprovada: projeto de teste `dfzawglgkgconblqrmwf` (limpo em 27/10/2026). Ver `supabase/README.md`.
- Supabase principal: `appgestãogeladinho` (`iebzbiccuwrchgdsojgn`, sa-east-1).
- Implementação segue as fatias da Seção 4 de `docs/plano.md`.
- Fatia 9 (28/10/2026, pedido do administrador depois do uso real): cadastro simplificado (insumo com embalagem e preço, receita dentro do sabor, excluir só o que nunca foi usado) e marca Choc Bites. Ver `docs/regras-de-negocio.md`, seção 12.
- Fatia 10 (28/10/2026, pedido do administrador): compra sem trocar unidade (embalagem já cadastrada), cliente, bairro e "cliente desconhecido" na venda com tela Clientes e bairros, receita montada de uma vez (ingredientes e, no fim, rendimento). Ver `docs/regras-de-negocio.md`, seção 13.
- Fatia 11 (29/10/2026, pedido do administrador): custeio por peso para cubos com cobertura de chocolate (pesar cubos e peso final, chocolate gasto pela diferença, gramagem do potinho, custo por grama da última fornada pesada). Ver `docs/regras-de-negocio.md`, seção 14.
- Fatia 12 (30/10/2026, pedido do administrador): meta pelo faturamento (lucro só informativo), encomenda com pagamento adiantado e "receber o restante" na entrega, título da venda "vendedor - cliente · horário", receita fixa por fornada, produção simples (fornadas + quantos renderam, não trava por falta de insumo, corrigir quanto rendeu), contagem do dia e simulação de produção. As pesagens da fatia 11 saíram da tela. Ver `docs/regras-de-negocio.md`, seção 15.
