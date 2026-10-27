-- Testes da fatia 2 (insumos, conversões, receitas, produtos, kits, custeio).
-- Inclui os testes de aceite 1 e 2 da especificação (Seção 10).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

-- Participantes de teste: A administrador, B membro (definidos direto, sem depender
-- de quem já existe no banco).
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000002aa', 'f2-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000002bb', 'f2-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F2' where id = '00000000-0000-4000-8000-0000000002aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F2' where id = '00000000-0000-4000-8000-0000000002bb';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002aa"}';

-- ── Teste de aceite 1: receita com insumos em g, kg, cx e und ─────────────────
insert into public.insumos (nome, tipo, unidade_base) values
  ('Farinha F2', 'ingrediente', 'g'),
  ('Leite condensado F2', 'ingrediente', 'g'),
  ('Ovos F2', 'ingrediente', 'und'),
  ('Açúcar F2', 'ingrediente', 'g');
insert into public.insumo_conversoes (insumo_id, unidade, quantidade_em_base)
select id, 'cx', 395 from public.insumos where nome = 'Leite condensado F2'
union all
select id, 'bandeja', 30 from public.insumos where nome = 'Ovos F2';

do $$
declare
  v_farinha uuid := (select id from public.insumos where nome = 'Farinha F2');
  v_lc uuid := (select id from public.insumos where nome = 'Leite condensado F2');
  v_ovos uuid := (select id from public.insumos where nome = 'Ovos F2');
  v_acucar uuid := (select id from public.insumos where nome = 'Açúcar F2');
  v_receita uuid;
begin
  -- Preço como se compra: por kg, por caixa, por bandeja.
  perform public.definir_custo_insumo(v_farinha, 6.00, 'kg');
  perform public.definir_custo_insumo(v_lc, 7.90, 'cx');
  perform public.definir_custo_insumo(v_ovos, 15.60, 'bandeja');
  perform public.definir_custo_insumo(v_acucar, 4.80, 'KG');
  assert (select custo_atual from public.insumos where id = v_farinha) = 0.006, 'C1: R$ 6,00/kg = R$ 0,006/g';
  assert (select custo_atual from public.insumos where id = v_lc) = 0.02, 'C1: R$ 7,90/cx de 395 g = R$ 0,02/g';
  assert (select custo_atual from public.insumos where id = v_ovos) = 0.52, 'C1: R$ 15,60/bandeja de 30 = R$ 0,52/und';
  assert (select custo_atual = 0.0048 and unidade_referencia = 'kg' from public.insumos where id = v_acucar), 'C1: unidade em maiúscula é aceita';

  insert into public.receitas (nome, rendimento_unidades) values ('Massa F2', 24) returning id into v_receita;
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade) values
    (v_receita, v_farinha, 0.4, 'kg'),    -- 400 g × 0,006 = 2,40
    (v_receita, v_lc, 1.17, 'cx'),        -- 462,15 g × 0,02 = 9,243
    (v_receita, v_ovos, 6, 'und'),        -- 6 × 0,52 = 3,12
    (v_receita, v_acucar, 550, 'g');      -- 550 × 0,0048 = 2,64
  assert (select custo_receita from public.v_custo_receitas where receita_id = v_receita) = 17.403,
    'Aceite 1: custo da receita = 2,40 + 9,243 + 3,12 + 2,64 = 17,403';
  assert (select custo_por_unidade from public.v_custo_receitas where receita_id = v_receita) = 0.725125,
    'Aceite 1: custo por unidade = 17,403 ÷ 24 = 0,725125';
  assert (select quantidade_base from public.v_custo_receita_itens where receita_id = v_receita and insumo_id = v_lc) = 462.15,
    'Aceite 1: 1,17 cx = 462,15 g';

  -- Unidade sem regra e massa → volume são recusadas com mensagem que diz como resolver.
  begin
    insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade) values (v_receita, v_farinha, 1, 'cx');
    raise exception 'C2: aceitou cx sem conversão';
  exception when raise_exception then
    if sqlerrm not like '%Cadastre em Insumos → Farinha F2 → Conversões%' then raise; end if;
  end;
  begin
    update public.receita_itens set unidade = 'ml' where receita_id = v_receita and insumo_id = v_farinha;
    raise exception 'C3: converteu massa em volume';
  exception when raise_exception then
    if sqlerrm not like 'Não sei converter "ml"%' then raise; end if;
  end;
  begin
    insert into public.insumo_conversoes (insumo_id, unidade, quantidade_em_base) values (v_lc, 'kg', 1000);
    raise exception 'C4: aceitou conversão para unidade padrão';
  exception when raise_exception then null;
  end;
  begin
    delete from public.insumo_conversoes where insumo_id = v_lc and unidade = 'cx';
    raise exception 'C5: apagou conversão em uso';
  exception when raise_exception then
    if sqlerrm not like '%está em uso%' then raise; end if;
  end;

  -- Teste de aceite 3 (parte de custo): mudar o preço muda o custo atual e fica no histórico.
  perform public.definir_custo_insumo(v_farinha, 7.20, 'kg');
  assert (select custo_receita from public.v_custo_receitas where receita_id = v_receita) = 17.883,
    'Aceite 3: farinha a R$ 7,20/kg → custo da receita 17,403 + 400 × 0,0012 = 17,883';
  assert (select count(*) from public.insumo_custos_historico where insumo_id = v_farinha) = 2,
    'C6: histórico guarda os dois preços da farinha';
  -- Mudar a conversão (caixa de 395 g para 400 g) recalcula tudo.
  update public.insumo_conversoes set quantidade_em_base = 400 where insumo_id = v_lc and unidade = 'cx';
  assert (select quantidade_base from public.v_custo_receita_itens where receita_id = v_receita and insumo_id = v_lc) = 468,
    'C7: com caixa de 400 g, 1,17 cx = 468 g';

  -- Insumo sem preço: custo fica vazio (nunca um custo menor que o real).
  insert into public.insumos (nome, unidade_base) values ('Sem preço F2', 'g');
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
  select v_receita, id, 10, 'g' from public.insumos where nome = 'Sem preço F2';
  assert (select custo_receita is null and insumos_sem_preco = 'Sem preço F2' from public.v_custo_receitas where receita_id = v_receita),
    'C8: receita com insumo sem preço não mostra custo e diz qual falta';
end $$;

-- ── Teste de aceite 2: os 5 produtos da planilha Cakenoura ────────────────────
-- Custos por unidade da aba Custeio. Cada "porção" é 1 und de insumo com o custo da planilha.
insert into public.insumos (nome, tipo, unidade_base) values
  ('Ovos (porção) F2', 'ingrediente', 'und'), ('Óleo (porção) F2', 'ingrediente', 'und'),
  ('Açúcar (porção) F2', 'ingrediente', 'und'), ('Farinha (porção) F2', 'ingrediente', 'und'),
  ('Cenoura (porção) F2', 'ingrediente', 'und'), ('Chocolate em pó (porção) F2', 'ingrediente', 'und'),
  ('Creme de leite (porção) F2', 'ingrediente', 'und'), ('Leite condensado (porção) F2', 'ingrediente', 'und'),
  ('Margarina (porção) F2', 'ingrediente', 'und'), ('Nutella (porção) F2', 'ingrediente', 'und'),
  ('Embalagem bolo F2', 'embalagem', 'und'), ('Pote piscininha F2', 'embalagem', 'und');

do $$
declare
  r record;
  v_choc uuid;
  v_nut uuid;
  v_classico uuid;
  v_avela uuid;
  v_pisc uuid;
  v_pisc_choc uuid;
  v_pisc_nut uuid;
  v_casadinha_prod uuid;
  v_casadinha uuid;
begin
  for r in select * from (values
    ('Ovos (porção) F2', 0.13), ('Óleo (porção) F2', 0.12), ('Açúcar (porção) F2', 0.11),
    ('Farinha (porção) F2', 0.10), ('Cenoura (porção) F2', 0.14), ('Chocolate em pó (porção) F2', 0.12),
    ('Creme de leite (porção) F2', 0.17), ('Leite condensado (porção) F2', 0.46), ('Margarina (porção) F2', 0.02),
    ('Nutella (porção) F2', 1.64), ('Embalagem bolo F2', 0.08), ('Pote piscininha F2', 0.71)) as t(nome, preco) loop
    perform public.definir_custo_insumo((select id from public.insumos where nome = r.nome), r.preco, 'und');
  end loop;

  insert into public.receitas (nome, rendimento_unidades) values ('Bolo chocolate F2', 1) returning id into v_choc;
  insert into public.receitas (nome, rendimento_unidades) values ('Bolo Nutella F2', 1) returning id into v_nut;
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
  select v_choc, id, 1, 'und' from public.insumos where nome in ('Ovos (porção) F2', 'Óleo (porção) F2', 'Açúcar (porção) F2',
    'Farinha (porção) F2', 'Cenoura (porção) F2', 'Chocolate em pó (porção) F2', 'Creme de leite (porção) F2',
    'Leite condensado (porção) F2', 'Margarina (porção) F2');
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
  select v_nut, id, 1, 'und' from public.insumos where nome in ('Ovos (porção) F2', 'Óleo (porção) F2', 'Açúcar (porção) F2',
    'Farinha (porção) F2', 'Cenoura (porção) F2', 'Nutella (porção) F2');

  insert into public.produtos (nome, tipo) values ('Clássico F2', 'simples'), ('Avelã F2', 'simples'),
    ('Piscininha F2', 'simples'), ('Casadinha F2', 'kit');
  insert into public.variacoes (produto_id, receita_id, preco_venda)
    select id, v_choc, 6.50 from public.produtos where nome = 'Clássico F2' returning id into v_classico;
  insert into public.variacoes (produto_id, receita_id, preco_venda)
    select id, v_nut, 7.50 from public.produtos where nome = 'Avelã F2' returning id into v_avela;
  v_pisc := (select id from public.produtos where nome = 'Piscininha F2');
  insert into public.variacoes (produto_id, nome, receita_id, preco_venda) values (v_pisc, 'Chocolate', v_choc, 8.00) returning id into v_pisc_choc;
  insert into public.variacoes (produto_id, nome, receita_id, preco_venda) values (v_pisc, 'Nutella', v_nut, 8.00) returning id into v_pisc_nut;
  v_casadinha_prod := (select id from public.produtos where nome = 'Casadinha F2');
  insert into public.variacoes (produto_id, preco_venda) values (v_casadinha_prod, 12.00) returning id into v_casadinha;

  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade)
  select v, (select id from public.insumos where nome = 'Embalagem bolo F2'), 1, 'und' from unnest(array[v_classico, v_avela]) v
  union all
  select v, (select id from public.insumos where nome = 'Pote piscininha F2'), 1, 'und' from unnest(array[v_pisc_choc, v_pisc_nut]) v;
  insert into public.kit_componentes (kit_variacao_id, componente_variacao_id, quantidade) values
    (v_casadinha, v_classico, 1), (v_casadinha, v_avela, 1);

  -- Custo, MC e markup conferidos com as abas Custeio e Indicadores.
  assert (select round(custo_unitario, 2) = 1.45 and round(mc_unitaria, 2) = 5.05 and round(markup, 2) = 4.48 and round(mc_percentual, 4) = 0.7769
            from public.v_custo_variacoes where variacao_id = v_classico), 'Aceite 2: Clássico 1,45 / MC 5,05 / markup 4,48 / MC 77,69%';
  assert (select round(custo_unitario, 2) = 2.32 and round(mc_unitaria, 2) = 5.18 and round(markup, 2) = 3.23
            from public.v_custo_variacoes where variacao_id = v_avela), 'Aceite 2: Avelã 2,32 / MC 5,18 / markup 3,23';
  assert (select round(custo_unitario, 2) = 2.08 and round(mc_unitaria, 2) = 5.92 and round(markup, 2) = 3.85
            from public.v_custo_variacoes where variacao_id = v_pisc_choc), 'Aceite 2: Piscininha chocolate 2,08 / MC 5,92 / markup 3,85';
  assert (select round(custo_unitario, 2) = 2.95 and round(mc_unitaria, 2) = 5.05 and round(markup, 2) = 2.71
            from public.v_custo_variacoes where variacao_id = v_pisc_nut), 'Aceite 2: Piscininha Nutella 2,95 / MC 5,05 / markup 2,71';
  assert (select round(custo_unitario, 2) = 3.77 and round(mc_unitaria, 2) = 8.23 and round(markup, 2) = 3.18
            from public.v_custo_variacoes where variacao_id = v_casadinha), 'Aceite 2: Casadinha (kit) 3,77 / MC 8,23 / markup 3,18';

  -- Taxa da forma de pagamento entra na MC.
  insert into public.formas_pagamento (nome, taxa_percentual, ordem) values ('Cartão F2', 3.99, 99);
  assert (select mc_unitaria from public.v_margem_formas where variacao_id = v_classico and forma_pagamento = 'Pix') = 5.05,
    'C9: no Pix (0%) a MC do Clássico continua 5,05';
  assert (select round(mc_unitaria, 5) from public.v_margem_formas where variacao_id = v_classico and forma_pagamento = 'Cartão F2') = 4.79065,
    'C9: no cartão (3,99%) a MC do Clássico é 5,05 − 0,25935 = 4,79065';

  -- Kit: regras de estrutura.
  begin
    update public.variacoes set receita_id = v_choc where id = v_casadinha;
    raise exception 'C10: kit aceitou receita';
  exception when raise_exception then
    if sqlerrm not like 'Kit não tem receita%' then raise; end if;
  end;
  begin
    insert into public.kit_componentes (kit_variacao_id, componente_variacao_id, quantidade) values (v_classico, v_avela, 1);
    raise exception 'C11: produto simples aceitou componente';
  exception when raise_exception then
    if sqlerrm not like 'Só produtos do tipo kit%' then raise; end if;
  end;
  begin
    insert into public.produtos (nome, tipo) values ('Kit duplo F2', 'kit');
    insert into public.variacoes (produto_id, preco_venda) select id, 20 from public.produtos where nome = 'Kit duplo F2';
    insert into public.kit_componentes (kit_variacao_id, componente_variacao_id, quantidade)
    select v.id, v_casadinha, 1 from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Kit duplo F2';
    raise exception 'C12: kit aceitou outro kit como componente';
  exception when raise_exception then
    if sqlerrm not like 'Um kit não pode conter outro kit%' then raise; end if;
  end;

  -- Mudar o preço de venda muda a MC; fica na auditoria.
  update public.variacoes set preco_venda = 7.00 where id = v_classico;
  assert (select mc_unitaria from public.v_custo_variacoes where variacao_id = v_classico) = 5.55, 'C13: Clássico a R$ 7,00 → MC 5,55';
  assert (select count(*) from public.auditoria where tabela = 'variacoes' and registro_id = v_classico::text and acao = 'alteracao'
           and (antes ->> 'preco_venda')::numeric = 6.50 and (depois ->> 'preco_venda')::numeric = 7.00) = 1,
    'C13: auditoria guarda o preço anterior e o novo';
end $$;
reset role;

-- ── Membro: vê os custos, não altera cadastro nem preço ───────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002bb"}';
do $$
begin
  assert (select count(*) from public.v_custo_variacoes where produto like '%F2') >= 5, 'P1: membro vê os custos';
  begin
    insert into public.insumos (nome, unidade_base) values ('Do membro F2', 'g');
    raise exception 'P2: membro criou insumo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.definir_custo_insumo((select id from public.insumos where nome = 'Farinha F2'), 1, 'kg');
    raise exception 'P3: membro mudou preço de insumo';
  exception when raise_exception then
    if sqlerrm not like 'Só o administrador%' then raise; end if;
  end;
  begin
    update public.insumos set custo_atual = 0 where nome = 'Farinha F2';
    raise exception 'P4: alterou custo direto na tabela';
  exception when insufficient_privilege then null;
  end;
  update public.variacoes set preco_venda = 0.01 where preco_venda = 7.50;
  -- A RLS esconde as linhas do membro: o comando roda, mas não apaga nada (conferido abaixo).
  delete from public.receita_itens ri using public.receitas r where r.id = ri.receita_id and r.nome like '%F2';
end $$;
reset role;
do $$
begin
  assert (select preco_venda = 7.50 from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Avelã F2'),
    'P5: membro não alterou o preço de venda';
  assert (select count(*) from public.receita_itens ri join public.receitas r on r.id = ri.receita_id where r.nome like '%F2') = 20,
    'P6: itens de receita intactos';
end $$;

-- Admin também não muda o custo direto, nem o tipo do produto, nem a unidade base.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002aa"}';
do $$
begin
  begin
    update public.insumos set custo_atual = 0 where nome = 'Farinha F2';
    raise exception 'P7: admin alterou custo sem passar pela função';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.produtos set tipo = 'kit' where nome = 'Clássico F2';
    raise exception 'P8: tipo do produto mudou';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.insumos set unidade_base = 'ml' where nome = 'Farinha F2';
    raise exception 'P9: unidade base mudou';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Usuário não logado não lê nada.
set local role anon;
do $$
begin
  begin perform 1 from public.insumos; raise exception 'P10: anon leu insumos'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.v_custo_variacoes; raise exception 'P10: anon leu custos'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'FATIA 2: TODOS OS TESTES PASSARAM' as resultado;
rollback;
