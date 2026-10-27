import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Cartao, LinkBotao, classeBotao } from "@/componentes/ui";
import { obterPerfil } from "@/servicos/sessao";
import { sair } from "../acoes-sessao";

export const metadata: Metadata = { title: "Acesso pendente · Desafio de Vendas" };

export default async function AcessoPendente() {
  const perfil = await obterPerfil();
  if (!perfil) redirect("/entrar");
  if (perfil.ativo) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
      <Cartao>
        <h1 className="text-xl font-semibold">Acesso ainda não liberado</h1>
        <p className="mt-2 text-texto-suave">
          Seu cadastro existe, mas o acesso ainda não foi ativado. Peça a quem administra o
          desafio para ativar você em <strong>Mais → Participantes</strong> e depois toque em
          “Tentar de novo”.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <LinkBotao href="/">Tentar de novo</LinkBotao>
          <form action={sair}>
            <button type="submit" className={classeBotao("secundario", "w-full")}>
              Sair
            </button>
          </form>
        </div>
      </Cartao>
    </main>
  );
}
