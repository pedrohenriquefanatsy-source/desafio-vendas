"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerNumero } from "@/lib/numeros";
import { exigirParticipante } from "@/servicos/sessao";
import type { Resultado } from "@/servicos/erros";
import * as catalogo from "@/servicos/catalogo";

// Ações do cadastro. Cada uma confere a sessão; quem decide a permissão é o banco.

const TIPOS_INSUMO = ["ingrediente", "embalagem", "outro"];
const UNIDADES_BASE = ["g", "ml", "und"];
const TIPOS_PRODUTO = ["simples", "kit"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const marcado = (d: FormData, campo: string) => d.get(campo) === "on";
const erro = (mensagem: string): Resultado => ({ ok: false, erro: mensagem });

function positivo(d: FormData, campo: string): number | null {
  const n = lerNumero(texto(d, campo));
  return n != null && n > 0 ? n : null;
}

function atualizar(...caminhos: string[]) {
  for (const c of caminhos) revalidatePath(c);
}

// ── Insumos ─────────────────────────────────────────────────────────────────

export async function criarInsumo(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const tipo = texto(d, "tipo");
  const unidade_base = texto(d, "unidade_base");
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome ao insumo (de 2 a 60 letras).");
  if (!TIPOS_INSUMO.includes(tipo)) return erro("Escolha o tipo: ingrediente, embalagem ou outro.");
  if (!UNIDADES_BASE.includes(unidade_base)) return erro("Escolha como o insumo é medido: g, ml ou und.");
  const r = await catalogo.criarInsumo({ nome, tipo: tipo as catalogo.TipoInsumo, unidade_base });
  if (!r.ok) return r;
  atualizar("/mais/insumos");
  redirect(`/mais/insumos/${r.id}`);
}

export async function alterarInsumo(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const tipo = texto(d, "tipo");
  const validade = texto(d, "validade");
  const minimoTexto = texto(d, "estoque_minimo");
  const minimo = minimoTexto ? lerNumero(minimoTexto) : null;
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome ao insumo (de 2 a 60 letras).");
  if (!TIPOS_INSUMO.includes(tipo)) return erro("Escolha o tipo: ingrediente, embalagem ou outro.");
  if (validade && !DATA.test(validade)) return erro("Data de validade inválida.");
  if (minimoTexto && (minimo == null || minimo < 0)) return erro("O estoque mínimo precisa ser um número, como 500.");
  const r = await catalogo.alterarInsumo(texto(d, "id"), {
    nome,
    tipo: tipo as catalogo.TipoInsumo,
    fornecedor: texto(d, "fornecedor") || null,
    validade: validade || null,
    estoque_minimo: minimo,
    ativo: marcado(d, "ativo"),
  });
  if (r.ok) atualizar("/mais/insumos", `/mais/insumos/${texto(d, "id")}`);
  return r;
}

export async function definirPreco(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const preco = lerNumero(texto(d, "preco"));
  const unidade = texto(d, "unidade");
  if (preco == null || preco < 0) return erro("Informe o preço pago, como 7,90.");
  if (!unidade) return erro("Escolha a unidade em que você compra (kg, cx, und…).");
  const r = await catalogo.definirPrecoInsumo(texto(d, "id"), preco, unidade);
  if (r.ok) atualizar("/mais/insumos", `/mais/insumos/${texto(d, "id")}`, "/mais/receitas", "/mais/produtos");
  return r;
}

export async function criarConversao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const unidade = texto(d, "unidade");
  const qtd = positivo(d, "quantidade");
  if (!unidade || unidade.length > 20) return erro("Dê um nome curto para a unidade, como cx, pacote ou bandeja.");
  if (qtd == null) return erro("Informe quanto cabe em 1 unidade, como 395.");
  const r = await catalogo.criarConversao(texto(d, "insumo_id"), unidade, qtd);
  if (r.ok) atualizar(`/mais/insumos/${texto(d, "insumo_id")}`);
  return r;
}

export async function alterarConversao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const qtd = positivo(d, "quantidade");
  if (qtd == null) return erro("Informe quanto cabe em 1 unidade, como 395.");
  const r = await catalogo.alterarConversao(texto(d, "id"), qtd);
  if (r.ok) atualizar(`/mais/insumos/${texto(d, "insumo_id")}`, "/mais/receitas", "/mais/produtos");
  return r;
}

export async function removerConversao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.removerConversao(texto(d, "id"));
  if (r.ok) atualizar(`/mais/insumos/${texto(d, "insumo_id")}`);
  return r;
}

// ── Receitas ────────────────────────────────────────────────────────────────

export async function criarReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const rendimento = positivo(d, "rendimento");
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome à receita (de 2 a 60 letras).");
  if (rendimento == null) return erro("Informe quantas unidades a receita rende, como 24.");
  const r = await catalogo.criarReceita(nome, rendimento);
  if (!r.ok) return r;
  atualizar("/mais/receitas");
  redirect(`/mais/receitas/${r.id}`);
}

export async function alterarReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const rendimento = positivo(d, "rendimento");
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome à receita (de 2 a 60 letras).");
  if (rendimento == null) return erro("Informe quantas unidades a receita rende, como 24.");
  const r = await catalogo.alterarReceita(texto(d, "id"), {
    nome,
    rendimento_unidades: rendimento,
    observacao: texto(d, "observacao") || null,
    ativa: marcado(d, "ativa"),
  });
  if (r.ok) atualizar("/mais/receitas", `/mais/receitas/${texto(d, "id")}`, "/mais/produtos");
  return r;
}

export async function adicionarItemReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const insumo = texto(d, "insumo_id");
  const qtd = positivo(d, "quantidade");
  const unidade = texto(d, "unidade");
  if (!insumo) return erro("Escolha o insumo.");
  if (qtd == null) return erro("Informe a quantidade, como 0,4 ou 550.");
  if (!unidade) return erro("Escolha a unidade da quantidade.");
  const r = await catalogo.adicionarItemReceita(texto(d, "receita_id"), insumo, qtd, unidade);
  if (r.ok) atualizar(`/mais/receitas/${texto(d, "receita_id")}`, "/mais/receitas", "/mais/produtos");
  return r;
}

export async function alterarItemReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const qtd = positivo(d, "quantidade");
  if (qtd == null) return erro("Informe a quantidade, como 0,4 ou 550.");
  const r = await catalogo.alterarItemReceita(texto(d, "id"), qtd, texto(d, "unidade"));
  if (r.ok) atualizar(`/mais/receitas/${texto(d, "receita_id")}`, "/mais/receitas", "/mais/produtos");
  return r;
}

export async function removerItemReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.removerItemReceita(texto(d, "id"));
  if (r.ok) atualizar(`/mais/receitas/${texto(d, "receita_id")}`, "/mais/receitas", "/mais/produtos");
  return r;
}

// ── Produtos ────────────────────────────────────────────────────────────────

function lerApelidos(d: FormData): string[] {
  return texto(d, "apelidos")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export async function criarProduto(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const tipo = texto(d, "tipo");
  const preco = lerNumero(texto(d, "preco"));
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome ao produto (de 2 a 60 letras).");
  if (!TIPOS_PRODUTO.includes(tipo)) return erro("Escolha se é um produto simples ou um kit.");
  if (preco == null || preco < 0) return erro("Informe o preço de venda, como 6,50.");
  const r = await catalogo.criarProduto({
    nome,
    categoria: texto(d, "categoria") || null,
    tipo: tipo as catalogo.TipoProduto,
    apelidos: lerApelidos(d),
    preco,
  });
  if (!r.ok) return r;
  atualizar("/mais/produtos");
  redirect(`/mais/produtos/${r.id}`);
}

export async function alterarProduto(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome ao produto (de 2 a 60 letras).");
  const r = await catalogo.alterarProduto(texto(d, "id"), {
    nome,
    categoria: texto(d, "categoria") || null,
    apelidos: lerApelidos(d),
    ativo: marcado(d, "ativo"),
  });
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "id")}`);
  return r;
}

export async function criarVariacao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const preco = lerNumero(texto(d, "preco"));
  if (nome.length < 1 || nome.length > 40) return erro("Dê um nome à variação, como Chocolate ou Nutella.");
  if (preco == null || preco < 0) return erro("Informe o preço de venda, como 8,00.");
  const r = await catalogo.criarVariacao(texto(d, "produto_id"), nome, preco, texto(d, "receita_id") || null);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function alterarVariacao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const preco = lerNumero(texto(d, "preco"));
  if (nome.length < 1 || nome.length > 40) return erro("Dê um nome à variação, como Chocolate ou Única.");
  if (preco == null || preco < 0) return erro("Informe o preço de venda, como 8,00.");
  const r = await catalogo.alterarVariacao(texto(d, "id"), {
    nome,
    preco_venda: preco,
    receita_id: texto(d, "receita_id") || null,
    ativa: marcado(d, "ativa"),
  });
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function adicionarEmbalagem(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const insumo = texto(d, "insumo_id");
  const qtd = positivo(d, "quantidade");
  const unidade = texto(d, "unidade");
  if (!insumo) return erro("Escolha a embalagem.");
  if (qtd == null) return erro("Informe quantas vão em cada unidade vendida, como 1.");
  if (!unidade) return erro("Escolha a unidade.");
  const r = await catalogo.adicionarEmbalagem(texto(d, "variacao_id"), insumo, qtd, unidade);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function removerEmbalagem(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.removerEmbalagem(texto(d, "id"));
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function adicionarComponente(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const componente = texto(d, "componente_id");
  const qtd = positivo(d, "quantidade");
  if (!componente) return erro("Escolha o produto que entra no kit.");
  if (qtd == null) return erro("Informe quantos vão no kit, como 1.");
  const r = await catalogo.adicionarComponente(texto(d, "variacao_id"), componente, qtd);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function removerComponente(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.removerComponente(texto(d, "id"));
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}
