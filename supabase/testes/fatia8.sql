-- Testes da fatia 8: permissões de ponta a ponta (teste de aceite 17) e auditoria.
-- Membro não altera preços nem apaga ou cancela lançamentos de outros; usuário não logado
-- não lê nada (todas as tabelas e views) nem chama nenhuma função.
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-0000000008aa', 'f8-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000008bb', 'f8-membro@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-0000000008cc', 'f8-outro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F8' where id = '00000000-0000-4000-8000-0000000008aa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F8' where id = '00000000-0000-4000-8000-0000000008bb';
update public.perfis set papel = 'membro', ativo = true, nome = 'Outro F8' where id = '00000000-0000-4000-8000-0000000008cc';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000008aa"}';
insert into public.insumos (nome, tipo, unidade_base) values ('Farinha F8', 'ingrediente', 'g');
insert into public.receitas (nome, rendimento_unidades) values ('Massa F8', 10);
insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
select r.id, i.id, 1000, 'g' from public.receitas r, public.insumos i where r.nome = 'Massa F8' and i.nome = 'Farinha F8';
insert into public.produtos (nome, tipo) values ('Bolo F8', 'simples');
insert into public.variacoes (produto_id, preco_venda, receita_id)
select p.id, 5, r.id from public.produtos p, public.receitas r where p.nome = 'Bolo F8' and r.nome = 'Massa F8';
insert into public.formas_pagamento (nome) values ('Pix F8');

create temporary table ids_f8 (chave text primary key, id uuid) on commit drop;
grant all on ids_f8 to authenticated;
insert into ids_f8
select 'bolo', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bolo F8'
union all select 'pix', id from public.formas_pagamento where nome = 'Pix F8'
union all select 'farinha', id from public.insumos where nome = 'Farinha F8';
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f8 where chave = p $$;

-- O membro lança venda, compra e despesa.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000008bb"}';
do $$
begin
  insert into ids_f8 values ('compra', public.registrar_compra(gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('farinha'), 'quantidade', 1, 'unidade', 'kg', 'valor', 10)), 'caixa'));
  perform public.concluir_producao(public.planejar_producao(gen_random_uuid(), pg_temp.id('bolo'), 1), 10, 0);
  insert into ids_f8 values ('venda', ((public.registrar_venda(gen_random_uuid(), 'venda',
    jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('bolo'), 'quantidade', 1)), pg_temp.id('pix'), null)) ->> 'venda_id')::uuid);
  insert into ids_f8 values ('despesa', public.registrar_despesa(gen_random_uuid(), 3, 'Sacolas', 'Material', 'caixa'));
end
$$;

-- ── Teste de aceite 17: o outro membro ───────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000008cc"}';
do $$
declare
  n int;
begin
  -- Preços: nem pela tabela nem pelas funções.
  update public.variacoes set preco_venda = 1 where id = pg_temp.id('bolo');
  get diagnostics n = row_count;
  assert n = 0 and (select preco_venda from public.variacoes where id = pg_temp.id('bolo')) = 5, 'A17: membro não muda o preço de venda';
  begin
    perform public.definir_custo_insumo(pg_temp.id('farinha'), 1, 'kg');
    raise exception 'A17 falhou: membro mudou o custo do insumo';
  exception when raise_exception then
    assert sqlerrm not like 'A17 falhou%', 'A17: ' || sqlerrm;
  end;
  begin
    insert into public.produtos (nome, tipo) values ('Pirata F8', 'simples');
    raise exception 'A17 falhou: membro cadastrou produto';
  exception when insufficient_privilege then null;
  end;
  update public.formas_pagamento set taxa_percentual = 50 where id = pg_temp.id('pix');
  get diagnostics n = row_count;
  assert n = 0, 'A17: membro não muda a taxa da forma de pagamento';
  update public.desafios set meta_resultado = 1;
  get diagnostics n = row_count;
  assert n = 0, 'A17: membro não muda a meta';

  -- Lançamentos de outra pessoa: não cancela.
  begin
    perform public.cancelar_venda(pg_temp.id('venda'), 'Não é minha');
    raise exception 'A17 falhou: cancelou venda de outro';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador cancela vendas%', 'A17: ' || sqlerrm;
  end;
  begin
    perform public.cancelar_compra(pg_temp.id('compra'), 'Não é minha');
    raise exception 'A17 falhou: cancelou compra de outro';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador cancela compras%', 'A17: ' || sqlerrm;
  end;
  begin
    perform public.cancelar_despesa(pg_temp.id('despesa'), 'Não é minha');
    raise exception 'A17 falhou: cancelou despesa de outro';
  exception when raise_exception then
    assert sqlerrm like 'Só o administrador cancela despesas%', 'A17: ' || sqlerrm;
  end;
  -- Apagar: ninguém apaga lançamento financeiro ou de estoque.
  begin delete from public.vendas; raise exception 'A17 falhou: apagou vendas'; exception when insufficient_privilege then null; end;
  begin delete from public.compras; raise exception 'A17 falhou: apagou compras'; exception when insufficient_privilege then null; end;
  begin delete from public.despesas; raise exception 'A17 falhou: apagou despesas'; exception when insufficient_privilege then null; end;
  begin delete from public.recebimentos; raise exception 'A17 falhou: apagou recebimentos'; exception when insufficient_privilege then null; end;
  begin delete from public.movimentos_estoque; raise exception 'A17 falhou: apagou estoque'; exception when insufficient_privilege then null; end;
  begin delete from public.lancamentos_caixa; raise exception 'A17 falhou: apagou caixa'; exception when insufficient_privilege then null; end;
  -- A auditoria é só do administrador.
  assert (select count(*) from public.auditoria) = 0, 'A17: membro não lê a auditoria';
end
$$;

-- O administrador cancela; tudo fica na auditoria, inclusive os itens da compra.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000008aa"}';
do $$
begin
  perform public.cancelar_venda(pg_temp.id('venda'), 'Teste de auditoria');
  assert exists (select 1 from public.auditoria where tabela = 'vendas' and registro_id = pg_temp.id('venda')::text
                   and antes ->> 'situacao' = 'ativa' and depois ->> 'situacao' = 'cancelada' and usuario_id = auth.uid()),
    'AU1: cancelamento na auditoria, com quem cancelou';
  assert exists (select 1 from public.auditoria where tabela = 'compra_itens' and depois ->> 'compra_id' = pg_temp.id('compra')::text),
    'AU2: itens da compra na auditoria';
  assert (select count(*) from public.auditoria where tabela = 'movimentos_estoque') > 0, 'AU3: estoque na auditoria';
end
$$;

-- ── Usuário não logado: nada de nada ─────────────────────────────────────────
reset role;
set local role anon;
do $$
declare
  r record;
  lidas int := 0;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v') order by 1 loop
    begin
      execute format('select 1 from public.%I limit 1', r.relname);
      raise exception 'A17 falhou: anon leu %', r.relname;
    exception when insufficient_privilege then
      lidas := lidas + 1;
    end;
  end loop;
  assert lidas >= 40, 'A17: todas as tabelas e views recusadas para anon (' || lidas || ')';
  begin
    perform public.registrar_venda(gen_random_uuid(), 'venda', '[]'::jsonb);
    raise exception 'A17 falhou: anon chamou função';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
select 'fatia 8: todos os testes passaram' as resultado;
rollback;
