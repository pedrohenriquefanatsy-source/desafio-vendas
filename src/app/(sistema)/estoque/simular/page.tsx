import Link from "next/link";
import { Cartao, EstadoVazio, LinkBotao, TituloPagina, classeBotao } from "@/componentes/ui";
import { formatarQuantidade, formatarReais, lerNumero } from "@/lib/numeros";
import { exigirParticipante } from "@/servicos/sessao";
import { listarCustosVariacoes } from "@/servicos/catalogo";
import { simularProducao } from "@/servicos/estoque";

// Simulação de produção: quantas fornadas de cada produto pretende fazer? O sistema mostra quanto de cada insumo
// (e embalagem) precisa, o que tem em estoque e o que falta comprar. Não grava nada.
const campo = "min-h-toque w-24 rounded-xl border border-borda bg-superficie px-3 text-right text-base tabular-nums";

export default async function Simular({ searchParams }: PageProps<"/estoque/simular">) {
  await exigirParticipante();
  const busca = await searchParams;
  const produtos = (await listarCustosVariacoes()).filter((v) => v.tipo === "simples" && v.ativa && v.receita_id);
  const nome = (p: { produto: string | null; variacao: string | null }) => (!p.variacao || p.variacao === "Única" ? p.produto : `${p.produto} · ${p.variacao}`);

  const pedidos = produtos
    .map((p) => {
      const bruto = busca[`f_${p.variacao_id}`];
      return { variacao_id: p.variacao_id ?? "", fornadas: typeof bruto === "string" ? (lerNumero(bruto) ?? 0) : 0 };
    })
    .filter((x) => x.fornadas > 0);
  const resultado = pedidos.length ? await simularProducao(pedidos) : null;
  const faltando = resultado?.insumos.filter((i) => Number(i.falta) > 0) ?? [];
  const custoCompra = faltando.reduce((t, i) => t + Number(i.custo_falta ?? 0), 0);
  const compra = faltando.map((i) => `insumo=${i.insumo_id}&quantidade=${Number(i.falta)}`).join("&");

  return (
    <>
      <Link href="/estoque?aba=producao" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Estoque
      </Link>
      <TituloPagina apoio="Quantas fornadas você quer fazer? Veja o que precisa comprar. Nada é gravado.">Simular produção</TituloPagina>

      {produtos.length === 0 ? (
        <EstadoVazio titulo="Nenhum produto com receita" acao={<LinkBotao href="/mais/produtos" variante="secundario">Ir para Produtos</LinkBotao>}>
          Crie a receita dos produtos para simular a produção.
        </EstadoVazio>
      ) : (
        <form method="get" action="/estoque/simular" className="mb-4 flex flex-col gap-3">
          <Cartao className="divide-y divide-borda p-0">
            {produtos.map((p) => {
              const atual = pedidos.find((x) => x.variacao_id === p.variacao_id)?.fornadas;
              return (
                <label key={p.variacao_id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 font-medium">{nome(p)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <input
                      name={`f_${p.variacao_id}`}
                      inputMode="decimal"
                      defaultValue={atual ? String(atual).replace(".", ",") : ""}
                      placeholder="0"
                      aria-label={`Fornadas de ${nome(p)}`}
                      className={campo}
                    />
                    <span className="w-14 text-sm text-texto-suave">fornadas</span>
                  </span>
                </label>
              );
            })}
          </Cartao>
          <button type="submit" className={classeBotao("primario", "w-full")}>
            Simular
          </button>
        </form>
      )}

      {resultado ? (
        <div className="flex flex-col gap-4">
          <Cartao>
            <h2 className="mb-2 font-semibold">O que isso rende</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {resultado.produtos.map((p) => (
                <li key={p.variacao_id} className="flex justify-between gap-3">
                  <span>
                    {formatarQuantidade(p.fornadas)} {Number(p.fornadas) === 1 ? "fornada" : "fornadas"} de {p.produto}
                  </span>
                  <span className="tabular-nums text-texto-suave">≈ {formatarQuantidade(p.unidades)} potinhos</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-texto-suave">O rendimento vem da última produção registrada de cada produto (ou do esperado na receita).</p>
          </Cartao>

          <section>
            <h2 className="mb-2 font-semibold">Insumos e embalagens</h2>
            <Cartao className="divide-y divide-borda p-0">
              {resultado.insumos.map((i) => {
                const falta = Number(i.falta) > 0;
                return (
                  <div key={i.insumo_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{i.insumo}</span>
                      <span className="block text-sm text-texto-suave">
                        precisa {formatarQuantidade(i.necessario)} {i.unidade} · tem {formatarQuantidade(i.saldo)}
                      </span>
                    </span>
                    {falta ? (
                      <span className="shrink-0 text-right text-sm font-semibold text-alerta">
                        comprar {formatarQuantidade(i.falta)} {i.unidade}
                        {i.custo_falta != null ? <span className="block font-normal tabular-nums">{formatarReais(i.custo_falta)}</span> : null}
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm text-positivo">tem o bastante</span>
                    )}
                  </div>
                );
              })}
            </Cartao>
          </section>

          {faltando.length ? (
            <Cartao className="flex flex-col gap-3">
              <p className="flex items-baseline justify-between">
                <span className="text-texto-suave">Para comprar (estimativa pelo último preço)</span>
                <span className="text-lg font-semibold tabular-nums">{formatarReais(custoCompra)}</span>
              </p>
              <LinkBotao href={`/compras/nova?${compra}`}>Registrar compra com esta lista</LinkBotao>
            </Cartao>
          ) : (
            <p className="text-sm text-positivo">O estoque atual cobre essa produção.</p>
          )}
        </div>
      ) : null}
    </>
  );
}
