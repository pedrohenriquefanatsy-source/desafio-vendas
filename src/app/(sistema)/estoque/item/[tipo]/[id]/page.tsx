import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Cartao, Selecao, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarReais, formatarSaldo } from "@/lib/numeros";
import { formatarDataHora } from "@/lib/datas";
import { exigirParticipante } from "@/servicos/sessao";
import { unidadesPorInsumo } from "@/servicos/catalogo";
import { NOMES_MOVIMENTO, obterItemEstoque } from "@/servicos/estoque";
import { ajustarEstoque, registrarPerda } from "../../../acoes";

export default async function ItemEstoque({ params }: PageProps<"/estoque/item/[tipo]/[id]">) {
  await exigirParticipante();
  const { tipo, id } = await params;
  if ((tipo !== "insumo" && tipo !== "variacao") || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dados = await obterItemEstoque(tipo, id);
  if (!dados) notFound();
  const { item, movimentos } = dados;
  const insumo = "insumo_id" in item;
  const nome = insumo ? item.nome : item.variacao === "Única" ? item.produto : `${item.produto} · ${item.variacao}`;
  const unidade = insumo ? (item.unidade_base ?? "") : "und";
  const unidades = insumo ? ((await unidadesPorInsumo())[id] ?? []) : [];
  const valorItem = `${tipo}:${id}`;

  return (
    <>
      <Link href={insumo ? "/estoque?aba=insumos" : "/estoque"} className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Estoque
      </Link>
      <TituloPagina apoio={insumo ? "Insumo" : "Produto pronto"}>{nome}</TituloPagina>

      <Cartao className="mb-4">
        <dl className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-sm text-texto-suave">Em estoque</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatarSaldo(item.saldo, unidade)}</dd>
          </div>
          <div>
            <dt className="text-sm text-texto-suave">Vale (custo atual)</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatarReais(item.valor_estoque)}</dd>
          </div>
        </dl>
      </Cartao>

      <div className="flex flex-col gap-4">
        <Cartao>
          <h2 className="font-semibold">Corrigir a contagem</h2>
          <p className="mb-3 text-sm text-texto-suave">
            Conte o que tem de verdade e informe o total. O sistema lança a diferença, com o motivo. Não entra no faturamento.
          </p>
          <Formulario acao={ajustarEstoque} textoBotao="Salvar contagem" limparAoSalvar>
            <input type="hidden" name="item" value={valorItem} />
            <Campo id="contado" name="contado" rotulo={`Quanto tem agora (em ${unidade})`} inputMode="decimal" required />
            <Campo id="justificativa" name="justificativa" rotulo="Motivo" placeholder="Ex.: contagem do fim do dia" required maxLength={200} />
          </Formulario>
        </Cartao>

        <Cartao>
          <h2 className="font-semibold">Registrar perda</h2>
          <p className="mb-3 text-sm text-texto-suave">Estragou, caiu, venceu. Sai do estoque e o custo entra no lucro estimado.</p>
          <Formulario acao={registrarPerda} textoBotao="Registrar perda" limparAoSalvar>
            <input type="hidden" name="item" value={valorItem} />
            <div className="grid grid-cols-2 gap-3">
              <Campo id="quantidade" name="quantidade" rotulo="Quanto" inputMode="decimal" required />
              {insumo ? (
                <Selecao id="unidade" name="unidade" rotulo="Unidade" defaultValue={unidade}>
                  {unidades.map((u) => (
                    <option key={u.unidade} value={u.unidade ?? ""}>
                      {u.unidade}
                    </option>
                  ))}
                </Selecao>
              ) : (
                <div className="flex flex-col justify-end pb-3 text-sm text-texto-suave">unidades</div>
              )}
            </div>
            <Campo id="motivo" name="motivo" rotulo="O que aconteceu" placeholder="Ex.: caiu no chão" required maxLength={200} />
          </Formulario>
        </Cartao>

        <section>
          <h2 className="mb-2 font-semibold">Movimentações</h2>
          {movimentos.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhuma movimentação ainda.</p>
          ) : (
            <Cartao className="divide-y divide-borda p-0">
              {movimentos.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block font-medium">{NOMES_MOVIMENTO[m.tipo]}</span>
                    <span className="block text-sm text-texto-suave">
                      {formatarDataHora(m.criado_em)}
                      {m.justificativa ? ` · ${m.justificativa}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap font-semibold tabular-nums ${Number(m.quantidade_base) < 0 ? "text-negativo" : "text-positivo"}`}>
                    {Number(m.quantidade_base) > 0 ? "+" : ""}
                    {formatarSaldo(m.quantidade_base, unidade)}
                  </span>
                </div>
              ))}
            </Cartao>
          )}
        </section>
      </div>
    </>
  );
}
