// Datas sempre no fuso do desafio (America/Fortaleza, sem horário de verão).
export const FUSO = "America/Fortaleza";

// "2026-10-27" → "27/10/2026". Datas do banco (tipo date) chegam como texto.
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

// Data de hoje em Fortaleza no formato do campo <input type="date">.
export function hojeIso(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Instante do banco (timestamptz) → "27/10, 14:05" no horário de Fortaleza.
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dataHora.format(new Date(iso));
}
