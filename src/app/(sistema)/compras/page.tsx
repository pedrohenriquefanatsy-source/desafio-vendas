import { Aviso, Campo, EstadoVazio, LinkBotao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarInsumos } from "@/servicos/catalogo";
import { listarParticipantes } from "@/servicos/participantes";
import { listarCompras } from "@/servicos/estoque";
import { cancelarCompra } from "../estoque/acoes";

const PRAZO_MINUTOS = 30; // D11: membro cancela o próprio lançamento em até 30 minutos

export default async function Compras({ searchParams }: PageProps<"/compras">) {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const { salva } = await searchParams;
  const [compras, insumos, pessoas] = await Promise.all([listarCompras(), listarInsumos(), listarParticipantes()]);
  const nomeInsumo = new Map(insumos.map((i) => [i.id, i.nome]));
  const nomePessoa = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));

  return (
    <>
      <TituloPagina apoio="Compras aumentam o estoque. Não entram no resultado: o custo entra quando o produto é vendido.">
        Compras
      </TituloPagina>
      {salva ? (
        <div className="mb-3">
          <Aviso tipo="sucesso">Compra registrada. O estoque e o preço dos insumos foram atualizados.</Aviso>
        </div>
      ) : null}
      <LinkBotao href="/compras/nova" className="mb-4 w-full">
        Registrar compra
      </LinkBotao>

      {compras.length === 0 ? (
        <EstadoVazio titulo="Nenhuma compra registrada">Toque em “Registrar compra” quando comprar insumos ou embalagens.</EstadoVazio>
      ) : (
        <div className="flex flex-col gap-2">
          {compras.map((c) => {
            const cancelada = c.situacao === "cancelada";
            const propria = c.criado_por === perfil.id;
            const dentroDoPrazo = c.minutos <= PRAZO_MINUTOS;
            const podeCancelar = !cancelada && (admin || (propria && dentroDoPrazo));
            const quem = c.pago_por === "caixa" ? "Caixa" : `Do bolso de ${nomePessoa.get(c.participante_id ?? "") ?? "participante"}`;
            return (
              <ItemEditavel
                key={c.id}
                titulo={
                  <span className={cancelada ? "line-through decoration-1" : undefined}>
                    {formatarData(c.data)}
                    {c.fornecedor ? ` · ${c.fornecedor}` : ""}
                  </span>
                }
                apoio={`${quem} · ${c.itens.length} ${c.itens.length === 1 ? "item" : "itens"}`}
                direita={
                  <span className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatarReais(c.total)}</span>
                    {cancelada ? <Selo tom="negativo">Cancelada</Selo> : null}
                  </span>
                }
              >
                <ul className="mb-3 divide-y divide-borda text-sm">
                  {c.itens.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 py-2">
                      <span>
                        {nomeInsumo.get(i.insumo_id) ?? "Insumo"} · {formatarQuantidade(i.quantidade)} {i.unidade}
                      </span>
                      <span className="tabular-nums">{formatarReais(i.valor)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-texto-suave">
                  Lançada por {nomePessoa.get(c.criado_por ?? "") ?? "—"} em {formatarDataHora(c.criado_em)}
                  {c.observacao ? ` · ${c.observacao}` : ""}
                </p>
                {cancelada ? (
                  <p className="mt-2 text-sm text-negativo">
                    Cancelada em {formatarDataHora(c.cancelado_em)}: {c.motivo_cancelamento}
                  </p>
                ) : podeCancelar ? (
                  <div className="mt-3 border-t border-borda pt-3">
                    <Formulario acao={cancelarCompra} textoBotao="Cancelar compra" textoEnviando="Cancelando…" variante="perigo">
                      <input type="hidden" name="id" value={c.id} />
                      <Campo id={`motivo-${c.id}`} name="motivo" rotulo="Motivo" placeholder="Ex.: lancei em dobro" required maxLength={200} />
                      <p className="text-xs text-texto-suave">O estoque e o caixa voltam ao que eram. Nada é apagado: fica no histórico.</p>
                    </Formulario>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-texto-suave">
                    Para cancelar, peça ao administrador. Quem lançou só cancela nos primeiros {PRAZO_MINUTOS} minutos.
                  </p>
                )}
              </ItemEditavel>
            );
          })}
        </div>
      )}
    </>
  );
}
