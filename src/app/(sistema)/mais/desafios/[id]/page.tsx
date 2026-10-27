import { notFound } from "next/navigation";
import { Campo, Cartao, Selo, TituloPagina, Valor } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { listarCustosVariacoes } from "@/servicos/catalogo";
import { listarDemandas } from "@/servicos/painel";
import { salvarDemanda } from "../../acoes";
import { formatarData } from "@/lib/datas";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { NOMES_SITUACAO, obterDesafio } from "@/servicos/desafios";
import { FormularioDesafio } from "../formulario-desafio";

export default async function Desafio({ params }: PageProps<"/mais/desafios/[id]">) {
  const { id } = await params;
  const perfil = await exigirParticipante();
  const desafio = /^[0-9a-f-]{36}$/i.test(id) ? await obterDesafio(id) : null;
  if (!desafio) notFound();

  if (!ehAdmin(perfil)) {
    return (
      <>
        <TituloPagina apoio="Só o administrador altera.">{desafio.nome}</TituloPagina>
        <Cartao>
          <dl className="flex flex-col gap-2">
            <div className="flex justify-between"><dt className="text-texto-suave">Período</dt><dd>{formatarData(desafio.inicio)} a {formatarData(desafio.fim)}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-suave">Meta de resultado</dt><dd>{desafio.meta_resultado != null ? <Valor valor={desafio.meta_resultado} /> : "Não definida"}</dd></div>
            <div className="flex justify-between"><dt className="text-texto-suave">Situação</dt><dd><Selo>{desafio.situacao ? NOMES_SITUACAO[desafio.situacao] : "—"}</Selo></dd></div>
          </dl>
        </Cartao>
      </>
    );
  }

  return (
    <>
      <TituloPagina apoio="Mudanças na meta ficam registradas na auditoria.">Alterar desafio</TituloPagina>
      <Cartao>
        <FormularioDesafio desafio={desafio} />
      </Cartao>
      <DemandaEstimada desafioId={desafio.id ?? ""} />
    </>
  );
}

// Demanda estimada por produto: usada na cobertura de estoque enquanto o desafio tem
// menos de 2 dias com venda. A tela de estoque mostra o resultado como "estimativa".
async function DemandaEstimada({ desafioId }: { desafioId: string }) {
  const [variacoes, demandas] = await Promise.all([listarCustosVariacoes(), listarDemandas(desafioId)]);
  const produtos = variacoes.filter((v) => v.ativa && v.tipo === "simples");
  const porVariacao = new Map(demandas.map((d) => [d.variacao_id, d.unidades_por_dia]));
  if (produtos.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="font-semibold">Demanda estimada</h2>
      <p className="mb-3 text-sm text-texto-suave">
        Quantas unidades de cada produto vocês esperam vender por dia. Serve para calcular para quantos dias o estoque dá,
        até haver 2 dias com venda (depois disso vale a média real).
      </p>
      <div className="flex flex-col gap-2">
        {produtos.map((v) => (
          <Cartao key={v.variacao_id}>
            <Formulario acao={salvarDemanda} textoBotao="Salvar" variante="secundario" className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-2">
              <input type="hidden" name="desafio_id" value={desafioId} />
              <input type="hidden" name="variacao_id" value={v.variacao_id ?? ""} />
              <Campo
                id={`demanda-${v.variacao_id}`}
                name="unidades"
                rotulo={`${v.variacao === "Única" ? v.produto : `${v.produto} · ${v.variacao}`} (por dia)`}
                inputMode="decimal"
                defaultValue={porVariacao.has(v.variacao_id ?? "") ? String(porVariacao.get(v.variacao_id ?? "")).replace(".", ",") : ""}
                placeholder="—"
              />
            </Formulario>
          </Cartao>
        ))}
      </div>
    </section>
  );
}
