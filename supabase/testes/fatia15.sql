-- Testes da fatia 15: encomenda paga antes fica no dia do pagamento mesmo depois de entregue; produção pelos
-- potinhos prontos; estoque de cada pessoa (pegar, devolver, venda consome o que está com quem vendeu, cancelar devolve).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000faa', 'f15-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-000000000fbb', 'f15-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F15' where id = '00000000-0000-4000-8000-000000000faa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F15' where id = '00000000-0000-4000-8000-000000000fbb';

update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000faa"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F15', (now() at time zone 'America/Fortaleza')::date - 3, (now() at time zone 'America/Fortaleza')::date + 5, 100, 200, 'em_andamento', gen_random_uuid());
insert into public.formas_pagamento (nome) values ('Pix F15');
create temporary table ids_f15 (chave text primary key, id uuid) on commit drop;
grant all on ids_f15 to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f15 where chave = p $$;
create function pg_temp.erro(p text) returns text language plpgsql as $$
begin
  execute p;
  return null;
exception when others then
  return sqlerrm;
end
$$;
create function pg_temp.saldo_insumo(p text) returns numeric language sql as $$
  select coalesce((select saldo from public.saldos_estoque where insumo_id = pg_temp.id(p)), 0)
$$;
create function pg_temp.saldo_var(p text) returns numeric language sql as $$
  select coalesce((select saldo from public.saldos_estoque where variacao_id = pg_temp.id(p)), 0)
$$;

-- Receita fixa por fornada: 500 g de farinha (R$ 0,006/g) + 400 g de chocolate (R$ 0,032/g) = R$ 15,80; rende ~12 potinhos.
do $$
begin
  insert into ids_f15 values ('farinha', public.cadastrar_insumo(gen_random_uuid(), 'Farinha F15', 'ingrediente', 'g', 1000, 6, 5000));
  insert into ids_f15 values ('choc', public.cadastrar_insumo(gen_random_uuid(), 'Chocolate F15', 'ingrediente', 'g', 500, 16, 1000));
  insert into ids_f15 values ('pote', public.cadastrar_insumo(gen_random_uuid(), 'Pote F15', 'embalagem', 'und', 1, 0.5, 100));
  insert into public.produtos (nome, tipo) values ('Bites F15', 'simples');
  insert into public.variacoes (produto_id, nome, preco_venda) select id, 'Tradicional', 10 from public.produtos where nome = 'Bites F15';
  insert into ids_f15 select 'trad', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bites F15';
  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade) values (pg_temp.id('trad'), pg_temp.id('pote'), 1, 'und');
  perform public.cadastrar_receita_variacao(pg_temp.id('trad'), 12, jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 500, 'unidade', 'g'),
    jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 400, 'unidade', 'g')));
end
$$;

create function pg_temp.pessoa(p text) returns numeric language sql as $$
  select coalesce((select saldo from public.v_estoque_pessoas where participante_id = p::uuid and variacao_id = pg_temp.id('trad')), 0)
$$;
create function pg_temp.geral() returns numeric language sql as $$
  select no_estoque from public.v_estoque_produtos where variacao_id = pg_temp.id('trad')
$$;
insert into ids_f15 select 'pix', id from public.formas_pagamento where nome = 'Pix F15';
insert into ids_f15 select 'desafio', id from public.desafios where nome = 'Desafio F15';

-- ── Produção pelos potinhos: 24 prontos com receita de ~12 = 2 fornadas ────
do $$
declare
  v_res jsonb;
begin
  v_res := public.registrar_producao(gen_random_uuid(), pg_temp.id('trad'), null, 24);
  insert into ids_f15 values ('prod', (v_res ->> 'producao_id')::uuid);
  assert (v_res ->> 'fornadas')::numeric = 2, 'F15: 24 potinhos ÷ 12 por fornada = 2 fornadas, veio ' || (v_res ->> 'fornadas');
  assert pg_temp.saldo_insumo('farinha') = 4000 and pg_temp.saldo_insumo('choc') = 200, 'F15: baixou a receita × 2';
  assert pg_temp.saldo_var('trad') = 24 and pg_temp.saldo_insumo('pote') = 76, 'F15: 24 prontos e 24 potes';
  assert (select fornadas_pelo_rendimento from public.producoes where id = pg_temp.id('prod')), 'F15: marcada como fornadas pelo rendimento';

  -- Corrigir para 18: fornadas 1,5 e os ingredientes voltam meia receita.
  perform public.corrigir_producao(pg_temp.id('prod'), 18);
  assert (select fornadas from public.producoes where id = pg_temp.id('prod')) = 1.5, 'F15: corrigido para 18, fornadas = 1,5';
  assert pg_temp.saldo_insumo('farinha') = 4250 and pg_temp.saldo_insumo('choc') = 400, 'F15: ingredientes ajustados (−750 g e −600 g no total)';
  assert pg_temp.saldo_var('trad') = 18 and pg_temp.saldo_insumo('pote') = 82, 'F15: produto e potes ajustados';

  -- Com fornadas informadas continua como antes (sem ajustar ingredientes na correção).
  v_res := public.registrar_producao(gen_random_uuid(), pg_temp.id('trad'), 1, 12);
  assert not (select fornadas_pelo_rendimento from public.producoes where id = (v_res ->> 'producao_id')::uuid), 'F15: fornadas informadas';
  assert pg_temp.erro(format('select public.registrar_producao(%L, %L, null, 0)', gen_random_uuid(), pg_temp.id('trad'))) like 'Informe quantos potinhos%',
    'F15: sem potinhos é recusado';
end
$$;

-- ── Estoque de cada pessoa ──────────────────────────────────────────────────
do $$
declare
  v_venda uuid;
  v_membro text := '00000000-0000-4000-8000-000000000fbb';
  v_admin text := '00000000-0000-4000-8000-000000000faa';
begin
  assert pg_temp.saldo_var('trad') = 30 and pg_temp.geral() = 30, 'F15: 30 prontos, todos no estoque geral';
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 10)));
  assert pg_temp.pessoa(v_admin) = 10 and pg_temp.geral() = 20 and pg_temp.saldo_var('trad') = 30,
    'F15: pegou 10: com a pessoa 10, estoque geral 20, total 30';
  assert pg_temp.erro(format('select public.mover_estoque_pessoa(gen_random_uuid(), ''retirada'', %L)',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 21)))) like 'No estoque geral só tem 20%',
    'F15: não pega mais do que tem no estoque geral';
  -- Admin registra para o membro.
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 5)), v_membro::uuid);
  assert pg_temp.pessoa(v_membro) = 5 and pg_temp.geral() = 15, 'F15: admin registra para o membro';

  -- Venda de 3 pela admin: sai do que está com ela; o estoque geral não muda.
  v_venda := ((public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 3)), pg_temp.id('pix'), null)) ->> 'venda_id')::uuid;
  assert pg_temp.pessoa(v_admin) = 7 and pg_temp.geral() = 15 and pg_temp.saldo_var('trad') = 27, 'F15: venda consome o que está com quem vendeu';
  -- Venda de 9 (mais do que tem com ela): 7 da sacola, 2 do estoque geral.
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 9)), pg_temp.id('pix'), null);
  assert pg_temp.pessoa(v_admin) = 0 and pg_temp.geral() = 13, 'F15: o que passa sai do estoque geral';
  -- Cancelar a venda de 3: volta para a pessoa.
  perform public.cancelar_venda(v_venda, 'teste');
  assert pg_temp.pessoa(v_admin) = 3 and pg_temp.geral() = 13, 'F15: cancelar devolve para a pessoa que vendeu';
  -- Devolver.
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'devolucao',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 3)));
  assert pg_temp.pessoa(v_admin) = 0 and pg_temp.geral() = 16, 'F15: devolveu 3';
  assert pg_temp.erro(format('select public.mover_estoque_pessoa(gen_random_uuid(), ''devolucao'', %L)',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 1)))) like 'Só tem 0%',
    'F15: não devolve mais do que tem';
end
$$;

-- Membro não registra para outra pessoa, mas pega para si.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000fbb"}';
do $$
begin
  assert pg_temp.erro(format('select public.mover_estoque_pessoa(gen_random_uuid(), ''retirada'', %L, %L)',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 1)), '00000000-0000-4000-8000-000000000faa'))
    like 'Só o administrador registra%', 'F15: membro não registra para outra pessoa';
  perform public.mover_estoque_pessoa(gen_random_uuid(), 'retirada',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 2)));
  assert pg_temp.pessoa('00000000-0000-4000-8000-000000000fbb') = 7, 'F15: membro pega para si';
end
$$;

-- ── Encomenda paga antes: entregue depois, fica no dia do pagamento ─────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000faa"}';
do $$
declare
  v_enc uuid;
  v_ontem date := (now() at time zone 'America/Fortaleza')::date - 2;
begin
  v_enc := ((public.registrar_venda(gen_random_uuid(), 'encomenda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 5)), pg_temp.id('pix'), 50,
    p_entrega_prevista => current_date)) ->> 'venda_id')::uuid;
  insert into ids_f15 values ('enc', v_enc);
end
$$;
reset role;
update public.recebimentos set recebido_em = now() - interval '2 days' where venda_id = pg_temp.id('enc');
set local role authenticated;
do $$
declare
  v_dia date := ((now() - interval '2 days') at time zone 'America/Fortaleza')::date;
begin
  assert (select vendido from public.v_resultado_diario where desafio_id = pg_temp.id('desafio') and dia = v_dia) = 50,
    'F15: paga há 2 dias, conta há 2 dias';
  perform public.entregar_encomenda(pg_temp.id('enc'), true);
  assert (select vendido from public.v_resultado_diario where desafio_id = pg_temp.id('desafio') and dia = v_dia) = 50,
    'F15: entregue hoje, continua no dia do pagamento';
  assert (select margem_vendas from public.v_resultado_diario where desafio_id = pg_temp.id('desafio') and dia = v_dia) <> 0,
    'F15: o lucro dela também fica nesse dia';
end
$$;

reset role;
select 'fatia 15: todos os testes passaram' as resultado;
rollback;
