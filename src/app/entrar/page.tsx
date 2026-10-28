import type { Metadata } from "next";
import { Cartao, Campo } from "@/componentes/ui";
import { Formulario } from "@/componentes/formulario";
import { LogoGrande } from "@/componentes/logo";
import { entrar } from "../acoes-sessao";

export const metadata: Metadata = { title: "Entrar" };

export default function Entrar() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <LogoGrande />
      <h1 className="mb-1 text-center text-2xl font-semibold">Choc Bites</h1>
      <p className="mb-6 text-center text-texto-suave">Entre com o e-mail e a senha que o administrador cadastrou.</p>
      <Cartao>
        <Formulario acao={entrar} textoBotao="Entrar" textoEnviando="Entrando…">
          <Campo id="email" name="email" type="email" rotulo="E-mail" autoComplete="email" inputMode="email" required />
          <Campo id="senha" name="senha" type="password" rotulo="Senha" autoComplete="current-password" required />
        </Formulario>
      </Cartao>
      <p className="mt-4 text-sm text-texto-suave">
        Esqueceu a senha ou ainda não tem acesso? Fale com o administrador do desafio.
      </p>
    </main>
  );
}
