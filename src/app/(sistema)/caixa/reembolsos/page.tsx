import Link from "next/link";
import { Aviso, Campo, Cartao, EstadoVazio, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { listarDevidos, listarReembolsos } from "@/servicos/caixa";
import { cancelarReembolso, pagarReembolso } from "../acoes";

// A reembolsar (Seção 4.5): quanto o desafio deve a cada participante e os reembolsos pagos.
export default async function Reembolsos({ searchParams }: PageProps<"/caixa/reembolsos">) {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const { feito } = await searchParams;
  const [devidos, reembolsos, pessoas] = await Promise.all([listarDevidos(), listarReembolsos(), listarParticipantes()]);
  const nome = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));

  return (
    <>
      <Link href="/caixa" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Caixa
      </Link>
      <TituloPagina apoio="Compras e despesas pagas do próprio bolso. O reembolso sai do caixa e não mexe no resultado de novo.">
        A reembolsar
      </TituloPagina>
      {feito === "pago" ? (
        <div className="mb-3">
          <Aviso tipo="sucesso">Reembolso registrado. Saiu do caixa; o resultado não muda.</Aviso>
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
