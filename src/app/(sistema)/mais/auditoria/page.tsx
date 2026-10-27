import Link from "next/link";
import { Cartao, EstadoVazio, LinkBotao, Selo, TituloPagina, classeBotao } from "@/componentes/ui";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarDataHora } from "@/lib/datas";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { listarParticipantes } from "@/servicos/participantes";
import { NOMES_ACAO, NOMES_TABELA, listarAuditoria, mudancas } from "@/servicos/auditoria";

// Auditoria (só o administrador): quem incluiu, alterou ou cancelou o quê, e quando,
// com o valor anterior e o novo. Nada aqui pode ser editado.
export default async function Auditoria({ searchParams }: PageProps<"/mais/auditoria">) {
  const perfil = await exigirParticipante();
  if (!ehAdmin(perfil)) {
    return (
      <>
        <TituloPagina>Auditoria</TituloPagina>
        <EstadoVazio titulo="Só o administrador vê a auditoria">Peça ao administrador se precisar conferir uma alteração.</EstadoVazio>
      </>
    );
  }
  const busca = await searchParams;
  const tabela = typeof busca.tabela === "string" && busca.tabela in NOMES_TABELA ? busca.tabela : undefined;
  const antesDe = typeof busca.antes === "string" && /^\d+$/.test(busca.antes) ? Number(busca.antes) : undefined;
  const [registros, pessoas] = await Promise.all([listarAuditoria({ tabela, antesDe }), listarParticipantes()]);
  const nome = new Map(pessoas.map((p) => [p.id, p.nome ?? "Sem nome"]));
  const proxima = registros.length === 50 ? registros.at(-1)?.id : undefined;

  return (
    <>
      <Link href="/mais" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Mais
      </Link>
      <TituloPagina apoio="Tudo o que foi incluído, alterado ou cancelado, com o antes e o depois. Gravado pelo banco; ninguém edita.">
        Auditoria
      </TituloPagina>
      <form method="get" className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="sr-only" htmlFor="tabela">
          Mostrar
        </label>
        <select id="tabela" name="tabela" defaultValue={tabela ?? ""} className="min-h-toque w-full rounded-xl border border-borda bg-superficie px-3 text-base">
          <option value="">Tudo</option>
          {Object.entries(NOMES_TABELA).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        <button type="submit" className={classeBotao("secundario")}>
          Filtrar
        </button>
      </form>

      {registros.length === 0 ? (
        <EstadoVazio titulo="Nada registrado">Nenhuma alteração {tabela ? "nesta parte" : "ainda"}.</EstadoVazio>
      ) : (
        <div className="flex flex-col gap-2">
          {registros.map((r) => {
            const lista = mudancas(r);
            const cancelou = r.acao === "alteracao" && lista.some((m) => m.campo === "situacao" && m.depois === "cancelada");
            return (
              <ItemEditavel
                key={r.id}
                titulo={`${cancelou ? "Cancelou" : NOMES_ACAO[r.acao] ?? r.acao} · ${NOMES_TABELA[r.tabela] ?? r.tabela}`}
                apoio={`${formatarDataHora(r.em)} · ${nome.get(r.usuario_id ?? "") ?? "sistema"}`}
                direita={cancelou ? <Selo tom="negativo">Cancelamento</Selo> : r.acao === "exclusao" ? <Selo tom="alerta">Exclusão</Selo> : null}
              >
                <p className="mb-2 break-all text-xs text-texto-suave">Registro {r.registro_id}</p>
                {lista.length === 0 ? (
                  <p className="text-sm text-texto-suave">Sem mudança visível.</p>
                ) : (
                  <dl className="flex flex-col gap-2 text-sm">
                    {lista.map((m) => (
                      <div key={m.campo} className="rounded-xl border border-borda p-2">
                        <dt className="font-medium">{m.campo}</dt>
                        {r.acao === "alteracao" ? (
                          <dd className="break-words">
                            <span className="text-texto-suave line-through decoration-1">{m.antes}</span> → {m.depois}
                          </dd>
                        ) : (
                          <dd className="break-words">{r.acao === "exclusao" ? m.antes : m.depois}</dd>
                        )}
                      </div>
                    ))}
                  </dl>
                )}
              </ItemEditavel>
            );
          })}
          {proxima ? (
            <LinkBotao href={`/mais/auditoria?${new URLSearchParams({ ...(tabela ? { tabela } : {}), antes: String(proxima) })}`} variante="secundario">
              Ver mais antigos
            </LinkBotao>
          ) : null}
        </div>
      )}
      <Cartao className="mt-6">
        <p className="text-xs text-texto-suave">
          Vendas, recebimentos, compras, despesas, reembolsos, aportes, caixa, estoque, produção, preços, receitas,
          produtos, metas e participantes entram aqui automaticamente.
        </p>
      </Cartao>
    </>
  );
}
