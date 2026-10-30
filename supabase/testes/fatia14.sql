-- x
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000eaa', 'f14-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F14' where id = '00000000-0000-4000-8000-000000000eaa';
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000eaa"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F14', (now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date + 5,
        100, 200, 'em_andamento', gen_random_uuid());
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F14', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F14', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F14' and i.nome = 'Farinha F14';
insert into public.produtos (nome, tipo) values ('Bolo F14', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F14' and r.nome = 'Massa F14';
insert into public.formas_pagamento (nome) values ('Pix F14');

create temporary table ids_f14 (chave text primary key, id uuid) on commit drop;
grant all on ids_f14 to authenticated;
insert into ids_f14
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F14'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F14'
union all select 'desafio', id from public.desafios where nome = 'Desafio F14';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f14 where chave = p $$;
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
  v_ontem uuid;
  v_hoje uuid;
  v_dia_ontem date := (now() at time zone 'America/Fortaleza')::date - 1;
  v_item jsonb := jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2));
  r record;
begin
  -- Venda de ontem (esquecida): fica no dia de ontem, no faturamento e no resultado de ontem.
  v_ontem := ((public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), null, p_confirmar_estoque => true, p_data => v_dia_ontem)) ->> 'venda_id')::uuid;
  select * into r from public.v_vendas where id = v_ontem;
  assert r.dia = v_dia_ontem, 'F14: a venda fica no dia informado, veio ' || r.dia;
  assert (r.reconhecida_em at time zone 'America/Fortaleza')::date = v_dia_ontem, 'F14: reconhecida no dia informado';
  assert r.criado_em > r.data_hora, 'F14: o registro guarda quando foi lançada de verdade';
  assert (select vendido from public.v_resultado_diario where desafio_id = pg_temp.id('desafio') and dia = v_dia_ontem) = 10,
    'F14: o resultado de ontem tem os 10,00';
  assert pg_temp.realizado() = 10, 'F14: entra no faturamento da meta';

  -- Venda sem data: hoje, como antes.
  v_hoje := ((public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), null, p_confirmar_estoque => true)) ->> 'venda_id')::uuid;
  assert (select dia from public.v_vendas where id = v_hoje) = (now() at time zone 'America/Fortaleza')::date, 'F14: sem data = hoje';
  -- Data de hoje também vale.
  perform public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), null, p_confirmar_estoque => true, p_data => (now() at time zone 'America/Fortaleza')::date);
  assert pg_temp.realizado() = 30, 'F14: três vendas de 10,00';

  -- Doação com data passada.
  perform public.registrar_venda(gen_random_uuid(), 'doacao', v_item, null, 0, p_confirmar_estoque => true, p_data => v_dia_ontem);

  assert pg_temp.erro(format('select public.registrar_venda(gen_random_uuid(), ''venda'', %L, %L, null, p_data => current_date + 2)',
    v_item, pg_temp.id('pix'))) like 'A data da venda não pode ser no futuro%', 'F14: data futura recusada';
  assert pg_temp.erro(format('select public.registrar_venda(gen_random_uuid(), ''venda'', %L, %L, null, p_data => %L)',
    v_item, pg_temp.id('pix'), v_dia_ontem - 3)) like 'A data da venda não pode ser antes do início do desafio%', 'F14: antes do desafio recusada';
  assert pg_temp.erro(format('select public.registrar_venda(gen_random_uuid(), ''encomenda'', %L, %L, 0, p_entrega_prevista => current_date + 1, p_data => %L)',
    v_item, pg_temp.id('pix'), v_dia_ontem)) like 'A data da venda vale para venda e doação%', 'F14: encomenda não usa a data da venda';
end
$$;

reset role;
select 'fatia 14: todos os testes passaram' as resultado;
rollback;
