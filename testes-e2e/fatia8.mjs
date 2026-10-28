// Teste de ponta a ponta da fatia 8 (auditoria e acabamento), em 375 px.
// Auditoria só para o administrador, "Como calculamos", e as telas principais no tema
// escuro (sem rolagem lateral, alvos ≥ 44 px, texto com contraste sobre o fundo).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
const membro = { email: process.env.E2E_MEMBRO_EMAIL, senha: process.env.E2E_MEMBRO_SENHA };
if (!admin.email || !admin.senha || !membro.email || !membro.senha) throw new Error("Defina as variáveis E2E_*.");
mkdirSync(CAPTURAS, { recursive: true });

const resultados = [];
const confere = (ok, d) => { resultados.push({ ok: Boolean(ok), d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${d}`); };
const texto = async (p) => (await p.locator("main").textContent()).replace(/\s+/g, " ");

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

async function entrar(ctx, quem) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/entrar`);
  await p.fill("#email", quem.email);
  await p.fill("#senha", quem.senha);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => u.pathname === "/", { waitUntil: "commit" });
  return p;
}

const navegador = await chromium.launch();
const celular = { viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" };

// ── Auditoria (administrador) ───────────────────────────────────────────────
const ctxA = await navegador.newContext(celular);
const pa = await entrar(ctxA, admin);
await pa.goto(`${BASE}/mais`);
confere((await pa.getByRole("link", { name: /Auditoria/ }).count()) === 1, "Menu Mais tem Auditoria para o administrador");
await pa.goto(`${BASE}/mais/auditoria?tabela=vendas`);
await pa.locator("summary").first().waitFor();
await pa.locator("summary").first().click();
const t = await texto(pa);
confere(/Vendas/.test(t) && /→|Registro/.test(t), "Auditoria de vendas mostra quem, quando e o que mudou");
await verificarTela(pa, "Auditoria");
await pa.screenshot({ path: `${CAPTURAS}/01-auditoria.png`, fullPage: true });
await pa.goto(`${BASE}/mais/auditoria?tabela=vendas`);
const cancelamento = pa.locator("details", { hasText: "Cancelou" }).first();
if (await cancelamento.count()) {
  await cancelamento.locator("summary").click();
  confere(/situacao.*ativa.*→.*cancelada/.test((await cancelamento.textContent()).replace(/\s+/g, " ")), "Cancelamento aparece com o antes (ativa) e o depois (cancelada)");
}

await pa.goto(`${BASE}/mais/como-calculamos`);
await pa.getByText("Margem de cada venda").waitFor();
confere((await texto(pa)).includes("Ritmo necessário por dia = falta ÷ dias que restam"), "“Como calculamos” explica as contas");
await verificarTela(pa, "Como calculamos");

// ── Membro: sem auditoria ───────────────────────────────────────────────────
const ctxM = await navegador.newContext(celular);
const pm = await entrar(ctxM, membro);
await pm.goto(`${BASE}/mais`);
confere((await pm.getByRole("link", { name: /Auditoria/ }).count()) === 0, "Membro não vê Auditoria no menu");
await pm.goto(`${BASE}/mais/auditoria`);
confere((await texto(pm)).includes("Só o administrador vê a auditoria"), "Membro que abre o endereço da auditoria não vê nada");

// ── Tema escuro ─────────────────────────────────────────────────────────────
const ctxE = await navegador.newContext({ ...celular, colorScheme: "dark" });
const pe = await entrar(ctxE, admin);
for (const [nome, caminho] of [["Início", "/"], ["Nova venda", "/vendas/nova"], ["Estoque", "/estoque"], ["Caixa", "/caixa"]]) {
  await pe.goto(`${BASE}${caminho}`);
  await pe.locator("main h1").first().waitFor();
  await pe.waitForTimeout(300);
  const cores = await pe.evaluate(() => {
    const fundo = getComputedStyle(document.body).backgroundColor;
    const titulo = getComputedStyle(document.querySelector("main h1")).color;
    return { fundo, titulo };
  });
  confere(cores.fundo === "rgb(30, 15, 9)" && cores.titulo === "rgb(249, 237, 221)", `${nome} no escuro: fundo escuro e texto claro (${cores.fundo} / ${cores.titulo})`);
  await verificarTela(pe, `${nome} (escuro)`);
  await pe.screenshot({ path: `${CAPTURAS}/escuro-${caminho.replace(/\//g, "_") || "inicio"}.png`, fullPage: false });
}

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
