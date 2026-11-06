// Teste de ponta a ponta da fatia 23, em 375 px: dinheiro vivo × banco no Início e no Caixa.
// Roda contra o app ligado ao Supabase de TESTE.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { cadastrarInsumo, criarProduto } from "./cadastro.mjs";

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
const INSUMO = nome("Chocolate");
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "12" });
await cadastrarInsumo(p, BASE, { nome: INSUMO, tamanho: "1000", preco: "20", estoque: "0" });
const lerReais = (re, x) => Number(x.match(re)[1].replace(/\./g, "").replace(",", "."));
const saldos = async () => {
  await p.goto(`${BASE}/`);
  await p.getByText("Dinheiro vivo").first().waitFor();
  const t = await texto(p);
  return {
    total: lerReais(/Saldo de caixa\s?R\$\s?(-?[\d.]+,\d{2})/, t),
    banco: lerReais(/Pix \/ banco\s?R\$\s?(-?[\d.]+,\d{2})/, t),
    vivo: lerReais(/Dinheiro vivo\s?R\$\s?(-?[\d.]+,\d{2})/, t),
  };
};
const perto = (a, b) => Math.abs(a - b) < 0.011;

const s0 = await saldos();
confere(perto(s0.banco + s0.vivo, s0.total), `Início: Pix / banco + dinheiro vivo = saldo de caixa (${s0.banco} + ${s0.vivo} = ${s0.total})`);
await p.screenshot({ path: `${CAPTURAS}/01-inicio.png`, fullPage: false });

// ── Venda de R$ 12 em dinheiro ───────────────────────────────────────────────
await p.goto(`${BASE}/vendas/nova`);
await p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first().click();
await p.getByRole("button", { name: "Dinheiro", exact: true }).click();
let antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
const s1 = await saldos();
confere(perto(s1.vivo, s0.vivo + 12) && perto(s1.banco, s0.banco), `Venda em dinheiro de R$ 12: o dinheiro vivo sobe 12 e o banco não muda (${s0.vivo} → ${s1.vivo})`);

// ── Venda de R$ 12 no Pix ────────────────────────────────────────────────────
await p.goto(`${BASE}/vendas/nova`);
await p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first().click();
await p.getByRole("button", { name: "Pix", exact: true }).click();
antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
const s2 = await saldos();
confere(perto(s2.banco, s1.banco + 12) && perto(s2.vivo, s1.vivo), "Venda no Pix de R$ 12: o banco sobe 12 e o dinheiro vivo não muda");

// ── Compra de R$ 30 pelo caixa: R$ 10 em dinheiro e R$ 20 no Pix ────────────
await p.goto(`${BASE}/compras/nova`);
{
  const g = p.getByRole("group", { name: "Item 1" });
  await g.locator("select").first().selectOption({ label: INSUMO });
  await g.locator("input").first().fill("1");
  await g.locator("input").nth(1).fill("30,00");
}
await p.fill("#em_dinheiro", "10,00");
await verificarTela(p, "Nova compra com dinheiro vivo");
await p.screenshot({ path: `${CAPTURAS}/02-nova-compra.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras(\?|$)/);
const s3 = await saldos();
confere(perto(s3.vivo, s2.vivo - 10) && perto(s3.banco, s2.banco - 20) && perto(s3.total, s2.total - 30), "Compra de R$ 30 com R$ 10 em dinheiro: vivo −10, banco −20");

// ── Despesa de R$ 9 com R$ 4 em dinheiro ────────────────────────────────────
await p.goto(`${BASE}/caixa/despesa`);
await p.fill("#valor", "9,00");
await p.fill("#descricao", nome("Uber dinheiro"));
await p.fill("#em_dinheiro", "4,00");
await p.getByRole("button", { name: "Registrar despesa" }).click();
await p.getByText("Despesa registrada").waitFor({ timeout: 20000 });
const s4 = await saldos();
confere(perto(s4.vivo, s3.vivo - 4) && perto(s4.banco, s3.banco - 5), "Despesa de R$ 9 com R$ 4 em dinheiro: vivo −4, banco −5");

// ── Caixa mostra o mesmo ─────────────────────────────────────────────────────
await p.goto(`${BASE}/caixa`);
await p.getByText("Dinheiro vivo").first().waitFor();
const tc = await texto(p);
confere(perto(lerReais(/Dinheiro vivo\s?R\$\s?(-?[\d.]+,\d{2})/, tc), s4.vivo), "Tela Caixa mostra o mesmo dinheiro vivo");
await verificarTela(p, "Caixa");

// ── Conferir o dinheiro vivo ─────────────────────────────────────────────────
await p.goto(`${BASE}/caixa/ajuste`);
await p.fill("#contado", "75,50");
await p.fill("#motivo", "contei o dinheiro");
await verificarTela(p, "Conferir o dinheiro vivo");
await p.screenshot({ path: `${CAPTURAS}/03-conferir-dinheiro.png`, fullPage: true });
await p.getByRole("button", { name: "Salvar dinheiro vivo" }).click();
await p.getByText(/Dinheiro vivo ajustado|já estava certo/).waitFor({ timeout: 20000 });
const s5 = await saldos();
confere(perto(s5.vivo, 75.5) && perto(s5.total, s4.total) && perto(s5.banco + s5.vivo, s5.total), `Conferência: dinheiro vivo vira R$ 75,50, o saldo total não muda (${s5.vivo} / ${s5.banco})`);

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
