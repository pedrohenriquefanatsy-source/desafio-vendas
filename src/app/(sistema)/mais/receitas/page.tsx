import { Cartao, Campo, EstadoVazio, ItemLista, Selo, TituloPagina } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { formatarQuantidade, formatarReais } from "@/lib/numeros";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { listarReceitas } from "@/servicos/catalogo";
import { criarReceita } from "../acoes-catalogo";

export default async function Receitas() {
  const perfil = await exigirParticipante();
  const admin = ehAdmin(perfil);
  const receitas = await listarReceitas();

  return (
    <>
      <TituloPagina apoio="Uma receita é uma fornada: os insumos e quantas unidades ela rende.">Receitas</TituloPagina>
      {receitas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma receita cadastrada">
          {admin ? "Cadastre a receita e depois adicione os insumos." : "O administrador ainda não cadastrou receitas."}
        </EstadoVazio>
      ) : (
        <Cartao className="divide-y divide-borda p-0">
          {receitas.map((r) => (
            <ItemLista
              key={r.receita_id}
              href={`/mais/receitas/${r.receita_id}`}
              titulo={r.nome}
              apoio={
                r.custo_receita == null
                  ? `Rende ${formatarQuantidade(r.rendimento_unidades)} · falta preço de: ${r.insumos_sem_preco}`
                  : `Rende ${formatarQuantidade(r.rendimento_unidades)} · ${formatarReais(r.custo_receita)} a fornada · ${formatarReais(r.custo_por_unidade)} cada`
              }
              direita={!r.ativa ? <Selo>Desativada</Selo> : r.custo_receita == null ? <Selo tom="alerta">Sem custo</Selo> : null}
            />
          ))}
        </Cartao>
      )}
      {admin ? (
        <Cartao className="mt-6">
          <h2 className="mb-3 font-semibold">Cadastrar receita</h2>
          <Formulario acao={criarReceita} textoBotao="Cadastrar e adicionar insumos">
            <Campo id="nome" name="nome" rotulo="Nome" placeholder="Ex.: Massa de cenoura" required maxLength={60} />
            <Campo id="rendimento" name="rendimento" rotulo="Rende quantas unidades" inputMode="decimal" placeholder="24" required />
          </Formulario>
        </Cartao>
      ) : null}
    </>
  );
}
