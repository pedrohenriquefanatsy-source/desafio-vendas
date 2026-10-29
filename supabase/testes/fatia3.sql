-- Testes da fatia 3 (compras, livro de estoque, produção, ajuste, perda, lista de compras).
-- Inclui os testes de aceite 3 (parte de custo e estoque), 4 e 5 da especificação.
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000003aa', 'f3-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000003bb', 'f3-membro@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000003cc', 'f3-inativo@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F3' where id = '00000000-0000-4000-8000-0000000003aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F3' where id = '00000000-0000-4000-8000-0000000003bb';
update public.perfis set papel = 'membro', ativo = false, nome = 'Inativo F3' where id = '00000000-0000-4000-8000-0000000003cc';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003aa"}';

-- Cadastro mínimo: massa que rende 10, com 500 g de farinha, 1 cx de leite condensado,
-- 4 ovos; cada unidade vai num pote.
insert into public.insumos (nome, tipo, unidade_base) values
  ('Farinha F3', 'ingrediente', 'g'),
  ('Leite condensado F3', 'ingrediente', 'g'),
  ('Ovos F3', 'ingrediente', 'und'),
  ('Pote F3', 'embalagem', 'und'),
  ('Açúcar F3', 'ingrediente', 'g');
insert into public.insumo_conversoes (insumo_id, unidade, quantidade_em_base)
select id, 'cx', 395 from public.insumos where nome = 'Leite condensado F3'
union all
select id, 'bandeja', 30 from public.insumos where nome = 'Ovos F3';
insert into public.receitas (nome, rendimento_unidades) values ('Massa F3', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, q.qtd, q.un
from public.receitas r
cross join (values ('Farinha F3', 500, 'g'), ('Leite condensado F3', 1, 'cx'), ('Ovos F3', 4, 'und')) q (nome, qtd, un)
join public.insumos i on i.nome = q.nome
where r.nome = 'Massa F3';
insert into public.produtos (nome, tipo) values ('Bolo F3', 'simples');
insert into public.variacoes (produto_id, preco_venda) select id, 8 from public.produtos where nome = 'Bolo F3';

create temporary table ids_f3 (chave text primary key, id uuid) on commit drop;
grant all on ids_f3 to authenticated;

do $$
declare
  v_farinha uuid := (select id from public.insumos where nome = 'Farinha F3');
  v_lc uuid := (select id from public.insumos where nome = 'Leite condensado F3');
  v_ovos uuid := (select id from public.insumos where nome = 'Ovos F3');
  v_pote uuid := (select id from public.insumos where nome = 'Pote F3');
  v_var uuid := (select v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F3');
  v_compra uuid;
  v_chave uuid := gen_random_uuid();
  v_caixa_antes numeric := (select coalesce(sum(valor), 0) from public.lancamentos_caixa);
begin
  update public.variacoes set receita_id = (select id from public.receitas where nome = 'Massa F3'), preco_venda = 8 where id = v_var;
  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade) values (v_var, v_pote, 1, 'und');
  insert into ids_f3 values ('var', v_var), ('farinha', v_farinha), ('lc', v_lc), ('ovos', v_ovos), ('pote', v_pote);

  -- E1: compra paga pelo caixa, em kg, cx, bandeja e und.
  v_compra := public.registrar_compra(v_chave, jsonb_build_array(
    jsonb_build_object('insumo_id', v_farinha, 'quantidade', 2, 'unidade', 'kg', 'valor', 12.00),
    jsonb_build_object('insumo_id', v_lc, 'quantidade', 3, 'unidade', 'cx', 'valor', 23.70),
    jsonb_build_object('insumo_id', v_ovos, 'quantidade', 1, 'unidade', 'bandeja', 'valor', 15.60),
    jsonb_build_object('insumo_id', v_pote, 'quantidade', 20, 'unidade', 'und', 'valor', 10.00)
  ), 'caixa', null, 'Atacadão', null);
  assert (select total from public.compras where id = v_compra) = 61.30, 'E1: total da compra = 12 + 23,70 + 15,60 + 10 = 61,30';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_farinha) = 2000, 'E1: 2 kg = 2000 g no estoque';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_lc) = 1185, 'E1: 3 cx = 1185 g';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_ovos) = 30, 'E1: 1 bandeja = 30 ovos';
  assert (select custo_atual from public.insumos where id = v_farinha) = 0.006, 'E1/D9: custo atual = preço da compra (R$ 6/kg)';
  assert (select custo_atual from public.insumos where id = v_lc) = 0.02, 'E1/D9: R$ 7,90 a caixa de 395 g = R$ 0,02/g';
  assert (select preco_referencia = 7.90 and unidade_referencia = 'cx' from public.insumos where id = v_lc), 'E1: preço de referência por caixa';
  assert (select origem = 'compra' and compra_id = v_compra from public.insumo_custos_historico
           where insumo_id = v_farinha order by id desc limit 1), 'E1: histórico registra a compra que mudou o preço';
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes - 61.30, 'E1: caixa cai R$ 61,30';

  -- E2: reenvio do mesmo formulário (mesma chave) não duplica nada.
  assert public.registrar_compra(v_chave, jsonb_build_array(
    jsonb_build_object('insumo_id', v_farinha, 'quantidade', 2, 'unidade', 'kg', 'valor', 12.00)), 'caixa') = v_compra,
    'E2: mesma chave devolve a mesma compra';
  assert (select count(*) from public.compras where chave_idempotencia = v_chave) = 1, 'E2: uma compra só';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_farinha) = 2000, 'E2: estoque não dobrou';
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes - 61.30, 'E2: caixa não caiu duas vezes';

  -- E3: erros de preenchimento com mensagem clara.
  begin
    perform public.registrar_compra(gen_random_uuid(), '[]'::jsonb, 'caixa');
    raise exception 'E3 falhou: aceitou compra sem itens';
  exception when raise_exception then
    assert sqlerrm like 'Adicione pelo menos um item%', 'E3: compra sem itens: ' || sqlerrm;
  end;
  begin
    perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
      jsonb_build_object('insumo_id', v_farinha, 'quantidade', 1, 'unidade', 'cx', 'valor', 5)), 'caixa');
    raise exception 'E3 falhou: aceitou unidade sem regra';
  exception when raise_exception then
    assert sqlerrm like 'Não sei converter "cx" de Farinha F3 para g.%', 'E3: unidade sem regra: ' || sqlerrm;
  end;
  begin
    perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
      jsonb_build_object('insumo_id', v_farinha, 'quantidade', 1, 'unidade', 'kg', 'valor', 5)), 'caixa',
      ((now() at time zone 'America/Fortaleza')::date + 1));
    raise exception 'E3 falhou: aceitou data futura';
  exception when raise_exception then
    assert sqlerrm like 'A data da compra não pode ser no futuro%', 'E3: data futura: ' || sqlerrm;
  end;
  insert into ids_f3 values ('compra_caixa', v_compra);
end
$$;

-- E4: compra paga do bolso do membro: estoque sobe, caixa não muda, fica "a reembolsar".
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003bb"}';
do $$
declare
  v_acucar uuid := (select id from public.insumos where nome = 'Açúcar F3');
  v_caixa_antes numeric := (select coalesce(sum(valor), 0) from public.lancamentos_caixa);
  v_compra uuid;
begin
  v_compra := public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', v_acucar, 'quantidade', 1, 'unidade', 'kg', 'valor', 4.80)), 'participante', null, null, 'Paguei no mercadinho');
  assert (select pago_por = 'participante' and participante_id = '00000000-0000-4000-8000-0000000003bb' and total = 4.80
            from public.compras where id = v_compra), 'E4: compra do bolso fica no nome de quem pagou';
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes, 'E4: caixa não muda';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_acucar) = 1000, 'E4: estoque sobe 1 kg';
  insert into ids_f3 values ('compra_bolso', v_compra);
end
$$;

-- E5: inativo não registra; ninguém grava no estoque ou no caixa sem as funções.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003cc"}';
do $$
begin
  begin
    perform public.registrar_compra(gen_random_uuid(), '[]'::jsonb, 'caixa');
    raise exception 'E5 falhou: inativo registrou compra';
  exception when raise_exception then
    assert sqlerrm like 'Faça login com um participante ativo%', 'E5: inativo: ' || sqlerrm;
  end;
  assert (select count(*) from public.movimentos_estoque) = 0, 'E5: inativo não lê o estoque';
end
$$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003bb"}';
do $$
begin
  begin
    insert into public.movimentos_estoque (insumo_id, tipo, quantidade_base) values ((select id from ids_f3 where chave = 'farinha'), 'ajuste', 1000);
    raise exception 'E5 falhou: gravou movimento direto';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.saldos_estoque set saldo = 99999;
    raise exception 'E5 falhou: alterou saldo direto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lancamentos_caixa (tipo, valor) values ('ajuste', 1000);
    raise exception 'E5 falhou: gravou no caixa direto';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.compras;
    raise exception 'E5 falhou: apagou compra';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- ── Teste de aceite 4: concluir produção ─────────────────────────────────────
-- 2 fornadas: 1000 g farinha, 790 g leite condensado (2 cx), 8 ovos e 18 potes (18 boas).
do $$
declare
  v_var uuid := (select id from ids_f3 where chave = 'var');
  v_farinha uuid := (select id from ids_f3 where chave = 'farinha');
  v_lc uuid := (select id from ids_f3 where chave = 'lc');
  v_ovos uuid := (select id from ids_f3 where chave = 'ovos');
  v_pote uuid := (select id from ids_f3 where chave = 'pote');
  v_chave uuid := gen_random_uuid();
  v_prod uuid;
  v_res jsonb;
  v_custo numeric;
begin
  v_prod := public.planejar_producao(v_chave, v_var, 2);
  assert public.planejar_producao(v_chave, v_var, 2) = v_prod, 'P1: reenvio do planejamento não duplica';
  assert (select unidades_previstas = 20 and situacao = 'planejada' from public.producoes where id = v_prod), 'P1: 2 fornadas × 10 = 20 previstas';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_farinha) = 2000, 'P1: planejar não mexe no estoque';

  v_res := public.concluir_producao(v_prod, 18, 2);
  assert (v_res ->> 'ok')::boolean, 'Aceite 4: produção concluída: ' || v_res::text;
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_farinha) = 1000, 'Aceite 4: farinha 2000 − 1000 = 1000 g';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_lc) = 395, 'Aceite 4: leite condensado 1185 − 790 = 395 g';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_ovos) = 22, 'Aceite 4: ovos 30 − 8 = 22';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_pote) = 2, 'Aceite 4: potes 20 − 18 (só as boas) = 2';
  assert (select saldo from public.v_estoque_produtos where variacao_id = v_var) = 18, 'Aceite 4: 18 bolos prontos no estoque';
  assert (select situacao = 'concluida' and unidades_produzidas = 18 and unidades_perdidas = 2 from public.producoes where id = v_prod),
    'Aceite 4: produção marcada como concluída com 18 boas e 2 perdidas';
  -- Custo da unidade = receita (500×0,006 + 395×0,02 + 4×0,52)/10 = (3 + 7,90 + 2,08)/10 = 1,298 + pote 0,50 = 1,798.
  v_custo := (select custo_unitario from public.movimentos_estoque where origem_id = v_prod and tipo = 'entrada_producao' and justificativa is null);
  assert v_custo = 1.798, 'Aceite 4: custo da unidade boa = 1,798, veio ' || v_custo;
  assert (select custo_unitario = 1.298 and quantidade_base = -2 from public.movimentos_estoque where origem_id = v_prod and tipo = 'perda'),
    'Aceite 4: perda de 2 unidades com o custo só da receita (1,298 cada)';
  -- Tudo saiu do mesmo envio: os movimentos da produção têm o mesmo instante (mesma transação).
  assert (select count(distinct criado_em) from public.movimentos_estoque where origem_id = v_prod) = 1, 'Aceite 4: tudo na mesma transação';
  assert (public.concluir_producao(v_prod, 18, 2) ->> 'ja_concluida')::boolean, 'P2: concluir de novo não baixa duas vezes';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_farinha) = 1000, 'P2: farinha continua 1000 g';
  insert into ids_f3 values ('prod1', v_prod);
end
$$;

-- ── Teste de aceite 5 (nova regra): estoque insuficiente avisa, mas conclui ──────
-- Como o estoque virou controle do dia a dia, faltar insumo não trava mais a produção: ela conclui, o saldo pode
-- ficar negativo e a resposta traz a lista do que faltava. O teste desfaz o que fez (a produção segue planejada).
do $$
declare
  v_var uuid := (select id from ids_f3 where chave = 'var');
  v_prod uuid;
  v_res jsonb;
  v_movs bigint := (select count(*) from public.movimentos_estoque);
  f jsonb;
begin
  v_prod := public.planejar_producao(gen_random_uuid(), v_var, 2);
  insert into ids_f3 values ('prod2', v_prod);
  begin
    v_res := public.concluir_producao(v_prod, 20, 0);
    assert (v_res ->> 'ok')::boolean, 'Aceite 5: a produção conclui mesmo faltando insumo';
    assert jsonb_array_length(v_res -> 'faltas') = 2, 'Aceite 5: avisa de 2 insumos em falta: ' || (v_res -> 'faltas')::text;
    select x into f from jsonb_array_elements(v_res -> 'faltas') x where x ->> 'insumo' = 'Leite condensado F3';
    assert (f ->> 'necessario')::numeric = 790 and (f ->> 'disponivel')::numeric = 395 and (f ->> 'falta')::numeric = 395 and f ->> 'unidade' = 'g',
      'Aceite 5: leite condensado: precisa 790 g, tem 395, falta 395: ' || f::text;
    select x into f from jsonb_array_elements(v_res -> 'faltas') x where x ->> 'insumo' = 'Pote F3';
    assert (f ->> 'falta')::numeric = 18, 'Aceite 5: faltam 18 potes: ' || f::text;
    assert (select count(*) from public.movimentos_estoque) > v_movs, 'Aceite 5: a produção foi gravada no estoque';
    assert (select saldo from public.saldos_estoque where insumo_id = (select id from ids_f3 where chave = 'pote')) = -18,
      'Aceite 5: o saldo do pote ficou negativo (−18), à vista na contagem';
    raise exception 'DESFAZER_TESTE';
  exception when others then
    if sqlerrm <> 'DESFAZER_TESTE' then raise; end if;
  end;
  assert (select count(*) from public.movimentos_estoque) = v_movs, 'Aceite 5: o teste desfez o que fez';
  assert (select situacao = 'planejada' from public.producoes where id = v_prod), 'Aceite 5: produção continua planejada';
end
$$;

-- Quanto dá para produzir e lista de compras.
do $$
declare
  v_var uuid := (select id from ids_f3 where chave = 'var');
  l record;
begin
  -- Farinha dá 2 fornadas, leite 1, ovos 5, potes 0 (2 potes não cobrem 10 unidades).
  assert (select fornadas_possiveis = 0 and insumo_limitante = 'Pote F3' from public.v_producao_possivel where variacao_id = v_var),
    'Q1: o pote limita: 0 fornadas';
  -- Lista de compras: a produção planejada (20 un.) precisa de 790 g de leite (tem 395) e 20 potes (tem 2).
  select * into l from public.v_lista_compras where nome = 'Leite condensado F3';
  assert l.falta = 395 and l.custo_estimado = 7.90, 'Q2: comprar 395 g de leite condensado (R$ 7,90)';
  select * into l from public.v_lista_compras where nome = 'Pote F3';
  assert l.falta = 18 and l.custo_estimado = 9.00, 'Q2: comprar 18 potes (R$ 9,00)';
  assert not exists (select 1 from public.v_lista_compras where nome = 'Farinha F3'), 'Q2: farinha basta (1000 g para 1000 g)';
  -- Estoque mínimo também entra na lista (definido pelo administrador logo abaixo).
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003aa"}', true);
  update public.insumos set estoque_minimo = 1500 where nome = 'Farinha F3';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003bb"}', true);
  assert (select falta from public.v_lista_compras where nome = 'Farinha F3') = 1500, 'Q3: com mínimo de 1500 g, comprar 1500 g de farinha';
  assert (select abaixo_minimo from public.v_estoque_insumos where nome = 'Farinha F3'), 'Q3: farinha abaixo do mínimo';
end
$$;

-- ── Teste de aceite 3 (parte de custo): o preço de um insumo muda ─────────────
do $$
declare
  v_var uuid := (select id from ids_f3 where chave = 'var');
  v_farinha uuid := (select id from ids_f3 where chave = 'farinha');
begin
  assert (select custo_unitario from public.v_custo_variacoes where variacao_id = v_var) = 1.798, 'Aceite 3: custo antes = 1,798';
  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', v_farinha, 'quantidade', 1, 'unidade', 'kg', 'valor', 8.00)), 'participante');
  assert (select custo_atual from public.insumos where id = v_farinha) = 0.008, 'Aceite 3: farinha a R$ 8/kg = 0,008/g';
  -- 500 g × 0,002 a mais = R$ 1,00 por fornada = R$ 0,10 por unidade.
  assert (select custo_unitario from public.v_custo_variacoes where variacao_id = v_var) = 1.898, 'Aceite 3: custo atual sobe para 1,898';
  assert (select custo_unitario from public.movimentos_estoque
           where origem_id = (select id from ids_f3 where chave = 'prod1') and tipo = 'entrada_producao' and justificativa is null) = 1.798,
    'Aceite 3: o que já foi produzido mantém o custo do momento (1,798)';
end
$$;

-- ── Ajuste e perda ───────────────────────────────────────────────────────────
do $$
declare
  v_var uuid := (select id from ids_f3 where chave = 'var');
  v_ovos uuid := (select id from ids_f3 where chave = 'ovos');
  v_chave uuid := gen_random_uuid();
begin
  begin
    perform public.ajustar_estoque(gen_random_uuid(), v_ovos, null, 20, '');
    raise exception 'A1 falhou: ajuste sem motivo';
  exception when raise_exception then
    assert sqlerrm like 'Diga o motivo do ajuste%', 'A1: ' || sqlerrm;
  end;
  assert public.ajustar_estoque(v_chave, v_ovos, null, 20, 'Contagem: 2 quebraram') = -2, 'A1: contou 20, sistema tinha 22: lança −2';
  assert public.ajustar_estoque(v_chave, v_ovos, null, 20, 'Contagem: 2 quebraram') = 0, 'A1: reenvio não lança de novo';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_ovos) = 20, 'A1: ovos = 20';
  assert (select justificativa from public.movimentos_estoque where origem_id = v_chave) = 'Contagem: 2 quebraram', 'A1: justificativa guardada';

  perform public.registrar_perda(gen_random_uuid(), null, v_var, 1, null, 'Caiu no chão');
  assert (select saldo from public.v_estoque_produtos where variacao_id = v_var) = 17, 'A2: perda de 1 bolo: 18 − 1 = 17';
  begin
    perform public.registrar_perda(gen_random_uuid(), null, v_var, 50, null, 'Teste');
    raise exception 'A2 falhou: perda maior que o estoque';
  exception when raise_exception then
    assert sqlerrm like 'A perda (50.000) é maior que o estoque registrado (17.000)%', 'A2: ' || sqlerrm;
  end;
  perform public.registrar_perda(gen_random_uuid(), v_ovos, null, 1, 'und', 'Quebrou');
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_ovos) = 19, 'A2: perda de insumo';
end
$$;

-- ── Cancelamentos ────────────────────────────────────────────────────────────
-- Prazo de 30 minutos (D11). A regra é interna; testada direto, como o membro.
reset role;
do $$
begin
  assert privado.pode_cancelar(auth.uid(), now() - interval '29 minutes'), 'X2: com 29 minutos o membro cancela o próprio';
  assert not privado.pode_cancelar(auth.uid(), now() - interval '31 minutes'), 'X2: com 31 minutos, não';
  assert not privado.pode_cancelar('00000000-0000-4000-8000-0000000003aa', now()), 'X2: membro não cancela o de outra pessoa';
end
$$;
set local role authenticated;
do $$
declare
  v_caixa_antes numeric := (select coalesce(sum(valor), 0) from public.lancamentos_caixa);
  v_acucar uuid := (select id from public.insumos where nome = 'Açúcar F3');
begin
  -- Membro não cancela compra do administrador.
  begin
    perform public.cancelar_compra((select id from ids_f3 where chave = 'compra_caixa'), 'Errei');
    raise exception 'X1 falhou: membro cancelou compra de outra pessoa';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador cancela%', 'X1: ' || sqlerrm;
  end;
  -- O próprio membro cancela a compra do bolso dentro do prazo: estoque volta, nada some.
  begin
    perform public.cancelar_compra((select id from ids_f3 where chave = 'compra_bolso'), '');
    raise exception 'X3 falhou: cancelou sem motivo';
  exception when raise_exception then
    assert sqlerrm like 'Diga o motivo%', 'X3: ' || sqlerrm;
  end;
  perform public.cancelar_compra((select id from ids_f3 where chave = 'compra_bolso'), 'Lancei em dobro');
  assert (select situacao = 'cancelada' and motivo_cancelamento = 'Lancei em dobro' from public.compras
           where id = (select id from ids_f3 where chave = 'compra_bolso')), 'X3: compra cancelada com motivo';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_acucar) = 0, 'X3: estoque do açúcar volta a 0';
  assert (select count(*) from public.movimentos_estoque where insumo_id = v_acucar) = 2, 'X3: histórico mantém entrada e estorno';
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes, 'X3: compra do bolso não mexe no caixa';
end
$$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003aa"}';
do $$
declare
  v_caixa_antes numeric := (select coalesce(sum(valor), 0) from public.lancamentos_caixa);
  v_pote uuid := (select id from ids_f3 where chave = 'pote');
  v_compra uuid;
begin
  -- Compra já usada na produção não pode ser desfeita.
  begin
    perform public.cancelar_compra((select id from ids_f3 where chave = 'compra_caixa'), 'Teste');
    raise exception 'X4 falhou: cancelou compra já usada';
  exception when raise_exception then
    assert sqlerrm like 'Parte de % já foi usada%', 'X4: ' || sqlerrm;
  end;
  -- Compra pelo caixa cancelada: o dinheiro volta ao caixa.
  v_compra := public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', v_pote, 'quantidade', 50, 'unidade', 'und', 'valor', 25.00)), 'caixa');
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes - 25, 'X5: caixa cai 25';
  perform public.cancelar_compra(v_compra, 'Fornecedor devolveu');
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes, 'X5: cancelamento devolve 25 ao caixa';
  assert (select saldo from public.v_estoque_insumos where insumo_id = v_pote) = 2, 'X5: potes voltam a 2';
  perform public.cancelar_compra(v_compra, 'De novo');
  assert (select coalesce(sum(valor), 0) from public.lancamentos_caixa) = v_caixa_antes, 'X5: cancelar duas vezes não devolve em dobro';

  -- Produção planejada pode ser cancelada; concluída não.
  perform public.cancelar_producao((select id from ids_f3 where chave = 'prod2'), 'Sem leite');
  assert (select situacao = 'cancelada' from public.producoes where id = (select id from ids_f3 where chave = 'prod2')), 'X6: planejada cancelada';
  assert not exists (select 1 from public.v_lista_compras where nome = 'Leite condensado F3'), 'X6: lista de compras não conta a cancelada';
  begin
    perform public.cancelar_producao((select id from ids_f3 where chave = 'prod1'), 'Teste');
    raise exception 'X6 falhou: cancelou produção concluída';
  exception when raise_exception then
    assert sqlerrm like 'Só produções planejadas%', 'X6: ' || sqlerrm;
  end;

  -- Conferência: o saldo de cada item é a soma do livro.
  assert not exists (
    select 1 from public.saldos_estoque s
    where s.saldo <> (select coalesce(sum(m.quantidade_base), 0) from public.movimentos_estoque m
                       where m.insumo_id is not distinct from s.insumo_id and m.variacao_id is not distinct from s.variacao_id)
  ), 'S1: saldo = soma das movimentações, para todos os itens';
  -- Auditoria registrou compras, produções e movimentos.
  assert (select count(*) from public.auditoria where tabela = 'compras') >= 4, 'S2: auditoria das compras';
  assert (select count(*) from public.auditoria where tabela = 'movimentos_estoque') >= 10, 'S2: auditoria dos movimentos';
end
$$;

-- Usuário não logado não lê nada.
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.movimentos_estoque limit 1;
    raise exception 'S3 falhou: anon leu o estoque';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.v_lista_compras limit 1;
    raise exception 'S3 falhou: anon leu a lista de compras';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
select 'fatia 3: todos os testes passaram' as resultado;
rollback;
