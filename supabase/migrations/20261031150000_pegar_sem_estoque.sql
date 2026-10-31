-- Fatia 17: pegar para vender também quando o estoque geral não tem (ele fica negativo, como na venda);
-- a contagem do dia acerta depois. Devolver continua limitado ao que está com a pessoa.
create or replace function public.mover_estoque_pessoa(p_chave uuid, p_tipo text, p_itens jsonb, p_participante uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_pessoa uuid := coalesce(p_participante, auth.uid());
  v_item jsonb;
  v_var uuid;
  v_qtd numeric;
  v_nome text;
  v_disponivel numeric;
begin
  if not privado.eh_participante() then
    raise exception 'Faça login com um participante ativo.';
  end if;
  if p_chave is null then
    raise exception 'Envio sem chave. Atualize a página e tente de novo.';
  end if;
  if exists (select 1 from public.estoque_pessoas where chave_idempotencia = p_chave) then
    return;
  end if;
  if p_tipo not in ('retirada', 'devolucao') then
    raise exception 'Escolha pegar ou devolver.';
  end if;
  if v_pessoa <> auth.uid() and not privado.eh_admin() then
    raise exception 'Só o administrador registra para outra pessoa.';
  end if;
  if not exists (select 1 from public.perfis where id = v_pessoa and ativo) then
    raise exception 'Participante não encontrado ou inativo.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha pelo menos um produto.';
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_var := (v_item ->> 'variacao_id')::uuid;
    v_qtd := round((v_item ->> 'quantidade')::numeric, 2);
    if v_qtd is null or v_qtd <= 0 or v_qtd > 1000 then
      raise exception 'A quantidade precisa ser maior que zero, como 10.';
    end if;
    select pr.nome || case when va.nome is null or va.nome = 'Única' then '' else ' · ' || va.nome end into v_nome
      from public.variacoes va join public.produtos pr on pr.id = va.produto_id
     where va.id = v_var and pr.tipo = 'simples';
    if v_nome is null then
      raise exception 'Produto não encontrado (kits não entram: pegue os produtos que formam o kit).';
    end if;
    perform privado.travar_saldo_variacao(v_var);
    if p_tipo = 'devolucao' then
      v_disponivel := privado.saldo_pessoa(v_pessoa, v_var);
      if v_qtd > v_disponivel then
        raise exception 'Só tem % de % com esta pessoa.', trim_scale(greatest(v_disponivel, 0)), v_nome;
      end if;
    end if;
    insert into public.estoque_pessoas (desafio_id, participante_id, variacao_id, tipo, quantidade, chave_idempotencia, criado_por)
    values (privado.desafio_atual_id(), v_pessoa, v_var, p_tipo, case when p_tipo = 'retirada' then v_qtd else -v_qtd end, p_chave, auth.uid());
  end loop;
end
$$;
