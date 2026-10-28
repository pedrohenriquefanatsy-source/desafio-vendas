"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerNumero } from "@/lib/numeros";
import { exigirParticipante } from "@/servicos/sessao";
import type { Resultado } from "@/servicos/erros";
import * as vendas from "@/servicos/vendas";

// Ações de vendas. Conferem o preenchimento para dar mensagem clara; preço, desconto,
// custo, margem, estoque e permissão são decididos pelo banco.

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const TIPOS = ["venda", "encomenda", "doacao"];

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? "").trim();
const erro = (mensagem: string): Resultado => ({ ok: false, erro: mensagem });

function atualizar() {
  revalidatePath("/", "layout");
}

// Depois de receber, entregar ou cancelar, o formulário some da tela; a confirmação
// aparece no topo da venda.
function voltarParaVenda(d: FormData, feito: string): never {
  atualizar();
  redirect(`/vendas/${texto(d, "id")}?feito=${feito}`);
}

export async function registrarVenda(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const tipo = texto(d, "tipo") || "venda";
  if (!TIPOS.includes(tipo)) return erro("Tipo de venda inválido.");
  let brutos: unknown;
  try {
    brutos = JSON.parse(texto(d, "itens") || "[]");
  } catch {
    return erro("Não consegui ler os produtos. Atualize a página e tente de novo.");
  }
  if (!Array.isArray(brutos) || brutos.length === 0) return erro("Escolha pelo menos um produto.");
  const itens: vendas.ItemVenda[] = [];
  for (const b of brutos) {
    const item = b as { variacao_id?: string; quantidade?: number; preco?: string };
    if (!item.variacao_id || !UUID.test(item.variacao_id)) return erro("Produto inválido. Atualize a página.");
    const quantidade = Number(item.quantidade);
    if (!(quantidade > 0)) return erro("A quantidade de cada produto precisa ser maior que zero.");
    const preco = item.preco ? lerNumero(item.preco) : null;
    if (item.preco && (preco == null || preco < 0)) return erro("Confira o preço editado: use um número, como 6,50.");
    itens.push({ variacao_id: item.variacao_id, quantidade, ...(preco != null ? { preco_unitario: preco } : {}) });
  }

  const doacao = tipo === "doacao";
  const forma = texto(d, "forma");
  if (!doacao && !UUID.test(forma)) return erro("Escolha a forma de pagamento.");
  const descontoTexto = texto(d, "desconto");
  const desconto = descontoTexto ? lerNumero(descontoTexto) : 0;
  if (desconto == null || desconto < 0) return erro("Confira o desconto: use um número, como 2,00.");

  // Quanto foi pago agora: "paga" = nulo (o banco usa o total que ele calcula), "pendente" = 0,
  // "parcial" = o valor digitado.
  const pagamento = texto(d, "pagamento");
  let valorRecebido: number | null = 0;
  if (!doacao && pagamento === "paga") valorRecebido = null;
  if (!doacao && pagamento === "parcial") {
    valorRecebido = lerNumero(texto(d, "valor_recebido"));
    if (valorRecebido == null || valorRecebido <= 0) return erro("Informe quanto foi recebido agora, como 10,00.");
  }

  const entrega = texto(d, "entrega");
  if (tipo === "encomenda" && !DATA.test(entrega)) return erro("Informe a data de entrega da encomenda.");
  const desconhecido = texto(d, "cliente_desconhecido") === "1";
  const cliente = desconhecido ? "" : texto(d, "cliente");
  if (cliente.length > 60) return erro("O nome do cliente pode ter até 60 letras.");
  const bairro = texto(d, "bairro");
  if (bairro && (bairro.length < 2 || bairro.length > 60)) return erro("O bairro precisa ter de 2 a 60 letras.");
  const observacao = texto(d, "observacao");
  if (observacao.length > 300) return erro("A observação pode ter até 300 letras.");
  if (!doacao && pagamento !== "paga" && !cliente) return erro("Venda pendente ou parcial: diga o nome do cliente, para saber de quem cobrar.");

  const r = await vendas.registrarVenda({
    chave: texto(d, "chave"),
    tipo: tipo as vendas.TipoVenda,
    itens,
    forma: doacao ? null : forma,
    valorRecebido,
    desconto: doacao ? 0 : desconto,
    cliente,
    bairro,
    desconhecido,
    observacao,
    entrega: tipo === "encomenda" ? entrega : null,
    confirmar: texto(d, "confirmar") === "1",
  });
  if (!r.ok) return r;
  atualizar();
  redirect(`/vendas/nova?ok=${r.numero}&id=${r.id}`);
}

export async function registrarRecebimento(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const valor = lerNumero(texto(d, "valor"));
  const forma = texto(d, "forma");
  if (valor == null || valor <= 0) return erro("Informe o valor recebido, como 10,00.");
  if (!UUID.test(forma)) return erro("Escolha a forma de pagamento.");
  const r = await vendas.registrarRecebimento(texto(d, "chave"), texto(d, "id"), valor, forma);
  if (!r.ok) return r;
  voltarParaVenda(d, "recebido");
}

export async function marcarPronta(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await vendas.marcarPronta(texto(d, "id"));
  if (!r.ok) return r;
  voltarParaVenda(d, "pronta");
}

export async function entregarEncomenda(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const r = await vendas.entregarEncomenda(texto(d, "id"), texto(d, "confirmar") === "1");
  if (!r.ok) return r;
  voltarParaVenda(d, "entregue");
}

export async function cancelarVenda(_a: Resultado | null, d: FormData): Promise<Resultado> {
  await exigirParticipante();
  const motivo = texto(d, "motivo_outro") || texto(d, "motivo");
  if (motivo.length < 3) return erro("Escolha ou escreva o motivo do cancelamento.");
  const r = await vendas.cancelarVenda(texto(d, "id"), motivo);
  if (!r.ok) return r;
  voltarParaVenda(d, "cancelada");
}
