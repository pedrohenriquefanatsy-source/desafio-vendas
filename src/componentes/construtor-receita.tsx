"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Formulario } from "./formulario";
import { classeBotao } from "./ui";
import { formatarCustoUnidade, formatarQuantidade, formatarReais, lerNumero } from "@/lib/numeros";
import type { OpcaoInsumo } from "./campo-insumo-unidade";
import type { Resultado } from "@/servicos/erros";

type Linha = { chave: number; insumo_id: string; quantidade: string; unidade: string };

const campo = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Monta a receita de um sabor do jeito que se pensa: primeiro todos os ingredientes e as quantidades
// (o custo da fornada aparece na hora), e só no fim quantas unidades ela rende (uma receita pode
// render mais ou menos). Nada é gravado até tocar em "Cadastrar receita"; aí vai tudo de uma vez.
// As contas daqui são só prévia: o custo oficial é calculado pelo banco.
export function ConstrutorReceita({
  insumos,
  variacaoId,
  produtoId,
  acao,
}: {
  insumos: OpcaoInsumo[];
  variacaoId: string;
  produtoId: string;
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: 0, insumo_id: "", quantidade: "", unidade: "" }]);
  const [proxima, setProxima] = useState(1);
  const [rendimento, setRendimento] = useState("");

  const achar = (id: string) => insumos.find((i) => i.id === id);
  function mudar(chave: number, mudanca: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
  }

  // Custo de cada linha: quantidade × quanto vale a unidade escolhida em g (ou ml, ou und) × custo da base.
  function custoDa(l: Linha): number | null | undefined {
    const insumo = achar(l.insumo_id);
    const qtd = lerNumero(l.quantidade);
    if (!insumo || qtd == null || qtd <= 0) return undefined; // ainda sem conta
    const fator = insumo.unidades.find((u) => u.unidade === l.unidade)?.quantidadeEmBase;
    if (fator == null || insumo.custoBase == null) return null; // sem preço
    return qtd * fator * insumo.custoBase;
  }

  const preenchidas = linhas.filter((l) => l.insumo_id && (lerNumero(l.quantidade) ?? 0) > 0);
  const semPreco = preenchidas.filter((l) => custoDa(l) === null).map((l) => achar(l.insumo_id)?.nome ?? "");
  const total = preenchidas.reduce((t, l) => t + (custoDa(l) ?? 0), 0);
  const rende = lerNumero(rendimento);
  const completo = semPreco.length === 0 && preenchidas.length > 0;
  const escolhidos = new Set(linhas.map((l) => l.insumo_id).filter(Boolean));
  const json = JSON.stringify(preenchidas.map((l) => ({ insumo_id: l.insumo_id, quantidade: l.quantidade, unidade: l.unidade })));

  return (
    <Formulario acao={acao} textoBotao="Cadastrar receita" textoEnviando="Cadastrando…" desabilitado={preenchidas.length === 0 || !(rende && rende > 0)}>
      <input type="hidden" name="variacao_id" value={variacaoId} />
      <input type="hidden" name="produto_id" value={produtoId} />
      <input type="hidden" name="itens" value={json} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">1. Ingredientes de uma fornada</legend>
        {linhas.map((l, n) => {
          const insumo = achar(l.insumo_id);
          const custo = custoDa(l);
          return (
            <div key={l.chave} role="group" aria-label={`Ingrediente ${n + 1}`} className="flex flex-col gap-2 rounded-cartao border border-borda p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`rc-${l.chave}-insumo`} className="text-sm font-medium">
                  Ingrediente {n + 1}
                </label>
                {linhas.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                    aria-label={`Tirar o ingrediente ${n + 1}`}
                    className="inline-flex size-11 items-center justify-center rounded-xl text-texto-suave"
                  >
                    <X aria-hidden className="size-5" />
                  </button>
                ) : null}
              </div>
              <select
                id={`rc-${l.chave}-insumo`}
                value={l.insumo_id}
                onChange={(e) => mudar(l.chave, { insumo_id: e.target.value, unidade: achar(e.target.value)?.unidadeBase ?? "" })}
                className={campo}
              >
                <option value="">Escolha…</option>
                {insumos
                  .filter((i) => i.id === l.insumo_id || !escolhidos.has(i.id))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome}
                    </option>
                  ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Quantidade
                  <input
                    id={`rc-${l.chave}-quantidade`}
                    inputMode="decimal"
                    value={l.quantidade}
                    onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                    placeholder="Ex.: 200"
                    className={campo}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Unidade
                  <select
                    id={`rc-${l.chave}-unidade`}
                    value={l.unidade}
                    disabled={!insumo}
                    onChange={(e) => mudar(l.chave, { unidade: e.target.value })}
                    className={campo}
                  >
                    {insumo ? (
                      insumo.unidades.map((u) => (
                        <option key={u.unidade} value={u.unidade}>
                          {u.unidade === insumo.unidadeBase ? u.unidade : `${u.unidade} (${formatarQuantidade(u.quantidadeEmBase)} ${insumo.unidadeBase})`}
                        </option>
                      ))
                    ) : (
                      <option value="">—</option>
                    )}
                  </select>
                </label>
              </div>
              {insumo ? (
                <p className="text-xs text-texto-suave">
                  {custo === undefined
                    ? `${formatarCustoUnidade(insumo.custoBase, insumo.unidadeBase)}`
                    : custo === null
                      ? "Sem preço cadastrado: o custo desta linha não entra na conta."
                      : `${formatarReais(custo)} (${formatarCustoUnidade(insumo.custoBase, insumo.unidadeBase)})`}
                </p>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setLinhas((atual) => [...atual, { chave: proxima, insumo_id: "", quantidade: "", unidade: "" }]);
            setProxima((n) => n + 1);
          }}
          className={classeBotao("secundario", "w-full")}
        >
          <Plus aria-hidden className="size-5" /> Adicionar ingrediente
        </button>
      </fieldset>

      <div className="rounded-xl bg-fundo px-3 py-2" aria-live="polite">
        <p className="flex items-baseline justify-between text-sm">
          <span className="text-texto-suave">Custo dos ingredientes (uma fornada)</span>
          <span className="text-lg font-semibold tabular-nums">{formatarReais(total)}</span>
        </p>
        {semPreco.length ? (
          <p className="mt-1 text-xs text-alerta">Falta o preço de: {semPreco.join(", ")}. O total está incompleto; cadastre o preço em Mais → Insumos.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rc-rendimento" className="text-sm font-medium">
          2. Quantas unidades essa fornada rende?
        </label>
        <input
          id="rc-rendimento"
          name="rendimento"
          inputMode="decimal"
          value={rendimento}
          onChange={(e) => setRendimento(e.target.value)}
          placeholder="Ex.: 24"
          className={campo}
        />
        <span className="text-xs text-texto-suave">
          {completo && rende && rende > 0 ? (
            <>
              Cada unidade custa <strong>{formatarReais(total / rende)}</strong> de ingredientes (sem a embalagem do produto).
            </>
          ) : (
            "Depois de listar os ingredientes, diga quantas unidades saem. Se rende mais ou menos, é só mudar este número."
          )}
        </span>
      </div>
    </Formulario>
  );
}
