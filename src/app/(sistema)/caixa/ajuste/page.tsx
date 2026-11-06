import { Campo, Cartao, TituloPagina, Valor, BotaoVoltar } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ehAdmin, exigirParticipante } from "@/servicos/sessao";
import { saldoCaixa } from "@/servicos/caixa";
import { ajustarCaixa, ajustarDinheiro } from "../acoes";
import { formatarReais } from "@/lib/numeros";

// Conferência do caixa (só o administrador): informa o saldo real (extrato do Pix) e o
// banco lança a diferença como ajuste, com motivo. Não entra no resultado.
export default async function Ajuste() {
  const perfil = await exigirParticipante();
  const { saldo, banco, dinheiroVivo } = await saldoCaixa();

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
        <div className="flex flex-col gap-4">
        <Cartao>
          <h2 className="mb-1 font-semibold">Dinheiro vivo</h2>
          <p className="mb-3 text-sm text-texto-suave">
            Pelo sistema: {formatarReais(dinheiroVivo)} em dinheiro vivo e {formatarReais(banco)} no Pix / banco. Conte o dinheiro e informe aqui. Se
            você depositou no banco, é só informar o que sobrou na mão.
          </p>
          <Formulario acao={ajustarDinheiro} textoBotao="Salvar dinheiro vivo" limparAoSalvar>
            <Campo id="contado" name="contado" rotulo="Dinheiro vivo contado (R$)" inputMode="decimal" placeholder="0,00" required />
            <Campo id="motivo" name="motivo" rotulo="Motivo" placeholder="Ex.: contei o dinheiro" required maxLength={200} />
            <p className="text-xs text-texto-suave">Muda só a divisão entre dinheiro vivo e banco; o saldo total continua o mesmo.</p>
          </Formulario>
        </Cartao>
        <Cartao>
          <h2 className="mb-3 font-semibold">Saldo total</h2>
          <Formulario acao={ajustarCaixa} textoBotao="Salvar conferência" limparAoSalvar>
            <Campo id="saldo" name="saldo" rotulo="Saldo real na conta (R$)" inputMode="decimal" placeholder="0,00" required />
            <Campo id="justificativa" name="justificativa" rotulo="Motivo" placeholder="Ex.: conferência com o extrato do Pix" required maxLength={200} />
            <p className="text-xs text-texto-suave">O ajuste muda o saldo de caixa, não o faturamento. Fica no livro de caixa com o motivo.</p>
          </Formulario>
        </Cartao>
        </div>
      ) : (
        <p className="text-sm text-texto-suave">Quem ajusta o caixa é o administrador.</p>
      )}
    </>
  );
}
