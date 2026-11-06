import { Campo, Cartao, Interruptor, Selo, TituloPagina, BotaoVoltar } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora, hojeIso } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { CATEGORIAS_DESPESA, listarDespesas } from "@/servicos/caixa";
import { cancelarDespesa, registrarDespesa } from "../acoes";

const PRAZO_MINUTOS = 30; // D11

// Despesa: algo que não vira estoque. Fluxo: valor → categoria → "do meu bolso" → confirmar.
export default async function Despesa() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const [despesas, pessoas] = await Promise.all([listarDespesas(), listarParticipantes()]);
  const nome = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));

  return (
    <>
      <BotaoVoltar href="/caixa">Caixa</BotaoVoltar>
      <TituloPagina apoio="Gasto que não vira estoque (Uber, adesivos…). Entra no lucro estimado uma vez.">Nova despesa</TituloPagina>
      <Cartao className="mb-6">
        <Formulario acao={registrarDespesa} textoBotao="Registrar despesa" limparAoSalvar>
          <Campo id="valor" name="valor" rotulo="Valor (R$)" inputMode="decimal" placeholder="0,00" required />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Categoria</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS_DESPESA.map((c, n) => (
                <label key={c} className="inline-flex min-h-toque cursor-pointer items-center rounded-full border border-borda px-4 text-sm has-[:checked]:border-acao has-[:checked]:bg-acao has-[:checked]:text-acao-texto">
                  <input type="radio" name="categoria" value={c} defaultChecked={n === 0} className="sr-only" />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          <Campo id="descricao" name="descricao" rotulo="O que foi (opcional)" placeholder="Ex.: Uber para a feira" maxLength={120} />
          <Interruptor id="do_bolso" name="do_bolso" rotulo="Paguei do meu bolso (o desafio me reembolsa)" />
          <Campo id="data" name="data" rotulo="Data" type="date" defaultValue={hojeIso()} max={hojeIso()} required />
        </Formulario>
      </Cartao>

      <h2 className="mb-2 font-semibold">Despesas lançadas</h2>
      {despesas.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma despesa ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {despesas.map((d) => {
            const cancelada = d.situacao === "cancelada";
            const pode = !cancelada && (admin || (d.criado_por === perfil.id && d.minutos <= PRAZO_MINUTOS));
            return (
              <ItemEditavel
                key={d.id}
                titulo={<span className={cancelada ? "line-through decoration-1" : undefined}>{d.descricao}</span>}
                apoio={`${formatarData(d.data)} · ${d.pago_por === "caixa" ? "Caixa" : `Do bolso de ${nome.get(d.participante_id ?? "") ?? "participante"}`}`}
                direita={
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatarReais(d.valor)}</span>
                    {cancelada ? <Selo tom="negativo">Cancelada</Selo> : null}
                  </span>
                }
              >
                <p className="text-xs text-texto-suave">
                  {d.categoria ? `${d.categoria} · ` : ""}Lançada por {nome.get(d.criado_por ?? "") ?? "—"} em {formatarDataHora(d.criado_em)}
                </p>
                {cancelada ? (
                  <p className="mt-2 text-sm text-negativo">
                    Cancelada em {formatarDataHora(d.cancelado_em)}: {d.motivo_cancelamento}
                  </p>
                ) : pode ? (
                  <div className="mt-3 border-t border-borda pt-3">
                    <Formulario acao={cancelarDespesa} textoBotao="Cancelar despesa" textoEnviando="Cancelando…" variante="perigo">
                      <input type="hidden" name="id" value={d.id} />
                      <Campo id={`motivo-${d.id}`} name="motivo" rotulo="Motivo" placeholder="Ex.: lancei em dobro" required maxLength={200} />
                    </Formulario>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-texto-suave">Para cancelar, peça ao administrador. Quem lançou só cancela nos primeiros {PRAZO_MINUTOS} minutos.</p>
                )}
              </ItemEditavel>
            );
          })}
        </div>
      )}
    </>
  );
}
