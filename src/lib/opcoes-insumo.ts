import type { OpcaoInsumo } from "@/componentes/campo-insumo-unidade";

type InsumoBasico = { id: string; nome: string; unidade_base: string; tipo: string; ativo: boolean; custo_atual: number | null };
type Unidade = { unidade: string | null; quantidade_em_base: number | null };

// Monta as opções do campo "insumo + unidade" (só insumos ativos, do tipo pedido). Leva junto o custo
// e a embalagem cadastrada, para as telas de compra e de receita mostrarem a conta sem ir ao banco.
export function opcoesInsumo(
  insumos: InsumoBasico[],
  unidades: Record<string, Unidade[]>,
  tipos?: string[],
): OpcaoInsumo[] {
  return insumos
    .filter((i) => i.ativo && (!tipos || tipos.includes(i.tipo)))
    .map((i) => {
      const lista = (unidades[i.id] ?? []).map((u) => ({ unidade: u.unidade ?? "", quantidadeEmBase: Number(u.quantidade_em_base) }));
      const custoBase = i.custo_atual == null ? null : Number(i.custo_atual);
      const tamanho = lista.find((u) => u.unidade === "embalagem")?.quantidadeEmBase;
      return {
        id: i.id,
        nome: i.nome,
        unidadeBase: i.unidade_base,
        unidades: lista,
        custoBase,
        embalagem: tamanho ? { tamanho, preco: custoBase == null ? null : Math.round(custoBase * tamanho * 100) / 100 } : null,
      };
    });
}
