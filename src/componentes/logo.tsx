import Image from "next/image";

// Logo da Choc Bites. A grande aparece nas telas de entrada; a redonda, no topo do sistema.
export function LogoGrande() {
  return (
    <Image
      src="/logo-choc-bites.png"
      alt="Choc Bites — só mais um bite."
      width={640}
      height={640}
      priority
      unoptimized
      className="mx-auto mb-4 size-44 rounded-full"
    />
  );
}

export function LogoRedonda() {
  return <Image src="/logo-redonda.png" alt="Choc Bites" width={128} height={128} unoptimized className="size-9 shrink-0 rounded-full" />;
}
