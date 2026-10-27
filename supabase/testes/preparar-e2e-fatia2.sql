-- Prepara o banco de TESTE para testes-e2e/fatia2.mjs. Não apaga nada.
-- Deixa os dois usuários de teste ativos e com nome (o teste da fatia 2 não refaz o
-- primeiro acesso). Cada rodada usa nomes únicos, então dados antigos não atrapalham.
update public.perfis p
   set nome = case when p.papel = 'administrador' then 'Admin Teste' else 'Membro Teste' end,
       ativo = true
  from auth.users u
 where u.id = p.id and u.email like '%@teste.invalid';
