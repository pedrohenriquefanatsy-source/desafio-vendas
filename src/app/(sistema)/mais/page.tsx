import { LogOut } from "lucide-react";
import { Cartao, ItemLista, Selo, TituloPagina, classeBotao } from "@/componentes/ui";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { NOMES_PAPEL } from "@/servicos/participantes";
import { sair } from "../../acoes-sessao";

export default async function Mais() {
  const perfil = await exigirParticipante();
  return (
    <>
      <TituloPagina>Mais</TituloPagina>
      <Cartao className="mb-3 flex items-center justify-between">
        <span>
          <span className="block font-medium">{perfil.nome}</span>
          <span className="text-sm text-texto-suave">Você está logado</span>
        </span>
        <Selo>{NOMES_PAPEL[perfil.papel]}</Selo>
      </Cartao>
      <div className="flex flex-col gap-4">
        <section>
          <h2 className="mb-2 text-sm font-medium text-texto-suave">Cadastros</h2>
          <Cartao className="divide-y divide-borda p-0">
            <ItemLista href="/mais/produtos" titulo="Produtos e sabores" apoio="Receita, preço e quanto sobra em cada um" />
            <ItemLista href="/mais/insumos" titulo="Insumos" apoio="O que você compra, com embalagem e preço" />
            <ItemLista href="/compras" titulo="Compras" apoio="Compras de insumos e embalagens" />
          </Cartao>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium text-texto-suave">Desafio</h2>
          <Cartao className="divide-y divide-borda p-0">
            <ItemLista href="/mais/desafios" titulo="Desafio e meta" apoio="Datas, meta de resultado e situação" />
            <ItemLista href="/mais/formas-pagamento" titulo="Formas de pagamento" apoio="Pix, dinheiro, cartão e taxas" />
            <ItemLista
              href="/mais/participantes"
              titulo="Participantes"
              apoio={ehAdmin(perfil) ? "Liberar pessoas e definir quem administra" : "Quem participa do desafio"}
            />
          </Cartao>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium text-texto-suave">Relatórios e ajuda</h2>
          <Cartao className="divide-y divide-borda p-0">
            <ItemLista href="/mais/clientes" titulo="Clientes e bairros" apoio="Quem mais comprou e onde você mais vende" />
            <ItemLista href="/mais/exportar" titulo="Exportar" apoio="Planilha XLSX ou CSV de vendas, caixa, estoque…" />
            {ehAdmin(perfil) ? <ItemLista href="/mais/auditoria" titulo="Auditoria" apoio="Quem incluiu, alterou ou cancelou o quê" /> : null}
            <ItemLista href="/mais/como-calculamos" titulo="Como calculamos" apoio="Custo, sobra, resultado, caixa e meta" />
          </Cartao>
        </section>
      </div>
      <form action={sair} className="mt-6">
        <button type="submit" className={classeBotao("secundario", "w-full")}>
          <LogOut aria-hidden className="size-4" />
          Sair
        </button>
      </form>
    </>
  );
}
