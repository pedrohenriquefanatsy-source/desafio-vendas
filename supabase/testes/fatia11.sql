-- Testes da fatia 11: custeio por peso (cubos com cobertura de chocolate).
-- Massa (ingredientes) + chocolate gasto (peso final - peso dos cubos); potinho = gramagem x custo por grama + embalagem.
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000baa', 'f11-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-000000000bbb', 'f11-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F11' where id = '00000000-0000-4000-8000-000000000baa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F11' where id = '00000000-0000-4000-8000-000000000bbb';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000baa"}';

create temporary table ids_f11 (chave text primary key, id uuid) on commit drop;
grant all on ids_f11 to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f11 where chave = p $$;
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

-- Cadastro: massa de farinha e leite condensado, chocolate de cobertura, pote e adesivo.
do $$
begin
  insert into ids_f11 values ('farinha', public.cadastrar_insumo(gen_random_uuid(), 'Farinha F11', 'ingrediente', 'g', 1000, 6, 5000));
  insert into ids_f11 values ('leite', public.cadastrar_insumo(gen_random_uuid(), 'Leite cond F11', 'ingrediente', 'g', 395, 7.90, 3950));
  insert into ids_f11 values ('choc', public.cadastrar_insumo(gen_random_uuid(), 'Chocolate F11', 'ingrediente', 'g', 500, 16, 5000));
  insert into ids_f11 values ('sem', public.cadastrar_insumo(gen_random_uuid(), 'Sem preço F11', 'ingrediente', 'g'));
  insert into ids_f11 values ('ovo', public.cadastrar_insumo(gen_random_uuid(), 'Ovo F11', 'ingrediente', 'und', 1, 0.5, 10));
  insert into ids_f11 values ('pote', public.cadastrar_insumo(gen_random_uuid(), 'Pote F11', 'embalagem', 'und', 1, 0.5, 100));
  insert into ids_f11 values ('adesivo', public.cadastrar_insumo(gen_random_uuid(), 'Adesivo F11', 'embalagem', 'und', 1, 0.1, 100));
  insert into public.produtos (nome, tipo) values ('Cubos F11', 'simples');
  insert into public.variacoes (produto_id, nome, preco_venda)
  select pr.id, v.nome, 10 from public.produtos pr, (values ('Tradicional'), ('Sem preço'), ('Ninho')) v(nome) where pr.nome = 'Cubos F11';
  insert into ids_f11 select lower(v.nome), v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Cubos F11';
  insert into ids_f11 values ('sempreco', pg_temp.id('sem preço'));
  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade)
  values (pg_temp.id('tradicional'), pg_temp.id('pote'), 1, 'und'), (pg_temp.id('tradicional'), pg_temp.id('adesivo'), 1, 'und');
end
$$;

-- ── Cadastro da receita por peso ─────────────────────────────────────────────
do $$
declare
  v_receita uuid;
  v_itens jsonb := jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 500, 'unidade', 'g'),
    jsonb_build_object('insumo_id', pg_temp.id('leite'), 'quantidade', 1, 'unidade', 'embalagem'));
begin
  assert pg_temp.erro(format('select public.cadastrar_receita_peso(%L, %L::jsonb, %L, 2000, 800, 0)', pg_temp.id('tradicional'), v_itens, pg_temp.id('choc')))
    like 'Informe a gramagem de cada potinho%', 'F11: gramagem zero é recusada';
  assert pg_temp.erro(format('select public.cadastrar_receita_peso(%L, %L::jsonb, %L, 2000, 800, 150)', pg_temp.id('tradicional'), v_itens, pg_temp.id('ovo')))
    like 'A cobertura precisa ser um insumo medido em gramas%', 'F11: cobertura em unidades é recusada';
  assert pg_temp.erro(format('select public.cadastrar_receita_peso(%L, %L::jsonb, null, 2000, 800, 150)', pg_temp.id('tradicional'), v_itens))
    like 'Escolha o insumo da cobertura%', 'F11: sem cobertura é recusado';
  assert (select receita_id from public.variacoes where id = pg_temp.id('tradicional')) is null,
    'F11: as tentativas recusadas não deixaram receita pela metade';

  v_receita := public.cadastrar_receita_peso(pg_temp.id('tradicional'), v_itens, pg_temp.id('choc'), 2000, 800, 150);
  insert into ids_f11 values ('rec', v_receita);
  assert (select custeio_por_peso and gramagem_unidade = 150 and peso_cubos_estimado = 2000 and cobertura_estimada = 800 from public.receitas where id = v_receita),
    'F11: receita guardou cobertura, estimativas e gramagem';
  assert (select rendimento_unidades from public.receitas where id = v_receita) = 18.67, 'F11: rendimento previsto = (2000 + 800) / 150 = 18,67';
  -- Estimativa: massa 3,00 + 7,90 = 10,90; chocolate 800 g x 0,032 = 25,60; total 36,50 sobre 2800 g.
  assert (select origem = 'estimativa' and abs(custo_por_grama - 36.5 / 2800) < 0.0000001 from public.v_custeio_peso where receita_id = v_receita),
    'F11: antes de pesar, o custo por grama vem da estimativa (36,50 / 2800 g)';
  assert (select abs(custo_unidade - 150 * 36.5 / 2800) < 0.0001 from public.v_custeio_peso where receita_id = v_receita),
    'F11: potinho de 150 g custa 1,9554 de produto';
  assert (select abs(custo_unitario - (150 * 36.5 / 2800 + 0.6)) < 0.0001 from public.v_custo_variacoes where variacao_id = pg_temp.id('tradicional')),
    'F11: custo do produto = gramagem x custo por grama + pote + adesivo (2,5554)';
  assert (select custeio_por_peso from public.v_custo_receitas where receita_id = v_receita), 'F11: a view de receitas indica o custeio por peso';
end
$$;

-- ── Planejar e concluir ──────────────────────────────────────────────────────
do $$
declare
  v_prod uuid;
  v_res jsonb;
  v_custo_g numeric := round(66.6 / 5200, 8);
begin
  v_prod := public.planejar_producao(gen_random_uuid(), pg_temp.id('tradicional'), 2);
  insert into ids_f11 values ('prod1', v_prod);
  assert (select unidades_previstas from public.producoes where id = v_prod) = 37.34, 'F11: 2 fornadas preveem 37,34 potinhos';
  assert (select necessario from privado.necessidade_producao_peso(v_prod, 30, 1600) where insumo_id = pg_temp.id('choc')) = 1600,
    'F11: a necessidade inclui o chocolate esperado';
  assert (select necessario from privado.necessidade_producao_peso(v_prod, 30, 1600) where insumo_id = pg_temp.id('pote')) = 30,
    'F11: e a embalagem pelos potinhos';

  assert pg_temp.erro(format('select public.concluir_producao(%L, 33, 1)', v_prod)) like 'Informe o peso dos cubos e o peso depois do chocolate%',
    'F11: sem pesos não conclui';
  assert pg_temp.erro(format('select public.concluir_producao(%L, 33, 1, 3800, 3800)', v_prod)) like 'O peso depois do chocolate precisa ser maior%',
    'F11: peso final igual ao dos cubos é recusado';
  assert pg_temp.saldo_insumo('choc') = 5000, 'F11: recusas não mexem no estoque';

  -- Cubos 3800 g, depois do chocolate 5200 g: 1400 g de chocolate gastos. Massa 2 x 10,90 = 21,80; chocolate 1400 x 0,032 = 44,80.
  v_res := public.concluir_producao(v_prod, 33, 1, 3800, 5200);
  assert (v_res ->> 'ok')::boolean, 'F11: produção por peso concluída';
  assert pg_temp.saldo_insumo('choc') = 3600, 'F11: o chocolate que saiu do estoque é a diferença das pesagens (1400 g)';
  assert pg_temp.saldo_insumo('farinha') = 4000 and pg_temp.saldo_insumo('leite') = 3160, 'F11: a massa baixa receita x fornadas';
  assert pg_temp.saldo_insumo('pote') = 67 and pg_temp.saldo_insumo('adesivo') = 67, 'F11: pote e adesivo baixam pelos potinhos boas (33)';
  assert pg_temp.saldo_var('tradicional') = 33, 'F11: 33 potinhos prontos (a perdida entra e sai)';
  assert (select peso_cubos = 3800 and peso_final = 5200 and custo_massa = 21.8 and custo_cobertura = 44.8 and custo_por_grama = v_custo_g
            from public.producoes where id = v_prod), 'F11: a produção guarda pesos e custos reais (66,60 / 5200 g)';
  assert (select abs(custo_unitario - (150 * v_custo_g + 0.6)) < 0.00001 from public.movimentos_estoque
           where origem_id = v_prod and tipo = 'entrada_producao' and justificativa is null), 'F11: potinho bom custa gramagem x custo por grama + embalagem';
  assert (select abs(custo_unitario - 150 * v_custo_g) < 0.00001 from public.movimentos_estoque
           where origem_id = v_prod and tipo = 'perda'), 'F11: potinho perdido custa só a parte do produto (sem embalagem)';
  assert (public.concluir_producao(v_prod, 33, 1, 3800, 5200) ->> 'ja_concluida')::boolean and pg_temp.saldo_insumo('choc') = 3600,
    'F11: concluir de novo não baixa duas vezes';
end
$$;

-- ── Custo por grama passa a vir da última fornada pesada ────────────────────
do $$
declare
  v_receita uuid := pg_temp.id('rec');
begin
  assert (select origem = 'ultima_fornada' and abs(custo_por_grama - 66.6 / 5200) < 0.0000001 from public.v_custeio_peso where receita_id = v_receita),
    'F11: depois de pesar, o custo por grama vem da última fornada (66,60 / 5200 g)';
  assert (select abs(custo_unitario - (150 * 66.6 / 5200 + 0.6)) < 0.0001 from public.v_custo_variacoes where variacao_id = pg_temp.id('tradicional')),
    'F11: o custo do produto acompanha';
  -- Chocolate mais caro (R$ 20 por 500 g = 0,04/g): proporções da fornada real, preço de hoje.
  perform public.definir_custo_insumo(pg_temp.id('choc'), 20, 'embalagem');
  assert (select abs(custo_por_grama - (21.8 + 1400 * 0.04) / 5200) < 0.0000001 from public.v_custeio_peso where receita_id = v_receita),
    'F11: preço novo do chocolate muda o custo por grama (77,80 / 5200 g)';
  assert (select custo_por_grama = round(66.6 / 5200, 8) from public.producoes where id = pg_temp.id('prod1')),
    'F11: a fornada já feita guarda o custo do dia';
  perform public.definir_custo_insumo(pg_temp.id('choc'), 16, 'embalagem');
end
$$;

-- ── Falta de chocolate: não conclui e diz quanto falta ──────────────────────
do $$
declare
  v_prod uuid;
  v_res jsonb;
begin
  perform public.ajustar_estoque(gen_random_uuid(), pg_temp.id('choc'), null, 100, 'Teste F11');
  v_prod := public.planejar_producao(gen_random_uuid(), pg_temp.id('tradicional'), 1);
  v_res := public.concluir_producao(v_prod, 18, 0, 2000, 3000);
  assert not (v_res ->> 'ok')::boolean, 'F11: sem chocolate suficiente não conclui';
  assert (select (f ->> 'falta')::numeric from jsonb_array_elements(v_res -> 'faltas') f where f ->> 'insumo_id' = pg_temp.id('choc')::text) = 900,
    'F11: mostra que faltam 900 g de chocolate (precisa 1000, tem 100)';
  assert pg_temp.saldo_insumo('choc') = 100 and pg_temp.saldo_var('tradicional') = 33, 'F11: nada foi baixado';
  perform public.cancelar_producao(v_prod, 'Teste F11');
end
$$;

-- ── Cobertura sem preço: custo vazio e não conclui ──────────────────────────
do $$
declare
  v_receita uuid;
  v_prod uuid;
begin
  v_receita := public.cadastrar_receita_peso(pg_temp.id('sempreco'),
    jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 500, 'unidade', 'g')),
    pg_temp.id('sem'), 1000, 400, 100);
  assert (select custo_por_grama is null and cobertura_sem_preco from public.v_custeio_peso where receita_id = v_receita),
    'F11: chocolate sem preço deixa o custo vazio (nunca um custo menor que o real)';
  assert (select sem_preco from public.v_custo_variacoes where variacao_id = pg_temp.id('sempreco')), 'F11: o produto aparece como incompleto';
  perform public.ajustar_estoque(gen_random_uuid(), pg_temp.id('sem'), null, 5000, 'Teste F11');
  v_prod := public.planejar_producao(gen_random_uuid(), pg_temp.id('sempreco'), 1);
  assert pg_temp.erro(format('select public.concluir_producao(%L, 10, 0, 1000, 1400)', v_prod)) like 'Falta o preço de um ingrediente da receita ou do chocolate%',
    'F11: sem preço não conclui (e o erro desfaz tudo)';
  assert pg_temp.saldo_insumo('sem') = 5000, 'F11: nada foi baixado';
end
$$;

-- ── Copiar, voltar ao rendimento, permissões e exclusão ─────────────────────
do $$
declare
  v_copia uuid;
begin
  v_copia := public.copiar_receita_variacao(pg_temp.id('tradicional'), pg_temp.id('ninho'));
  assert (select custeio_por_peso and cobertura_insumo_id = pg_temp.id('choc') and gramagem_unidade = 150 and peso_cubos_estimado = 2000
            from public.receitas where id = v_copia), 'F11: copiar a receita leva cobertura, estimativas e gramagem';
  perform public.voltar_custeio_por_rendimento(v_copia, 20);
  assert (select not custeio_por_peso and gramagem_unidade is null and rendimento_unidades = 20 from public.receitas where id = v_copia),
    'F11: dá para voltar ao custo por rendimento';
  assert (select abs(custo_por_unidade - custo_receita / 20) < 0.0000001 and not custeio_por_peso from public.v_custo_receitas where receita_id = v_copia),
    'F11: no custo por rendimento a conta é a de sempre (fornada / 20)';
  assert (select custeio_por_peso from public.receitas where id = pg_temp.id('rec')), 'F11: a receita original continua por peso';

  assert pg_temp.erro(format('select public.definir_custeio_peso(%L, %L, 1000, 300, 100)', v_copia, pg_temp.id('ovo'))) like 'A cobertura precisa ser um insumo medido em gramas%',
    'F11: definir com cobertura em unidades é recusado';
  perform public.definir_custeio_peso(v_copia, pg_temp.id('choc'), 1000, 300, 100);
  assert (select rendimento_unidades from public.receitas where id = v_copia) = 13, 'F11: definir por peso recalcula o rendimento previsto (1300 / 100)';

  assert public.motivo_nao_excluir('insumo', pg_temp.id('choc')) like 'Está em uma receita%', 'F11: o chocolate da cobertura não se exclui';
end
$$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000bbb"}';
do $$
begin
  assert pg_temp.erro(format('select public.definir_custeio_peso(%L, %L, 1000, 300, 100)', pg_temp.id('rec'), pg_temp.id('choc'))) = 'Só o administrador altera receitas.',
    'F11: membro não altera o custeio';
  assert pg_temp.erro(format('select public.cadastrar_receita_peso(%L, ''[]''::jsonb, %L, 1000, 300, 100)', pg_temp.id('tradicional'), pg_temp.id('choc'))) = 'Só o administrador cadastra receitas.',
    'F11: membro não cadastra receita por peso';
  assert (select count(*) from public.v_custeio_peso) >= 2, 'F11: membro vê os custos (leitura liberada)';
end
$$;

reset role;
select 'fatia 11: todos os testes passaram' as resultado;
rollback;
