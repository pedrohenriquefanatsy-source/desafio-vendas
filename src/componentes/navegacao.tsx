"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { House, ShoppingCart, Plus, Package, Wallet, WifiOff } from "lucide-react";

const ITENS = [
  { href: "/", rotulo: "Início", Icone: House },
  { href: "/vendas", rotulo: "Vendas", Icone: ShoppingCart },
  { href: "/vendas/nova", rotulo: "Nova venda", Icone: Plus, destaque: true },
  { href: "/estoque", rotulo: "Estoque", Icone: Package },
  { href: "/caixa", rotulo: "Caixa", Icone: Wallet },
];

function ativo(caminho: string, href: string) {
  if (href === "/") return caminho === "/";
  if (href === "/vendas") return caminho === "/vendas" || (caminho.startsWith("/vendas/") && caminho !== "/vendas/nova");
  if (href === "/estoque" && (caminho === "/compras" || caminho.startsWith("/compras/"))) return true;
  return caminho === href || caminho.startsWith(`${href}/`);
}

// Navegação inferior, ao alcance do polegar (Lei de Fitts). Rótulo sempre visível.
export function NavegacaoInferior() {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-superficie pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITENS.map(({ href, rotulo, Icone, destaque }) => {
          const atual = ativo(caminho, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${atual ? "font-semibold text-texto" : "text-texto-suave"}`}
              >
                {destaque ? (
                  <span className="flex size-11 items-center justify-center rounded-full bg-acao text-acao-texto">
                    <Icone aria-hidden className="size-6" />
                  </span>
                ) : (
                  <Icone aria-hidden className="size-6" />
                )}
                <span className={destaque ? "sr-only" : undefined}>{rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Faixa fixa quando a conexão cai (Seção 6.2, Nielsen 1).
export function AvisoConexao() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);
  if (online) return null;
  return (
    <div role="alert" className="sticky top-0 z-30 flex items-center gap-2 bg-negativo px-4 py-2 text-sm text-acao-texto">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      Sem conexão. O que você lançar agora não será salvo.
    </div>
  );
}
