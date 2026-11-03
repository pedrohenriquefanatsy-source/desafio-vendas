-- Fatia 22: cancelar uma compra também quando parte do insumo já foi usada (o estoque fica negativo até lançar a compra
-- certa), para poder corrigir a data ou os dados de uma compra lançada errado: cancela e lança de novo.
create or replace function public.cancelar_compra(p_compra uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.compras;
  it record;
begin
  select * into c from public.compras where id = p_compra for update;
  if c.id is null then
    raise exception 'Compra não encontrada.';
  end if;
  if c.situacao = 'cancelada' then
    return;
  end if;
  if not privado.pode_cancelar(c.criado_por, c.criado_em) then
    raise exception 'Só o administrador cancela compras de outras pessoas ou com mais de 30 minutos.';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then
    raise exception 'Diga o motivo do cancelamento.';
  end if;
  if c.pago_por = 'participante' then
    perform pg_advisory_xact_lock(hashtext('reembolso:' || c.participante_id::text));
    if privado.devido_a(c.participante_id) < c.total then
      raise exception 'Esta compra já foi reembolsada. Cancele o reembolso antes (Caixa → A reembolsar).';
    end if;
  end if;
  for it in select * from public.compra_itens where compra_id = c.id order by insumo_id loop
    perform privado.travar_saldo_insumo(it.insumo_id);
    perform privado.movimentar(it.insumo_id, null, 'estorno', -it.quantidade_base, it.custo_por_base, 'compra', c.id,
                               'Cancelamento: ' || btrim(p_motivo));
  end loop;
  if c.pago_por = 'caixa' and c.total > 0 then
    insert into public.lancamentos_caixa (desafio_id, tipo, valor, descricao, origem_tipo, origem_id, criado_por)
    values (c.desafio_id, 'estorno', c.total, 'Cancelamento de compra: ' || btrim(p_motivo), 'compra', c.id, auth.uid());
  end if;
  update public.compras
     set situacao = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = btrim(p_motivo)
   where id = c.id;
end
$$;
