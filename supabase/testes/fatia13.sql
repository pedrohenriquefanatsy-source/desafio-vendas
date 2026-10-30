-- Testes da fatia 13: encomenda paga por inteiro já conta no faturamento (antes da entrega).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000daa', 'f13-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F13' where id = '00000000-0000-4000-8000-000000000daa';
update public.desafios set situacao = 'encerrado' where situacao = 'em_andamento';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000daa"}';

insert into public.desafios (nome, inicio, fim, meta_resultado, meta_vendas, situacao, chave_idempotencia)
values ('Desafio F13', (now() at time zone 'America/Fortaleza')::date - 1, (now() at time zone 'America/Fortaleza')::date + 5,
        100, 200, 'em_andamento', gen_random_uuid());
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F13', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F13', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F13' and i.nome = 'Farinha F13';
insert into public.produtos (nome, tipo) values ('Bolo F13', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F13' and r.nome = 'Massa F13';
insert into public.formas_pagamento (nome) values ('Pix F13');

create temporary table ids_f13 (chave text primary key, id uuid) on commit drop;
grant all on ids_f13 to authenticated;
insert into ids_f13
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F13'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F13'
union all select 'desafio', id from public.desafios where nome = 'Desafio F13';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f13 where chave = p $$;
create function pg_temp.realizado() returns numeric language sql as $$
  select realizado from public.v_painel_meta where desafio_id = pg_temp.id('desafio')
$$;

do $$
declare
  v_pago uuid;
  v_parcial uuid;
begin
  assert pg_temp.realizado() = 0, 'F13: começa zerado';

  -- Encomenda de 4 bolos (20,00) paga por inteiro: já entra no faturamento, sem entregar.
  v_pago := ((public.registrar_venda(gen_random_uuid(), 'encomenda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 4)), pg_temp.id('pix'), 20, p_entrega_prevista => current_date + 1)) ->> 'venda_id')::uuid;
  assert pg_temp.realizado() = 20, 'F13: encomenda paga por inteiro conta já no faturamento, veio ' || pg_temp.realizado();
  assert (select lucro_estimado from public.v_painel_meta where desafio_id = pg_temp.id('desafio')) = 0,
    'F13: o lucro só aparece quando a encomenda é entregue';

  -- Encomenda paga só em parte e encomenda sem pagamento: ainda não contam.
  v_parcial := ((public.registrar_venda(gen_random_uuid(), 'encomenda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 2)), pg_temp.id('pix'), 4, p_entrega_prevista => current_date + 1)) ->> 'venda_id')::uuid;
  perform public.registrar_venda(gen_random_uuid(), 'encomenda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 1)), pg_temp.id('pix'), 0, p_entrega_prevista => current_date + 1);
  assert pg_temp.realizado() = 20, 'F13: encomenda parcial ou sem pagamento ainda não conta, veio ' || pg_temp.realizado();

  -- Receber o restante da parcial: passa a contar.
  perform public.registrar_recebimento(gen_random_uuid(), v_parcial, 6, pg_temp.id('pix'));
  assert pg_temp.realizado() = 30, 'F13: ao completar o pagamento a encomenda passa a contar, veio ' || pg_temp.realizado();

  -- Entregar não conta duas vezes.
  perform public.entregar_encomenda(v_pago, true);
  assert pg_temp.realizado() = 30, 'F13: entregar não duplica o faturamento, veio ' || pg_temp.realizado();
  assert (select lucro_estimado from public.v_painel_meta where desafio_id = pg_temp.id('desafio')) is not null, 'F13: lucro calculado';

  -- Cancelar tira do faturamento.
  perform public.cancelar_venda(v_parcial, 'teste');
  assert pg_temp.realizado() = 20, 'F13: encomenda cancelada sai do faturamento, veio ' || pg_temp.realizado();
end
$$;

reset role;
select 'fatia 13: todos os testes passaram' as resultado;
rollback;
