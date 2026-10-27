import Link from "next/link";
import { Aviso, EstadoVazio, LinkBotao, TituloPagina } from "@/componentes/ui";
import { NovaVenda, type VendaInicial } from "@/componentes/nova-venda";
import { hojeIso } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarFormasPagamento } from "@/servicos/formas-pagamento";
import { listarProdutosVenda, obterVenda, ultimaForma } from "@/servicos/vendas";
import { registrarVenda } from "../acoes";

const UUID = /^[0-9a-f-]{36}$/i;

// Nova venda. ?ok=<nº>&id=<id>: a anterior foi registrada (confirmação no topo e
// formulário zerado para a próxima). ?copiar=<id>: preenchida com outra venda
// (corrigir = cancelar e lançar de novo, D11).
export default async function Pagina({ searchParams }: PageProps<"/vendas/nova">) {
  const perfil = await exigirParticipante();
  const { ok, id, copiar } = await searchParams;
  const [produtos, formas, padrao, base] = await Promise.all([
    listarProdutosVenda(),
    listarFormasPagamento(),
    ultimaForma(perfil.id),
    typeof copiar === "string" && UUID.test(copiar) ? obterVenda(copiar) : null,
  ]);
  const ativas = formas.filter((f) => f.ativa);
  const inicial: VendaInicial | undefined = base
    ? {
        itens: base.itens.map((i) => ({ id: i.variacao_id, quantidade: Number(i.quantidade) })),
        forma: base.venda.forma_pagamento_id ?? undefined,
        cliente: base.venda.cliente ?? undefined,
        observacao: base.venda.observacao ?? undefined,
      }
    : undefined;

  return (
    <>
      <TituloPagina>Nova venda</TituloPagina>
      {typeof ok === "string" && typeof id === "string" ? (
        <div className="mb-4 flex flex-col gap-2">
          <Aviso tipo="sucesso">Venda nº {ok} registrada.</Aviso>
          <div className="flex flex-wrap gap-x-4">
            <Link href={`/vendas/${id}`} className="inline-flex min-h-toque items-center text-sm font-medium text-acao">
              Ver a venda nº {ok}
            </Link>
            <Link href={`/vendas/nova?copiar=${id}`} className="inline-flex min-h-toque items-center text-sm font-medium text-acao">
              Repetir esta venda
            </Link>
          </div>
        </div>
      ) : null}
      {base ? (
        <div className="mb-4">
          <Aviso tipo="sucesso">Preenchida igual à venda nº {base.venda.numero}. Confira e confirme.</Aviso>
        </div>
      ) : null}
      {produtos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum produto ativo"
          acao={ehAdmin(perfil) ? <LinkBotao href="/mais/produtos" variante="secundario">Cadastrar produtos</LinkBotao> : undefined}
        >
          {ehAdmin(perfil) ? "Cadastre os produtos e os preços para começar a vender." : "Peça ao administrador para cadastrar os produtos."}
        </EstadoVazio>
      ) : ativas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma forma de pagamento ativa">O administrador ativa em Mais → Formas de pagamento.</EstadoVazio>
      ) : (
        <NovaVenda
          key={typeof ok === "string" ? ok : "nova"}
          acao={registrarVenda}
          hoje={hojeIso()}
          formaPadrao={padrao && ativas.some((f) => f.id === padrao) ? padrao : null}
          formas={ativas.map((f) => ({ id: f.id, nome: f.nome, taxa: Number(f.taxa_percentual) }))}
          produtos={produtos.map((p) => ({
            id: p.variacao_id ?? "",
            nome: p.nome ?? "",
            preco: Number(p.preco_venda),
            estoque: Number(p.estoque),
            kit: p.tipo === "kit",
            busca: [p.nome, ...(p.apelidos ?? []), p.categoria ?? ""].join(" ").toLocaleLowerCase("pt-BR"),
          }))}
          inicial={inicial}
        />
      )}
    </>
  );
}
