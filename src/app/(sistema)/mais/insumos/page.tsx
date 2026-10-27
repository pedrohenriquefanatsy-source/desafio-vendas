import { Cartao, Campo, EstadoVazio, ItemLista, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarCustoUnidade, formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarInsumos, NOMES_TIPO_INSUMO, UNIDADES_BASE, type TipoInsumo } from "@/servicos/catalogo";
import { criarInsumo } from "../acoes-catalogo";

export default async function Insumos() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const insumos = await listarInsumos();
  const semPreco = insumos.filter((i) => i.ativo && i.custo_atual == null).length;
  const grupos = (Object.keys(NOMES_TIPO_INSUMO) as TipoInsumo[])
    .map((tipo) => ({ tipo, itens: insumos.filter((i) => i.tipo === tipo) }))
    .filter((g) => g.itens.length);

  return (
    <>
      <TituloPagina apoio={semPreco ? `${semPreco} sem preço: o custo dos produtos que usam esses insumos fica em branco.` : "Tudo o que entra nas receitas e embalagens."}>
        Insumos
      </TituloPagina>

      {insumos.length === 0 ? (
        <EstadoVazio titulo="Nenhum insumo cadastrado">
          {admin ? "Cadastre farinha, açúcar, embalagens… com o preço que você paga." : "O administrador ainda não cadastrou insumos."}
        </EstadoVazio>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <section key={g.tipo}>
              <h2 className="mb-2 text-sm font-medium text-texto-suave">{NOMES_TIPO_INSUMO[g.tipo]}s</h2>
              <Cartao className="divide-y divide-borda p-0">
                {g.itens.map((i) => (
                  <ItemLista
                    key={i.id}
                    href={`/mais/insumos/${i.id}`}
                    titulo={i.nome}
                    apoio={
                      i.custo_atual == null
                        ? "Sem preço"
                        : `${formatarReais(i.preco_referencia)} por ${i.unidade_referencia} · ${formatarCustoUnidade(i.custo_atual, i.unidade_base)}`
                    }
                    direita={!i.ativo ? <Selo>Desativado</Selo> : i.custo_atual == null ? <Selo tom="alerta">Sem preço</Selo> : null}
                  />
                ))}
              </Cartao>
            </section>
          ))}
        </div>
      )}

      {admin ? (
        <Cartao className="mt-6">
          <h2 className="mb-3 font-semibold">Cadastrar insumo</h2>
          <Formulario acao={criarInsumo} textoBotao="Cadastrar e definir o preço">
            <Campo id="nome" name="nome" rotulo="Nome" placeholder="Ex.: Leite condensado" required maxLength={60} />
            <Selecao id="tipo" name="tipo" rotulo="Tipo" defaultValue="ingrediente">
              {Object.entries(NOMES_TIPO_INSUMO).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </Selecao>
            <Selecao id="unidade_base" name="unidade_base" rotulo="Como é medido nas receitas" defaultValue="g">
              {UNIDADES_BASE.map((u) => (
                <option key={u.codigo} value={u.codigo}>
                  {u.nome} — {u.dica}
                </option>
              ))}
            </Selecao>
            <p className="text-xs text-texto-suave">
              Não muda depois. Caixas, pacotes e bandejas você cadastra na próxima tela, dizendo quanto cabe em cada uma.
            </p>
          </Formulario>
        </Cartao>
      ) : null}
    </>
  );
}
