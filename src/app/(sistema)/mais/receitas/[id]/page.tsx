import { notFound } from "next/navigation";
import { Aviso, Cartao, Campo, Interruptor, Selecao, TituloPagina, Valor } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CampoInsumoUnidade } from "@/componentes/campo-insumo-unidade";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import { opcoesInsumo } from "@/lib/opcoes-insumo";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarInsumos, obterReceita, unidadesPorInsumo } from "@/servicos/catalogo";
import { adicionarItemReceita, alterarItemReceita, alterarReceita, removerItemReceita } from "../../acoes-catalogo";

export default async function Receita({ params }: PageProps<"/mais/receitas/[id]">) {
  const { id } = await params;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterReceita(id) : null;
  if (!dados) notFound();
  const { receita, custo, itens } = dados;
  const [insumos, unidades] = admin ? await Promise.all([listarInsumos(), unidadesPorInsumo()]) : [[], {}];
  const jaNaReceita = new Set(itens.map((i) => i.insumo_id));
  const opcoes = opcoesInsumo(insumos.filter((i) => !jaNaReceita.has(i.id)), unidades);

  return (
    <>
      <TituloPagina apoio={`Rende ${formatarQuantidade(receita.rendimento_unidades)} unidades`}>{receita.nome}</TituloPagina>

      <Cartao className="mb-3">
        {custo?.custo_receita == null ? (
          itens.length === 0 ? (
            <p className="text-texto-suave">Adicione os insumos para ver o custo.</p>
          ) : (
            <Aviso tipo="erro">Falta o preço de: {custo?.insumos_sem_preco}. Cadastre em Insumos para ver o custo.</Aviso>
          )
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-sm text-texto-suave">Custo da fornada</dt>
              <dd><Valor valor={custo.custo_receita} className="text-xl" /></dd>
            </div>
            <div>
              <dt className="text-sm text-texto-suave">Custo por unidade</dt>
              <dd><Valor valor={custo.custo_por_unidade ?? 0} className="text-xl" /></dd>
            </div>
          </dl>
        )}
      </Cartao>

      <h2 className="mb-2 font-semibold">Insumos</h2>
      <div className="flex flex-col gap-2">
        {itens.map((it) => {
          const resumo = `${formatarQuantidade(it.quantidade)} ${it.unidade}${it.unidade !== it.unidade_base ? ` = ${formatarQuantidade(it.quantidade_base)} ${it.unidade_base}` : ""}`;
          const valor = it.custo == null ? "sem preço" : formatarReais(it.custo);
          return admin ? (
            <ItemEditavel key={it.id} titulo={it.insumo} apoio={resumo} direita={<span className="text-sm tabular-nums">{valor}</span>}>
              <Formulario acao={alterarItemReceita} textoBotao="Salvar" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={it.id ?? ""} />
                <input type="hidden" name="receita_id" value={receita.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Campo
                    id={`qtd-${it.id}`}
                    name="quantidade"
                    rotulo="Quantidade"
                    inputMode="decimal"
                    defaultValue={String(it.quantidade).replace(".", ",")}
                    required
                  />
                  <Selecao id={`un-${it.id}`} name="unidade" rotulo="Unidade" defaultValue={it.unidade ?? ""}>
                    {(unidades[it.insumo_id ?? ""] ?? []).map((u) => (
                      <option key={u.unidade} value={u.unidade ?? ""}>
                        {u.unidade}
                      </option>
                    ))}
                  </Selecao>
                </div>
              </Formulario>
              <div className="mt-3">
                <Formulario acao={removerItemReceita} textoBotao="Tirar da receita" textoEnviando="Removendo…" variante="perigo">
                  <input type="hidden" name="id" value={it.id ?? ""} />
                  <input type="hidden" name="receita_id" value={receita.id} />
                </Formulario>
              </div>
            </ItemEditavel>
          ) : (
            <Cartao key={it.id} className="flex items-center justify-between">
              <span>
                <span className="block font-medium">{it.insumo}</span>
                <span className="text-sm text-texto-suave">{resumo}</span>
              </span>
              <span className="text-sm tabular-nums">{valor}</span>
            </Cartao>
          );
        })}
        {itens.length === 0 ? <p className="text-sm text-texto-suave">Nenhum insumo ainda.</p> : null}
      </div>

      {admin ? (
        <>
          <Cartao className="mt-3">
            <h3 className="mb-3 font-medium">Adicionar insumo</h3>
            {opcoes.length === 0 ? (
              <p className="text-sm text-texto-suave">Todos os insumos ativos já estão na receita. Cadastre outros em Insumos.</p>
            ) : (
              <Formulario acao={adicionarItemReceita} textoBotao="Adicionar" limparAoSalvar>
                <input type="hidden" name="receita_id" value={receita.id} />
                <CampoInsumoUnidade insumos={opcoes} prefixo="novo" />
              </Formulario>
            )}
          </Cartao>
          <div className="mt-6">
            <ItemEditavel titulo="Dados da receita" apoio="Nome, rendimento, observação">
              <Formulario acao={alterarReceita} textoBotao="Salvar" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={receita.id} />
                <Campo id="nome" name="nome" rotulo="Nome" defaultValue={receita.nome} required maxLength={60} />
                <Campo
                  id="rendimento"
                  name="rendimento"
                  rotulo="Rende quantas unidades"
                  inputMode="decimal"
                  defaultValue={String(receita.rendimento_unidades).replace(".", ",")}
                  required
                />
                <Campo id="observacao" name="observacao" rotulo="Observação (opcional)" defaultValue={receita.observacao ?? ""} maxLength={300} />
                <Interruptor id="ativa" name="ativa" rotulo="Em uso" defaultChecked={receita.ativa} />
              </Formulario>
            </ItemEditavel>
          </div>
        </>
      ) : null}
    </>
  );
}
