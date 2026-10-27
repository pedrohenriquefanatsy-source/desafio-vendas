import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Cartao, EstadoVazio, LinkBotao, Selo, TituloPagina, Valor } from "@/componentes/ui";
import { GraficoAcumulado, GraficoResultadoDia, TabelaDias } from "@/componentes/graficos-desafio";
import { formatarPercentual, formatarQuantidade, formatarReais } from "@/lib/numeros";
import { formatarData } from "@/lib/datas";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { NOMES_SITUACAO } from "@/servicos/desafios";
import { obterPainel } from "@/servicos/painel";

// Início (Seção 3.2): resultado e meta, caixa, a receber, pendências e gráficos de 7 dias.
// Cada número leva aos registros que o formam. Realizado, projeção e estimativa rotulados.
function Numero({ href, rotulo, children, apoio }: { href: string; rotulo: string; children: React.ReactNode; apoio?: string }) {
  return (
    <Link href={href} className="flex min-h-toque flex-col rounded-cartao border border-borda bg-superficie p-4">
      <span className="flex items-center justify-between text-sm text-texto-suave">
        {rotulo}
        <ChevronRight aria-hidden className="size-4" />
      </span>
      {children}
      {apoio ? <span className="mt-1 text-xs text-texto-suave">{apoio}</span> : null}
    </Link>
  );
}

export default async function Inicio() {
  const perfil = await exigirParticipante();
  const p = await obterPainel();
  const { desafio, meta: m } = p;

  if (!desafio || !m) {
    return (
      <>
        <TituloPagina>Início</TituloPagina>
        <EstadoVazio
          titulo="Nenhum desafio cadastrado"
          acao={ehAdmin(perfil) ? <LinkBotao href="/mais/desafios/novo">Cadastrar desafio</LinkBotao> : null}
        >
          {ehAdmin(perfil) ? "Cadastre o desafio com as datas e a meta para começar." : "O administrador ainda não cadastrou o desafio."}
        </EstadoVazio>
      </>
    );
  }

  const meta = m.meta_resultado == null ? null : Number(m.meta_resultado);
  const realizado = Number(m.realizado ?? 0);
  const pct = Math.max(0, Math.min(100, Number(m.percentual ?? 0)));
  const pendencias = [
    p.encomendas ? { href: "/vendas?ver=encomendas", texto: `${p.encomendas} ${p.encomendas === 1 ? "encomenda" : "encomendas"} para entregar` } : null,
    p.reembolsos > 0 ? { href: "/caixa/reembolsos", texto: `${formatarReais(p.reembolsos)} a reembolsar a participantes` } : null,
    p.abaixoMinimo ? { href: "/estoque?aba=insumos", texto: `${p.abaixoMinimo} ${p.abaixoMinimo === 1 ? "insumo abaixo" : "insumos abaixo"} do mínimo` } : null,
  ].filter((x): x is { href: string; texto: string } => x != null);

  return (
    <>
      <TituloPagina
        apoio={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatarData(m.inicio)} a {formatarData(m.fim)}
            <Selo tom={m.situacao === "em_andamento" ? "positivo" : "neutro"}>{m.situacao ? NOMES_SITUACAO[m.situacao] : "—"}</Selo>
          </span>
        }
      >
        {m.nome}
      </TituloPagina>

      <div className="flex flex-col gap-3">
        {/* 1. Resultado e meta */}
        <Link href="/caixa" className="block rounded-cartao border border-borda bg-superficie p-4">
          <span className="flex items-center justify-between text-sm text-texto-suave">
            Resultado <span className="text-xs">realizado</span>
          </span>
          <Valor valor={realizado} className={`text-3xl ${realizado < 0 ? "text-negativo" : ""}`} />
          {meta != null ? (
            <>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-fundo" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Quanto da meta já foi alcançado">
                <div className="h-full rounded-full bg-acao" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm">
                <span>{formatarPercentual(m.percentual)} da meta de {formatarReais(meta)}</span>
                <span className="text-texto-suave">falta {formatarReais(m.falta)}</span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-texto-suave">Meta ainda não definida.</p>
          )}
          {m.sem_custo ? <p className="mt-2 text-xs text-alerta">Há venda de produto sem custo cadastrado: o resultado está incompleto.</p> : null}
        </Link>

        {meta != null ? (
          <Cartao>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-xs text-texto-suave">Faltam (com hoje)</dt>
                <dd className="text-xl font-semibold tabular-nums">{m.dias_restantes} {m.dias_restantes === 1 ? "dia" : "dias"}</dd>
              </div>
              <div>
                <dt className="text-xs text-texto-suave">Ritmo necessário</dt>
                <dd className="text-xl font-semibold tabular-nums">{m.ritmo_necessario == null ? "—" : formatarReais(m.ritmo_necessario)}</dd>
                <dd className="text-xs text-texto-suave">por dia</dd>
              </div>
              <div>
                <dt className="text-xs text-texto-suave">Média até agora</dt>
                <dd className="text-xl font-semibold tabular-nums">{m.media_por_dia == null ? "—" : formatarReais(m.media_por_dia)}</dd>
                <dd className="text-xs text-texto-suave">por dia</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-borda pt-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Selo>projeção</Selo>
                {m.unidades_para_meta == null
                  ? "Ainda sem vendas para projetar."
                  : Number(m.unidades_para_meta) === 0
                    ? "Meta alcançada."
                    : `Faltam cerca de ${formatarQuantidade(m.unidades_para_meta)} unidades vendidas.`}
              </p>
              {m.unidades_para_meta != null && Number(m.unidades_para_meta) > 0 ? (
                <p className="mt-1 text-xs text-texto-suave">
                  Premissas: margem média de {formatarReais(m.mc_media_unidade)} por unidade, pelo mix vendido até agora ({formatarQuantidade(m.unidades_vendidas)} unidades);
                  sem novas despesas nem perdas. É uma conta, não uma promessa.
                </p>
              ) : null}
            </div>
            {m.meta_vendas != null ? (
              <p className="mt-3 border-t border-borda pt-3 text-sm">
                Vendas: {formatarReais(m.vendido)} de {formatarReais(m.meta_vendas)} ({formatarPercentual(m.percentual_vendas)})
              </p>
            ) : null}
          </Cartao>
        ) : null}

        {/* 2 e 3. Caixa e a receber */}
        <div className="grid grid-cols-2 gap-2">
          <Numero href="/caixa" rotulo="Saldo de caixa" apoio="Dinheiro na conta">
            <Valor valor={p.caixa} className={`text-xl ${p.caixa < 0 ? "text-negativo" : ""}`} />
          </Numero>
          <Numero href="/vendas?ver=a-receber" rotulo="A receber" apoio={`${p.contasAReceber} ${p.contasAReceber === 1 ? "venda" : "vendas"}`}>
            <Valor valor={p.aReceber} className="text-xl" />
          </Numero>
        </div>

        {/* 4. Pendências */}
        {pendencias.length ? (
          <Cartao className="p-0">
            <h2 className="px-4 pt-3 text-sm font-medium text-texto-suave">Pendências</h2>
            <ul className="divide-y divide-borda">
              {pendencias.map((x) => (
                <li key={x.href}>
                  <Link href={x.href} className="flex min-h-toque items-center justify-between gap-3 px-4 py-2">
                    <span>{x.texto}</span>
                    <ChevronRight aria-hidden className="size-4 text-texto-suave" />
                  </Link>
                </li>
              ))}
            </ul>
          </Cartao>
        ) : null}

        {/* 5. Gráficos */}
        {p.dias.length ? (
          <Cartao className="flex flex-col gap-4">
            <GraficoResultadoDia dias={p.dias} hoje={m.hoje ?? ""} />
            <GraficoAcumulado dias={p.dias} meta={meta} hoje={m.hoje ?? ""} />
            <TabelaDias dias={p.dias} />
          </Cartao>
        ) : null}

        <p className="text-xs text-texto-suave">
          Resultado = margem das vendas ({formatarReais(m.margem)}) − perdas ({formatarReais(m.perdas)}) − despesas ({formatarReais(m.despesas)}).
        </p>
      </div>
    </>
  );
}
