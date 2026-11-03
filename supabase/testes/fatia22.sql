-- Testes da fatia 22: cancelar compra mesmo com parte do insumo já usada (estoque fica negativo).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000dda', 'f22-admin@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F22' where id = '00000000-0000-4000-8000-000000000dda';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000dda"}';

create temporary table ids_f22 (chave text primary key, id uuid) on commit drop;
grant all on ids_f22 to authenticated;

do $$
declare
  v_insumo uuid;
  v_compra uuid;
  v_caixa numeric := (select saldo from public.v_saldo_caixa);
begin
  v_insumo := public.cadastrar_insumo(gen_random_uuid(), 'Chocolate F22', 'ingrediente', 'g', 1000, 10, 0);
  insert into ids_f22 values ('insumo', v_insumo);
  v_compra := public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', v_insumo, 'quantidade', 1000, 'unidade', 'g', 'valor', 10)), 'caixa',
    p_data => (now() at time zone 'America/Fortaleza')::date);
  assert (select saldo from public.saldos_estoque where insumo_id = v_insumo) = 1000, 'F22: comprou 1000';
  assert (select saldo from public.v_saldo_caixa) = v_caixa - 10, 'F22: caixa −10,00';
  insert into ids_f22 values ('compra', v_compra);
end
$$;

-- Parte do insumo foi usada (800 g): sobram 200.
reset role;
insert into public.movimentos_estoque (desafio_id, insumo_id, tipo, quantidade_base, origem_tipo)
select privado.desafio_atual_id(), id, 'consumo_producao', -800, 'producao' from ids_f22 where chave = 'insumo';
set local role authenticated;

do $$
declare
  v_insumo uuid := (select id from ids_f22 where chave = 'insumo');
  v_caixa numeric;
begin
  perform public.cancelar_compra((select id from ids_f22 where chave = 'compra'), 'Data errada');
  assert (select saldo from public.saldos_estoque where insumo_id = v_insumo) = -800,
    'F22: cancelou mesmo com parte usada: saldo −800, veio ' || (select saldo from public.saldos_estoque where insumo_id = v_insumo);
  assert (select situacao from public.compras where id = (select id from ids_f22 where chave = 'compra')) = 'cancelada', 'F22: compra cancelada';
  -- Lança de novo com a data certa: o estoque volta a 200.
  perform public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', v_insumo, 'quantidade', 1000, 'unidade', 'g', 'valor', 10)), 'caixa',
    p_data => (now() at time zone 'America/Fortaleza')::date - 1);
  assert (select saldo from public.saldos_estoque where insumo_id = v_insumo) = 200, 'F22: relançada com outra data: saldo 200';
  assert (select count(*) from public.compras c join public.compra_itens i on i.compra_id = c.id where i.insumo_id = v_insumo and c.situacao = 'ativa') = 1,
    'F22: só uma compra ativa';
end
$$;

reset role;
select 'fatia 22: todos os testes passaram' as resultado;
rollback;
