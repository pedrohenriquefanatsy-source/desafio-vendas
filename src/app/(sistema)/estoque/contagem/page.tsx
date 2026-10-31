import { Cartao, EstadoVazio, LinkBotao, TituloPagina, BotaoVoltar } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarData, hojeIso } from "@/lib/datas";
import { formatarQuantidade } from "@/lib/numeros";
import { exigirParticipante } from "@/servicos/sessao";
import { NOMES_TIPO_INSUMO, type TipoInsumo } from "@/servicos/catalogo";
import { listarEstoqueInsumos, listarEstoqueProdutos } from "@/servicos/estoque";
import { registrarContagem } from "../acoes";

// Contagem do dia: no fim do dia, a pessoa conta o que tem e informa. O sistema ajusta a diferença de cada item,
// com o motivo "Contagem do dia", e o estoque volta a bater com a prateleira.
const campo = "min-h-toque w-28 rounded-xl border border-borda bg-superficie px-3 text-right text-base tabular-nums";

export default async function Contagem() {
  await exigirParticipante();
  const [insumos, produtos] = await Promise.all([listarEstoqueInsumos(), listarEstoqueProdutos()]);
  const dia = formatarData(hojeIso()).slice(0, 5);
  const grupos = new Map<string, typeof insumos>();
  for (const i of insumos) {
    const nome = NOMES_TIPO_INSUMO[i.tipo as TipoInsumo] ?? "Outros";
    grupos.set(nome, [...(grupos.get(nome) ?? []), i]);
  }
  // Saldo negativo (faltou registrar uma compra, por exemplo) fica em branco: é para contar de verdade.
  const num = (v: number | string | null) => (Number(v ?? 0) < 0 ? "" : String(Number(v ?? 0)).replace(".", ","));

  return (
    <>
      <BotaoVoltar href="/estoque">Estoque</BotaoVoltar>
      <TituloPagina apoio="Conte o que tem agora e escreva em cada linha. Só muda o que estiver diferente do sistema; deixe em branco o que não contou.">
        Contagem do dia
      </TituloPagina>
      {insumos.length === 0 && produtos.length === 0 ? (
        <EstadoVazio titulo="Nada para contar" acao={<LinkBotao href="/mais/insumos" variante="secundario">Cadastrar insumos</LinkBotao>}>
          Cadastre os insumos e os produtos para contar o estoque.
        </EstadoVazio>
      ) : (
        <Formulario acao={registrarContagem} textoBotao="Salvar contagem" textoEnviando="Salvando…" botaoFixo>
          <input type="hidden" name="dia" value={dia} />
          {[...grupos.entries()].map(([titulo, itens]) => (
            <section key={titulo}>
              <h2 className="mb-2 font-semibold">{titulo}</h2>
              <Cartao className="divide-y divide-borda p-0">
                {itens.map((i) => (
                  <label key={i.insumo_id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="block break-words font-medium">{i.nome}</span>
                      <span className="block text-xs text-texto-suave">
                        no sistema: {formatarQuantidade(i.saldo)} {i.unidade_base}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <input name={`i_${i.insumo_id}`} inputMode="decimal" defaultValue={num(i.saldo)} placeholder="contar" aria-label={`Contagem de ${i.nome}`} className={campo} />
                      <span className="w-8 text-sm text-texto-suave">{i.unidade_base}</span>
                    </span>
                  </label>
                ))}
              </Cartao>
            </section>
          ))}
          {produtos.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Produtos prontos</h2>
              <Cartao className="divide-y divide-borda p-0">
                {produtos.map((p) => {
                  const nome = !p.variacao || p.variacao === "Única" ? p.produto : `${p.produto} · ${p.variacao}`;
                  return (
                    <label key={p.variacao_id} className="flex items-center justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{nome}</span>
                        <span className="block text-xs text-texto-suave">
                          no estoque geral: {formatarQuantidade(p.no_estoque)} und
                          {Number(p.com_pessoas) > 0 ? ` · mais ${formatarQuantidade(p.com_pessoas)} com as pessoas (não conte)` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <input name={`p_${p.variacao_id}`} inputMode="decimal" defaultValue={num(p.no_estoque)} placeholder="contar" aria-label={`Contagem de ${nome}`} className={campo} />
                        <span className="w-8 text-sm text-texto-suave">und</span>
                      </span>
                    </label>
                  );
                })}
              </Cartao>
            </section>
          ) : null}
        </Formulario>
      )}
    </>
  );
}
