// Teste de ponta a ponta da fatia 14, em 375 px: botão de voltar e venda lançada com a data em que aconteceu.
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
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "12" });
const hojeIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const ontem = new Date(`${hojeIso}T12:00:00Z`);
ontem.setUTCDate(ontem.getUTCDate() - 1);
const ontemIso = ontem.toISOString().slice(0, 10);
const ontemBr = `${ontemIso.slice(8, 10)}/${ontemIso.slice(5, 7)}`;

await p.goto(`${BASE}/vendas/nova`);
await p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first().click();
const data = p.locator('input[name="data"]');
confere(await data.isVisible(), "Nova venda: aparece o campo “Data da venda”");
confere((await data.inputValue()) === hojeIso && (await data.getAttribute("max")) === hojeIso, "Data da venda começa em hoje e não aceita dia futuro");
await p.getByRole("button", { name: "Encomenda", exact: true }).click();
confere((await data.count()) === 0, "Encomenda não mostra a data da venda (usa a data de entrega)");
await p.getByRole("button", { name: "Venda", exact: true }).click();
await p.locator('input[name="data"]').fill(ontemIso);
await verificarTela(p, "Nova venda com data");
await p.screenshot({ path: `${CAPTURAS}/01-venda-com-data.png`, fullPage: true });
const antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
const mesmo = p.getByRole("button", { name: "Vender mesmo assim" });
await Promise.race([mesmo.waitFor({ timeout: 8000 }).catch(() => null), p.waitForURL((u) => u.href !== antes, { timeout: 8000, waitUntil: "commit" }).catch(() => null)]);
if (await mesmo.isVisible().catch(() => false)) await mesmo.click();
await p.waitForURL((u) => u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
const idVenda = new URL(p.url()).searchParams.get("id");

await p.goto(`${BASE}/vendas/${idVenda}`);
await p.getByText("Itens").first().waitFor().catch(() => null);
const t = await texto(p);
confere(t.includes(ontemBr), `Detalhe da venda mostra o dia informado (${ontemBr})`);
confere(/lançada em/.test(t), "Detalhe avisa que a venda foi lançada depois");
const voltar = p.getByRole("link", { name: "Vendas", exact: true }).first();
const caixa = await voltar.boundingBox();
confere(caixa && caixa.height >= 44 && (await voltar.locator("svg").count()) === 1, "Botão de voltar: pílula com seta e alvo de toque ≥ 44 px");
await verificarTela(p, "Detalhe da venda");
await p.screenshot({ path: `${CAPTURAS}/02-detalhe-voltar.png`, fullPage: false });

await p.goto(`${BASE}/vendas?ver=todas&dia=${ontemIso}`);
await p.getByText(`nº`).first().waitFor();
confere((await texto(p)).includes(ontemBr), "Lista de vendas filtrada pelo dia informado mostra a venda");
await p.goto(`${BASE}/vendas?ver=hoje`);
await p.waitForLoadState("domcontentloaded");
confere((await p.locator(`a[href="/vendas/${idVenda}"]`).count()) === 0, "A venda de ontem não aparece em “Hoje”");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
