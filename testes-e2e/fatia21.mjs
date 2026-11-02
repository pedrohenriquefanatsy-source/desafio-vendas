// Teste de ponta a ponta da fatia 21, em 375 px: acerto com as vendas registradas uma a uma (limitadas ao que a pessoa vendeu).
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

// ── Pegou 10 e voltou com 4: vendeu 6 ────────────────────────────────────────
await p.goto(`${BASE}/estoque/pessoas`);
await p.getByLabel(`Peguei de ${SABOR}`).fill("10");
await p.getByRole("button", { name: "Registrar o que peguei" }).click();
await p.getByText("10 potinhos saíram do estoque geral").waitFor({ timeout: 20000 });
await p.goto(`${BASE}/estoque/pessoas?aba=acerto`);
await p.getByLabel(`Quanto sobrou de ${SABOR}`).fill("4");
await p.getByRole("button", { name: /Registrar as 6 vendas, uma a uma/ }).click();
await p.waitForURL((u) => u.searchParams.get("feito") === "iniciado", { timeout: 20000, waitUntil: "commit" });
await p.getByText("Acerto em andamento").waitFor();
t = await texto(p);
confere(/Contagem guardada/.test(t) && new RegExp(`${SABOR}.*sobrou 4 · vendeu 6.*faltam 6`).test(t), "Acerto em andamento: sobrou 4, vendeu 6, faltam 6");
await verificarTela(p, "Acerto em andamento");
await p.screenshot({ path: `${CAPTURAS}/01-acerto-em-andamento.png`, fullPage: true });

// ── Vendas do acerto: limitadas a 6, sem encomenda ──────────────────────────
await p.getByRole("link", { name: /Registrar as vendas/ }).click();
await p.waitForURL((u) => u.searchParams.get("acerto") === "1", { timeout: 20000, waitUntil: "commit" });
await p.getByText("Faltam registrar").waitFor();
confere(/Vendas do acerto/.test(await texto(p)) && (await p.getByRole("button", { name: "Encomenda", exact: true }).count()) === 0, "Vendas do acerto: sem a opção de encomenda");
const tile = p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first();
confere(await p.getByText("restam 6").first().isVisible(), "O produto mostra “restam 6”");
for (let i = 0; i < 8; i++) if (await tile.isEnabled()) await tile.click();
t = await texto(p);
confere(/restam 0/.test(t) && !(await tile.isEnabled()), "Não deixa passar da cota: 8 toques, só 6 entram e o botão trava");
// tira 3 (fica 3) e registra com cliente e desconto
for (let i = 0; i < 3; i++) await p.getByRole("button", { name: new RegExp(`Tirar 1 ${BITES}`) }).click();
await p.getByRole("button", { name: "Informar cliente" }).click();
await p.fill('input[name="cliente"]', nome("Dona Rita"));
await p.locator("summary", { hasText: "Mais opções" }).click();
await p.fill('input[name="desconto"]', "1,00");
await verificarTela(p, "Vendas do acerto");
await p.screenshot({ path: `${CAPTURAS}/02-venda-do-acerto.png`, fullPage: true });
let antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
confere(new URL(p.url()).searchParams.get("acerto") === "1", "Depois de registrar, continua no acerto");
await p.getByText(/Faltam registrar\s*3 potinhos/).waitFor();
confere(true, "Venda de 3 registrada: faltam 3 potinhos");

// ── Mais 2, sem cliente ──────────────────────────────────────────────────────
const tile2 = p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first();
await tile2.click();
await tile2.click();
antes = p.url();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
await p.getByText(/Faltam registrar\s*1 potinho/).waitFor();
confere(true, "Mais 2 registrados: falta 1 potinho");

// ── Fechar: o que faltou vira venda única; devolve o que sobrou ─────────────
await p.goto(`${BASE}/estoque/pessoas?aba=acerto`);
await p.getByText("Acerto em andamento").waitFor();
t = await texto(p);
confere(/faltam 1/.test(t), "De volta ao acerto: falta 1");
await p.getByLabel("Devolvi o que sobrou ao estoque geral").check();
await p.getByRole("button", { name: "Fechar o acerto" }).click();
await p.waitForURL((u) => u.searchParams.get("feito") === "acerto", { timeout: 20000, waitUntil: "commit" });
await p.getByText(/Acerto feito: 1 potinho vendido sem registro entraram na venda nº \d+/).waitFor();
confere(/voltou para o estoque geral/.test(await texto(p)), "Acerto fechado: 1 sem registro e o que sobrou voltou ao estoque");
await p.goto(`${BASE}/estoque/pessoas`);
await p.getByRole("heading", { name: "Com você" }).waitFor();
confere(!new RegExp(`Com você.*${SABOR}`).test(await texto(p).then((x) => x.split("Peguei para vender")[0])), "Nada deste sabor fica com a pessoa");

// ── As vendas registradas têm cliente e o desconto ──────────────────────────
await p.goto(`${BASE}/estoque/pessoas?aba=vendas`);
await p.getByText("No total").waitFor();
t = await texto(p);
confere(new RegExp(`${nome("Dona Rita")}`).test(t) && /3× Bites/.test(t), "Minhas vendas: a venda da Dona Rita (3 potinhos) aparece com o cliente");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
