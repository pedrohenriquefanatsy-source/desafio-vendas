-- Prepara o banco de TESTE para o teste de tela da fatia 1 (testes-e2e/fatia1.mjs).
-- Não apaga nada: encerra desafios antigos, desativa formas de teste antigas e volta
-- os dois usuários de teste (@teste.invalid) ao estado de "recém-criados".
update public.desafios set situacao = 'encerrado' where situacao <> 'encerrado';
update public.formas_pagamento set ativa = false where nome like 'Cartão TESTE %' and ativa;
update public.perfis p
   set nome = null, ativo = (p.papel = 'administrador')
  from auth.users u
 where u.id = p.id and u.email like '%@teste.invalid';
