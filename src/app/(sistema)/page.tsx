import { Cartao, EstadoVazio, LinkBotao, Selo, TituloPagina, Valor } from "@/componentes/ui";
import { formatarData } from "@/lib/datas";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { NOMES_SITUACAO, obterDesafioAtual } from "@/servicos/desafios";

// Início. O painel completo (resultado, caixa, a receber, gráficos) chega na fatia 6.
export default async function Inicio() {
  const perfil = await exigirParticipante();
  const desafio = await obterDesafioAtual();

  if (!desafio) {
    return (
      <>
        <TituloPagina>Início</TituloPagina>
        <EstadoVazio
          titulo="Nenhum desafio cadastrado"
          acao={ehAdmin(perfil) ? <LinkBotao href="/mais/desafios/novo">Cadastrar desafio</LinkBotao> : null}
        >
          {ehAdmin(perfil)
            ? "Cadastre o desafio com as datas e a meta para começar."
            : "O administrador ainda não cadastrou o desafio."}
        </EstadoVazio>
      </>
    );
  }

  return (
    <>
      <TituloPagina apoio={`${formatarData(desafio.inicio)} a ${formatarData(desafio.fim)}`}>
        {desafio.nome}
      </TituloPagina>
      <div className="flex flex-col gap-3">
        <Cartao>
          <div className="flex items-center justify-between">
            <span className="text-sm text-texto-suave">Situação</span>
            <Selo tom={desafio.situacao === "em_andamento" ? "positivo" : "neutro"}>
              {desafio.situacao ? NOMES_SITUACAO[desafio.situacao] : "—"}
            </Selo>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-texto-suave">Dias no total</dt>
              <dd className="text-xl font-semibold tabular-nums">{desafio.dias_total}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Já passaram</dt>
              <dd className="text-xl font-semibold tabular-nums">{desafio.dias_decorridos}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Faltam (com hoje)</dt>
              <dd className="text-xl font-semibold tabular-nums">{desafio.dias_restantes}</dd>
            </div>
          </dl>
        </Cartao>
        <Cartao>
          <p className="text-sm text-texto-suave">Meta de resultado</p>
          {desafio.meta_resultado != null ? (
            <Valor valor={desafio.meta_resultado} className="text-2xl" />
          ) : (
            <p className="mt-1">Ainda não definida.</p>
          )}
          <p className="mt-2 text-xs text-texto-suave">
            O realizado, quanto falta e o ritmo por dia aparecem aqui quando as vendas forem lançadas.
          </p>
        </Cartao>
      </div>
    </>
  );
}
