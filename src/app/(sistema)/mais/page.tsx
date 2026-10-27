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
      <Cartao className="divide-y divide-borda p-0">
        <ItemLista href="/mais/produtos" titulo="Produtos e preços" apoio="Preço, custo e margem de cada produto" />
        <ItemLista href="/mais/receitas" titulo="Receitas" apoio="Insumos de cada fornada e quanto rende" />
        <ItemLista href="/mais/insumos" titulo="Insumos" apoio="O que você compra, com o preço pago" />
        <ItemLista href="/mais/desafios" titulo="Desafio e meta" apoio="Datas, meta de resultado e situação" />
        <ItemLista href="/mais/formas-pagamento" titulo="Formas de pagamento" apoio="Pix, dinheiro, cartão e taxas" />
        <ItemLista href="/compras" titulo="Compras" apoio="Compras de insumos e embalagens" />
        <ItemLista href="/mais/exportar" titulo="Exportar" apoio="Planilha XLSX ou CSV de vendas, caixa, estoque…" />
        <ItemLista
          href="/mais/participantes"
          titulo="Participantes"
          apoio={ehAdmin(perfil) ? "Ativar, desativar e definir papéis" : "Quem participa do desafio"}
        />
      </Cartao>
      <p className="mt-3 text-sm text-texto-suave">
        Exportação e auditoria chegam nas próximas fatias.
      </p>
      <form action={sair} className="mt-6">
        <button type="submit" className={classeBotao("secundario", "w-full")}>
          <LogOut aria-hidden className="size-4" />
          Sair
        </button>
      </form>
    </>
  );
}
