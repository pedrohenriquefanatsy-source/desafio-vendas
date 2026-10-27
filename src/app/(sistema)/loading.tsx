// Carregando: blocos cinza estáticos, nunca um "R$ 0,00" falso (decisão do diagnóstico).
export default function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-3">
      <div className="h-7 w-1/2 rounded-lg bg-borda" />
      <div className="h-28 rounded-cartao bg-borda" />
      <div className="h-20 rounded-cartao bg-borda" />
    </div>
  );
}
