import { test } from "node:test";
import assert from "node:assert/strict";
import { lerNumero, formatarReais, formatarPercentual, partesReais, formatarQuantidade, formatarCustoUnidade } from "./numeros.ts";
import { formatarData, hojeIso } from "./datas.ts";

test("lerNumero aceita os formatos que a pessoa digita", () => {
  assert.equal(lerNumero("6,50"), 6.5);
  assert.equal(lerNumero("6.50"), 6.5);
  assert.equal(lerNumero("R$ 1.234,56"), 1234.56);
  assert.equal(lerNumero("1234.5"), 1234.5);
  assert.equal(lerNumero("1.234.567"), 1234567);
  assert.equal(lerNumero("3,99%"), 3.99);
  assert.equal(lerNumero(" 12 "), 12);
  assert.equal(lerNumero("0"), 0);
});

test("lerNumero recusa o que não é número", () => {
  assert.equal(lerNumero(""), null);
  assert.equal(lerNumero("   "), null);
  assert.equal(lerNumero(null), null);
  assert.equal(lerNumero("abc"), null);
  assert.equal(lerNumero("1,2,3"), null);
  assert.equal(lerNumero("12a"), null);
});

test("formatação em reais e porcentagem", () => {
  assert.equal(formatarReais(1500).replace(/\s/g, " "), "R$ 1.500,00");
  assert.equal(formatarReais("8.23").replace(/\s/g, " "), "R$ 8,23");
  assert.equal(formatarReais(null), "—");
  assert.equal(formatarPercentual(3.99), "3,99%");
  assert.equal(formatarPercentual("0"), "0%");
  const p = partesReais(4755.28);
  assert.equal(p.inteiro.replace(/\s/g, " "), "R$ 4.755");
  assert.equal(p.centavos, ",28");
});

test("datas no fuso de Fortaleza", () => {
  assert.equal(formatarData("2026-10-27"), "27/10/2026");
  assert.equal(formatarData(null), "—");
  // 01:30 UTC de 28/10 ainda é 27/10 em Fortaleza (UTC-3).
  assert.equal(hojeIso(new Date("2026-10-28T01:30:00Z")), "2026-10-27");
  assert.equal(hojeIso(new Date("2026-10-28T03:00:00Z")), "2026-10-28");
});

test("quantidades e custo por unidade base", () => {
  assert.equal(formatarQuantidade(0.4), "0,4");
  assert.equal(formatarQuantidade(462.15), "462,15");
  assert.equal(formatarQuantidade(1000), "1.000");
  assert.equal(formatarCustoUnidade(0.0048, "g").replace(/\s/g, " "), "R$ 0,0048/g");
  assert.equal(formatarCustoUnidade(0.52, "und").replace(/\s/g, " "), "R$ 0,52/und");
  assert.equal(formatarCustoUnidade(null, "g"), "sem preço");
});
