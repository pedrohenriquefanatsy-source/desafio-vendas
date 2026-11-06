import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Enums, Tables } from "@/lib/supabase/tipos-banco";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import { formatarData } from "@/lib/datas";
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
  const [saldo, vivo] = await Promise.all([s.from("v_saldo_caixa").select("*").single(), s.from("v_dinheiro_vivo").select("*").single()]);
  if (saldo.error) throw new Error(mensagemDeErro(saldo.error));
  if (vivo.error) throw new Error(mensagemDeErro(vivo.error));
  return {
    saldo: Number(saldo.data.saldo ?? 0),
    entradas: Number(saldo.data.entradas ?? 0),
    saidas: Number(saldo.data.saidas ?? 0),
    // O saldo se divide em dinheiro vivo e banco/Pix.
    dinheiroVivo: Number(vivo.data.dinheiro_vivo ?? 0),
    banco: Number(vivo.data.banco ?? 0),
  };
}

// Conferência do dinheiro vivo (só o administrador): lança a diferença, sem mudar o saldo total.
export async function ajustarDinheiro(chave: string, contado: number, motivo: string): Promise<Resultado & { diferenca?: number }> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("ajustar_dinheiro", { p_chave: chave, p_contado: contado, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, diferenca: Number(data) };
}

// Quanto de uma compra ou despesa paga pelo caixa saiu em dinheiro vivo (o resto foi Pix ou cartão).
export async function definirDinheiroPago(tipo: "compra" | "despesa", id: string, valor: number): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("definir_dinheiro_pago", { p_tipo: tipo, p_id: id, p_valor: valor });
  if (error) return falhou(error);
  return { ok: true };
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

// Cada gasto pago do bolso (compra ou despesa, não cancelado), para mostrar a quem o desafio deve
// no que o dinheiro foi gasto e quando.
export type GastoDoBolso = {
  id: string;
  participanteId: string;
  tipo: "compra" | "despesa";
  quando: string;
  titulo: string;
  detalhe: string;
  valor: number;
};

export async function listarGastosDoBolso(): Promise<GastoDoBolso[]> {
  const s = await criarClienteServidor();
  const [compras, despesas] = await Promise.all([
    lista(s.from("compras").select("id, participante_id, total, fornecedor, observacao, criado_em").eq("pago_por", "participante").eq("situacao", "ativa")),
    lista(s.from("despesas").select("id, participante_id, valor, descricao, categoria, criado_em").eq("pago_por", "participante").eq("situacao", "ativa")),
  ]);
  const ids = compras.map((c) => c.id);
  const itens = ids.length ? await lista(s.from("compra_itens").select("compra_id, insumo_id, quantidade, unidade, valor").in("compra_id", ids)) : [];
  const insumoIds = [...new Set(itens.map((i) => i.insumo_id))];
  const nomes = new Map(
    (insumoIds.length ? await lista(s.from("insumos").select("id, nome").in("id", insumoIds)) : []).map((i) => [i.id, i.nome]),
  );
  const gastos: GastoDoBolso[] = [
    ...compras.map((c) => ({
      id: c.id,
      participanteId: c.participante_id ?? "",
      tipo: "compra" as const,
      quando: c.criado_em,
      titulo: c.fornecedor ? `Compra · ${c.fornecedor}` : "Compra de insumos",
      detalhe:
        itens
          .filter((i) => i.compra_id === c.id)
          .map((i) => `${formatarQuantidade(i.quantidade)} ${i.unidade} de ${nomes.get(i.insumo_id) ?? "insumo"}`)
          .join(", ") + (c.observacao ? ` · ${c.observacao}` : ""),
      valor: Number(c.total),
    })),
    ...despesas.map((d) => ({
      id: d.id,
      participanteId: d.participante_id ?? "",
      tipo: "despesa" as const,
      quando: d.criado_em,
      titulo: d.descricao,
      detalhe: d.categoria ?? "",
      valor: Number(d.valor),
    })),
  ];
  return gastos.sort((a, b) => b.quando.localeCompare(a.quando));
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
  emDinheiro?: number;
}): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("registrar_despesa", {
    p_chave: d.chave,
    p_valor: d.valor,
    p_descricao: d.descricao,
    p_categoria: d.categoria,
    p_pago_por: d.pagoPor,
    p_data: d.data,
  });
  if (error) return falhou(error);
  if (d.emDinheiro && d.emDinheiro > 0 && d.pagoPor === "caixa") {
    const id = (data as unknown as string) ?? "";
    const r = await definirDinheiroPago("despesa", id, d.emDinheiro);
    if (!r.ok) return r;
  }
  return {
    ok: true,
    mensagem:
      d.pagoPor === "participante"
        ? "Despesa registrada. Entrou no lucro estimado e ficou anotado que o desafio te deve esse valor."
        : "Despesa registrada. Saiu do caixa e entrou no lucro estimado.",
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
  return { ok: true, mensagem: "Reembolso registrado. Saiu do caixa; o lucro não muda." };
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

// Detalhe de cada lançamento do livro de caixa: de qual venda, compra ou despesa ele veio (para abrir na tela).
export type DetalheLancamento = { linhas: string[]; link?: { href: string; rotulo: string } };

export async function detalhesDoLivro(livro: LancamentoCaixa[]): Promise<Map<number, DetalheLancamento>> {
  const s = await criarClienteServidor();
  const ids = (tipo: string) => [...new Set(livro.filter((l) => l.origem_tipo === tipo && l.origem_id).map((l) => l.origem_id as string))];
  const [recebimentos, aMais, compras, despesas] = await Promise.all([
    ids("recebimento").length ? lista(s.from("recebimentos").select("id, venda_id").in("id", ids("recebimento"))) : [],
    ids("valor_a_mais").length ? lista(s.from("valores_a_mais").select("id, venda_id").in("id", ids("valor_a_mais"))) : [],
    ids("compra").length ? lista(s.from("compras").select("*").in("id", ids("compra"))) : [],
    ids("despesa").length ? lista(s.from("despesas").select("*").in("id", ids("despesa"))) : [],
  ]);
  const vendaDe = new Map([...recebimentos, ...aMais].map((r) => [r.id, r.venda_id]));
  const vendaIds = [...new Set(vendaDe.values())];
  const compraIds = compras.map((c) => c.id);
  const [vendas, itens, pessoas] = await Promise.all([
    vendaIds.length ? lista(s.from("v_vendas").select("*").in("id", vendaIds)) : [],
    compraIds.length ? lista(s.from("compra_itens").select("compra_id, insumo_id, quantidade, unidade, valor").in("compra_id", compraIds)) : [],
    lista(s.from("perfis").select("id, nome")),
  ]);
  const insumoIds = [...new Set(itens.map((i) => i.insumo_id))];
  const nomeInsumo = new Map(
    (insumoIds.length ? await lista(s.from("insumos").select("id, nome").in("id", insumoIds)) : []).map((i) => [i.id, i.nome]),
  );
  const nomePessoa = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));
  const venda = new Map(vendas.map((v) => [v.id ?? "", v]));
  const compra = new Map(compras.map((c) => [c.id, c]));
  const despesa = new Map(despesas.map((d) => [d.id, d]));

  const detalhes = new Map<number, DetalheLancamento>();
  for (const l of livro) {
    const origem = l.origem_id ?? "";
    if (l.origem_tipo === "recebimento" || l.origem_tipo === "valor_a_mais") {
      const v = venda.get(vendaDe.get(origem) ?? "");
      if (!v) continue;
      detalhes.set(l.id ?? 0, {
        linhas: [
          `${v.tipo === "encomenda" ? "Encomenda" : "Venda"} nº ${v.numero} · ${v.participante ?? "—"} - ${v.cliente ?? (v.cliente_desconhecido ? "cliente desconhecido" : "sem cliente")}`,
          v.itens_resumo ?? "",
          `Total ${formatarReais(Number(v.total))} · ${v.forma_pagamento ?? ""}${Number(v.valor_a_mais) > 0 ? ` · +${formatarReais(Number(v.valor_a_mais))} a mais` : ""}${v.situacao === "cancelada" ? " · cancelada" : ""}`,
        ].filter(Boolean),
        link: { href: `/vendas/${v.id}`, rotulo: `Abrir a venda nº ${v.numero}` },
      });
    } else if (l.origem_tipo === "compra") {
      const c = compra.get(origem);
      if (!c) continue;
      detalhes.set(l.id ?? 0, {
        linhas: [
          `${formatarData(c.data)}${c.fornecedor ? ` · ${c.fornecedor}` : ""} · ${c.pago_por === "caixa" ? "paga pelo caixa" : `do bolso de ${nomePessoa.get(c.participante_id ?? "") ?? "participante"}`}`,
          ...itens
            .filter((i) => i.compra_id === c.id)
            .map((i) => `${formatarQuantidade(i.quantidade)} ${i.unidade} de ${nomeInsumo.get(i.insumo_id) ?? "insumo"} · ${formatarReais(Number(i.valor))}`),
          ...(c.observacao ? [`Obs.: ${c.observacao}`] : []),
          ...(c.situacao === "cancelada" ? [`Cancelada: ${c.motivo_cancelamento ?? ""}`] : []),
        ],
        link: { href: "/compras", rotulo: "Ver em Compras" },
      });
    } else if (l.origem_tipo === "despesa") {
      const d = despesa.get(origem);
      if (!d) continue;
      detalhes.set(l.id ?? 0, {
        linhas: [
          `${d.descricao}${d.categoria ? ` · ${d.categoria}` : ""}`,
          `${formatarData(d.data)} · ${d.pago_por === "caixa" ? "paga pelo caixa" : `do bolso de ${nomePessoa.get(d.participante_id ?? "") ?? "participante"}`}${d.situacao === "cancelada" ? " · cancelada" : ""}`,
        ],
        link: { href: "/caixa/despesa", rotulo: "Ver em Despesas" },
      });
    } else if (l.origem_tipo === "reembolso") {
      detalhes.set(l.id ?? 0, { linhas: [], link: { href: "/caixa/reembolsos", rotulo: "Ver em Reembolsos" } });
    } else if (l.origem_tipo === "aporte") {
      detalhes.set(l.id ?? 0, { linhas: [], link: { href: "/caixa/aporte", rotulo: "Ver em Aportes" } });
    }
  }
  return detalhes;
}
