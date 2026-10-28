import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Aviso, Cartao, Campo, EstadoVazio, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarPercentual, formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarCustosVariacoes, type CustoVariacao } from "@/servicos/catalogo";
import { criarProduto } from "../acoes-catalogo";

function aviso(v: CustoVariacao): string | null {
  if (v.kit_sem_componentes) return "Kit sem componentes";
  if (v.sem_receita) return "Falta a receita";
  if (v.sem_preco) return "Falta preço de insumo";
  return null;
}

export default async function Produtos({ searchParams }: PageProps<"/mais/produtos">) {
  const { feito } = await searchParams;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const variacoes = await listarCustosVariacoes();
  const produtos = [...new Map(variacoes.map((v) => [v.produto_id, v])).values()];

  return (
    <>
      <TituloPagina apoio="Preço, custo e quanto sobra em cada venda (sem a taxa de pagamento).">Produtos e sabores</TituloPagina>
      {feito === "excluido" ? (
        <div className="mb-4">
          <Aviso tipo="sucesso">Produto excluído.</Aviso>
        </div>
      ) : null}

      {admin ? (
        <div className="mb-4">
          <ItemEditavel titulo="＋ Cadastrar produto" apoio="Nome, primeiro sabor e preço" aberto={produtos.length === 0}>
            <Formulario acao={criarProduto} textoBotao="Cadastrar e montar a receita" limparAoSalvar>
              <Campo id="nome" name="nome" rotulo="Nome do produto" placeholder="Ex.: Brownie bites" required maxLength={60} />
              <Selecao id="tipo" name="tipo" rotulo="O que é" defaultValue="simples">
                <option value="simples">Produto que eu faço (tem receita)</option>
                <option value="kit">Kit (junta outros produtos, como um combo)</option>
              </Selecao>
              <Campo
                id="sabor"
                name="sabor"
                rotulo="Nome do primeiro sabor (opcional)"
                placeholder="Ex.: Tradicional"
                maxLength={40}
                dica="Deixe em branco se o produto não tem sabores. Os outros sabores você adiciona na tela do produto."
              />
              <Campo id="preco" name="preco" rotulo="Preço de venda (R$)" inputMode="decimal" placeholder="Ex.: 5,00" required />
              <details className="rounded-xl border border-borda">
                <summary className="flex min-h-toque cursor-pointer list-none items-center px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Mais opções: categoria, outros nomes
                </summary>
                <div className="flex flex-col gap-3 border-t border-borda p-3">
                  <Campo id="categoria" name="categoria" rotulo="Categoria (opcional)" placeholder="Ex.: Doces" maxLength={40} />
                  <Campo
                    id="apelidos"
                    name="apelidos"
                    rotulo="Outros nomes (opcional)"
                    placeholder="Ex.: bites, brownie"
                    dica="Separe por vírgula. Ajuda a achar o produto na hora de vender."
                  />
                </div>
              </details>
            </Formulario>
          </ItemEditavel>
        </div>
      ) : null}

      {produtos.length === 0 ? (
        <EstadoVazio titulo="Nenhum produto cadastrado">
          {admin ? "Cadastre o produto; sabores e coberturas viram variações dele." : "O administrador ainda não cadastrou produtos."}
        </EstadoVazio>
      ) : (
        <div className="flex flex-col gap-3">
          {produtos.map((p) => {
            const doProduto = variacoes.filter((v) => v.produto_id === p.produto_id);
            return (
              <Link key={p.produto_id} href={`/mais/produtos/${p.produto_id}`} className="block">
                <Cartao>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.produto}</span>
                    <span className="flex items-center gap-2">
                      {p.tipo === "kit" ? <Selo>Kit</Selo> : null}
                      <ChevronRight aria-hidden className="size-4 text-texto-suave" />
                    </span>
                  </div>
                  <ul className="mt-2 divide-y divide-borda">
                    {doProduto.map((v) => (
                      <li key={v.variacao_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <span className="block">{v.variacao}{!v.ativa ? " (desativada)" : ""}</span>
                          <span className="text-texto-suave">
                            {formatarReais(v.preco_venda)} · custo {formatarReais(v.custo_unitario)}
                          </span>
                        </span>
                        {aviso(v) ? (
                          <Selo tom="alerta">{aviso(v)}</Selo>
                        ) : (
                          <span className="text-right">
                            <span className={`block font-semibold tabular-nums ${(v.mc_unitaria ?? 0) < 0 ? "text-negativo" : ""}`}>
                              Sobra {formatarReais(v.mc_unitaria)}
                            </span>
                            <span className="text-texto-suave tabular-nums">{formatarPercentual((v.mc_percentual ?? 0) * 100)}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Cartao>
              </Link>
            );
          })}
        </div>
      )}

    </>
  );
}
