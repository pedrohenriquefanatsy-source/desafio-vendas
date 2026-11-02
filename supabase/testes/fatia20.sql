-- Testes da fatia 20: acerto da pessoa (pegou − sobrou = vendido), potinhos vendidos e dias que duram os insumos.
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000bbb', 'f20-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F20' where id = '00000000-0000-4000-8000-000000000bbb';
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000bbb"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F20', (now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date + 5,
        100, 200, 'em_andamento', gen_random_uuid());
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F20', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F20', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F20' and i.nome = 'Farinha F20';
insert into public.produtos (nome, tipo) values ('Bolo F20', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F20' and r.nome = 'Massa F20';
insert into public.formas_pagamento (nome) values ('Pix F20');

create temporary table ids_f20 (chave text primary key, id uuid) on commit drop;
grant all on ids_f20 to authenticated;
insert into ids_f20
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F20'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F20'
union all select 'desafio', id from public.desafios where nome = 'Desafio F20';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f20 where chave = p $$;
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

create function pg_temp.na_sacola() returns numeric language sql as $$
  select coalesce((select saldo from public.v_estoque_pessoas where participante_id = '00000000-0000-4000-8000-000000000bbb' and variacao_id = pg_temp.id('bolo')), 0)
$$;
create function pg_temp.unidades_dia() returns numeric language sql as $$
  select coalesce(sum(unidades), 0) from public.v_unidades_vendidas where desafio_id = pg_temp.id('desafio')
$$;

-- Kit com 2 bolos para conferir que os potinhos contam pelos componentes.
insert into public.produtos (nome, tipo) values ('Kit F20', 'kit');
insert into public.variacoes (produto_id, preco_venda) select id, 9 from public.produtos where nome = 'Kit F20';
insert into ids_f20 select 'kit', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Kit F20';
insert into public.kit_componentes (kit_variacao_id, componente_variacao_id, quantidade) values (pg_temp.id('kit'), pg_temp.id('bolo'), 2);

do $$
declare
  v_chave uuid := '00000000-0000-4000-8000-0000000020a1';
  r jsonb;
begin
  -- Pegou 10; vendeu 2 e registrou.
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 10)));
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2)), pg_temp.id('pix'), null, p_confirmar_estoque => true);
  assert pg_temp.na_sacola() = 8 and pg_temp.realizado() = 10, 'F20: 8 na sacola e 10,00 de faturamento';
  assert pg_temp.unidades_dia() = 2, 'F20: 2 potinhos vendidos';

  -- Acerto: sobraram 3, então 5 foram vendidos sem registro (25,00).
  r := public.acertar_estoque_pessoa(v_chave, jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 3)), pg_temp.id('pix'));
  assert (r ->> 'unidades')::numeric = 5 and r ->> 'numero' is not null, 'F20: o acerto achou 5 vendidos';
  assert pg_temp.na_sacola() = 3, 'F20: ficam 3 na sacola';
  assert pg_temp.realizado() = 35, 'F20: faturamento 10 + 25 = 35, veio ' || pg_temp.realizado();
  assert pg_temp.unidades_dia() = 7, 'F20: 7 potinhos vendidos no total';
  assert (select observacao = 'Acerto: vendas sem registro' and cliente_desconhecido and recebido = 25 from public.vendas where chave_idempotencia = md5(v_chave::text || ':venda')::uuid),
    'F20: a venda do acerto é paga por inteiro, cliente desconhecido, com a observação';

  -- Reenvio da mesma chave: não duplica.
  r := public.acertar_estoque_pessoa(v_chave, jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 3)), pg_temp.id('pix'));
  assert (r ->> 'repetida')::boolean and pg_temp.realizado() = 35, 'F20: reenvio não duplica a venda';

  -- Mais do que tem: recusado.
  assert pg_temp.erro(format('select public.acertar_estoque_pessoa(gen_random_uuid(), %L, %L)',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 9)), pg_temp.id('pix'))) like 'Você informou 9 de Bolo F20%',
    'F20: não aceita sobrou maior do que está com a pessoa';
  -- Vendas sem forma de pagamento: recusado.
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 4)));
  assert pg_temp.erro(format('select public.acertar_estoque_pessoa(gen_random_uuid(), %L)',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 0)))) like 'Escolha a forma de pagamento%',
    'F20: venda sem forma de pagamento é recusada';

  -- Nada vendido e devolvendo o que sobrou: volta para o estoque geral.
  r := public.acertar_estoque_pessoa(gen_random_uuid(), jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 7)), null, true);
  assert (r ->> 'devolvido')::boolean and pg_temp.na_sacola() = 0, 'F20: devolveu o que sobrou';

  -- Kit: 1 kit = 2 potinhos.
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('kit'), 'quantidade', 1)), pg_temp.id('pix'), null, p_confirmar_estoque => true);
  assert pg_temp.unidades_dia() = 9, 'F20: 1 kit soma 2 potinhos (7 + 2), veio ' || pg_temp.unidades_dia();
end
$$;

-- Dias que duram os insumos: consumo de 400 g em 2 dias do desafio = 200 g por dia; com 1.000 g, 5 dias.
reset role;
insert into public.movimentos_estoque (desafio_id, insumo_id, tipo, quantidade_base, origem_tipo)
select pg_temp.id('desafio'), i.id, 'compra', 1400, 'compra' from public.insumos i where i.nome = 'Farinha F20';
insert into public.movimentos_estoque (desafio_id, insumo_id, tipo, quantidade_base, origem_tipo)
select pg_temp.id('desafio'), i.id, 'consumo_producao', -400, 'producao' from public.insumos i where i.nome = 'Farinha F20';
set local role authenticated;
do $$
declare
  c record;
begin
  select * into c from public.v_cobertura_insumos where nome = 'Farinha F20';
  assert c.saldo = 1000 and c.consumo_dia = 200 and c.dias_cobertura = 5, 'F20: 1.000 g com 200 g por dia duram 5 dias, veio ' || coalesce(c.dias_cobertura::text, 'nulo');
end
$$;

reset role;
select 'fatia 20: todos os testes passaram' as resultado;
rollback;
