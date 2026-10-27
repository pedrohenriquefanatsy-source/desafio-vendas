-- Testes da fatia 6 (painel da meta, projeção, cobertura de estoque).
-- Inclui o teste de aceite 13 (meta conferida à mão).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000006aa', 'f6-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000006bb', 'f6-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F6' where id = '00000000-0000-4000-8000-0000000006aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F6' where id = '00000000-0000-4000-8000-0000000006bb';
-- Só um desafio em andamento por vez: encerra os que houver (desfeito no fim).
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000006aa"}';

-- Desafio de 7 dias que começou anteontem: decorridos 2, restantes 5 (contando hoje).
-- Meta de resultado 100,00; meta de vendas 200,00.
insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F6', (now() at time zone 'America/Fortaleza')::date - 2, (now() at time zone 'America/Fortaleza')::date + 4,
        100, 200, 'em_andamento', gen_random_uuid());

-- Produto de custo 1,00 e preço 5,00, com 10 prontos.
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F6', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F6', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F6' and i.nome = 'Farinha F6';
insert into public.produtos (nome, tipo) values ('Bolo F6', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F6' and r.nome = 'Massa F6';
insert into public.formas_pagamento (nome) values ('Pix F6');

create temporary table ids_f6 (chave text primary key, id uuid) on commit drop;
grant all on ids_f6 to authenticated;
insert into ids_f6
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F6'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F6'
union all select 'desafio', id from public.desafios where nome = 'Desafio F6'
union all select 'farinha', id from public.insumos where nome = 'Farinha F6';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f6 where chave = p $$;

-- ── Teste de aceite 13: meta ────────────────────────────────────────────────
do $$
declare
  m record;
  v_venda uuid;
begin
  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 1, 'unidade', 'kg', 'valor', 10)), 'caixa');
  perform public.concluir_producao(public.planejar_producao(gen_random_uuid(), pg_temp.id('bolo'), 1), 10, 0);

  select * into m from public.v_painel_meta where desafio_id = pg_temp.id('desafio');
  assert m.realizado = 0 and m.falta = 100 and m.percentual = 0 and m.mc_media_unidade is null and m.unidades_para_meta is null,
    'M0: sem vendas: realizado 0, falta 100, sem projeção';
  assert m.dias_total = 7 and m.dias_decorridos = 2 and m.dias_restantes = 5, 'M0: 7 dias; 2 passaram; 5 restam (com hoje)';
  assert m.ritmo_necessario = 20, 'M0: ritmo necessário = 100 ÷ 5 = 20,00';

  -- 3 bolos (MC 3 × 4,00 = 12,00) e despesa de 2,00 → realizado 10,00.
  v_venda := ((public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 3)), pg_temp.id('pix'), null)) ->> 'venda_id')::uuid;
  perform public.registrar_despesa(gen_random_uuid(), 2, 'Sacolas', 'Material', 'caixa');
  insert into ids_f6 values ('venda', v_venda);

  select * into m from public.v_painel_meta where desafio_id = pg_temp.id('desafio');
  assert m.realizado = 10, 'Aceite 13: realizado = 12,00 − 2,00 = 10,00, veio ' || m.realizado;
  assert m.percentual = 10.0, 'Aceite 13: 10 ÷ 100 = 10,0%';
  assert m.falta = 90, 'Aceite 13: faltam 90,00';
  assert m.ritmo_necessario = 18, 'Aceite 13: ritmo necessário = 90 ÷ 5 dias = 18,00 por dia';
  assert m.media_por_dia = 3.33, 'Aceite 13: média até agora = 10 ÷ 3 dias (contando hoje) = 3,33';
  assert m.mc_media_unidade = 4, 'Aceite 13: MC média por unidade vendida = 12 ÷ 3 = 4,00';
  assert m.unidades_para_meta = 23, 'Aceite 13: projeção = 90 ÷ 4,00 = 22,5 → 23 unidades';
  assert m.vendido = 15 and m.percentual_vendas = 7.5, 'Aceite 13: meta de vendas: 15 de 200 = 7,5%';
  assert m.margem = 12 and m.despesas = 2 and m.perdas = 0, 'Aceite 13: partes do resultado';

  -- Passar da meta: falta e ritmo zeram, percentual passa de 100.
  update public.desafios set meta_resultado = 8 where id = pg_temp.id('desafio');
  select * into m from public.v_painel_meta where desafio_id = pg_temp.id('desafio');
  assert m.falta = 0 and m.ritmo_necessario = 0 and m.percentual = 125.0 and m.unidades_para_meta = 0, 'M1: meta batida: falta 0, 125%';
  update public.desafios set meta_resultado = 100 where id = pg_temp.id('desafio');
end
$$;

-- ── Cobertura de estoque ───────────────────────────────────────────────────
do $$
declare
  c record;
begin
  -- 1 dia com venda e sem demanda estimada: sem cobertura.
  select * into c from public.v_cobertura_estoque where variacao_id = pg_temp.id('bolo');
  assert c.saldo = 7 and c.dias_com_venda = 1 and c.fonte is null and c.dias_cobertura is null, 'C1: menos de 2 dias, sem estimativa: em branco';
  -- Com a demanda estimada pelo administrador: 7 ÷ 2 por dia = 3,5 dias, rotulada "estimativa".
  insert into public.demanda_estimada (desafio_id, variacao_id, unidades_por_dia) values (pg_temp.id('desafio'), pg_temp.id('bolo'), 2);
  select * into c from public.v_cobertura_estoque where variacao_id = pg_temp.id('bolo');
  assert c.fonte = 'estimativa' and c.demanda_dia = 2 and c.dias_cobertura = 3.5, 'C2: estimativa: 3,5 dias';
end
$$;
-- Membro não define demanda estimada.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000006bb"}';
do $$
begin
  insert into public.demanda_estimada (desafio_id, variacao_id, unidades_por_dia) values (pg_temp.id('desafio'), pg_temp.id('farinha'), 1);
  raise exception 'C3 falhou: membro definiu demanda';
exception when insufficient_privilege then null;
end
$$;
-- Um segundo dia com venda: a venda de hoje passa para ontem (só no teste).
reset role;
update public.movimentos_estoque set criado_em = criado_em - interval '1 day' where origem_id = pg_temp.id('venda');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000006aa"}';
do $$
declare
  c record;
begin
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 1)), pg_temp.id('pix'), null);
  -- 2 dias com venda, 4 unidades → média 2 por dia; saldo 6 → 3 dias, pela média (não mais estimativa).
  select * into c from public.v_cobertura_estoque where variacao_id = pg_temp.id('bolo');
  assert c.dias_com_venda = 2 and c.fonte = 'media' and c.demanda_dia = 2 and c.dias_cobertura = 3, 'C4: média real: 6 ÷ 2 = 3 dias, veio ' || row_to_json(c)::text;
end
$$;

reset role;
set local role anon;
do $$
begin
  perform 1 from public.v_painel_meta limit 1;
  raise exception 'P1 falhou: anon leu o painel';
exception when insufficient_privilege then null;
end
$$;

reset role;
select 'fatia 6: todos os testes passaram' as resultado;
rollback;
