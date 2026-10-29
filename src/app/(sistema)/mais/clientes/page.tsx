import { Abas, Cartao, EstadoVazio, LinkBotao, TituloPagina } from "@/componentes/ui";
import { formatarReais } from "@/lib/numeros";
import { formatarData } from "@/lib/datas";
import { exigirParticipante } from "@/servicos/sessao";
import { listarBairros, listarClientes, resumoDeClientes } from "@/servicos/vendas";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default async function Clientes({ searchParams }: PageProps<"/mais/clientes">) {
  await exigirParticipante();
  const busca = await searchParams;
  const aba = busca.ver === "bairros" ? "bairros" : "clientes";
  const [clientes, bairros, resumo] = await Promise.all([listarClientes(), listarBairros(), resumoDeClientes()]);

  return (
    <>
      <TituloPagina apoio="Quem mais comprou e onde você mais vende. Só entram vendas ativas que já contam no faturamento, sem doações.">
        Clientes e bairros
      </TituloPagina>

      <Cartao className="mb-4 divide-y divide-borda p-0">
        <p className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
          <span>Com nome do cliente</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {resumo.nomeados.vendas} · {formatarReais(resumo.nomeados.total)}
          </span>
        </p>
        <p className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
          <span>Para cliente desconhecido</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {resumo.desconhecidos.vendas} · {formatarReais(resumo.desconhecidos.total)}
          </span>
        </p>
        {resumo.semInformar.vendas > 0 ? (
          <p className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm text-texto-suave">
            <span>Sem informar o cliente</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">
              {resumo.semInformar.vendas} · {formatarReais(resumo.semInformar.total)}
            </span>
          </p>
        ) : null}
      </Cartao>

      <Abas
        atual={aba}
        abas={[
          { valor: "clientes", rotulo: "Clientes", href: "/mais/clientes", contagem: clientes.length },
          { valor: "bairros", rotulo: "Bairros", href: "/mais/clientes?ver=bairros", contagem: bairros.length },
        ]}
      />

      {aba === "clientes" ? (
        clientes.length === 0 ? (
          <EstadoVazio
            titulo="Ainda não há clientes com nome"
            acao={<LinkBotao href="/vendas/nova">Registrar uma venda</LinkBotao>}
          >
            Ao registrar uma venda, escreva o nome do cliente. Quem comprou mais aparece aqui, do maior para o menor.
          </EstadoVazio>
        ) : (
          <Cartao className="divide-y divide-borda p-0">
            {clientes.map((c, n) => (
              <div key={c.chave} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 text-sm tabular-nums text-texto-suave">{n + 1}º</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.cliente}</span>
                  <span className="block text-sm text-texto-suave">
                    {plural(Number(c.compras), "compra", "compras")}
                    {c.bairro ? ` · ${c.bairro}` : ""}
                    {c.ultima_compra ? ` · última em ${formatarData(c.ultima_compra)}` : ""}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatarReais(c.total)}</span>
              </div>
            ))}
          </Cartao>
        )
      ) : bairros.length === 0 ? (
        <EstadoVazio titulo="Ainda não há bairros informados">
          Ao registrar uma venda, escreva o bairro do cliente. Os bairros que mais compram aparecem aqui.
        </EstadoVazio>
      ) : (
        <Cartao className="divide-y divide-borda p-0">
          {bairros.map((b, n) => (
            <div key={b.chave} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-sm tabular-nums text-texto-suave">{n + 1}º</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{b.bairro}</span>
                <span className="block text-sm text-texto-suave">
                  {plural(Number(b.vendas), "venda", "vendas")}
                  {Number(b.clientes_conhecidos) > 0 ? ` · ${plural(Number(b.clientes_conhecidos), "cliente com nome", "clientes com nome")}` : ""}
                  {Number(b.vendas_desconhecidos) > 0 ? ` · ${b.vendas_desconhecidos} a desconhecidos` : ""}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatarReais(b.total)}</span>
            </div>
          ))}
        </Cartao>
      )}
      <div className="mt-4 text-center">
        <LinkBotao href="/mais/exportar" variante="secundario">
          Levar para a planilha (Exportar)
        </LinkBotao>
      </div>
    </>
  );
}
