"use client";

import { useState } from "react";
import { Formulario } from "./formulario";
import { formatarCustoUnidade, formatarQuantidade, formatarReais, lerNumero } from "@/lib/numeros";
import type { Resultado } from "@/servicos/erros";

const campo = "min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base";

// Concluir uma produção custeada por peso: pesa os cubos, molha no chocolate, pesa de novo.
// A diferença é o chocolate gasto (sai do estoque) e dá o custo real por grama da fornada.
// Quantos potinhos saíram é o que a pessoa digita; o peso só serve de conferência (sempre tem margem).
// As contas daqui são só prévia: o banco calcula e grava o custo oficial.
export function ConcluirPeso({
  acao,
  id,
  fornadas,
  previstas,
  gramagem,
  custoMassaFornada,
  custoCoberturaG,
  cobertura,
  textoPrevisto,
}: {
  acao: (anterior: Resultado | null, dados: FormData) => Promise<Resultado>;
  id: string;
  fornadas: number;
  previstas: number;
  gramagem: number;
  custoMassaFornada: number | null;
  custoCoberturaG: number | null;
  cobertura: string;
  textoPrevisto: string;
}) {
  const [cubos, setCubos] = useState("");
  const [final, setFinal] = useState("");
  const [boas, setBoas] = useState(String(previstas).replace(".", ","));

  const pc = lerNumero(cubos);
  const pf = lerNumero(final);
  const qb = lerNumero(boas);
  const pesagemOk = pc != null && pf != null && pc > 0 && pf > pc;
  const chocolate = pesagemOk ? pf - pc : null;
  const custoChocolate = chocolate != null && custoCoberturaG != null ? chocolate * custoCoberturaG : null;
  const custoMassa = custoMassaFornada != null ? custoMassaFornada * fornadas : null;
  const custoPorGrama = pesagemOk && custoMassa != null && custoChocolate != null ? (custoMassa + custoChocolate) / pf : null;
  const comporta = pesagemOk ? Math.floor(pf / gramagem) : null;
  const diferente = comporta != null && qb != null && comporta > 0 && Math.abs(qb - comporta) / comporta > 0.1;

  return (
    <Formulario acao={acao} textoBotao="Concluir produção" textoEnviando="Conferindo insumos…" className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-texto-suave">{textoPrevisto}</p>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`pc-${id}-cubos`} className="flex flex-col gap-1 text-sm font-medium">
          Peso dos cubos (g)
          <input id={`pc-${id}-cubos`} name="peso_cubos" inputMode="decimal" value={cubos} onChange={(e) => setCubos(e.target.value)} placeholder="Ex.: 3800" required className={campo} />
        </label>
        <label htmlFor={`pc-${id}-final`} className="flex flex-col gap-1 text-sm font-medium">
          Peso com o chocolate (g)
          <input id={`pc-${id}-final`} name="peso_final" inputMode="decimal" value={final} onChange={(e) => setFinal(e.target.value)} placeholder="Ex.: 5200" required className={campo} />
        </label>
      </div>
      <div className="rounded-xl bg-fundo px-3 py-2 text-sm" aria-live="polite">
        {pesagemOk ? (
          <>
            <p className="flex items-baseline justify-between">
              <span className="text-texto-suave">Chocolate gasto</span>
              <span className="tabular-nums">
                {formatarQuantidade(chocolate ?? 0)} g{custoChocolate != null ? ` · ${formatarReais(custoChocolate)}` : ""}
              </span>
            </p>
            {custoPorGrama != null ? (
              <>
                <p className="flex items-baseline justify-between">
                  <span className="text-texto-suave">Custo por grama desta fornada</span>
                  <span className="tabular-nums">{formatarCustoUnidade(custoPorGrama, "g")}</span>
                </p>
                <p className="flex items-baseline justify-between">
                  <span className="text-texto-suave">Potinho de {formatarQuantidade(gramagem)} g (sem a embalagem)</span>
                  <span className="font-semibold tabular-nums">{formatarReais(custoPorGrama * gramagem)}</span>
                </p>
              </>
            ) : (
              <p className="text-alerta">Falta o preço de algum ingrediente ou do chocolate: o custo não fecha. Preencha em Mais → Insumos.</p>
            )}
            <p className="mt-1 text-xs text-texto-suave">Chocolate: {cobertura}.</p>
            <p className="text-xs text-texto-suave">O peso comporta cerca de {formatarQuantidade(comporta ?? 0)} potinhos de {formatarQuantidade(gramagem)} g.</p>
          </>
        ) : pc != null && pf != null ? (
          <p className="text-alerta">O peso com o chocolate precisa ser maior que o peso dos cubos. Confira as duas pesagens.</p>
        ) : (
          <p className="text-texto-suave">Pese os cubos, molhe no chocolate, espere esfriar e pese de novo. O sistema calcula o chocolate gasto.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`boas-${id}`} className="flex flex-col gap-1 text-sm font-medium">
          Potinhos prontos
          <input id={`boas-${id}`} name="boas" inputMode="decimal" value={boas} onChange={(e) => setBoas(e.target.value)} required className={campo} />
        </label>
        <label htmlFor={`perdidas-${id}`} className="flex flex-col gap-1 text-sm font-medium">
          Perdidos (opcional)
          <input id={`perdidas-${id}`} name="perdidas" inputMode="decimal" placeholder="0" className={campo} />
        </label>
      </div>
      {diferente ? (
        <p className="text-xs text-alerta">Você informou {formatarQuantidade(qb ?? 0)} potinhos, mas o peso comporta cerca de {formatarQuantidade(comporta ?? 0)}. Confira; se estiver certo, pode concluir.</p>
      ) : null}
      <p className="text-xs text-texto-suave">
        Ao concluir, a massa e o chocolate gasto saem do estoque, a embalagem baixa pelos potinhos prontos e eles entram como produto pronto.
      </p>
    </Formulario>
  );
}
