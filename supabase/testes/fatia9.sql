-- Testes da fatia 9: cadastro simplificado.
-- Insumo com embalagem e preço em uma chamada, estoque inicial, receita dentro do sabor,
-- copiar receita de outro sabor, nome da receita acompanhando o produto e exclusão segura
-- (só o que nunca foi usado; o resto se desativa).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000009aa', 'f9-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000009bb', 'f9-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F9' where id = '00000000-0000-4000-8000-0000000009aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F9' where id = '00000000-0000-4000-8000-0000000009bb';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000009aa"}';

create temporary table ids_f9 (chave text primary key, id uuid) on commit drop;
grant all on ids_f9 to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f9 where chave = p $$;
create function pg_temp.erro(p text) returns text language plpgsql as $$
begin
  execute p;
  return null;
exception when others then
  return sqlerrm;
end
$$;

-- ── Insumo em uma chamada ────────────────────────────────────────────────────
do $$
declare
  i public.insumos;
begin
  insert into ids_f9 values ('choc', public.cadastrar_insumo(gen_random_uuid(), 'Chocolate F9', 'ingrediente', 'g', 500, 16, 1500));
  select * into i from public.insumos where id = pg_temp.id('choc');
  assert i.custo_atual = 0.032, 'F9: custo por grama = 16 / 500 (' || i.custo_atual || ')';
  assert i.preco_referencia = 16 and i.unidade_referencia = 'embalagem', 'F9: preço guardado como "R$ 16 por embalagem"';
  assert (select saldo from public.saldos_estoque where insumo_id = i.id) = 1500, 'F9: estoque inicial entra como saldo';
  assert (select count(*) from public.movimentos_estoque where insumo_id = i.id and tipo = 'ajuste' and justificativa = 'Estoque inicial') = 1,
    'F9: estoque inicial fica no livro como contagem, com o motivo';
  assert (select count(*) from public.lancamentos_caixa) = 0, 'F9: estoque inicial não mexe no caixa';
  assert (select quantidade_em_base from public.insumo_conversoes where insumo_id = i.id and unidade = 'embalagem') = 500,
    'F9: a embalagem vira a unidade de compra "embalagem"';

  -- Preço exato: 7,90 por 395 g dá 0,02 por g sem arredondar o preço do quilo.
  insert into ids_f9 values ('leite', public.cadastrar_insumo(gen_random_uuid(), 'Leite condensado F9', 'ingrediente', 'g', 395, 7.90));
  assert (select custo_atual from public.insumos where id = pg_temp.id('leite')) = 0.02, 'F9: 7,90 / 395 = 0,02 por g';
  assert (select count(*) from public.saldos_estoque where insumo_id = pg_temp.id('leite')) = 0, 'F9: sem estoque informado, nada é lançado';

  -- Sem embalagem e preço: nasce sem preço (aparece o aviso nas receitas).
  insert into ids_f9 values ('sem', public.cadastrar_insumo(gen_random_uuid(), 'Sem preço F9', 'ingrediente', 'und'));
  assert (select custo_atual from public.insumos where id = pg_temp.id('sem')) is null, 'F9: insumo sem preço fica sem custo';

  -- Embalagem de produto contado em unidades.
  insert into ids_f9 values ('saco', public.cadastrar_insumo(gen_random_uuid(), 'Saquinho F9', 'embalagem', 'und', 100, 12, 40));
  assert (select custo_atual from public.insumos where id = pg_temp.id('saco')) = 0.12, 'F9: pacote com 100 por R$ 12 = R$ 0,12 cada';

  assert pg_temp.erro('select public.cadastrar_insumo(gen_random_uuid(), ''Chocolate F9'', ''ingrediente'', ''g'')') = 'Já existe um insumo com esse nome.',
    'F9: nome repetido é recusado com mensagem clara';
  assert pg_temp.erro('select public.cadastrar_insumo(gen_random_uuid(), ''X F9 Y'', ''ingrediente'', ''g'', 500)') like 'Informe o tamanho da embalagem e o preço%',
    'F9: tamanho sem preço é recusado';
  assert pg_temp.erro('select public.cadastrar_insumo(gen_random_uuid(), ''X F9 Y'', ''ingrediente'', ''kg'')') like 'Escolha como o insumo é medido%',
    'F9: unidade base inválida é recusada';
  assert pg_temp.erro('select public.cadastrar_insumo(gen_random_uuid(), ''X F9 Y'', ''ingrediente'', ''g'', 0, 5)') like 'O tamanho da embalagem%',
    'F9: tamanho zero é recusado';

  -- Troca de embalagem e preço depois.
  perform public.definir_embalagem_insumo(pg_temp.id('choc'), 1000, 40);
  assert (select custo_atual from public.insumos where id = pg_temp.id('choc')) = 0.04, 'F9: 40 / 1000 = 0,04 por g';
  assert (select count(*) from public.insumo_conversoes where insumo_id = pg_temp.id('choc') and unidade = 'embalagem') = 1,
    'F9: a embalagem é trocada, não duplicada';
  assert (select count(*) from public.insumo_custos_historico where insumo_id = pg_temp.id('choc')) = 2, 'F9: a troca de preço fica no histórico';
end
$$;

-- ── Produto com sabores, receita dentro do sabor ─────────────────────────────
do $$
begin
  insert into public.produtos (nome, tipo) values ('Brownie F9', 'simples');
  insert into ids_f9 values ('prod', (select id from public.produtos where nome = 'Brownie F9'));
  insert into public.variacoes (produto_id, nome, preco_venda) select pg_temp.id('prod'), 'Tradicional', 4;
  insert into public.variacoes (produto_id, nome, preco_venda) select pg_temp.id('prod'), 'Ninho', 5;
  insert into ids_f9 select 'trad', id from public.variacoes where produto_id = pg_temp.id('prod') and nome = 'Tradicional';
  insert into ids_f9 select 'ninho', id from public.variacoes where produto_id = pg_temp.id('prod') and nome = 'Ninho';
  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade) values (pg_temp.id('trad'), pg_temp.id('saco'), 1, 'und');

  insert into ids_f9 values ('rec_trad', public.criar_receita_variacao(pg_temp.id('trad'), 20));
  assert (select receita_id from public.variacoes where id = pg_temp.id('trad')) = pg_temp.id('rec_trad'), 'F9: a receita nasce ligada ao sabor';
  assert (select nome from public.receitas where id = pg_temp.id('rec_trad')) = 'Brownie F9 · Tradicional', 'F9: nome da receita = produto · sabor';
  assert pg_temp.erro(format('select public.criar_receita_variacao(%L, 10)', pg_temp.id('trad'))) = 'Este sabor já tem receita.',
    'F9: um sabor não ganha duas receitas';

  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade) values
    (pg_temp.id('rec_trad'), pg_temp.id('choc'), 200, 'g'),
    (pg_temp.id('rec_trad'), pg_temp.id('leite'), 395, 'g');
  -- 200 g x 0,04 + 395 g x 0,02 = 8 + 7,90 = 15,90 por fornada de 20 = 0,795 + embalagem 0,12
  assert (select round(custo_unitario, 3) from public.v_custo_variacoes where variacao_id = pg_temp.id('trad')) = 0.915,
    'F9: custo do sabor = receita ÷ rendimento + embalagem (0,795 + 0,12)';

  -- Copiar a massa-base para outro sabor.
  assert pg_temp.erro(format('select public.copiar_receita_variacao(%L, %L)', pg_temp.id('ninho'), pg_temp.id('trad'))) like 'O sabor escolhido ainda não tem receita.',
    'F9: não copia de sabor sem receita';
  insert into ids_f9 values ('rec_ninho', public.copiar_receita_variacao(pg_temp.id('trad'), pg_temp.id('ninho')));
  assert (select rendimento_unidades from public.receitas where id = pg_temp.id('rec_ninho')) = 20, 'F9: copia o rendimento';
  assert (select count(*) from public.receita_itens where receita_id = pg_temp.id('rec_ninho')) = 2, 'F9: copia os ingredientes';
  assert pg_temp.id('rec_ninho') <> pg_temp.id('rec_trad'), 'F9: a cópia é uma receita própria';
  assert (select count(*) from public.variacao_embalagens where variacao_id = pg_temp.id('ninho')) = 1, 'F9: copia a embalagem quando o sabor não tem';
  assert (select nome from public.receitas where id = pg_temp.id('rec_ninho')) = 'Brownie F9 · Ninho', 'F9: a cópia tem o nome do sabor novo';
  assert pg_temp.erro(format('select public.copiar_receita_variacao(%L, %L)', pg_temp.id('trad'), pg_temp.id('ninho'))) like 'Este sabor já tem ingredientes%',
    'F9: não copia por cima de ingredientes existentes';

  -- A cópia é independente: mudar um ingrediente do Ninho não muda o Tradicional.
  update public.receita_itens set quantidade = 100 where receita_id = pg_temp.id('rec_ninho') and insumo_id = pg_temp.id('choc');
  assert (select quantidade from public.receita_itens where receita_id = pg_temp.id('rec_trad') and insumo_id = pg_temp.id('choc')) = 200,
    'F9: copiar não deixa os sabores amarrados';

  -- Renomear acompanha.
  update public.variacoes set nome = 'Ninho cremoso' where id = pg_temp.id('ninho');
  assert (select nome from public.receitas where id = pg_temp.id('rec_ninho')) = 'Brownie F9 · Ninho cremoso', 'F9: renomear o sabor renomeia a receita';
  update public.produtos set nome = 'Brownie Bites F9' where id = pg_temp.id('prod');
  assert (select nome from public.receitas where id = pg_temp.id('rec_trad')) = 'Brownie Bites F9 · Tradicional', 'F9: renomear o produto renomeia a receita';
  assert (select nome from public.receitas where id = pg_temp.id('rec_ninho')) = 'Brownie Bites F9 · Ninho cremoso', 'F9: ...de todos os sabores';
end
$$;

-- ── Exclusão: o que nunca foi usado sai; o que tem histórico só se desativa ───
do $$
declare
  v_aud int;
begin
  -- Insumo em receita ou embalagem: bloqueado, com o motivo.
  assert public.motivo_nao_excluir('insumo', pg_temp.id('choc')) like 'Está em uma receita%', 'F9: insumo de receita não exclui';
  assert public.motivo_nao_excluir('insumo', pg_temp.id('saco')) like 'Está em uma receita ou em uma embalagem%', 'F9: embalagem em uso não exclui';
  assert pg_temp.erro(format('select public.excluir_cadastro(''insumo'', %L)', pg_temp.id('choc'))) like 'Está em uma receita%',
    'F9: a exclusão também é barrada no banco, não só na tela';

  -- Insumo só com contagem de estoque: exclui e leva a contagem junto, deixando rastro.
  insert into ids_f9 values ('so_contagem', public.cadastrar_insumo(gen_random_uuid(), 'Só contagem F9', 'ingrediente', 'g', 100, 5, 300));
  assert public.motivo_nao_excluir('insumo', pg_temp.id('so_contagem')) is null, 'F9: insumo só com contagem pode excluir';
  perform public.excluir_cadastro('insumo', pg_temp.id('so_contagem'));
  assert not exists (select 1 from public.insumos where id = pg_temp.id('so_contagem')), 'F9: insumo excluído';
  assert not exists (select 1 from public.movimentos_estoque where insumo_id = pg_temp.id('so_contagem')), 'F9: a contagem sai junto';
  assert not exists (select 1 from public.saldos_estoque where insumo_id = pg_temp.id('so_contagem')), 'F9: o saldo sai junto';
  assert not exists (select 1 from public.insumo_conversoes where insumo_id = pg_temp.id('so_contagem')), 'F9: a embalagem sai junto';
  select count(*) into v_aud from public.auditoria where acao = 'exclusao' and registro_id = pg_temp.id('so_contagem')::text and tabela = 'insumos';
  assert v_aud = 1, 'F9: a exclusão do insumo fica na auditoria com o que existia';
  assert (select count(*) from public.auditoria where acao = 'exclusao' and tabela = 'movimentos_estoque' and antes ->> 'insumo_id' = pg_temp.id('so_contagem')::text) = 1,
    'F9: a contagem apagada também fica na auditoria';
  assert (select antes ->> 'nome' from public.auditoria where acao = 'exclusao' and tabela = 'insumos' and registro_id = pg_temp.id('so_contagem')::text) = 'Só contagem F9',
    'F9: a auditoria guarda o nome do insumo excluído';

  -- Tirar da receita libera o insumo.
  delete from public.receita_itens where receita_id = pg_temp.id('rec_ninho') and insumo_id = pg_temp.id('leite');
  assert public.motivo_nao_excluir('insumo', pg_temp.id('sem')) is null, 'F9: insumo sem uso exclui';
  perform public.excluir_cadastro('insumo', pg_temp.id('sem'));
  assert not exists (select 1 from public.insumos where id = pg_temp.id('sem')), 'F9: insumo sem preço excluído';
end
$$;

-- Insumo com compra: só desativa, mesmo cancelada. Sabor com venda: idem.
insert into ids_f9 values ('cacau', public.cadastrar_insumo(gen_random_uuid(), 'Cacau F9', 'ingrediente', 'g', 395, 7.90));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000009bb"}';
do $$
begin
  insert into ids_f9 values ('compra', public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('cacau'), 'quantidade', 2, 'unidade', 'embalagem', 'valor', 16)), 'caixa'));
  assert (select saldo from public.saldos_estoque where insumo_id = pg_temp.id('cacau')) = 790, 'F9: compra em "embalagem" soma 2 x 395 g';
  perform public.cancelar_compra(pg_temp.id('compra'), 'Teste');
  assert pg_temp.erro(format('select public.excluir_cadastro(''insumo'', %L)', pg_temp.id('cacau'))) = 'Só o administrador exclui cadastros.',
    'F9: membro não exclui';
  assert public.motivo_nao_excluir('insumo', pg_temp.id('cacau')) like 'Já tem compras ou movimentações%',
    'F9: o membro vê o motivo (a tela explica por que só desativa)';
end
$$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000009aa"}';
do $$
declare
  v_forma uuid;
begin
  assert pg_temp.erro(format('select public.excluir_cadastro(''insumo'', %L)', pg_temp.id('cacau'))) like 'Já tem compras ou movimentações%',
    'F9: compra cancelada continua no histórico: só desativa';

  -- Venda de um sabor.
  insert into public.formas_pagamento (nome) values ('Pix F9') returning id into v_forma;
  perform public.ajustar_estoque(gen_random_uuid(), pg_temp.id('leite'), null, 1000, 'Contagem do teste');
  assert (public.concluir_producao(public.planejar_producao(gen_random_uuid(), pg_temp.id('trad'), 1), 20, 0) ->> 'ok')::boolean,
    'F9: a produção do sabor usa a receita embutida';
  assert (public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 1)), v_forma, null) ->> 'ok')::boolean,
    'F9: o sabor com receita embutida vende normalmente';
  assert public.motivo_nao_excluir('variacao', pg_temp.id('trad')) like '%já tem vendas%', 'F9: sabor com venda não exclui';
  assert public.motivo_nao_excluir('produto', pg_temp.id('prod')) like '%já tem vendas%', 'F9: produto com sabor vendido não exclui';
  assert pg_temp.erro(format('select public.excluir_cadastro(''produto'', %L)', pg_temp.id('prod'))) like '%já tem vendas%',
    'F9: o banco barra a exclusão do produto';
  assert exists (select 1 from public.produtos where id = pg_temp.id('prod')) and exists (select 1 from public.receitas where id = pg_temp.id('rec_trad')),
    'F9: nada foi apagado na tentativa barrada';
end
$$;

-- Sabor sem uso: exclui com a receita dele; o último sabor não; produto sem uso exclui tudo.
do $$
declare
  v_kit uuid;
begin
  assert public.motivo_nao_excluir('variacao', pg_temp.id('ninho')) is null, 'F9: sabor sem uso pode excluir';
  perform public.excluir_cadastro('variacao', pg_temp.id('ninho'));
  assert not exists (select 1 from public.variacoes where id = pg_temp.id('ninho')), 'F9: sabor excluído';
  assert not exists (select 1 from public.receitas where id = pg_temp.id('rec_ninho')), 'F9: a receita exclusiva do sabor sai junto';
  assert not exists (select 1 from public.receita_itens where receita_id = pg_temp.id('rec_ninho')), 'F9: e os ingredientes dela';
  assert not exists (select 1 from public.variacao_embalagens where variacao_id = pg_temp.id('ninho')), 'F9: e a embalagem do sabor';
  assert exists (select 1 from public.receitas where id = pg_temp.id('rec_trad')), 'F9: a receita do outro sabor fica';

  -- Produto sem uso, com dois sabores, um deles já com receita e embalagem, e um kit que usa um sabor.
  insert into public.produtos (nome, tipo) values ('Descartável F9', 'simples');
  insert into ids_f9 select 'prod2', id from public.produtos where nome = 'Descartável F9';
  insert into public.variacoes (produto_id, nome, preco_venda) select pg_temp.id('prod2'), 'A', 3;
  insert into public.variacoes (produto_id, nome, preco_venda) select pg_temp.id('prod2'), 'B', 3;
  insert into ids_f9 select 'a', id from public.variacoes where produto_id = pg_temp.id('prod2') and nome = 'A';
  insert into ids_f9 select 'b', id from public.variacoes where produto_id = pg_temp.id('prod2') and nome = 'B';
  assert public.motivo_nao_excluir('variacao', pg_temp.id('b')) is null, 'F9: tem outro sabor, o B pode sair';
  perform public.criar_receita_variacao(pg_temp.id('a'), 10);
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
  select receita_id, pg_temp.id('choc'), 50, 'g' from public.variacoes where id = pg_temp.id('a');
  assert public.motivo_nao_excluir('insumo', pg_temp.id('choc')) like 'Está em uma receita%', 'F9: o insumo usado pelo sabor A segue protegido';

  insert into public.produtos (nome, tipo) values ('Kit F9', 'kit');
  insert into public.variacoes (produto_id, nome, preco_venda) select id, 'Única', 10 from public.produtos where nome = 'Kit F9';
  insert into ids_f9 select 'kit', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Kit F9';
  insert into public.kit_componentes (kit_variacao_id, componente_variacao_id, quantidade) values (pg_temp.id('kit'), pg_temp.id('a'), 2);
  assert public.motivo_nao_excluir('variacao', pg_temp.id('a')) like '%faz parte de um kit%', 'F9: sabor dentro de um kit não exclui';
  assert public.motivo_nao_excluir('produto', pg_temp.id('prod2')) like '%faz parte de um kit%', 'F9: produto com sabor dentro de kit não exclui';
  perform public.excluir_cadastro('produto', (select id from public.produtos where nome = 'Kit F9'));
  assert not exists (select 1 from public.kit_componentes where kit_variacao_id = pg_temp.id('kit')), 'F9: excluir o kit leva os componentes dele';

  assert public.motivo_nao_excluir('produto', pg_temp.id('prod2')) is null, 'F9: sem o kit, o produto pode ser excluído';
  perform public.excluir_cadastro('produto', pg_temp.id('prod2'));
  assert not exists (select 1 from public.produtos where id = pg_temp.id('prod2')), 'F9: produto excluído';
  assert not exists (select 1 from public.variacoes where produto_id = pg_temp.id('prod2')), 'F9: com todos os sabores';
  assert not exists (select 1 from public.receitas where nome like 'Descartável F9%'), 'F9: e as receitas deles';
  assert (select count(*) from public.auditoria where acao = 'exclusao' and tabela = 'produtos' and antes ->> 'nome' = 'Descartável F9') = 1,
    'F9: a exclusão do produto fica na auditoria';
  assert public.motivo_nao_excluir('insumo', pg_temp.id('choc')) like 'Está em uma receita%', 'F9: o insumo usado pelo sabor A segue protegido';

  -- O último sabor de um produto não se exclui sozinho.
  assert public.motivo_nao_excluir('variacao', pg_temp.id('trad')) like '%já tem vendas%', 'F9: (o Tradicional tem venda)';
  insert into public.produtos (nome, tipo) values ('Único sabor F9', 'simples');
  insert into public.variacoes (produto_id, nome, preco_venda) select id, 'Única', 3 from public.produtos where nome = 'Único sabor F9';
  assert public.motivo_nao_excluir('variacao', (select v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Único sabor F9'))
    like 'É o único sabor do produto%', 'F9: o último sabor só sai com o produto';
  assert public.motivo_nao_excluir('produto', (select id from public.produtos where nome = 'Único sabor F9')) is null, 'F9: o produto com um sabor sem uso exclui';
  assert public.motivo_nao_excluir('insumo', gen_random_uuid()) = 'Insumo não encontrado.', 'F9: item inexistente';
end
$$;

-- Não logado e membro: sem poder de cadastro.
reset role;
set local role anon;
do $$
begin
  begin
    perform public.excluir_cadastro('insumo', gen_random_uuid());
    raise exception 'F9 falhou: anon excluiu';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cadastrar_insumo(gen_random_uuid(), 'Anon F9', 'ingrediente', 'g');
    raise exception 'F9 falhou: anon cadastrou';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
select 'fatia 9: todos os testes passaram' as resultado;
rollback;
