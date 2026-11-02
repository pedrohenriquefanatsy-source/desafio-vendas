"use client";

import { useState } from "react";
import { Formulario } from "./formulario";
import { Selecao } from "./ui";
import { formatarQuantidade, formatarReais, lerNumero } from "@/lib/numeros";
import type { Resultado } from "@/servicos/erros";

// Acerto da pessoa: conta o que sobrou de cada sabor; o resto, que o sistema ainda acha que está com ela,
// foi vendido sem registro. Mostra a prévia (quantos potinhos e quanto dinheiro) antes de confirmar.
const campo = "min-h-toque w-24 rounded-xl border border-borda bg-superficie px-3 text-right text-base tabular-nums";

export type ItemAcerto = { id: string; nome: string; saldo: number; preco: number };

export function AcertoPessoa({
  itens,
  formas,
  formaPadrao,
  acao,
}: {
  itens: ItemAcerto[];
  formas: { id: string; nome: string }[];
  formaPadrao: string;
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
}) {
  const [sobrou, setSobrou] = useState<Record<string, string>>({});
  const linhas = itens.map((i) => {
    const bruto = sobrou[i.id] ?? "";
    const n = bruto === "" ? null : lerNumero(bruto);
    const vendido = n == null || n < 0 || n > i.saldo ? 0 : i.saldo - n;
    return { ...i, informado: n != null, vendido, invalido: n != null && (n < 0 || n > i.saldo) };
  });
  const unidades = linhas.reduce((t, l) => t + l.vendido, 0);
  const valor = linhas.reduce((t, l) => t + l.vendido * l.preco, 0);
  const algumPreenchido = linhas.some((l) => l.informado);

  return (
    <Formulario
      acao={acao}
      textoBotao={unidades > 0 ? `Registrar ${formatarQuantidade(unidades)} potinhos vendidos` : "Fazer o acerto"}
      textoEnviando="Fazendo o acerto…"
      desabilitado={!algumPreenchido}
    >
      <div className="divide-y divide-borda">
        {linhas.map((l) => (
          <label key={l.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block break-words font-medium">{l.nome}</span>
              <span className={`block text-xs ${l.invalido ? "text-negativo" : "text-texto-suave"}`}>
                {l.invalido
                  ? `Mais do que os ${formatarQuantidade(l.saldo)} que o sistema tem com você`
                  : `Com você no sistema: ${formatarQuantidade(l.saldo)}${l.informado ? ` · vendeu ${formatarQuantidade(l.vendido)}` : ""}`}
              </span>
            </span>
            <input
              name={`s_${l.id}`}
              inputMode="decimal"
              placeholder="sobrou"
              value={sobrou[l.id] ?? ""}
              onChange={(e) => setSobrou((s) => ({ ...s, [l.id]: e.target.value }))}
              aria-label={`Quanto sobrou de ${l.nome}`}
              className={campo}
            />
          </label>
        ))}
      </div>
      {unidades > 0 ? (
        <>
          <p className="rounded-xl bg-fundo px-3 py-2 text-sm">
            Sem registro: <span className="font-semibold">{formatarQuantidade(unidades)} potinhos</span>, cerca de{" "}
            <span className="font-semibold tabular-nums">{formatarReais(valor)}</span> pelo preço de tabela. Vira uma venda “Acerto”.
          </p>
          <Selecao id="forma_acerto" name="forma" rotulo="Como foi pago" defaultValue={formaPadrao}>
            {formas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>
        </>
      ) : null}
      <label className="flex min-h-toque items-center gap-3 text-sm">
        <input type="checkbox" name="devolver" value="1" className="size-5 accent-acao" />
        Devolvi o que sobrou ao estoque geral
      </label>
    </Formulario>
  );
}
