import Link from "next/link";
import { Cartao, TituloPagina } from "@/componentes/ui";
import { exigirParticipante } from "@/servicos/sessao";

// "Como calculamos" (menu Mais, Seção 3.1): as fórmulas em linguagem simples.
// A versão completa, com exemplos testados, está em docs/regras-de-negocio.md.
const BLOCOS: { titulo: string; itens: string[] }[] = [
  {
    titulo: "Custo de cada produto",
    itens: [
      "Custo da receita = soma de (quantidade de cada insumo × preço por grama, ml ou unidade).",
      "Custo por unidade = custo da receita ÷ quantas unidades ela rende + embalagens de cada unidade.",
      "Kit = soma do custo dos produtos que o formam + a embalagem própria do kit.",
      "O preço de cada insumo é o da última compra (ou o que o administrador cadastrou).",
    ],
  },
  {
    titulo: "Margem de cada venda",
    itens: [
      "Margem (MC) = valor da venda − desconto − custo do produto naquele momento − taxa da forma de pagamento.",
      "O custo e a margem ficam guardados na venda: se um insumo ficar mais caro depois, as vendas passadas não mudam.",
      "Desconto da venda é dividido entre os itens pelo valor de cada um.",
      "Encomenda só entra na conta quando é entregue. Doação entra só com o custo (margem negativa).",
    ],
  },
  {
    titulo: "Resultado e caixa (são contas diferentes)",
    itens: [
      "Resultado = soma das margens das vendas − custo das perdas − despesas.",
      "Compras de insumo, aportes, reembolsos e ajustes de caixa não mudam o resultado.",
      "Saldo de caixa = todo dinheiro que entrou − todo dinheiro que saiu (recebimentos, taxas, compras, despesas, reembolsos, aportes).",
      "Venda pendente conta no resultado, mas só entra no caixa quando o dinheiro é recebido.",
    ],
  },
  {
    titulo: "Meta",
    itens: [
      "Falta = meta − resultado realizado.",
      "Ritmo necessário por dia = falta ÷ dias que restam, contando hoje.",
      "Projeção = falta ÷ margem média por unidade vendida até agora. É uma conta com premissas, não uma promessa.",
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      "O saldo é a soma de todas as entradas e saídas registradas; ninguém digita saldo.",
      "Quanto dá para produzir = o insumo que acaba primeiro decide o número de fornadas.",
      "Para quantos dias o estoque dá = saldo ÷ média vendida por dia (com 2 dias ou mais de venda) ou ÷ a demanda estimada (rotulada estimativa).",
      "Reembolso devido = o que a pessoa pagou do bolso − o que já foi devolvido a ela.",
    ],
  },
];

export default async function ComoCalculamos() {
  await exigirParticipante();
  return (
    <>
      <Link href="/mais" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Mais
      </Link>
      <TituloPagina apoio="Todas as contas são feitas pelo banco de dados, sempre do mesmo jeito.">Como calculamos</TituloPagina>
      <div className="flex flex-col gap-3">
        {BLOCOS.map((b) => (
          <Cartao key={b.titulo}>
            <h2 className="mb-2 font-semibold">{b.titulo}</h2>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {b.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Cartao>
        ))}
      </div>
    </>
  );
}
