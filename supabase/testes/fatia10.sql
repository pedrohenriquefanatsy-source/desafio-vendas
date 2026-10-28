-- Testes da fatia 10: cliente, bairro e "cliente desconhecido" nas vendas, rankings de clientes e
-- bairros, e receita montada de uma vez (ingredientes primeiro, rendimento no fim).
-- Roda numa transação e desfaz no fim: não deixa nada no banco.
begin;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-000000000aaa', 'f10-admin@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-000000000abb', 'f10-membro@teste.invalid', 'authenticated', 'authenticated');
update public.perfis set papel = 'administrador', ativo = true, nome = 'Admin F10' where id = '00000000-0000-4000-8000-000000000aaa';
update public.perfis set papel = 'membro', ativo = true, nome = 'Membro F10' where id = '00000000-0000-4000-8000-000000000abb';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000aaa"}';

create temporary table ids_f10 (chave text primary key, id uuid) on commit drop;
grant all on ids_f10 to authenticated;
create function pg_temp.id(p text) returns uuid language sql as $$ select id from ids_f10 where chave = p $$;
create function pg_temp.erro(p text) returns text language plpgsql as $$
begin
  execute p;
  return null;
exception when others then
  return sqlerrm;
end
$$;

-- Cadastro: bites com estoque pronto para vender.
do $$
begin
  insert into ids_f10 values ('choc', public.cadastrar_insumo(gen_random_uuid(), 'Chocolate F10', 'ingrediente', 'g', 500, 16, 5000));
  insert into ids_f10 values ('leite', public.cadastrar_insumo(gen_random_uuid(), 'Leite condensado F10', 'ingrediente', 'g', 395, 7.90, 3950));
  insert into ids_f10 values ('sem', public.cadastrar_insumo(gen_random_uuid(), 'Sem preço F10', 'ingrediente', 'g'));
  insert into public.produtos (nome, tipo) values ('Bites F10', 'simples');
  insert into public.variacoes (produto_id, nome, preco_venda)
  select id, 'Tradicional', 5 from public.produtos where nome = 'Bites F10';
  insert into ids_f10 select 'trad', v.id from public.variacoes v join public.produtos p on p.id = v.produto_id where p.nome = 'Bites F10';
  insert into public.formas_pagamento (nome) values ('Pix F10');
  insert into ids_f10 select 'pix', id from public.formas_pagamento where nome = 'Pix F10';
end
$$;

-- ── Receita montada de uma vez ───────────────────────────────────────────────
do $$
declare
  v_receita uuid;
begin
  assert pg_temp.erro(format('select public.cadastrar_receita_variacao(%L, 20, ''[]'')', pg_temp.id('trad'))) = 'Adicione pelo menos um ingrediente à receita.',
    'F10: receita sem ingrediente é recusada';
  assert pg_temp.erro(format('select public.cadastrar_receita_variacao(%L, 0, %L::jsonb)', pg_temp.id('trad'),
    jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 200, 'unidade', 'g')))) like 'Informe quantas unidades a receita rende%',
    'F10: rendimento zero é recusado';
  assert pg_temp.erro(format('select public.cadastrar_receita_variacao(%L, 20, %L::jsonb)', pg_temp.id('trad'),
    jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 200, 'unidade', 'g'),
                      jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 50, 'unidade', 'g')))) like 'O mesmo insumo aparece duas vezes%',
    'F10: o mesmo insumo duas vezes é recusado';
  assert pg_temp.erro(format('select public.cadastrar_receita_variacao(%L, 20, %L::jsonb)', pg_temp.id('trad'),
    jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 200, 'unidade', 'g'),
                      jsonb_build_object('insumo_id', pg_temp.id('leite'), 'quantidade', 1, 'unidade', 'cx')))) like 'Não sei converter%',
    'F10: unidade que o insumo não conhece é recusada, com explicação';
  assert (select receita_id from public.variacoes where id = pg_temp.id('trad')) is null
     and not exists (select 1 from public.receitas where nome = 'Bites F10 · Tradicional'),
    'F10: se um ingrediente falha, nada é criado (nem a receita)';

  v_receita := public.cadastrar_receita_variacao(pg_temp.id('trad'), 20, jsonb_build_array(
    jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 200, 'unidade', 'g'),
    jsonb_build_object('insumo_id', pg_temp.id('leite'), 'quantidade', 1, 'unidade', 'embalagem')));
  assert (select receita_id from public.variacoes where id = pg_temp.id('trad')) = v_receita, 'F10: a receita nasce ligada ao sabor';
  assert (select count(*) from public.receita_itens where receita_id = v_receita) = 2, 'F10: com os dois ingredientes';
  -- 200 g x 0,032 + 1 embalagem de 395 g x 0,02 = 6,40 + 7,90 = 14,30 por fornada de 20 = 0,715
  assert (select round(custo_unitario, 3) from public.v_custo_variacoes where variacao_id = pg_temp.id('trad')) = 0.715,
    'F10: custo por unidade = (6,40 + 7,90) ÷ 20 = 0,715';
  assert pg_temp.erro(format('select public.cadastrar_receita_variacao(%L, 20, %L::jsonb)', pg_temp.id('trad'),
    jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 1, 'unidade', 'g')))) = 'Este sabor já tem receita.',
    'F10: um sabor não ganha duas receitas';
  assert (select count(*) from public.receita_itens where receita_id = v_receita) = 2, 'F10: a tentativa recusada não mexeu na receita';

  -- Mudar o rendimento depois muda só o custo por unidade.
  update public.receitas set rendimento_unidades = 40 where id = v_receita;
  assert (select round(custo_unitario, 4) from public.v_custo_variacoes where variacao_id = pg_temp.id('trad')) = 0.3575,
    'F10: se a receita rende 40, o custo por unidade cai para 0,3575';
  update public.receitas set rendimento_unidades = 20 where id = v_receita;
end
$$;

-- Membro não monta receita.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000abb"}';
do $$
begin
  assert pg_temp.erro(format('select public.cadastrar_receita_variacao(%L, 20, %L::jsonb)', pg_temp.id('trad'),
    jsonb_build_array(jsonb_build_object('insumo_id', pg_temp.id('choc'), 'quantidade', 1, 'unidade', 'g')))) = 'Só o administrador cadastra receitas.',
    'F10: membro não monta receita';
end
$$;

-- ── Cliente, bairro e cliente desconhecido ───────────────────────────────────
do $$
declare
  v jsonb;
  v_item jsonb := jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 1));
begin
  perform public.ajustar_estoque(gen_random_uuid(), null, pg_temp.id('trad'), 100, 'Estoque do teste');

  -- Compra de sempre, sem cliente: continua funcionando (parâmetros novos são opcionais).
  v := public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'));
  assert (v ->> 'ok')::boolean, 'F10: venda sem cliente e sem bairro continua valendo';

  -- Cliente com nome e bairro.
  v := public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), null, 0, 'Maria Souza', null, null, false, 'Aldeota', false);
  assert (v ->> 'ok')::boolean, 'F10: venda com cliente e bairro';
  insert into ids_f10 values ('v_maria', (v ->> 'venda_id')::uuid);
  assert (select cliente || '|' || bairro from public.v_vendas where id = pg_temp.id('v_maria')) = 'Maria Souza|Aldeota',
    'F10: a lista de vendas traz cliente e bairro';

  -- A mesma pessoa, escrita de outro jeito (maiúsculas e espaços), é a mesma cliente.
  perform public.registrar_venda(gen_random_uuid(), 'venda', jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 3)),
    pg_temp.id('pix'), null, 0, '  maria souza ', null, null, false, 'Aldeota', false);
  -- Outro cliente, outro bairro.
  perform public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), null, 0, 'João Lima', null, null, false, 'Meireles', false);

  -- Cliente desconhecido: sem nome, com bairro (sabe-se onde vendeu), pago na hora.
  v := public.registrar_venda(gen_random_uuid(), 'venda', jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 2)),
    pg_temp.id('pix'), null, 0, null, null, null, false, 'Aldeota', true);
  assert (v ->> 'ok')::boolean, 'F10: venda a cliente desconhecido, com o bairro';
  insert into ids_f10 values ('v_desc', (v ->> 'venda_id')::uuid);
  assert (select cliente_desconhecido and cliente is null from public.v_vendas where id = pg_temp.id('v_desc')), 'F10: fica marcada como desconhecido e sem nome';

  -- Regras.
  assert pg_temp.erro(format('select public.registrar_venda(gen_random_uuid(), ''venda'', %L::jsonb, %L, null, 0, ''Ana'', null, null, false, null, true)', v_item, pg_temp.id('pix')))
    = 'Cliente desconhecido não tem nome. Escolha um ou outro.', 'F10: não pode ter nome e ser desconhecido ao mesmo tempo';
  assert pg_temp.erro(format('select public.registrar_venda(gen_random_uuid(), ''venda'', %L::jsonb, %L, 0, 0, null, null, null, false, null, true)', v_item, pg_temp.id('pix')))
    like 'Venda pendente, parcial ou encomenda precisa do nome do cliente%', 'F10: venda pendente a desconhecido é recusada (de quem cobrar?)';
  assert pg_temp.erro(format('select public.registrar_venda(gen_random_uuid(), ''venda'', %L::jsonb, %L, null, 0, null, null, null, false, ''A'', false)', v_item, pg_temp.id('pix')))
    = 'O bairro precisa ter de 2 a 60 letras.', 'F10: bairro curto demais é recusado';
  v := public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), 0, 0, 'Pedro Alves', null, null, false, 'Centro', false);
  assert (v ->> 'ok')::boolean, 'F10: venda pendente com nome do cliente vale';
  -- Doação e venda cancelada não entram no ranking.
  v := public.registrar_venda(gen_random_uuid(), 'doacao', jsonb_build_array(jsonb_build_object('variacao_id', pg_temp.id('trad'), 'quantidade', 1)),
    null, 0, 0, 'Vizinha Rita', null, null, false, 'Cocó', false);
  assert (v ->> 'ok')::boolean, 'F10: doação com nome vale';
  v := public.registrar_venda(gen_random_uuid(), 'venda', v_item, pg_temp.id('pix'), null, 0, 'Cliente Cancelado', null, null, false, 'Cocó', false);
  perform public.cancelar_venda((v ->> 'venda_id')::uuid, 'Teste');
end
$$;

-- Rankings.
do $$
begin
  assert (select compras from public.v_clientes where chave = 'maria souza') = 2
     and (select total from public.v_clientes where chave = 'maria souza') = 20,
    'F10: Maria Souza e "  maria souza " são a mesma cliente: 2 compras, R$ 20,00';
  assert (select bairro from public.v_clientes where chave = 'maria souza') = 'Aldeota', 'F10: o ranking mostra o bairro da cliente';
  assert (select count(*) from public.v_clientes) = 3, 'F10: 3 clientes (Maria, João e Pedro): sem desconhecido, sem doação, sem cancelada';
  assert not exists (select 1 from public.v_clientes where chave in ('vizinha rita', 'cliente cancelado')), 'F10: doação e venda cancelada fora do ranking';
  assert (select vendas from public.v_bairros where chave = 'aldeota') = 3
     and (select total from public.v_bairros where chave = 'aldeota') = 30
     and (select vendas_desconhecidos from public.v_bairros where chave = 'aldeota') = 1
     and (select clientes_conhecidos from public.v_bairros where chave = 'aldeota') = 1,
    'F10: Aldeota: 3 vendas, R$ 30,00, 1 delas a desconhecido, 1 cliente conhecido';
  assert (select count(*) from public.v_bairros) = 3, 'F10: 3 bairros (Aldeota, Meireles e Centro); Cocó só tinha doação e cancelada';
  assert (select count(*) from public.v_bairros where chave = 'cocó') = 0, 'F10: bairro de doação ou cancelada não entra';
end
$$;

-- Permissões: não logado não lê os rankings.
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.v_clientes limit 1;
    raise exception 'F10 falhou: anon leu v_clientes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.v_bairros limit 1;
    raise exception 'F10 falhou: anon leu v_bairros';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cadastrar_receita_variacao(gen_random_uuid(), 1, '[]');
    raise exception 'F10 falhou: anon montou receita';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
select 'fatia 10: todos os testes passaram' as resultado;
rollback;
