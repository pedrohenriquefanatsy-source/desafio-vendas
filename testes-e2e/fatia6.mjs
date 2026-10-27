// Teste de ponta a ponta da fatia 6 (painel e metas), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE, com um desafio em andamento e meta
// (o teste da fatia 1 cria um). Confere à mão, na tela, as contas da meta (aceite 13).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
if (!admin.email || !admin.senha) throw new Error("Defina as variáveis E2E_*.");
mkdirSync(CAPTURAS, { recursive: true });

const S = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const resultados = [];
const confere = (ok, d) => { resultados.push({ ok: Boolean(ok), d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${d}`); };
const texto = async (p) => (await p.locator("main").textContent()).replace(/\s+/g, " ");
const esperarPagina = (p, re) => p.waitForURL((u) => re.test(u.pathname), { timeout: 20000, waitUntil: "commit" });
const sucesso = (local) => local.locator("p[role=status]").last();
const num = (s) => Number(s.replace(/\./g, "").replace(",", "."));
const reais = (t) => {
  const m = t.match(/(-?)R\$\s?([\d.]+,\d{2})/);
  return m ? Number(`${m[1]}${num(m[2])}`) : NaN;
};
const igual = (a, b) => Math.abs(a - b) < 0.006;

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

// Lê do Início: realizado, meta, percentual, falta, dias restantes e ritmo necessário.
async function lerPainel(p) {
  await p.goto(`${BASE}/`);
  await p.getByText("Ritmo necessário").waitFor();
  const t = await texto(p);
  const realizado = reais(t.match(/Resultado realizado\s?(-?R\$\s?[\d.]+,\d{2})/)[1]);
  const linhaMeta = (await p.locator("p", { hasText: "da meta de" }).first().textContent()).replace(/\s+/g, " ");
  const [, pct, meta] = linhaMeta.match(/([\d.,]+)% da meta de (R\$\s?[\d.]+,\d{2})/);
  const falta = reais(t.match(/falta (R\$\s?[\d.]+,\d{2})/)[1]);
  const dias = Number(t.match(/Faltam \(com hoje\)\s?(\d+) dias?/)[1]);
  const ritmo = reais(t.match(/Ritmo necessário\s?(R\$\s?[\d.]+,\d{2})/)[1]);
  return { realizado, percentual: num(pct), meta: reais(meta), falta, dias, ritmo };
}

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await p.goto(`${BASE}/entrar`);
await p.fill("#email", admin.email);
await p.fill("#senha", admin.senha);
await p.click("button[type=submit]");
await esperarPagina(p, /^\/$/);

// ── Teste de aceite 13: conferir as contas da tela à mão ─────────────────────
let a = await lerPainel(p);
const conferirContas = (x, quando) => {
  const falta = Math.max(x.meta - x.realizado, 0);
  confere(igual(x.falta, falta), `Aceite 13 (${quando}): falta = meta ${x.meta} − realizado ${x.realizado} = ${falta.toFixed(2)}`);
  confere(igual(x.ritmo, Math.round((falta / x.dias) * 100) / 100), `Aceite 13 (${quando}): ritmo = ${falta.toFixed(2)} ÷ ${x.dias} dias = ${(falta / x.dias).toFixed(2)}`);
  confere(Math.abs(x.percentual - Math.round((x.realizado / x.meta) * 1000) / 10) < 0.051, `Aceite 13 (${quando}): ${x.percentual}% = ${x.realizado} ÷ ${x.meta}`);
};
conferirContas(a, "antes");
await verificarTela(p, "Início");
await p.screenshot({ path: `${CAPTURAS}/01-inicio.png`, fullPage: true });
const svgs = await p.locator("svg[role=img]").count();
confere(svgs === 2, `Início tem os 2 gráficos de dias (${svgs})`);
await p.getByText("Ver em tabela").click();
confere((await p.locator("table tbody tr").count()) >= 1, "Gráficos têm a mesma informação em tabela");
confere((await texto(p)).includes("projeção"), "A projeção vem rotulada como “projeção”");

// Uma despesa de 10,00 pelo caixa: o realizado cai 10,00 e as contas acompanham.
await p.goto(`${BASE}/caixa/despesa`);
await p.fill("#valor", "10,00");
await p.fill("#descricao", `Painel ${S}`);
await p.getByRole("button", { name: "Registrar despesa" }).click();
await sucesso(p).waitFor();
const b = await lerPainel(p);
confere(igual(b.realizado, a.realizado - 10), `Aceite 13: despesa de 10,00 → realizado ${a.realizado} → ${b.realizado}`);
conferirContas(b, "depois");

// ── Demanda estimada e cobertura de estoque ─────────────────────────────────
await p.goto(`${BASE}/`);
await p.locator("main a").first().waitFor();
await p.goto(`${BASE}/mais/desafios`);
await p.locator("main a[href^='/mais/desafios/']", { hasText: "Em andamento" }).first().click();
await esperarPagina(p, /^\/mais\/desafios\/[0-9a-f-]{36}$/);
await p.getByText("Demanda estimada").waitFor();
const campo = p.locator('input[name="unidades"]').first();
await campo.fill("2");
await campo.locator("xpath=ancestor::form").getByRole("button").click();
await p.getByText("Estimativa salva.").waitFor();
confere(true, "Administrador salva a demanda estimada de um produto");
await verificarTela(p, "Desafio e demanda estimada");
await p.goto(`${BASE}/estoque`);
await p.getByText("Prontos").first().waitFor();
const t = await texto(p);
confere(/~[\d,]+ dias \(estimativa\)/.test(t) || /~[\d,]+ dias/.test(t), "Estoque mostra para quantos dias o produto dá (“estimativa” antes de 2 dias com venda)");
await p.screenshot({ path: `${CAPTURAS}/02-estoque-cobertura.png`, fullPage: true });

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
