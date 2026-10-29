"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerNumero } from "@/lib/numeros";
import { hojeIso } from "@/lib/datas";
import { exigirParticipante } from "@/servicos/sessao";
import type { Resultado } from "@/servicos/erros";
import * as estoque from "@/servicos/estoque";

// Ações de compras, estoque e produção. Conferem o preenchimento para dar uma
// mensagem clara; quem decide permissão, saldo e custo é o banco.

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const erro = (mensagem: string): Resultado => ({ ok: false, erro: mensagem });

// Estoque aparece em várias telas (estoque, compras, produtos, início): atualiza todas.
function atualizarEstoque() {
  revalidatePath("/", "layout");
}

// Item escolhido: "insumo:<id>" ou "variacao:<id>".
function lerItem(d: FormData): { insumo?: string; variacao?: string } | null {
  const [tipo, id] = texto(d, "item").split(":");
  if (!id || !UUID.test(id)) return null;
  if (tipo === "insumo") return { insumo: id };
  if (tipo === "variacao") return { variacao: id };
  return null;
}

// ── Compras ─────────────────────────────────────────────────────────────────

export async function registrarCompra(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  let brutos: unknown;
  try {
    brutos = JSON.parse(texto(d, "itens") || "[]");
  } catch {
    return erro("Não consegui ler os itens. Atualize a página e tente de novo.");
  }
  if (!Array.isArray(brutos) || brutos.length === 0) return erro("Adicione pelo menos um item à compra.");
  const itens: estoque.ItemCompra[] = [];
  for (const [n, b] of brutos.entries()) {
    const item = b as Record<string, string>;
    const quantidade = lerNumero(item.quantidade);
    const valor = lerNumero(item.valor);
    if (!item.insumo_id || !UUID.test(item.insumo_id)) return erro(`Escolha o insumo do item ${n + 1}.`);
    if (quantidade == null || quantidade <= 0) return erro(`Informe a quantidade do item ${n + 1}, como 2 ou 1,5.`);
    if (!item.unidade) return erro(`Escolha a unidade do item ${n + 1}.`);
    if (valor == null || valor < 0) return erro(`Informe quanto custou o item ${n + 1} no total, como 15,80.`);
    itens.push({ insumo_id: item.insumo_id, quantidade, unidade: item.unidade, valor });
  }
  const pagoPor = texto(d, "pago_por");
  if (pagoPor !== "caixa" && pagoPor !== "participante") return erro("Diga quem pagou: o caixa ou você, do seu bolso.");
  const data = texto(d, "data") || hojeIso();
  if (!DATA.test(data)) return erro("Data inválida.");
  const fornecedor = texto(d, "fornecedor");
  if (fornecedor.length > 80) return erro("O nome do fornecedor pode ter até 80 letras.");
  const observacao = texto(d, "observacao");
  if (observacao.length > 300) return erro("A observação pode ter até 300 letras.");
  const r = await estoque.registrarCompra({ chave: texto(d, "chave"), itens, pagoPor, data, fornecedor, observacao });
  if (!r.ok) return r;
  atualizarEstoque();
  redirect("/compras?salva=1");
}

export async function cancelarCompra(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const motivo = texto(d, "motivo");
  if (motivo.length < 3) return erro("Diga o motivo do cancelamento (ex.: lancei em dobro).");
  const r = await estoque.cancelarCompra(texto(d, "id"), motivo);
  if (r.ok) atualizarEstoque();
  return r;
}

// ── Produção ────────────────────────────────────────────────────────────────

export async function planejarProducao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const variacao = texto(d, "variacao_id");
  const fornadas = lerNumero(texto(d, "fornadas"));
  const data = texto(d, "data");
  if (!UUID.test(variacao)) return erro("Escolha o produto que vai ser feito.");
  if (fornadas == null || fornadas <= 0 || fornadas > 100) return erro("Informe quantas fornadas, como 1 ou 2.");
  if (data && !DATA.test(data)) return erro("Data inválida.");
  const r = await estoque.planejarProducao(texto(d, "chave"), variacao, fornadas, data);
  if (r.ok) atualizarEstoque();
  return r;
}

export async function concluirProducao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const boas = lerNumero(texto(d, "boas"));
  const perdidasTexto = texto(d, "perdidas");
  const perdidas = perdidasTexto ? lerNumero(perdidasTexto) : 0;
  if (boas == null || boas < 0) return erro("Informe quantas unidades ficaram boas, como 20.");
  if (perdidas == null || perdidas < 0) return erro("Informe quantas se perderam (ou deixe em branco).");
  if (boas + perdidas === 0) return erro("Informe pelo menos uma unidade, boa ou perdida.");
  const cubosTexto = texto(d, "peso_cubos");
  const finalTexto = texto(d, "peso_final");
  let pesos: { cubos: number; final: number } | undefined;
  if (cubosTexto || finalTexto) {
    const cubos = lerNumero(cubosTexto);
    const final = lerNumero(finalTexto);
    if (cubos == null || cubos <= 0) return erro("Informe o peso dos cubos, em gramas, como 3800.");
    if (final == null || final <= cubos) return erro("O peso com o chocolate precisa ser maior que o peso dos cubos. Confira as duas pesagens.");
    pesos = { cubos, final };
  }
  const r = await estoque.concluirProducao(texto(d, "id"), boas, perdidas, pesos);
  if (!r.ok) return r;
  atualizarEstoque();
  // A produção sai da lista de planejadas; a confirmação aparece no topo da aba.
  redirect("/estoque?aba=producao&feito=concluida");
}

export async function cancelarProducao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await estoque.cancelarProducao(texto(d, "id"), texto(d, "motivo"));
  if (!r.ok) return r;
  atualizarEstoque();
  redirect("/estoque?aba=producao&feito=cancelada");
}

// ── Ajuste e perda ──────────────────────────────────────────────────────────

export async function ajustarEstoque(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const item = lerItem(d);
  if (!item) return erro("Item não encontrado. Volte ao estoque e escolha de novo.");
  const contado = lerNumero(texto(d, "contado"));
  const justificativa = texto(d, "justificativa");
  if (contado == null || contado < 0) return erro("Informe quanto você contou, como 1500 (zero se acabou).");
  if (justificativa.length < 3) return erro("Diga o motivo do ajuste (ex.: contagem do fim do dia).");
  const r = await estoque.ajustarEstoque(texto(d, "chave"), item, contado, justificativa);
  if (r.ok) atualizarEstoque();
  return r;
}

export async function registrarPerda(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const item = lerItem(d);
  if (!item) return erro("Item não encontrado. Volte ao estoque e escolha de novo.");
  const quantidade = lerNumero(texto(d, "quantidade"));
  const motivo = texto(d, "motivo");
  if (quantidade == null || quantidade <= 0) return erro("Informe quanto se perdeu, como 2.");
  if (motivo.length < 3) return erro("Diga o que aconteceu (ex.: caiu no chão, venceu).");
  const r = await estoque.registrarPerda(texto(d, "chave"), item, quantidade, texto(d, "unidade") || null, motivo);
  if (r.ok) atualizarEstoque();
  return r;
}
