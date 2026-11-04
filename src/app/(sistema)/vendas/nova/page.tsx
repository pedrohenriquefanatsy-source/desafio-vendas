import Link from "next/link";
import { Aviso, EstadoVazio, LinkBotao, TituloPagina } from "@/componentes/ui";
import { NovaVenda, type VendaInicial } from "@/componentes/nova-venda";
import { hojeIso } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarFormasPagamento } from "@/servicos/formas-pagamento";
import { listarAcertoAberto } from "@/servicos/estoque";
import { formatarQuantidade } from "@/lib/numeros";
import { listarBairros, listarClientes, listarProdutosVenda, obterVenda, ultimaForma } from "@/servicos/vendas";
import { registrarVenda } from "../acoes";

const UUID = /^[0-9a-f-]{36}$/i;

// Nova venda. ?ok=<nº>&id=<id>: a anterior foi registrada (confirmação no topo e
// formulário zerado para a próxima). ?copiar=<id>: preenchida com outra venda
// (corrigir = cancelar e lançar de novo, D11).
export default async function Pagina({ searchParams }: PageProps<"/vendas/nova">) {
  const perfil = await exigirParticipante();
  const { ok, id, copiar, acerto } = await searchParams;
  // ?acerto=1: vendas do acerto em andamento, limitadas ao que a pessoa vendeu e ainda não registrou.
  const noAcerto = acerto === "1";
  const acertoAberto = noAcerto ? await listarAcertoAberto(perfil.id) : [];
  const limites = Object.fromEntries(acertoAberto.filter((a) => Number(a.cota) > 0).map((a) => [a.variacao_id ?? "", Number(a.cota)]));
  const faltam = Object.values(limites).reduce((t, n) => t + n, 0);
  const [produtos, formas, padrao, clientes, bairros, base] = await Promise.all([
    listarProdutosVenda(),
    listarFormasPagamento(),
    ultimaForma(perfil.id),
    listarClientes(),
    listarBairros(),
    typeof copiar === "string" && UUID.test(copiar) ? obterVenda(copiar) : null,
  ]);
  const ativas = formas.filter((f) => f.ativa);
  const inicial: VendaInicial | undefined = base
    ? {
        itens: base.itens.map((i) => ({ id: i.variacao_id, quantidade: Number(i.quantidade) })),
        forma: base.venda.forma_pagamento_id ?? undefined,
        cliente: base.venda.cliente ?? undefined,
        bairro: base.venda.bairro ?? undefined,
        desconhecido: base.venda.cliente_desconhecido ?? undefined,
        observacao: base.venda.observacao ?? undefined,
      }
    : undefined;

  return (
    <>
      <TituloPagina apoio={noAcerto ? "Registre cada venda que você fez na rua, com cliente, preço e forma de pagamento. Só dá para lançar o que você vendeu e ainda não registrou." : undefined}>
        {noAcerto ? "Vendas do acerto" : "Nova venda"}
      </TituloPagina>
      {noAcerto ? (
        <div className="mb-4 flex flex-col gap-2">
          <p className="rounded-xl bg-fundo px-3 py-2 text-sm">
            {faltam > 0 ? (
              <>
                Faltam registrar <span className="font-semibold">{formatarQuantidade(faltam)} {faltam === 1 ? "potinho" : "potinhos"}</span>.
              </>
            ) : (
              "Tudo registrado. Feche o acerto para terminar."
            )}
          </p>
          <Link href="/estoque/pessoas?aba=acerto" className="inline-flex min-h-toque items-center text-sm font-medium text-acao">
            ← Voltar ao acerto{faltam === 0 ? " e fechar" : ""}
          </Link>
        </div>
      ) : null}
      {typeof ok === "string" && typeof id === "string" ? (
        <div className="mb-4 flex flex-col gap-2">
          <Aviso tipo="sucesso">Venda nº {ok} registrada.</Aviso>
          <div className="flex flex-wrap gap-x-4">
            <Link href={`/vendas/${id}`} className="inline-flex min-h-toque items-center text-sm font-medium text-acao">
              Ver a venda nº {ok}
            </Link>
            <Link href={`/vendas/nova?copiar=${id}${noAcerto ? "&acerto=1" : ""}`} className="inline-flex min-h-toque items-center text-sm font-medium text-acao">
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
      {noAcerto && acertoAberto.length === 0 ? (
        <EstadoVazio titulo="Nenhum acerto em andamento" acao={<LinkBotao href="/estoque/pessoas?aba=acerto" variante="secundario">Ir para o acerto</LinkBotao>}>
          Conte o que sobrou na aba Acerto para começar.
        </EstadoVazio>
      ) : noAcerto && faltam === 0 ? (
        <EstadoVazio titulo="Nada mais para registrar" acao={<LinkBotao href="/estoque/pessoas?aba=acerto">Fechar o acerto</LinkBotao>}>
          Você já registrou tudo o que vendeu.
        </EstadoVazio>
      ) : produtos.length === 0 ? (
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
          limites={noAcerto ? limites : undefined}
          produtos={produtos.filter((p) => !noAcerto || (limites[p.variacao_id ?? ""] ?? 0) > 0).map((p) => ({
            id: p.variacao_id ?? "",
            nome: p.nome ?? "",
            preco: Number(p.preco_venda),
            estoque: Number(p.estoque),
            kit: p.tipo === "kit",
            ...(p.tipo === "kit" ? { grupo: p.produto_id ?? undefined, grupoNome: p.produto ?? undefined, opcao: p.variacao ?? undefined } : {}),
            busca: [p.nome, ...(p.apelidos ?? []), p.categoria ?? ""].join(" ").toLocaleLowerCase("pt-BR"),
          }))}
          inicial={inicial}
          clientes={clientes.map((c) => ({ nome: c.cliente ?? "", bairro: c.bairro }))}
          bairros={bairros.map((b) => b.bairro ?? "").filter(Boolean)}
        />
      )}
    </>
  );
}
