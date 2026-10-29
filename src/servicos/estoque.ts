import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarQuantidade } from "@/lib/numeros";
import type { Enums, Json, Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";

// Compras, livro de estoque e produção. Saldos, faltas e custos vêm do banco
// (funções e views da fatia 3); aqui só se lê e se repassa.

export type EstoqueInsumo = Tables<"v_estoque_insumos">;
export type EstoqueProduto = Tables<"v_estoque_produtos">;
export type ProducaoPossivel = Tables<"v_producao_possivel">;
export type ItemListaCompras = Tables<"v_lista_compras">;
export type Producao = Tables<"producoes">;
export type Movimento = Tables<"movimentos_estoque">;
export type PagoPor = Enums<"pago_por">;
export type ItemCompra = { insumo_id: string; quantidade: number; unidade: string; valor: number };

// O banco aceita nulo nestes parâmetros (insumo OU produto); o gerador de tipos não marca isso.
const NULO = null as unknown as string;

export const NOMES_MOVIMENTO: Record<Enums<"tipo_movimento">, string> = {
  compra: "Compra",
  consumo_producao: "Usado na produção",
  entrada_producao: "Produzido",
  venda: "Venda",
  doacao: "Doação",
  perda: "Perda",
  ajuste: "Ajuste de contagem",
  estorno: "Cancelamento",
};

function falhou(erro: { code?: string; message?: string }): Resultado {
  return { ok: false, erro: mensagemDeErro(erro) };
}

async function lista<T>(promessa: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const { data, error } = await promessa;
  if (error) throw new Error(mensagemDeErro(error));
  return data ?? [];
}

// ── Leituras ────────────────────────────────────────────────────────────────

export async function listarEstoqueInsumos(): Promise<EstoqueInsumo[]> {
  const s = await criarClienteServidor();
  return lista(s.from("v_estoque_insumos").select("*").eq("ativo", true).order("tipo").order("nome"));
}

export async function listarEstoqueProdutos(): Promise<EstoqueProduto[]> {
  const s = await criarClienteServidor();
  return lista(s.from("v_estoque_produtos").select("*").eq("ativa", true).order("produto").order("variacao"));
}

export async function listarProducaoPossivel(): Promise<ProducaoPossivel[]> {
  const s = await criarClienteServidor();
  return lista(s.from("v_producao_possivel").select("*").eq("ativa", true));
}

export async function listarListaCompras(): Promise<ItemListaCompras[]> {
  const s = await criarClienteServidor();
  return lista(s.from("v_lista_compras").select("*").order("tipo").order("nome"));
}

export async function listarProducoes() {
  const s = await criarClienteServidor();
  const [planejadas, concluidas] = await Promise.all([
    lista(s.from("producoes").select("*").eq("situacao", "planejada").order("criado_em")),
    lista(s.from("producoes").select("*").eq("situacao", "concluida").order("concluida_em", { ascending: false }).limit(15)),
  ]);
  return { planejadas, concluidas };
}

export async function listarCompras() {
  const s = await criarClienteServidor();
  const compras = await lista(s.from("compras").select("*").order("criado_em", { ascending: false }).limit(40));
  const ids = compras.map((c) => c.id);
  const itens = ids.length ? await lista(s.from("compra_itens").select("*").in("compra_id", ids)) : [];
  const porCompra: Record<string, Tables<"compra_itens">[]> = {};
  for (const i of itens) (porCompra[i.compra_id] ??= []).push(i);
  const agora = Date.now();
  // Minutos desde o lançamento: a tela mostra "Cancelar" só a quem pode (o banco confere de novo).
  return compras.map((c) => ({ ...c, itens: porCompra[c.id] ?? [], minutos: (agora - new Date(c.criado_em).getTime()) / 60_000 }));
}

export async function obterItemEstoque(tipo: "insumo" | "variacao", id: string) {
  const s = await criarClienteServidor();
  const coluna = tipo === "insumo" ? "insumo_id" : "variacao_id";
  const [item, movimentos] = await Promise.all([
    tipo === "insumo"
      ? s.from("v_estoque_insumos").select("*").eq("insumo_id", id).maybeSingle()
      : s.from("v_estoque_produtos").select("*").eq("variacao_id", id).maybeSingle(),
    lista(s.from("movimentos_estoque").select("*").eq(coluna, id).order("id", { ascending: false }).limit(30)),
  ]);
  if (item.error) throw new Error(mensagemDeErro(item.error));
  return item.data ? { item: item.data, movimentos } : null;
}

// ── Gravações (todas por funções do banco: uma transação cada) ───────────────

export async function registrarCompra(dados: {
  chave: string;
  itens: ItemCompra[];
  pagoPor: PagoPor;
  data: string;
  fornecedor: string;
  observacao: string;
}): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("registrar_compra", {
    p_chave: dados.chave,
    p_itens: dados.itens as unknown as Json,
    p_pago_por: dados.pagoPor,
    p_data: dados.data,
    p_fornecedor: dados.fornecedor,
    p_observacao: dados.observacao,
  });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Compra registrada. O estoque e o custo dos insumos foram atualizados." };
}

export async function cancelarCompra(id: string, motivo: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("cancelar_compra", { p_compra: id, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Compra cancelada. O estoque e o caixa voltaram ao que eram; o registro fica no histórico." };
}

export async function planejarProducao(chave: string, variacaoId: string, fornadas: number, data: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("planejar_producao", { p_chave: chave, p_variacao: variacaoId, p_fornadas: fornadas, p_data: data || NULO });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Produção planejada. O estoque só muda quando você concluir." };
}

type Falta = { insumo_id: string; insumo: string; unidade: string; necessario: number; disponivel: number; falta: number };

// Falta de insumo não trava a produção: ela é registrada e o aviso diz o que faltava no estoque.
export type ResultadoProducao = Resultado & { aviso?: string };

function avisoDeFaltas(faltas: Falta[] | undefined): string | undefined {
  if (!faltas?.length) return undefined;
  return faltas.map((f) => `${f.insumo}: faltavam ${formatarQuantidade(f.falta)} ${f.unidade}`).join("; ");
}

export async function concluirProducao(id: string, boas: number, perdidas: number): Promise<ResultadoProducao> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("concluir_producao", { p_producao: id, p_unidades_boas: boas, p_unidades_perdidas: perdidas });
  if (error) return falhou(error);
  const resposta = data as { ok: boolean; faltas?: Falta[] };
  return { ok: true, mensagem: "Produção registrada.", aviso: avisoDeFaltas(resposta.faltas) };
}

// Registrar uma produção de uma vez: produto, fornadas e quantos renderam.
export async function registrarProducao(
  chave: string,
  variacaoId: string,
  fornadas: number,
  boas: number,
  perdidas: number,
): Promise<ResultadoProducao> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("registrar_producao", {
    p_chave: chave,
    p_variacao: variacaoId,
    p_fornadas: fornadas,
    p_unidades_boas: boas,
    p_unidades_perdidas: perdidas,
  });
  if (error) return falhou(error);
  const resposta = data as { ok: boolean; faltas?: Falta[] };
  return { ok: true, mensagem: "Produção registrada.", aviso: avisoDeFaltas(resposta.faltas) };
}

export async function corrigirProducao(id: string, boas: number): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("corrigir_producao", { p_producao: id, p_unidades_boas: boas });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Corrigido: o estoque do produto e a embalagem foram ajustados." };
}

// Contagem do dia: vários itens de uma vez. itens = [{insumo_id | variacao_id, contado}].
export async function registrarContagem(
  chave: string,
  itens: { insumo_id?: string; variacao_id?: string; contado: number }[],
  justificativa: string,
): Promise<{ resultado: Resultado; alterados: number }> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("registrar_contagem", { p_chave: chave, p_itens: itens as unknown as Json, p_justificativa: justificativa });
  if (error) return { resultado: falhou(error), alterados: 0 };
  return { resultado: { ok: true }, alterados: Number(data ?? 0) };
}

export type SimulacaoProducao = {
  produtos: { variacao_id: string; produto: string; fornadas: number; unidades: number }[];
  insumos: { insumo_id: string; insumo: string; unidade: string; necessario: number; saldo: number; falta: number; custo_falta: number | null }[];
};

export async function simularProducao(itens: { variacao_id: string; fornadas: number }[]): Promise<SimulacaoProducao> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("simular_producao", { p_itens: itens as unknown as Json });
  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as SimulacaoProducao;
}

export async function cancelarProducao(id: string, motivo: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("cancelar_producao", { p_producao: id, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Produção planejada cancelada." };
}

export async function ajustarEstoque(
  chave: string,
  item: { insumo?: string; variacao?: string },
  contado: number,
  justificativa: string,
): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("ajustar_estoque", {
    p_chave: chave,
    p_insumo: item.insumo ?? NULO,
    p_variacao: item.variacao ?? NULO,
    p_contado: contado,
    p_justificativa: justificativa,
  });
  if (error) return falhou(error);
  const diferenca = Number(data);
  return {
    ok: true,
    mensagem:
      diferenca === 0
        ? "Contagem conferida: o estoque já estava certo."
        : `Estoque corrigido (${diferenca > 0 ? "+" : ""}${formatarQuantidade(diferenca)}). O motivo fica no histórico.`,
  };
}

export async function registrarPerda(
  chave: string,
  item: { insumo?: string; variacao?: string },
  quantidade: number,
  unidade: string | null,
  motivo: string,
): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("registrar_perda", {
    p_chave: chave,
    p_insumo: item.insumo ?? NULO,
    p_variacao: item.variacao ?? NULO,
    p_quantidade: quantidade,
    p_unidade: unidade ?? NULO,
    p_motivo: motivo,
  });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Perda registrada. O custo dela entra no lucro estimado do desafio." };
}
