"use client";

import { useState } from "react";
import { formatarReais } from "@/lib/numeros";
import type { DiaDoDesafio } from "@/servicos/painel";

// Gráficos do desafio, pensados para poucos dias (Seção 4.6): um com o resultado de cada
// dia (barras) e outro com o acumulado contra a meta (linha). Um eixo por gráfico, marcas
// finas, grade discreta, rótulos só onde ajudam. Tocar num dia (em qualquer gráfico) mostra
// o número dele nos dois e no quadro de cima; a mesma informação está em tabela logo abaixo.

const L = 343;
const A = 150;
const M = { topo: 16, base: 28, esq: 8, dir: 8 };
const larguraUtil = L - M.esq - M.dir;
const alturaUtil = A - M.topo - M.base;
const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

const rotuloDia = (iso: string) => `${semana.format(new Date(`${iso}T12:00:00Z`)).replace(".", "")} ${iso.slice(8, 10)}`;
const reaisCurtos = (v: number) => formatarReais(v).replace(/,00$/, "");

// Posição vertical de um valor, com o maior no topo.
function escala(min: number, max: number) {
  return (v: number) => M.topo + ((max - v) / (max - min || 1)) * alturaUtil;
}

type Escolha = { selecionado: string | null; aoEscolher: (dia: string) => void };

// Os dois gráficos e a tabela, com o dia escolhido em comum (começa em hoje).
export function GraficosDesafio({ dias, meta, hoje }: { dias: DiaDoDesafio[]; meta: number | null; hoje: string }) {
  const comValor = dias.filter((d) => d.resultado != null);
  const [selecionado, setSelecionado] = useState<string | null>(
    comValor.some((d) => d.dia === hoje) ? hoje : (comValor.at(-1)?.dia ?? null),
  );
  const dia = dias.find((d) => d.dia === selecionado);
  return (
    <>
      <p aria-live="polite" className="rounded-xl bg-fundo px-3 py-2 text-sm">
        {dia ? (
          <>
            <span className="font-semibold">{rotuloDia(dia.dia)}</span> · faturamento <span className="font-semibold tabular-nums">{formatarReais(dia.resultado ?? 0)}</span> ·
            acumulado <span className="font-semibold tabular-nums">{formatarReais(dia.acumulado ?? 0)}</span>
          </>
        ) : (
          "Toque num dia do gráfico para ver os números."
        )}
      </p>
      <GraficoResultadoDia dias={dias} hoje={hoje} selecionado={selecionado} aoEscolher={setSelecionado} />
      <GraficoAcumulado dias={dias} meta={meta} hoje={hoje} selecionado={selecionado} aoEscolher={setSelecionado} />
      <TabelaDias dias={dias} />
    </>
  );
}

const alvo = (dia: string, aoEscolher: (dia: string) => void) => ({
  tabIndex: 0,
  role: "button",
  className: "cursor-pointer outline-none",
  onClick: () => aoEscolher(dia),
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      aoEscolher(dia);
    }
  },
});

export function GraficoResultadoDia({ dias, hoje, selecionado, aoEscolher }: { dias: DiaDoDesafio[]; hoje: string } & Escolha) {
  const valores = dias.map((d) => d.resultado ?? 0);
  const max = Math.max(0, ...valores);
  const min = Math.min(0, ...valores);
  const y = escala(min, max === min ? max + 1 : max);
  const passo = larguraUtil / Math.max(dias.length, 1);
  const largura = Math.min(28, passo - 6);
  const zero = y(0);
  const destaque = dias.filter((d) => d.resultado != null).reduce<DiaDoDesafio | null>((a, d) => (!a || Math.abs(d.resultado ?? 0) > Math.abs(a.resultado ?? 0) ? d : a), null);

  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium">Faturamento de cada dia</figcaption>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Faturamento por dia do desafio">
        <line x1={M.esq} x2={L - M.dir} y1={zero} y2={zero} className="stroke-borda" strokeWidth={1} />
        {dias.map((d, n) => {
          const x = M.esq + n * passo + (passo - largura) / 2;
          const v = d.resultado;
          const cx = M.esq + n * passo + passo / 2;
          if (v == null) {
            return (
              <text key={d.dia} x={cx} y={A - 8} textAnchor="middle" className="fill-texto-suave text-[10px]">
                {rotuloDia(d.dia)}
              </text>
            );
          }
          const topo = Math.min(y(v), zero);
          const altura = Math.max(Math.abs(y(v) - zero), v === 0 ? 0 : 2);
          const r = Math.min(4, altura);
          // Ponta arredondada só na extremidade do dado; a base fica reta, presa ao zero.
          const caminho =
            v >= 0
              ? `M${x},${zero} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + largura - r} Q${x + largura},${topo} ${x + largura},${topo + r} V${zero} Z`
              : `M${x},${zero} V${topo + altura - r} Q${x},${topo + altura} ${x + r},${topo + altura} H${x + largura - r} Q${x + largura},${topo + altura} ${x + largura},${topo + altura - r} V${zero} Z`;
          return (
            <g key={d.dia} {...alvo(d.dia, aoEscolher)} aria-pressed={d.dia === selecionado} aria-label={`${rotuloDia(d.dia)}: ${formatarReais(v)}`}>
              <title>{`${rotuloDia(d.dia)}: ${formatarReais(v)}`}</title>
              <rect x={M.esq + n * passo} y={M.topo} width={passo} height={alturaUtil} fill="transparent" />
              <path d={caminho} className={v < 0 ? "fill-negativo" : d.dia === selecionado ? "fill-acento" : "fill-acao"} />
              {d === destaque || d.dia === selecionado ? (
                <text x={cx} y={v >= 0 ? topo - 4 : topo + altura + 11} textAnchor="middle" className="fill-texto text-[10px] font-medium">
                  {reaisCurtos(v)}
                </text>
              ) : null}
              <text x={cx} y={A - 8} textAnchor="middle" className={`text-[10px] ${d.dia === hoje || d.dia === selecionado ? "fill-texto font-semibold" : "fill-texto-suave"}`}>
                {rotuloDia(d.dia)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function GraficoAcumulado({ dias, meta, hoje, selecionado, aoEscolher }: { dias: DiaDoDesafio[]; meta: number | null; hoje: string } & Escolha) {
  const valores = dias.map((d) => d.acumulado ?? 0);
  const max = Math.max(0, meta ?? 0, ...valores) * 1.08 || 1;
  const min = Math.min(0, ...valores);
  const y = escala(min, max);
  const x = (n: number) => M.esq + 14 + n * ((larguraUtil - 28) / Math.max(dias.length - 1, 1));
  const pontos = dias.map((d, n) => ({ d, n })).filter((p) => p.d.acumulado != null);
  const ultimo = pontos.at(-1);
  const escolhido = pontos.find((p) => p.d.dia === selecionado);

  return (
    <figure>
      <figcaption className="mb-1 text-sm font-medium">
        Acumulado <span className="text-texto-suave">contra a meta</span>
      </figcaption>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Faturamento acumulado do desafio comparado com a meta">
        <line x1={M.esq} x2={L - M.dir} y1={y(0)} y2={y(0)} className="stroke-borda" strokeWidth={1} />
        {meta != null ? (
          <g>
            <line x1={M.esq} x2={L - M.dir} y1={y(meta)} y2={y(meta)} className="stroke-texto-suave" strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={L - M.dir} y={y(meta) - 4} textAnchor="end" className="fill-texto-suave text-[10px]">
              meta {reaisCurtos(meta)}
            </text>
          </g>
        ) : null}
        {pontos.length > 1 ? (
          <polyline
            points={pontos.map((p) => `${x(p.n)},${y(p.d.acumulado ?? 0)}`).join(" ")}
            fill="none"
            className="stroke-acao"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ) : null}
        {pontos.map((p) => (
          <g key={p.d.dia} {...alvo(p.d.dia, aoEscolher)} aria-pressed={p.d.dia === selecionado} aria-label={`${rotuloDia(p.d.dia)}: acumulado ${formatarReais(p.d.acumulado ?? 0)}`}>
            <title>{`${rotuloDia(p.d.dia)}: acumulado ${formatarReais(p.d.acumulado ?? 0)}`}</title>
            <rect x={x(p.n) - 14} y={M.topo} width={28} height={alturaUtil} fill="transparent" />
            <circle
              cx={x(p.n)}
              cy={y(p.d.acumulado ?? 0)}
              r={p.d.dia === selecionado ? 6 : 4}
              className={`${p.d.dia === selecionado ? "fill-acento" : "fill-acao"} stroke-superficie`}
              strokeWidth={2}
            />
          </g>
        ))}
        {escolhido && escolhido !== ultimo ? (
          <text x={x(escolhido.n)} y={y(escolhido.d.acumulado ?? 0) - 10} textAnchor="middle" className="fill-texto text-[10px] font-medium">
            {reaisCurtos(escolhido.d.acumulado ?? 0)}
          </text>
        ) : null}
        {ultimo ? (
          <text x={x(ultimo.n)} y={y(ultimo.d.acumulado ?? 0) - 9} textAnchor="middle" className="fill-texto text-[10px] font-medium">
            {reaisCurtos(ultimo.d.acumulado ?? 0)}
          </text>
        ) : null}
        {dias.map((d, n) => (
          <text key={d.dia} x={x(n)} y={A - 8} textAnchor="middle" className={`text-[10px] ${d.dia === hoje || d.dia === selecionado ? "fill-texto font-semibold" : "fill-texto-suave"}`}>
            {rotuloDia(d.dia)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

export function TabelaDias({ dias }: { dias: DiaDoDesafio[] }) {
  return (
    <details className="mt-2">
      <summary className="flex min-h-toque cursor-pointer list-none items-center text-sm font-medium text-acao [&::-webkit-details-marker]:hidden">
        Ver em tabela
      </summary>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-texto-suave">
            <th className="py-1 font-normal">Dia</th>
            <th className="py-1 text-right font-normal">Faturamento</th>
            <th className="py-1 text-right font-normal">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia} className="border-t border-borda">
              <td className="py-1">{rotuloDia(d.dia)}</td>
              <td className="py-1 text-right">{d.resultado == null ? "—" : formatarReais(d.resultado)}</td>
              <td className="py-1 text-right">{d.acumulado == null ? "—" : formatarReais(d.acumulado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
