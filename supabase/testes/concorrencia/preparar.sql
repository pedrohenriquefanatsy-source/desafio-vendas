-- Teste de aceite 15, passo 1 (só no Postgres local: grava dados de verdade).
-- Cria 1 bolo em estoque. Depois rode sessao-1.sql e sessao-2.sql ao mesmo tempo.
insert into auth.users (id, email, aud, role) values ('00000000-0000-4000-8000-00000000c4aa', 'conc4@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Conc4' where id = '00000000-0000-4000-8000-00000000c4aa';
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c4aa"}';
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha C4', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa C4', 1);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade) select r.id, i.id, 100, 'g' from public.receitas r, public.insumos i where r.nome='Massa C4' and i.nome='Farinha C4';
insert into public.produtos (nome, tipo) values ('Bolo C4', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id) select p.id, 8, r.id from public.produtos p, public.receitas r where p.nome='Bolo C4' and r.nome='Massa C4';
insert into public.formas_pagamento (nome) values ('Pix C4');
select public.registrar_compra(gen_random_uuid(), jsonb_build_array(jsonb_build_object('insumo_id',(select id from public.insumos where nome='Farinha C4'),'quantidade',100,'unidade','g','valor',1)), 'caixa');
select public.concluir_producao(public.planejar_producao(gen_random_uuid(), (select v.id from public.variacoes v join public.produtos p on p.id=v.produto_id where p.nome='Bolo C4'), 1), 1, 0);
select 'estoque do bolo: ' || estoque from public.v_produtos_venda where produto = 'Bolo C4';
