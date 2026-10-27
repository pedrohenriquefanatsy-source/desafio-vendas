import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Cartao, Campo, EstadoVazio, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarPercentual, formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarCustosVariacoes, type CustoVariacao } from "@/servicos/catalogo";
import { criarProduto } from "../acoes-catalogo";

function aviso(v: CustoVariacao): string | null {
  if (v.kit_sem_componentes) return "Kit sem componentes";
  if (v.sem_receita) return "Sem receita";
  if (v.sem_preco) return "Falta preço de insumo";
  return null;
}

export default async function Produtos() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const variacoes = await listarCustosVariacoes();
  const produtos = [...new Map(variacoes.map((v) => [v.produto_id, v])).values()];

  return (
    <>
      <TituloPagina apoio="Preço, custo variável e margem de contribuição (MC) de cada produto, sem taxa de pagamento.">
        Produtos e preços
      </TituloPagina>

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
                              MC {formatarReais(v.mc_unitaria)}
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

      {admin ? (
        <Cartao className="mt-6">
          <h2 className="mb-3 font-semibold">Cadastrar produto</h2>
          <Formulario acao={criarProduto} textoBotao="Cadastrar e configurar">
            <Campo id="nome" name="nome" rotulo="Nome" placeholder="Ex.: Bolo clássico" required maxLength={60} />
            <Selecao id="tipo" name="tipo" rotulo="Tipo" defaultValue="simples">
              <option value="simples">Simples (tem receita própria)</option>
              <option value="kit">Kit (formado por outros produtos, como a casadinha)</option>
            </Selecao>
            <Campo id="preco" name="preco" rotulo="Preço de venda (R$)" inputMode="decimal" placeholder="6,50" required />
            <Campo id="categoria" name="categoria" rotulo="Categoria (opcional)" placeholder="Ex.: Bolos" maxLength={40} />
            <Campo
              id="apelidos"
              name="apelidos"
              rotulo="Outros nomes (opcional)"
              placeholder="Ex.: combinado, combo"
              dica="Separe por vírgula. Ajuda a achar o produto na hora de vender."
            />
          </Formulario>
        </Cartao>
      ) : null}
    </>
  );
}
