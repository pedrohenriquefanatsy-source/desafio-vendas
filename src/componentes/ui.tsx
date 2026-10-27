import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, ChevronRight } from "lucide-react";
import { partesReais } from "@/lib/numeros";

// Componentes visuais reutilizáveis (Seção 6.4): neutros, cor só com significado,
// alvos de toque de pelo menos 44 px (h-toque).

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-cartao border border-borda bg-superficie p-4 ${className}`}>
      {children}
    </section>
  );
}

export function TituloPagina({ children, apoio }: { children: ReactNode; apoio?: ReactNode }) {
  return (
    <header className="mb-4">
      <h1 className="text-xl font-semibold">{children}</h1>
      {apoio ? <p className="mt-1 text-sm text-texto-suave">{apoio}</p> : null}
    </header>
  );
}

const estiloBotao = {
  primario: "bg-acao text-acao-texto",
  secundario: "border border-borda bg-superficie text-texto",
  perigo: "border border-negativo bg-superficie text-negativo",
};

type Variante = keyof typeof estiloBotao;

export function classeBotao(variante: Variante = "primario", extra = "") {
  return `inline-flex min-h-toque items-center justify-center gap-2 rounded-xl px-4 font-medium disabled:opacity-60 ${estiloBotao[variante]} ${extra}`;
}

export function LinkBotao({
  variante = "primario",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={classeBotao(variante, className)} {...props} />;
}

// Valor em reais com os centavos menores (referência visual).
export function Valor({ valor, className = "" }: { valor: number; className?: string }) {
  const { inteiro, centavos } = partesReais(valor);
  return (
    <span className={`font-semibold tabular-nums ${className}`}>
      {inteiro}
      <span className="text-[0.65em]">{centavos}</span>
    </span>
  );
}

export function Selo({ children, tom = "neutro" }: { children: ReactNode; tom?: "neutro" | "positivo" | "negativo" | "alerta" }) {
  const cores = {
    neutro: "border-borda text-texto-suave",
    positivo: "border-positivo text-positivo",
    negativo: "border-negativo text-negativo",
    alerta: "border-alerta text-alerta",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cores[tom]}`}>
      {children}
    </span>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "sucesso"; children: ReactNode }) {
  const erro = tipo === "erro";
  const Icone = erro ? CircleAlert : CircleCheck;
  return (
    <p
      role={erro ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${erro ? "border-negativo text-negativo" : "border-positivo text-positivo"}`}
    >
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function EstadoVazio({ titulo, children, acao }: { titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <Cartao className="text-center">
      <p className="font-medium">{titulo}</p>
      {children ? <p className="mt-1 text-sm text-texto-suave">{children}</p> : null}
      {acao ? <div className="mt-4">{acao}</div> : null}
    </Cartao>
  );
}

export function ItemLista({ href, titulo, apoio, direita }: { href: string; titulo: ReactNode; apoio?: ReactNode; direita?: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-toque items-center gap-3 px-4 py-3">
      <span className="flex-1">
        <span className="block font-medium">{titulo}</span>
        {apoio ? <span className="block text-sm text-texto-suave">{apoio}</span> : null}
      </span>
      {direita}
      <ChevronRight aria-hidden className="size-4 text-texto-suave" />
    </Link>
  );
}

// Campo com rótulo, dica e erro. inputMode="decimal" abre o teclado numérico.
export function Campo({
  rotulo,
  dica,
  erro,
  id,
  ...props
}: ComponentProps<"input"> & { rotulo: string; dica?: string; erro?: string; id: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={dica ? `${id}-dica` : undefined}
        className="min-h-toque rounded-xl border border-borda bg-superficie px-3 text-base outline-none focus:border-acao"
        {...props}
      />
      {dica ? (
        <span id={`${id}-dica`} className="text-xs text-texto-suave">
          {dica}
        </span>
      ) : null}
      {erro ? <span className="text-xs text-negativo">{erro}</span> : null}
    </div>
  );
}

export function Selecao({
  rotulo,
  id,
  children,
  ...props
}: ComponentProps<"select"> & { rotulo: string; id: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <select
        id={id}
        className="min-h-toque rounded-xl border border-borda bg-superficie px-3 text-base"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Interruptor({ rotulo, id, ...props }: ComponentProps<"input"> & { rotulo: string; id: string }) {
  return (
    <label htmlFor={id} className="flex min-h-toque items-center gap-3">
      <input id={id} type="checkbox" className="size-5 accent-acao" {...props} />
      <span>{rotulo}</span>
    </label>
  );
}
