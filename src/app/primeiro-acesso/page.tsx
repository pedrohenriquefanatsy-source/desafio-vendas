import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Cartao, Campo } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { LogoGrande } from "@/componentes/logo";
import { obterPerfil } from "@/servicos/sessao";
import { salvarMeuNome } from "../acoes-sessao";

export const metadata: Metadata = { title: "Primeiro acesso" };

export default async function PrimeiroAcesso() {
  const perfil = await obterPerfil();
  if (!perfil) redirect("/entrar");
  if (!perfil.ativo) redirect("/acesso-pendente");
  if (perfil.nome) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <LogoGrande />
      <h1 className="mb-1 text-center text-2xl font-semibold">Como você se chama?</h1>
      <p className="mb-6 text-center text-texto-suave">É o nome que aparece nos lançamentos que você fizer.</p>
      <Cartao>
        <Formulario acao={salvarMeuNome} textoBotao="Continuar">
          <Campo id="nome" name="nome" rotulo="Seu nome" autoComplete="given-name" minLength={2} maxLength={60} required />
        </Formulario>
      </Cartao>
    </main>
  );
}
