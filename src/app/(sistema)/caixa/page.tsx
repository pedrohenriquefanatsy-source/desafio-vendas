import Link from "next/link";
import { Cartao, EstadoVazio, LinkBotao, TituloPagina, Valor } from "@/componentes/ui";
import { formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { ChevronDown } from "lucide-react";
import { NOMES_LANCAMENTO, detalhesDoLivro, listarDevidos, livroCaixa, resultadoAtual, saldoCaixa, type LancamentoCaixa } from "@/servicos/caixa";

// Caixa: saldo e faturamento lado a lado, separados (Seção 3.2). Botões de lançamento,
// "a reembolsar" por participante e o livro de caixa por dia.
export default async function Caixa() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const [saldo, resultado, devidos, livro] = await Promise.all([saldoCaixa(), resultadoAtual(), listarDevidos(), livroCaixa()]);
  const detalhes = await detalhesDoLivro(livro);
  const aReembolsar = devidos.filter((d) => Number(d.devido) > 0);
  const porDia = new Map<string, LancamentoCaixa[]>();
  for (const l of livro) porDia.set(l.dia ?? "", [...(porDia.get(l.dia ?? "") ?? []), l]);

  return (
    <>
      <TituloPagina>Caixa</TituloPagina>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Cartao>
          <p className="text-sm text-texto-suave">Saldo de caixa</p>
          <Valor valor={saldo.saldo} className={`text-2xl ${saldo.saldo < 0 ? "text-negativo" : ""}`} />
          <p className="mt-1 text-xs text-texto-suave">Dinheiro que está na conta</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-texto-suave">Faturamento</p>
          <Valor valor={resultado.vendido} className="text-2xl" />
          <p className="mt-1 text-xs text-texto-suave">{resultado.desafio ? resultado.desafio.nome : "Sem desafio em andamento"}</p>
        </Cartao>
      </div>
      <p className="mb-4 text-xs text-texto-suave">
        Faturamento = o que foi vendido (sem doações e sem canceladas). Lucro estimado {formatarReais(resultado.resultado)} = margem das vendas{" "}
        {formatarReais(resultado.margem)} − perdas {formatarReais(resultado.perdas)} − despesas {formatarReais(resultado.despesas)}.
        Compras e aportes mexem no caixa, não no faturamento.
        {resultado.semCusto ? " Há venda de produto sem custo cadastrado: o lucro estimado está incompleto." : ""}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <LinkBotao href="/caixa/despesa">Despesa</LinkBotao>
        <LinkBotao href="/compras/nova" variante="secundario">Compra</LinkBotao>
        <LinkBotao href="/caixa/reembolsos" variante="secundario">Reembolso</LinkBotao>
        <LinkBotao href="/caixa/aporte" variante="secundario">Aporte</LinkBotao>
        {admin ? (
          <LinkBotao href="/caixa/ajuste" variante="secundario" className="col-span-2">
            Conferir e ajustar o saldo
          </LinkBotao>
        ) : null}
      </div>

      {aReembolsar.length ? (
        <Cartao className="mb-4">
          <h2 className="mb-2 font-semibold">A reembolsar</h2>
          <ul className="divide-y divide-borda text-sm">
            {aReembolsar.map((d) => (
              <li key={d.participante_id} className="flex justify-between gap-3 py-2">
                <span>{d.participante ?? "Sem nome"}</span>
                <span className="font-semibold tabular-nums">{formatarReais(d.devido)}</span>
              </li>
            ))}
          </ul>
          <Link href="/caixa/reembolsos" className="mt-1 inline-flex min-h-toque items-center text-sm font-medium text-acao">
            {admin ? "Pagar reembolso" : "Ver detalhes"}
          </Link>
        </Cartao>
      ) : null}

      <h2 className="mb-2 font-semibold">Livro de caixa</h2>
      {livro.length === 0 ? (
        <EstadoVazio titulo="Nenhum movimento de dinheiro ainda">Recebimentos de vendas, compras e despesas aparecem aqui.</EstadoVazio>
      ) : (
        <div className="flex flex-col gap-3">
          {[...porDia.entries()].map(([dia, itens]) => (
            <section key={dia}>
              <h3 className="mb-1 flex justify-between text-sm text-texto-suave">
                <span>{formatarData(dia)}</span>
                <span className="tabular-nums">{formatarReais(itens.reduce((t, l) => t + Number(l.valor ?? 0), 0))} no dia</span>
              </h3>
              <Cartao className="divide-y divide-borda p-0">
                {itens.map((l) => {
                  const cabecalho = (
                    <>
                      <span className="min-w-0">
                        <span className="block font-medium">{l.descricao ?? (l.tipo ? NOMES_LANCAMENTO[l.tipo] : "")}</span>
                        <span className="block text-xs text-texto-suave">
                          {formatarDataHora(l.criado_em).slice(-5)} · {l.quem ?? "—"} · saldo {formatarReais(l.saldo_apos)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className={`whitespace-nowrap font-semibold tabular-nums ${Number(l.valor) < 0 ? "text-negativo" : "text-positivo"}`}>
                          {Number(l.valor) > 0 ? "+" : ""}
                          {formatarReais(l.valor)}
                        </span>
                      </span>
                    </>
                  );
                  const d = detalhes.get(l.id ?? 0);
                  if (!d) {
                    return (
                      <div key={l.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        {cabecalho}
                      </div>
                    );
                  }
                  return (
                    <details key={l.id} className="group">
                      <summary className="flex min-h-toque cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                        {cabecalho}
                        <ChevronDown aria-hidden className="mt-1 h-4 w-4 shrink-0 text-texto-suave transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mx-4 mb-3 rounded-xl bg-fundo px-3 py-2 text-sm">
                        {d.linhas.map((linha, n) => (
                          <p key={n} className={n === 0 ? "font-medium" : "text-texto-suave"}>
                            {linha}
                          </p>
                        ))}
                        {d.link ? (
                          <Link href={d.link.href} className="inline-flex min-h-toque items-center font-medium text-acao">
                            {d.link.rotulo} →
                          </Link>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </Cartao>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
