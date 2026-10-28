import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Enums, Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";

// Cadastro: insumos, conversões, receitas, produtos, variações, embalagens e kits.
// Todos os custos vêm das views do banco (v_custo_*); aqui não se calcula nada.

export type Insumo = Tables<"insumos">;
export type TipoInsumo = Enums<"tipo_insumo">;
export type TipoProduto = Enums<"tipo_produto">;
export type CustoReceita = Tables<"v_custo_receitas">;
export type CustoItemReceita = Tables<"v_custo_receita_itens">;
export type CustoVariacao = Tables<"v_custo_variacoes">;
export type CustoEmbalagem = Tables<"v_custo_embalagens">;
export type MargemForma = Tables<"v_margem_formas">;
export type UnidadeInsumo = Tables<"v_unidades_insumo">;

export const NOMES_TIPO_INSUMO: Record<TipoInsumo, string> = {
  ingrediente: "Ingrediente",
  embalagem: "Embalagem",
  outro: "Outro",
};

export const UNIDADES_BASE = [
  { codigo: "g", nome: "grama (g)", dica: "Para o que se pesa: farinha, açúcar, chocolate…" },
  { codigo: "ml", nome: "mililitro (ml)", dica: "Para o que se mede em volume: leite, óleo…" },
  { codigo: "und", nome: "unidade (und)", dica: "Para o que se conta: ovos, potes, adesivos…" },
] as const;

const DUP_INSUMO = { duplicado: "Já existe um insumo com esse nome." };
const DUP_PRODUTO = { duplicado: "Já existe um produto com esse nome." };
const DUP_VARIACAO = { duplicado: "Esse produto já tem um sabor com esse nome." };

function falhou(erro: { code?: string; message?: string }, contexto?: { duplicado?: string }): Resultado {
  return { ok: false, erro: mensagemDeErro(erro, contexto) };
}

async function db() {
  return criarClienteServidor();
}

async function lista<T>(promessa: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await promessa;
  if (error) throw new Error(mensagemDeErro(error));
  return data ?? [];
}

// ── Insumos ─────────────────────────────────────────────────────────────────

export async function listarInsumos(): Promise<Insumo[]> {
  const s = await db();
  return lista(s.from("insumos").select("*").order("ativo", { ascending: false }).order("tipo").order("nome"));
}

export async function obterInsumo(id: string) {
  const s = await db();
  const [insumo, unidades, historico, estoque] = await Promise.all([
    s.from("insumos").select("*").eq("id", id).maybeSingle(),
    lista(s.from("v_unidades_insumo").select("*").eq("insumo_id", id).order("personalizada").order("quantidade_em_base")),
    lista(s.from("insumo_custos_historico").select("*").eq("insumo_id", id).order("registrado_em", { ascending: false }).limit(20)),
    s.from("v_estoque_insumos").select("saldo").eq("insumo_id", id).maybeSingle(),
  ]);
  if (insumo.error) throw new Error(mensagemDeErro(insumo.error));
  if (!insumo.data) return null;
  const { data: conversoes, error } = await s.from("insumo_conversoes").select("*").eq("insumo_id", id).order("unidade");
  if (error) throw new Error(mensagemDeErro(error));
  return { insumo: insumo.data, unidades, conversoes: conversoes ?? [], historico, saldo: Number(estoque.data?.saldo ?? 0) };
}

export async function unidadesPorInsumo(): Promise<Record<string, UnidadeInsumo[]>> {
  const s = await db();
  const todas = await lista(s.from("v_unidades_insumo").select("*").order("quantidade_em_base"));
  const mapa: Record<string, UnidadeInsumo[]> = {};
  for (const u of todas) (mapa[u.insumo_id ?? ""] ??= []).push(u);
  return mapa;
}

export async function cadastrarInsumo(dados: {
  chave: string;
  nome: string;
  tipo: TipoInsumo;
  unidade_base: string;
  tamanho: number | null;
  preco: number | null;
  estoque: number | null;
}): Promise<Resultado & { id?: string }> {
  const s = await db();
  const { data, error } = await s.rpc("cadastrar_insumo", {
    p_chave: dados.chave,
    p_nome: dados.nome,
    p_tipo: dados.tipo,
    p_unidade_base: dados.unidade_base,
    ...(dados.tamanho != null ? { p_tamanho: dados.tamanho } : {}),
    ...(dados.preco != null ? { p_preco: dados.preco } : {}),
    ...(dados.estoque != null ? { p_estoque: dados.estoque } : {}),
  });
  if (error) return falhou(error, DUP_INSUMO);
  return { ok: true, mensagem: `${dados.nome} cadastrado.`, id: data };
}

export async function alterarInsumo(
  id: string,
  dados: { nome: string; tipo: TipoInsumo; fornecedor: string | null; validade: string | null; estoque_minimo: number | null; ativo: boolean },
): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("insumos").update(dados).eq("id", id).select("id");
  if (error) return falhou(error, DUP_INSUMO);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Alterações salvas." };
}

export async function definirEmbalagemInsumo(id: string, tamanho: number, preco: number): Promise<Resultado> {
  const s = await db();
  const { error } = await s.rpc("definir_embalagem_insumo", { p_insumo: id, p_tamanho: tamanho, p_preco: preco });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Embalagem e preço salvos. Custos das receitas e produtos atualizados." };
}

export async function criarConversao(insumoId: string, unidade: string, quantidade: number): Promise<Resultado> {
  const s = await db();
  const { error } = await s.from("insumo_conversoes").insert({ insumo_id: insumoId, unidade, quantidade_em_base: quantidade });
  if (error) return falhou(error, { duplicado: `Já existe a unidade "${unidade}" para este insumo.` });
  return { ok: true, mensagem: "Conversão cadastrada." };
}

export async function alterarConversao(id: string, quantidade: number): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("insumo_conversoes").update({ quantidade_em_base: quantidade }).eq("id", id).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Conversão atualizada. Custos recalculados." };
}

export async function removerConversao(id: string): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("insumo_conversoes").delete().eq("id", id).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Conversão removida." };
}

// ── Receitas: itens (a receita em si nasce junto com o sabor, pelo banco) ────

export async function adicionarItemReceita(receitaId: string, insumoId: string, quantidade: number, unidade: string): Promise<Resultado> {
  const s = await db();
  const { error } = await s.from("receita_itens").insert({ receita_id: receitaId, insumo_id: insumoId, quantidade, unidade });
  if (error) return falhou(error, { duplicado: "Esse insumo já está na receita. Altere a quantidade dele na lista." });
  return { ok: true, mensagem: "Insumo adicionado." };
}

export async function alterarItemReceita(id: string, quantidade: number, unidade: string): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("receita_itens").update({ quantidade, unidade }).eq("id", id).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Quantidade salva." };
}

export async function removerItemReceita(id: string): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("receita_itens").delete().eq("id", id).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Insumo removido da receita." };
}

// ── Produtos, variações, embalagens e kits ──────────────────────────────────

export async function listarCustosVariacoes(): Promise<CustoVariacao[]> {
  const s = await db();
  return lista(
    s.from("v_custo_variacoes").select("*").order("ativa", { ascending: false }).order("ordem_produto").order("produto").order("ordem").order("variacao"),
  );
}

export async function listarProdutos(): Promise<Tables<"produtos">[]> {
  const s = await db();
  return lista(s.from("produtos").select("*").order("ativo", { ascending: false }).order("ordem").order("nome"));
}

export async function obterProduto(id: string) {
  const s = await db();
  const { data: produto, error } = await s.from("produtos").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(mensagemDeErro(error));
  if (!produto) return null;
  const custos = await lista(s.from("v_custo_variacoes").select("*").eq("produto_id", id).order("ordem").order("variacao"));
  const ids = custos.map((c) => c.variacao_id ?? "");
  const [embalagens, componentes, margens] = ids.length
    ? await Promise.all([
        lista(s.from("v_custo_embalagens").select("*").in("variacao_id", ids).order("insumo")),
        lista(s.from("kit_componentes").select("*").in("kit_variacao_id", ids)),
        lista(s.from("v_margem_formas").select("*").in("variacao_id", ids).order("taxa_percentual")),
      ])
    : [[], [], []];
  const receitaIds = [...new Set(custos.map((c) => c.receita_id).filter((r): r is string => Boolean(r)))];
  const [receitas, itensReceita, custosReceita, usoReceita] = receitaIds.length
    ? await Promise.all([
        lista(s.from("receitas").select("*").in("id", receitaIds)),
        lista(s.from("v_custo_receita_itens").select("*").in("receita_id", receitaIds).order("insumo")),
        lista(s.from("v_custo_receitas").select("*").in("receita_id", receitaIds)),
        lista(s.from("v_custo_variacoes").select("receita_id, variacao_id, produto, variacao").in("receita_id", receitaIds)),
      ])
    : [[], [], [], []];
  return { produto, custos, embalagens, componentes, margens, receitas, itensReceita, custosReceita, usoReceita };
}

export async function criarProduto(dados: {
  nome: string;
  categoria: string | null;
  tipo: TipoProduto;
  apelidos: string[];
  preco: number;
  sabor: string;
}): Promise<Resultado & { id?: string }> {
  const s = await db();
  const { preco, sabor, ...produto } = dados;
  const { data, error } = await s.from("produtos").insert(produto).select("id").single();
  if (error) return falhou(error, DUP_PRODUTO);
  // Todo produto nasce com um sabor ("Única" se ele não tem sabores); os outros entram depois.
  const v = await s.from("variacoes").insert({ produto_id: data.id, nome: sabor || "Única", preco_venda: preco });
  if (v.error) return falhou(v.error);
  return { ok: true, mensagem: `${dados.nome} cadastrado.`, id: data.id };
}

export async function alterarProduto(
  id: string,
  dados: { nome: string; categoria: string | null; apelidos: string[]; ativo: boolean },
): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("produtos").update(dados).eq("id", id).select("id");
  if (error) return falhou(error, DUP_PRODUTO);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Alterações salvas." };
}

export async function criarVariacao(produtoId: string, nome: string, preco: number): Promise<Resultado & { id?: string }> {
  const s = await db();
  // O sabor novo entra depois dos que já existem (na ordem em que foram criados).
  const ultimo = await s.from("variacoes").select("ordem").eq("produto_id", produtoId).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await s
    .from("variacoes")
    .insert({ produto_id: produtoId, nome, preco_venda: preco, ordem: (ultimo.data?.ordem ?? -1) + 1 })
    .select("id")
    .single();
  if (error) return falhou(error, DUP_VARIACAO);
  return { ok: true, mensagem: `Sabor ${nome} criado.`, id: data.id };
}

export async function alterarVariacao(
  id: string,
  dados: { nome: string; preco_venda: number; ativa: boolean },
): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("variacoes").update(dados).eq("id", id).select("id");
  if (error) return falhou(error, DUP_VARIACAO);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Sabor salvo. Custo e margem recalculados." };
}

export async function adicionarEmbalagem(variacaoId: string, insumoId: string, quantidade: number, unidade: string): Promise<Resultado> {
  const s = await db();
  const { error } = await s.from("variacao_embalagens").insert({ variacao_id: variacaoId, insumo_id: insumoId, quantidade, unidade });
  if (error) return falhou(error, { duplicado: "Essa embalagem já está neste sabor." });
  return { ok: true, mensagem: "Embalagem adicionada." };
}

export async function removerEmbalagem(id: string): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("variacao_embalagens").delete().eq("id", id).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Embalagem removida." };
}

export async function adicionarComponente(kitVariacaoId: string, componenteId: string, quantidade: number): Promise<Resultado> {
  const s = await db();
  const { error } = await s
    .from("kit_componentes")
    .insert({ kit_variacao_id: kitVariacaoId, componente_variacao_id: componenteId, quantidade });
  if (error) return falhou(error, { duplicado: "Esse produto já está no kit. Altere a quantidade removendo e adicionando de novo." });
  return { ok: true, mensagem: "Produto adicionado ao kit." };
}

export async function removerComponente(id: string): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("kit_componentes").delete().eq("id", id).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Produto removido do kit." };
}

// ── Receita dentro do sabor ─────────────────────────────────────────────────

export async function criarReceitaSabor(variacaoId: string, rendimento: number): Promise<Resultado> {
  const s = await db();
  const { error } = await s.rpc("criar_receita_variacao", { p_variacao: variacaoId, p_rendimento: rendimento });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Receita criada. Agora adicione os ingredientes." };
}

export async function copiarReceitaSabor(origemId: string, destinoId: string): Promise<Resultado> {
  const s = await db();
  const { error } = await s.rpc("copiar_receita_variacao", { p_origem: origemId, p_destino: destinoId });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Receita copiada. Troque o que muda neste sabor." };
}

export async function alterarRendimento(receitaId: string, rendimento: number): Promise<Resultado> {
  const s = await db();
  const { data, error } = await s.from("receitas").update({ rendimento_unidades: rendimento }).eq("id", receitaId).select("id");
  if (error) return falhou(error);
  if (!data.length) return falhou({ code: "42501" });
  return { ok: true, mensagem: "Rendimento salvo. Custo por unidade recalculado." };
}

// ── Excluir o que nunca foi usado ───────────────────────────────────────────

export type TipoExclusao = "insumo" | "variacao" | "produto";

// null = pode excluir; texto = por que não pode (e o que fazer no lugar).
export async function motivoNaoExcluir(tipo: TipoExclusao, id: string): Promise<string | null> {
  const s = await db();
  const { data, error } = await s.rpc("motivo_nao_excluir", { p_tipo: tipo, p_id: id });
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export async function excluirCadastro(tipo: TipoExclusao, id: string): Promise<Resultado> {
  const s = await db();
  const { error } = await s.rpc("excluir_cadastro", { p_tipo: tipo, p_id: id });
  if (error) return falhou(error);
  return { ok: true };
}
