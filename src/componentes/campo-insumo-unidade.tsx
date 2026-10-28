"use client";

import { useState } from "react";

export type OpcaoInsumo = {
  id: string;
  nome: string;
  unidadeBase: string;
  // Unidades aceitas por este insumo e quantas unidades base cada uma tem.
  unidades: { unidade: string; quantidadeEmBase: number }[];
  // Custo de cada grama (ou ml, ou unidade) e a embalagem cadastrada; as telas de compra e de receita usam.
  custoBase: number | null;
  embalagem: { tamanho: number; preco: number | null } | null;
};

const selecao = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Escolha de insumo, quantidade e unidade. A lista de unidades muda conforme o
// insumo: só aparecem as que o banco sabe converter (nunca massa → volume).
export function CampoInsumoUnidade({
  insumos,
  prefixo,
  rotuloInsumo = "Insumo",
  rotuloQuantidade = "Quantidade",
  quantidadeInicial = "",
}: {
  insumos: OpcaoInsumo[];
  prefixo: string;
  rotuloInsumo?: string;
  rotuloQuantidade?: string;
  quantidadeInicial?: string;
}) {
  const [insumoId, setInsumoId] = useState("");
  const insumo = insumos.find((i) => i.id === insumoId);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefixo}-insumo`} className="text-sm font-medium">
          {rotuloInsumo}
        </label>
        <select
          id={`${prefixo}-insumo`}
          name="insumo_id"
          required
          value={insumoId}
          onChange={(e) => setInsumoId(e.target.value)}
          className={selecao}
        >
          <option value="">Escolha…</option>
          {insumos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefixo}-quantidade`} className="text-sm font-medium">
            {rotuloQuantidade}
          </label>
          <input
            id={`${prefixo}-quantidade`}
            name="quantidade"
            inputMode="decimal"
            required
            defaultValue={quantidadeInicial}
            className="min-h-toque rounded-xl border border-borda bg-superficie px-3 text-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${prefixo}-unidade`} className="text-sm font-medium">
            Unidade
          </label>
          <select
            key={insumoId}
            id={`${prefixo}-unidade`}
            name="unidade"
            required
            defaultValue={insumo?.unidadeBase ?? ""}
            disabled={!insumo}
            className={selecao}
          >
            {insumo ? (
              insumo.unidades.map((u) => (
                <option key={u.unidade} value={u.unidade}>
                  {u.unidade === insumo.unidadeBase ? u.unidade : `${u.unidade} (${u.quantidadeEmBase} ${insumo.unidadeBase})`}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>
        </div>
      </div>
    </div>
  );
}
