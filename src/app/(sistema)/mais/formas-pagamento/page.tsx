import { Cartao, Campo, Interruptor, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItemEditavel } from "@/componentes/item-editavel";
import { formatarPercentual } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarFormasPagamento } from "@/servicos/formas-pagamento";
import { adicionarFormaPagamento, salvarFormaPagamento } from "../acoes";

const DICA_TAXA = "Porcentagem que a maquininha ou o banco desconta. Pix normalmente é 0.";

export default async function FormasPagamento() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const formas = await listarFormasPagamento();

  return (
    <>
      <TituloPagina apoio="Todas entram no mesmo caixa (conta Pix única). A taxa entra no cálculo da margem.">
        Formas de pagamento
      </TituloPagina>

      <div className="flex flex-col gap-2">
        {formas.map((f) =>
          admin ? (
            <ItemEditavel
              key={f.id}
              titulo={f.nome}
              apoio={`Taxa ${formatarPercentual(f.taxa_percentual)}`}
              direita={f.ativa ? null : <Selo>Desativada</Selo>}
            >
              <Formulario acao={salvarFormaPagamento} textoBotao="Salvar" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={f.id} />
                <Campo id={`nome-${f.id}`} name="nome" rotulo="Nome" defaultValue={f.nome} required maxLength={40} />
                <Campo
                  id={`taxa-${f.id}`}
                  name="taxa"
                  rotulo="Taxa (%)"
                  inputMode="decimal"
                  defaultValue={String(f.taxa_percentual).replace(".", ",")}
                  dica={DICA_TAXA}
                />
                <Interruptor id={`ativa-${f.id}`} name="ativa" rotulo="Disponível nas vendas" defaultChecked={f.ativa} />
              </Formulario>
            </ItemEditavel>
          ) : (
            <Cartao key={f.id} className="flex items-center justify-between">
              <span>
                <span className="block font-medium">{f.nome}</span>
                <span className="text-sm text-texto-suave">Taxa {formatarPercentual(f.taxa_percentual)}</span>
              </span>
              {f.ativa ? null : <Selo>Desativada</Selo>}
            </Cartao>
          ),
        )}
      </div>

      {admin ? (
        <Cartao className="mt-6">
          <h2 className="mb-3 font-semibold">Adicionar forma de pagamento</h2>
          <Formulario acao={adicionarFormaPagamento} textoBotao="Adicionar" limparAoSalvar>
            <Campo id="nova-nome" name="nome" rotulo="Nome" placeholder="Ex.: Dinheiro, Cartão de crédito" required maxLength={40} />
            <Campo id="nova-taxa" name="taxa" rotulo="Taxa (%)" inputMode="decimal" placeholder="0" dica={DICA_TAXA} />
          </Formulario>
        </Cartao>
      ) : null}
    </>
  );
}
