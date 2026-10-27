-- Fatia 8: os itens de cada compra também vão para a auditoria (Seção 4.7).
-- As demais tabelas sem gatilho são histórico (insumo_custos_historico), calculadas
-- pelo banco (saldos_estoque) ou fixas (unidades).
create trigger compra_itens_auditoria after insert or update or delete on public.compra_itens
  for each row execute function privado.registrar_auditoria();
