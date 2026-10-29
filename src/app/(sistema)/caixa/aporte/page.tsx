import Link from "next/link";
import { Campo, Cartao, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { listarAportes } from "@/servicos/caixa";
import { cancelarAporte, registrarAporte } from "../acoes";

// Aporte: dinheiro colocado no caixa por um participante ou pela PJ. Não é receita.
export default async function Aporte() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const [aportes, pessoas] = await Promise.all([listarAportes(), listarParticipantes()]);
  const ativos = pessoas.filter((p) => p.ativo);
  const nome = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));

  return (
    <>
      <Link href="/caixa" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Caixa
      </Link>
      <TituloPagina apoio="Entra no caixa. Não é venda: não muda o faturamento.">Aportes</TituloPagina>
      {admin ? (
        <Cartao className="mb-6">
          <Formulario acao={registrarAporte} textoBotao="Registrar aporte" limparAoSalvar>
            <Selecao id="origem" name="origem" rotulo="De onde veio" defaultValue="participante">
              <option value="participante">De um participante</option>
              <option value="pj">Da PJ (empresa)</option>
            </Selecao>
            <Selecao id="participante" name="participante" rotulo="Quem (se for de um participante)" defaultValue={perfil.id}>
              {ativos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome ?? "Sem nome"}
                </option>
              ))}
            </Selecao>
            <Campo id="valor" name="valor" rotulo="Valor (R$)" inputMode="decimal" placeholder="0,00" required />
            <Campo id="observacao" name="observacao" rotulo="Observação (opcional)" placeholder="Ex.: troco inicial" maxLength={200} />
          </Formulario>
        </Cartao>
      ) : (
        <p className="mb-4 text-sm text-texto-suave">Quem registra aportes é o administrador.</p>
      )}

      <h2 className="mb-2 font-semibold">Aportes lançados</h2>
      {aportes.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum aporte ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {aportes.map((a) => {
            const cancelado = a.situacao === "cancelada";
            return (
              <ItemEditavel
                key={a.id}
                titulo={
                  <span className={cancelado ? "line-through decoration-1" : undefined}>
                    {a.origem === "pj" ? "PJ" : (nome.get(a.participante_id ?? "") ?? "Participante")}
                  </span>
                }
                apoio={`${formatarData(a.data)}${a.observacao ? ` · ${a.observacao}` : ""}`}
                direita={
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatarReais(a.valor)}</span>
                    {cancelado ? <Selo tom="negativo">Cancelado</Selo> : null}
                  </span>
                }
              >
                <p className="text-xs text-texto-suave">Registrado em {formatarDataHora(a.criado_em)}</p>
                {cancelado ? (
                  <p className="mt-2 text-sm text-negativo">Cancelado: {a.motivo_cancelamento}</p>
                ) : admin ? (
                  <div className="mt-3 border-t border-borda pt-3">
                    <Formulario acao={cancelarAporte} textoBotao="Cancelar aporte" textoEnviando="Cancelando…" variante="perigo">
                      <input type="hidden" name="id" value={a.id} />
                      <Campo id={`motivo-${a.id}`} name="motivo" rotulo="Motivo" required maxLength={200} />
                    </Formulario>
                  </div>
                ) : null}
              </ItemEditavel>
            );
          })}
        </div>
      )}
    </>
  );
}
