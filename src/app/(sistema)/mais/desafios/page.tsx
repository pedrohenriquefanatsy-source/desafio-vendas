import { Cartao, EstadoVazio, ItemLista, LinkBotao, Selo, TituloPagina } from "@/componentes/ui";
import { formatarData } from "@/lib/datas";
import { formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarDesafios, NOMES_SITUACAO } from "@/servicos/desafios";

export default async function Desafios() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const desafios = await listarDesafios();

  return (
    <>
      <TituloPagina apoio={admin ? "Toque num desafio para alterar datas, meta ou situação." : "Só o administrador altera."}>
        Desafio e meta
      </TituloPagina>
      {desafios.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum desafio cadastrado"
          acao={admin ? <LinkBotao href="/mais/desafios/novo">Cadastrar desafio</LinkBotao> : null}
        >
          {admin ? "Comece cadastrando o desafio." : "O administrador ainda não cadastrou o desafio."}
        </EstadoVazio>
      ) : (
        <>
          <Cartao className="divide-y divide-borda p-0">
            {desafios.map((d) => (
              <ItemLista
                key={d.id}
                href={`/mais/desafios/${d.id}`}
                titulo={d.nome}
                apoio={`${formatarData(d.inicio)} a ${formatarData(d.fim)} · Meta ${formatarReais(d.meta_resultado)}`}
                direita={
                  <Selo tom={d.situacao === "em_andamento" ? "positivo" : "neutro"}>
                    {d.situacao ? NOMES_SITUACAO[d.situacao] : "—"}
                  </Selo>
                }
              />
            ))}
          </Cartao>
          {admin ? (
            <LinkBotao href="/mais/desafios/novo" variante="secundario" className="mt-4 w-full">
              Cadastrar outro desafio
            </LinkBotao>
          ) : null}
        </>
      )}
    </>
  );
}
