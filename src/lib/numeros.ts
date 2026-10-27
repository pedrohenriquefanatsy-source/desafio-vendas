// Leitura e formatação de números no padrão brasileiro.
// Aceita o que a pessoa digitar com pressa (Lei de Postel): "6,50", "6.50",
// "R$ 1.234,56", "1234.5", "3,99%". Devolve null quando não é um número.
export function lerNumero(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let limpo = texto.replace(/R\$|%|\s/g, "");
  if (limpo === "") return null;
  if (limpo.includes(",")) {
    // Vírgula é o decimal; pontos são separadores de milhar.
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else if ((limpo.match(/\./g) ?? []).length > 1) {
    // "1.234.567" sem vírgula: só separadores de milhar.
    limpo = limpo.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(limpo)) return null;
  return Number(limpo);
}

const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function formatarReais(valor: number | string | null | undefined): string {
  if (valor == null || valor === "") return "—";
  return reais.format(Number(valor));
}

export function formatarPercentual(valor: number | string | null | undefined): string {
  if (valor == null || valor === "") return "—";
  return `${percentual.format(Number(valor))}%`;
}

// Separa reais e centavos para mostrar os centavos menores (referência visual).
export function partesReais(valor: number | string): { inteiro: string; centavos: string } {
  const texto = formatarReais(valor);
  const virgula = texto.lastIndexOf(",");
  return { inteiro: texto.slice(0, virgula), centavos: texto.slice(virgula) };
}

const quantidade = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const custoMiudo = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

// 0,4 → "0,4"; 462.15 → "462,15"
export function formatarQuantidade(valor: number | string | null | undefined): string {
  if (valor == null || valor === "") return "—";
  return quantidade.format(Number(valor));
}

// Custo por unidade base, que costuma ter frações de centavo: R$ 0,0048/g.
export function formatarCustoUnidade(valor: number | string | null | undefined, unidade: string): string {
  if (valor == null || valor === "") return "sem preço";
  return `${custoMiudo.format(Number(valor))}/${unidade}`;
}
