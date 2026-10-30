// Teste de ponta a ponta da fatia 3 (compras, estoque, produção), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Refaz pelas telas os testes de aceite 4 (produção) e 5 (falta de insumo).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { adicionarEmbalagem, cadastrarInsumo, criarProduto, idInsumo, montarReceita } from "./cadastro.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
const membro = { email: process.env.E2E_MEMBRO_EMAIL, senha: process.env.E2E_MEMBRO_SENHA };
if (!admin.email || !admin.senha || !membro.email || !membro.senha) throw new Error("Defina as variáveis E2E_*.");
mkdirSync(CAPTURAS, { recursive: true });

const S = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const nome = (n) => `${n} ${S}`;
const resultados = [];
const confere = (ok, d) => { resultados.push({ ok: Boolean(ok), d }); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${d}`); };
const texto = async (p) => (await p.locator("main").textContent()).replace(/\s+/g, " ");
const esperarPagina = (p, re) => p.waitForURL((u) => re.test(u.pathname), { timeout: 20000, waitUntil: "commit" });
const sucesso = (local) => local.locator("p[role=status]").last();

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

// Preenche o item n (1, 2…) da tela de compra.
// A unidade vem do cadastro do insumo (embalagem): só a quantidade e o valor mudam.
async function itemCompra(p, n, { insumo, quantidade, valor }) {
  const g = p.getByRole("group", { name: `Item ${n}` });
  if (insumo) await g.locator("select").first().selectOption({ label: insumo });
  if (quantidade) await g.locator("input").first().fill(quantidade);
  if (valor) await g.locator("input").nth(1).fill(valor);
}


const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await entrar(p, admin);

// ── Cadastro: massa que rende 10 (500 g de farinha + 1 cx de leite), 1 pote por unidade ──
const FARINHA = nome("Farinha");
const LC = nome("Leite condensado");
const POTE = nome("Pote");
const BOLO = nome("Bolo");

await cadastrarInsumo(p, BASE, { nome: FARINHA, tamanho: "1000", preco: "6" });
const idFarinha = await idInsumo(p, BASE, FARINHA);
await cadastrarInsumo(p, BASE, { nome: LC, tamanho: "395", preco: "7,90" });
await cadastrarInsumo(p, BASE, { nome: POTE, tipo: "embalagem", base: "und", tamanho: "1", preco: "0,50" });

await criarProduto(p, BASE, { nome: BOLO, preco: "8" });
await montarReceita(p, { rendimento: 10, ingredientes: [[FARINHA, "500", "g"], [LC, "1", "embalagem"]] });
await adicionarEmbalagem(p, POTE);

// ── Compra pelo caixa, com 3 itens em kg, cx e und ──────────────────────────
await p.goto(`${BASE}/compras/nova`);
await itemCompra(p, 1, { insumo: FARINHA, quantidade: "1", valor: "6,00" });
await p.getByRole("button", { name: "Adicionar item" }).click();
await itemCompra(p, 2, { insumo: LC, quantidade: "1", valor: "7,90" });
await p.getByRole("button", { name: "Adicionar item" }).click();
await itemCompra(p, 3, { insumo: POTE, quantidade: "10", valor: "5" });
await p.getByText("= 395 g no estoque").waitFor();
confere(/Total da compra\s?R\$\s?18,90/.test(await texto(p)), "Compra: total de R$ 18,90 aparece antes de salvar");
await verificarTela(p, "Nova compra");
await p.screenshot({ path: `${CAPTURAS}/01-nova-compra.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras$/);
await p.getByText("Compra registrada").first().waitFor();
confere(true, "Compra registrada e lista de compras aberta");
await verificarTela(p, "Compras");
await p.screenshot({ path: `${CAPTURAS}/02-compras.png`, fullPage: true });

await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(FARINHA).waitFor();
let t = await texto(p);
confere(t.includes(`${FARINHA}`) && /1 kg/.test(t) && /395 g/.test(t) && /10 und/.test(t), "Estoque de insumos: 1 kg de farinha, 395 g de leite, 10 potes");
await verificarTela(p, "Estoque · insumos");
await p.screenshot({ path: `${CAPTURAS}/03-estoque-insumos.png`, fullPage: true });

// ── Simular a produção: 2 fornadas dizem o que falta comprar ─────────────────
await p.goto(`${BASE}/estoque/simular`);
await p.getByLabel(`Fornadas de ${BOLO}`).fill("2");
await p.getByRole("button", { name: "Simular", exact: true }).click();
await p.getByText("O que isso rende").waitFor();
t = await texto(p);
confere(/2 fornadas de .*≈ 20 potinhos/.test(t), "Simulação: 2 fornadas rendem cerca de 20 potinhos");
confere(new RegExp(`${LC}\\s?precisa 790 g · tem 395\\s?comprar 395 g`).test(t), "Simulação: leite condensado precisa 790 g, tem 395, comprar 395 g");
confere(new RegExp(`${POTE}\\s?precisa 20 und · tem 10\\s?comprar 10 und`).test(t), "Simulação: potes precisa 20, tem 10, comprar 10");
confere(new RegExp(`${FARINHA}\\s?precisa 1\\.000 g[^]*?tem o bastante`).test(t), "Simulação: a farinha basta");
await verificarTela(p, "Simular produção");
await p.screenshot({ path: `${CAPTURAS}/04-simulacao.png`, fullPage: true });

// "Registrar compra com esta lista" já abre com o que falta.
await p.getByRole("link", { name: "Registrar compra com esta lista" }).click();
await esperarPagina(p, /^\/compras\/nova/);
await p.getByRole("group", { name: "Item 2" }).locator("input").first().waitFor();
const prontos = [];
for (const n of [1, 2]) {
  const g = p.getByRole("group", { name: `Item ${n}` });
  const insumo = await g.locator("select").first().evaluate((s) => s.selectedOptions[0]?.textContent);
  prontos.push(`${insumo}=${await g.locator("input").first().inputValue()}`);
}
confere(prontos.includes(`${LC}=1`) && prontos.includes(`${POTE}=10`), `Compra aberta pela simulação já vem com 1 embalagem de leite (395 g) e 10 potes (${prontos.join(", ")})`);
// A ordem dos itens não é fixa: o valor vai pelo insumo de cada item.
for (const n of [1, 2]) await itemCompra(p, n, { valor: prontos[n - 1].startsWith(`${LC}=`) ? "7,90" : "5,00" });
await p.screenshot({ path: `${CAPTURAS}/05-compra-da-simulacao.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras(\?|$)/);

// ── Registrar a produção: 2 fornadas renderam 20 ───────────────────────────
await p.goto(`${BASE}/estoque?aba=producao`);
await p.selectOption("#variacao_id", { label: BOLO });
await p.fill("#fornadas", "2");
await p.fill("#boas", "20");
await verificarTela(p, "Estoque · produção");
await p.screenshot({ path: `${CAPTURAS}/06-producao.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar produção" }).first().click();
await p.waitForURL((u) => u.pathname === "/estoque" && u.searchParams.get("feito") === "registrada", { timeout: 20000, waitUntil: "commit" });
await p.getByText("Produção registrada").first().waitFor();
confere(!(await texto(p)).includes("o estoque não tinha tudo"), "Aceite 4: com os insumos em dia, a produção registra sem aviso");
confere(/2 fornada\(s\) · 20 renderam/.test(await texto(p)), "Aceite 4: a produção aparece em Produções recentes");
await p.goto(`${BASE}/estoque`);
await p.getByText(BOLO).waitFor();
t = await texto(p);
confere(new RegExp(`${BOLO}.*20 und`).test(t), "Aceite 4: 20 bolos prontos no estoque");
await verificarTela(p, "Estoque · produtos");
await p.screenshot({ path: `${CAPTURAS}/07-estoque-produtos.png`, fullPage: true });
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(FARINHA).waitFor();
t = await texto(p);
const linha = async (n) => (await p.locator("a", { hasText: n }).first().textContent()).replace(/\s+/g, " ");
confere((await linha(FARINHA)).includes("0 g") && (await linha(LC)).includes("0 g") && (await linha(POTE)).includes("0 und"), "Aceite 4: farinha, leite e potes baixaram para zero");

// ── Contagem e perda ───────────────────────────────────────────────────────
await p.goto(`${BASE}/estoque/item/insumo/${idFarinha}`);
await p.fill("#contado", "200");
await p.fill("#justificativa", "Achei um pacote aberto");
await p.getByRole("button", { name: "Salvar contagem" }).click();
await sucesso(p).waitFor();
confere((await sucesso(p).textContent()).includes("+200"), "Contagem: lança +200 g com o motivo");
await p.reload();
await p.getByText("Achei um pacote aberto").waitFor();
t = await texto(p);
confere(/Em estoque\s?200 g/.test(t) && t.includes("Usado na produção") && t.includes("Compra"), "Item mostra o saldo e o histórico (compra, produção, ajuste)");
await verificarTela(p, "Item do estoque");
await p.screenshot({ path: `${CAPTURAS}/07-item-insumo.png`, fullPage: true });

await p.goto(`${BASE}/estoque`);
await p.locator("a", { hasText: BOLO }).first().click();
await esperarPagina(p, /^\/estoque\/item\/variacao\//);
await p.fill("#quantidade", "1");
await p.fill("#motivo", "Caiu no chão");
await p.getByRole("button", { name: "Registrar perda" }).click();
await sucesso(p).waitFor();
await p.reload();
await p.getByText("Caiu no chão").waitFor();
confere(/Em estoque\s?19 und/.test(await texto(p)), "Perda de 1 bolo: estoque 19");

// ── Membro: compra do bolso e cancela dentro do prazo ───────────────────────
const ctxM = await navegador.newContext(celular);
const pm = await ctxM.newPage();
await entrar(pm, membro);
await pm.goto(`${BASE}/compras/nova`);
await itemCompra(pm, 1, { insumo: FARINHA, quantidade: "1", valor: "7" });
await pm.locator('input[name="pago_por"][value="participante"]').check();
await pm.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(pm, /^\/compras$/);
await pm.locator("summary").first().click();
t = await texto(pm);
confere(t.includes("Do bolso de Membro Teste"), "Compra do bolso fica no nome de quem pagou");
// A tela "A reembolsar" mostra no que o dinheiro foi gasto, com dia e horário.
await pm.goto(`${BASE}/caixa/reembolsos`);
const meuCartao = pm.locator("section", { hasText: "Membro Teste" }).first();
await meuCartao.locator("summary", { hasText: "Ver no que foi gasto" }).click();
const detalheCompra = (await meuCartao.textContent()).replace(/\s+/g, " ");
confere(/\d{2}\/\d{2}, \d{2}:\d{2} · Compra/.test(detalheCompra) && detalheCompra.includes(`de ${FARINHA}`) && /R\$\s?7,00/.test(detalheCompra), "A reembolsar: mostra a compra do bolso com horário, o que foi comprado e o valor");
await pm.goto(`${BASE}/compras`);
await pm.locator("summary").first().click();
await pm.locator('input[name="motivo"]').first().fill("Lancei errado");
await pm.getByRole("button", { name: "Cancelar compra" }).first().click();
// O formulário de cancelar some; a compra continua aberta mostrando quando e por quê.
await pm.getByText(/Cancelada em .*: Lancei errado/).first().waitFor();
confere(true, "Membro cancela a própria compra dentro de 30 minutos (a tela mostra quando e o motivo)");
await pm.reload();
await pm.getByText("Cancelada").first().waitFor();
await pm.screenshot({ path: `${CAPTURAS}/08-membro-compra-cancelada.png`, fullPage: true });
// A compra do administrador não tem botão de cancelar para o membro.
const doAdmin = pm.locator("details", { hasText: "Caixa ·" }).first();
await doAdmin.locator("summary").click();
confere((await doAdmin.getByRole("button", { name: "Cancelar compra" }).count()) === 0, "Membro não vê cancelar na compra de outra pessoa");
await pm.goto(`${BASE}/estoque/item/insumo/${idFarinha}`);
await pm.getByText("Em estoque").waitFor();
confere(/Em estoque\s?200 g/.test(await texto(pm)), "Depois do cancelamento, a farinha volta a 200 g");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
