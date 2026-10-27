-- Testes da fatia 5 (despesas, reembolsos, aportes, ajuste de caixa, resultado).
-- Inclui os testes de aceite 10 e 11 da especificação.
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000005aa', 'f5-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000005bb', 'f5-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F5' where id = '00000000-0000-4000-8000-0000000005aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F5' where id = '00000000-0000-4000-8000-0000000005bb';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005aa"}';

create temporary table ids_f5 (chave text primary key, id uuid) on commit drop;
grant all on ids_f5 to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f5 where chave = p $$;
create function pg_temp.caixa() returns numeric language sql as $$ select saldo from public.v_saldo_caixa $$;
-- Resultado de hoje, somando todos os desafios (o teste mede diferenças).
create function pg_temp.resultado() returns numeric language sql as $$
  select coalesce(sum(resultado), 0) from public.v_resultado_diario where dia = (now() at time zone 'America/Fortaleza')::date $$;
create function pg_temp.devido(p uuid) returns numeric language sql as $$
  select coalesce((select devido from public.v_reembolsos_devidos where participante_id = p), 0) $$;

-- Produto de custo 1,00 (1000 g de farinha a 0,01/g rende 10), preço 5,00, com 10 prontos.
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F5', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F5', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F5' and i.nome = 'Farinha F5';
insert into public.produtos (nome, tipo) values ('Bolo F5', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F5' and r.nome = 'Massa F5';
insert into public.formas_pagamento (nome) values ('Pix F5');
insert into ids_f5
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F5'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F5'
union all select 'farinha', id from public.insumos where nome = 'Farinha F5'
union all select 'admin', '00000000-0000-4000-8000-0000000005aa'
union all select 'membro', '00000000-0000-4000-8000-0000000005bb';

do $$
begin
  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 1, 'unidade', 'kg', 'valor', 10)), 'caixa');
  perform public.concluir_producao(public.planejar_producao(gen_random_uuid(), pg_temp.id('bolo'), 1), 10, 0);
end
$$;

-- ── Resultado: margem das vendas − perdas − despesas ────────────────────────
do $$
declare
  v_res numeric := pg_temp.resultado();
  v_caixa numeric := pg_temp.caixa();
begin
  assert v_caixa is not null, 'R0: saldo de caixa existe';
  perform public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2)), pg_temp.id('pix'), null);
  assert pg_temp.resultado() = v_res + 8, 'R1: venda de 2 × (5,00 − 1,00) soma 8,00 ao resultado';
  assert pg_temp.caixa() = v_caixa + 10, 'R1: e 10,00 ao caixa';
  perform public.registrar_perda(gen_random_uuid(), null, pg_temp.id('bolo'), 1, null, 'Caiu no chão');
  assert pg_temp.resultado() = v_res + 7, 'R2: perda de 1 bolo (custo 1,00) tira 1,00 do resultado';
  assert pg_temp.caixa() = v_caixa + 10, 'R2: perda não mexe no caixa';
  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 1, 'unidade', 'kg', 'valor', 10)), 'caixa');
  assert pg_temp.resultado() = v_res + 7 and pg_temp.caixa() = v_caixa, 'R3: compra baixa o caixa e não entra no resultado';
end
$$;

-- ── Teste de aceite 10: despesa com reembolso ───────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005bb"}';
do $$
declare
  v_res numeric := pg_temp.resultado();
  v_caixa numeric := pg_temp.caixa();
  v_chave uuid := gen_random_uuid();
  v_id uuid;
begin
  v_id := public.registrar_despesa(v_chave, 15.00, 'Uber para a feira', 'Transporte', 'participante');
  assert public.registrar_despesa(v_chave, 15.00, 'Uber para a feira', 'Transporte', 'participante') = v_id, 'Aceite 10: reenvio não duplica';
  assert pg_temp.resultado() = v_res - 15, 'Aceite 10: o resultado reconhece o gasto (−15,00)';
  assert pg_temp.caixa() = v_caixa, 'Aceite 10: o caixa não cai (pagou do bolso)';
  assert pg_temp.devido(pg_temp.id('membro')) = 15, 'Aceite 10: o desafio deve 15,00 ao membro';
  insert into ids_f5 values ('uber', v_id);
  begin
    perform public.pagar_reembolso(gen_random_uuid(), pg_temp.id('membro'), 15);
    raise exception 'Aceite 10 falhou: membro pagou reembolso';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador registra reembolsos%', 'Aceite 10: ' || sqlerrm;
  end;
  begin
    perform public.registrar_despesa(gen_random_uuid(), 0, 'Nada', null, 'caixa');
    raise exception 'D1 falhou: despesa zero';
  exception when raise_exception then
    assert sqlerrm like 'Informe o valor da despesa%', 'D1: ' || sqlerrm;
  end;
  begin
    perform public.registrar_despesa(gen_random_uuid(), 5, '', null, 'caixa');
    raise exception 'D1 falhou: despesa sem descrição';
  exception when raise_exception then
    assert sqlerrm like 'Diga o que foi a despesa%', 'D1: ' || sqlerrm;
  end;
end
$$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005aa"}';
do $$
declare
  v_res numeric := pg_temp.resultado();
  v_caixa numeric := pg_temp.caixa();
  v_chave uuid := gen_random_uuid();
  v_id uuid;
begin
  begin
    perform public.pagar_reembolso(gen_random_uuid(), pg_temp.id('membro'), 20);
    raise exception 'Aceite 10 falhou: reembolsou mais que o devido';
  exception when raise_exception then
    assert sqlerrm like 'O reembolso (20.00) passa do que o desafio deve a essa pessoa (15.00)%', 'Aceite 10: ' || sqlerrm;
  end;
  v_id := public.pagar_reembolso(v_chave, pg_temp.id('membro'), 15);
  assert public.pagar_reembolso(v_chave, pg_temp.id('membro'), 15) = v_id, 'Aceite 10: reenvio do reembolso não duplica';
  assert pg_temp.caixa() = v_caixa - 15, 'Aceite 10: o caixa cai só no reembolso (−15,00)';
  assert pg_temp.resultado() = v_res, 'Aceite 10: o reembolso não mexe no resultado de novo';
  assert pg_temp.devido(pg_temp.id('membro')) = 0, 'Aceite 10: o saldo devido zera';
  insert into ids_f5 values ('reembolso', v_id);

  -- Despesa já reembolsada não pode ser cancelada antes do reembolso.
  begin
    perform public.cancelar_despesa(pg_temp.id('uber'), 'Errei');
    raise exception 'D2 falhou: cancelou despesa reembolsada';
  exception when raise_exception then
    assert sqlerrm like 'Esta despesa já foi reembolsada%', 'D2: ' || sqlerrm;
  end;
  perform public.cancelar_reembolso(v_id, 'Pix devolvido');
  assert pg_temp.caixa() = v_caixa and pg_temp.devido(pg_temp.id('membro')) = 15, 'D2: cancelar o reembolso devolve o caixa e a dívida';
  perform public.cancelar_despesa(pg_temp.id('uber'), 'Errei');
  assert pg_temp.devido(pg_temp.id('membro')) = 0 and pg_temp.resultado() = v_res + 15, 'D2: despesa cancelada sai do resultado e da dívida';

  -- Despesa paga pelo caixa: cai na hora; cancelada, volta.
  v_id := public.registrar_despesa(gen_random_uuid(), 10, 'Adesivos', 'Divulgação', 'caixa');
  assert pg_temp.caixa() = v_caixa - 10 and pg_temp.resultado() = v_res + 5, 'D3: despesa pelo caixa: caixa −10, resultado −10';
  perform public.cancelar_despesa(v_id, 'Lancei em dobro');
  perform public.cancelar_despesa(v_id, 'De novo');
  assert pg_temp.caixa() = v_caixa and pg_temp.resultado() = v_res + 15, 'D3: cancelada volta tudo, uma vez só';

  -- Compra do bolso reembolsada não pode ser cancelada antes do reembolso.
  set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005bb"}';
  v_id := public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 100, 'unidade', 'g', 'valor', 2)), 'participante');
  set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005aa"}';
  perform public.pagar_reembolso(gen_random_uuid(), pg_temp.id('membro'), 2);
  begin
    perform public.cancelar_compra(v_id, 'Teste');
    raise exception 'D4 falhou: cancelou compra reembolsada';
  exception when raise_exception then
    assert sqlerrm like 'Esta compra já foi reembolsada%', 'D4: ' || sqlerrm;
  end;
end
$$;

-- ── Teste de aceite 11: aporte ──────────────────────────────────────────────
do $$
declare
  v_res numeric := pg_temp.resultado();
  v_caixa numeric := pg_temp.caixa();
  v_chave uuid := gen_random_uuid();
  v_id uuid;
begin
  v_id := public.registrar_aporte(v_chave, 'pj', null, 100, 'Troco inicial');
  assert public.registrar_aporte(v_chave, 'pj', null, 100, 'Troco inicial') = v_id, 'Aceite 11: reenvio não duplica';
  assert pg_temp.caixa() = v_caixa + 100, 'Aceite 11: o caixa sobe 100,00';
  assert pg_temp.resultado() = v_res, 'Aceite 11: o resultado não muda';
  begin
    perform public.registrar_aporte(gen_random_uuid(), 'participante', null, 50);
    raise exception 'Aceite 11 falhou: aporte sem participante';
  exception when raise_exception then
    assert sqlerrm like 'Escolha quem fez o aporte%', 'Aceite 11: ' || sqlerrm;
  end;
  perform public.registrar_aporte(gen_random_uuid(), 'participante', pg_temp.id('membro'), 50);
  assert pg_temp.caixa() = v_caixa + 150 and pg_temp.resultado() = v_res, 'Aceite 11: aporte de participante também';
  perform public.cancelar_aporte(v_id, 'Lançado errado');
  assert pg_temp.caixa() = v_caixa + 50, 'Aceite 11: aporte cancelado sai do caixa';

  -- Ajuste de caixa: contou 5,00 a mais.
  v_caixa := pg_temp.caixa();
  v_chave := gen_random_uuid();
  assert public.ajustar_caixa(v_chave, v_caixa + 5, 'Conferência com o extrato') = 5, 'A1: lança a diferença +5,00';
  assert public.ajustar_caixa(v_chave, v_caixa + 5, 'Conferência com o extrato') = 0, 'A1: reenvio não repete';
  assert pg_temp.caixa() = v_caixa + 5 and pg_temp.resultado() = v_res, 'A1: ajuste mexe no caixa, não no resultado';
  assert (select saldo_apos from public.v_fluxo_caixa order by id desc limit 1) = pg_temp.caixa(), 'A2: livro de caixa termina no saldo';
end
$$;

-- ── Permissões ───────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005bb"}';
do $$
begin
  begin
    perform public.registrar_aporte(gen_random_uuid(), 'pj', null, 10);
    raise exception 'P1 falhou: membro fez aporte';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador registra aportes%', 'P1: ' || sqlerrm;
  end;
  begin
    perform public.ajustar_caixa(gen_random_uuid(), 0, 'Teste');
    raise exception 'P1 falhou: membro ajustou o caixa';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador ajusta o caixa%', 'P1: ' || sqlerrm;
  end;
  begin
    insert into public.despesas (descricao, valor, pago_por, chave_idempotencia) values ('Direto', 1, 'caixa', gen_random_uuid());
    raise exception 'P2 falhou: gravou despesa direto';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.reembolsos set valor = 1;
    raise exception 'P2 falhou: alterou reembolso direto';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
set local role anon;
do $$
begin
  perform 1 from public.v_resultado_diario limit 1;
  raise exception 'P3 falhou: anon leu o resultado';
exception when insufficient_privilege then null;
end
$$;

reset role;
select 'fatia 5: todos os testes passaram' as resultado;
rollback;
