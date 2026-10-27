// Teste de ponta a ponta da fatia 4 (vendas), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Monta pelas telas um cardápio com estoque e refaz os testes de aceite 6, 7, 8, 9, 12 e 14.
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
const esperarPagina = (p, re) => p.waitForURL((u) => re.test(u.pathname + u.search), { timeout: 20000, waitUntil: "commit" });
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
}

async function criarProduto(p, n, tipo, preco) {
  await p.goto(`${BASE}/mais/produtos`);
  await p.fill("#nome", n);
  await p.selectOption("#tipo", tipo);
  await p.fill("#preco", preco);
  await p.getByRole("button", { name: "Cadastrar e configurar" }).click();
  await esperarPagina(p, /^\/mais\/produtos\/[0-9a-f-]{36}$/);
}

async function produzir(p, produto) {
  await p.goto(`${BASE}/estoque?aba=producao`);
  await p.selectOption("#variacao_id", { label: produto });
  await p.fill("#fornadas", "1");
  await p.getByRole("button", { name: "Planejar" }).click();
  await sucesso(p).waitFor();
  await p.reload();
  await p.locator("summary", { hasText: produto }).first().click();
  await p.getByRole("button", { name: "Concluir produção" }).first().click();
  await p.getByText("Produção concluída").waitFor();
}

const tile = (p, n) => p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${n},`) });
async function confirmarVenda(p) {
  const antes = p.url();
  await p.getByRole("button", { name: /^(Confirmar|Registrar doação)/ }).click();
  await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
  await p.getByText(/Venda nº \d+ registrada/).waitFor();
  const url = new URL(p.url());
  return { numero: url.searchParams.get("ok"), id: url.searchParams.get("id") };
}
async function saldoProduto(p, n) {
  await p.goto(`${BASE}/estoque`);
  const linha = p.locator("a", { hasText: n }).first();
  await linha.waitFor();
  return Number((await linha.locator("span.font-semibold").last().textContent()).match(/(-?[\d.]+) und/)?.[1]);
}

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await entrar(p, admin);

// ── Cardápio: Clássico e Avelã (mesma massa, 0,30 cada), Casadinha = 1 + 1 + caixa (1,60) ──
const FARINHA = nome("Farinha");
const CAIXA = nome("Caixa");
const MASSA = nome("Massa");
const CLASSICO = nome("Clássico");
const AVELA = nome("Avelã");
const CASADINHA = nome("Casadinha");
await criarInsumo(p, FARINHA, "ingrediente", "g");
await criarInsumo(p, CAIXA, "embalagem", "und");
await p.goto(`${BASE}/mais/receitas`);
await p.fill("#nome", MASSA);
await p.fill("#rendimento", "10");
await p.getByRole("button", { name: "Cadastrar e adicionar insumos" }).click();
await esperarPagina(p, /^\/mais\/receitas\/[0-9a-f-]{36}$/);
await p.selectOption("#novo-insumo", { label: FARINHA });
await p.fill("#novo-quantidade", "500");
await p.selectOption("#novo-unidade", "g");
await p.getByRole("button", { name: "Adicionar", exact: true }).click();
await p.getByText(FARINHA, { exact: true }).first().waitFor();
for (const [n, preco] of [[CLASSICO, "6,50"], [AVELA, "7,50"]]) {
  await criarProduto(p, n, "simples", preco);
  await p.getByText("Alterar variação").click();
  await p.locator('select[name="receita_id"]').first().selectOption({ label: `${MASSA} (rende 10)` });
  await p.getByRole("button", { name: "Salvar", exact: true }).first().click();
  await sucesso(p).waitFor();
}
await criarProduto(p, CASADINHA, "kit", "12");
for (const comp of [CLASSICO, AVELA]) {
  await p.getByText("Adicionar produto ao kit").click();
  await p.locator('select[name="componente_id"]').selectOption({ label: comp });
  await p.fill('input[id^="comp-qtd-"]', "1");
  await p.getByRole("button", { name: "Adicionar", exact: true }).first().click();
  await sucesso(p).waitFor();
  await p.reload();
  await p.getByText("Embalagens por unidade vendida").first().waitFor();
}
await p.getByText("Adicionar embalagem").click();
await p.locator('select[name="insumo_id"]').last().selectOption({ label: CAIXA });
await p.getByRole("button", { name: "Adicionar", exact: true }).last().click();
await sucesso(p).waitFor();

await p.goto(`${BASE}/compras/nova`);
const g1 = p.getByRole("group", { name: "Item 1" });
await g1.locator("select").first().selectOption({ label: FARINHA });
await g1.locator("input").first().fill("1");
await g1.locator("select").nth(1).selectOption("kg");
await g1.locator("input").nth(1).fill("6");
await p.getByRole("button", { name: "Adicionar item" }).click();
const g2 = p.getByRole("group", { name: "Item 2" });
await g2.locator("select").first().selectOption({ label: CAIXA });
await g2.locator("input").first().fill("5");
await g2.locator("input").nth(1).fill("5");
await p.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras/);
await produzir(p, CLASSICO);
await produzir(p, AVELA);
confere((await saldoProduto(p, CLASSICO)) === 10 && (await saldoProduto(p, AVELA)) === 10, "Preparo: 10 clássicos e 10 avelãs prontos");

// ── Venda de 1 item no Pix: ＋ → produto → Confirmar (3 toques) ─────────────
await p.goto(`${BASE}/`);
await p.getByRole("link", { name: "Nova venda" }).click();
await esperarPagina(p, /^\/vendas\/nova$/);
await tile(p, CLASSICO).click();
await verificarTela(p, "Nova venda");
await p.screenshot({ path: `${CAPTURAS}/01-nova-venda.png`, fullPage: true });
const v1 = await confirmarVenda(p);
confere(Boolean(v1.numero), `Venda de 1 item em 3 toques (nº ${v1.numero})`);

// ── Teste de aceite 6: vários itens + kit + desconto ────────────────────────
await tile(p, CLASSICO).click();
await tile(p, CLASSICO).click();
await tile(p, CASADINHA).click();
await p.getByText("Mais opções").click();
await p.fill('input[name="desconto"]', "1,00");
confere(/Total\s?R\$\s?24,00/.test(await texto(p)), "Aceite 6: total R$ 24,00 (2 × 6,50 + 12,00 − 1,00) antes de confirmar");
await p.screenshot({ path: `${CAPTURAS}/02-venda-com-kit.png`, fullPage: true });
const v6 = await confirmarVenda(p);
await p.goto(`${BASE}/vendas/${v6.id}`);
await p.getByText("Margem (MC)").waitFor();
let t = await texto(p);
// MC = (12,48 − 2 × 0,30) + (11,52 − 1,60) = 11,88 + 9,92 = 21,80
confere(/Total\s?R\$\s?24,00/.test(t) && /Margem \(MC\)\s?R\$\s?21,80/.test(t), "Aceite 6: total R$ 24,00 e MC R$ 21,80 calculados pelo banco");
confere(t.includes(`2× ${CLASSICO}`) && t.includes(`1× ${CASADINHA}`) && /desconto R\$\s?0,52/.test(t), "Aceite 6: itens e desconto rateado (0,52 no clássico)");
await verificarTela(p, "Detalhe da venda");
await p.screenshot({ path: `${CAPTURAS}/03-detalhe-venda.png`, fullPage: true });
confere((await saldoProduto(p, CLASSICO)) === 6 && (await saldoProduto(p, AVELA)) === 9, "Aceite 6: estoque — clássico 10 − 1 − 2 − 1 (kit) = 6; avelã 10 − 1 (kit) = 9");

// ── Teste de aceite 7: pendente e depois recebida ───────────────────────────
await p.goto(`${BASE}/vendas/nova`);
await tile(p, AVELA).click();
await p.getByRole("button", { name: "Pendente", exact: true }).click();
await p.fill('input[name="cliente"]', nome("Bia"));
const v7 = await confirmarVenda(p);
await p.goto(`${BASE}/vendas?ver=a-receber`);
await p.getByText(nome("Bia")).waitFor();
confere(/R\$\s?7,50.*Pendente/.test((await p.locator("a", { hasText: nome("Bia") }).textContent()).replace(/\s+/g, " ")), "Aceite 7: aparece em A receber, R$ 7,50, pendente");
await p.screenshot({ path: `${CAPTURAS}/04-a-receber.png`, fullPage: true });
await p.goto(`${BASE}/vendas/${v7.id}`);
await p.getByText("Falta receber").waitFor();
await p.fill("#valor", "3,00");
await p.getByRole("button", { name: "Confirmar recebimento" }).click();
await p.getByText("Recebimento registrado").waitFor();
t = await texto(p);
confere(/Recebido\s?R\$\s?3,00/.test(t) && /Falta receber\s?R\$\s?4,50/.test(t), "Aceite 7: recebeu 3,00, falta 4,50 (parcial)");
await p.getByRole("button", { name: "Confirmar recebimento" }).click(); // valor do saldo já preenchido
await p.getByText("Falta receber").waitFor({ state: "detached" });
confere(!(await texto(p)).includes("Falta receber"), "Aceite 7: com o saldo já preenchido, quitou");

// ── Teste de aceite 8: encomenda ───────────────────────────────────────────
const amanha = new Date(Date.now() + 27 * 3600 * 1000).toISOString().slice(0, 10);
await p.goto(`${BASE}/vendas/nova`);
await tile(p, AVELA).click();
await tile(p, AVELA).click();
await p.getByText("Mais opções").click();
await p.getByRole("button", { name: "Encomenda", exact: true }).click();
await p.fill('input[name="entrega"]', amanha);
await p.fill('input[name="cliente"]', nome("Caio"));
const v8 = await confirmarVenda(p);
const avelaAntes = await saldoProduto(p, AVELA);
confere(avelaAntes === 8, `Aceite 8: encomenda não baixa o estoque (avelã continua 8, está ${avelaAntes})`);
await p.goto(`${BASE}/vendas?ver=encomendas`);
await p.getByText(nome("Caio")).waitFor();
confere(true, "Aceite 8: aparece em Encomendas");
await p.goto(`${BASE}/vendas/${v8.id}`);
await p.getByText("Margem (MC)").waitFor();
confere(/Margem \(MC\)\s?na entrega/.test(await texto(p)), "Aceite 8: margem só na entrega");
await p.getByRole("button", { name: "Marcar como entregue" }).click();
await p.getByText("Encomenda entregue").waitFor();
confere((await saldoProduto(p, AVELA)) === 6, "Aceite 8: entregue, o estoque baixa 2 (8 → 6)");

// ── Teste de aceite 9: doação ──────────────────────────────────────────────
await p.goto(`${BASE}/vendas/nova`);
await p.getByText("Mais opções").click();
await p.getByRole("button", { name: "Doação", exact: true }).click();
await tile(p, CLASSICO).click();
const v9 = await confirmarVenda(p);
await p.goto(`${BASE}/vendas/${v9.id}`);
await p.getByText("Margem (MC)").waitFor();
t = await texto(p);
confere(t.includes("Doação nº") && /Total\s?R\$\s?0,00/.test(t) && /Margem \(MC\)\s?-R\$\s?0,30/.test(t), "Aceite 9: doação sem receita, custo −0,30 no resultado");
confere((await saldoProduto(p, CLASSICO)) === 5, "Aceite 9: doação baixa o estoque (6 → 5)");

// ── D8: mais do que o estoque → avisa e deixa seguir ────────────────────────
await p.goto(`${BASE}/vendas/nova`);
for (let i = 0; i < 7; i++) await tile(p, AVELA).click();
await p.getByRole("button", { name: /^Confirmar/ }).click();
await p.locator("p[role=alert]").first().waitFor();
t = await texto(p);
confere(t.includes(`${AVELA}: precisa 7 und, tem 6`), "D8: avisa que falta produto pronto (precisa 7, tem 6)");
await p.screenshot({ path: `${CAPTURAS}/05-aviso-estoque.png`, fullPage: true });
await p.getByRole("button", { name: "Vender mesmo assim" }).click();
await p.waitForURL((u) => u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
confere((await saldoProduto(p, AVELA)) === -1, "D8: confirmada, a venda passa e o estoque mostra −1");

// ── Teste de aceite 14: duplo toque → uma venda só ──────────────────────────
await p.goto(`${BASE}/vendas/nova`);
await tile(p, CLASSICO).click();
await p.getByRole("button", { name: "Pendente", exact: true }).click();
await p.fill('input[name="cliente"]', nome("Duplo"));
await p.getByRole("button", { name: /^Confirmar/ }).dblclick();
await p.waitForURL((u) => u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
await p.goto(`${BASE}/vendas?ver=todas`);
await p.getByText(nome("Duplo")).first().waitFor();
confere((await p.getByText(nome("Duplo")).count()) === 1, "Aceite 14: duplo toque no Confirmar gera uma venda só");

// ── Teste de aceite 12: cancelar ───────────────────────────────────────────
await p.goto(`${BASE}/vendas/${v6.id}`);
await p.locator("summary", { hasText: "Cancelar venda" }).click();
await p.getByLabel("Cliente desistiu").check();
await p.getByRole("button", { name: `Cancelar venda nº ${v6.numero}` }).click();
await p.getByText(/Cancelada em .*Cliente desistiu/).waitFor();
confere(true, "Aceite 12: venda cancelada com motivo, continua visível");
await p.screenshot({ path: `${CAPTURAS}/06-venda-cancelada.png`, fullPage: true });
confere((await saldoProduto(p, CLASSICO)) === 7, "Aceite 12: estoque volta (clássico 4 + 3 = 7)");
await p.goto(`${BASE}/vendas/${v6.id}`);
await p.getByRole("link", { name: "Lançar de novo, já preenchida" }).click();
await esperarPagina(p, /^\/vendas\/nova\?copiar=/);
await p.getByText(/Preenchida igual à venda nº/).waitFor();
confere(/Confirmar R\$\s?25,00/.test(await texto(p)) || (await p.getByRole("button", { name: /Confirmar R\$\s?25,00/ }).count()) === 1,
  "Lançar de novo: abre com os mesmos itens (R$ 25,00, sem o desconto)");

await p.goto(`${BASE}/vendas?ver=canceladas`);
await p.getByText(`nº ${v6.numero}`).first().waitFor();
await verificarTela(p, "Lista de vendas");
await p.goto(`${BASE}/vendas`);
await p.getByRole("link", { name: /^Hoje/ }).waitFor();
await p.screenshot({ path: `${CAPTURAS}/07-vendas-hoje.png`, fullPage: true });

// ── Membro: vende, mas não cancela venda de outra pessoa ────────────────────
const ctxM = await navegador.newContext(celular);
const pm = await ctxM.newPage();
await entrar(pm, membro);
await pm.goto(`${BASE}/vendas/${v1.id}`);
await pm.getByText("Margem (MC)").waitFor();
confere((await pm.locator("summary", { hasText: "Cancelar venda" }).count()) === 0 && (await texto(pm)).includes("peça ao administrador"), "Membro não vê cancelar na venda de outra pessoa");
await pm.goto(`${BASE}/vendas/nova`);
await tile(pm, CLASSICO).click();
const vm = await confirmarVenda(pm);
await pm.goto(`${BASE}/vendas/${vm.id}`);
confere((await pm.locator("summary", { hasText: "Cancelar venda" }).count()) === 1, "Membro vê cancelar na própria venda (dentro de 30 minutos)");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
