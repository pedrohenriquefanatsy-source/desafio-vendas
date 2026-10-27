"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Linha que abre para editar ao tocar (Nielsen 8: detalhe só quando precisa).
// Guarda se está aberta: salvar não fecha a linha nem esconde a confirmação.
export function ItemEditavel({
  titulo,
  apoio,
  direita,
  aberto = false,
  children,
}: {
  titulo: ReactNode;
  apoio?: ReactNode;
  direita?: ReactNode;
  aberto?: boolean;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(aberto);
  return (
    <details
      open={aberta}
      onToggle={(e) => setAberta(e.currentTarget.open)}
      className="group rounded-cartao border border-borda bg-superficie"
    >
      <summary className="flex min-h-toque cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">
          <span className="block font-medium">{titulo}</span>
          {apoio ? <span className="block text-sm text-texto-suave">{apoio}</span> : null}
        </span>
        {direita}
        <ChevronDown aria-hidden className="size-4 text-texto-suave transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-borda p-4">{children}</div>
    </details>
  );
}
