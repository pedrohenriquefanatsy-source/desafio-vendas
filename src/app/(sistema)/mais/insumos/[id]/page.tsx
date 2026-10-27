import { notFound } from "next/navigation";
import { Cartao, Campo, Interruptor, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarCustoUnidade, formatarQuantidade, formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { NOMES_TIPO_INSUMO, obterInsumo } from "@/servicos/catalogo";
import { alterarConversao, alterarInsumo, criarConversao, definirPreco, removerConversao } from "../../acoes-catalogo";

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });

export default async function Insumo({ params }: PageProps<"/mais/insumos/[id]">) {
  const { id } = await params;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterInsumo(id) : null;
  if (!dados) notFound();
  const { insumo, unidades, conversoes, historico } = dados;
  const base = insumo.unidade_base;

  return (
    <>
      <TituloPagina apoio={`${NOMES_TIPO_INSUMO[insumo.tipo]} · medido em ${base}`}>{insumo.nome}</TituloPagina>

      <Cartao className="mb-3">
        <p className="text-sm text-texto-suave">Preço atual</p>
        {insumo.custo_atual == null ? (
          <p className="mt-1 font-medium text-alerta">Sem preço ainda</p>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold">
              {formatarReais(insumo.preco_referencia)} por {insumo.unidade_referencia}
            </p>
            <p className="text-sm text-texto-suave">= {formatarCustoUnidade(insumo.custo_atual, base)} (usado nos custos)</p>
          </>
        )}
        {admin ? (
          <div className="mt-4 border-t border-borda pt-4">
            <Formulario acao={definirPreco} textoBotao="Salvar preço" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={insumo.id} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id="preco" name="preco" rotulo="Preço pago (R$)" inputMode="decimal" placeholder="7,90" required />
                <Selecao id="unidade-preco" name="unidade" rotulo="Por" defaultValue={insumo.unidade_referencia ?? base}>
                  {unidades.map((u) => (
                    <option key={u.unidade} value={u.unidade ?? ""}>
                      {u.unidade === base ? u.unidade : `${u.unidade} (${formatarQuantidade(u.quantidade_em_base)} ${base})`}
                    </option>
                  ))}
                </Selecao>
              </div>
              <p className="text-xs text-texto-suave">
                Mudar o preço atualiza o custo das receitas e produtos. Vendas já feitas não mudam.
              </p>
            </Formulario>
          </div>
        ) : null}
      </Cartao>

      <section className="mb-3">
        <h2 className="mb-2 font-semibold">Unidades de compra</h2>
        <p className="mb-2 text-sm text-texto-suave">
          {base === "und"
            ? "Para comprar em bandeja, pacote etc., diga quantas unidades vêm em cada uma."
            : `${base === "g" ? "g e kg" : "ml e l"} convertem sozinhos. Para caixa, pacote, lata etc., diga quantos ${base} tem cada uma.`}
        </p>
        <div className="flex flex-col gap-2">
          {conversoes.map((c) =>
            admin ? (
              <ItemEditavel key={c.id} titulo={`1 ${c.unidade} = ${formatarQuantidade(c.quantidade_em_base)} ${base}`}>
                <Formulario acao={alterarConversao} textoBotao="Salvar" className="flex flex-col gap-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="insumo_id" value={insumo.id} />
                  <Campo
                    id={`conv-${c.id}`}
                    name="quantidade"
                    rotulo={`Quantos ${base} tem 1 ${c.unidade}`}
                    inputMode="decimal"
                    defaultValue={String(c.quantidade_em_base).replace(".", ",")}
                    required
                  />
                </Formulario>
                <div className="mt-3">
                  <Formulario acao={removerConversao} textoBotao={`Remover ${c.unidade}`} textoEnviando="Removendo…" variante="perigo">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="insumo_id" value={insumo.id} />
                  </Formulario>
                </div>
              </ItemEditavel>
            ) : (
              <Cartao key={c.id}>
                1 {c.unidade} = {formatarQuantidade(c.quantidade_em_base)} {base}
              </Cartao>
            ),
          )}
        </div>
        {admin ? (
          <Cartao className="mt-2">
            <Formulario acao={criarConversao} textoBotao="Adicionar unidade" limparAoSalvar className="flex flex-col gap-3">
              <input type="hidden" name="insumo_id" value={insumo.id} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id="nova-unidade" name="unidade" rotulo="Unidade" placeholder="cx" required maxLength={20} />
                <Campo id="nova-qtd" name="quantidade" rotulo={`Quantos ${base}`} inputMode="decimal" placeholder={base === "und" ? "30" : "395"} required />
              </div>
            </Formulario>
          </Cartao>
        ) : null}
      </section>

      {admin ? (
        <ItemEditavel titulo="Dados do insumo" apoio="Nome, tipo, fornecedor, validade, estoque mínimo">
          <Formulario acao={alterarInsumo} textoBotao="Salvar" className="flex flex-col gap-3">
            <input type="hidden" name="id" value={insumo.id} />
            <Campo id="nome" name="nome" rotulo="Nome" defaultValue={insumo.nome} required maxLength={60} />
            <Selecao id="tipo" name="tipo" rotulo="Tipo" defaultValue={insumo.tipo}>
              {Object.entries(NOMES_TIPO_INSUMO).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </Selecao>
            <Campo id="fornecedor" name="fornecedor" rotulo="Fornecedor (opcional)" defaultValue={insumo.fornecedor ?? ""} maxLength={80} />
            <Campo id="validade" name="validade" type="date" rotulo="Validade (opcional)" defaultValue={insumo.validade ?? ""} />
            <Campo
              id="estoque_minimo"
              name="estoque_minimo"
              rotulo={`Estoque mínimo em ${base} (opcional)`}
              inputMode="decimal"
              defaultValue={insumo.estoque_minimo != null ? String(insumo.estoque_minimo).replace(".", ",") : ""}
              dica="Abaixo disso, o insumo entra na lista de compras."
            />
            <Interruptor id="ativo" name="ativo" rotulo="Em uso" defaultChecked={insumo.ativo} />
          </Formulario>
        </ItemEditavel>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 font-semibold">Histórico de preço</h2>
        {historico.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum preço registrado ainda.</p>
        ) : (
          <Cartao className="divide-y divide-borda p-0">
            {historico.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {formatarReais(h.preco_referencia)} por {h.unidade_referencia}
                  <span className="block text-texto-suave">{formatarCustoUnidade(h.custo_por_base, base)}</span>
                </span>
                <span className="text-right text-texto-suave">
                  {dataHora.format(new Date(h.registrado_em))}
                  {h.origem !== "manual" ? <Selo>{h.origem}</Selo> : null}
                </span>
              </div>
            ))}
          </Cartao>
        )}
      </section>
    </>
  );
}
