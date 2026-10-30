import { Campo, Cartao, TituloPagina, Valor, BotaoVoltar } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { saldoCaixa } from "@/servicos/caixa";
import { ajustarCaixa } from "../acoes";

// Conferência do caixa (só o administrador): informa o saldo real (extrato do Pix) e o
// banco lança a diferença como ajuste, com motivo. Não entra no resultado.
export default async function Ajuste() {
  const perfil = await exigirParticipante();
  const { saldo } = await saldoCaixa();

  return (
    <>
      <BotaoVoltar href="/caixa">Caixa</BotaoVoltar>
      <TituloPagina apoio="Compare com o extrato da conta Pix. Se não bater, lance a diferença com o motivo.">
        Conferir o saldo
      </TituloPagina>
      <Cartao className="mb-4">
        <p className="text-sm text-texto-suave">Saldo pelo sistema</p>
        <Valor valor={saldo} className="text-2xl" />
      </Cartao>
      {ehAdmin(perfil) ? (
        <Cartao>
          <Formulario acao={ajustarCaixa} textoBotao="Salvar conferência" limparAoSalvar>
            <Campo id="saldo" name="saldo" rotulo="Saldo real na conta (R$)" inputMode="decimal" placeholder="0,00" required />
            <Campo id="justificativa" name="justificativa" rotulo="Motivo" placeholder="Ex.: conferência com o extrato do Pix" required maxLength={200} />
            <p className="text-xs text-texto-suave">O ajuste muda o saldo de caixa, não o faturamento. Fica no livro de caixa com o motivo.</p>
          </Formulario>
        </Cartao>
      ) : (
        <p className="text-sm text-texto-suave">Quem ajusta o caixa é o administrador.</p>
      )}
    </>
  );
}
