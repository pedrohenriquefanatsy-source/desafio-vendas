import { Abas, Cartao, EstadoVazio, ItemLista, LinkBotao, Selo, TituloPagina, classeBotao } from "@/componentes/ui";
import { formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora, hojeIso } from "@/lib/datas";
import { exigirParticipante } from "@/servicos/sessao";
import { listarFormasPagamento } from "@/servicos/formas-pagamento";
import { listarParticipantes } from "@/servicos/participantes";
import { CHIPS, NOMES_CHIP, contarChips, listarProdutosVenda, listarVendas, type Chip, type Venda } from "@/servicos/vendas";

const UUID = /^[0-9a-f-]{36}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function seloDa(v: Venda) {
  if (v.situacao === "cancelada") return <Selo tom="negativo">Cancelada</Selo>;
  if (v.tipo === "doacao") return <Selo>Doação</Selo>;
  if (v.tipo === "encomenda" && v.situacao_entrega !== "entregue")
    return <Selo tom="alerta">{v.situacao_entrega === "pronta" ? "Pronta p/ entregar" : `Entrega ${formatarData(v.entrega_prevista).slice(0, 5)}`}</Selo>;
  if (v.situacao_pagamento === "pendente") return <Selo tom="alerta">Pendente</Selo>;
  if (v.situacao_pagamento === "parcial") return <Selo tom="alerta">Parcial</Selo>;
  return null;
}

export default async function Vendas({ searchParams }: PageProps<"/vendas">) {
  await exigirParticipante();
  const busca = await searchParams;
  const um = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const chip: Chip = (CHIPS as readonly string[]).includes(um(busca.ver) ?? "") ? (um(busca.ver) as Chip) : "hoje";
  const filtros = {
    dia: DATA.test(um(busca.dia) ?? "") ? um(busca.dia) : undefined,
    produto: UUID.test(um(busca.produto) ?? "") ? um(busca.produto) : undefined,
    participante: UUID.test(um(busca.participante) ?? "") ? um(busca.participante) : undefined,
    forma: UUID.test(um(busca.forma) ?? "") ? um(busca.forma) : undefined,
  };
  const temFiltro = Object.values(filtros).some(Boolean);
  const hoje = hojeIso();
  const [lista, contagens, produtos, pessoas, formas] = await Promise.all([
    listarVendas(chip, filtros, hoje),
    contarChips(hoje),
    listarProdutosVenda(),
    listarParticipantes(),
    listarFormasPagamento(),
  ]);
  const total = lista.reduce((t, v) => t + Number(v.total ?? 0), 0);
  const aReceber = lista.reduce((t, v) => t + Number(v.a_receber ?? 0), 0);
  const sufixo = (c: Chip) => {
    const p = new URLSearchParams({ ver: c });
    for (const [k, v] of Object.entries(filtros)) if (v) p.set(k, v);
    return `/vendas?${p}`;
  };

  return (
    <>
      <TituloPagina>Vendas</TituloPagina>
      <Abas atual={chip} abas={CHIPS.map((c) => ({ valor: c, rotulo: NOMES_CHIP[c], href: sufixo(c), contagem: contagens[c] }))} />

      <details open={temFiltro} className="mb-4 rounded-cartao border border-borda bg-superficie">
        <summary className="flex min-h-toque cursor-pointer list-none items-center px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Filtros{temFiltro ? " (ativos)" : ": dia, produto, quem vendeu, pagamento"}
        </summary>
        <form method="get" action="/vendas" className="flex flex-col gap-3 border-t border-borda p-4">
          <input type="hidden" name="ver" value={chip} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Dia
            <input type="date" name="dia" defaultValue={filtros.dia} className="min-h-toque rounded-xl border border-borda bg-superficie px-3 text-base" />
          </label>
          {[
            { nome: "produto", rotulo: "Produto", valor: filtros.produto, opcoes: produtos.map((p) => [p.variacao_id ?? "", p.nome ?? ""]) },
            { nome: "participante", rotulo: "Quem vendeu", valor: filtros.participante, opcoes: pessoas.filter((p) => p.ativo).map((p) => [p.id, p.nome ?? "Sem nome"]) },
            { nome: "forma", rotulo: "Forma de pagamento", valor: filtros.forma, opcoes: formas.map((f) => [f.id, f.nome]) },
          ].map((s) => (
            <label key={s.nome} className="flex flex-col gap-1 text-sm font-medium">
              {s.rotulo}
              <select name={s.nome} defaultValue={s.valor ?? ""} className="min-h-toque rounded-xl border border-borda bg-superficie px-3 text-base">
                <option value="">Todos</option>
                {s.opcoes.map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" className={classeBotao("primario")}>Filtrar</button>
            <LinkBotao href={`/vendas?ver=${chip}`} variante="secundario">Limpar</LinkBotao>
          </div>
        </form>
      </details>

      {lista.length === 0 ? (
        <EstadoVazio
          titulo={chip === "hoje" && !temFiltro ? "Nenhuma venda hoje" : "Nada por aqui"}
          acao={<LinkBotao href="/vendas/nova">Nova venda</LinkBotao>}
        >
          {chip === "hoje" && !temFiltro ? "Toque em ＋ para lançar a primeira." : "Nenhuma venda com esse filtro."}
        </EstadoVazio>
      ) : (
        <>
          <p className="mb-2 text-sm text-texto-suave">
            {lista.length} {lista.length === 1 ? "registro" : "registros"} · {formatarReais(total)}
            {aReceber > 0 ? ` · a receber ${formatarReais(aReceber)}` : ""}
          </p>
          <Cartao className="divide-y divide-borda p-0">
            {lista.map((v) => (
              <ItemLista
                key={v.id}
                href={`/vendas/${v.id}`}
                titulo={
                  <span className={v.situacao === "cancelada" ? "line-through decoration-1" : undefined}>
                    nº {v.numero} · {formatarDataHora(v.data_hora)}
                  </span>
                }
                apoio={`${v.itens_resumo ?? ""}${v.cliente ? ` · ${v.cliente}` : ""}`}
                direita={
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatarReais(v.total)}</span>
                    {seloDa(v)}
                  </span>
                }
              />
            ))}
          </Cartao>
        </>
      )}
    </>
  );
}
