import type { OpcaoInsumo } from "@/componentes/campo-insumo-unidade";

type InsumoBasico = { id: string; nome: string; unidade_base: string; tipo: string; ativo: boolean };
type Unidade = { unidade: string | null; quantidade_em_base: number | null };

// Monta as opções do campo "insumo + unidade" (só insumos ativos, do tipo pedido).
export function opcoesInsumo(
  insumos: InsumoBasico[],
  unidades: Record<string, Unidade[]>,
  tipos?: string[],
): OpcaoInsumo[] {
  return insumos
    .filter((i) => i.ativo && (!tipos || tipos.includes(i.tipo)))
    .map((i) => ({
      id: i.id,
      nome: i.nome,
      unidadeBase: i.unidade_base,
      unidades: (unidades[i.id] ?? []).map((u) => ({ unidade: u.unidade ?? "", quantidadeEmBase: Number(u.quantidade_em_base) })),
    }));
}
