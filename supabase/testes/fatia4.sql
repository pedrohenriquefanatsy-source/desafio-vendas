-- Testes da fatia 4 (vendas, kits, recebimentos, encomendas, doações, cancelamento).
-- Inclui os testes de aceite 3 (vendas passadas não mudam), 6, 7, 8, 9, 12 e 14.
-- (O 15, concorrência, roda à parte com duas sessões: ver docs/testes.md.)
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000004aa', 'f4-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000004bb', 'f4-membro@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000004cc', 'f4-membro2@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F4' where id = '00000000-0000-4000-8000-0000000004aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F4' where id = '00000000-0000-4000-8000-0000000004bb';
update public.perfis set papel = 'membro', ativo = true, nome = 'Outro F4' where id = '00000000-0000-4000-8000-0000000004cc';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000004aa"}';

-- Cadastro: Clássico (custo 1,50), Avelã (2,50) e Casadinha = 1 Clássico + 1 Avelã + caixa (5,00).
insert into public.insumos (nome, tipo, unidade_base) values
  ('Farinha F4', 'ingrediente', 'g'), ('Creme F4', 'ingrediente', 'g'),
  ('Pote F4', 'embalagem', 'und'), ('Caixa F4', 'embalagem', 'und');
insert into public.receitas (nome, rendimento_unidades) values ('Massa clássica F4', 10), ('Massa avelã F4', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, q.qtd, 'g'
from (values ('Massa clássica F4', 'Farinha F4', 1000), ('Massa avelã F4', 'Farinha F4', 1000), ('Massa avelã F4', 'Creme F4', 500)) q (receita, insumo, qtd)
join public.receitas r on r.nome = q.receita join public.insumos i on i.nome = q.insumo;
insert into public.produtos (nome, tipo) values ('Clássico F4', 'simples'), ('Avelã F4', 'simples'), ('Casadinha F4', 'kit');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, q.preco, (select id from public.receitas where nome = q.receita)
from (values ('Clássico F4', 6.50, 'Massa clássica F4'), ('Avelã F4', 7.50, 'Massa avelã F4'), ('Casadinha F4', 12.00, null)) q (produto, preco, receita)
join public.produtos p on p.nome = q.produto;
insert into public.formas_pagamento (nome, taxa_percentual) values ('Pix F4', 0), ('Cartão F4', 4);

create temporary table ids_f4 (chave text primary key, id uuid) on commit drop;
grant all on ids_f4 to authenticated;
insert into ids_f4
select 'classico', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Clássico F4'
union all select 'avela', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Avelã F4'
union all select 'casadinha', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Casadinha F4'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F4'
union all select 'cartao', id from public.formas_pagamento where nome = 'Cartão F4'
union all select 'caixa_kit', id from public.insumos where nome = 'Caixa F4'
union all select 'farinha', id from public.insumos where nome = 'Farinha F4';

create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f4 where chave = p $$;
create function pg_temp.saldo(p text) returns numeric language sql as $$
  select coalesce((select saldo from public.saldos_estoque where variacao_id = pg_temp.id(p) or insumo_id = pg_temp.id(p)), 0) $$;
create function pg_temp.caixa() returns numeric language sql as $$ select coalesce(sum(valor), 0) from public.lancamentos_caixa $$;
create function pg_temp.itens(variadic p jsonb[]) returns jsonb language sql as $$ select to_jsonb(p) $$;
create function pg_temp.item(p text, q numeric) returns jsonb language sql as $$
  select jsonb_build_object('variacao_id', pg_temp.id(p), 'quantidade', q) $$;

do $$
declare
  v_res jsonb;
begin
  insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade)
  values (pg_temp.id('classico'), (select id from public.insumos where nome = 'Pote F4'), 1, 'und'),
         (pg_temp.id('avela'), (select id from public.insumos where nome = 'Pote F4'), 1, 'und'),
         (pg_temp.id('casadinha'), pg_temp.id('caixa_kit'), 1, 'und');
  insert into public.kit_componentes (kit_variacao_id, componente_variacao_id, quantidade)
  values (pg_temp.id('casadinha'), pg_temp.id('classico'), 1), (pg_temp.id('casadinha'), pg_temp.id('avela'), 1);

  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 3, 'unidade', 'kg', 'valor', 30),
    jsonb_build_object('insumo_id', (select id from public.insumos where nome = 'Creme F4'), 'quantidade', 500, 'unidade', 'g', 'valor', 10),
    jsonb_build_object('insumo_id', (select id from public.insumos where nome = 'Pote F4'), 'quantidade', 20, 'unidade', 'und', 'valor', 10),
    jsonb_build_object('insumo_id', pg_temp.id('caixa_kit'), 'quantidade', 5, 'unidade', 'und', 'valor', 5)), 'participante');
  assert (select custo_unitario from public.v_custo_variacoes where variacao_id = pg_temp.id('classico')) = 1.5, 'Prep: clássico 1,50';
  assert (select custo_unitario from public.v_custo_variacoes where variacao_id = pg_temp.id('avela')) = 2.5, 'Prep: avelã 2,50';
  assert (select custo_unitario from public.v_custo_variacoes where variacao_id = pg_temp.id('casadinha')) = 5, 'Prep: casadinha 5,00';
  v_res := public.concluir_producao(public.planejar_producao(gen_random_uuid(), pg_temp.id('classico'), 1), 10, 0);
  assert (v_res ->> 'ok')::boolean, 'Prep: produção clássico ' || v_res::text;
  v_res := public.concluir_producao(public.planejar_producao(gen_random_uuid(), pg_temp.id('avela'), 1), 10, 0);
  assert (v_res ->> 'ok')::boolean, 'Prep: produção avelã ' || v_res::text;
  assert pg_temp.saldo('classico') = 10 and pg_temp.saldo('avela') = 10, 'Prep: 10 de cada';
  -- A grade mostra quantos kits os componentes formam (10); a caixa do kit é conferida na venda.
  assert (select estoque from public.v_produtos_venda where variacao_id = pg_temp.id('casadinha')) = 10, 'Prep: 10 casadinhas possíveis';
end
$$;

-- ── Teste de aceite 6: venda com vários itens e kit ──────────────────────────
-- 2 Clássico (13,00) + 1 Casadinha (12,00) = 25,00; desconto 1,00 → 24,00 no Pix, paga.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000004bb"}';
do $$
declare
  v_res jsonb;
  v_id uuid;
  v_caixa numeric := pg_temp.caixa();
  v_chave uuid := gen_random_uuid();
begin
  v_res := public.registrar_venda(v_chave, 'venda', pg_temp.itens(pg_temp.item('classico', 2), pg_temp.item('casadinha', 1)),
                                  pg_temp.id('pix'), 24.00, 1.00, 'Ana', null, null, false);
  assert (v_res ->> 'ok')::boolean, 'Aceite 6: ' || v_res::text;
  v_id := (v_res ->> 'venda_id')::uuid;
  assert (select subtotal = 25 and desconto = 1 and total = 24 and recebido = 24 and situacao_pagamento = 'paga' from public.vendas where id = v_id),
    'Aceite 6: subtotal 25, desconto 1, total 24, paga';
  assert (select desconto_rateado from public.venda_itens where venda_id = v_id and variacao_id = pg_temp.id('classico')) = 0.52,
    'Aceite 6: desconto rateado no clássico = 1 × 13/25 = 0,52';
  assert (select desconto_rateado from public.venda_itens where venda_id = v_id and variacao_id = pg_temp.id('casadinha')) = 0.48,
    'Aceite 6: no kit, o resto = 0,48';
  assert pg_temp.saldo('classico') = 7, 'Aceite 6: clássico 10 − 2 − 1 (do kit) = 7';
  assert pg_temp.saldo('avela') = 9, 'Aceite 6: avelã 10 − 1 (do kit) = 9';
  assert pg_temp.saldo('caixa_kit') = 4, 'Aceite 6: caixa do kit 5 − 1 = 4 (embalagem do kit sai na venda)';
  assert not exists (select 1 from public.saldos_estoque where variacao_id = pg_temp.id('casadinha') and saldo <> 0),
    'Aceite 6: o kit não tem estoque próprio';
  -- MC: clássico 12,48 − 2 × 1,50 = 9,48; casadinha 11,52 − 5,00 = 6,52; total 16,00.
  assert (select margem_contribuicao from public.venda_itens where venda_id = v_id and variacao_id = pg_temp.id('classico')) = 9.48, 'Aceite 6: MC clássico 9,48';
  assert (select margem_contribuicao from public.venda_itens where venda_id = v_id and variacao_id = pg_temp.id('casadinha')) = 6.52, 'Aceite 6: MC casadinha 6,52';
  assert (select margem_total from public.v_vendas where id = v_id) = 16.00, 'Aceite 6: MC da venda 16,00';
  assert (select itens_resumo from public.v_vendas where id = v_id) = '2× Clássico F4, 1× Casadinha F4', 'Aceite 6: resumo dos itens';
  assert pg_temp.caixa() = v_caixa + 24, 'Aceite 6: caixa +24,00';

  -- Aceite 14: o mesmo envio de novo (duplo toque ou reenvio depois de falha) → uma venda só.
  v_res := public.registrar_venda(v_chave, 'venda', pg_temp.itens(pg_temp.item('classico', 2), pg_temp.item('casadinha', 1)),
                                  pg_temp.id('pix'), 24.00, 1.00, 'Ana', null, null, false);
  assert (v_res ->> 'repetida')::boolean and (v_res ->> 'venda_id')::uuid = v_id, 'Aceite 14: reenvio devolve a mesma venda';
  assert (select count(*) from public.vendas where chave_idempotencia = v_chave) = 1, 'Aceite 14: uma venda só';
  assert pg_temp.saldo('classico') = 7 and pg_temp.caixa() = v_caixa + 24, 'Aceite 14: estoque e caixa não dobraram';
  insert into ids_f4 values ('venda6', v_id);

  -- Cartão com 4%: 1 Avelã a 7,50 → taxa 0,30; MC = 7,50 − 2,50 − 0,30 = 4,70; caixa +7,50 −0,30.
  v_caixa := pg_temp.caixa();
  -- Valor recebido nulo = paga: o banco usa o total que ele mesmo calculou.
  v_res := public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('avela', 1)), pg_temp.id('cartao'), null);
  v_id := (v_res ->> 'venda_id')::uuid;
  assert (select recebido = 7.50 and situacao_pagamento = 'paga' from public.vendas where id = v_id), 'Aceite 6: nulo = paga pelo total do banco';
  assert (select taxa_rateada = 0.30 and margem_contribuicao = 4.70 from public.venda_itens where venda_id = v_id), 'Aceite 6: cartão 4%: taxa 0,30 e MC 4,70';
  assert pg_temp.caixa() = v_caixa + 7.20, 'Aceite 6: caixa +7,50 do recebimento e −0,30 da taxa';
  insert into ids_f4 values ('venda_cartao', v_id);
end
$$;

-- ── Teste de aceite 7: venda pendente e parcial ─────────────────────────────
do $$
declare
  v_res jsonb;
  v_id uuid;
  v_caixa numeric := pg_temp.caixa();
  v_chave uuid := gen_random_uuid();
begin
  v_res := public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('classico', 1)), pg_temp.id('pix'), 0, 0, 'Bia');
  v_id := (v_res ->> 'venda_id')::uuid;
  assert (select situacao_pagamento = 'pendente' and recebido = 0 from public.vendas where id = v_id), 'Aceite 7: pendente';
  assert pg_temp.caixa() = v_caixa, 'Aceite 7: pendente não entra no caixa';
  assert (select a_receber from public.v_vendas where id = v_id) = 6.50, 'Aceite 7: a receber 6,50';
  assert (select margem_total from public.v_vendas where id = v_id) = 5.00, 'Aceite 7: a margem já conta (a venda aconteceu)';

  perform public.registrar_recebimento(v_chave, v_id, 3.00, pg_temp.id('pix'));
  perform public.registrar_recebimento(v_chave, v_id, 3.00, pg_temp.id('pix')); -- reenvio
  assert (select situacao_pagamento = 'parcial' and recebido = 3 from public.vendas where id = v_id), 'Aceite 7: parcial com 3,00 (reenvio não dobra)';
  assert (select a_receber from public.v_vendas where id = v_id) = 3.50, 'Aceite 7: falta 3,50';
  assert pg_temp.caixa() = v_caixa + 3, 'Aceite 7: caixa +3,00 só quando recebe';
  begin
    perform public.registrar_recebimento(gen_random_uuid(), v_id, 5.00, pg_temp.id('pix'));
    raise exception 'Aceite 7 falhou: recebeu mais que o saldo';
  exception when raise_exception then
    assert sqlerrm like 'O valor passa do que falta receber (3.50)%', 'Aceite 7: ' || sqlerrm;
  end;
  perform public.registrar_recebimento(gen_random_uuid(), v_id, 3.50, pg_temp.id('pix'));
  assert (select situacao_pagamento = 'paga' and recebido = 6.50 from public.vendas where id = v_id), 'Aceite 7: agora paga';
  assert (select a_receber from public.v_vendas where id = v_id) = 0, 'Aceite 7: nada a receber';

  -- Parcial já na venda: 2 Avelã (15,00), pagou 5,00.
  v_res := public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('avela', 2)), pg_temp.id('pix'), 5.00);
  assert (select situacao_pagamento = 'parcial' from public.vendas where id = (v_res ->> 'venda_id')::uuid), 'Aceite 7: parcial na hora';
  assert (select a_receber from public.v_vendas where id = (v_res ->> 'venda_id')::uuid) = 10, 'Aceite 7: falta 10,00';
end
$$;

-- ── Teste de aceite 8: encomenda ───────────────────────────────────────────
do $$
declare
  v_res jsonb;
  v_id uuid;
  v_avela numeric := pg_temp.saldo('avela');
  v_amanha date := (now() at time zone 'America/Fortaleza')::date + 1;
begin
  begin
    perform public.registrar_venda(gen_random_uuid(), 'encomenda', pg_temp.itens(pg_temp.item('avela', 2)), pg_temp.id('pix'));
    raise exception 'Aceite 8 falhou: encomenda sem data';
  exception when raise_exception then
    assert sqlerrm like 'Informe a data de entrega%', 'Aceite 8: ' || sqlerrm;
  end;
  v_res := public.registrar_venda(gen_random_uuid(), 'encomenda', pg_temp.itens(pg_temp.item('avela', 2)), pg_temp.id('pix'),
                                  5.00, 0, 'Caio', 'Sem açúcar por cima', v_amanha);
  v_id := (v_res ->> 'venda_id')::uuid;
  assert pg_temp.saldo('avela') = v_avela, 'Aceite 8: encomenda não baixa o estoque';
  assert (select situacao_entrega = 'aguardando' and reconhecida_em is null and not estoque_baixado and recebido = 5 from public.vendas where id = v_id),
    'Aceite 8: aguardando, fora do resultado, sinal de 5,00 recebido';
  assert (select margem_total is null from public.v_vendas where id = v_id), 'Aceite 8: margem só na entrega';
  perform public.marcar_encomenda_pronta(v_id);
  assert (select situacao_entrega = 'pronta' from public.vendas where id = v_id), 'Aceite 8: pronta';
  v_res := public.entregar_encomenda(v_id, false);
  assert (v_res ->> 'ok')::boolean, 'Aceite 8: entregue ' || v_res::text;
  assert pg_temp.saldo('avela') = v_avela - 2, 'Aceite 8: estoque baixa na entrega';
  assert (select situacao_entrega = 'entregue' and reconhecida_em is not null and estoque_baixado from public.vendas where id = v_id), 'Aceite 8: reconhecida na entrega';
  assert (select margem_total from public.v_vendas where id = v_id) = 10.00, 'Aceite 8: MC 2 × (7,50 − 2,50) = 10,00';
  assert (public.entregar_encomenda(v_id, false) ->> 'repetida')::boolean and pg_temp.saldo('avela') = v_avela - 2, 'Aceite 8: entregar de novo não baixa de novo';
end
$$;

-- ── Teste de aceite 9: doação ───────────────────────────────────────────────
do $$
declare
  v_res jsonb;
  v_id uuid;
  v_caixa numeric := pg_temp.caixa();
  v_classico numeric := pg_temp.saldo('classico');
begin
  v_res := public.registrar_venda(gen_random_uuid(), 'doacao', pg_temp.itens(pg_temp.item('classico', 1)), null, 0, 0, 'Vizinho');
  v_id := (v_res ->> 'venda_id')::uuid;
  assert (select total = 0 and recebido = 0 and situacao_pagamento is null and forma_pagamento_id is null from public.vendas where id = v_id), 'Aceite 9: sem receita nem pagamento';
  assert pg_temp.saldo('classico') = v_classico - 1, 'Aceite 9: baixa o estoque';
  assert (select margem_total from public.v_vendas where id = v_id) = -1.50, 'Aceite 9: entra no custo (−1,50)';
  assert (select tipo from public.movimentos_estoque where origem_id = v_id) = 'doacao', 'Aceite 9: movimento de doação';
  assert pg_temp.caixa() = v_caixa, 'Aceite 9: caixa não muda';
  assert not exists (select 1 from public.recebimentos where venda_id = v_id), 'Aceite 9: nenhum recebimento';
  begin
    perform public.registrar_venda(gen_random_uuid(), 'doacao', pg_temp.itens(pg_temp.item('classico', 1)), null, 5);
    raise exception 'Aceite 9 falhou: doação com pagamento';
  exception when raise_exception then
    assert sqlerrm like 'Doação não tem desconto nem pagamento%', 'Aceite 9: ' || sqlerrm;
  end;
end
$$;

-- ── Falta de produto pronto (D8) e validações ───────────────────────────────
do $$
declare
  v_res jsonb;
  v_vendas bigint := (select count(*) from public.vendas);
  v_saldo numeric := pg_temp.saldo('avela');
begin
  v_res := public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('avela', v_saldo + 2)), pg_temp.id('pix'), 0);
  assert not (v_res ->> 'ok')::boolean, 'D8: avisa quando falta produto';
  assert (v_res -> 'faltas' -> 0 ->> 'item') = 'Avelã F4' and (v_res -> 'faltas' -> 0 ->> 'disponivel')::numeric = v_saldo,
    'D8: diz qual produto e quanto tem: ' || v_res::text;
  assert (select count(*) from public.vendas) = v_vendas and pg_temp.saldo('avela') = v_saldo, 'D8: sem confirmação, nada é gravado';
  v_res := public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('avela', v_saldo + 2)), pg_temp.id('pix'), 0, 0, null, null, null, true);
  assert (v_res ->> 'ok')::boolean and (v_res ->> 'estoque_negativo')::boolean, 'D8: confirmada, a venda passa';
  assert pg_temp.saldo('avela') = -2, 'D8: o estoque fica negativo, com o aviso registrado';
  assert (select estoque_negativo_confirmado from public.vendas where id = (v_res ->> 'venda_id')::uuid), 'D8: aviso guardado na venda';

  begin
    perform public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('classico', 1)), null, 0);
    raise exception 'V1 falhou: sem forma';
  exception when raise_exception then
    assert sqlerrm like 'Escolha a forma de pagamento%', 'V1: ' || sqlerrm;
  end;
  begin
    perform public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('classico', 1)), pg_temp.id('pix'), 0, 7);
    raise exception 'V1 falhou: desconto maior que o valor';
  exception when raise_exception then
    assert sqlerrm like 'O desconto precisa ficar entre zero e o valor dos produtos (6.50)%', 'V1: ' || sqlerrm;
  end;
  begin
    perform public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('classico', 1)), pg_temp.id('pix'), 10);
    raise exception 'V1 falhou: recebido maior que o total';
  exception when raise_exception then
    assert sqlerrm like 'O valor recebido precisa ficar entre zero e o total%', 'V1: ' || sqlerrm;
  end;
  begin
    perform public.registrar_venda(gen_random_uuid(), 'venda', '[]'::jsonb, pg_temp.id('pix'), 0);
    raise exception 'V1 falhou: sem itens';
  exception when raise_exception then
    assert sqlerrm like 'Escolha pelo menos um produto%', 'V1: ' || sqlerrm;
  end;
  -- Preço editado na hora (sugerido pelo cadastro, mas editável).
  v_res := public.registrar_venda(gen_random_uuid(), 'venda',
    pg_temp.itens(jsonb_build_object('variacao_id', pg_temp.id('classico'), 'quantidade', 1, 'preco_unitario', 6.00)), pg_temp.id('pix'), 6);
  assert (select preco_unitario = 6 and margem_contribuicao = 4.50 from public.venda_itens where venda_id = (v_res ->> 'venda_id')::uuid),
    'V2: preço editado 6,00 → MC 4,50';
end
$$;

-- ── Teste de aceite 3 (vendas passadas não mudam) ───────────────────────────
do $$
begin
  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 1, 'unidade', 'kg', 'valor', 20)), 'participante');
  assert (select custo_unitario from public.v_custo_variacoes where variacao_id = pg_temp.id('classico')) = 2.5,
    'Aceite 3: farinha a R$ 20/kg → custo atual do clássico 2,50';
  assert (select custo_unitario_momento = 1.5 and margem_contribuicao = 9.48 from public.venda_itens
           where venda_id = pg_temp.id('venda6') and variacao_id = pg_temp.id('classico')),
    'Aceite 3: a venda anterior mantém custo 1,50 e MC 9,48';
end
$$;

-- ── Teste de aceite 12: cancelamento ────────────────────────────────────────
-- Outro membro não cancela; o dono cancela em até 30 minutos; o admin sempre.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000004cc"}';
do $$
begin
  perform public.cancelar_venda(pg_temp.id('venda6'), 'Errei');
  raise exception 'Aceite 12 falhou: outro membro cancelou';
exception when raise_exception then
  assert sqlerrm like 'Só o administrador cancela vendas%', 'Aceite 12: ' || sqlerrm;
end
$$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000004bb"}';
do $$
declare
  v_caixa numeric := pg_temp.caixa();
  v_classico numeric := pg_temp.saldo('classico');
  v_avela numeric := pg_temp.saldo('avela');
  v_caixa_kit numeric := pg_temp.saldo('caixa_kit');
begin
  begin
    perform public.cancelar_venda(pg_temp.id('venda6'), '');
    raise exception 'Aceite 12 falhou: sem motivo';
  exception when raise_exception then
    assert sqlerrm like 'Diga o motivo%', 'Aceite 12: ' || sqlerrm;
  end;
  perform public.cancelar_venda(pg_temp.id('venda6'), 'Cliente desistiu');
  assert pg_temp.saldo('classico') = v_classico + 3 and pg_temp.saldo('avela') = v_avela + 1 and pg_temp.saldo('caixa_kit') = v_caixa_kit + 1,
    'Aceite 12: estoque volta (3 clássicos, 1 avelã, 1 caixa)';
  assert pg_temp.caixa() = v_caixa - 24, 'Aceite 12: recebimento estornado no caixa (−24,00)';
  assert (select situacao = 'cancelada' and motivo_cancelamento = 'Cliente desistiu' and recebido = 0 from public.vendas where id = pg_temp.id('venda6')),
    'Aceite 12: venda marcada como cancelada, com motivo';
  assert (select count(*) from public.venda_itens where venda_id = pg_temp.id('venda6')) = 2, 'Aceite 12: itens continuam lá';
  assert (select count(*) from public.recebimentos where venda_id = pg_temp.id('venda6')) = 2, 'Aceite 12: recebimento e estorno guardados';
  assert (select a_receber from public.v_vendas where id = pg_temp.id('venda6')) = 0, 'Aceite 12: cancelada não fica a receber';
  perform public.cancelar_venda(pg_temp.id('venda6'), 'De novo');
  assert pg_temp.caixa() = v_caixa - 24 and pg_temp.saldo('classico') = v_classico + 3, 'Aceite 12: cancelar duas vezes não estorna em dobro';

  -- Cartão: estorna o recebimento e a taxa.
  v_caixa := pg_temp.caixa();
  perform public.cancelar_venda(pg_temp.id('venda_cartao'), 'Teste');
  assert pg_temp.caixa() = v_caixa - 7.20, 'Aceite 12: cartão estorna 7,50 e devolve a taxa de 0,30';
end
$$;
reset role;
do $$
begin
  assert exists (select 1 from public.auditoria where tabela = 'vendas' and registro_id = pg_temp.id('venda6')::text and acao = 'alteracao'
                   and antes ->> 'situacao' = 'ativa' and depois ->> 'situacao' = 'cancelada'), 'Aceite 12: auditoria com antes e depois';
end
$$;
set local role authenticated;

-- ── Permissões ───────────────────────────────────────────────────────────────
do $$
begin
  begin
    insert into public.vendas (tipo, participante_id, subtotal, total, chave_idempotencia)
    values ('venda', auth.uid(), 0, 0, gen_random_uuid());
    raise exception 'P1 falhou: gravou venda direto';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.venda_itens set margem_contribuicao = 999;
    raise exception 'P1 falhou: alterou margem direto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.recebimentos (venda_id, valor, forma_pagamento_id) values (pg_temp.id('venda6'), 1, pg_temp.id('pix'));
    raise exception 'P1 falhou: gravou recebimento direto';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.vendas;
    raise exception 'P1 falhou: apagou venda';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
update public.perfis set ativo = false where id = '00000000-0000-4000-8000-0000000004cc';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000004cc"}';
do $$
begin
  perform public.registrar_venda(gen_random_uuid(), 'venda', pg_temp.itens(pg_temp.item('classico', 1)), pg_temp.id('pix'), 0);
  raise exception 'P2 falhou: inativo vendeu';
exception when raise_exception then
  assert sqlerrm like 'Faça login com um participante ativo%', 'P2: ' || sqlerrm;
end
$$;
reset role;
set local role anon;
do $$
begin
  perform 1 from public.v_vendas limit 1;
  raise exception 'P3 falhou: anon leu as vendas';
exception when insufficient_privilege then null;
end
$$;

reset role;
do $$
begin
  assert not exists (
    select 1 from public.saldos_estoque s
    where s.saldo <> (select coalesce(sum(m.quantidade_base), 0) from public.movimentos_estoque m
                       where m.insumo_id is not distinct from s.insumo_id and m.variacao_id is not distinct from s.variacao_id)
  ), 'S1: saldo = soma do livro';
  assert (select sum(valor) from public.lancamentos_caixa where origem_tipo = 'recebimento')
       = (select sum(valor - taxa_valor) from public.recebimentos), 'S2: caixa das vendas = recebimentos − taxas';
end
$$;
select 'fatia 4: todos os testes passaram' as resultado;
rollback;
