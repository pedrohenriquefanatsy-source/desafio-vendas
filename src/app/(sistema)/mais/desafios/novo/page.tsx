import { redirect } from "next/navigation";
import { Cartao, TituloPagina } from "@/componentes/ui";
import { exigirParticipante, ehAdmin } from "@/servicos/sessao";
import { FormularioDesafio } from "../formulario-desafio";

export default async function NovoDesafio() {
  const perfil = await exigirParticipante();
  if (!ehAdmin(perfil)) redirect("/mais/desafios");
  return (
    <>
      <TituloPagina>Cadastrar desafio</TituloPagina>
      <Cartao>
        <FormularioDesafio />
      </Cartao>
    </>
  );
}
