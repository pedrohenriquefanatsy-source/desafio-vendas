import { notFound } from "next/navigation";
import { Cartao, Selo, TituloPagina, Valor } from "@/componentes/ui";
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
    </>
  );
}
