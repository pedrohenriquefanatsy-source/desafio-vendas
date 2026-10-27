import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { mensagemDeErro } from "./erros";
import type { Coluna, Linha } from "@/lib/planilha";

// Exportações (Seção 4.8). Os dados vêm direto do Supabase (tabelas e views), não da tela,
// lidos com a permissão de quem pediu. Cada uma tem o ID do registro na primeira coluna.

export type Filtros = { de?: string; ate?: string; produto?: string; participante?: string };
type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;
type Definicao = {
  titulo: string;
  filtros: ("periodo" | "produto" | "participante")[];
  colunas: Coluna[];
  carregar: (s: Cliente, f: Filtros) => Promise<Linha[]>;
};

const t = (chave: string, titulo: string): Coluna => ({ chave, titulo, tipo: "texto" });
const n = (chave: string, titulo: string): Coluna => ({ chave, titulo, tipo: "numero" });
const d = (chave: string, titulo: string): Coluna => ({ chave, titulo, tipo: "data" });
const dh = (chave: string, titulo: string): Coluna => ({ chave, titulo, tipo: "datahora" });

// Lê tudo, de mil em mil (limite de cada leitura do Supabase).
async function tudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw new Error(mensagemDeErro(error));
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) return linhas;
  }
}

// Início e fim do período em instantes (o dia é o de Fortaleza, UTC−3).
const inicioDia = (dia: string) => `${dia}T03:00:00Z`;
const fimDia = (dia: string) => new Date(new Date(`${dia}T03:00:00Z`).getTime() + 86_400_000).toISOString();

async function nomesVariacoes(s: Cliente) {
  const vs = await tudo((a, b) => s.from("v_custo_variacoes").select("variacao_id, produto, variacao").range(a, b));
  return new Map(vs.map((v) => [v.variacao_id, v.variacao === "Única" ? v.produto : `${v.produto} · ${v.variacao}`]));
}
async function nomesPessoas(s: Cliente) {
  const ps = await tudo((a, b) => s.from("perfis").select("id, nome").range(a, b));
  return new Map(ps.map((p) => [p.id, p.nome]));
}
async function nomesInsumos(s: Cliente) {
  const is = await tudo((a, b) => s.from("insumos").select("id, nome, unidade_base").range(a, b));
  return new Map(is.map((i) => [i.id, i]));
}

export const EXPORTACOES: Record<string, Definicao> = {
  vendas: {
    titulo: "Vendas",
    filtros: ["periodo", "produto", "participante"],
    colunas: [
      t("id", "ID"), n("numero", "Nº"), dh("data_hora", "Data e hora"), d("dia", "Dia"), t("tipo", "Tipo"), t("situacao", "Situação"),
      t("participante", "Quem vendeu"), t("cliente", "Cliente"), t("forma_pagamento", "Forma de pagamento"), n("taxa_percentual", "Taxa (%)"),
      n("subtotal", "Subtotal"), n("desconto", "Desconto"), n("total", "Total"), n("recebido", "Recebido"), n("a_receber", "A receber"),
      t("situacao_pagamento", "Pagamento"), t("situacao_entrega", "Entrega"), d("entrega_prevista", "Entrega prevista"),
      dh("reconhecida_em", "Entrou no resultado em"), n("margem_total", "Margem (MC)"), t("itens_resumo", "Itens"),
      t("motivo_cancelamento", "Motivo do cancelamento"), t("observacao", "Observação"),
    ],
    carregar: async (s, f) =>
      tudo((a, b) => {
        let q = s.from("v_vendas").select("*").order("numero").range(a, b);
        if (f.de) q = q.gte("dia", f.de);
        if (f.ate) q = q.lte("dia", f.ate);
        if (f.participante) q = q.eq("participante_id", f.participante);
        if (f.produto) q = q.contains("variacoes", [f.produto]);
        return q;
      }),
  },
  itens: {
    titulo: "Itens das vendas",
    filtros: ["periodo", "produto", "participante"],
    colunas: [
      t("id", "ID do item"), t("venda_id", "ID da venda"), n("numero", "Nº da venda"), d("dia", "Dia"), t("tipo", "Tipo"), t("situacao", "Situação"),
      t("produto", "Produto"), n("quantidade", "Quantidade"), n("preco_unitario", "Preço unitário"), n("valor_bruto", "Valor bruto"),
      n("desconto_rateado", "Desconto rateado"), n("valor_liquido", "Valor líquido"), n("custo_unitario_momento", "Custo unitário no momento"),
      n("taxa_rateada", "Taxa rateada"), n("margem_contribuicao", "Margem (MC)"),
    ],
    carregar: async (s, f) => {
      const vendas = await EXPORTACOES.vendas.carregar(s, { ...f, produto: undefined });
      const porId = new Map(vendas.map((v) => [String(v.id), v]));
      const nomes = await nomesVariacoes(s);
      const ids = [...porId.keys()];
      const itens = [];
      for (let i = 0; i < ids.length; i += 200) {
        const parte = ids.slice(i, i + 200);
        itens.push(...(await tudo((a, b) => s.from("venda_itens").select("*").in("venda_id", parte).order("venda_id").order("ordem").range(a, b))));
      }
      return itens
        .filter((it) => !f.produto || it.variacao_id === f.produto)
        .map((it) => {
          const v = porId.get(it.venda_id);
          return { ...it, numero: v?.numero, dia: v?.dia, tipo: v?.tipo, situacao: v?.situacao, produto: nomes.get(it.variacao_id) };
        })
        .sort((x, y) => Number(x.numero) - Number(y.numero));
    },
  },
  recebimentos: {
    titulo: "Recebimentos",
    filtros: ["periodo"],
    colunas: [
      t("id", "ID"), t("venda_id", "ID da venda"), n("numero", "Nº da venda"), dh("recebido_em", "Recebido em"), t("forma", "Forma"),
      n("valor", "Valor"), n("taxa_percentual", "Taxa (%)"), n("taxa_valor", "Taxa (R$)"), t("estorno_de", "Estorno do recebimento"),
    ],
    carregar: async (s, f) => {
      const [recs, formas, vendas] = await Promise.all([
        tudo((a, b) => {
          let q = s.from("recebimentos").select("*").order("recebido_em").range(a, b);
          if (f.de) q = q.gte("recebido_em", inicioDia(f.de));
          if (f.ate) q = q.lt("recebido_em", fimDia(f.ate));
          return q;
        }),
        tudo((a, b) => s.from("formas_pagamento").select("id, nome").range(a, b)),
        tudo((a, b) => s.from("vendas").select("id, numero").range(a, b)),
      ]);
      const forma = new Map(formas.map((x) => [x.id, x.nome]));
      const numero = new Map(vendas.map((x) => [x.id, x.numero]));
      return recs.map((r) => ({ ...r, forma: forma.get(r.forma_pagamento_id), numero: numero.get(r.venda_id) }));
    },
  },
  produtos: {
    titulo: "Produtos e preços",
    filtros: [],
    colunas: [
      t("variacao_id", "ID da variação"), t("produto_id", "ID do produto"), t("produto", "Produto"), t("variacao", "Variação"), t("tipo", "Tipo"),
      t("categoria", "Categoria"), t("ativa", "Ativo"), n("preco_venda", "Preço"), n("custo_unitario", "Custo unitário"), n("mc_unitaria", "MC unitária"),
      n("mc_percentual", "MC (fração)"), n("markup", "Markup"), t("receita_id", "ID da receita"),
    ],
    carregar: async (s) => tudo((a, b) => s.from("v_custo_variacoes").select("*").order("produto").order("variacao").range(a, b)),
  },
  receitas: {
    titulo: "Receitas",
    filtros: [],
    colunas: [
      t("id", "ID do item"), t("receita_id", "ID da receita"), t("receita", "Receita"), n("rendimento", "Rende (unidades)"), t("insumo", "Insumo"),
      n("quantidade", "Quantidade"), t("unidade", "Unidade"), n("quantidade_base", "Quantidade na unidade base"), t("unidade_base", "Unidade base"),
      n("custo", "Custo atual"),
    ],
    carregar: async (s) => {
      const [itens, receitas] = await Promise.all([
        tudo((a, b) => s.from("v_custo_receita_itens").select("*").order("receita_id").range(a, b)),
        tudo((a, b) => s.from("receitas").select("id, nome, rendimento_unidades").range(a, b)),
      ]);
      const r = new Map(receitas.map((x) => [x.id, x]));
      return itens.map((i) => ({ ...i, receita: r.get(i.receita_id ?? "")?.nome, rendimento: r.get(i.receita_id ?? "")?.rendimento_unidades }));
    },
  },
  insumos: {
    titulo: "Insumos e estoque",
    filtros: [],
    colunas: [
      t("insumo_id", "ID"), t("nome", "Insumo"), t("tipo", "Tipo"), t("unidade_base", "Unidade base"), t("ativo", "Ativo"), n("custo_atual", "Custo por unidade base"),
      n("saldo", "Saldo"), n("valor_estoque", "Valor em estoque"), n("estoque_minimo", "Estoque mínimo"), t("abaixo_minimo", "Abaixo do mínimo"),
    ],
    carregar: async (s) => tudo((a, b) => s.from("v_estoque_insumos").select("*").order("tipo").order("nome").range(a, b)),
  },
  compras: {
    titulo: "Compras",
    filtros: ["periodo", "participante"],
    colunas: [
      t("id", "ID do item"), t("compra_id", "ID da compra"), d("data", "Data"), t("fornecedor", "Onde"), t("pago_por", "Pago por"), t("participante", "Quem pagou do bolso"),
      t("situacao", "Situação"), t("insumo", "Insumo"), n("quantidade", "Quantidade"), t("unidade", "Unidade"), n("quantidade_base", "Quantidade na unidade base"),
      n("valor", "Valor do item"), n("custo_por_base", "Custo por unidade base"), n("total_compra", "Total da compra"),
    ],
    carregar: async (s, f) => {
      const compras = await tudo((a, b) => {
        let q = s.from("compras").select("*").order("data").range(a, b);
        if (f.de) q = q.gte("data", f.de);
        if (f.ate) q = q.lte("data", f.ate);
        if (f.participante) q = q.eq("participante_id", f.participante);
        return q;
      });
      const [insumos, pessoas] = await Promise.all([nomesInsumos(s), nomesPessoas(s)]);
      const porId = new Map(compras.map((c) => [c.id, c]));
      const ids = [...porId.keys()];
      const itens = [];
      for (let i = 0; i < ids.length; i += 200) {
        itens.push(...(await tudo((a, b) => s.from("compra_itens").select("*").in("compra_id", ids.slice(i, i + 200)).range(a, b))));
      }
      return itens.map((it) => {
        const c = porId.get(it.compra_id);
        return {
          ...it, data: c?.data, fornecedor: c?.fornecedor, pago_por: c?.pago_por, participante: pessoas.get(c?.participante_id ?? ""),
          situacao: c?.situacao, insumo: insumos.get(it.insumo_id)?.nome, total_compra: c?.total,
        };
      }).sort((x, y) => String(x.data).localeCompare(String(y.data)));
    },
  },
  estoque: {
    titulo: "Movimentações de estoque",
    filtros: ["periodo", "produto"],
    colunas: [
      n("id", "ID"), dh("criado_em", "Quando"), t("tipo", "Tipo"), t("item", "Item"), t("insumo_id", "ID do insumo"), t("variacao_id", "ID do produto"),
      n("quantidade_base", "Quantidade (+ entra, − sai)"), t("unidade", "Unidade"), n("custo_unitario", "Custo unitário"), t("origem_tipo", "Origem"),
      t("origem_id", "ID da origem"), t("justificativa", "Motivo"), t("quem", "Quem"),
    ],
    carregar: async (s, f) => {
      const [movs, insumos, nomes, pessoas] = await Promise.all([
        tudo((a, b) => {
          let q = s.from("movimentos_estoque").select("*").order("id").range(a, b);
          if (f.de) q = q.gte("criado_em", inicioDia(f.de));
          if (f.ate) q = q.lt("criado_em", fimDia(f.ate));
          if (f.produto) q = q.eq("variacao_id", f.produto);
          return q;
        }),
        nomesInsumos(s),
        nomesVariacoes(s),
        nomesPessoas(s),
      ]);
      return movs.map((m) => ({
        ...m,
        item: m.insumo_id ? insumos.get(m.insumo_id)?.nome : nomes.get(m.variacao_id ?? ""),
        unidade: m.insumo_id ? insumos.get(m.insumo_id)?.unidade_base : "und",
        quem: pessoas.get(m.criado_por ?? ""),
      }));
    },
  },
  producao: {
    titulo: "Produção",
    filtros: ["periodo", "produto"],
    colunas: [
      t("id", "ID"), dh("criado_em", "Planejada em"), t("produto", "Produto"), n("fornadas", "Fornadas"), n("unidades_previstas", "Previstas"),
      t("situacao", "Situação"), n("unidades_produzidas", "Boas"), n("unidades_perdidas", "Perdidas"), dh("concluida_em", "Concluída em"),
      t("motivo_cancelamento", "Motivo do cancelamento"),
    ],
    carregar: async (s, f) => {
      const [prods, nomes] = await Promise.all([
        tudo((a, b) => {
          let q = s.from("producoes").select("*").order("criado_em").range(a, b);
          if (f.de) q = q.gte("criado_em", inicioDia(f.de));
          if (f.ate) q = q.lt("criado_em", fimDia(f.ate));
          if (f.produto) q = q.eq("variacao_id", f.produto);
          return q;
        }),
        nomesVariacoes(s),
      ]);
      return prods.map((p) => ({ ...p, produto: nomes.get(p.variacao_id) }));
    },
  },
  despesas: {
    titulo: "Despesas",
    filtros: ["periodo", "participante"],
    colunas: [
      t("id", "ID"), d("data", "Data"), t("descricao", "Descrição"), t("categoria", "Categoria"), n("valor", "Valor"), t("pago_por", "Pago por"),
      t("participante", "Quem pagou do bolso"), t("situacao", "Situação"), t("motivo_cancelamento", "Motivo do cancelamento"),
    ],
    carregar: async (s, f) => {
      const [desp, pessoas] = await Promise.all([
        tudo((a, b) => {
          let q = s.from("despesas").select("*").order("data").range(a, b);
          if (f.de) q = q.gte("data", f.de);
          if (f.ate) q = q.lte("data", f.ate);
          if (f.participante) q = q.eq("participante_id", f.participante);
          return q;
        }),
        nomesPessoas(s),
      ]);
      return desp.map((x) => ({ ...x, participante: pessoas.get(x.participante_id ?? "") }));
    },
  },
  reembolsos: {
    titulo: "Reembolsos",
    filtros: ["periodo", "participante"],
    colunas: [
      t("id", "ID"), d("data", "Data"), t("participante", "Para quem"), n("valor", "Valor"), t("situacao", "Situação"), t("observacao", "Observação"),
      t("motivo_cancelamento", "Motivo do cancelamento"),
    ],
    carregar: async (s, f) => {
      const [rs, pessoas] = await Promise.all([
        tudo((a, b) => {
          let q = s.from("reembolsos").select("*").order("data").range(a, b);
          if (f.de) q = q.gte("data", f.de);
          if (f.ate) q = q.lte("data", f.ate);
          if (f.participante) q = q.eq("participante_id", f.participante);
          return q;
        }),
        nomesPessoas(s),
      ]);
      return rs.map((x) => ({ ...x, participante: pessoas.get(x.participante_id) }));
    },
  },
  caixa: {
    titulo: "Fluxo de caixa",
    filtros: ["periodo"],
    colunas: [
      n("id", "ID"), dh("criado_em", "Quando"), d("dia", "Dia"), t("tipo", "Tipo"), t("descricao", "Descrição"), n("valor", "Valor"),
      n("saldo_apos", "Saldo depois"), t("origem_tipo", "Origem"), t("origem_id", "ID da origem"), t("quem", "Quem"),
    ],
    carregar: async (s, f) =>
      tudo((a, b) => {
        let q = s.from("v_fluxo_caixa").select("*").order("id").range(a, b);
        if (f.de) q = q.gte("dia", f.de);
        if (f.ate) q = q.lte("dia", f.ate);
        return q;
      }),
  },
  metas: {
    titulo: "Metas e indicadores",
    filtros: [],
    colunas: [
      t("desafio_id", "ID do desafio"), t("nome", "Desafio"), d("inicio", "Início"), d("fim", "Fim"), t("situacao", "Situação"), n("meta_resultado", "Meta de resultado"),
      n("realizado", "Realizado"), n("percentual", "% da meta"), n("falta", "Falta"), n("dias_restantes", "Dias restantes (com hoje)"),
      n("ritmo_necessario", "Ritmo necessário por dia"), n("media_por_dia", "Média por dia"), n("margem", "Margem das vendas"), n("perdas", "Perdas"),
      n("despesas", "Despesas"), n("vendido", "Vendido"), n("meta_vendas", "Meta de vendas"), n("mc_media_unidade", "MC média por unidade"),
      n("unidades_para_meta", "Projeção: unidades para a meta"),
    ],
    carregar: async (s) => tudo((a, b) => s.from("v_painel_meta").select("*").order("inicio").range(a, b)),
  },
  resultado_diario: {
    titulo: "Resultado por dia",
    filtros: ["periodo"],
    colunas: [
      t("desafio_id", "ID do desafio"), d("dia", "Dia"), n("margem_vendas", "Margem das vendas"), n("custo_perdas", "Perdas"), n("despesas", "Despesas"),
      n("resultado", "Resultado"), n("vendido", "Vendido"), n("vendas", "Vendas"), n("unidades", "Unidades"),
    ],
    carregar: async (s, f) =>
      tudo((a, b) => {
        let q = s.from("v_resultado_diario").select("*").order("dia").range(a, b);
        if (f.de) q = q.gte("dia", f.de);
        if (f.ate) q = q.lte("dia", f.ate);
        return q;
      }),
  },
};

export async function carregarExportacao(tipo: string, filtros: Filtros) {
  const def = EXPORTACOES[tipo];
  if (!def) return null;
  const s = await criarClienteServidor();
  return { ...def, linhas: await def.carregar(s, filtros) };
}
