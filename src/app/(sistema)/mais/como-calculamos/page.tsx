import { Cartao, TituloPagina, BotaoVoltar } from "@/componentes/ui";
import { exigirParticipante } from "@/servicos/sessao";

// "Como calculamos" (menu Mais, Seção 3.1): as fórmulas em linguagem simples.
// A versão completa, com exemplos testados, está em docs/regras-de-negocio.md.
const BLOCOS: { titulo: string; itens: string[] }[] = [
  {
    titulo: "Custo de cada produto",
    itens: [
      "Preço de cada insumo por grama (ou ml, ou unidade) = preço da embalagem ÷ quanto vem nela. Ex.: R$ 16,00 por 500 g = R$ 0,032 por g.",
      "Custo da receita = soma de (quantidade de cada insumo × preço por grama, ml ou unidade). Cada sabor tem a sua receita.",
      "Custo por unidade = custo da receita ÷ quantas unidades uma fornada rende + embalagens de cada unidade.",
      "Quantas unidades uma fornada rende vem da última produção registrada (potinhos que renderam ÷ fornadas). Antes de existir uma produção, vale o rendimento esperado da receita.",
      "Ao registrar uma produção, o custo de cada potinho fica guardado: custo da produção ÷ potinhos que renderam + embalagem.",
      "Kit = soma do custo dos produtos que o formam + a embalagem própria do kit.",
      "O preço de cada insumo é o da última compra (ou o que o administrador cadastrou).",
      "Sobra (margem de contribuição, MC) = preço de venda − custo. É o que sobra de cada unidade para pagar despesas e dar lucro.",
    ],
  },
  {
    titulo: "Margem de cada venda",
    itens: [
      "Sobra da venda (margem) = valor da venda − desconto − custo do produto naquele momento − taxa da forma de pagamento.",
      "O custo e a margem ficam guardados na venda: se um insumo ficar mais caro depois, as vendas passadas não mudam.",
      "Desconto da venda é dividido entre os itens pelo valor de cada um.",
      "Encomenda paga por inteiro já entra no faturamento na hora do pagamento; se ainda falta receber, entra quando é entregue. O estoque, o custo e o lucro só contam na entrega. Doação entra só com o custo (margem negativa).",
    ],
  },
  {
    titulo: "Faturamento, lucro e caixa (são contas diferentes)",
    itens: [
      "Faturamento = soma do valor das vendas (sem doações e sem canceladas). É o número que a meta acompanha.",
      "Lucro estimado = soma das margens das vendas − custo das perdas − despesas. É só informação, não entra na meta.",
      "Compras de insumo, aportes, reembolsos e ajustes de caixa não mudam o faturamento.",
      "Saldo de caixa = todo dinheiro que entrou − todo dinheiro que saiu (recebimentos, taxas, compras, despesas, reembolsos, aportes).",
      "Venda pendente conta no faturamento, mas só entra no caixa quando o dinheiro é recebido.",
    ],
  },
  {
    titulo: "Meta",
    itens: [
      "Falta = meta − faturamento realizado.",
      "Ritmo necessário por dia = falta ÷ dias que restam, contando hoje.",
      "Projeção = falta ÷ preço médio por unidade vendida até agora. É uma conta com premissas, não uma promessa.",
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      "O saldo é a soma de todas as entradas e saídas registradas. No fim do dia, a contagem do dia acerta os saldos com o que tem de verdade.",
      "O estoque é um controle: registrar uma produção sem insumo suficiente só avisa o que faltava, não trava.",
      "Quanto dá para produzir = o insumo que acaba primeiro decide o número de fornadas. A simulação de produção mostra quanto comprar para as fornadas que você quer fazer.",
      "Para quantos dias o estoque dá = saldo ÷ média vendida por dia (com 2 dias ou mais de venda) ou ÷ a demanda estimada (rotulada estimativa).",
      "Reembolso devido = o que a pessoa pagou do bolso − o que já foi devolvido a ela.",
    ],
  },
];

export default async function ComoCalculamos() {
  await exigirParticipante();
  return (
    <>
      <BotaoVoltar href="/mais">Mais</BotaoVoltar>
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
