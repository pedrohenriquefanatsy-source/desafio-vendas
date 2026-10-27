-- Sessão 2: vende o último bolo e segura a transação 2 segundos.
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000c4aa"}';
begin;
select 'sessao 2', public.registrar_venda(gen_random_uuid(), 'venda', jsonb_build_array(jsonb_build_object('variacao_id', (select v.id from public.variacoes v join public.produtos p on p.id=v.produto_id where p.nome='Bolo C4'), 'quantidade', 1)), (select id from public.formas_pagamento where nome='Pix C4'), 8)::text;
select pg_sleep(2);
commit;
