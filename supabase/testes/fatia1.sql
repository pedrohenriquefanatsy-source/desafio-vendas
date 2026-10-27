-- Testes da fatia 1 (participantes, papéis, auditoria, desafios, formas de pagamento).
-- Roda tudo numa transação e desfaz no fim: não deixa nada no banco.
-- Só no Postgres local ou no projeto de TESTE (precisa dele sem usuários).
begin;

-- Usuários de teste: A (primeiro, vira admin), B (membro), C (membro).
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values ('00000000-0000-4000-8000-00000000000a', 'teste-a@teste.invalid', '{"nome":"Ana Teste"}', 'authenticated', 'authenticated');
insert into auth.users (id, email, aud, role)
values ('00000000-0000-4000-8000-00000000000b', 'teste-b@teste.invalid', 'authenticated', 'authenticated'),
       ('00000000-0000-4000-8000-00000000000c', 'teste-c@teste.invalid', 'authenticated', 'authenticated');

do $$
begin
  assert (select papel = 'administrador' and ativo and nome = 'Ana Teste' from public.perfis where id = '00000000-0000-4000-8000-00000000000a'),
    'T1: o primeiro usuário deveria virar administrador ativo, com o nome informado';
  assert (select papel = 'membro' and not ativo and nome is null from public.perfis where id = '00000000-0000-4000-8000-00000000000b'),
    'T2: os demais deveriam começar como membro DESATIVADO';
end $$;

-- B desativado: vê só o próprio perfil, nada do resto.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000b"}';
do $$
begin
  assert not privado.eh_participante(), 'T3: desativado não é participante';
  assert (select count(*) from public.perfis) = 1, 'T3: desativado deveria ver só o próprio perfil';
  assert (select count(*) from public.formas_pagamento) = 0, 'T3: desativado não deveria ver formas de pagamento';
end $$;
do $$
begin
  perform public.admin_atualizar_participante('00000000-0000-4000-8000-00000000000b', null, 'administrador', true);
  raise exception 'T4: membro conseguiu se promover';
exception when raise_exception then
  if sqlerrm not like 'Só o administrador%' then raise; end if;
end $$;
reset role;

-- A (admin) ativa B e define nomes.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000a"}';
do $$
begin
  assert privado.eh_admin(), 'T5: A deveria ser admin';
  perform public.admin_atualizar_participante('00000000-0000-4000-8000-00000000000b', 'Bruno Teste', 'membro', true);
  begin
    perform public.admin_atualizar_participante('00000000-0000-4000-8000-00000000000a', null, 'membro', true);
    raise exception 'T6: conseguiu ficar sem administrador';
  exception when raise_exception then
    if sqlerrm not like 'O sistema precisa de pelo menos um administrador%' then raise; end if;
  end;
  assert (select papel = 'administrador' from public.perfis where id = '00000000-0000-4000-8000-00000000000a'),
    'T6: a tentativa de remover o último admin não pode ter efeito';
end $$;

-- A cria desafio e forma de pagamento; registro preenchido automaticamente.
insert into public.desafios (nome, inicio, fim, meta_resultado, situacao, chave_idempotencia, criado_por)
values ('Desafio TESTE', (now() at time zone 'America/Fortaleza')::date - 2,
        (now() at time zone 'America/Fortaleza')::date + 4, 1500, 'em_andamento',
        '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000c');
insert into public.formas_pagamento (nome, taxa_percentual, ordem) values ('Cartão TESTE', 3.99, 2);
do $$
begin
  assert (select criado_por = '00000000-0000-4000-8000-00000000000a' from public.desafios where nome = 'Desafio TESTE'),
    'T7: criado_por deveria ser quem está logado, mesmo que alguém tente informar outro';
  assert (select dias_total = 7 and dias_decorridos = 2 and dias_restantes = 5 from public.v_desafios where nome = 'Desafio TESTE'),
    'T8: dias do desafio (7 no total, 2 decorridos, 5 restantes contando hoje)';
  begin
    insert into public.desafios (nome, inicio, fim, chave_idempotencia)
    values ('Repetido', current_date, current_date, '00000000-0000-4000-8000-0000000000d1');
    raise exception 'T9: aceitou a mesma chave de envio duas vezes';
  exception when unique_violation then null;
  end;
  begin
    insert into public.desafios (nome, inicio, fim, situacao) values ('Outro', current_date, current_date, 'em_andamento');
    raise exception 'T10: aceitou dois desafios em andamento';
  exception when unique_violation then null;
  end;
  begin
    insert into public.desafios (nome, inicio, fim) values ('Datas invertidas', current_date, current_date - 1);
    raise exception 'T11: aceitou fim antes do início';
  exception when check_violation then null;
  end;
  begin
    delete from public.desafios where nome = 'Desafio TESTE';
    raise exception 'T12: admin conseguiu apagar desafio';
  exception when insufficient_privilege then null;
  end;
  update public.desafios set meta_resultado = 2000 where nome = 'Desafio TESTE';
  assert (select alterado_por = '00000000-0000-4000-8000-00000000000a' and alterado_em is not null from public.desafios where nome = 'Desafio TESTE'),
    'T13: alteração deveria registrar quem e quando';
  assert (select count(*) from public.auditoria where tabela = 'desafios' and acao = 'alteracao'
           and (antes ->> 'meta_resultado')::numeric = 1500 and (depois ->> 'meta_resultado')::numeric = 2000) = 1,
    'T14: auditoria deveria guardar a meta anterior (1500) e a nova (2000)';
end $$;
reset role;

-- B (membro ativo) vê, mas não altera cadastro nem auditoria.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000b"}';
do $$
begin
  assert (select count(*) from public.perfis) = 3, 'T15: membro ativo deveria ver os perfis';
  assert (select count(*) from public.formas_pagamento) = 2, 'T15: membro ativo deveria ver as formas de pagamento';
  assert (select count(*) from public.auditoria) = 0, 'T16: membro não pode ler a auditoria';
  begin
    insert into public.desafios (nome, inicio, fim) values ('Do membro', current_date, current_date);
    raise exception 'T17: membro conseguiu criar desafio';
  exception when insufficient_privilege then null;
  end;
  update public.formas_pagamento set taxa_percentual = 0 where nome = 'Cartão TESTE';
  update public.desafios set meta_resultado = 1 where nome = 'Desafio TESTE';
  begin
    insert into public.perfis (id, papel, ativo) values (gen_random_uuid(), 'administrador', true);
    raise exception 'T19: membro conseguiu criar perfil';
  exception when insufficient_privilege then null;
  end;
  begin
    perform privado.registrar_auditoria();
    raise exception 'T20: membro conseguiu chamar função interna';
  exception when insufficient_privilege then null;
  end;
  perform public.definir_meu_nome('  Bruno B  ');
  begin
    perform public.definir_meu_nome('B');
    raise exception 'T21: aceitou nome de 1 letra';
  exception when raise_exception then null;
  end;
end $$;
reset role;
do $$
begin
  assert (select taxa_percentual = 3.99 from public.formas_pagamento where nome = 'Cartão TESTE'), 'T18: membro alterou taxa';
  assert (select meta_resultado = 2000 from public.desafios where nome = 'Desafio TESTE'), 'T18: membro alterou meta';
  assert (select nome = 'Bruno B' from public.perfis where id = '00000000-0000-4000-8000-00000000000b'), 'T21: nome próprio com espaços aparados';
end $$;

-- Usuário não logado (anon) não lê nada.
set local role anon;
do $$
begin
  begin
    perform 1 from public.perfis;
    raise exception 'T22: anon leu perfis';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.desafios;
    raise exception 'T22: anon leu desafios';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.v_desafios;
    raise exception 'T22: anon leu v_desafios';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Funções internas não são chamáveis pela API (schema privado sem EXECUTE para anon).
set local role anon;
do $$
begin
  begin
    perform privado.eh_admin();
    raise exception 'T23: anon chamou função interna';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in
                     ('papel_atual','eh_participante','eh_admin','criar_perfil_novo_usuario','preencher_registro','registrar_auditoria')),
    'T24: funções internas ainda estão no schema public';
end $$;

select 'FATIA 1: TODOS OS TESTES PASSARAM' as resultado;
rollback;
