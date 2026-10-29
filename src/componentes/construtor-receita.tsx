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
const chipModo = (ativo: boolean) =>
  `inline-flex min-h-toque items-center justify-center rounded-full border px-4 text-sm font-medium ${
    ativo ? "border-acao bg-acao text-acao-texto" : "border-borda bg-superficie text-texto"
  }`;

// Monta a receita de um sabor do jeito que se pensa: primeiro todos os ingredientes e as quantidades
// (o custo da fornada aparece na hora), e só no fim quantas unidades ela rende (uma receita pode
// render mais ou menos). Nada é gravado até tocar em "Cadastrar receita"; aí vai tudo de uma vez.
// As contas daqui são só prévia: o custo oficial é calculado pelo banco.
type Acao = (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;

export function ConstrutorReceita({
  insumos,
  variacaoId,
  produtoId,
  acao,
  acaoPeso,
}: {
  insumos: OpcaoInsumo[];
  variacaoId: string;
  produtoId: string;
  acao: Acao;
  acaoPeso: Acao;
}) {
  const [modo, setModo] = useState<"rendimento" | "peso">("rendimento");
  const [cobertura, setCobertura] = useState("");
  const [cubos, setCubos] = useState("");
  const [chocolate, setChocolate] = useState("");
  const [gramagem, setGramagem] = useState("");
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

  // Modo por peso: o chocolate é um insumo medido em gramas; o resto é estimativa de uma fornada.
  const coberturas = insumos.filter((i) => i.unidadeBase === "g");
  const insumoCobertura = achar(cobertura);
  const pesoCubos = lerNumero(cubos);
  const pesoChocolate = lerNumero(chocolate);
  const pesoPote = lerNumero(gramagem);
  const pesoCompleto = Boolean(insumoCobertura) && (pesoCubos ?? 0) > 0 && (pesoChocolate ?? 0) > 0 && (pesoPote ?? 0) > 0;
  const custoChocolate = pesoCompleto && insumoCobertura?.custoBase != null ? (pesoChocolate ?? 0) * insumoCobertura.custoBase : null;
  const custoPorGrama = pesoCompleto && completo && custoChocolate != null ? (total + custoChocolate) / ((pesoCubos ?? 0) + (pesoChocolate ?? 0)) : null;

  const peso = modo === "peso";
  return (
    <Formulario
      key={modo}
      acao={peso ? acaoPeso : acao}
      textoBotao="Cadastrar receita"
      textoEnviando="Cadastrando…"
      desabilitado={preenchidas.length === 0 || (peso ? !pesoCompleto : !(rende && rende > 0))}
    >
      <input type="hidden" name="variacao_id" value={variacaoId} />
      <input type="hidden" name="produto_id" value={produtoId} />
      <input type="hidden" name="itens" value={json} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Como calcular o custo?</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!peso} onClick={() => setModo("rendimento")} className={chipModo(!peso)}>
            Por unidades
          </button>
          <button type="button" aria-pressed={peso} onClick={() => setModo("peso")} className={chipModo(peso)}>
            Por peso
          </button>
        </div>
        <p className="text-xs text-texto-suave">
          {peso
            ? "Para cubos com cobertura: o custo sai do peso dos cubos e do chocolate que você pesa a cada fornada."
            : "A fornada rende um número de unidades; o custo de cada uma é o custo da fornada dividido por esse número."}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{peso ? "1. Ingredientes da massa (uma fornada)" : "1. Ingredientes de uma fornada"}</legend>
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

      {peso ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">2. Cobertura e pesos de uma fornada (estimativa)</legend>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Chocolate da cobertura
            <select
              id="rc-cobertura"
              name="cobertura_insumo"
              value={cobertura}
              onChange={(e) => setCobertura(e.target.value)}
              className={campo}
            >
              <option value="">Escolha…</option>
              {coberturas.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Cubos bons (g)
              <input id="rc-cubos" name="peso_cubos" inputMode="decimal" value={cubos} onChange={(e) => setCubos(e.target.value)} placeholder="Ex.: 2000" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Chocolate gasto (g)
              <input id="rc-chocolate" name="cobertura" inputMode="decimal" value={chocolate} onChange={(e) => setChocolate(e.target.value)} placeholder="Ex.: 700" className={campo} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Gramagem de cada potinho (g)
            <input id="rc-gramagem" name="gramagem" inputMode="decimal" value={gramagem} onChange={(e) => setGramagem(e.target.value)} placeholder="Ex.: 150" className={campo} />
          </label>
          <p className="text-xs text-texto-suave">
            Só para começar: quanto esperam que dê de cubos bons (sem sobras e farelos) e de chocolate numa fornada. Quando vocês pesarem a primeira
            fornada de verdade, o sistema passa a usar os números reais.
          </p>
          <div className="rounded-xl bg-fundo px-3 py-2 text-sm" aria-live="polite">
            {pesoCompleto && custoPorGrama != null ? (
              <>
                <p className="flex items-baseline justify-between">
                  <span className="text-texto-suave">Chocolate esperado</span>
                  <span className="tabular-nums">{formatarReais(custoChocolate)}</span>
                </p>
                <p className="flex items-baseline justify-between">
                  <span className="text-texto-suave">Custo por grama</span>
                  <span className="tabular-nums">{formatarCustoUnidade(custoPorGrama, "g")}</span>
                </p>
                <p className="flex items-baseline justify-between">
                  <span className="text-texto-suave">Potinho de {formatarQuantidade(pesoPote ?? 0)} g (sem a embalagem)</span>
                  <span className="font-semibold tabular-nums">{formatarReais(custoPorGrama * (pesoPote ?? 0))}</span>
                </p>
                <p className="mt-1 text-xs text-texto-suave">
                  Uma fornada deve dar cerca de {formatarQuantidade(Math.floor(((pesoCubos ?? 0) + (pesoChocolate ?? 0)) / (pesoPote ?? 1)))} potinhos.
                </p>
              </>
            ) : pesoCompleto && !completo ? (
              <p className="text-alerta">Falta o preço de algum ingrediente: o custo fica incompleto.</p>
            ) : pesoCompleto && custoChocolate == null ? (
              <p className="text-alerta">O chocolate escolhido está sem preço. Cadastre em Mais → Insumos.</p>
            ) : (
              <p className="text-texto-suave">Preencha o chocolate, os pesos e a gramagem para ver o custo do potinho.</p>
            )}
          </div>
        </fieldset>
      ) : (
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
      )}
    </Formulario>
  );
}
