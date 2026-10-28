import Link from "next/link";
import { Menu } from "lucide-react";
import { AvisoConexao, NavegacaoInferior } from "@/componentes/navegacao";
import { LogoRedonda } from "@/componentes/logo";
import { exigirParticipante } from "@/servicos/sessao";

export default async function LayoutSistema({ children }: LayoutProps<"/">) {
  const perfil = await exigirParticipante();
  return (
    <>
      <AvisoConexao />
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-4">
        <span className="flex items-center gap-2 text-sm text-texto-suave">
          <LogoRedonda />
          Olá, {perfil.nome}
        </span>
        <Link
          href="/mais"
          className="inline-flex min-h-toque items-center gap-2 rounded-xl px-2 text-sm font-medium"
        >
          <Menu aria-hidden className="size-5" />
          Mais
        </Link>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-2">{children}</main>
      <NavegacaoInferior />
    </>
  );
}
