-- Testes da fatia 12: faturamento na meta (ver também fatia6), produção em um passo (fornadas + quantos renderam),
-- custo pelo rendimento real, aviso de falta sem travar, corrigir quanto rendeu, contagem do dia e simulação.
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000caa', 'f12-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-000000000cbb', 'f12-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F12' where id = '00000000-0000-4000-8000-000000000caa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F12' where id = '00000000-0000-4000-8000-000000000cbb';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000caa"}';

create temporary table ids_f12 (chave text primary key, id uuid) on commit drop;
grant all on ids_f12 to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f12 where chave = p $$;
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
  insert into ids_f12 values ('farinha', public.cadastrar_insumo(gen_random_uuid(), 'Farinha F12', 'ingrediente', 'g', 1000, 6, 5000));
  insert into ids_f12 values ('choc', public.cadastrar_insumo(gen_random_uuid(), 'Chocolate F12', 'ingrediente', 'g', 500, 16, 1000));
  insert into ids_f12 values ('pote', public.cadastrar_insumo(gen_random_uuid(), 'Pote F12', 'embalagem', 'und', 1, 0.5, 100));
  insert into public.produtos (nome, tipo) values ('Bites F12', 'simples');
  insert into public.variacoes (produto_id, nome, preco_venda) select id, 'Tradicional', 10 from public.produtos where nome = 'Bites F12';
  insert into ids_f12 select 'trad', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bites F12';
  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade) values (pg_temp.id('trad'), pg_temp.id('pote'), 1, 'und');
  perform public.cadastrar_receita_variacao(pg_temp.id('trad'), 12, jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 500, 'unidade', 'g'),
    jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 400, 'unidade', 'g')));
end
$$;

-- ── Antes de produzir: custo pelo rendimento esperado ───────────────────────
do $$
begin
  assert (select abs(custo_unitario - (15.8 / 12 + 0.5)) < 0.0001 from public.v_custo_variacoes where variacao_id = pg_temp.id('trad')),
    'F12: antes de produzir, o custo usa o rendimento esperado da receita (15,80 ÷ 12 + pote)';
  assert (select origem_rendimento = 'receita' and rendimento_efetivo = 12 from public.v_custo_receitas cr join public.variacoes v on v.receita_id = cr.receita_id
           where v.id = pg_temp.id('trad')), 'F12: origem do rendimento = receita';
end
$$;

-- ── Registrar produção em um passo ──────────────────────────────────────────
do $$
declare
  v_res jsonb;
  v_chave uuid := gen_random_uuid();
begin
  assert pg_temp.erro(format('select public.registrar_producao(%L, %L, 0, 10)', gen_random_uuid(), pg_temp.id('trad'))) like 'Informe quantas fornadas%',
    'F12: sem fornadas é recusado';
  assert pg_temp.erro(format('select public.registrar_producao(%L, %L, 2, 0, 0)', gen_random_uuid(), pg_temp.id('trad'))) like 'Informe quantos ficaram prontos%',
    'F12: sem nenhum potinho é recusado';
  assert pg_temp.saldo_insumo('farinha') = 5000, 'F12: recusas não mexem no estoque';

  v_res := public.registrar_producao(v_chave, pg_temp.id('trad'), 2, 23);
  insert into ids_f12 values ('prod', (v_res ->> 'producao_id')::uuid);
  assert (v_res ->> 'ok')::boolean and jsonb_array_length(v_res -> 'faltas') = 0, 'F12: 2 fornadas, 23 potinhos: registrado sem faltas';
  assert pg_temp.saldo_insumo('farinha') = 4000 and pg_temp.saldo_insumo('choc') = 200, 'F12: baixou a receita × 2 fornadas (farinha −1000, chocolate −800)';
  assert pg_temp.saldo_insumo('pote') = 77 and pg_temp.saldo_var('trad') = 23, 'F12: baixou 23 potes e entraram 23 potinhos prontos';
  assert (select abs(custo_unitario - (31.6 / 23 + 0.5)) < 0.00001 from public.movimentos_estoque
           where origem_id = pg_temp.id('prod') and tipo = 'entrada_producao' and justificativa is null),
    'F12: custo do potinho = custo da produção ÷ quantos renderam + pote (1,8739)';
  assert (select unidades_produzidas = 23 and fornadas = 2 and custo_massa = 31.6 from public.producoes where id = pg_temp.id('prod')), 'F12: a produção guarda fornadas, boas e custo';

  assert (public.registrar_producao(v_chave, pg_temp.id('trad'), 2, 23) ->> 'ja_concluida')::boolean and pg_temp.saldo_var('trad') = 23,
    'F12: reenvio com a mesma chave não duplica a produção';
end
$$;

-- ── O custo passa a usar o que realmente rende ──────────────────────────────
do $$
begin
  assert (select origem_rendimento = 'ultima_producao' and rendimento_efetivo = 11.5 from public.v_custo_receitas cr join public.variacoes v on v.receita_id = cr.receita_id
           where v.id = pg_temp.id('trad')), 'F12: a última produção rendeu 23 em 2 fornadas = 11,5 por fornada';
  assert (select abs(custo_unitario - (15.8 / 11.5 + 0.5)) < 0.0001 from public.v_custo_variacoes where variacao_id = pg_temp.id('trad')),
    'F12: o custo do produto passa a ser 15,80 ÷ 11,5 + pote';
end
$$;

-- ── Faltou insumo: avisa, registra mesmo assim (o teste desfaz o que fez) ───
do $$
declare
  v_res jsonb;
begin
  begin
    v_res := public.registrar_producao(gen_random_uuid(), pg_temp.id('trad'), 3, 30);
    assert (v_res ->> 'ok')::boolean, 'F12: faltando chocolate, registra mesmo assim';
    assert (select (f ->> 'falta')::numeric from jsonb_array_elements(v_res -> 'faltas') f where f ->> 'insumo_id' = pg_temp.id('choc')::text) = 1000,
      'F12: avisa que faltavam 1000 g de chocolate (precisa 1200, tinha 200)';
    assert pg_temp.saldo_insumo('choc') = -1000, 'F12: o saldo do chocolate ficou negativo, à vista na contagem';
    raise exception 'DESFAZER_TESTE';
  exception when others then
    if sqlerrm <> 'DESFAZER_TESTE' then raise; end if;
  end;
  assert pg_temp.saldo_insumo('choc') = 200, 'F12: o teste desfez o que fez';
end
$$;

-- ── Corrigir quanto rendeu ──────────────────────────────────────────────────
do $$
begin
  perform public.corrigir_producao(pg_temp.id('prod'), 24);
  assert pg_temp.saldo_var('trad') = 24 and pg_temp.saldo_insumo('pote') = 76, 'F12: corrigir para 24: um potinho a mais e um pote a menos';
  assert (select unidades_produzidas = 24 from public.producoes where id = pg_temp.id('prod')), 'F12: a produção guarda 24';
  assert (select rendimento_efetivo = 12 from public.v_custo_receitas cr join public.variacoes v on v.receita_id = cr.receita_id where v.id = pg_temp.id('trad')),
    'F12: o rendimento por fornada passa a 12 (24 ÷ 2)';
  perform public.corrigir_producao(pg_temp.id('prod'), 24);
  assert pg_temp.saldo_var('trad') = 24, 'F12: corrigir para o mesmo valor não muda nada';
  assert pg_temp.erro(format('select public.corrigir_producao(%L, -1)', pg_temp.id('prod'))) like 'Informe quantos renderam%', 'F12: valor negativo é recusado';
end
$$;

-- ── Contagem do dia ─────────────────────────────────────────────────────────
do $$
declare
  v_chave uuid := gen_random_uuid();
  v_n integer;
begin
  v_n := public.registrar_contagem(v_chave, jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('choc'), 'contado', 150),
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'contado', 4000),
    jsonb_build_object('variacao_id', pg_temp.id('trad'), 'contado', 20)), 'Contagem do fim do dia');
  assert v_n = 2, 'F12: 3 itens contados, 2 diferentes do sistema, veio ' || v_n;
  assert pg_temp.saldo_insumo('choc') = 150 and pg_temp.saldo_var('trad') = 20 and pg_temp.saldo_insumo('farinha') = 4000, 'F12: os saldos passam a ser o que foi contado';
  assert (select count(*) from public.movimentos_estoque where origem_tipo = 'contagem' and origem_id = v_chave and justificativa = 'Contagem do fim do dia') = 2,
    'F12: ficou no livro de estoque com o motivo';
  assert public.registrar_contagem(v_chave, jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('choc'), 'contado', 10))) = 0
    and pg_temp.saldo_insumo('choc') = 150, 'F12: reenvio da mesma contagem não repete';
  assert pg_temp.erro(format('select public.registrar_contagem(%L, ''[{"insumo_id": "%s", "contado": -5}]''::jsonb)', gen_random_uuid(), pg_temp.id('choc')))
    like 'Informe quanto você contou%', 'F12: contagem negativa é recusada';
  assert pg_temp.erro(format('select public.registrar_contagem(%L, ''[{"contado": 5}]''::jsonb)', gen_random_uuid())) like 'Escolha um insumo ou um produto%',
    'F12: linha sem item é recusada';
end
$$;

-- ── Simulação de produção ───────────────────────────────────────────────────
do $$
declare
  r jsonb;
  f jsonb;
begin
  r := public.simular_producao(jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'fornadas', 2)));
  assert (r -> 'produtos' -> 0 ->> 'unidades')::numeric = 24, 'F12: 2 fornadas devem render 24 (12 por fornada, pela última produção)';
  select x into f from jsonb_array_elements(r -> 'insumos') x where x ->> 'insumo_id' = pg_temp.id('choc')::text;
  assert (f ->> 'necessario')::numeric = 800 and (f ->> 'saldo')::numeric = 150 and (f ->> 'falta')::numeric = 650 and (f ->> 'custo_falta')::numeric = 20.8,
    'F12: chocolate: precisa 800, tem 150, falta 650 (R$ 20,80): ' || f::text;
  select x into f from jsonb_array_elements(r -> 'insumos') x where x ->> 'insumo_id' = pg_temp.id('farinha')::text;
  assert (f ->> 'necessario')::numeric = 1000 and (f ->> 'falta')::numeric = 0, 'F12: farinha basta';
  select x into f from jsonb_array_elements(r -> 'insumos') x where x ->> 'insumo_id' = pg_temp.id('pote')::text;
  assert (f ->> 'necessario')::numeric = 24 and (f ->> 'falta')::numeric = 0, 'F12: potes: 24 para 24 potinhos';
  r := public.simular_producao('[]');
  assert jsonb_array_length(r -> 'insumos') = 0 and jsonb_array_length(r -> 'produtos') = 0, 'F12: sem fornadas, sem lista';
end
$$;

-- ── Membro: registra e simula; corrige a própria produção dentro do prazo ─────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000cbb"}';
do $$
declare
  v_res jsonb;
begin
  assert jsonb_array_length(public.simular_producao(jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'fornadas', 1))) -> 'insumos') = 3,
    'F12: membro simula';
  v_res := public.registrar_producao(gen_random_uuid(), pg_temp.id('trad'), 1, 12);
  assert (v_res ->> 'ok')::boolean, 'F12: membro registra produção';
  perform public.corrigir_producao((v_res ->> 'producao_id')::uuid, 11);
  assert pg_temp.erro(format('select public.corrigir_producao(%L, 30)', pg_temp.id('prod'))) like 'Só o administrador corrige%',
    'F12: membro não corrige a produção de outra pessoa';
  assert public.registrar_contagem(gen_random_uuid(), jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'contado', 3500))) >= 0, 'F12: membro conta o estoque';
end
$$;

reset role;
select 'fatia 12: todos os testes passaram' as resultado;
rollback;
