import { strToU8, zipSync } from "fflate";

// Geração de planilhas XLSX e CSV a partir de linhas já lidas do banco (Seção 4.8):
// números como número, datas como data (no XLSX) ou em formato fixo (no CSV), sempre
// com o ID de cada registro na primeira coluna.

export type TipoColuna = "texto" | "numero" | "data" | "datahora";
export type Coluna = { chave: string; titulo: string; tipo: TipoColuna };
// Os valores vêm como o banco devolve; colunas fora da lista são ignoradas.
export type Linha = Record<string, unknown>;

const FUSO_MS = -3 * 3600 * 1000; // America/Fortaleza, sem horário de verão

// "2026-10-27" ou instante ISO → número de série do Excel (dias desde 1899-12-30).
function serialExcel(valor: string, tipo: "data" | "datahora"): number | null {
  if (tipo === "data") {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 + 25_569;
  }
  const t = new Date(valor).getTime();
  if (Number.isNaN(t)) return null;
  return (t + FUSO_MS) / 86_400_000 + 25_569;
}

// Texto da data/hora no fuso de Fortaleza, para o CSV: "2026-10-27" e "2026-10-27 14:05".
export function textoData(valor: string, tipo: "data" | "datahora"): string {
  if (tipo === "data") return valor.slice(0, 10);
  const t = new Date(valor).getTime();
  if (Number.isNaN(t)) return valor;
  return new Date(t + FUSO_MS).toISOString().slice(0, 16).replace("T", " ");
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de controle não são aceitos no XML da planilha.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function nomeColuna(n: number): string {
  let s = "";
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function celula(ref: string, valor: unknown, tipo: TipoColuna): string {
  if (valor == null || valor === "") return "";
  if (tipo === "numero" && Number.isFinite(Number(valor))) return `<c r="${ref}"><v>${Number(valor)}</v></c>`;
  if ((tipo === "data" || tipo === "datahora") && typeof valor === "string") {
    const serial = serialExcel(valor, tipo);
    if (serial != null) return `<c r="${ref}" s="${tipo === "data" ? 1 : 2}"><v>${serial}</v></c>`;
  }
  const texto = typeof valor === "boolean" ? (valor ? "sim" : "não") : String(valor);
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
}

function folha(colunas: Coluna[], linhas: Linha[]): string {
  const cabecalho = colunas.map((c, i) => `<c r="${nomeColuna(i)}1" s="3" t="inlineStr"><is><t>${escaparXml(c.titulo)}</t></is></c>`).join("");
  const corpo = linhas
    .map((l, n) => `<row r="${n + 2}">${colunas.map((c, i) => celula(`${nomeColuna(i)}${n + 2}`, l[c.chave], c.tipo)).join("")}</row>`)
    .join("");
  const larguras = colunas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.tipo === "texto" ? 24 : c.tipo === "datahora" ? 17 : 13}" customWidth="1"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${larguras}</cols><sheetData><row r="1">${cabecalho}</row>${corpo}</sheetData></worksheet>`
  );
}

// Nome de aba: até 31 caracteres, sem : \ / ? * [ ]
const nomeAba = (n: string) => n.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);

export function gerarXlsx(abas: { nome: string; colunas: Coluna[]; linhas: Linha[] }[]): Uint8Array {
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        abas.map((a, i) => `<sheet name="${escaparXml(nomeAba(a.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
    // Estilos: 0 normal, 1 data, 2 data e hora, 3 cabeçalho em negrito.
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>` +
        `<cellXfs count="4"><xf/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf fontId="1" applyFont="1"/></cellXfs>` +
        `</styleSheet>`,
    ),
  };
  abas.forEach((a, i) => (arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(folha(a.colunas, a.linhas))));
  return zipSync(arquivos, { level: 6 });
}

// CSV no padrão que o Excel em português abre direto: ";" separa colunas, vírgula é o
// decimal, UTF-8 com marca no início (acentos certos).
export function gerarCsv(colunas: Coluna[], linhas: Linha[]): string {
  const campo = (v: unknown, tipo: TipoColuna): string => {
    if (v == null || v === "") return "";
    if (tipo === "numero" && Number.isFinite(Number(v))) return String(Number(v)).replace(".", ",");
    const texto =
      (tipo === "data" || tipo === "datahora") && typeof v === "string" ? textoData(v, tipo) : typeof v === "boolean" ? (v ? "sim" : "não") : String(v);
    return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const cabecalho = colunas.map((c) => campo(c.titulo, "texto")).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => campo(l[c.chave], c.tipo)).join(";"));
  return `﻿${[cabecalho, ...corpo].join("\r\n")}\r\n`;
}
