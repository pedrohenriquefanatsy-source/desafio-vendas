// Teste de ponta a ponta da fatia 3 (compras, estoque, produção), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Refaz pelas telas os testes de aceite 4 (produção) e 5 (falta de insumo).
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

async function criarInsumo(p, n, tipo, base) {
  await p.goto(`${BASE}/mais/insumos`);
  await p.fill("#nome", n);
  await p.selectOption("#tipo", tipo);
  await p.selectOption("#unidade_base", base);
  await p.getByRole("button", { name: "Cadastrar e definir o preço" }).click();
  await esperarPagina(p, /^\/mais\/insumos\/[0-9a-f-]{36}$/);
  await p.getByText("Sem preço ainda").waitFor();
  return p.url().split("/").pop();
}

// Preenche o item n (1, 2…) da tela de compra.
async function itemCompra(p, n, { insumo, quantidade, unidade, valor }) {
  const g = p.getByRole("group", { name: `Item ${n}` });
  if (insumo) await g.locator("select").first().selectOption({ label: insumo });
  if (quantidade) await g.locator("input").first().fill(quantidade);
  if (unidade) await g.locator("select").nth(1).selectOption(unidade);
  if (valor) await g.locator("input").nth(1).fill(valor);
}

async function abrirPlanejada(p, produto) {
  await p.goto(`${BASE}/estoque?aba=producao`);
  await p.locator("summary", { hasText: produto }).first().click();
}

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await entrar(p, admin);

// ── Cadastro: massa que rende 10 (500 g de farinha + 1 cx de leite), 1 pote por unidade ──
const FARINHA = nome("Farinha");
const LC = nome("Leite condensado");
const POTE = nome("Pote");
const MASSA = nome("Massa");
const BOLO = nome("Bolo");

const idFarinha = await criarInsumo(p, FARINHA, "ingrediente", "g");
await criarInsumo(p, LC, "ingrediente", "g");
await p.fill("#nova-unidade", "cx");
await p.fill("#nova-qtd", "395");
await p.getByRole("button", { name: "Adicionar unidade" }).click();
await p.getByText("1 cx = ").waitFor();
await criarInsumo(p, POTE, "embalagem", "und");

await p.goto(`${BASE}/mais/receitas`);
await p.fill("#nome", MASSA);
await p.fill("#rendimento", "10");
await p.getByRole("button", { name: "Cadastrar e adicionar insumos" }).click();
await esperarPagina(p, /^\/mais\/receitas\/[0-9a-f-]{36}$/);
for (const [insumo, qtd, un] of [[FARINHA, "500", "g"], [LC, "1", "cx"]]) {
  await p.selectOption("#novo-insumo", { label: insumo });
  await p.fill("#novo-quantidade", qtd);
  await p.selectOption("#novo-unidade", un);
  await p.getByRole("button", { name: "Adicionar", exact: true }).click();
  await p.getByText(insumo, { exact: true }).first().waitFor();
}

await p.goto(`${BASE}/mais/produtos`);
await p.fill("#nome", BOLO);
await p.selectOption("#tipo", "simples");
await p.fill("#preco", "8");
await p.getByRole("button", { name: "Cadastrar e configurar" }).click();
await esperarPagina(p, /^\/mais\/produtos\/[0-9a-f-]{36}$/);
await p.getByText("Alterar variação").click();
await p.locator('select[name="receita_id"]').first().selectOption({ label: `${MASSA} (rende 10)` });
await p.getByRole("button", { name: "Salvar", exact: true }).first().click();
await sucesso(p).waitFor();
await p.getByText("Adicionar embalagem").click();
await p.locator('select[name="insumo_id"]').last().selectOption({ label: POTE });
await p.getByRole("button", { name: "Adicionar", exact: true }).last().click();
await sucesso(p).waitFor();

// ── Compra pelo caixa, com 3 itens em kg, cx e und ──────────────────────────
await p.goto(`${BASE}/compras/nova`);
await itemCompra(p, 1, { insumo: FARINHA, quantidade: "1", unidade: "kg", valor: "6,00" });
await p.getByRole("button", { name: "Adicionar item" }).click();
await itemCompra(p, 2, { insumo: LC, quantidade: "1", unidade: "cx", valor: "7,90" });
await p.getByRole("button", { name: "Adicionar item" }).click();
await itemCompra(p, 3, { insumo: POTE, quantidade: "10", unidade: "und", valor: "5" });
await p.getByText("1 cx = 395 g").waitFor();
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

// ── Teste de aceite 5: planejar 2 fornadas e tentar concluir sem insumo ──────
await p.goto(`${BASE}/estoque?aba=producao`);
await p.selectOption("#variacao_id", { label: BOLO });
await p.fill("#fornadas", "2");
await p.getByRole("button", { name: "Planejar" }).click();
await sucesso(p).waitFor();
confere((await sucesso(p).textContent()).includes("Produção planejada"), "Produção planejada (o estoque não muda)");

await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText("Lista de compras").waitFor();
t = await texto(p);
confere(t.includes(LC) && t.includes(POTE) && /Lista de compras/.test(t), "Lista de compras mostra o leite e os potes que faltam para a produção planejada");

await abrirPlanejada(p, BOLO);
confere((await p.locator('input[name="boas"]').first().inputValue()) === "20", "Concluir já vem com as 20 unidades previstas");
await verificarTela(p, "Estoque · produção");
await p.getByRole("button", { name: "Concluir produção" }).first().click();
await p.locator("p[role=alert]").first().waitFor();
const alerta = await p.locator("main").textContent();
confere(alerta.includes("falta insumo") && alerta.includes("Nada foi baixado"), "Aceite 5: produção bloqueada, nada baixado");
confere(alerta.includes(`${LC}: faltam 395 g (precisa 790, tem 395)`), "Aceite 5: mostra que faltam 395 g de leite condensado");
confere(alerta.includes(`${POTE}: faltam 10 und (precisa 20, tem 10)`), "Aceite 5: mostra que faltam 10 potes");
await p.screenshot({ path: `${CAPTURAS}/04-producao-bloqueada.png`, fullPage: true });

// "Registrar compra" já abre com o que falta.
await p.getByRole("link", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras\/nova$/);
await p.getByRole("group", { name: "Item 2" }).locator("input").first().waitFor();
const prontos = [];
for (const n of [1, 2]) {
  const g = p.getByRole("group", { name: `Item ${n}` });
  const insumo = await g.locator("select").first().evaluate((s) => s.selectedOptions[0]?.textContent);
  prontos.push(`${insumo}=${await g.locator("input").first().inputValue()}`);
}
confere(prontos.includes(`${LC}=395`) && prontos.includes(`${POTE}=10`), `Compra aberta pela falta já vem com 395 g de leite e 10 potes (${prontos.join(", ")})`);
// A ordem dos itens não é fixa: o valor vai pelo insumo de cada item.
for (const n of [1, 2]) await itemCompra(p, n, { valor: prontos[n - 1].startsWith(`${LC}=`) ? "7,90" : "5,00" });
await p.screenshot({ path: `${CAPTURAS}/05-compra-da-falta.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras$/);

// ── Teste de aceite 4: concluir ───────────────────────────────────────────
await abrirPlanejada(p, BOLO);
await p.getByRole("button", { name: "Concluir produção" }).first().click();
await esperarPagina(p, /^\/estoque$/);
await p.getByText("Produção concluída").waitFor();
confere(!(await texto(p)).includes(`${BOLO} 2 fornada`), "Aceite 4: produção concluída e fora da lista de planejadas");
await p.goto(`${BASE}/estoque`);
await p.getByText(BOLO).waitFor();
t = await texto(p);
confere(new RegExp(`${BOLO}.*20 und`).test(t), "Aceite 4: 20 bolos prontos no estoque");
await verificarTela(p, "Estoque · produtos");
await p.screenshot({ path: `${CAPTURAS}/06-estoque-produtos.png`, fullPage: true });
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
await itemCompra(pm, 1, { insumo: FARINHA, quantidade: "1", unidade: "kg", valor: "7" });
await pm.locator('input[name="pago_por"][value="participante"]').check();
await pm.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(pm, /^\/compras$/);
await pm.locator("summary").first().click();
t = await texto(pm);
confere(t.includes("Do bolso de Membro Teste"), "Compra do bolso fica no nome de quem pagou");
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
