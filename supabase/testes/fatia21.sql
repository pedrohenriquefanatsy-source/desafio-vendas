-- Testes da fatia 21: acerto com as vendas registradas uma a uma (cota = o que está com a pessoa − o que sobrou).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000ccc', 'f21-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F21' where id = '00000000-0000-4000-8000-000000000ccc';
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000ccc"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F21', (now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date + 5,
        100, 200, 'em_andamento', gen_random_uuid());
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F21', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F21', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F21' and i.nome = 'Farinha F21';
insert into public.produtos (nome, tipo) values ('Bolo F21', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F21' and r.nome = 'Massa F21';
insert into public.formas_pagamento (nome) values ('Pix F21');

create temporary table ids_f21 (chave text primary key, id uuid) on commit drop;
grant all on ids_f21 to authenticated;
insert into ids_f21
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F21'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F21'
union all select 'desafio', id from public.desafios where nome = 'Desafio F21';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f21 where chave = p $$;
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
  select coalesce((select saldo from public.v_estoque_pessoas where participante_id = '00000000-0000-4000-8000-000000000ccc' and variacao_id = pg_temp.id('bolo')), 0)
$$;
create function pg_temp.cota() returns numeric language sql as $$
  select coalesce((select cota from public.v_acerto_aberto where variacao_id = pg_temp.id('bolo')), 0)
$$;

do $$
declare
  v_chave uuid := '00000000-0000-4000-8000-0000000021a1';
  r jsonb;
begin
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 10)));
  assert pg_temp.erro(format('select public.iniciar_acerto_pessoa(%L)',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 11)))) like 'Você informou 11 de Bolo F21%',
    'F21: não inicia o acerto com sobrou maior do que está com a pessoa';

  -- Sobraram 3: 7 foram vendidos e podem ser registrados um a um.
  perform public.iniciar_acerto_pessoa(jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 3)));
  assert pg_temp.cota() = 7, 'F21: cota de 7, veio ' || pg_temp.cota();
  assert (select vendidos_inicial from public.v_acerto_aberto) = 7, 'F21: 7 vendidos no início';
  assert pg_temp.na_sacola() = 10, 'F21: iniciar o acerto não mexe no estoque da pessoa';
  assert pg_temp.realizado() = 0, 'F21: nem no faturamento';

  -- Duas vendas de verdade (3 e 2 potinhos, uma com desconto e cliente): a cota cai.
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 3)), pg_temp.id('pix'), null,
    p_desconto => 1, p_cliente => 'Maria', p_confirmar_estoque => true);
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2)), pg_temp.id('pix'), null, p_confirmar_estoque => true);
  assert pg_temp.cota() = 2 and pg_temp.na_sacola() = 5, 'F21: cota 2 e 5 na sacola, veio cota ' || pg_temp.cota() || ' sacola ' || pg_temp.na_sacola();
  assert pg_temp.realizado() = 24, 'F21: faturamento 14 + 10 = 24, veio ' || pg_temp.realizado();

  -- Fechar: os 2 que faltam viram a venda única do acerto (10,00); o que sobrou (3) volta ao estoque geral.
  r := public.fechar_acerto_pessoa(v_chave, pg_temp.id('pix'), true);
  assert (r ->> 'unidades')::numeric = 2 and (r ->> 'devolvido')::boolean, 'F21: fechou com 2 sem registro e devolveu o resto';
  assert pg_temp.realizado() = 34 and pg_temp.na_sacola() = 0, 'F21: faturamento 34 e sacola vazia, veio ' || pg_temp.realizado();
  assert not exists (select 1 from public.acertos_abertos), 'F21: o acerto deixa de existir';
  r := public.fechar_acerto_pessoa(v_chave, pg_temp.id('pix'), true);
  assert (r ->> 'repetida')::boolean and pg_temp.realizado() = 34, 'F21: reenvio do fechamento não duplica';

  -- Cancelar o acerto: nada vende nem devolve.
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 4)));
  perform public.iniciar_acerto_pessoa(jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 1)));
  assert pg_temp.cota() = 3, 'F21: nova cota de 3';
  perform public.cancelar_acerto_pessoa();
  assert pg_temp.cota() = 0 and pg_temp.na_sacola() = 4 and pg_temp.realizado() = 34, 'F21: cancelar não vende nem devolve';

  -- Tudo registrado um a um: fechar não cria venda.
  perform public.iniciar_acerto_pessoa(jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'sobrou', 1)));
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 3)), pg_temp.id('pix'), null, p_confirmar_estoque => true);
  assert pg_temp.cota() = 0, 'F21: cota zerada';
  r := public.fechar_acerto_pessoa(gen_random_uuid(), null, false);
  assert (r ->> 'unidades')::numeric = 0 and pg_temp.realizado() = 49 and pg_temp.na_sacola() = 1, 'F21: sem sobra de cota não cria venda; 1 fica na sacola';
end
$$;

reset role;
select 'fatia 21: todos os testes passaram' as resultado;
rollback;
