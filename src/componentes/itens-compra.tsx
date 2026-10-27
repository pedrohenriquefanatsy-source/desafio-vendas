"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { lerNumero, formatarReais } from "@/lib/numeros";
import { classeBotao } from "./ui";
import type { OpcaoInsumo } from "./campo-insumo-unidade";

type Linha = { chave: number; insumo_id: string; quantidade: string; unidade: string; valor: string };

const campo = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Itens de uma compra: insumo, quantidade, unidade e quanto custou no total.
// O total mostrado é só prévia; o oficial é calculado pelo banco ao salvar.
// Os itens vão para a Server Action num campo escondido "itens" (JSON).
export function ItensCompra({ insumos, iniciais }: { insumos: OpcaoInsumo[]; iniciais: { insumo_id: string; quantidade: string }[] }) {
  const unidadeBase = (id: string) => insumos.find((i) => i.id === id)?.unidadeBase ?? "";
  const [linhas, setLinhas] = useState<Linha[]>(() => {
    const prontas = iniciais
      .filter((i) => insumos.some((o) => o.id === i.insumo_id))
      .map((i, n) => ({ chave: n, insumo_id: i.insumo_id, quantidade: i.quantidade, unidade: unidadeBase(i.insumo_id), valor: "" }));
    return prontas.length ? prontas : [{ chave: 0, insumo_id: "", quantidade: "", unidade: "", valor: "" }];
  });
  const [proxima, setProxima] = useState(linhas.length);

  function mudar(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }
  function adicionar() {
    setLinhas((atual) => [...atual, { chave: proxima, insumo_id: "", quantidade: "", unidade: "", valor: "" }]);
    setProxima((n) => n + 1);
  }
  function remover(chave: number) {
    setLinhas((atual) => atual.filter((l) => l.chave !== chave));
  }

  const total = linhas.reduce((t, l) => t + (lerNumero(l.valor) ?? 0), 0);
  const json = JSON.stringify(linhas.map(({ insumo_id, quantidade, unidade, valor }) => ({ insumo_id, quantidade, unidade, valor })));

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="itens" value={json} />
      {linhas.map((l, n) => {
        const insumo = insumos.find((i) => i.id === l.insumo_id);
        return (
          <fieldset key={l.chave} aria-label={`Item ${n + 1}`} className="flex flex-col gap-3 rounded-cartao border border-borda p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Item {n + 1}</span>
              {linhas.length > 1 ? (
                <button
                  type="button"
                  onClick={() => remover(l.chave)}
                  aria-label={`Tirar o item ${n + 1}`}
                  className="inline-flex size-11 items-center justify-center rounded-xl text-texto-suave"
                >
                  <X aria-hidden className="size-5" />
                </button>
              ) : null}
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Insumo
              <select
                value={l.insumo_id}
                required
                onChange={(e) => mudar(l.chave, { insumo_id: e.target.value, unidade: unidadeBase(e.target.value) })}
                className={campo}
              >
                <option value="">Escolha…</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Quantidade
                <input
                  inputMode="decimal"
                  required
                  value={l.quantidade}
                  onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                  className={campo}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Unidade
                <select
                  value={l.unidade}
                  required
                  disabled={!insumo}
                  onChange={(e) => mudar(l.chave, { unidade: e.target.value })}
                  className={campo}
                >
                  {insumo ? (
                    insumo.unidades.map((u) => (
                      <option key={u.unidade} value={u.unidade}>
                        {u.unidade}
                      </option>
                    ))
                  ) : (
                    <option value="">—</option>
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Valor (R$)
                <input
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={l.valor}
                  onChange={(e) => mudar(l.chave, { valor: e.target.value })}
                  className={campo}
                />
              </label>
            </div>
            {insumo && l.unidade && l.unidade !== insumo.unidadeBase ? (
              <p className="text-xs text-texto-suave">
                1 {l.unidade} = {insumo.unidades.find((u) => u.unidade === l.unidade)?.quantidadeEmBase} {insumo.unidadeBase}
              </p>
            ) : null}
          </fieldset>
        );
      })}
      <button type="button" onClick={adicionar} className={classeBotao("secundario", "w-full")}>
        <Plus aria-hidden className="size-5" /> Adicionar item
      </button>
      <p className="flex items-baseline justify-between text-sm">
        <span className="text-texto-suave">Total da compra</span>
        <span className="text-lg font-semibold tabular-nums">{formatarReais(total)}</span>
      </p>
    </div>
  );
}
