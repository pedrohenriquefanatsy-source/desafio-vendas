-- Alertas de desempenho do Supabase: índices nas chaves estrangeiras e auth.uid()
-- avaliado uma vez por consulta (não uma vez por linha) na política de perfis.
create index compra_itens_insumo on public.compra_itens (insumo_id);
create index compras_desafio on public.compras (desafio_id);
create index compras_participante on public.compras (participante_id);
create index insumo_custos_historico_compra on public.insumo_custos_historico (compra_id);
create index insumos_unidade_base on public.insumos (unidade_base);
create index kit_componentes_componente on public.kit_componentes (componente_variacao_id);
create index lancamentos_caixa_desafio on public.lancamentos_caixa (desafio_id);
create index movimentos_estoque_desafio on public.movimentos_estoque (desafio_id);
create index producoes_desafio on public.producoes (desafio_id);
create index producoes_receita on public.producoes (receita_id);
create index producoes_variacao on public.producoes (variacao_id);
create index receita_itens_insumo on public.receita_itens (insumo_id);
create index variacao_embalagens_insumo on public.variacao_embalagens (insumo_id);
create index variacoes_receita on public.variacoes (receita_id);

alter policy perfis_leitura on public.perfis using (id = (select auth.uid()) or privado.eh_participante());
