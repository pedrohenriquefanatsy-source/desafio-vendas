// Teste de ponta a ponta da fatia 18, em 375 px: valor a mais na venda (caixa e faturamento).
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
const lerReais = (re, x) => Number(x.match(re)[1].replace(/\./g, "").replace(",", "."));
const faturamento = async () => {
  await p.goto(`${BASE}/`);
  await p.getByText("Ritmo necessário").waitFor();
  return lerReais(/Faturamento\s?realizado\s?R\$\s?([\d.]+,\d{2})/, await texto(p));
};
const caixa = async () => {
  await p.goto(`${BASE}/caixa`);
  await p.getByText("Saldo de caixa").first().waitFor();
  return lerReais(/Saldo de caixa\s?R\$\s?(-?[\d.]+,\d{2})/, await texto(p));
};
const fat0 = await faturamento();
const cx0 = await caixa();

// ── Nova venda com R$ 3,00 a mais ───────────────────────────────────────────
await p.goto(`${BASE}/vendas/nova`);
await p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first().click();
await p.locator("summary", { hasText: "Mais opções" }).click();
await p.fill('input[name="a_mais"]', "3,00");
await p.getByText(/\+ R\$\s?3,00 a mais/).waitFor();
confere(true, "Nova venda: o total mostra “+ R$ 3,00 a mais”");
await verificarTela(p, "Nova venda com valor a mais");
await p.screenshot({ path: `${CAPTURAS}/01-nova-venda-a-mais.png`, fullPage: true });
const antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
const idVenda = new URL(p.url()).searchParams.get("id");
await p.goto(`${BASE}/vendas/${idVenda}`);
await p.getByText("Valor a mais").first().waitFor();
let t = await texto(p);
confere(/Total\s?R\$\s?12,00/.test(t) && /Valor a mais\s?\+R\$\s?3,00/.test(t), "Detalhe: total R$ 12,00 e valor a mais +R$ 3,00");

const fat1 = await faturamento();
confere(Math.abs(fat1 - fat0 - 15) < 0.01, `Faturamento sobe R$ 15,00 (12 + 3 a mais): ${fat0} → ${fat1}`);
const cx1 = await caixa();
confere(Math.abs(cx1 - cx0 - 15) < 0.2, `Caixa sobe cerca de R$ 15,00 (menos taxa, se houver): ${cx0} → ${cx1}`);
confere(/Valor a mais · venda nº/.test(await texto(p)), "Caixa: aparece o lançamento “Valor a mais · venda nº …”");

// ── Registrar depois, na venda ──────────────────────────────────────────────
await p.goto(`${BASE}/vendas/${idVenda}`);
await p.locator("summary", { hasText: "O cliente pagou a mais?" }).click();
await p.fill("#valor_a_mais", "1,50");
await verificarTela(p, "Venda: registrar valor a mais");
await p.getByRole("button", { name: "Registrar valor a mais" }).click();
await p.waitForURL((u) => u.searchParams.get("feito") === "a_mais", { timeout: 20000, waitUntil: "commit" });
await p.getByText("Valor a mais registrado").waitFor();
confere(/Valor a mais\s?\+R\$\s?4,50/.test(await texto(p)), "Registrado depois: valor a mais passa a +R$ 4,50");
await p.screenshot({ path: `${CAPTURAS}/02-venda-a-mais.png`, fullPage: true });

// ── Cancelar devolve ────────────────────────────────────────────────────────
await p.locator("summary", { hasText: "Cancelar venda" }).click();
await p.getByRole("button", { name: /^Cancelar/ }).last().click();
await p.getByText(/Cancelada/).first().waitFor({ timeout: 20000 });
const fat2 = await faturamento();
confere(Math.abs(fat2 - fat0) < 0.01, `Cancelada: o faturamento volta (${fat0} → ${fat2})`);
const cx2 = await caixa();
confere(Math.abs(cx2 - cx0) < 0.01, `Cancelada: o caixa volta (${cx0} → ${cx2})`);

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
