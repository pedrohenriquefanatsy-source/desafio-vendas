import "server-only";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Tables } from "@/lib/supabase/tipos-banco";
import { mensagemDeErro, type Resultado } from "./erros";
import { obterDesafioAtual } from "./desafios";
import { saldoCaixa } from "./caixa";

// Painel do Início (Seção 3.2) e cobertura de estoque. Realizado, projeção e estimativa
// vêm prontos das views do banco (v_painel_meta, v_resultado_diario, v_cobertura_estoque).

export type PainelMeta = Tables<"v_painel_meta">;
export type Cobertura = Tables<"v_cobertura_estoque">;
export type DiaDoDesafio = { dia: string; resultado: number | null; acumulado: number | null; futuro: boolean };

function lista<T>(r: { data: T[] | null; error: { code?: string; message?: string } | null }): T[] {
  if (r.error) throw new Error(mensagemDeErro(r.error));
  return r.data ?? [];
}

// Todos os dias do desafio, de início a fim; dias futuros ficam sem valor (não é zero).
function diasDoDesafio(inicio: string, fim: string, hoje: string, porDia: Map<string, number>): DiaDoDesafio[] {
  const dias: DiaDoDesafio[] = [];
  let acumulado = 0;
  for (let d = new Date(`${inicio}T12:00:00Z`); d <= new Date(`${fim}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const futuro = iso > hoje;
    const resultado = futuro ? null : (porDia.get(iso) ?? 0);
    if (resultado != null) acumulado += resultado;
    dias.push({ dia: iso, resultado, acumulado: futuro ? null : Math.round(acumulado * 100) / 100, futuro });
  }
  return dias;
}

export async function obterPainel() {
  const s = await criarClienteServidor();
  const desafio = await obterDesafioAtual();
  const [meta, diario, caixa, aReceber, encomendas, devidos, minimos] = await Promise.all([
    desafio ? s.from("v_painel_meta").select("*").eq("desafio_id", desafio.id ?? "").maybeSingle() : Promise.resolve({ data: null, error: null }),
    desafio ? s.from("v_resultado_diario").select("dia, resultado").eq("desafio_id", desafio.id ?? "") : Promise.resolve({ data: [], error: null }),
    saldoCaixa(),
    s.from("v_vendas").select("a_receber").gt("a_receber", 0),
    s.from("v_vendas").select("id", { count: "exact", head: true }).eq("situacao", "ativa").eq("tipo", "encomenda").neq("situacao_entrega", "entregue"),
    s.from("v_reembolsos_devidos").select("devido").gt("devido", 0),
    s.from("v_estoque_insumos").select("insumo_id", { count: "exact", head: true }).eq("ativo", true).eq("abaixo_minimo", true),
  ]);
  if (meta.error) throw new Error(mensagemDeErro(meta.error));
  const porDia = new Map(lista(diario).map((d) => [d.dia ?? "", Number(d.resultado ?? 0)]));
  const m = meta.data;
  return {
    desafio,
    meta: m,
    dias: m?.inicio && m.fim && m.hoje ? diasDoDesafio(m.inicio, m.fim, m.hoje, porDia) : [],
    caixa: caixa.saldo,
    aReceber: lista(aReceber).reduce((t, v) => t + Number(v.a_receber ?? 0), 0),
    contasAReceber: lista(aReceber).length,
    encomendas: encomendas.count ?? 0,
    reembolsos: lista(devidos).reduce((t, d) => t + Number(d.devido ?? 0), 0),
    abaixoMinimo: minimos.count ?? 0,
  };
}

export async function listarCobertura(): Promise<Cobertura[]> {
  const s = await criarClienteServidor();
  return lista(await s.from("v_cobertura_estoque").select("*"));
}

export async function listarDemandas(desafioId: string) {
  const s = await criarClienteServidor();
  return lista(await s.from("demanda_estimada").select("*").eq("desafio_id", desafioId));
}

// Demanda estimada (só o administrador; o banco confere). Vazio = tirar a estimativa.
export async function definirDemanda(desafioId: string, variacaoId: string, unidades: number | null): Promise<Resultado> {
  const s = await criarClienteServidor();
  const existente = await s.from("demanda_estimada").select("id").eq("desafio_id", desafioId).eq("variacao_id", variacaoId).maybeSingle();
  if (existente.error) return { ok: false, erro: mensagemDeErro(existente.error) };
  let r;
  if (unidades == null) {
    if (!existente.data) return { ok: true, mensagem: "Sem estimativa." };
    r = await s.from("demanda_estimada").delete().eq("id", existente.data.id).select("id");
  } else if (existente.data) {
    r = await s.from("demanda_estimada").update({ unidades_por_dia: unidades }).eq("id", existente.data.id).select("id");
  } else {
    r = await s.from("demanda_estimada").insert({ desafio_id: desafioId, variacao_id: variacaoId, unidades_por_dia: unidades }).select("id");
  }
  if (r.error) return { ok: false, erro: mensagemDeErro(r.error) };
  if (!r.data?.length) return { ok: false, erro: "Você não tem permissão para isso. Se precisar, peça ao administrador." };
  return { ok: true, mensagem: unidades == null ? "Estimativa retirada." : "Estimativa salva." };
}

// "Primeiros passos" do administrador: o que falta para o sistema calcular custo, meta e resultado.
export type Passo = { feito: boolean; texto: string; href: string; opcional?: boolean };

export async function obterPassos(): Promise<Passo[]> {
  const s = await criarClienteServidor();
  const [desafio, insumos, sabores, pessoas] = await Promise.all([
    obterDesafioAtual(),
    s.from("insumos").select("custo_atual").eq("ativo", true),
    s.from("v_custo_variacoes").select("custo_unitario").eq("ativa", true).eq("tipo", "simples"),
    s.from("perfis").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);
  const listaInsumos = lista(insumos);
  const listaSabores = lista(sabores);
  return [
    { feito: desafio?.situacao === "em_andamento", texto: "Desafio com datas e meta, em andamento", href: desafio ? `/mais/desafios/${desafio.id}` : "/mais/desafios/novo" },
    {
      feito: listaInsumos.length > 0 && listaInsumos.every((i) => i.custo_atual != null),
      texto: listaInsumos.length === 0 ? "Insumos cadastrados, com embalagem e preço" : "Todos os insumos com preço",
      href: "/mais/insumos",
    },
    { feito: listaSabores.some((v) => v.custo_unitario != null), texto: "Um produto com receita e custo calculado", href: "/mais/produtos" },
    { feito: (pessoas.count ?? 0) > 1, texto: "Chamar os outros participantes", href: "/mais/participantes", opcional: true },
  ];
}
