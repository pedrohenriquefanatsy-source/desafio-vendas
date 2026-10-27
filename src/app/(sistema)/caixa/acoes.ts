"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatarReais, lerNumero } from "@/lib/numeros";
import { hojeIso } from "@/lib/datas";
import { exigirParticipante } from "@/servicos/sessao";
import type { Resultado } from "@/servicos/erros";
import * as caixa from "@/servicos/caixa";

// Ações do caixa. Conferem o preenchimento; quem decide permissão e saldo é o banco.

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const erro = (mensagem: string): Resultado => ({ ok: false, erro: mensagem });

function atualizar() {
  revalidatePath("/", "layout");
}

function motivoDe(d: FormData) {
  return texto(d, "motivo_outro") || texto(d, "motivo");
}

export async function registrarDespesa(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const valor = lerNumero(texto(d, "valor"));
  const categoria = texto(d, "categoria");
  const descricao = texto(d, "descricao") || categoria;
  const data = texto(d, "data") || hojeIso();
  if (valor == null || valor <= 0) return erro("Informe o valor da despesa, como 15,00.");
  if (descricao.length < 2) return erro("Diga o que foi a despesa (ex.: Uber, adesivos) ou escolha uma categoria.");
  if (descricao.length > 120) return erro("A descrição pode ter até 120 letras.");
  if (!DATA.test(data)) return erro("Data inválida.");
  const r = await caixa.registrarDespesa({
    chave: texto(d, "chave"),
    valor,
    descricao,
    categoria,
    pagoPor: d.get("do_bolso") === "on" ? "participante" : "caixa",
    data,
  });
  if (r.ok) atualizar();
  return r;
}

export async function cancelarDespesa(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const motivo = motivoDe(d);
  if (motivo.length < 3) return erro("Escolha ou escreva o motivo do cancelamento.");
  const r = await caixa.cancelarDespesa(texto(d, "id"), motivo);
  if (r.ok) atualizar();
  return r;
}

export async function pagarReembolso(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const participante = texto(d, "participante");
  const valor = lerNumero(texto(d, "valor"));
  if (!UUID.test(participante)) return erro("Escolha a pessoa.");
  if (valor == null || valor <= 0) return erro("Informe o valor do reembolso.");
  const r = await caixa.pagarReembolso(texto(d, "chave"), participante, valor, texto(d, "observacao"));
  if (!r.ok) return r;
  atualizar();
  redirect("/caixa/reembolsos?feito=pago");
}

export async function cancelarReembolso(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const motivo = motivoDe(d);
  if (motivo.length < 3) return erro("Diga o motivo do cancelamento.");
  const r = await caixa.cancelarReembolso(texto(d, "id"), motivo);
  if (r.ok) atualizar();
  return r;
}

export async function registrarAporte(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const origem = texto(d, "origem");
  const valor = lerNumero(texto(d, "valor"));
  const participante = texto(d, "participante");
  if (origem !== "pj" && origem !== "participante") return erro("Diga de onde veio o dinheiro.");
  if (origem === "participante" && !UUID.test(participante)) return erro("Escolha quem fez o aporte.");
  if (valor == null || valor <= 0) return erro("Informe o valor do aporte.");
  const r = await caixa.registrarAporte(texto(d, "chave"), origem, origem === "participante" ? participante : null, valor, texto(d, "observacao"));
  if (r.ok) atualizar();
  return r;
}

export async function cancelarAporte(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const motivo = motivoDe(d);
  if (motivo.length < 3) return erro("Diga o motivo do cancelamento.");
  const r = await caixa.cancelarAporte(texto(d, "id"), motivo);
  if (r.ok) atualizar();
  return r;
}

export async function ajustarCaixa(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const saldo = lerNumero(texto(d, "saldo"));
  const justificativa = texto(d, "justificativa");
  if (saldo == null) return erro("Informe o saldo que você conferiu, como 120,00.");
  if (justificativa.length < 3) return erro("Diga o motivo do ajuste (ex.: conferência com o extrato do Pix).");
  const r = await caixa.ajustarCaixa(texto(d, "chave"), saldo, justificativa);
  if (!r.ok) return r;
  atualizar();
  const dif = r.diferenca ?? 0;
  return {
    ok: true,
    mensagem: dif === 0 ? "O caixa já estava certo. Nada foi lançado." : `Ajuste de ${dif > 0 ? "+" : "−"}${formatarReais(Math.abs(dif))} lançado no caixa.`,
  };
}
