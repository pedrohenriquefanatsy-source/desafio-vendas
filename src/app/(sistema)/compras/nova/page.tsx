import Link from "next/link";
import { Campo, Cartao, EstadoVazio, LinkBotao, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { ItensCompra } from "@/componentes/itens-compra";
import { hojeIso } from "@/lib/datas";
import { opcoesInsumo } from "@/lib/opcoes-insumo";
import { exigirParticipante } from "@/servicos/sessao";
import { listarInsumos, unidadesPorInsumo } from "@/servicos/catalogo";
import { registrarCompra } from "../../estoque/acoes";

// Nova compra. Pode vir preenchida pela lista de compras ou pela falta de insumo
// na produção: /compras/nova?insumo=<id>&quantidade=395&insumo=<id>&quantidade=18
export default async function NovaCompra({ searchParams }: PageProps<"/compras/nova">) {
  await exigirParticipante();
  const busca = await searchParams;
  const comoLista = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const ids = comoLista(busca.insumo);
  const quantidades = comoLista(busca.quantidade);
  const iniciais = ids.map((id, n) => ({ insumo_id: id, quantidade: (quantidades[n] ?? "").replace(".", ",") }));
  const [insumos, unidades] = await Promise.all([listarInsumos(), unidadesPorInsumo()]);
  const opcoes = opcoesInsumo(insumos, unidades);

  return (
    <>
      <Link href="/compras" className="mb-2 inline-flex min-h-toque items-center text-sm text-texto-suave">
        ← Compras
      </Link>
      <TituloPagina apoio="Entra no estoque e o preço do insumo passa a ser o desta compra.">Nova compra</TituloPagina>
      {opcoes.length === 0 ? (
        <EstadoVazio titulo="Nenhum insumo cadastrado" acao={<LinkBotao href="/mais/insumos" variante="secundario">Ir para Insumos</LinkBotao>}>
          Cadastre os insumos antes de registrar compras.
        </EstadoVazio>
      ) : (
        <Formulario acao={registrarCompra} textoBotao="Registrar compra" textoEnviando="Registrando…">
          <ItensCompra insumos={opcoes} iniciais={iniciais} />
          <Cartao className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Quem pagou</legend>
              <label className="flex min-h-toque items-center gap-3 rounded-xl border border-borda px-3 has-[:checked]:border-acao">
                <input type="radio" name="pago_por" value="caixa" defaultChecked className="size-5 accent-acao" />
                <span>
                  <span className="block">Caixa do desafio</span>
                  <span className="block text-xs text-texto-suave">Sai do saldo de caixa agora</span>
                </span>
              </label>
              <label className="flex min-h-toque items-center gap-3 rounded-xl border border-borda px-3 has-[:checked]:border-acao">
                <input type="radio" name="pago_por" value="participante" className="size-5 accent-acao" />
                <span>
                  <span className="block">Eu, do meu bolso</span>
                  <span className="block text-xs text-texto-suave">Fica anotado que o desafio te deve esse valor</span>
                </span>
              </label>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="data" name="data" rotulo="Data" type="date" defaultValue={hojeIso()} max={hojeIso()} required />
              <Campo id="fornecedor" name="fornecedor" rotulo="Onde (opcional)" placeholder="Ex.: Atacadão" maxLength={80} />
            </div>
            <Campo id="observacao" name="observacao" rotulo="Observação (opcional)" maxLength={300} />
          </Cartao>
        </Formulario>
      )}
    </>
  );
}
