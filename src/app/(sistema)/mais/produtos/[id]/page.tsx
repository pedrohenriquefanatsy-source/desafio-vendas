import { notFound } from "next/navigation";
import { Aviso, Campo, Interruptor, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CampoInsumoUnidade } from "@/componentes/campo-insumo-unidade";
import { SecaoExcluir } from "@/componentes/secao-excluir";
import { formatarPercentual, formatarQuantidade, formatarReais } from "@/lib/numeros";
import { opcoesInsumo } from "@/lib/opcoes-insumo";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import {
  listarCustosVariacoes,
  listarInsumos,
  motivoNaoExcluir,
  obterProduto,
  unidadesPorInsumo,
  type CustoVariacao,
} from "@/servicos/catalogo";
import {
  adicionarComponente,
  adicionarEmbalagem,
  alterarProduto,
  alterarVariacao,
  criarVariacao,
  excluirProduto,
  excluirSabor,
  removerComponente,
  removerEmbalagem,
} from "../../acoes-catalogo";
import { ReceitaDoSabor } from "./receita-do-sabor";

function Numeros({ v }: { v: CustoVariacao }) {
  if (v.kit_sem_componentes) return <Aviso tipo="erro">Adicione os produtos que formam o kit para ver o custo.</Aviso>;
  if (v.sem_receita) return <Aviso tipo="erro">Falta criar a receita deste sabor (logo abaixo) para ver o custo.</Aviso>;
  if (v.sem_preco || v.custo_unitario == null) return <Aviso tipo="erro">Falta o preço de algum insumo da receita ou da embalagem. Abra Mais → Insumos e preencha.</Aviso>;
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
      <div><dt className="text-xs text-texto-suave">Preço</dt><dd className="font-semibold tabular-nums">{formatarReais(v.preco_venda)}</dd></div>
      <div><dt className="text-xs text-texto-suave">Custo</dt><dd className="font-semibold tabular-nums">{formatarReais(v.custo_unitario)}</dd></div>
      <div><dt className="text-xs text-texto-suave">Sobra</dt><dd className={`font-semibold tabular-nums ${(v.mc_unitaria ?? 0) < 0 ? "text-negativo" : ""}`}>{formatarReais(v.mc_unitaria)}</dd></div>
      <div><dt className="text-xs text-texto-suave">Markup</dt><dd className="font-semibold tabular-nums">{v.markup != null ? formatarQuantidade(Math.round(v.markup * 100) / 100) : "—"}</dd></div>
    </dl>
  );
}

export default async function Produto({ params, searchParams }: PageProps<"/mais/produtos/[id]">) {
  const { id } = await params;
  const { feito } = await searchParams;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterProduto(id) : null;
  if (!dados) notFound();
  const { produto, custos, embalagens, componentes, margens, receitas, itensReceita, custosReceita, usoReceita } = dados;
  const kit = produto.tipo === "kit";
  const [insumos, unidades, todas] = admin ? await Promise.all([listarInsumos(), unidadesPorInsumo(), listarCustosVariacoes()]) : [[], {}, []];
  const opcoesIngrediente = opcoesInsumo(insumos, unidades);
  const opcoesEmbalagem = opcoesInsumo(insumos, unidades, ["embalagem", "outro"]);
  const simples = todas.filter((v) => v.tipo === "simples" && v.ativa);
  const nomeVariacao = new Map(todas.map((v) => [v.variacao_id, `${v.produto}${v.variacao !== "Única" ? ` · ${v.variacao}` : ""}`]));
  const comReceita = todas.filter((v) => v.tipo === "simples" && v.receita_id);
  const motivosSabor = admin
    ? new Map(await Promise.all(custos.map(async (v) => [v.variacao_id, await motivoNaoExcluir("variacao", v.variacao_id ?? "")] as const)))
    : new Map<string | null, string | null>();
  const motivoProduto = admin ? await motivoNaoExcluir("produto", produto.id) : null;
  const unico = custos.length === 1;

  return (
    <>
      <TituloPagina apoio={kit ? "Kit: o custo é a soma dos produtos que o formam." : "Cada sabor tem receita, embalagem e preço próprios."}>
        {produto.nome}
      </TituloPagina>
      {feito === "sabor-excluido" ? (
        <div className="mb-4">
          <Aviso tipo="sucesso">Sabor excluído.</Aviso>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {custos.map((v, n) => {
          const embs = embalagens.filter((e) => e.variacao_id === v.variacao_id);
          const comps = componentes.filter((c) => c.kit_variacao_id === v.variacao_id);
          const mcs = margens.filter((m) => m.variacao_id === v.variacao_id);
          const receita = receitas.find((r) => r.id === v.receita_id);
          const compartilhada = usoReceita
            .filter((u) => u.receita_id === v.receita_id && u.variacao_id !== v.variacao_id)
            .map((u) => `${u.produto}${u.variacao !== "Única" ? ` · ${u.variacao}` : ""}`);
          const origens = comReceita.filter((o) => o.variacao_id !== v.variacao_id).map((o) => ({ id: o.variacao_id ?? "", nome: nomeVariacao.get(o.variacao_id) ?? "" }));
          const titulo = unico && v.variacao === "Única" ? "Receita, embalagem e preço" : v.variacao;
          return (
            <ItemEditavel
              key={v.variacao_id}
              titulo={<span className="text-base">{titulo}</span>}
              apoio={
                v.custo_unitario != null
                  ? `${formatarReais(v.preco_venda)} · custo ${formatarReais(v.custo_unitario)}`
                  : `${formatarReais(v.preco_venda)} · sem custo ainda`
              }
              direita={
                !v.ativa ? <Selo>Desativado</Selo> : v.mc_percentual != null ? <Selo tom="positivo">Sobra {formatarPercentual(v.mc_percentual * 100)}</Selo> : <Selo tom="alerta">Incompleto</Selo>
              }
              aberto={n === 0}
            >
              <Numeros v={v} />

              {mcs.length > 1 && v.custo_unitario != null ? (
                <p className="mt-3 text-sm text-texto-suave">
                  Sobra por forma de pagamento: {mcs.map((m) => `${m.forma_pagamento} ${formatarReais(m.mc_unitaria)}`).join(" · ")}
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
              ) : (
                <ReceitaDoSabor
                  sabor={v}
                  produtoId={produto.id}
                  receita={receita}
                  itens={itensReceita.filter((i) => i.receita_id === v.receita_id)}
                  custo={custosReceita.find((c) => c.receita_id === v.receita_id)}
                  opcoes={opcoesIngrediente}
                  unidades={unidades}
                  origens={origens}
                  compartilhada={compartilhada}
                />
              )}

              <div className="mt-4">
                <h3 className="mb-1 text-sm font-medium">Embalagem de cada unidade vendida</h3>
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
                  {kit ? (
                    <ItemEditavel titulo="＋ Adicionar produto ao kit">
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
                  <ItemEditavel titulo="＋ Adicionar embalagem">
                    {opcoesEmbalagem.length === 0 ? (
                      <p className="text-sm text-texto-suave">Cadastre a embalagem em Mais → Insumos, com o tipo “Embalagem”.</p>
                    ) : (
                      <Formulario acao={adicionarEmbalagem} textoBotao="Adicionar" limparAoSalvar>
                        <input type="hidden" name="variacao_id" value={v.variacao_id ?? ""} />
                        <input type="hidden" name="produto_id" value={produto.id} />
                        <CampoInsumoUnidade insumos={opcoesEmbalagem} prefixo={`emb-${v.variacao_id}`} rotuloInsumo="Embalagem" rotuloQuantidade="Por unidade vendida" quantidadeInicial="1" />
                      </Formulario>
                    )}
                  </ItemEditavel>
                  <ItemEditavel titulo="Nome, preço e se está à venda" apoio={v.ativa ? "À venda" : "Desativado"}>
                    <Formulario acao={alterarVariacao} textoBotao="Salvar" className="flex flex-col gap-3">
                      <input type="hidden" name="id" value={v.variacao_id ?? ""} />
                      <input type="hidden" name="produto_id" value={produto.id} />
                      <Campo id={`nome-${v.variacao_id}`} name="nome" rotulo={kit || unico ? "Nome" : "Nome do sabor"} defaultValue={v.variacao ?? ""} required maxLength={40} />
                      <Campo
                        id={`preco-${v.variacao_id}`}
                        name="preco"
                        rotulo="Preço de venda (R$)"
                        inputMode="decimal"
                        defaultValue={String(v.preco_venda ?? "").replace(".", ",")}
                        required
                        dica="Vendas já feitas guardam o preço e o custo da hora da venda."
                      />
                      <Interruptor id={`ativa-${v.variacao_id}`} name="ativa" rotulo="À venda (desligue para sumir da tela de venda)" defaultChecked={Boolean(v.ativa)} />
                    </Formulario>
                  </ItemEditavel>
                  {unico ? null : (
                    <SecaoExcluir
                      motivo={motivosSabor.get(v.variacao_id) ?? null}
                      titulo="Excluir este sabor"
                      o_que_acontece="O sabor, a receita e a embalagem dele saem do sistema."
                      textoBotao={`Excluir ${v.variacao}`}
                      acao={excluirSabor}
                      campos={{ id: v.variacao_id ?? "", produto_id: produto.id }}
                      alternativa="Para tirar da tela de venda sem perder o histórico, use “Nome, preço e se está à venda” e desligue “À venda”."
                    />
                  )}
                </div>
              ) : null}
            </ItemEditavel>
          );
        })}
      </div>

      {admin ? (
        <div className="mt-6 flex flex-col gap-2">
          {kit ? null : (
            <ItemEditavel titulo="＋ Adicionar sabor" apoio="Outro sabor ou cobertura, com receita e preço próprios">
              <Formulario acao={criarVariacao} textoBotao="Adicionar sabor" limparAoSalvar className="flex flex-col gap-3">
                <input type="hidden" name="produto_id" value={produto.id} />
                <Campo id="var-nome" name="nome" rotulo="Nome do sabor" placeholder="Ex.: Ninho" required maxLength={40} />
                <Campo id="var-preco" name="preco" rotulo="Preço de venda (R$)" inputMode="decimal" placeholder="Ex.: 5,00" required />
                {comReceita.length ? (
                  <Selecao id="var-copiar" name="copiar_de" rotulo="Começar com a receita de" defaultValue="">
                    <option value="">Receita em branco</option>
                    {comReceita.map((o) => (
                      <option key={o.variacao_id} value={o.variacao_id ?? ""}>
                        {nomeVariacao.get(o.variacao_id)}
                      </option>
                    ))}
                  </Selecao>
                ) : null}
                <p className="text-xs text-texto-suave">Copiar a receita é útil quando a massa é a mesma e só o recheio muda: você troca só o que for diferente.</p>
              </Formulario>
            </ItemEditavel>
          )}
          <ItemEditavel titulo="Dados do produto" apoio="Nome, categoria, outros nomes, à venda">
            <Formulario acao={alterarProduto} textoBotao="Salvar" className="flex flex-col gap-3">
              <input type="hidden" name="id" value={produto.id} />
              <Campo id="prod-nome" name="nome" rotulo="Nome" defaultValue={produto.nome} required maxLength={60} />
              <Campo id="prod-categoria" name="categoria" rotulo="Categoria (opcional)" defaultValue={produto.categoria ?? ""} maxLength={40} />
              <Campo id="prod-apelidos" name="apelidos" rotulo="Outros nomes (opcional)" defaultValue={produto.apelidos.join(", ")} dica="Separe por vírgula. Ajuda a achar o produto na hora de vender." />
              <Interruptor id="prod-ativo" name="ativo" rotulo="À venda (desligue para sumir da tela de venda)" defaultChecked={produto.ativo} />
            </Formulario>
          </ItemEditavel>
          <SecaoExcluir
            motivo={motivoProduto}
            titulo="Excluir este produto"
            o_que_acontece="O produto, todos os sabores, receitas e embalagens dele saem do sistema."
            textoBotao={`Excluir ${produto.nome}`}
            acao={excluirProduto}
            campos={{ id: produto.id }}
            alternativa="Para tirar da tela de venda sem perder o histórico, use “Dados do produto” e desligue “À venda”."
          />
        </div>
      ) : null}
    </>
  );
}
