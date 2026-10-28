import { Aviso, Cartao, Campo, EstadoVazio, ItemLista, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { CamposEmbalagem } from "@/componentes/campos-embalagem";
import { formatarCustoUnidade, formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarInsumos, NOMES_TIPO_INSUMO, type Insumo, type TipoInsumo } from "@/servicos/catalogo";
import { criarInsumo } from "../acoes-catalogo";

function Linha({ i }: { i: Insumo }) {
  return (
    <ItemLista
      href={`/mais/insumos/${i.id}`}
      titulo={i.nome}
      apoio={
        i.custo_atual == null
          ? "Sem preço"
          : `${formatarReais(i.preco_referencia)} por ${i.unidade_referencia} · ${formatarCustoUnidade(i.custo_atual, i.unidade_base)}`
      }
      direita={!i.ativo ? <Selo>Desativado</Selo> : i.custo_atual == null ? <Selo tom="alerta">Sem preço</Selo> : null}
    />
  );
}

export default async function Insumos({ searchParams }: PageProps<"/mais/insumos">) {
  const { feito } = await searchParams;
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const todos = await listarInsumos();
  const insumos = todos.filter((i) => i.ativo);
  const desativados = todos.filter((i) => !i.ativo);
  const semPreco = insumos.filter((i) => i.custo_atual == null).length;
  const grupos = (Object.keys(NOMES_TIPO_INSUMO) as TipoInsumo[])
    .map((tipo) => ({ tipo, itens: insumos.filter((i) => i.tipo === tipo) }))
    .filter((g) => g.itens.length);

  return (
    <>
      <TituloPagina apoio={semPreco ? `${semPreco} sem preço: o custo dos produtos que usam esses insumos fica em branco.` : "Tudo o que você compra para produzir: ingredientes e embalagens."}>
        Insumos
      </TituloPagina>
      {feito === "excluido" ? (
        <div className="mb-4">
          <Aviso tipo="sucesso">Insumo excluído.</Aviso>
        </div>
      ) : null}

      {admin ? (
        <div className="mb-4">
          <ItemEditavel titulo="＋ Cadastrar insumo" apoio="Nome, embalagem, preço e quanto você tem" aberto={todos.length === 0}>
            <Formulario acao={criarInsumo} textoBotao="Cadastrar insumo" limparAoSalvar>
              <Campo id="nome" name="nome" rotulo="Nome" placeholder="Ex.: Chocolate em pó" required maxLength={60} />
              <Selecao id="tipo" name="tipo" rotulo="Tipo" defaultValue="ingrediente">
                {Object.entries(NOMES_TIPO_INSUMO).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </Selecao>
              <CamposEmbalagem prefixo="novo" comMedida comEstoque />
              <p className="text-xs text-texto-suave">
                Sem o preço agora? Deixe a embalagem e o preço em branco e preencha depois, na tela do insumo.
              </p>
            </Formulario>
          </ItemEditavel>
        </div>
      ) : null}

      {todos.length === 0 ? (
        <EstadoVazio titulo="Nenhum insumo cadastrado">
          {admin ? "Cadastre o que você compra: chocolate, leite condensado, embalagens… com o preço da embalagem." : "O administrador ainda não cadastrou insumos."}
        </EstadoVazio>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <section key={g.tipo}>
              <h2 className="mb-2 text-sm font-medium text-texto-suave">{NOMES_TIPO_INSUMO[g.tipo]}s</h2>
              <Cartao className="divide-y divide-borda p-0">
                {g.itens.map((i) => (
                  <Linha key={i.id} i={i} />
                ))}
              </Cartao>
            </section>
          ))}
          {desativados.length ? (
            <details className="rounded-cartao border border-borda bg-superficie">
              <summary className="flex min-h-toque cursor-pointer list-none items-center px-4 text-sm font-medium text-texto-suave [&::-webkit-details-marker]:hidden">
                Desativados ({desativados.length})
              </summary>
              <div className="divide-y divide-borda border-t border-borda">
                {desativados.map((i) => (
                  <Linha key={i.id} i={i} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </>
  );
}
