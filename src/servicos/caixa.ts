import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Enums, Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";
import { obterDesafioAtual } from "./desafios";

// Caixa (dinheiro que entrou ou saiu) e resultado (margem − perdas − despesas), sempre
// separados (Seção 4.5). Os números vêm das views do banco; aqui não se calcula nada.

export type LancamentoCaixa = Tables<"v_fluxo_caixa">;
export type Devido = Tables<"v_reembolsos_devidos">;
export type ResultadoDia = Tables<"v_resultado_diario">;
export type OrigemAporte = Enums<"origem_aporte">;
export type PagoPor = Enums<"pago_por">;

export const CATEGORIAS_DESPESA = ["Transporte", "Divulgação", "Material", "Alimentação", "Outros"];

export const NOMES_LANCAMENTO: Record<Enums<"tipo_lancamento_caixa">, string> = {
  recebimento: "Recebimento",
  taxa: "Taxa",
  compra: "Compra",
  despesa: "Despesa",
  reembolso: "Reembolso",
  aporte: "Aporte",
  ajuste: "Ajuste",
  estorno: "Estorno",
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

export async function saldoCaixa() {
  const s = await criarClienteServidor();
  const { data, error } = await s.from("v_saldo_caixa").select("*").single();
  if (error) throw new Error(mensagemDeErro(error));
  return { saldo: Number(data.saldo ?? 0), entradas: Number(data.entradas ?? 0), saidas: Number(data.saidas ?? 0) };
}

// Resultado do desafio em andamento, dia a dia. Sem desafio em andamento: o que foi
// lançado fora de um desafio.
export async function resultadoAtual() {
  const s = await criarClienteServidor();
  const desafio = await obterDesafioAtual();
  const emAndamento = desafio?.situacao === "em_andamento" ? desafio : null;
  const consulta = s.from("v_resultado_diario").select("*").order("dia");
  const dias = await lista(emAndamento ? consulta.eq("desafio_id", emAndamento.id ?? "") : consulta.is("desafio_id", null));
  const soma = (campo: keyof ResultadoDia) => dias.reduce((t, d) => t + Number(d[campo] ?? 0), 0);
  return {
    desafio: emAndamento,
    dias,
    resultado: soma("resultado"),
    margem: soma("margem_vendas"),
    perdas: soma("custo_perdas"),
    despesas: soma("despesas"),
    vendido: soma("vendido"),
    semCusto: dias.some((d) => d.sem_custo),
  };
}

export async function listarDevidos(): Promise<Devido[]> {
  const s = await criarClienteServidor();
  return lista(s.from("v_reembolsos_devidos").select("*").order("devido", { ascending: false }));
}

export async function livroCaixa(limite = 150): Promise<LancamentoCaixa[]> {
  const s = await criarClienteServidor();
  return lista(s.from("v_fluxo_caixa").select("*").order("id", { ascending: false }).limit(limite));
}

function comMinutos<T extends { criado_em: string }>(linhas: T[]) {
  const agora = Date.now();
  // Minutos desde o lançamento: a tela mostra "Cancelar" só a quem pode (o banco confere de novo).
  return linhas.map((l) => ({ ...l, minutos: (agora - new Date(l.criado_em).getTime()) / 60_000 }));
}

export async function listarDespesas() {
  const s = await criarClienteServidor();
  return comMinutos(await lista(s.from("despesas").select("*").order("criado_em", { ascending: false }).limit(60)));
}

export async function listarReembolsos() {
  const s = await criarClienteServidor();
  return lista(s.from("reembolsos").select("*").order("criado_em", { ascending: false }).limit(60));
}

export async function listarAportes() {
  const s = await criarClienteServidor();
  return lista(s.from("aportes").select("*").order("criado_em", { ascending: false }).limit(60));
}

// ── Gravações (todas por funções do banco) ───────────────────────────────────

export async function registrarDespesa(d: {
  chave: string;
  valor: number;
  descricao: string;
  categoria: string;
  pagoPor: PagoPor;
  data: string;
}): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("registrar_despesa", {
    p_chave: d.chave,
    p_valor: d.valor,
    p_descricao: d.descricao,
    p_categoria: d.categoria,
    p_pago_por: d.pagoPor,
    p_data: d.data,
  });
  if (error) return falhou(error);
  return {
    ok: true,
    mensagem:
      d.pagoPor === "participante"
        ? "Despesa registrada. Entrou no resultado e ficou anotado que o desafio te deve esse valor."
        : "Despesa registrada. Saiu do caixa e entrou no resultado.",
  };
}

export async function cancelarDespesa(id: string, motivo: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("cancelar_despesa", { p_despesa: id, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Despesa cancelada." };
}

export async function pagarReembolso(chave: string, participante: string, valor: number, observacao: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("pagar_reembolso", { p_chave: chave, p_participante: participante, p_valor: valor, p_observacao: observacao });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Reembolso registrado. Saiu do caixa; o resultado não muda." };
}

export async function cancelarReembolso(id: string, motivo: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("cancelar_reembolso", { p_reembolso: id, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Reembolso cancelado. O valor voltou ao caixa e à dívida." };
}

export async function registrarAporte(chave: string, origem: OrigemAporte, participante: string | null, valor: number, observacao: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("registrar_aporte", {
    p_chave: chave,
    p_origem: origem,
    p_participante: participante as string, // nulo quando a origem é a PJ; o gerador de tipos não marca isso
    p_valor: valor,
    p_observacao: observacao,
  });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Aporte registrado. Entrou no caixa; não é receita." };
}

export async function cancelarAporte(id: string, motivo: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("cancelar_aporte", { p_aporte: id, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Aporte cancelado." };
}

export async function ajustarCaixa(chave: string, saldoContado: number, justificativa: string): Promise<Resultado & { diferenca?: number }> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("ajustar_caixa", { p_chave: chave, p_saldo_contado: saldoContado, p_justificativa: justificativa });
  if (error) return falhou(error);
  return { ok: true, diferenca: Number(data) };
}
