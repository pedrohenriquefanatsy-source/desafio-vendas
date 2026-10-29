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
  const tamanhoTexto = texto(d, "tamanho");
  const precoTexto = texto(d, "preco");
  const estoqueTexto = texto(d, "estoque");
  const tamanho = tamanhoTexto ? lerNumero(tamanhoTexto) : null;
  const preco = precoTexto ? lerNumero(precoTexto) : null;
  const estoque = estoqueTexto ? lerNumero(estoqueTexto) : null;
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome ao insumo (de 2 a 60 letras).");
  if (!TIPOS_INSUMO.includes(tipo)) return erro("Escolha o tipo: ingrediente, embalagem ou outro.");
  if (!UNIDADES_BASE.includes(unidade_base)) return erro("Escolha como o insumo é medido: g, ml ou und.");
  if (tamanhoTexto && (tamanho == null || tamanho <= 0)) return erro("Diga quanto vem em cada embalagem, como 500.");
  if (precoTexto && (preco == null || preco < 0)) return erro("Informe o preço da embalagem, como 16,00.");
  if (!!tamanhoTexto !== !!precoTexto) return erro("Para calcular o custo, preencha o quanto vem na embalagem e o preço dela (ou deixe os dois em branco).");
  if (estoqueTexto && (estoque == null || estoque < 0)) return erro("Informe quanto você tem agora, como 1500 (ou deixe em branco).");
  const r = await catalogo.cadastrarInsumo({
    chave: texto(d, "chave"),
    nome,
    tipo: tipo as catalogo.TipoInsumo,
    unidade_base,
    tamanho,
    preco,
    estoque,
  });
  if (!r.ok) return r;
  atualizar("/mais/insumos", "/estoque", "/");
  return { ok: true, mensagem: r.mensagem };
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

export async function salvarEmbalagem(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const tamanho = positivo(d, "tamanho");
  const preco = lerNumero(texto(d, "preco"));
  if (tamanho == null) return erro("Diga quanto vem em cada embalagem, como 500.");
  if (preco == null || preco < 0) return erro("Informe o preço da embalagem, como 16,00.");
  const r = await catalogo.definirEmbalagemInsumo(texto(d, "id"), tamanho, preco);
  if (r.ok) atualizar("/mais/insumos", `/mais/insumos/${texto(d, "id")}`, "/mais/produtos", "/estoque", "/");
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
  if (r.ok) atualizar(`/mais/insumos/${texto(d, "insumo_id")}`, "/mais/produtos");
  return r;
}

export async function removerConversao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.removerConversao(texto(d, "id"));
  if (r.ok) atualizar(`/mais/insumos/${texto(d, "insumo_id")}`);
  return r;
}

// ── Itens da receita (a receita mora dentro do sabor do produto) ─────────────

export async function adicionarItemReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const insumo = texto(d, "insumo_id");
  const qtd = positivo(d, "quantidade");
  const unidade = texto(d, "unidade");
  if (!insumo) return erro("Escolha o insumo.");
  if (qtd == null) return erro("Informe a quantidade, como 0,4 ou 550.");
  if (!unidade) return erro("Escolha a unidade da quantidade.");
  const r = await catalogo.adicionarItemReceita(texto(d, "receita_id"), insumo, qtd, unidade);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function alterarItemReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const qtd = positivo(d, "quantidade");
  if (qtd == null) return erro("Informe a quantidade, como 0,4 ou 550.");
  const r = await catalogo.alterarItemReceita(texto(d, "id"), qtd, texto(d, "unidade"));
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function removerItemReceita(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.removerItemReceita(texto(d, "id"));
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
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
  const sabor = texto(d, "sabor");
  if (nome.length < 2 || nome.length > 60) return erro("Dê um nome ao produto (de 2 a 60 letras).");
  if (!TIPOS_PRODUTO.includes(tipo)) return erro("Escolha se é um produto simples ou um kit.");
  if (preco == null || preco < 0) return erro("Informe o preço de venda, como 6,50.");
  if (sabor.length > 40) return erro("O nome do sabor pode ter até 40 letras.");
  const r = await catalogo.criarProduto({
    nome,
    categoria: texto(d, "categoria") || null,
    tipo: tipo as catalogo.TipoProduto,
    apelidos: lerApelidos(d),
    preco,
    sabor,
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
  const copiarDe = texto(d, "copiar_de");
  if (nome.length < 1 || nome.length > 40) return erro("Dê um nome ao sabor, como Chocolate ou Ninho.");
  if (preco == null || preco < 0) return erro("Informe o preço de venda, como 8,00.");
  const r = await catalogo.criarVariacao(texto(d, "produto_id"), nome, preco);
  if (!r.ok) return r;
  atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  if (copiarDe && r.id) {
    const c = await catalogo.copiarReceitaSabor(copiarDe, r.id);
    if (!c.ok) return erro(`O sabor ${nome} foi criado, mas a receita não foi copiada: ${c.erro}`);
    return { ok: true, mensagem: `Sabor ${nome} criado com a receita copiada. Troque o que muda neste sabor.` };
  }
  return { ok: true, mensagem: `Sabor ${nome} criado. Agora crie a receita dele.` };
}

export async function alterarVariacao(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const nome = texto(d, "nome");
  const preco = lerNumero(texto(d, "preco"));
  if (nome.length < 1 || nome.length > 40) return erro("Dê um nome ao sabor, como Chocolate ou Única.");
  if (preco == null || preco < 0) return erro("Informe o preço de venda, como 8,00.");
  const r = await catalogo.alterarVariacao(texto(d, "id"), {
    nome,
    preco_venda: preco,
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

// ── Receita dentro do sabor ─────────────────────────────────────────────────

type ItemReceita = { insumo_id: string; quantidade: number; unidade: string };

function lerItens(d: FormData): ItemReceita[] | Resultado {
  let brutos: unknown;
  try {
    brutos = JSON.parse(texto(d, "itens") || "[]");
  } catch {
    return erro("Não consegui ler os ingredientes. Atualize a página e tente de novo.");
  }
  if (!Array.isArray(brutos) || brutos.length === 0) return erro("Adicione pelo menos um ingrediente, com a quantidade.");
  const itens: ItemReceita[] = [];
  for (const [n, b] of brutos.entries()) {
    const item = b as Record<string, string>;
    const quantidade = lerNumero(item.quantidade);
    if (!item.insumo_id || !/^[0-9a-f-]{36}$/i.test(item.insumo_id)) return erro(`Escolha o insumo do ingrediente ${n + 1}.`);
    if (quantidade == null || quantidade <= 0) return erro(`Informe a quantidade do ingrediente ${n + 1}, como 200 ou 0,4.`);
    if (!item.unidade) return erro(`Escolha a unidade do ingrediente ${n + 1}.`);
    itens.push({ insumo_id: item.insumo_id, quantidade, unidade: item.unidade });
  }
  return itens;
}

export async function cadastrarReceitaSabor(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const rendimento = positivo(d, "rendimento");
  const itens = lerItens(d);
  if (!Array.isArray(itens)) return itens;
  if (rendimento == null) return erro("Diga quantas unidades essa fornada rende, como 24.");
  const r = await catalogo.cadastrarReceitaSabor(texto(d, "variacao_id"), rendimento, itens);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`, "/estoque", "/");
  return r;
}

// Cobertura (o chocolate), peso esperado dos cubos, chocolate esperado e gramagem do potinho.
function lerPesos(d: FormData): { cobertura: string; cubos: number; chocolate: number; gramagem: number } | Resultado {
  const cobertura = texto(d, "cobertura_insumo");
  const cubos = positivo(d, "peso_cubos");
  const chocolate = positivo(d, "cobertura");
  const gramagem = positivo(d, "gramagem");
  if (!/^[0-9a-f-]{36}$/i.test(cobertura)) return erro("Escolha o chocolate da cobertura.");
  if (cubos == null) return erro("Informe o peso esperado dos cubos de uma fornada, em gramas, como 2000.");
  if (chocolate == null) return erro("Informe quanto chocolate se espera gastar em uma fornada, em gramas, como 700.");
  if (gramagem == null) return erro("Informe a gramagem de cada potinho, em gramas, como 150.");
  return { cobertura, cubos, chocolate, gramagem };
}

export async function cadastrarReceitaPeso(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const itens = lerItens(d);
  if (!Array.isArray(itens)) return itens;
  const pesos = lerPesos(d);
  if ("ok" in pesos) return pesos;
  const r = await catalogo.cadastrarReceitaPeso(texto(d, "variacao_id"), itens, pesos);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`, "/estoque", "/");
  return r;
}

export async function salvarCusteioPeso(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const pesos = lerPesos(d);
  if ("ok" in pesos) return pesos;
  const r = await catalogo.definirCusteioPeso(texto(d, "receita_id"), pesos);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`, "/estoque", "/");
  return r;
}

export async function voltarCusteioRendimento(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const rendimento = positivo(d, "rendimento");
  if (rendimento == null) return erro("Informe quantas unidades uma fornada rende, como 24.");
  const r = await catalogo.voltarCusteioRendimento(texto(d, "receita_id"), rendimento);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`, "/estoque", "/");
  return r;
}

export async function copiarReceitaSabor(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const origem = texto(d, "origem");
  if (!origem) return erro("Escolha de qual sabor copiar a receita.");
  const r = await catalogo.copiarReceitaSabor(origem, texto(d, "variacao_id"));
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

export async function salvarRendimento(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const rendimento = positivo(d, "rendimento");
  if (rendimento == null) return erro("Informe quantas unidades uma fornada rende, como 24.");
  const r = await catalogo.alterarRendimento(texto(d, "receita_id"), rendimento);
  if (r.ok) atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`);
  return r;
}

// ── Excluir o que nunca foi usado ───────────────────────────────────────────
// O banco confere se pode (sem compra, venda, produção nem receita em uso) e explica quando não.

export async function excluirInsumo(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.excluirCadastro("insumo", texto(d, "id"));
  if (!r.ok) return r;
  atualizar("/mais/insumos", "/estoque", "/");
  redirect("/mais/insumos?feito=excluido");
}

export async function excluirSabor(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.excluirCadastro("variacao", texto(d, "id"));
  if (!r.ok) return r;
  atualizar("/mais/produtos", `/mais/produtos/${texto(d, "produto_id")}`, "/estoque", "/");
  redirect(`/mais/produtos/${texto(d, "produto_id")}?feito=sabor-excluido`);
}

export async function excluirProduto(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await catalogo.excluirCadastro("produto", texto(d, "id"));
  if (!r.ok) return r;
  atualizar("/mais/produtos", "/estoque", "/");
  redirect("/mais/produtos?feito=excluido");
}
