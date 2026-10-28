-- Fatia 9: cadastro simplificado (insumo em uma tela, receita dentro do sabor, exclusão segura).
-- Nada muda nas contas: custos, estoque e vendas continuam saindo das mesmas tabelas e views.
-- Muda a forma de cadastrar: o insumo nasce com "embalagem + preço", a receita nasce no sabor
-- do produto, e o que nunca foi usado pode ser excluído (o que já tem histórico só desativa).

-- ── Insumo em uma tela ───────────────────────────────────────────────────────
-- Embalagem e preço viram a unidade "embalagem" do insumo (ex.: 1 embalagem = 395 g a R$ 7,90).
-- O custo por grama, ml ou unidade é calculado pelo banco (definir_custo_insumo), sem arredondar antes.
create function public.cadastrar_insumo(
  p_chave uuid, p_nome text, p_tipo public.tipo_insumo, p_unidade_base text,
  p_tamanho numeric default null, p_preco numeric default null, p_estoque numeric default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cadastra insumos.';
  end if;
  if p_nome is null or char_length(btrim(p_nome)) not between 2 and 60 then
    raise exception 'Dê um nome ao insumo (de 2 a 60 letras).';
  end if;
  if p_unidade_base is null or p_unidade_base not in ('g', 'ml', 'und') then
    raise exception 'Escolha como o insumo é medido: g, ml ou und.';
  end if;
  if (p_tamanho is null) <> (p_preco is null) then
    raise exception 'Informe o tamanho da embalagem e o preço dela, ou deixe os dois em branco.';
  end if;
  if p_tamanho is not null and p_tamanho <= 0 then
    raise exception 'O tamanho da embalagem precisa ser maior que zero, como 395.';
  end if;
  if p_preco is not null and p_preco < 0 then
    raise exception 'O preço da embalagem precisa ser zero ou mais, como 7,90.';
  end if;
  if p_estoque is not null and p_estoque < 0 then
    raise exception 'A quantidade em estoque precisa ser zero ou mais.';
  end if;
  if exists (select 1 from public.insumos where lower(btrim(nome)) = lower(btrim(p_nome))) then
    raise exception 'Já existe um insumo com esse nome.';
  end if;

  insert into public.insumos (nome, tipo, unidade_base) values (btrim(p_nome), p_tipo, p_unidade_base)
  returning id into v_id;
  if p_tamanho is not null then
    insert into public.insumo_conversoes (insumo_id, unidade, quantidade_em_base) values (v_id, 'embalagem', p_tamanho);
    perform public.definir_custo_insumo(v_id, p_preco, 'embalagem');
  end if;
  if coalesce(p_estoque, 0) > 0 then
    perform public.ajustar_estoque(p_chave, v_id, null, p_estoque, 'Estoque inicial');
  end if;
  return v_id;
end
$$;

-- Troca o tamanho e o preço da embalagem de um insumo que já existe.
create function public.definir_embalagem_insumo(p_insumo uuid, p_tamanho numeric, p_preco numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador altera preços.';
  end if;
  if p_tamanho is null or p_tamanho <= 0 then
    raise exception 'O tamanho da embalagem precisa ser maior que zero, como 395.';
  end if;
  if p_preco is null or p_preco < 0 then
    raise exception 'O preço da embalagem precisa ser zero ou mais, como 7,90.';
  end if;
  if not exists (select 1 from public.insumos where id = p_insumo) then
    raise exception 'Insumo não encontrado.';
  end if;
  insert into public.insumo_conversoes (insumo_id, unidade, quantidade_em_base) values (p_insumo, 'embalagem', p_tamanho)
  on conflict (insumo_id, lower(btrim(unidade))) do update set quantidade_em_base = excluded.quantidade_em_base;
  perform public.definir_custo_insumo(p_insumo, p_preco, 'embalagem');
end
$$;

-- ── Receita dentro do sabor ──────────────────────────────────────────────────
-- Cada sabor (variação) de um produto simples tem a receita dele. Por baixo continua existindo
-- uma receita ligada à variação; o nome dela acompanha "Produto · Sabor".
create function privado.nome_receita(p_variacao uuid)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_base text := left(privado.nome_variacao(p_variacao), 60);
begin
  if exists (select 1 from public.receitas r
              where lower(btrim(r.nome)) = lower(btrim(v_base))
                and r.id is distinct from (select receita_id from public.variacoes where id = p_variacao)) then
    return left(v_base, 54) || ' (' || left(p_variacao::text, 4) || ')';
  end if;
  return v_base;
end
$$;

create function public.criar_receita_variacao(p_variacao uuid, p_rendimento numeric)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.variacoes;
  v_receita uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cadastra receitas.';
  end if;
  if p_rendimento is null or p_rendimento <= 0 then
    raise exception 'Informe quantas unidades a receita rende, como 24.';
  end if;
  select * into v from public.variacoes where id = p_variacao for update;
  if v.id is null then
    raise exception 'Sabor não encontrado.';
  end if;
  if (select tipo from public.produtos where id = v.produto_id) = 'kit' then
    raise exception 'Kit não tem receita: o custo vem dos produtos que formam o kit.';
  end if;
  if v.receita_id is not null then
    raise exception 'Este sabor já tem receita.';
  end if;
  insert into public.receitas (nome, rendimento_unidades) values (privado.nome_receita(p_variacao), p_rendimento)
  returning id into v_receita;
  update public.variacoes set receita_id = v_receita where id = p_variacao;
  return v_receita;
end
$$;

-- Copia ingredientes, rendimento e embalagem de outro sabor (a massa-base é igual, o recheio muda).
create function public.copiar_receita_variacao(p_origem uuid, p_destino uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  o public.variacoes;
  d public.variacoes;
  v_receita uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador cadastra receitas.';
  end if;
  select * into o from public.variacoes where id = p_origem;
  select * into d from public.variacoes where id = p_destino for update;
  if o.id is null or d.id is null or o.id = d.id then
    raise exception 'Escolha outro sabor para copiar.';
  end if;
  if o.receita_id is null then
    raise exception 'O sabor escolhido ainda não tem receita.';
  end if;
  if (select tipo from public.produtos where id = d.produto_id) = 'kit' then
    raise exception 'Kit não tem receita: o custo vem dos produtos que formam o kit.';
  end if;
  if d.receita_id is not null and exists (select 1 from public.receita_itens where receita_id = d.receita_id) then
    raise exception 'Este sabor já tem ingredientes. Tire-os antes de copiar de outro sabor.';
  end if;

  v_receita := d.receita_id;
  if v_receita is null then
    insert into public.receitas (nome, rendimento_unidades, observacao)
    select privado.nome_receita(p_destino), rendimento_unidades, observacao from public.receitas where id = o.receita_id
    returning id into v_receita;
    update public.variacoes set receita_id = v_receita where id = p_destino;
  else
    update public.receitas r set rendimento_unidades = o2.rendimento_unidades, observacao = o2.observacao
      from public.receitas o2 where o2.id = o.receita_id and r.id = v_receita;
  end if;
  insert into public.receita_itens (receita_id, insumo_id, quantidade, unidade)
  select v_receita, insumo_id, quantidade, unidade from public.receita_itens where receita_id = o.receita_id;
  if not exists (select 1 from public.variacao_embalagens where variacao_id = p_destino) then
    insert into public.variacao_embalagens (variacao_id, insumo_id, quantidade, unidade)
    select p_destino, insumo_id, quantidade, unidade from public.variacao_embalagens where variacao_id = p_origem;
  end if;
  return v_receita;
end
$$;

-- O nome da receita acompanha o produto e o sabor quando eles são renomeados.
create function privado.sincronizar_nome_receita()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v record;
begin
  for v in
    select va.id, va.receita_id from public.variacoes va
     where va.receita_id is not null
       and ((tg_table_name = 'variacoes' and va.id = new.id) or (tg_table_name = 'produtos' and va.produto_id = new.id))
       and not exists (select 1 from public.variacoes o where o.receita_id = va.receita_id and o.id <> va.id)
  loop
    begin
      update public.receitas set nome = privado.nome_receita(v.id) where id = v.receita_id;
    exception when unique_violation then
      null;
    end;
  end loop;
  return new;
end
$$;
create trigger variacoes_nome_receita after update of nome on public.variacoes
  for each row when (old.nome is distinct from new.nome) execute function privado.sincronizar_nome_receita();
create trigger produtos_nome_receita after update of nome on public.produtos
  for each row when (old.nome is distinct from new.nome) execute function privado.sincronizar_nome_receita();

-- ── Excluir o que nunca foi usado ────────────────────────────────────────────
-- Tem histórico (compra, venda, produção, receita em uso)? Não exclui: o relatório e o caixa ficariam
-- sem base. Esses só se desativam. Contagens de estoque (ajustes) não contam como uso e saem junto.
create function privado.bloqueio_exclusao(p_tipo text, p_id uuid, p_ignorar_ultimo boolean default false)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_nome text;
begin
  if p_tipo = 'insumo' then
    select nome into v_nome from public.insumos where id = p_id;
    if v_nome is null then
      return 'Insumo não encontrado.';
    end if;
    if exists (select 1 from public.receita_itens where insumo_id = p_id)
       or exists (select 1 from public.variacao_embalagens where insumo_id = p_id) then
      return 'Está em uma receita ou em uma embalagem de produto. Tire-o de lá antes de excluir.';
    end if;
    if exists (select 1 from public.compra_itens where insumo_id = p_id)
       or exists (select 1 from public.movimentos_estoque where insumo_id = p_id and tipo <> 'ajuste') then
      return 'Já tem compras ou movimentações no estoque. Para o histórico continuar certo, desative em vez de excluir.';
    end if;
    return null;
  elsif p_tipo = 'variacao' then
    select privado.nome_variacao(id) into v_nome from public.variacoes where id = p_id;
    if v_nome is null then
      return 'Sabor não encontrado.';
    end if;
    if exists (select 1 from public.venda_itens where variacao_id = p_id) then
      return v_nome || ' já tem vendas. Para o histórico continuar certo, desative em vez de excluir.';
    end if;
    if exists (select 1 from public.producoes where variacao_id = p_id)
       or exists (select 1 from public.movimentos_estoque where variacao_id = p_id and tipo <> 'ajuste') then
      return v_nome || ' já tem produção ou movimentações no estoque. Desative em vez de excluir.';
    end if;
    if exists (select 1 from public.kit_componentes where componente_variacao_id = p_id) then
      return v_nome || ' faz parte de um kit. Tire-o do kit antes de excluir.';
    end if;
    if not p_ignorar_ultimo
       and (select count(*) from public.variacoes where produto_id = (select produto_id from public.variacoes where id = p_id)) = 1 then
      return 'É o único sabor do produto. Para tirar tudo, exclua o produto.';
    end if;
    return null;
  elsif p_tipo = 'produto' then
    if not exists (select 1 from public.produtos where id = p_id) then
      return 'Produto não encontrado.';
    end if;
    return (select min(privado.bloqueio_exclusao('variacao', va.id, true)) from public.variacoes va where va.produto_id = p_id);
  end if;
  return 'Tipo desconhecido.';
end
$$;

-- Para as telas mostrarem "Excluir" só quando dá, e dizerem por que não dá.
create function public.motivo_nao_excluir(p_tipo text, p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case when privado.eh_participante() then privado.bloqueio_exclusao(p_tipo, p_id) end
$$;

-- Apaga as contagens de estoque do item, deixando rastro na auditoria.
create function privado.apagar_contagens(p_insumo uuid, p_variacao uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.auditoria (tabela, registro_id, acao, antes, usuario_id)
  select 'movimentos_estoque', m.id::text, 'exclusao', to_jsonb(m), auth.uid()
    from public.movimentos_estoque m
   where m.tipo = 'ajuste' and m.insumo_id is not distinct from p_insumo and m.variacao_id is not distinct from p_variacao;
  delete from public.movimentos_estoque m
   where m.tipo = 'ajuste' and m.insumo_id is not distinct from p_insumo and m.variacao_id is not distinct from p_variacao;
  delete from public.saldos_estoque s
   where s.insumo_id is not distinct from p_insumo and s.variacao_id is not distinct from p_variacao;
end
$$;

create function privado.apagar_variacao(p_variacao uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_receita uuid := (select receita_id from public.variacoes where id = p_variacao);
begin
  perform privado.apagar_contagens(null, p_variacao);
  delete from public.demanda_estimada where variacao_id = p_variacao;
  delete from public.variacao_embalagens where variacao_id = p_variacao;
  delete from public.kit_componentes where kit_variacao_id = p_variacao;
  delete from public.variacoes where id = p_variacao;
  if v_receita is not null and not exists (select 1 from public.variacoes where receita_id = v_receita)
     and not exists (select 1 from public.producoes where receita_id = v_receita) then
    delete from public.receita_itens where receita_id = v_receita;
    delete from public.receitas where id = v_receita;
  end if;
end
$$;

create function public.excluir_cadastro(p_tipo text, p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_motivo text;
  v_var uuid;
begin
  if not privado.eh_admin() then
    raise exception 'Só o administrador exclui cadastros.';
  end if;
  if p_tipo = 'insumo' then
    perform 1 from public.insumos where id = p_id for update;
  elsif p_tipo = 'variacao' then
    perform 1 from public.variacoes where id = p_id for update;
  elsif p_tipo = 'produto' then
    perform 1 from public.produtos where id = p_id for update;
  else
    raise exception 'Não sei excluir esse tipo de cadastro.';
  end if;
  v_motivo := privado.bloqueio_exclusao(p_tipo, p_id);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;

  if p_tipo = 'insumo' then
    perform privado.apagar_contagens(p_id, null);
    delete from public.insumo_custos_historico where insumo_id = p_id;
    delete from public.insumo_conversoes where insumo_id = p_id;
    delete from public.insumos where id = p_id;
  elsif p_tipo = 'variacao' then
    perform privado.apagar_variacao(p_id);
  else
    for v_var in select id from public.variacoes where produto_id = p_id order by id loop
      perform privado.apagar_variacao(v_var);
    end loop;
    delete from public.produtos where id = p_id;
  end if;
end
$$;

grant execute on function
  public.cadastrar_insumo(uuid, text, public.tipo_insumo, text, numeric, numeric, numeric),
  public.definir_embalagem_insumo(uuid, numeric, numeric),
  public.criar_receita_variacao(uuid, numeric),
  public.copiar_receita_variacao(uuid, uuid),
  public.motivo_nao_excluir(text, uuid),
  public.excluir_cadastro(text, uuid)
  to authenticated;
