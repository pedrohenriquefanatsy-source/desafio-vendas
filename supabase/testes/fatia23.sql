-- Testes da fatia 23: dinheiro vivo × banco (vendas em dinheiro, compras e despesas pagas em dinheiro, conferência).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000eee', 'f23-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F23' where id = '00000000-0000-4000-8000-000000000eee';
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000eee"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F23', (now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date + 5,
        100, 200, 'em_andamento', gen_random_uuid());
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F23', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F23', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F23' and i.nome = 'Farinha F23';
insert into public.produtos (nome, tipo) values ('Bolo F23', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F23' and r.nome = 'Massa F23';
insert into public.formas_pagamento (nome) values ('Pix F23');
insert into public.formas_pagamento (nome, em_dinheiro) values ('Dinheiro F23', true);

create temporary table ids_f23 (chave text primary key, id uuid) on commit drop;
grant all on ids_f23 to authenticated;
insert into ids_f23
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F23'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F23'
union all select 'desafio', id from public.desafios where nome = 'Desafio F23'
union all select 'din', id from public.formas_pagamento where nome = 'Dinheiro F23';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f23 where chave = p $$;
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

create function pg_temp.vivo() returns numeric language sql as $$ select dinheiro_vivo from public.v_dinheiro_vivo $$;
create function pg_temp.banco() returns numeric language sql as $$ select banco from public.v_dinheiro_vivo $$;
create function pg_temp.total() returns numeric language sql as $$ select saldo from public.v_dinheiro_vivo $$;
insert into public.insumos (nome, tipo, unidade_base) values ('Chocolate F23', 'ingrediente', 'g');
insert into ids_f23 select 'insumo', id from public.insumos where nome = 'Chocolate F23';

do $$
declare
  v_vivo0 numeric := pg_temp.vivo();
  v_banco0 numeric := pg_temp.banco();
  v_total0 numeric := pg_temp.total();
  v_venda uuid;
  v_compra uuid;
  v_desp uuid;
begin
  assert v_vivo0 + v_banco0 = v_total0, 'F23: dinheiro vivo + banco = saldo total';
  -- Venda de 10 em dinheiro e de 20 no Pix.
  v_venda := ((public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2)), pg_temp.id('din'), null, p_confirmar_estoque => true)) ->> 'venda_id')::uuid;
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 4)), pg_temp.id('pix'), null, p_confirmar_estoque => true);
  assert pg_temp.vivo() = v_vivo0 + 10, 'F23: venda em dinheiro entra no dinheiro vivo, veio ' || (pg_temp.vivo() - v_vivo0);
  assert pg_temp.banco() = v_banco0 + 20, 'F23: venda no Pix entra no banco';
  assert pg_temp.total() = v_total0 + 30, 'F23: saldo total sobe 30';

  -- Cancelar a venda em dinheiro tira do dinheiro vivo.
  perform public.cancelar_venda(v_venda, 'teste');
  assert pg_temp.vivo() = v_vivo0, 'F23: cancelar devolve o dinheiro vivo';

  -- Compra de 40 pelo caixa: 25 em dinheiro e 15 no Pix.
  v_compra := public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('insumo'), 'quantidade', 1000, 'unidade', 'g', 'valor', 40)), 'caixa');
  perform public.definir_dinheiro_pago('compra', v_compra, 25);
  assert pg_temp.vivo() = v_vivo0 - 25 and pg_temp.banco() = v_banco0 + 20 - 15 + 0, 'F23: compra com 25 em dinheiro e 15 no banco';
  assert pg_temp.erro(format('select public.definir_dinheiro_pago(''compra'', %L, 41)', v_compra)) like 'O dinheiro vivo não pode passar do total%',
    'F23: dinheiro não pode passar do total da compra';
  perform public.cancelar_compra(v_compra, 'teste');
  assert pg_temp.vivo() = v_vivo0, 'F23: compra cancelada volta o dinheiro vivo';
  -- Compra do bolso não tem dinheiro vivo do caixa.
  v_compra := public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('insumo'), 'quantidade', 1000, 'unidade', 'g', 'valor', 10)), 'participante');
  assert pg_temp.erro(format('select public.definir_dinheiro_pago(''compra'', %L, 5)', v_compra)) like 'Só compra paga pelo caixa%',
    'F23: compra do bolso não tem dinheiro vivo';

  -- Despesa de 18, com 8 em dinheiro.
  v_desp := public.registrar_despesa(gen_random_uuid(), 18, 'Uber', 'Transporte', 'caixa');
  perform public.definir_dinheiro_pago('despesa', v_desp, 8);
  assert pg_temp.vivo() = v_vivo0 - 8, 'F23: despesa com 8 em dinheiro';

  -- Conferência: tem 50 em dinheiro. O total não muda; a diferença vai para o banco.
  perform public.ajustar_dinheiro('00000000-0000-4000-8000-0000000023a1', 50, 'Contei o dinheiro');
  perform public.ajustar_dinheiro('00000000-0000-4000-8000-0000000023a1', 50, 'Contei o dinheiro');
  assert pg_temp.vivo() = 50, 'F23: conferido em 50 (reenvio não duplica), veio ' || pg_temp.vivo();
  assert pg_temp.vivo() + pg_temp.banco() = pg_temp.total(), 'F23: dinheiro vivo + banco continua igual ao total';
  assert pg_temp.erro('select public.ajustar_dinheiro(gen_random_uuid(), -1, ''Erro'')') like 'Informe quanto tem em dinheiro vivo%', 'F23: negativo recusado';
end
$$;

reset role;
select 'fatia 23: todos os testes passaram' as resultado;
rollback;
