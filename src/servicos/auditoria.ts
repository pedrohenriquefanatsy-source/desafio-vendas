import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Json, Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro } from "./erros";

// Auditoria (Seção 4.7): cada inclusão, alteração e exclusão nas tabelas importantes,
// com o valor anterior e o novo. Gravada por gatilhos no banco; só o administrador lê.

export type RegistroAuditoria = Tables<"auditoria">;

export const NOMES_TABELA: Record<string, string> = {
  vendas: "Vendas",
  venda_itens: "Itens de venda",
  recebimentos: "Recebimentos",
  compras: "Compras",
  compra_itens: "Itens de compra",
  despesas: "Despesas",
  reembolsos: "Reembolsos",
  aportes: "Aportes",
  lancamentos_caixa: "Livro de caixa",
  movimentos_estoque: "Estoque",
  producoes: "Produção",
  insumos: "Insumos",
  insumo_conversoes: "Conversões de unidade",
  receitas: "Receitas",
  receita_itens: "Itens de receita",
  produtos: "Produtos",
  variacoes: "Variações e preços",
  variacao_embalagens: "Embalagens",
  kit_componentes: "Kits",
  desafios: "Desafio e meta",
  demanda_estimada: "Demanda estimada",
  formas_pagamento: "Formas de pagamento",
  perfis: "Participantes",
};

export const NOMES_ACAO: Record<string, string> = { inclusao: "Incluiu", alteracao: "Alterou", exclusao: "Excluiu" };

// Campos que mudam em toda alteração e não dizem nada a quem lê.
const IGNORAR = new Set(["alterado_em", "alterado_por", "criado_em", "criado_por"]);

export type Mudanca = { campo: string; antes: string; depois: string };

function mostrar(v: Json | undefined): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// O que mudou entre antes e depois (ou o registro inteiro, na inclusão e na exclusão).
export function mudancas(r: RegistroAuditoria): Mudanca[] {
  const antes = (r.antes ?? {}) as Record<string, Json>;
  const depois = (r.depois ?? {}) as Record<string, Json>;
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((c) => !IGNORAR.has(c) && c !== "id");
  return campos
    .filter((c) => r.acao !== "alteracao" || JSON.stringify(antes[c]) !== JSON.stringify(depois[c]))
    .map((c) => ({ campo: c, antes: mostrar(antes[c]), depois: mostrar(depois[c]) }));
}

export async function listarAuditoria(filtro: { tabela?: string; antesDe?: number }) {
  const s = await criarClienteServidor();
  let q = s.from("auditoria").select("*").order("id", { ascending: false }).limit(50);
  if (filtro.tabela) q = q.eq("tabela", filtro.tabela);
  if (filtro.antesDe) q = q.lt("id", filtro.antesDe);
  const { data, error } = await q;
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}
