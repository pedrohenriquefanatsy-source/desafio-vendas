// Teste de ponta a ponta da fatia 5 (caixa), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Refaz pelas telas os testes de aceite 10 (despesa com reembolso) e 11 (aporte).
// Como o banco de teste acumula rodadas, confere sempre a diferença antes/depois.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
const membro = { email: process.env.E2E_MEMBRO_EMAIL, senha: process.env.E2E_MEMBRO_SENHA };
if (!admin.email || !admin.senha || !membro.email || !membro.senha) throw new Error("Defina as variáveis E2E_*.");
mkdirSync(CAPTURAS, { recursive: true });

const S = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const resultados = [];
const confere = (ok, d) => { resultados.push({ ok: Boolean(ok), d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${d}`); };
const texto = async (p) => (await p.locator("main").textContent()).replace(/\s+/g, " ");
const esperarPagina = (p, re) => p.waitForURL((u) => re.test(u.pathname), { timeout: 20000, waitUntil: "commit" });
const sucesso = (local) => local.locator("p[role=status]").last();
// "R$ 1.234,56" ou "-R$ 5,00" → número
const reais = (t) => {
  const m = t.match(/(-?)R\$\s?([\d.]+,\d{2})/);
  return m ? Number(`${m[1]}${m[2].replace(/\./g, "").replace(",", ".")}`) : NaN;
};

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

async function entrar(p, quem) {
  await p.goto(`${BASE}/entrar`);
  await p.fill("#email", quem.email);
  await p.fill("#senha", quem.senha);
  await p.click("button[type=submit]");
  await esperarPagina(p, /^\/$/);
}

// Saldo de caixa, resultado e quanto o desafio deve ao membro, lidos da tela do Caixa.
async function lerCaixa(p) {
  await p.goto(`${BASE}/caixa`);
  await p.getByText("Saldo de caixa").waitFor();
  const saldo = reais(await p.locator("section").filter({ hasText: "Saldo de caixa" }).first().textContent());
  // O lucro estimado (margem − perdas − despesas) vem na nota abaixo dos cartões; o cartão ao lado é o faturamento.
  const resultado = reais((await texto(p)).match(/Lucro estimado\s?(-?R\$\s?[\d.]+,\d{2})/)[1]);
  const linha = p.locator("li", { hasText: "Membro Teste" });
  const devido = (await linha.count()) ? reais(await linha.first().textContent()) : 0;
  return { saldo, resultado, devido };
}
const igual = (a, b) => Math.abs(a - b) < 0.005;

const ctxA = await navegador.newContext(celular);
const pa = await ctxA.newPage();
await entrar(pa, admin);
const ctxM = await navegador.newContext(celular);
const pm = await ctxM.newPage();
await entrar(pm, membro);

let antes = await lerCaixa(pa);
await verificarTela(pa, "Caixa");
await pa.screenshot({ path: `${CAPTURAS}/01-caixa.png`, fullPage: true });

// ── Teste de aceite 11: aporte ──────────────────────────────────────────────
await pa.goto(`${BASE}/caixa/aporte`);
await pa.selectOption("#origem", "pj");
await pa.fill("#valor", "100,00");
await pa.fill("#observacao", `Troco inicial ${S}`);
await pa.getByRole("button", { name: "Registrar aporte" }).click();
await sucesso(pa).waitFor();
await verificarTela(pa, "Aportes");
let depois = await lerCaixa(pa);
confere(igual(depois.saldo, antes.saldo + 100), `Aceite 11: aporte de R$ 100,00 sobe o caixa (${antes.saldo} → ${depois.saldo})`);
confere(igual(depois.resultado, antes.resultado), "Aceite 11: o lucro estimado não muda");

// ── Teste de aceite 10: despesa do bolso, depois reembolso ──────────────────
antes = depois;
await pm.goto(`${BASE}/caixa/despesa`);
await pm.fill("#valor", "15,00");
await pm.getByText("Transporte", { exact: true }).click();
await pm.fill("#descricao", `Uber ${S}`);
await pm.getByLabel("Paguei do meu bolso").check();
await verificarTela(pm, "Nova despesa");
await pm.screenshot({ path: `${CAPTURAS}/02-despesa.png`, fullPage: true });
await pm.getByRole("button", { name: "Registrar despesa" }).click();
await sucesso(pm).waitFor();
confere((await sucesso(pm).textContent()).includes("o desafio te deve"), "Aceite 10: despesa do bolso registrada");
depois = await lerCaixa(pa);
confere(igual(depois.resultado, antes.resultado - 15), "Aceite 10: o lucro estimado reconhece o gasto uma vez (−15,00)");
confere(igual(depois.saldo, antes.saldo), "Aceite 10: o caixa não cai (foi do bolso)");
confere(igual(depois.devido, antes.devido + 15), `Aceite 10: "A reembolsar" mostra 15,00 a mais para o membro (${depois.devido})`);
await pa.screenshot({ path: `${CAPTURAS}/03-caixa-a-reembolsar.png`, fullPage: true });

antes = depois;
await pa.goto(`${BASE}/caixa/reembolsos`);
const cartao = pa.locator("section", { hasText: "Membro Teste" }).first();
await cartao.getByRole("button", { name: /Pagar reembolso/ }).click(); // valor devido já preenchido
await esperarPagina(pa, /^\/caixa\/reembolsos$/);
await pa.getByText("Reembolso registrado").waitFor();
await verificarTela(pa, "A reembolsar");
await pa.screenshot({ path: `${CAPTURAS}/04-reembolsos.png`, fullPage: true });
depois = await lerCaixa(pa);
confere(igual(depois.saldo, antes.saldo - antes.devido), `Aceite 10: o caixa cai só no reembolso (−${antes.devido})`);
confere(igual(depois.resultado, antes.resultado), "Aceite 10: o reembolso não mexe no lucro de novo");
confere(igual(depois.devido, 0), "Aceite 10: o saldo devido zera");

// ── Despesa pelo caixa e cancelamento ───────────────────────────────────────
antes = depois;
await pm.goto(`${BASE}/caixa/despesa`);
await pm.fill("#valor", "10,00");
await pm.getByText("Divulgação", { exact: true }).click();
await pm.fill("#descricao", `Adesivos ${S}`);
await pm.getByRole("button", { name: "Registrar despesa" }).click();
await sucesso(pm).waitFor();
depois = await lerCaixa(pa);
confere(igual(depois.saldo, antes.saldo - 10) && igual(depois.resultado, antes.resultado - 10), "Despesa pelo caixa: caixa −10,00 e resultado −10,00");
await pm.reload();
await pm.locator("summary", { hasText: `Adesivos ${S}` }).click();
await pm.locator('input[name="motivo"]').first().fill("Lancei errado");
await pm.getByRole("button", { name: "Cancelar despesa" }).first().click();
await pm.getByText(/Cancelada em .*Lancei errado/).first().waitFor();
depois = await lerCaixa(pa);
confere(igual(depois.saldo, antes.saldo) && igual(depois.resultado, antes.resultado), "Despesa cancelada pelo próprio membro: caixa e resultado voltam");

// ── Conferência do saldo (ajuste) ───────────────────────────────────────────
antes = depois;
await pa.goto(`${BASE}/caixa/ajuste`);
await pa.fill("#saldo", (antes.saldo + 1).toFixed(2).replace(".", ","));
await pa.fill("#justificativa", "Conferência com o extrato");
await pa.getByRole("button", { name: "Salvar conferência" }).click();
await sucesso(pa).waitFor();
confere(/Ajuste de \+R\$\s?1,00/.test(await sucesso(pa).textContent()), "Ajuste: lança +R$ 1,00");
await verificarTela(pa, "Conferir o saldo");
depois = await lerCaixa(pa);
confere(igual(depois.saldo, antes.saldo + 1) && igual(depois.resultado, antes.resultado), "Ajuste muda o caixa, não o resultado");
const livro = await texto(pa);
confere(livro.includes("Ajuste: Conferência com o extrato") && livro.includes(`Aporte · PJ`) && livro.includes("Reembolso · Membro Teste"), "Livro de caixa mostra aporte, reembolso e ajuste");
await pa.screenshot({ path: `${CAPTURAS}/05-livro-de-caixa.png`, fullPage: true });

// ── Membro não faz aporte, não paga reembolso, não ajusta ───────────────────
await pm.goto(`${BASE}/caixa/aporte`);
confere((await pm.getByRole("button", { name: "Registrar aporte" }).count()) === 0, "Membro não vê o formulário de aporte");
await pm.goto(`${BASE}/caixa`);
confere((await pm.getByRole("link", { name: "Conferir e ajustar o saldo" }).count()) === 0, "Membro não vê o ajuste de caixa");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
