import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso, Campo, Cartao, LinkBotao, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarFormasPagamento } from "@/servicos/formas-pagamento";
import { obterVenda } from "@/servicos/vendas";
import { cancelarVenda, entregarEncomenda, marcarPronta, registrarRecebimento } from "../acoes";

const PRAZO_MINUTOS = 30; // D11
const MOTIVOS = ["Lancei errado", "Cliente desistiu", "Valor errado", "Venda repetida"];

const FEITOS: Record<string, string> = {
  recebido: "Recebimento registrado. Entrou no caixa.",
  pronta: "Encomenda marcada como pronta.",
  entregue: "Encomenda entregue: os produtos saíram do estoque e a venda entrou no resultado.",
  cancelada: "Cancelada. O estoque e o dinheiro recebido voltaram; o registro fica no histórico.",
};

export default async function Venda({ params, searchParams }: PageProps<"/vendas/[id]">) {
  const perfil = await exigirParticipante();
  const { id } = await params;
  const { feito } = await searchParams;
  const dados = /^[0-9a-f-]{36}$/i.test(id) ? await obterVenda(id) : null;
  if (!dados) notFound();
  const { venda: v, itens, recebimentos, minutos } = dados;
  const formas = (await listarFormasPagamento()).filter((f) => f.ativa);
  const ativa = v.situacao === "ativa";
  const podeCancelar = ativa && (ehAdmin(perfil) || (v.criado_por === perfil.id && minutos <= PRAZO_MINUTOS));
  const aReceber = Number(v.a_receber ?? 0);
  const titulo = v.tipo === "doacao" ? "Doação" : v.tipo === "encomenda" ? "Encomenda" : "Venda";

  return (
    <>
      <Link href="/vendas" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Vendas
      </Link>
      <TituloPagina
        apoio={`${formatarDataHora(v.data_hora)} · ${v.participante ?? "—"}${v.cliente ? ` · cliente: ${v.cliente}` : v.cliente_desconhecido ? " · cliente desconhecido" : ""}${v.bairro ? ` · bairro ${v.bairro}` : ""}`}
      >
        {titulo} nº {v.numero}
      </TituloPagina>

      {typeof feito === "string" && FEITOS[feito] ? (
        <div className="mb-3">
          <Aviso tipo="sucesso">{FEITOS[feito]}</Aviso>
        </div>
      ) : null}
      {!ativa ? (
        <div className="mb-3">
          <Aviso tipo="erro">
            Cancelada em {formatarDataHora(v.cancelado_em)}: {v.motivo_cancelamento}. O estoque e o caixa voltaram; nada foi apagado.
          </Aviso>
        </div>
      ) : null}
      {v.estoque_negativo_confirmado ? (
        <p className="mb-3 text-sm text-alerta">Lançada com aviso: o estoque registrado não tinha tudo.</p>
      ) : null}

      <Cartao className="mb-3">
        <ul className="divide-y divide-borda">
          {itens.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>
                <span className="block font-medium">
                  {formatarQuantidade(i.quantidade)}× {i.nome}
                </span>
                {v.tipo !== "doacao" ? (
                  <span className="text-sm text-texto-suave">
                    {formatarReais(i.preco_unitario)} cada{Number(i.desconto_rateado) > 0 ? ` · desconto ${formatarReais(i.desconto_rateado)}` : ""}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">{formatarReais(i.valor_liquido)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-borda pt-3 text-sm">
          {Number(v.desconto) > 0 ? (
            <>
              <dt className="text-texto-suave">Desconto</dt>
              <dd className="text-right tabular-nums">−{formatarReais(v.desconto)}</dd>
            </>
          ) : null}
          <dt className="font-semibold">Total</dt>
          <dd className="text-right text-lg font-semibold tabular-nums">{formatarReais(v.total)}</dd>
          {v.tipo !== "doacao" ? (
            <>
              <dt className="text-texto-suave">Pagamento</dt>
              <dd className="text-right">{v.forma_pagamento}</dd>
              <dt className="text-texto-suave">Recebido</dt>
              <dd className="text-right tabular-nums">{formatarReais(v.recebido)}</dd>
              {ativa && aReceber > 0 ? (
                <>
                  <dt className="text-alerta">Falta receber</dt>
                  <dd className="text-right font-semibold tabular-nums text-alerta">{formatarReais(aReceber)}</dd>
                </>
              ) : null}
            </>
          ) : null}
          <dt className="text-texto-suave">Sobra da venda</dt>
          <dd className="text-right tabular-nums">
            {v.margem_total == null ? (v.tipo === "encomenda" ? "na entrega" : "sem custo") : formatarReais(v.margem_total)}
          </dd>
        </dl>
        {v.tipo === "encomenda" ? (
          <p className="mt-3 flex items-center gap-2 text-sm">
            Entrega {formatarData(v.entrega_prevista)}
            <Selo tom={v.situacao_entrega === "entregue" ? "positivo" : "alerta"}>
              {v.situacao_entrega === "entregue" ? `Entregue ${formatarDataHora(v.entregue_em)}` : v.situacao_entrega === "pronta" ? "Pronta" : "Aguardando produção"}
            </Selo>
          </p>
        ) : null}
        {v.observacao ? <p className="mt-2 text-sm text-texto-suave">Obs.: {v.observacao}</p> : null}
        {v.sem_custo ? (
          <p className="mt-2 text-sm text-alerta">Algum produto estava sem custo cadastrado: a margem desta venda ficou incompleta.</p>
        ) : null}
      </Cartao>

      <div className="flex flex-col gap-3">
        {ativa && aReceber > 0 ? (
          <Cartao>
            <h2 className="mb-3 font-semibold">Receber</h2>
            <Formulario acao={registrarRecebimento} textoBotao="Confirmar recebimento">
              <input type="hidden" name="id" value={v.id ?? ""} />
              <div className="grid grid-cols-2 gap-3">
                <Campo id="valor" name="valor" rotulo="Valor (R$)" inputMode="decimal" defaultValue={aReceber.toFixed(2).replace(".", ",")} required />
                <Selecao id="forma" name="forma" rotulo="Como pagou" defaultValue={v.forma_pagamento_id ?? formas[0]?.id}>
                  {formas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Selecao>
              </div>
            </Formulario>
          </Cartao>
        ) : null}

        {ativa && v.tipo === "encomenda" && v.situacao_entrega !== "entregue" ? (
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-semibold">Encomenda</h2>
            {v.situacao_entrega === "aguardando" ? (
              <Formulario acao={marcarPronta} textoBotao="Marcar como pronta" textoEnviando="Marcando…" variante="secundario">
                <input type="hidden" name="id" value={v.id ?? ""} />
              </Formulario>
            ) : null}
            <Formulario acao={entregarEncomenda} textoBotao="Marcar como entregue" textoEnviando="Entregando…">
              <input type="hidden" name="id" value={v.id ?? ""} />
              <p className="text-xs text-texto-suave">Ao entregar, os produtos saem do estoque e a venda entra no resultado.</p>
            </Formulario>
          </Cartao>
        ) : null}

        {recebimentos.length ? (
          <section>
            <h2 className="mb-2 font-semibold">Recebimentos</h2>
            <Cartao className="divide-y divide-borda p-0">
              {recebimentos.map((r) => (
                <div key={r.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {r.estorno_de ? "Estorno" : "Recebido"} · {formatarDataHora(r.recebido_em)}
                    {Number(r.taxa_valor) !== 0 ? ` · taxa ${formatarReais(r.taxa_valor)}` : ""}
                  </span>
                  <span className={`tabular-nums ${Number(r.valor) < 0 ? "text-negativo" : ""}`}>{formatarReais(r.valor)}</span>
                </div>
              ))}
            </Cartao>
          </section>
        ) : null}

        {podeCancelar ? (
          <details className="rounded-cartao border border-borda bg-superficie">
            <summary className="flex min-h-toque cursor-pointer list-none items-center px-4 font-medium text-negativo [&::-webkit-details-marker]:hidden">
              Cancelar {titulo.toLowerCase()}
            </summary>
            <div className="border-t border-borda p-4">
              <Formulario acao={cancelarVenda} textoBotao={`Cancelar ${titulo.toLowerCase()} nº ${v.numero}`} textoEnviando="Cancelando…" variante="perigo">
                <input type="hidden" name="id" value={v.id ?? ""} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-medium">Motivo</legend>
                  {MOTIVOS.map((m, n) => (
                    <label key={m} className="flex min-h-toque items-center gap-3 rounded-xl border border-borda px-3 has-[:checked]:border-acao">
                      <input type="radio" name="motivo" value={m} defaultChecked={n === 0} className="size-5 accent-acao" />
                      {m}
                    </label>
                  ))}
                </fieldset>
                <Campo id="motivo_outro" name="motivo_outro" rotulo="Outro motivo (opcional)" maxLength={200} />
                <p className="text-xs text-texto-suave">O estoque e o dinheiro recebido voltam. Nada é apagado: fica no histórico.</p>
              </Formulario>
            </div>
          </details>
        ) : null}
        {/* Corrigir = cancelar e lançar de novo já preenchida (D11); ativa: repetir a mesma venda. */}
        <LinkBotao href={`/vendas/nova?copiar=${v.id}`} variante="secundario">
          {ativa ? "Repetir esta venda" : "Lançar de novo, já preenchida"}
        </LinkBotao>
        {ativa && !podeCancelar ? (
          <p className="text-xs text-texto-suave">
            Para cancelar, peça ao administrador. Quem lançou só cancela nos primeiros {PRAZO_MINUTOS} minutos.
          </p>
        ) : null}
      </div>
    </>
  );
}
