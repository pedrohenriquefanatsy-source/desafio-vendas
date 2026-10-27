import { notFound } from "next/navigation";
import { Aviso, Cartao, Campo, Interruptor, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CampoInsumoUnidade } from "@/componentes/campo-insumo-unidade";
import { formatarPercentual, formatarQuantidade, formatarReais } from "@/lib/numeros";
import { opcoesInsumo } from "@/lib/opcoes-insumo";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarCustosVariacoes, listarInsumos, listarReceitas, obterProduto, unidadesPorInsumo, type CustoVariacao } from "@/servicos/catalogo";
import {
  adicionarComponente,
  adicionarEmbalagem,
  alterarProduto,
  alterarVariacao,
  criarVariacao,
  removerComponente,
  removerEmbalagem,
} from "../../acoes-catalogo";

function Numeros({ v }: { v: CustoVariacao }) {
  if (v.kit_sem_componentes) return <Aviso tipo="erro">Adicione os produtos que formam o kit para ver o custo.</Aviso>;
  if (v.sem_receita) return <Aviso tipo="erro">Escolha a receita desta variação para ver o custo.</Aviso>;
  if (v.sem_preco || v.custo_unitario == null) return <Aviso tipo="erro">Falta o preço de algum insumo da receita ou da embalagem.</Aviso>;
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      <div><dt className="text-xs text-texto-suave">Preço</dt><dd className="font-semibold tabular-nums">{formatarReais(v.preco_venda)}</dd></div>
      <div><dt className="text-xs text-texto-suave">Custo</dt><dd className="font-semibold tabular-nums">{formatarReais(v.custo_unitario)}</dd></div>
      <div><dt className="text-xs text-texto-suave">MC</dt><dd className={`font-semibold tabular-nums ${(v.mc_unitaria ?? 0) < 0 ? "text-negativo" : ""}`}>{formatarReais(v.mc_unitaria)}</dd></div>
      <div><dt className="text-xs text-texto-suave">Markup</dt><dd className="font-semibold tabular-nums">{v.markup != null ? formatarQuantidade(Math.round(v.markup * 100) / 100) : "—"}</dd></div>
    </dl>
  );
}

export default async function Produto({ params }: PageProps<"/mais/produtos/[id]">) {
  const { id } = await params;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterProduto(id) : null;
  if (!dados) notFound();
  const { produto, custos, embalagens, componentes, margens } = dados;
  const kit = produto.tipo === "kit";
  const [receitas, insumos, unidades, todas] = admin
    ? await Promise.all([listarReceitas(), listarInsumos(), unidadesPorInsumo(), listarCustosVariacoes()])
    : [[], [], {}, []];
  const opcoesEmbalagem = opcoesInsumo(insumos, unidades, ["embalagem", "outro"]);
  const simples = todas.filter((v) => v.tipo === "simples" && v.ativa);
  const nomeVariacao = new Map(todas.map((v) => [v.variacao_id, `${v.produto}${v.variacao !== "Única" ? ` · ${v.variacao}` : ""}`]));

  return (
    <>
      <TituloPagina apoio={kit ? "Kit: o custo é a soma dos produtos que o formam." : "Cada variação (sabor, cobertura) tem receita, embalagem e preço próprios."}>
        {produto.nome}
      </TituloPagina>

      <div className="flex flex-col gap-3">
        {custos.map((v) => {
          const embs = embalagens.filter((e) => e.variacao_id === v.variacao_id);
          const comps = componentes.filter((c) => c.kit_variacao_id === v.variacao_id);
          const mcs = margens.filter((m) => m.variacao_id === v.variacao_id);
          return (
            <Cartao key={v.variacao_id}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{v.variacao}</h2>
                {!v.ativa ? <Selo>Desativada</Selo> : v.mc_percentual != null ? <Selo tom="positivo">MC {formatarPercentual(v.mc_percentual * 100)}</Selo> : null}
              </div>
              <Numeros v={v} />

              {mcs.length > 1 && v.custo_unitario != null ? (
                <p className="mt-3 text-sm text-texto-suave">
                  MC por forma de pagamento: {mcs.map((m) => `${m.forma_pagamento} ${formatarReais(m.mc_unitaria)}`).join(" · ")}
                </p>
              ) : null}

              {kit ? (
                <div className="mt-4">
                  <h3 className="mb-1 text-sm font-medium">Formado por</h3>
                  {comps.length === 0 ? <p className="text-sm text-texto-suave">Nenhum produto ainda.</p> : null}
                  <ul className="flex flex-col gap-2">
                    {comps.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{formatarQuantidade(c.quantidade)} × {nomeVariacao.get(c.componente_variacao_id) ?? "produto"}</span>
                        {admin ? (
                          <Formulario acao={removerComponente} textoBotao="Tirar" textoEnviando="…" variante="secundario" className="w-24">
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="produto_id" value={produto.id} />
                          </Formulario>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4">
                <h3 className="mb-1 text-sm font-medium">Embalagens por unidade vendida</h3>
                {embs.length === 0 ? <p className="text-sm text-texto-suave">Nenhuma.</p> : null}
                <ul className="flex flex-col gap-2">
                  {embs.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {formatarQuantidade(e.quantidade)} {e.unidade} de {e.insumo} · {e.sem_preco ? "sem preço" : formatarReais(e.custo)}
                      </span>
                      {admin ? (
                        <Formulario acao={removerEmbalagem} textoBotao="Tirar" textoEnviando="…" variante="secundario" className="w-24">
                          <input type="hidden" name="id" value={e.id ?? ""} />
                          <input type="hidden" name="produto_id" value={produto.id} />
                        </Formulario>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              {admin ? (
                <div className="mt-4 flex flex-col gap-2">
                  <ItemEditavel titulo="Alterar variação" apoio={kit ? "Nome, preço" : "Nome, preço, receita"}>
                    <Formulario acao={alterarVariacao} textoBotao="Salvar" className="flex flex-col gap-3">
                      <input type="hidden" name="id" value={v.variacao_id ?? ""} />
                      <input type="hidden" name="produto_id" value={produto.id} />
                      <Campo id={`nome-${v.variacao_id}`} name="nome" rotulo="Nome da variação" defaultValue={v.variacao ?? ""} required maxLength={40} />
                      <Campo
                        id={`preco-${v.variacao_id}`}
                        name="preco"
                        rotulo="Preço de venda (R$)"
                        inputMode="decimal"
                        defaultValue={String(v.preco_venda ?? "").replace(".", ",")}
                        required
                        dica="Vendas já feitas guardam o preço e o custo da hora da venda."
                      />
                      {kit ? null : (
                        <Selecao id={`receita-${v.variacao_id}`} name="receita_id" rotulo="Receita" defaultValue={v.receita_id ?? ""}>
                          <option value="">Sem receita (produto comprado pronto)</option>
                          {receitas.filter((r) => r.ativa || r.receita_id === v.receita_id).map((r) => (
                            <option key={r.receita_id} value={r.receita_id ?? ""}>
                              {r.nome} (rende {formatarQuantidade(r.rendimento_unidades)})
                            </option>
                          ))}
                        </Selecao>
                      )}
                      <Interruptor id={`ativa-${v.variacao_id}`} name="ativa" rotulo="À venda" defaultChecked={Boolean(v.ativa)} />
                    </Formulario>
                  </ItemEditavel>
                  {kit ? (
                    <ItemEditavel titulo="Adicionar produto ao kit">
                      <Formulario acao={adicionarComponente} textoBotao="Adicionar" limparAoSalvar className="flex flex-col gap-3">
                        <input type="hidden" name="variacao_id" value={v.variacao_id ?? ""} />
                        <input type="hidden" name="produto_id" value={produto.id} />
                        <Selecao id={`comp-${v.variacao_id}`} name="componente_id" rotulo="Produto" defaultValue="">
                          <option value="">Escolha…</option>
                          {simples.map((s) => (
                            <option key={s.variacao_id} value={s.variacao_id ?? ""}>
                              {nomeVariacao.get(s.variacao_id)}
                            </option>
                          ))}
                        </Selecao>
                        <Campo id={`comp-qtd-${v.variacao_id}`} name="quantidade" rotulo="Quantos no kit" inputMode="decimal" defaultValue="1" required />
                      </Formulario>
                    </ItemEditavel>
                  ) : null}
                  <ItemEditavel titulo="Adicionar embalagem">
                    {opcoesEmbalagem.length === 0 ? (
                      <p className="text-sm text-texto-suave">Cadastre a embalagem em Insumos, com o tipo “Embalagem”.</p>
                    ) : (
                      <Formulario acao={adicionarEmbalagem} textoBotao="Adicionar" limparAoSalvar>
                        <input type="hidden" name="variacao_id" value={v.variacao_id ?? ""} />
                        <input type="hidden" name="produto_id" value={produto.id} />
                        <CampoInsumoUnidade insumos={opcoesEmbalagem} prefixo={`emb-${v.variacao_id}`} rotuloInsumo="Embalagem" rotuloQuantidade="Por unidade vendida" quantidadeInicial="1" />
                      </Formulario>
                    )}
                  </ItemEditavel>
                </div>
              ) : null}
            </Cartao>
          );
        })}
      </div>

      {admin ? (
        <div className="mt-6 flex flex-col gap-2">
          {kit ? null : (
            <ItemEditavel titulo="Adicionar variação" apoio="Outro sabor ou cobertura, com receita e preço próprios">
              <Formulario acao={criarVariacao} textoBotao="Adicionar variação" limparAoSalvar className="flex flex-col gap-3">
                <input type="hidden" name="produto_id" value={produto.id} />
                <Campo id="var-nome" name="nome" rotulo="Nome" placeholder="Ex.: Nutella" required maxLength={40} />
                <Campo id="var-preco" name="preco" rotulo="Preço de venda (R$)" inputMode="decimal" placeholder="8,00" required />
                <Selecao id="var-receita" name="receita_id" rotulo="Receita" defaultValue="">
                  <option value="">Sem receita (produto comprado pronto)</option>
                  {receitas.filter((r) => r.ativa).map((r) => (
                    <option key={r.receita_id} value={r.receita_id ?? ""}>
                      {r.nome}
                    </option>
                  ))}
                </Selecao>
              </Formulario>
            </ItemEditavel>
          )}
          <ItemEditavel titulo="Dados do produto" apoio="Nome, categoria, outros nomes, à venda">
            <Formulario acao={alterarProduto} textoBotao="Salvar" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={produto.id} />
              <Campo id="prod-nome" name="nome" rotulo="Nome" defaultValue={produto.nome} required maxLength={60} />
              <Campo id="prod-categoria" name="categoria" rotulo="Categoria (opcional)" defaultValue={produto.categoria ?? ""} maxLength={40} />
              <Campo id="prod-apelidos" name="apelidos" rotulo="Outros nomes (opcional)" defaultValue={produto.apelidos.join(", ")} dica="Separe por vírgula." />
              <Interruptor id="prod-ativo" name="ativo" rotulo="À venda" defaultChecked={produto.ativo} />
            </Formulario>
          </ItemEditavel>
        </div>
      ) : null}
    </>
  );
}
