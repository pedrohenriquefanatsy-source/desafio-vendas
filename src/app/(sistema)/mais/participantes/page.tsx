import { Cartao, Campo, Interruptor, Selecao, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarParticipantes, NOMES_PAPEL } from "@/servicos/participantes";
import { salvarParticipante } from "../acoes";

export default async function Participantes() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const participantes = await listarParticipantes();
  const aguardando = participantes.filter((p) => !p.ativo).length;

  return (
    <>
      <TituloPagina
        apoio={
          admin && aguardando
            ? `${aguardando} aguardando ativação. Quem é novo só acessa depois que você ativa.`
            : "Quem participa do desafio."
        }
      >
        Participantes
      </TituloPagina>

      <div className="flex flex-col gap-2">
        {participantes.map((p) =>
          admin ? (
            <ItemEditavel
              key={p.id}
              aberto={!p.ativo}
              titulo={`${p.nome ?? "Sem nome ainda"}${p.id === perfil.id ? " (você)" : ""}`}
              apoio={NOMES_PAPEL[p.papel]}
              direita={p.ativo ? <Selo tom="positivo">Ativo</Selo> : <Selo tom="alerta">Aguardando</Selo>}
            >
              <Formulario acao={salvarParticipante} textoBotao="Salvar" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={p.id} />
                <Campo id={`nome-${p.id}`} name="nome" rotulo="Nome" defaultValue={p.nome ?? ""} maxLength={60} />
                <Selecao id={`papel-${p.id}`} name="papel" rotulo="Papel" defaultValue={p.papel}>
                  <option value="membro">{NOMES_PAPEL.membro}</option>
                  <option value="administrador">{NOMES_PAPEL.administrador}</option>
                </Selecao>
                <Interruptor id={`ativo-${p.id}`} name="ativo" rotulo="Acesso liberado" defaultChecked={p.ativo} />
              </Formulario>
            </ItemEditavel>
          ) : (
            <Cartao key={p.id} className="flex items-center justify-between">
              <span className="font-medium">{p.nome ?? "Sem nome ainda"}</span>
              <Selo>{NOMES_PAPEL[p.papel]}</Selo>
            </Cartao>
          ),
        )}
      </div>

      {admin ? (
        <Cartao className="mt-6">
          <h2 className="font-semibold">Como adicionar alguém</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-texto-suave">
            <li>No painel do Supabase, abra Authentication → Users → Add user → Create new user.</li>
            <li>Informe o e-mail e uma senha, e marque “Auto Confirm User”.</li>
            <li>A pessoa aparece aqui como “Aguardando”. Ative o acesso e salve.</li>
          </ol>
        </Cartao>
      ) : null}
    </>
  );
}
