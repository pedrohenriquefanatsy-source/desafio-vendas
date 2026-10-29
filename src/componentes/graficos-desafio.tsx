import { formatarReais } from "@/lib/numeros";
import type { DiaDoDesafio } from "@/servicos/painel";

// Gráficos do desafio, pensados para poucos dias (Seção 4.6): um com o resultado de cada
// dia (barras) e outro com o acumulado contra a meta (linha). Um eixo por gráfico, marcas
// finas, grade discreta, rótulos só onde ajudam. Cada marca tem título (toque longo ou
// mouse) e há a mesma informação em tabela logo abaixo.

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

export function GraficoResultadoDia({ dias, hoje }: { dias: DiaDoDesafio[]; hoje: string }) {
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
            <g key={d.dia} tabIndex={0} aria-label={`${rotuloDia(d.dia)}: ${formatarReais(v)}`}>
              <title>{`${rotuloDia(d.dia)}: ${formatarReais(v)}`}</title>
              <rect x={M.esq + n * passo} y={M.topo} width={passo} height={alturaUtil} fill="transparent" />
              <path d={caminho} className={v < 0 ? "fill-negativo" : "fill-acao"} />
              {d === destaque || d.dia === hoje ? (
                <text x={cx} y={v >= 0 ? topo - 4 : topo + altura + 11} textAnchor="middle" className="fill-texto text-[10px] font-medium">
                  {reaisCurtos(v)}
                </text>
              ) : null}
              <text x={cx} y={A - 8} textAnchor="middle" className={`text-[10px] ${d.dia === hoje ? "fill-texto font-semibold" : "fill-texto-suave"}`}>
                {rotuloDia(d.dia)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function GraficoAcumulado({ dias, meta, hoje }: { dias: DiaDoDesafio[]; meta: number | null; hoje: string }) {
  const valores = dias.map((d) => d.acumulado ?? 0);
  const max = Math.max(0, meta ?? 0, ...valores) * 1.08 || 1;
  const min = Math.min(0, ...valores);
  const y = escala(min, max);
  const x = (n: number) => M.esq + 14 + n * ((larguraUtil - 28) / Math.max(dias.length - 1, 1));
  const pontos = dias.map((d, n) => ({ d, n })).filter((p) => p.d.acumulado != null);
  const ultimo = pontos.at(-1);

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
          <g key={p.d.dia} tabIndex={0} aria-label={`${rotuloDia(p.d.dia)}: acumulado ${formatarReais(p.d.acumulado ?? 0)}`}>
            <title>{`${rotuloDia(p.d.dia)}: acumulado ${formatarReais(p.d.acumulado ?? 0)}`}</title>
            <circle cx={x(p.n)} cy={y(p.d.acumulado ?? 0)} r={10} fill="transparent" />
            <circle cx={x(p.n)} cy={y(p.d.acumulado ?? 0)} r={4} className="fill-acao stroke-superficie" strokeWidth={2} />
          </g>
        ))}
        {ultimo ? (
          <text x={x(ultimo.n)} y={y(ultimo.d.acumulado ?? 0) - 9} textAnchor="middle" className="fill-texto text-[10px] font-medium">
            {reaisCurtos(ultimo.d.acumulado ?? 0)}
          </text>
        ) : null}
        {dias.map((d, n) => (
          <text key={d.dia} x={x(n)} y={A - 8} textAnchor="middle" className={`text-[10px] ${d.dia === hoje ? "fill-texto font-semibold" : "fill-texto-suave"}`}>
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
