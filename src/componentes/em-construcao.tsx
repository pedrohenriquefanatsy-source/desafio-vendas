import { EstadoVazio, TituloPagina } from "./ui";

// Telas que ainda não foram construídas: dizem com clareza quando chegam.
export function EmConstrucao({ titulo, fatia, descricao }: { titulo: string; fatia: number; descricao: string }) {
  return (
    <>
      <TituloPagina>{titulo}</TituloPagina>
      <EstadoVazio titulo={`Chega na fatia ${fatia}`}>{descricao}</EstadoVazio>
    </>
  );
}
