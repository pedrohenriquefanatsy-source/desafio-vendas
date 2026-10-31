// Teste de ponta a ponta da fatia 15, em 375 px: produção pelos potinhos, estoque de cada pessoa e gráficos com toque.
// Roda contra o app ligado ao Supabase de TESTE.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { adicionarEmbalagem, cadastrarInsumo, criarProduto, montarReceita } from "./cadastro.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
if (!admin.email || !admin.senha) throw new Error("Defina as variáveis E2E_*.");
mkdirSync(CAPTURAS, { recursive: true });

const S = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const nome = (n) => `${n} ${S}`;
const resultados = [];
const confere = (ok, d) => { resultados.push({ ok: Boolean(ok), d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${d}`); };
const texto = async (p) => (await p.locator("main").textContent()).replace(/\s+/g, " ");
const esperarPagina = (p, re) => p.waitForURL((u) => re.test(u.pathname + u.search), { timeout: 20000, waitUntil: "commit" });

const navegador = await chromium.launch();
const celular = { viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" };

async function verificarTela(p, nomeTela) {
  const largura = await p.evaluate(() => document.documentElement.scrollWidth);
  confere(largura <= 375, `${nomeTela}: sem rolagem lateral (largura ${largura})`);
  const pequenos = await p.evaluate(() =>
    [...document.querySelectorAll("button, a, input:not([type=hidden]), select, summary")]
      .filter((e) => e.offsetParent !== null)
      .filter((e) => e.getBoundingClientRect().height < 44 && !((e.type === "checkbox" || e.type === "radio") && e.closest("label")?.getBoundingClientRect().height >= 44))
      .map((e) => `${e.tagName}:${(e.textContent || e.name || "").trim().slice(0, 20)}`),
  );
  confere(pequenos.length === 0, `${nomeTela}: alvos de toque ≥ 44 px${pequenos.length ? ` — ${pequenos.join(", ")}` : ""}`);
}

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await p.goto(`${BASE}/entrar`);
await p.fill("#email", admin.email);
await p.fill("#senha", admin.senha);
await p.click("button[type=submit]");
await esperarPagina(p, /^\/$/);

const FARINHA = nome("Farinha");
const POTE = nome("Pote");
const BITES = nome("Bites");
const SABOR = `${BITES} · Tradicional`;
let t;
await cadastrarInsumo(p, BASE, { nome: FARINHA, tamanho: "1000", preco: "6", estoque: "5000" });
await cadastrarInsumo(p, BASE, { nome: POTE, tipo: "embalagem", base: "und", tamanho: "1", preco: "0,50", estoque: "100" });
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "12" });
await montarReceita(p, { rendimento: 10, ingredientes: [[FARINHA, "500", "g"]] });
await adicionarEmbalagem(p, POTE);

// ── Produção: só os potinhos prontos ─────────────────────────────────────────
await p.goto(`${BASE}/estoque?aba=producao`);
confere((await p.locator("#fornadas").count()) === 0, "Registrar produção pede só os potinhos prontos");
await p.selectOption("#variacao_id", { label: SABOR });
await p.fill("#boas", "20");
await verificarTela(p, "Registrar produção");
await p.screenshot({ path: `${CAPTURAS}/01-producao.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar produção" }).first().click();
await p.waitForURL((u) => u.searchParams.get("feito") === "registrada", { timeout: 20000, waitUntil: "commit" });
await p.getByText("Produção registrada").first().waitFor();
confere(/2 fornada\(s\) · 20 renderam/.test(await texto(p)), "20 potinhos com receita de ~10: o sistema guardou 2 fornadas");
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(FARINHA).waitFor();
const farinha = (await p.locator("a", { hasText: FARINHA }).first().textContent()).replace(/\s+/g, " ");
confere(/4\.000 g|4 kg/.test(farinha), `Farinha: 5.000 g − 2 × 500 g = 4.000 g (${farinha.slice(-30)})`);

// ── Estoque de cada pessoa: pegar 6 ──────────────────────────────────────────
await p.goto(`${BASE}/estoque`);
await p.getByRole("link", { name: "Estoque de cada pessoa" }).click();
await esperarPagina(p, /^\/estoque\/pessoas/);
await p.getByLabel(`Peguei de ${SABOR}`).fill("6");
await verificarTela(p, "Estoque de cada pessoa");
await p.getByRole("button", { name: "Registrar o que peguei" }).click();
await p.getByText("6 potinhos saíram do estoque geral").waitFor({ timeout: 20000 });
await p.reload();
await p.getByRole("heading", { name: "Com você" }).waitFor();
t = await texto(p);
confere(new RegExp(`Com você.*${SABOR}\\s?6 und`).test(t), "Com você: 6 potinhos");
confere(/14 no estoque geral · 6 com as pessoas/.test(t), "Estoque geral 14 e 6 com as pessoas");
await p.screenshot({ path: `${CAPTURAS}/02-estoque-pessoas.png`, fullPage: true });

await p.goto(`${BASE}/estoque`);
await p.getByText(BITES).first().waitFor();
const linha = (await p.locator("a", { hasText: BITES }).first().textContent()).replace(/\s+/g, " ");
confere(/6 com as pessoas/.test(linha) && /14 und/.test(linha), `Estoque › Prontos: 14 no estoque geral e 6 com as pessoas (${linha.slice(0, 80)})`);

// ── Vender 2: sai do que está comigo ─────────────────────────────────────────
await p.goto(`${BASE}/vendas/nova`);
const tile = p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first();
await tile.click();
await tile.click();
const antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
await p.goto(`${BASE}/estoque/pessoas`);
await p.getByRole("heading", { name: "Com você" }).waitFor();
t = await texto(p);
confere(new RegExp(`Com você.*${SABOR}\\s?4 und`).test(t) && /14 no estoque geral · 4 com as pessoas/.test(t), "Vendeu 2: ficam 4 comigo e o estoque geral continua 14");

// ── Devolver 4 ───────────────────────────────────────────────────────────────
await p.getByLabel(`Devolvi de ${SABOR}`).fill("4");
await p.getByRole("button", { name: "Registrar a devolução" }).click();
await p.getByText("4 potinhos voltaram para o estoque geral").waitFor({ timeout: 20000 });
await p.reload();
await p.getByRole("heading", { name: "Com você" }).waitFor();
t = await texto(p);
confere(/18 no estoque geral · 0 com as pessoas/.test(t), "Devolveu 4: estoque geral 18, nada com as pessoas");

// ── Contagem do dia conta só o estoque geral ─────────────────────────────────
await p.goto(`${BASE}/estoque/contagem`);
confere((await p.getByLabel(`Contagem de ${SABOR}`).inputValue()) === "18", "Contagem do dia: começa no estoque geral (18)");

// ── Fatia 17: pegar mais do que o estoque geral tem (fica negativo) ─────────
await p.goto(`${BASE}/estoque/pessoas`);
await p.getByRole("heading", { name: "Com você" }).waitFor();
await p.getByLabel(`Peguei de ${SABOR}`).fill("20");
await p.getByRole("button", { name: "Registrar o que peguei" }).click();
await p.getByText("20 potinhos saíram do estoque geral").waitFor({ timeout: 20000 });
await p.reload();
await p.getByRole("heading", { name: "Com você" }).waitFor();
t = await texto(p);
confere(/-2 no estoque geral · 20 com as pessoas/.test(t), "Pegou 20 com 18 no estoque geral: registra e o geral fica −2");

// ── Fatia 17: aba Minhas vendas ──────────────────────────────────────────────
await p.getByRole("link", { name: "Minhas vendas" }).click();
await p.waitForURL((u) => u.searchParams.get("aba") === "vendas", { timeout: 20000, waitUntil: "commit" });
await p.getByText("No total").waitFor();
t = await texto(p);
confere(new RegExp(`Hoje.*R\\$\\s?[\\d.]+,\\d{2}`).test(t) && new RegExp(`2× ${BITES}`).test(t), "Minhas vendas: totais de hoje e no total, e a venda de 2 potinhos na lista");
await verificarTela(p, "Minhas vendas");
await p.screenshot({ path: `${CAPTURAS}/04-minhas-vendas.png`, fullPage: false });

// ── Gráficos: tocar num dia mostra o número ──────────────────────────────────
await p.goto(`${BASE}/`);
await p.getByText("Faturamento de cada dia").waitFor();
const barras = p.locator('figure:has-text("Faturamento de cada dia") g[role=button]');
confere((await barras.count()) > 0, "Gráfico de barras: cada dia é tocável");
await barras.first().click();
const quadro = (await p.locator("p[aria-live=polite]").textContent()).replace(/\s+/g, " ");
confere(/faturamento R\$\s?[\d.,]+ · acumulado R\$\s?[\d.,]+/.test(quadro), `Tocar numa barra mostra o faturamento e o acumulado do dia (${quadro})`);
const pontos = p.locator('figure:has-text("Acumulado") g[role=button]');
await pontos.last().click();
const quadro2 = (await p.locator("p[aria-live=polite]").textContent()).replace(/\s+/g, " ");
confere(/acumulado R\$/.test(quadro2), "Tocar num ponto da linha também mostra o número");
const semNumero = await p.evaluate(() =>
  [...document.querySelectorAll('figure g[role=button]')].filter((g) => g.closest("figure").textContent.includes("Faturamento de cada dia"))
    .filter((g) => !/R\$\s?0,00$/.test(g.getAttribute("aria-label") ?? "") && g.querySelectorAll("text").length < 2).length,
);
confere(semNumero === 0, "Gráfico de barras: toda barra tem o seu número");
const rotulosLinha = await p.locator('figure:has-text("Acumulado") text', { hasText: /^R\$/ }).count();
confere(rotulosLinha === 1, `Gráfico de linha: um número só, veio ${rotulosLinha}`);
await verificarTela(p, "Início com gráficos");
await p.locator("figure").first().screenshot({ path: `${CAPTURAS}/03-grafico.png` });

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
