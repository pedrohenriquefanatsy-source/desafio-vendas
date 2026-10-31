-- x
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000aaa', 'f18-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F18' where id = '00000000-0000-4000-8000-000000000aaa';
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000aaa"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F18', (now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date + 5,
        100, 200, 'em_andamento', gen_random_uuid());
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F18', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F18', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F18' and i.nome = 'Farinha F18';
insert into public.produtos (nome, tipo) values ('Bolo F18', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F18' and r.nome = 'Massa F18';
insert into public.formas_pagamento (nome) values ('Pix F18');

create temporary table ids_f18 (chave text primary key, id uuid) on commit drop;
grant all on ids_f18 to authenticated;
insert into ids_f18
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F18'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F18'
union all select 'desafio', id from public.desafios where nome = 'Desafio F18';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f18 where chave = p $$;
create function pg_temp.realizado() returns numeric language sql as $$
  select realizado from public.v_painel_meta where desafio_id = pg_temp.id('desafio')
$$;

create function pg_temp.erro(p text) returns text language plpgsql as $$
begin
  execute p;
  return null;
exception when others then
  return sqlerrm;
end
$$;

do $$
declare
  v_venda uuid;
  v_caixa numeric := (select saldo from public.v_saldo_caixa);
  v_lucro numeric;
begin
  v_venda := ((public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2)), pg_temp.id('pix'), null,
    p_confirmar_estoque => true)) ->> 'venda_id')::uuid;
  assert pg_temp.realizado() = 10, 'F18: venda de 10,00';
  v_lucro := (select lucro_estimado from public.v_painel_meta where desafio_id = pg_temp.id('desafio'));

  perform public.registrar_valor_a_mais('00000000-0000-4000-8000-0000000018a1', v_venda, 2.5, pg_temp.id('pix'));
  perform public.registrar_valor_a_mais('00000000-0000-4000-8000-0000000018a1', v_venda, 2.5, pg_temp.id('pix'));
  assert (select saldo from public.v_saldo_caixa) = v_caixa + 12.5, 'F18: caixa = 10,00 da venda + 2,50 a mais (reenvio não duplica)';
  assert pg_temp.realizado() = 12.5, 'F18: faturamento 12,50, veio ' || pg_temp.realizado();
  assert (select lucro_estimado from public.v_painel_meta where desafio_id = pg_temp.id('desafio')) = v_lucro + 2.5, 'F18: lucro sobe 2,50';
  assert (select valor_a_mais from public.v_vendas where id = v_venda) = 2.5 and (select total from public.v_vendas where id = v_venda) = 10,
    'F18: a venda mostra 2,50 a mais e o total dos produtos continua 10,00';

  assert pg_temp.erro(format('select public.registrar_valor_a_mais(gen_random_uuid(), %L, 0, %L)', v_venda, pg_temp.id('pix'))) like 'Informe o valor a mais%',
    'F18: valor zero recusado';

  perform public.cancelar_venda(v_venda, 'teste');
  assert (select saldo from public.v_saldo_caixa) = v_caixa, 'F18: cancelar devolve a venda e o valor a mais no caixa';
  assert pg_temp.realizado() = 0, 'F18: cancelada sai do faturamento';
  assert pg_temp.erro(format('select public.registrar_valor_a_mais(gen_random_uuid(), %L, 1, %L)', v_venda, pg_temp.id('pix'))) like 'Esta venda foi cancelada%',
    'F18: não registra valor a mais em venda cancelada';
end
$$;

reset role;
select 'fatia 18: todos os testes passaram' as resultado;
rollback;
