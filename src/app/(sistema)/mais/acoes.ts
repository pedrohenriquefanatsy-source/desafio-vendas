"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerNumero } from "@/lib/numeros";
import { exigirParticipante } from "@/servicos/sessao";
import { alterarDesafio, criarDesafio, type DadosDesafio, type SituacaoDesafio } from "@/servicos/desafios";
import { alterarFormaPagamento, criarFormaPagamento } from "@/servicos/formas-pagamento";
import { atualizarParticipante, type Papel } from "@/servicos/participantes";
import type { Resultado } from "@/servicos/erros";
import { definirDemanda } from "@/servicos/painel";

// Cada ação confere a sessão de novo; quem decide a permissão é a RLS do banco.

const SITUACOES: SituacaoDesafio[] = ["planejado", "em_andamento", "encerrado"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function lerDesafio(dados: FormData): DadosDesafio | string {
  const nome = String(dados.get("nome") ?? "").trim();
  const inicio = String(dados.get("inicio") ?? "");
  const fim = String(dados.get("fim") ?? "");
  const situacao = String(dados.get("situacao") ?? "planejado") as SituacaoDesafio;
  const textoMeta = String(dados.get("meta_resultado") ?? "").trim();
  const textoMetaVendas = String(dados.get("meta_vendas") ?? "").trim();
  const meta = textoMeta ? lerNumero(textoMeta) : null;
  const metaVendas = textoMetaVendas ? lerNumero(textoMetaVendas) : null;

  if (nome.length < 2 || nome.length > 80) return "Dê um nome ao desafio (de 2 a 80 letras).";
  if (!DATA.test(inicio) || !DATA.test(fim)) return "Informe a data de início e a de fim.";
  if (fim < inicio) return "A data de fim precisa ser igual ou depois da data de início.";
  if (!SITUACOES.includes(situacao)) return "Escolha a situação do desafio.";
  if (textoMeta && (meta == null || meta <= 0)) return "A meta de resultado precisa ser um valor maior que zero, como 1500 ou 1.500,00.";
  if (textoMetaVendas && (metaVendas == null || metaVendas <= 0)) return "A meta de vendas precisa ser um valor maior que zero.";
  return { nome, inicio, fim, situacao, meta_resultado: meta, meta_vendas: metaVendas };
}

export async function salvarDesafio(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  await exigirParticipante();
  const lido = lerDesafio(dados);
  if (typeof lido === "string") return { ok: false, erro: lido };
  const id = String(dados.get("id") ?? "");
  const resultado = id
    ? await alterarDesafio(id, lido)
    : await criarDesafio(String(dados.get("chave") ?? ""), lido);
  if (!resultado.ok) return resultado;
  revalidatePath("/", "layout");
  if (!id) redirect("/mais/desafios");
  return resultado;
}

export async function adicionarFormaPagamento(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = String(dados.get("nome") ?? "").trim();
  const taxa = lerNumero(String(dados.get("taxa") ?? "0") || "0");
  if (nome.length < 2 || nome.length > 40) return { ok: false, erro: "Dê um nome à forma de pagamento (de 2 a 40 letras)." };
  if (taxa == null || taxa < 0 || taxa >= 100) return { ok: false, erro: "A taxa precisa ser uma porcentagem entre 0 e 99,99, como 3,99." };
  const resultado = await criarFormaPagamento(nome, taxa);
  if (resultado.ok) revalidatePath("/mais/formas-pagamento");
  return resultado;
}

export async function salvarFormaPagamento(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  await exigirParticipante();
  const id = String(dados.get("id") ?? "");
  const nome = String(dados.get("nome") ?? "").trim();
  const taxa = lerNumero(String(dados.get("taxa") ?? "0") || "0");
  const ativa = dados.get("ativa") === "on";
  if (nome.length < 2 || nome.length > 40) return { ok: false, erro: "Dê um nome à forma de pagamento (de 2 a 40 letras)." };
  if (taxa == null || taxa < 0 || taxa >= 100) return { ok: false, erro: "A taxa precisa ser uma porcentagem entre 0 e 99,99, como 3,99." };
  const resultado = await alterarFormaPagamento(id, { nome, taxa_percentual: taxa, ativa });
  if (resultado.ok) revalidatePath("/mais/formas-pagamento");
  return resultado;
}

export async function salvarParticipante(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  await exigirParticipante();
  const id = String(dados.get("id") ?? "");
  const nome = String(dados.get("nome") ?? "").trim();
  const papel = String(dados.get("papel") ?? "membro") as Papel;
  const ativo = dados.get("ativo") === "on";
  if (!["administrador", "membro"].includes(papel)) return { ok: false, erro: "Escolha o papel do participante." };
  if (nome && (nome.length < 2 || nome.length > 60)) return { ok: false, erro: "O nome precisa ter de 2 a 60 letras." };
  const resultado = await atualizarParticipante(id, { nome: nome || null, papel, ativo });
  if (resultado.ok) revalidatePath("/mais/participantes");
  return resultado;
}

// Demanda estimada por produto (cobertura de estoque antes de 2 dias com venda). Vazio = tirar.
export async function salvarDemanda(_anterior: Resultado | null, dados: FormData): Promise<Resultado> {
  await exigirParticipante();
  const desafio = String(dados.get("desafio_id") ?? "");
  const variacao = String(dados.get("variacao_id") ?? "");
  const texto = String(dados.get("unidades") ?? "").trim();
  const unidades = texto ? lerNumero(texto) : null;
  if (texto && (unidades == null || unidades <= 0)) return { ok: false, erro: "Informe quantas unidades por dia, como 20 (ou deixe vazio)." };
  const r = await definirDemanda(desafio, variacao, unidades);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
