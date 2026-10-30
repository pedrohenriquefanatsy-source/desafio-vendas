import Link from "next/link";
import { Aviso, Campo, Cartao, EstadoVazio, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { listarDevidos, listarGastosDoBolso, listarReembolsos } from "@/servicos/caixa";
import { cancelarReembolso, pagarReembolso } from "../acoes";

// A reembolsar (Seção 4.5): quanto o desafio deve a cada participante e os reembolsos pagos.
export default async function Reembolsos({ searchParams }: PageProps<"/caixa/reembolsos">) {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const { feito } = await searchParams;
  const [devidos, reembolsos, pessoas, gastos] = await Promise.all([listarDevidos(), listarReembolsos(), listarParticipantes(), listarGastosDoBolso()]);
  const nome = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));

  return (
    <>
      <Link href="/caixa" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Caixa
      </Link>
      <TituloPagina apoio="Compras e despesas pagas do próprio bolso. O reembolso sai do caixa e não mexe no lucro de novo.">
        A reembolsar
      </TituloPagina>
      {feito === "pago" ? (
        <div className="mb-3">
          <Aviso tipo="sucesso">Reembolso registrado. Saiu do caixa; o lucro não muda.</Aviso>
        </div>
      ) : null}

      {devidos.length === 0 ? (
        <EstadoVazio titulo="Ninguém pagou nada do próprio bolso">Quando alguém marcar “paguei do meu bolso”, aparece aqui.</EstadoVazio>
      ) : (
        <div className="flex flex-col gap-2">
          {devidos.map((d) => {
            const devido = Number(d.devido ?? 0);
            return (
              <Cartao key={d.participante_id}>
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-medium">{d.participante ?? "Sem nome"}</span>
                    <span className="text-sm text-texto-suave">
                      Pagou {formatarReais(d.pago_do_bolso)} · já recebeu {formatarReais(d.reembolsado)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-xs text-texto-suave">Devido</span>
                    <span className={`text-lg font-semibold tabular-nums ${devido > 0 ? "text-alerta" : ""}`}>{formatarReais(devido)}</span>
                  </span>
                </div>
                {(() => {
                  const meus = gastos.filter((g) => g.participanteId === d.participante_id);
                  if (meus.length === 0) return null;
                  return (
                    <div className="mt-3 border-t border-borda pt-3">
                      <details className="group">
                        <summary className="flex min-h-toque cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
                          <span>Ver no que foi gasto ({meus.length} {meus.length === 1 ? "lançamento" : "lançamentos"})</span>
                          <span aria-hidden className="text-texto-suave group-open:rotate-180">⌄</span>
                        </summary>
                        <ul className="mt-2 flex flex-col divide-y divide-borda">
                          {meus.map((g) => (
                            <li key={`${g.tipo}-${g.id}`} className="flex items-start justify-between gap-3 py-2">
                              <span className="min-w-0">
                                <span className="block text-xs text-texto-suave">
                                  {formatarDataHora(g.quando)} · {g.tipo === "compra" ? "Compra" : "Despesa"}
                                </span>
                                <span className="block font-medium break-words">{g.titulo}</span>
                                {g.detalhe ? <span className="block text-sm text-texto-suave break-words">{g.detalhe}</span> : null}
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums">{formatarReais(g.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  );
                })()}
                {admin && devido > 0 ? (
                  <div className="mt-3 border-t border-borda pt-3">
                    <Formulario acao={pagarReembolso} textoBotao={`Pagar reembolso a ${d.participante ?? "participante"}`} textoEnviando="Registrando…">
                      <input type="hidden" name="participante" value={d.participante_id ?? ""} />
                      <Campo id={`valor-${d.participante_id}`} name="valor" rotulo="Valor (R$)" inputMode="decimal" defaultValue={devido.toFixed(2).replace(".", ",")} required />
                      <Campo id={`obs-${d.participante_id}`} name="observacao" rotulo="Observação (opcional)" placeholder="Ex.: Pix de volta" maxLength={200} />
                    </Formulario>
                  </div>
                ) : null}
              </Cartao>
            );
          })}
          {!admin ? <p className="text-xs text-texto-suave">Quem registra o pagamento do reembolso é o administrador.</p> : null}
        </div>
      )}

      {reembolsos.length ? (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Reembolsos pagos</h2>
          <div className="flex flex-col gap-2">
            {reembolsos.map((r) => {
              const cancelado = r.situacao === "cancelada";
              return (
                <ItemEditavel
                  key={r.id}
                  titulo={<span className={cancelado ? "line-through decoration-1" : undefined}>{nome.get(r.participante_id) ?? "—"}</span>}
                  apoio={`${formatarData(r.data)}${r.observacao ? ` · ${r.observacao}` : ""}`}
                  direita={
                    <span className="flex flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums">{formatarReais(r.valor)}</span>
                      {cancelado ? <Selo tom="negativo">Cancelado</Selo> : null}
                    </span>
                  }
                >
                  <p className="text-xs text-texto-suave">Registrado em {formatarDataHora(r.criado_em)}</p>
                  {cancelado ? (
                    <p className="mt-2 text-sm text-negativo">Cancelado: {r.motivo_cancelamento}</p>
                  ) : admin ? (
                    <div className="mt-3 border-t border-borda pt-3">
                      <Formulario acao={cancelarReembolso} textoBotao="Cancelar reembolso" textoEnviando="Cancelando…" variante="perigo">
                        <input type="hidden" name="id" value={r.id} />
                        <Campo id={`motivo-${r.id}`} name="motivo" rotulo="Motivo" required maxLength={200} />
                      </Formulario>
                    </div>
                  ) : null}
                </ItemEditavel>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
