import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { gerarCsv, gerarXlsx, textoData, type Coluna } from "./planilha.ts";

const colunas: Coluna[] = [
  { chave: "id", titulo: "ID", tipo: "texto" },
  { chave: "dia", titulo: "Dia", tipo: "data" },
  { chave: "em", titulo: "Quando", tipo: "datahora" },
  { chave: "total", titulo: "Total (R$)", tipo: "numero" },
  { chave: "obs", titulo: "Observação", tipo: "texto" },
];
const linhas = [
  { id: "a1", dia: "2026-10-27", em: "2026-10-27T17:05:00Z", total: 24.5, obs: 'Disse "obrigado"; voltou' },
  { id: "a2", dia: null, em: null, total: "6.50", obs: "Bolo <de> cenoura & cia" },
];

test("CSV: ponto e vírgula, decimal com vírgula, datas no fuso de Fortaleza", () => {
  const csv = gerarCsv(colunas, linhas);
  assert.ok(csv.startsWith("﻿"), "marca UTF-8 no início");
  const [cab, l1, l2] = csv.slice(1).split("\r\n");
  assert.equal(cab, "ID;Dia;Quando;Total (R$);Observação");
  assert.equal(l1, 'a1;2026-10-27;2026-10-27 14:05;24,5;"Disse ""obrigado""; voltou"');
  assert.equal(l2, "a2;;;6,5;Bolo <de> cenoura & cia");
});

test("XLSX: número é número, data é data e o texto é escapado", () => {
  const arquivos = unzipSync(gerarXlsx([{ nome: "Vendas", colunas, linhas }]));
  assert.ok(arquivos["xl/workbook.xml"] && arquivos["[Content_Types].xml"] && arquivos["xl/styles.xml"]);
  const folha = strFromU8(arquivos["xl/worksheets/sheet1.xml"]);
  assert.match(folha, /<c r="D2"><v>24.5<\/v><\/c>/, "total como número");
  assert.match(folha, /<c r="D3"><v>6.5<\/v><\/c>/, "texto numérico vira número");
  // 27/10/2026 = série 46322 no Excel; 14:05 em Fortaleza = 46322 + 14h05/24h.
  assert.match(folha, /<c r="B2" s="1"><v>46322<\/v><\/c>/, "data como série com formato de data");
  const hora = Number(folha.match(/<c r="C2" s="2"><v>([\d.]+)<\/v>/)?.[1]);
  assert.ok(Math.abs(hora - (46322 + (14 * 60 + 5) / 1440)) < 1e-9, "data e hora no fuso de Fortaleza");
  assert.match(folha, /Bolo &lt;de&gt; cenoura &amp; cia/, "texto escapado");
  assert.ok(!folha.includes('<c r="B3"'), "vazio fica sem célula");
  assert.match(strFromU8(arquivos["xl/workbook.xml"]), /<sheet name="Vendas"/);
});

test("data e hora em texto", () => {
  assert.equal(textoData("2026-10-28T01:30:00Z", "datahora"), "2026-10-27 22:30");
  assert.equal(textoData("2026-10-27", "data"), "2026-10-27");
});
