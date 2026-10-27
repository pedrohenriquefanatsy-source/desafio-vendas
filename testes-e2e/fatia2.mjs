// Teste de ponta a ponta da fatia 2 (insumos, receitas, produtos, kits), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Refaz o teste de aceite 1 pelas telas e confere custo e MC calculados pelo banco.
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
      .filter((e) => e.getBoundingClientRect().height < 44 && !(e.type === "checkbox" && e.closest("label")?.getBoundingClientRect().height >= 44))
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

async function criarInsumo(p, n, tipo, base) {
  await p.goto(`${BASE}/mais/insumos`);
  await p.fill("#nome", n);
  await p.selectOption("#tipo", tipo);
  await p.selectOption("#unidade_base", base);
  await p.getByRole("button", { name: "Cadastrar e definir o preço" }).click();
  await esperarPagina(p, /^\/mais\/insumos\/[0-9a-f-]{36}$/);
  await p.getByText("Sem preço ainda").waitFor();
  return p.url();
}

async function adicionarConversao(p, unidade, qtd) {
  await p.fill("#nova-unidade", unidade);
  await p.fill("#nova-qtd", qtd);
  await p.getByRole("button", { name: "Adicionar unidade" }).click();
  await p.getByText(`1 ${unidade} = `).waitFor();
}

async function definirPreco(p, preco, unidade) {
  await p.fill("#preco", preco);
  await p.selectOption("#unidade-preco", unidade);
  await p.getByRole("button", { name: "Salvar preço" }).click();
  await p.getByText("Preço salvo.").waitFor();
}

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await entrar(p, admin);

// ── Insumos com g, kg, cx e und ──────────────────────────────────────────────
const FARINHA = nome("Farinha");
const LC = nome("Leite condensado");
const OVOS = nome("Ovos");
const ACUCAR = nome("Açúcar");
const EMB = nome("Embalagem");

const urlFarinha = await criarInsumo(p, FARINHA, "ingrediente", "g");
await verificarTela(p, "Insumo novo");
await definirPreco(p, "6,00", "kg");
confere(/R\$\s?0,006\/g/.test(await texto(p)), "Farinha a R$ 6,00 por kg vira R$ 0,006/g");
await p.screenshot({ path: `${CAPTURAS}/01-insumo-farinha.png`, fullPage: true });

await criarInsumo(p, LC, "ingrediente", "g");
await adicionarConversao(p, "cx", "395");
await definirPreco(p, "7,90", "cx");
confere(/R\$\s?7,90 por cx/.test(await texto(p)) && /R\$\s?0,02\/g/.test(await texto(p)), "Leite condensado: R$ 7,90 por cx de 395 g = R$ 0,02/g");
await p.screenshot({ path: `${CAPTURAS}/02-insumo-leite-condensado.png`, fullPage: true });

await criarInsumo(p, OVOS, "ingrediente", "und");
await adicionarConversao(p, "bandeja", "30");
await definirPreco(p, "15,60", "bandeja");
confere(/R\$\s?0,52\/und/.test(await texto(p)), "Ovos: R$ 15,60 a bandeja de 30 = R$ 0,52/und");

await criarInsumo(p, ACUCAR, "ingrediente", "g");
await definirPreco(p, "4,80", "kg");

await criarInsumo(p, EMB, "embalagem", "und");
await definirPreco(p, "0,08", "und");

// "kg" como conversão é recusado com explicação.
await p.fill("#nova-unidade", "kg");
await p.fill("#nova-qtd", "1000");
await p.getByRole("button", { name: "Adicionar unidade" }).click();
await p.locator("p[role=alert]").waitFor();
confere((await p.locator("p[role=alert]").textContent()).includes("já é convertida automaticamente"), "Conversão para kg é recusada com explicação");

await p.goto(`${BASE}/mais/insumos`);
await p.getByText(FARINHA).waitFor();
await verificarTela(p, "Lista de insumos");
await p.screenshot({ path: `${CAPTURAS}/03-insumos.png`, fullPage: true });

// ── Receita (teste de aceite 1) ─────────────────────────────────────────────
await p.goto(`${BASE}/mais/receitas`);
await p.fill("#nome", nome("Massa"));
await p.fill("#rendimento", "24");
await p.getByRole("button", { name: "Cadastrar e adicionar insumos" }).click();
await esperarPagina(p, /^\/mais\/receitas\/[0-9a-f-]{36}$/);
const urlReceita = p.url();

async function adicionarItem(insumo, qtd, unidade) {
  await p.selectOption("#novo-insumo", { label: insumo });
  await p.fill("#novo-quantidade", qtd);
  await p.selectOption("#novo-unidade", unidade);
  await p.getByRole("button", { name: "Adicionar", exact: true }).click();
  await p.getByText(insumo, { exact: true }).first().waitFor();
}
await adicionarItem(FARINHA, "0,4", "kg");
await adicionarItem(LC, "1,17", "cx");
await adicionarItem(OVOS, "6", "und");
await adicionarItem(ACUCAR, "550", "g");
await p.reload();
await p.getByText("Custo da fornada").waitFor();
let t = await texto(p);
confere(/Custo da fornada\s?R\$\s?17,40/.test(t), "Aceite 1: custo da fornada R$ 17,40 (17,403)");
confere(/Custo por unidade\s?R\$\s?0,73/.test(t), "Aceite 1: custo por unidade R$ 0,73 (0,725125)");
confere(/1,17 cx = 462,15 g/.test(t), "1,17 cx aparece convertido em 462,15 g");
await verificarTela(p, "Receita");
await p.screenshot({ path: `${CAPTURAS}/04-receita.png`, fullPage: true });

// ── Produto simples e kit ──────────────────────────────────────────────────
const BOLO = nome("Bolo");
await p.goto(`${BASE}/mais/produtos`);
await p.fill("#nome", BOLO);
await p.selectOption("#tipo", "simples");
await p.fill("#preco", "6,50");
await p.getByRole("button", { name: "Cadastrar e configurar" }).click();
await esperarPagina(p, /^\/mais\/produtos\/[0-9a-f-]{36}$/);
const urlBolo = p.url();
await p.getByText("Escolha a receita desta variação").waitFor();
confere(true, "Produto sem receita avisa o que falta");

await p.getByText("Alterar variação").click();
await p.locator('select[name="receita_id"]').first().selectOption({ label: `${nome("Massa")} (rende 24)` });
await p.getByRole("button", { name: "Salvar", exact: true }).first().click();
await sucesso(p).waitFor();
await p.reload();
await p.getByText("Embalagens por unidade vendida").first().waitFor();
t = await texto(p);
confere(/Custo\s?R\$\s?0,73/.test(t) && /MC\s?R\$\s?5,77/.test(t), "Bolo com a receita: custo R$ 0,73 e MC R$ 5,77");

await p.getByText("Adicionar embalagem").click();
await p.locator('select[name="insumo_id"]').last().selectOption({ label: EMB });
await p.getByRole("button", { name: "Adicionar", exact: true }).last().click();
await sucesso(p).waitFor();
await p.reload();
await p.getByText("Embalagens por unidade vendida").first().waitFor();
t = await texto(p);
confere(/Custo\s?R\$\s?0,81/.test(t) && /MC\s?R\$\s?5,69/.test(t), "Com embalagem de R$ 0,08: custo R$ 0,81 e MC R$ 5,69");
await verificarTela(p, "Produto");
await p.screenshot({ path: `${CAPTURAS}/05-produto.png`, fullPage: true });

const COMBO = nome("Combo");
await p.goto(`${BASE}/mais/produtos`);
await p.fill("#nome", COMBO);
await p.selectOption("#tipo", "kit");
await p.fill("#preco", "12");
await p.getByRole("button", { name: "Cadastrar e configurar" }).click();
await esperarPagina(p, /^\/mais\/produtos\/[0-9a-f-]{36}$/);
await p.getByText("Adicione os produtos que formam o kit").waitFor();
await p.getByText("Adicionar produto ao kit").click();
await p.locator('select[name="componente_id"]').selectOption({ label: BOLO });
await p.fill('input[id^="comp-qtd-"]', "2");
await p.getByRole("button", { name: "Adicionar", exact: true }).first().click();
await sucesso(p).waitFor();
await p.reload();
await p.getByText("Embalagens por unidade vendida").first().waitFor();
t = await texto(p);
confere(/Custo\s?R\$\s?1,61/.test(t) && /MC\s?R\$\s?10,39/.test(t), "Kit com 2 bolos: custo R$ 1,61 e MC R$ 10,39");
await p.screenshot({ path: `${CAPTURAS}/06-kit.png`, fullPage: true });

// ── Teste de aceite 3 (parte de custo): mudar o preço do insumo ───────────────
await p.goto(urlFarinha);
await definirPreco(p, "7,20", "kg");
await p.goto(urlReceita);
await p.getByText("Custo da fornada").waitFor();
t = await texto(p);
confere(/Custo da fornada\s?R\$\s?17,88/.test(t), "Farinha a R$ 7,20/kg: custo da fornada passa a R$ 17,88");
await p.goto(urlFarinha);
confere((await p.locator("section").last().locator("div.flex").count()) >= 2, "Histórico mostra os dois preços da farinha");

await p.goto(`${BASE}/mais/produtos`);
await p.getByText(BOLO).waitFor();
await verificarTela(p, "Lista de produtos");
await p.screenshot({ path: `${CAPTURAS}/07-produtos.png`, fullPage: true });

// ── Membro: vê, não altera ──────────────────────────────────────────────────
const ctxM = await navegador.newContext(celular);
const pm = await ctxM.newPage();
await entrar(pm, membro);
await pm.goto(urlBolo);
await pm.getByText("Embalagens por unidade vendida").waitFor();
confere((await pm.getByText("Alterar variação").count()) === 0 && (await pm.locator('input[name="preco"]').count()) === 0, "Membro vê o produto sem campos de edição");
await pm.goto(`${BASE}/mais/insumos`);
confere((await pm.getByRole("button", { name: "Cadastrar e definir o preço" }).count()) === 0, "Membro não vê o cadastro de insumo");
await pm.screenshot({ path: `${CAPTURAS}/08-membro-produto.png`, fullPage: true });

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
