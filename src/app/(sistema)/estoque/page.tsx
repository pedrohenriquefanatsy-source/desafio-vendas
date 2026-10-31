import { Abas, Aviso, Campo, Cartao, EstadoVazio, ItemLista, LinkBotao, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarQuantidade, formatarReais, formatarSaldo } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { exigirParticipante } from "@/servicos/sessao";
import { listarCustosVariacoes, NOMES_TIPO_INSUMO, type TipoInsumo } from "@/servicos/catalogo";
import {
  listarEstoqueInsumos,
  listarEstoqueProdutos,
  listarListaCompras,
  listarProducaoPossivel,
  listarProducoes,
  listarRendimentos,
} from "@/servicos/estoque";
import { listarCobertura } from "@/servicos/painel";
import { cancelarProducao, concluirProducao, corrigirProducao, registrarProducao } from "./acoes";

type Aba = "produtos" | "insumos" | "producao";

const nomeVariacao = (produto: string | null, variacao: string | null) =>
  !variacao || variacao === "Única" ? (produto ?? "") : `${produto} · ${variacao}`;

export default async function Estoque({ searchParams }: PageProps<"/estoque">) {
  await exigirParticipante();
  const { aba: abaPedida, feito, aviso, n } = await searchParams;
  const aba: Aba = abaPedida === "insumos" || abaPedida === "producao" ? abaPedida : "produtos";
  const { planejadas, concluidas } = await listarProducoes();

  return (
    <>
      <TituloPagina apoio="O saldo vem das movimentações: compras, produção, vendas, perdas e ajustes.">Estoque</TituloPagina>
      <Abas
        atual={aba}
        abas={[
          { valor: "produtos", rotulo: "Prontos", href: "/estoque" },
          { valor: "insumos", rotulo: "Insumos", href: "/estoque?aba=insumos" },
          { valor: "producao", rotulo: "Produção", href: "/estoque?aba=producao", contagem: planejadas.length },
        ]}
      />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <LinkBotao href="/estoque/contagem" variante="secundario">
          Contagem do dia
        </LinkBotao>
        <LinkBotao href="/estoque/simular" variante="secundario">
          Simular produção
        </LinkBotao>
        <LinkBotao href="/estoque/pessoas" variante="secundario" className="col-span-2">
          Estoque de cada pessoa
        </LinkBotao>
      </div>
      {feito === "concluida" || feito === "registrada" || feito === "cancelada" || feito === "contagem" ? (
        <div className="mb-4 flex flex-col gap-2">
          <Aviso tipo="sucesso">
            {feito === "contagem"
              ? `Contagem registrada: ${typeof n === "string" && Number(n) > 0 ? `${n} ${Number(n) === 1 ? "item ajustado" : "itens ajustados"}` : "nada mudou, os saldos já estavam certos"}.`
              : feito === "cancelada"
                ? "Produção planejada cancelada. O estoque não mudou."
                : "Produção registrada: os insumos e as embalagens saíram do estoque e os potinhos prontos entraram."}
          </Aviso>
          {typeof aviso === "string" && aviso ? (
            <Aviso tipo="erro">Atenção, o estoque não tinha tudo: {aviso}. Confira os saldos na Contagem do dia.</Aviso>
          ) : null}
        </div>
      ) : null}
      {aba === "produtos" ? <AbaProdutos /> : aba === "insumos" ? <AbaInsumos /> : <AbaProducao planejadas={planejadas} concluidas={concluidas} />}
    </>
  );
}

async function AbaProdutos() {
  const [produtos, possivel, cobertura] = await Promise.all([listarEstoqueProdutos(), listarProducaoPossivel(), listarCobertura()]);
  const coberturaDe = new Map(cobertura.map((c) => [c.variacao_id, c]));
  if (produtos.length === 0) {
    return (
      <EstadoVazio titulo="Nenhum produto cadastrado" acao={<LinkBotao href="/mais/produtos" variante="secundario">Ir para Produtos</LinkBotao>}>
        Cadastre os produtos e as receitas para produzir e vender.
      </EstadoVazio>
    );
  }
  const porVariacao = new Map(possivel.map((p) => [p.variacao_id, p]));
  return (
    <>
      <Cartao className="divide-y divide-borda p-0">
        {produtos.map((p) => {
          const pode = porVariacao.get(p.variacao_id);
          return (
            <ItemLista
              key={p.variacao_id}
              href={`/estoque/item/variacao/${p.variacao_id}`}
              titulo={nomeVariacao(p.produto, p.variacao)}
              apoio={
                (Number(p.com_pessoas) > 0 ? `${formatarQuantidade(p.com_pessoas)} com as pessoas · ` : "") +
                (!pode
                  ? "Sem receita: não dá para calcular a produção"
                  : Number(pode.fornadas_possiveis) > 0
                    ? `Insumos para mais ${formatarQuantidade(pode.fornadas_possiveis)} fornada(s) (${formatarQuantidade(pode.unidades_possiveis)} un.) · limita: ${pode.insumo_limitante}`
                    : `Sem insumo para outra fornada · falta: ${pode.insumo_limitante}`)
              }
              direita={
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`font-semibold tabular-nums ${Number(p.no_estoque) <= 0 ? "text-texto-suave" : ""}`}>{formatarSaldo(p.no_estoque, "und")}</span>
                  {coberturaDe.get(p.variacao_id)?.dias_cobertura != null ? (
                    <span className="text-xs text-texto-suave">
                      ~{formatarQuantidade(coberturaDe.get(p.variacao_id)?.dias_cobertura)} dias
                      {coberturaDe.get(p.variacao_id)?.fonte === "estimativa" ? " (estimativa)" : ""}
                    </span>
                  ) : null}
                </span>
              }
            />
          );
        })}
      </Cartao>
      <p className="mt-3 text-xs text-texto-suave">
        O número grande é o que está no estoque geral; o que está com as pessoas aparece embaixo do nome.
        “~N dias” é para quantos dias o estoque dá: pela média de venda por dia (com 2 dias ou mais de venda) ou pela demanda
        estimada no desafio (rotulada “estimativa”). Toque num produto para corrigir a contagem ou registrar uma perda.
      </p>
    </>
  );
}

async function AbaInsumos() {
  const [insumos, compras] = await Promise.all([listarEstoqueInsumos(), listarListaCompras()]);
  const grupos = (Object.keys(NOMES_TIPO_INSUMO) as TipoInsumo[])
    .map((tipo) => ({ tipo, itens: insumos.filter((i) => i.tipo === tipo) }))
    .filter((g) => g.itens.length);
  const linkLista = `/compras/nova?${compras.map((c) => `insumo=${c.insumo_id}&quantidade=${Number(c.falta)}`).join("&")}`;
  const totalLista = compras.reduce((t, c) => t + Number(c.custo_estimado ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <LinkBotao href="/compras/nova">Registrar compra</LinkBotao>
        <LinkBotao href="/compras" variante="secundario">Ver compras</LinkBotao>
      </div>

      {compras.length ? (
        <Cartao>
          <h2 className="font-semibold">Lista de compras</h2>
          <p className="mb-2 text-sm text-texto-suave">
            Para as produções planejadas e o estoque mínimo. Custo estimado com o último preço: {formatarReais(totalLista)}.
          </p>
          <ul className="mb-3 divide-y divide-borda text-sm">
            {compras.map((c) => (
              <li key={c.insumo_id} className="flex justify-between gap-3 py-2">
                <span>{c.nome}</span>
                <span className="tabular-nums">
                  {formatarSaldo(c.falta, c.unidade_base)} · {c.custo_estimado == null ? "sem preço" : formatarReais(c.custo_estimado)}
                </span>
              </li>
            ))}
          </ul>
          <LinkBotao href={linkLista} variante="secundario" className="w-full">
            Registrar compra desta lista
          </LinkBotao>
        </Cartao>
      ) : null}

      {insumos.length === 0 ? (
        <EstadoVazio titulo="Nenhum insumo cadastrado">Cadastre os insumos em Mais → Insumos.</EstadoVazio>
      ) : (
        grupos.map((g) => (
          <section key={g.tipo}>
            <h2 className="mb-2 text-sm font-medium text-texto-suave">{NOMES_TIPO_INSUMO[g.tipo]}s</h2>
            <Cartao className="divide-y divide-borda p-0">
              {g.itens.map((i) => (
                <ItemLista
                  key={i.insumo_id}
                  href={`/estoque/item/insumo/${i.insumo_id}`}
                  titulo={i.nome}
                  apoio={i.valor_estoque == null ? "Sem preço" : `Vale ${formatarReais(i.valor_estoque)}`}
                  direita={
                    <span className="flex flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">{formatarSaldo(i.saldo, i.unidade_base)}</span>
                      {i.abaixo_minimo ? <Selo tom="alerta">Abaixo do mínimo</Selo> : null}
                    </span>
                  }
                />
              ))}
            </Cartao>
          </section>
        ))
      )}
    </div>
  );
}

async function AbaProducao({
  planejadas,
  concluidas,
}: Awaited<ReturnType<typeof listarProducoes>>) {
  const [todas, rendimentos] = await Promise.all([listarCustosVariacoes(), listarRendimentos()]);
  const variacoes = todas.filter((v) => v.tipo === "simples" && v.ativa);
  const nomes = new Map(variacoes.map((v) => [v.variacao_id, nomeVariacao(v.produto, v.variacao)]));
  const comReceita = variacoes.filter((v) => v.receita_id);
  const nome = (id: string) => nomes.get(id) ?? "Produto desativado";

  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <h2 className="mb-1 font-semibold">Registrar produção</h2>
        <p className="mb-3 text-sm text-texto-suave">Diga o sabor e quantos potinhos ficaram prontos. As fornadas o sistema calcula pela receita, e o estoque e o custo se ajustam sozinhos.</p>
        {comReceita.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum produto tem receita ainda. Crie a receita do sabor em Mais → Produtos e sabores.</p>
        ) : (
          <Formulario acao={registrarProducao} textoBotao="Registrar produção" textoEnviando="Registrando…" limparAoSalvar>
            <Selecao id="variacao_id" name="variacao_id" rotulo="Produto" required defaultValue="">
              <option value="">Escolha…</option>
              {comReceita.map((v) => (
                <option key={v.variacao_id} value={v.variacao_id ?? ""}>
                  {nomeVariacao(v.produto, v.variacao)}
                </option>
              ))}
            </Selecao>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="boas" name="boas" rotulo="Potinhos prontos" inputMode="decimal" placeholder="Ex.: 24" required />
              <Campo id="perdidas" name="perdidas" rotulo="Perdidos (opcional)" inputMode="decimal" placeholder="0" />
            </div>
            <p className="text-xs text-texto-suave">
              {comReceita.map((v) => `${nomeVariacao(v.produto, v.variacao)}: ~${formatarQuantidade(rendimentos.get(v.receita_id ?? ""))} por fornada`).join(" · ")}
            </p>
          </Formulario>
        )}
      </Cartao>

      {concluidas.length ? (
        <section>
          <h2 className="mb-2 font-semibold">Produções recentes</h2>
          <div className="flex flex-col gap-2">
            {concluidas.map((p) => (
              <ItemEditavel
                key={p.id}
                titulo={nome(p.variacao_id)}
                apoio={`${formatarQuantidade(p.fornadas)} fornada(s) · ${formatarQuantidade(p.unidades_produzidas)} renderam${
                  Number(p.unidades_perdidas) > 0 ? ` · ${formatarQuantidade(p.unidades_perdidas)} perdidos` : ""
                } · ${formatarDataHora(p.concluida_em)}`}
              >
                <Formulario acao={corrigirProducao} textoBotao="Corrigir quanto rendeu" textoEnviando="Corrigindo…" className="flex flex-col gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <Campo id={`corr-${p.id}`} name="boas" rotulo="Quantos renderam de verdade" inputMode="decimal" defaultValue={String(Number(p.unidades_produzidas)).replace(".", ",")} required />
                  <p className="text-xs text-texto-suave">
                    Ajusta o estoque do produto e das embalagens{p.fornadas_pelo_rendimento ? ", as fornadas e os ingredientes" : ""}.
                  </p>
                </Formulario>
              </ItemEditavel>
            ))}
          </div>
        </section>
      ) : null}

      {planejadas.length ? (
        <section>
          <h2 className="mb-2 font-semibold">Planejadas (antigas)</h2>
          <div className="flex flex-col gap-2">
            {planejadas.map((p) => (
              <ItemEditavel
                key={p.id}
                titulo={nome(p.variacao_id)}
                apoio={`${formatarQuantidade(p.fornadas)} fornada(s) · ${formatarQuantidade(p.unidades_previstas)} previstas${p.data_planejada ? ` · para ${formatarData(p.data_planejada)}` : ""}`}
                direita={<Selo>Planejada</Selo>}
              >
                <Formulario acao={concluirProducao} textoBotao="Registrar produção" textoEnviando="Registrando…" className="flex flex-col gap-3">
                  <input type="hidden" name="id" value={p.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Campo id={`boas-${p.id}`} name="boas" rotulo="Quantos renderam" inputMode="decimal" defaultValue={String(Number(p.unidades_previstas)).replace(".", ",")} required />
                    <Campo id={`perdidas-${p.id}`} name="perdidas" rotulo="Perdidos (opcional)" inputMode="decimal" placeholder="0" />
                  </div>
                </Formulario>
                <div className="mt-4 border-t border-borda pt-4">
                  <Formulario acao={cancelarProducao} textoBotao="Cancelar esta produção" textoEnviando="Cancelando…" variante="perigo">
                    <input type="hidden" name="id" value={p.id} />
                    <Campo id={`motivo-${p.id}`} name="motivo" rotulo="Motivo (opcional)" maxLength={200} />
                  </Formulario>
                </div>
              </ItemEditavel>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
