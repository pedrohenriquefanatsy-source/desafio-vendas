import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { formatarQuantidade } from "@/lib/numeros";
import type { Enums, Json, Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";

// Vendas, recebimentos, encomendas e doações. Preço, desconto, custo, taxa, margem e
// estoque são calculados pelo banco (funções da fatia 4); aqui só se lê e se repassa.

export type Venda = Tables<"v_vendas">;
export type ProdutoVenda = Tables<"v_produtos_venda">;
export type TipoVenda = Enums<"tipo_venda">;
export type ItemVenda = { variacao_id: string; quantidade: number; preco_unitario?: number };

export const CHIPS = ["hoje", "todas", "a-receber", "encomendas", "doacoes", "canceladas"] as const;
export type Chip = (typeof CHIPS)[number];
export const NOMES_CHIP: Record<Chip, string> = {
  hoje: "Hoje",
  todas: "Todas",
  "a-receber": "A receber",
  encomendas: "Encomendas",
  doacoes: "Doações",
  canceladas: "Canceladas",
};

export type Filtros = { dia?: string; produto?: string; participante?: string; forma?: string };

type Falta = { item: string; unidade: string; necessario: number; disponivel: number };

function falhou(erro: { code?: string; message?: string }): Resultado {
  return { ok: false, erro: mensagemDeErro(erro) };
}

function avisoFalta(faltas: Falta[], confirmar: string): Resultado {
  return {
    ok: false,
    erro: "O estoque registrado não tem tudo. Se o produto está na mão (só não foi lançado), pode seguir: o aviso fica registrado.",
    itens: faltas.map((f) => `${f.item}: precisa ${formatarQuantidade(f.necessario)} ${f.unidade}, tem ${formatarQuantidade(f.disponivel)}`),
    confirmar,
  };
}

// ── Leituras ────────────────────────────────────────────────────────────────

export async function listarProdutosVenda(): Promise<ProdutoVenda[]> {
  const s = await criarClienteServidor();
  const { data, error } = await s
    .from("v_produtos_venda")
    .select("*")
    .order("vendidos", { ascending: false })
    .order("ordem_produto")
    .order("produto")
    .order("ordem");
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

// Forma de pagamento da última venda desta pessoa (a tela já deixa marcada).
export async function ultimaForma(participanteId: string): Promise<string | null> {
  const s = await criarClienteServidor();
  const { data } = await s
    .from("vendas")
    .select("forma_pagamento_id")
    .eq("participante_id", participanteId)
    .not("forma_pagamento_id", "is", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.forma_pagamento_id ?? null;
}

// Filtros de cada chip, iguais para a lista e para a contagem.
type Filtravel<T> = { eq(coluna: string, valor: unknown): T; neq(coluna: string, valor: unknown): T; gt(coluna: string, valor: unknown): T };

function aplicarChip<T extends Filtravel<T>>(q: T, chip: Chip, hoje: string): T {
  switch (chip) {
    case "hoje":
      return q.eq("situacao", "ativa").eq("dia", hoje);
    case "todas":
      return q.eq("situacao", "ativa");
    case "a-receber":
      return q.eq("situacao", "ativa").gt("a_receber", 0);
    case "encomendas":
      return q.eq("situacao", "ativa").eq("tipo", "encomenda").neq("situacao_entrega", "entregue");
    case "doacoes":
      return q.eq("situacao", "ativa").eq("tipo", "doacao");
    case "canceladas":
      return q.eq("situacao", "cancelada");
  }
}

export async function listarVendas(chip: Chip, filtros: Filtros, hoje: string) {
  const s = await criarClienteServidor();
  let q = s.from("v_vendas").select("*");
  q = aplicarChip(q, chip, hoje);
  if (filtros.dia) q = q.eq("dia", filtros.dia);
  if (filtros.participante) q = q.eq("participante_id", filtros.participante);
  if (filtros.forma) q = q.eq("forma_pagamento_id", filtros.forma);
  if (filtros.produto) q = q.contains("variacoes", [filtros.produto]);
  const ordenada = chip === "encomendas" ? q.order("entrega_prevista").order("numero") : q.order("numero", { ascending: false });
  const { data, error } = await ordenada.limit(200);
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export async function contarChips(hoje: string): Promise<Record<Chip, number>> {
  const s = await criarClienteServidor();
  const contagens = await Promise.all(
    CHIPS.map(async (chip) => {
      const { count } = await aplicarChip(s.from("v_vendas").select("id", { count: "exact", head: true }), chip, hoje);
      return [chip, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(contagens) as Record<Chip, number>;
}

export async function obterVenda(id: string) {
  const s = await criarClienteServidor();
  const [venda, itens, recebimentos] = await Promise.all([
    s.from("v_vendas").select("*").eq("id", id).maybeSingle(),
    s.from("venda_itens").select("*").eq("venda_id", id).order("ordem"),
    s.from("recebimentos").select("*").eq("venda_id", id).order("criado_em"),
  ]);
  if (venda.error) throw new Error(mensagemDeErro(venda.error));
  if (!venda.data) return null;
  const ids = (itens.data ?? []).map((i) => i.variacao_id);
  const { data: nomes } = ids.length
    ? await s.from("v_custo_variacoes").select("variacao_id, produto, variacao").in("variacao_id", ids)
    : { data: [] };
  const nome = new Map((nomes ?? []).map((n) => [n.variacao_id, n.variacao === "Única" ? n.produto : `${n.produto} · ${n.variacao}`]));
  return {
    venda: venda.data,
    itens: (itens.data ?? []).map((i) => ({ ...i, nome: nome.get(i.variacao_id) ?? "Produto" })),
    recebimentos: recebimentos.data ?? [],
    // Minutos desde o lançamento: a tela mostra "Cancelar" só a quem pode (o banco confere de novo).
    minutos: (Date.now() - new Date(venda.data.criado_em ?? "").getTime()) / 60_000,
  };
}

// ── Gravações ───────────────────────────────────────────────────────────────

export async function registrarVenda(dados: {
  chave: string;
  tipo: TipoVenda;
  itens: ItemVenda[];
  forma: string | null;
  valorRecebido: number | null; // nulo = paga (o total calculado pelo banco)
  desconto: number;
  cliente: string;
  bairro: string;
  desconhecido: boolean;
  observacao: string;
  entrega: string | null;
  data: string | null; // dia em que a venda aconteceu (nulo = hoje)
  confirmar: boolean;
}): Promise<Resultado & { numero?: number; id?: string }> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("registrar_venda", {
    p_chave: dados.chave,
    p_tipo: dados.tipo,
    p_itens: dados.itens as unknown as Json,
    p_forma: dados.forma ?? undefined,
    // O gerador de tipos não marca que o banco aceita nulo aqui.
    p_valor_recebido: dados.valorRecebido as number,
    p_desconto: dados.desconto,
    p_cliente: dados.cliente,
    p_observacao: dados.observacao,
    p_entrega_prevista: dados.entrega ?? undefined,
    p_confirmar_estoque: dados.confirmar,
    p_bairro: dados.bairro || undefined,
    p_cliente_desconhecido: dados.desconhecido,
    p_data: dados.data ?? undefined,
  });
  if (error) return falhou(error);
  const r = data as { ok: boolean; faltas?: Falta[]; venda_id?: string; numero?: number };
  if (!r.ok) return avisoFalta(r.faltas ?? [], dados.tipo === "doacao" ? "Doar mesmo assim" : "Vender mesmo assim");
  return { ok: true, numero: r.numero, id: r.venda_id };
}

export async function registrarRecebimento(chave: string, venda: string, valor: number, forma: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("registrar_recebimento", { p_chave: chave, p_venda: venda, p_valor: valor, p_forma: forma });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Recebimento registrado. Entrou no caixa." };
}

// Recebe o que falta de uma venda (a encomenda paga o restante na entrega).
export async function receberRestante(chave: string, vendaId: string, forma: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { data, error } = await s.from("v_vendas").select("a_receber").eq("id", vendaId).maybeSingle();
  if (error) return falhou(error);
  const falta = Number(data?.a_receber ?? 0);
  if (falta <= 0) return { ok: true, mensagem: "Nada a receber." };
  return registrarRecebimento(chave, vendaId, falta, forma);
}

export async function marcarPronta(venda: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("marcar_encomenda_pronta", { p_venda: venda });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Encomenda marcada como pronta." };
}

export async function entregarEncomenda(venda: string, confirmar: boolean): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { data, error } = await s.rpc("entregar_encomenda", { p_venda: venda, p_confirmar_estoque: confirmar });
  if (error) return falhou(error);
  const r = data as { ok: boolean; faltas?: Falta[] };
  if (!r.ok) return avisoFalta(r.faltas ?? [], "Entregar mesmo assim");
  return { ok: true, mensagem: "Encomenda entregue: o estoque baixou e a venda entrou no faturamento." };
}

export async function cancelarVenda(venda: string, motivo: string): Promise<Resultado> {
  const s = await criarClienteServidor();
  const { error } = await s.rpc("cancelar_venda", { p_venda: venda, p_motivo: motivo });
  if (error) return falhou(error);
  return { ok: true, mensagem: "Venda cancelada. O estoque e o caixa voltaram; o registro fica no histórico." };
}

// ── Clientes e bairros ──────────────────────────────────────────────────────

export type ClienteRanking = Tables<"v_clientes">;
export type BairroRanking = Tables<"v_bairros">;

export async function listarClientes(): Promise<ClienteRanking[]> {
  const s = await criarClienteServidor();
  const { data, error } = await s.from("v_clientes").select("*").order("total", { ascending: false }).limit(500);
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

export async function listarBairros(): Promise<BairroRanking[]> {
  const s = await criarClienteServidor();
  const { data, error } = await s.from("v_bairros").select("*").order("total", { ascending: false }).limit(500);
  if (error) throw new Error(mensagemDeErro(error));
  return data;
}

// Vendas (sem doação nem cancelada) por tipo de cliente: com nome, desconhecido e sem informação.
export async function resumoDeClientes() {
  const s = await criarClienteServidor();
  const base = () => s.from("v_vendas").select("total", { count: "exact" }).eq("situacao", "ativa").neq("tipo", "doacao").not("reconhecida_em", "is", null);
  const [nomeados, desconhecidos, semInformar] = await Promise.all([
    base().not("cliente", "is", null),
    base().eq("cliente_desconhecido", true),
    base().is("cliente", null).eq("cliente_desconhecido", false),
  ]);
  for (const r of [nomeados, desconhecidos, semInformar]) if (r.error) throw new Error(mensagemDeErro(r.error));
  const soma = (linhas: { total: number | null }[] | null) => (linhas ?? []).reduce((t, l) => t + Number(l.total ?? 0), 0);
  return {
    nomeados: { vendas: nomeados.count ?? 0, total: soma(nomeados.data) },
    desconhecidos: { vendas: desconhecidos.count ?? 0, total: soma(desconhecidos.data) },
    semInformar: { vendas: semInformar.count ?? 0, total: soma(semInformar.data) },
  };
}
