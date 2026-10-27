// Teste de ponta a ponta da fatia 7 (exportação), em 375 px.
// Baixa os arquivos pela tela, abre o XLSX e o CSV e soma os totais. As somas são
// impressas no fim para conferir com uma consulta SQL no Supabase (teste de aceite 16).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { unzipSync, strFromU8 } = require("fflate");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
if (!admin.email || !admin.senha) throw new Error("Defina as variáveis E2E_*.");
mkdirSync(CAPTURAS, { recursive: true });

const resultados = [];
const confere = (ok, d) => { resultados.push({ ok: Boolean(ok), d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${d}`); };

// Lê a primeira aba de um XLSX: cabeçalho e linhas (números como número).
function lerXlsx(bytes) {
  const folha = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
  const linhas = [...folha.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map(([, , corpo]) => {
    const celulas = {};
    for (const [, col, attrs, conteudo] of corpo.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(.*?)<\/c>/g)) {
      const v = conteudo.match(/<v>(.*?)<\/v>/);
      const t = conteudo.match(/<t[^>]*>(.*?)<\/t>/);
      celulas[col] = v ? { numero: Number(v[1]), data: /s="[12]"/.test(attrs) } : { texto: t?.[1] ?? "" };
    }
    return celulas;
  });
  const [cab, ...corpo] = linhas;
  const colunas = Object.fromEntries(Object.entries(cab).map(([col, c]) => [c.texto, col]));
  return { colunas, corpo };
}

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", acceptDownloads: true });
const p = await ctx.newPage();
await p.goto(`${BASE}/entrar`);
await p.fill("#email", admin.email);
await p.fill("#senha", admin.senha);
await p.click("button[type=submit]");
await p.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });

await p.goto(`${BASE}/mais/exportar`);
await p.getByRole("button", { name: "Baixar XLSX" }).waitFor();
const largura = await p.evaluate(() => document.documentElement.scrollWidth);
confere(largura <= 375, `Exportar: sem rolagem lateral (largura ${largura})`);
await p.screenshot({ path: `${CAPTURAS}/01-exportar.png`, fullPage: true });

// Vendas, sem período (tudo), em XLSX pela tela.
await p.selectOption('select[name="tipo"]', "vendas");
await p.fill('input[name="de"]', "");
await p.fill('input[name="ate"]', "");
const [baixado] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Baixar XLSX" }).click()]);
const caminho = await baixado.path();
const vendas = lerXlsx(readFileSync(caminho));
confere(/^vendas_gerado_\d{4}-\d{2}-\d{2}\.xlsx$/.test(baixado.suggestedFilename()), `Nome do arquivo: ${baixado.suggestedFilename()}`);
confere(vendas.colunas.ID === "A", "Primeira coluna é o ID do registro");
const colTotal = vendas.colunas.Total;
const colData = vendas.colunas["Data e hora"];
const somaTotal = vendas.corpo.reduce((t, l) => t + (l[colTotal]?.numero ?? 0), 0);
confere(vendas.corpo.every((l) => typeof l[colTotal]?.numero === "number"), "Total das vendas vem como número");
confere(vendas.corpo.every((l) => l[colData]?.data === true), "Data e hora vem como data da planilha");
const ativas = vendas.corpo.filter((l) => l[vendas.colunas["Situação"]]?.texto === "ativa");
const somaAtivas = ativas.reduce((t, l) => t + (l[colTotal]?.numero ?? 0), 0);

// Fluxo de caixa em CSV.
const csv = await (await p.request.get(`${BASE}/exportar?tipo=caixa&formato=csv`)).text();
const [cab, ...linhasCsv] = csv.replace(/^﻿/, "").trim().split("\r\n");
const iValor = cab.split(";").indexOf("Valor");
const somaCaixa = linhasCsv.reduce((t, l) => t + Number(l.split(";")[iValor].replace(",", ".")), 0);
confere(iValor > 0 && linhasCsv.length > 0, `CSV do caixa: ${linhasCsv.length} linhas, coluna Valor`);

// Todas as exportações baixam (XLSX e CSV) sem erro.
const tipos = await p.locator('select[name="tipo"] option').evaluateAll((os) => os.map((o) => o.value));
for (const tipo of tipos) {
  const x = await p.request.get(`${BASE}/exportar?tipo=${tipo}&formato=xlsx`);
  const c = await p.request.get(`${BASE}/exportar?tipo=${tipo}&formato=csv`);
  let ok = x.ok() && c.ok();
  try {
    lerXlsx(await x.body());
  } catch {
    ok = false;
  }
  confere(ok, `Exportação "${tipo}": XLSX e CSV (${x.headers()["x-total-linhas"]} linhas)`);
}

// Filtro de período: um dia sem nada devolve só o cabeçalho.
const vazio = lerXlsx(await (await p.request.get(`${BASE}/exportar?tipo=vendas&formato=xlsx&de=2000-01-01&ate=2000-01-01`)).body());
confere(vazio.corpo.length === 0, "Filtro de período: dia sem vendas devolve só o cabeçalho");

// Sem login, não recebe nada.
const anonimo = await navegador.newContext();
const r = await anonimo.request.get(`${BASE}/exportar?tipo=vendas&formato=csv`, { maxRedirects: 0 });
confere(r.status() !== 200 || !(await r.text()).includes(";"), `Sem login, a exportação não sai (status ${r.status()})`);

await navegador.close();
console.log(`\nSOMAS PARA CONFERIR NO SQL: vendas=${vendas.corpo.length} linhas; total(todas)=${somaTotal.toFixed(2)}; total(ativas)=${somaAtivas.toFixed(2)}; caixa=${somaCaixa.toFixed(2)}`);
const falhas = resultados.filter((x) => !x.ok);
console.log(`${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
