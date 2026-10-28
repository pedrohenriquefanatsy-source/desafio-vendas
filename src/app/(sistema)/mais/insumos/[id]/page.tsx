import Link from "next/link";
import { notFound } from "next/navigation";
import { Cartao, Campo, Interruptor, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CamposEmbalagem } from "@/componentes/campos-embalagem";
import { SecaoExcluir } from "@/componentes/secao-excluir";
import { formatarCustoUnidade, formatarQuantidade, formatarReais, formatarSaldo } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { NOMES_TIPO_INSUMO, motivoNaoExcluir, obterInsumo } from "@/servicos/catalogo";
import { alterarConversao, alterarInsumo, criarConversao, excluirInsumo, removerConversao, salvarEmbalagem } from "../../acoes-catalogo";

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" });

const NOME_MEDIDA = { g: "gramas", ml: "ml", und: "unidades" } as const;

export default async function Insumo({ params }: PageProps<"/mais/insumos/[id]">) {
  const { id } = await params;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterInsumo(id) : null;
  if (!dados) notFound();
  const { insumo, conversoes, historico, saldo } = dados;
  const base = insumo.unidade_base as "g" | "ml" | "und";
  // A "embalagem" é a unidade de compra criada junto com o preço; as outras ficam em "avançado".
  const embalagem = conversoes.find((c) => c.unidade === "embalagem");
  const outras = conversoes.filter((c) => c.unidade !== "embalagem");
  const motivo = admin ? await motivoNaoExcluir("insumo", insumo.id) : null;
  const tamanho = embalagem ? String(embalagem.quantidade_em_base).replace(".", ",") : "";
  const preco = embalagem && insumo.preco_referencia != null && insumo.unidade_referencia === "embalagem" ? String(insumo.preco_referencia).replace(".", ",") : "";

  return (
    <>
      <TituloPagina apoio={`${NOMES_TIPO_INSUMO[insumo.tipo]} · usado em ${NOME_MEDIDA[base]}${insumo.ativo ? "" : " · desativado"}`}>{insumo.nome}</TituloPagina>

      <Cartao className="mb-3">
        <p className="text-sm text-texto-suave">Embalagem e preço</p>
        {insumo.custo_atual == null ? (
          <p className="mt-1 font-medium text-alerta">Sem preço ainda. Sem ele, o custo dos produtos fica em branco.</p>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold">
              {embalagem && insumo.unidade_referencia === "embalagem"
                ? `${formatarReais(insumo.preco_referencia)} por embalagem de ${formatarQuantidade(embalagem.quantidade_em_base)} ${base}`
                : `${formatarReais(insumo.preco_referencia)} por ${insumo.unidade_referencia}`}
            </p>
            <p className="text-sm text-texto-suave">= {formatarCustoUnidade(insumo.custo_atual, base)} (é o que entra no custo)</p>
          </>
        )}
        {admin ? (
          <div className="mt-4 border-t border-borda pt-4">
            <Formulario acao={salvarEmbalagem} textoBotao="Salvar embalagem e preço" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={insumo.id} />
              <CamposEmbalagem prefixo="embalagem" unidade={base} tamanhoInicial={tamanho} precoInicial={preco} />
              <p className="text-xs text-texto-suave">
                Mudar o preço atualiza o custo das receitas e produtos. Vendas já feitas não mudam. Cada compra registrada também atualiza o preço.
              </p>
            </Formulario>
          </div>
        ) : null}
      </Cartao>

      <Cartao className="mb-3 flex items-center justify-between gap-3">
        <span>
          <span className="block text-sm text-texto-suave">Em estoque</span>
          <span className="text-lg font-semibold tabular-nums">{formatarSaldo(saldo, base)}</span>
        </span>
        <Link href={`/estoque/item/insumo/${insumo.id}`} className="inline-flex min-h-toque items-center text-sm font-medium text-acao">
          Corrigir a contagem
        </Link>
      </Cartao>

      {admin ? (
        <div className="flex flex-col gap-2">
          <ItemEditavel titulo="Dados do insumo" apoio="Nome, tipo, fornecedor, validade, estoque mínimo, em uso">
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
              <Interruptor id="ativo" name="ativo" rotulo="Em uso (desligue para tirar das telas, sem apagar o histórico)" defaultChecked={insumo.ativo} />
            </Formulario>
          </ItemEditavel>

          <ItemEditavel titulo="Outras unidades de compra" apoio="Avançado: cx, lata, bandeja… além da embalagem acima">
            <p className="mb-3 text-sm text-texto-suave">
              {base === "und"
                ? "Para comprar em bandeja, pacote etc., diga quantas unidades vêm em cada uma."
                : `${base === "g" ? "g e kg" : "ml e l"} já convertem sozinhos. Para outras unidades (lata, caixa…), diga quantos ${base} tem cada uma.`}
            </p>
            <div className="flex flex-col gap-2">
              {outras.map((c) => (
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
              ))}
            </div>
            <Formulario acao={criarConversao} textoBotao="Adicionar unidade" limparAoSalvar className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="insumo_id" value={insumo.id} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id="nova-unidade" name="unidade" rotulo="Unidade" placeholder="lata" required maxLength={20} />
                <Campo id="nova-qtd" name="quantidade" rotulo={`Quantos ${base}`} inputMode="decimal" placeholder={base === "und" ? "30" : "395"} required />
              </div>
            </Formulario>
          </ItemEditavel>

          <SecaoExcluir
            motivo={motivo}
            titulo="Excluir este insumo"
            o_que_acontece="O insumo e a contagem de estoque dele saem do sistema."
            textoBotao={`Excluir ${insumo.nome}`}
            acao={excluirInsumo}
            campos={{ id: insumo.id }}
            alternativa="Para tirar das telas sem perder o histórico, abra Dados do insumo e desligue “Em uso”."
          />
        </div>
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
