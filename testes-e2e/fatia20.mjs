// Teste de ponta a ponta da fatia 20, em 375 px: acerto da pessoa, potinhos vendidos e dias dos insumos.
// Roda contra o app ligado ao Supabase de TESTE.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { criarProduto } from "./cadastro.mjs";

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

const BITES = nome("Bites");
const SABOR = `${BITES} · Tradicional`;
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "12" });
let t;

// ── Pegou 10 para vender ─────────────────────────────────────────────────────
await p.goto(`${BASE}/estoque/pessoas`);
await p.getByLabel(`Peguei de ${SABOR}`).fill("10");
await p.getByRole("button", { name: "Registrar o que peguei" }).click();
await p.getByText("10 potinhos saíram do estoque geral").waitFor({ timeout: 20000 });

// ── Vendeu 2 e registrou ─────────────────────────────────────────────────────
await p.goto(`${BASE}/vendas/nova`);
const tile = p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first();
await tile.click();
await tile.click();
const antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });

// ── Acerto: sobraram 3, então 5 foram vendidos sem registro ──────────────────
await p.goto(`${BASE}/estoque/pessoas?aba=acerto`);
await p.getByLabel(`Quanto sobrou de ${SABOR}`).waitFor();
await p.getByLabel(`Quanto sobrou de ${SABOR}`).fill("9");
await p.getByText(/Mais do que os 8/).waitFor();
confere(true, "Acerto: avisa quando sobrou mais do que o sistema tem com a pessoa (9 > 8)");
await p.getByLabel(`Quanto sobrou de ${SABOR}`).fill("3");
await p.getByText(/Sem registro:.*5 potinhos.*R\$\s?60,00/).waitFor();
confere(true, "Acerto: prévia de 5 potinhos sem registro, cerca de R$ 60,00");
await verificarTela(p, "Acerto");
await p.screenshot({ path: `${CAPTURAS}/01-acerto.png`, fullPage: true });
await p.getByRole("button", { name: /Registrar as 5 vendas, uma a uma/ }).waitFor();
confere(true, "Acerto: o botão principal registra as vendas uma a uma");
await p.getByRole("button", { name: /Fechar tudo de uma vez/ }).click();
await p.waitForURL((u) => u.searchParams.get("feito") === "acerto", { timeout: 20000, waitUntil: "commit" });
await p.getByText(/Acerto feito: 5 potinhos vendidos sem registro entraram na venda nº \d+/).waitFor({ timeout: 20000 });
confere(true, "Acerto feito: 5 potinhos entram numa venda sem registro");

// ── Minhas vendas: potinhos ──────────────────────────────────────────────────
await p.goto(`${BASE}/estoque/pessoas?aba=vendas`);
await p.getByText("No total").waitFor();
t = await texto(p);
confere(new RegExp(`5× ${BITES}`).test(t) && /\d+ potinhos · \d+ vendas?/.test(t), "Minhas vendas: a venda do acerto (5 potinhos) e os totais em potinhos");
confere(/Acerto: vendas sem registro|cliente desconhecido/.test(t), "Minhas vendas: a venda do acerto aparece na lista");
await p.screenshot({ path: `${CAPTURAS}/02-minhas-vendas.png`, fullPage: false });

// ── Estoque da pessoa: ficaram 3 ─────────────────────────────────────────────
await p.goto(`${BASE}/estoque/pessoas`);
await p.getByRole("heading", { name: "Com você" }).waitFor();
t = await texto(p);
confere(new RegExp(`Com você.*${SABOR}\\s?3 und`).test(t), "Depois do acerto ficam 3 com a pessoa");

// ── Início: potinhos vendidos ────────────────────────────────────────────────
await p.goto(`${BASE}/`);
await p.getByText("Potinhos vendidos").first().waitFor();
t = await texto(p);
confere(/Potinhos vendidos.*hoje/.test(t) && new RegExp(`${SABOR}`).test(t), "Início: card Potinhos vendidos com a divisão por sabor");
const hojePotinhos = Number(t.match(/no desafio · (\d+) hoje/)?.[1] ?? -1);
confere(hojePotinhos >= 7, `Início: o card mostra os potinhos vendidos hoje (${hojePotinhos}, pelo menos os 7 do teste)`);
const quadro = (await p.locator("p[aria-live=polite]").textContent()).replace(/\s+/g, " ");
confere(/potinhos?/.test(quadro), `O quadro do dia nos gráficos mostra os potinhos (${quadro})`);
await verificarTela(p, "Início");
await p.screenshot({ path: `${CAPTURAS}/03-inicio.png`, fullPage: false });

// ── Insumos: a lista abre com a legenda de dias ──────────────────────────────
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(/dura ~N dias/).waitFor();
confere(true, "Insumos: legenda de “dura ~N dias” aparece");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
