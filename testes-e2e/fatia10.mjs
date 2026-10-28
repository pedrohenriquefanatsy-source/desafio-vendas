// Teste de ponta a ponta da fatia 10, em 375 px: compra sem escolha de unidade (embalagem já cadastrada),
// receita montada pela lista de ingredientes, venda com cliente / bairro / desconhecido e a tela de ranking.
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

// ── Cadastro: dois insumos com embalagem e um sem preço nem embalagem ──────────
const CHOC = nome("Chocolate");
const LEITE = nome("Leite cond");
const SOLTO = nome("Solto");
await cadastrarInsumo(p, BASE, { nome: CHOC, tamanho: "500", preco: "16,00" });
await cadastrarInsumo(p, BASE, { nome: LEITE, tamanho: "395", preco: "7,90" });
await cadastrarInsumo(p, BASE, { nome: SOLTO });

// ── 1. Compra: sem escolha de unidade, com a embalagem e o último preço à vista ──
await p.goto(`${BASE}/compras/nova`);
const item = p.getByRole("group", { name: "Item 1" });
await item.locator("select").first().selectOption({ label: CHOC });
await item.getByText("Embalagem de 500 g").waitFor();
let t = await texto(p);
confere(/último preço R\$\s?16,00/.test(t) && /R\$\s?0,032\/g/.test(t), "Compra: mostra a embalagem de 500 g e o último preço (R$ 16,00 · R$ 0,032/g)");
confere((await item.locator("select").count()) === 1, "Compra: não existe escolha de unidade (só o insumo)");
confere(/Quantas embalagens/.test(await item.textContent()), "Compra: a quantidade é em embalagens");
await item.locator("input").first().fill("2");
confere((await item.locator("input").nth(1).inputValue()) === "32,00", "Compra: o valor já vem sugerido (2 × R$ 16,00 = 32,00)");
await item.getByText(/= 1\.?000 g no estoque/).waitFor();
confere(true, "Compra: mostra quanto entra no estoque (2 × 500 g = 1000 g)");
await item.locator("input").first().fill("3");
confere((await item.locator("input").nth(1).inputValue()) === "48,00", "Compra: mudar a quantidade atualiza o valor sugerido");
await item.locator("input").nth(1).fill("40");
await item.locator("input").first().fill("2");
confere((await item.locator("input").nth(1).inputValue()) === "40", "Compra: o valor digitado pela pessoa não é sobrescrito");
await item.locator("input").nth(1).fill("32");
await p.getByRole("button", { name: "Adicionar item" }).click();
const item2 = p.getByRole("group", { name: "Item 2" });
await item2.locator("select").first().selectOption({ label: SOLTO });
await item2.getByRole("link", { name: "Cadastrar a embalagem" }).waitFor();
confere(/Quantidade \(g\)/.test(await item2.textContent()), "Compra: insumo sem embalagem pede a quantidade na unidade base, com link para cadastrar a embalagem");
await p.getByText("Comprou em outro tamanho de embalagem?").waitFor();
await verificarTela(p, "Nova compra");
await p.screenshot({ path: `${CAPTURAS}/01-compra.png`, fullPage: true });
await p.getByRole("button", { name: "Tirar o item 2" }).click();
await p.getByRole("button", { name: "Registrar compra" }).click();
await esperarPagina(p, /^\/compras(\?|$)/);
await p.getByText("Compra registrada").first().waitFor();
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(CHOC).waitFor();
confere(/1 kg/.test(await p.locator("a", { hasText: CHOC }).first().textContent()), "Compra de 2 embalagens de 500 g colocou 1 kg no estoque");

// ── 2. Receita: lista de ingredientes, custo ao vivo e rendimento no fim ───────
const BITES = nome("Bites");
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "5" });
await p.getByText("Este sabor ainda não tem receita").waitFor();
const botao = p.getByRole("button", { name: "Cadastrar receita" });
confere(await botao.isDisabled(), "Receita: o botão fica desligado sem ingredientes e sem rendimento");
const l1 = p.getByRole("group", { name: "Ingrediente 1" });
await l1.locator('select[id$="-insumo"]').selectOption({ label: CHOC });
await l1.locator('input[id$="-quantidade"]').fill("200");
await l1.getByText(/R\$\s?6,40/).waitFor();
confere(true, "Receita: 200 g de chocolate custam R$ 6,40 (conta na hora)");
await p.getByRole("button", { name: "Adicionar ingrediente" }).click();
const l2 = p.getByRole("group", { name: "Ingrediente 2" });
await l2.locator('select[id$="-insumo"]').selectOption({ label: LEITE });
await l2.locator('select[id$="-unidade"]').selectOption("embalagem");
await l2.locator('input[id$="-quantidade"]').fill("1");
await p.getByText(/Custo dos ingredientes.*R\$\s?14,30/).waitFor();
confere(true, "Receita: custo da fornada R$ 14,30 (6,40 + 7,90)");
confere(await botao.isDisabled(), "Receita: ainda desligado enquanto falta dizer quantas unidades rende");
await p.fill("#rc-rendimento", "10");
await p.getByText(/Cada unidade custa.*R\$\s?1,43/).waitFor();
confere(true, "Receita: rendendo 10, cada unidade custa R$ 1,43");
await p.fill("#rc-rendimento", "5");
await p.getByText(/Cada unidade custa.*R\$\s?2,86/).waitFor();
confere(true, "Receita: rendendo só 5, cada unidade passa a custar R$ 2,86");
// Insumo sem preço avisa e não entra na conta.
await p.getByRole("button", { name: "Adicionar ingrediente" }).click();
const l3 = p.getByRole("group", { name: "Ingrediente 3" });
await l3.locator('select[id$="-insumo"]').selectOption({ label: SOLTO });
await l3.locator('input[id$="-quantidade"]').fill("10");
await p.getByText(`Falta o preço de: ${SOLTO}`).waitFor();
confere(true, "Receita: insumo sem preço gera aviso de custo incompleto");
await verificarTela(p, "Receita em montagem");
await p.screenshot({ path: `${CAPTURAS}/02-receita.png`, fullPage: true });
await p.getByRole("button", { name: "Tirar o ingrediente 3" }).click();
await p.fill("#rc-rendimento", "20");
await botao.click();
await p.locator("summary").filter({ hasText: CHOC }).first().waitFor({ timeout: 20000 });
await p.reload();
await p.getByText("Rende").first().waitFor();
t = await texto(p);
confere(/Rende 20 unidades/.test(t) && /fornada\s?R\$\s?14,30/.test(t) && /R\$\s?0,72 cada/.test(t), "Receita cadastrada de uma vez: rende 20, fornada R$ 14,30, R$ 0,72 por unidade");
await p.screenshot({ path: `${CAPTURAS}/03-receita-pronta.png`, fullPage: true });

// ── 3. Venda: desconhecido, com nome e bairro, pendente exige nome ─────────────
const tile = () => p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first();
async function confirmar() {
  const antes = p.url();
  await p.getByRole("button", { name: /^Confirmar/ }).click();
  const mesmoAssim = p.getByRole("button", { name: "Vender mesmo assim" });
  const resultado = await Promise.race([
    p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" }).then(() => "ok"),
    mesmoAssim.waitFor({ timeout: 20000 }).then(() => "aviso"),
  ]);
  if (resultado === "aviso") {
    await mesmoAssim.click();
    await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
  }
  await p.getByText(/Venda nº \d+ registrada/).waitFor();
  return new URL(p.url()).searchParams.get("id");
}

const MEIRELES = nome("Meireles");
const ALDEOTA = nome("Aldeota");
await p.goto(`${BASE}/vendas/nova`);
await tile().click();
const desconhecido = p.getByRole("button", { name: "Desconhecido" });
confere((await desconhecido.getAttribute("aria-pressed")) === "true", "Venda: começa como cliente desconhecido (vender rápido não exige nome)");
await verificarTela(p, "Nova venda com cliente");
await p.screenshot({ path: `${CAPTURAS}/04-venda-cliente.png`, fullPage: true });
await p.fill('input[name="bairro"]', ALDEOTA);
const vDesconhecido = await confirmar();
await p.goto(`${BASE}/vendas/${vDesconhecido}`);
await p.getByText("cliente desconhecido").first().waitFor();
confere(new RegExp(`bairro ${ALDEOTA}`).test(await texto(p)), "Venda a desconhecido: guarda o bairro e mostra “cliente desconhecido”");

const CLIENTE = nome("Marina");
for (let n = 0; n < 2; n++) {
  await p.goto(`${BASE}/vendas/nova`);
  await tile().click();
  await p.getByRole("button", { name: "Informar cliente" }).click();
  await p.fill('input[name="cliente"]', CLIENTE);
  if (n === 0) await p.fill('input[name="bairro"]', MEIRELES);
  if (n === 1) {
    // Cliente já conhecido: o bairro vem preenchido sozinho.
    await p.waitForFunction((b) => document.querySelector('input[name="bairro"]').value === b, MEIRELES, { timeout: 5000 }).catch(() => {});
    confere((await p.locator('input[name="bairro"]').inputValue()) === MEIRELES, "Cliente já conhecido: o bairro é preenchido sozinho");
  }
  await confirmar();
}

// Pendente: o nome passa a ser obrigatório e “Desconhecido” fica desligado.
await p.goto(`${BASE}/vendas/nova`);
await tile().click();
await p.getByRole("button", { name: "Pendente", exact: true }).click();
confere(await p.getByRole("button", { name: "Desconhecido" }).isDisabled(), "Venda pendente: “Desconhecido” fica desligado (precisa do nome para cobrar)");
confere(await p.locator('input[name="cliente"]').evaluate((e) => e.required), "Venda pendente: o nome do cliente é obrigatório");
await p.screenshot({ path: `${CAPTURAS}/05-venda-pendente.png`, fullPage: true });

// ── 4. Tela de ranking ────────────────────────────────────────────────────────
await p.goto(`${BASE}/mais`);
await p.getByRole("link", { name: /Clientes e bairros/ }).click();
await esperarPagina(p, /^\/mais\/clientes$/);
await p.getByText(CLIENTE).waitFor();
t = await texto(p);
confere(new RegExp(`${CLIENTE}.*2 compras · ${MEIRELES}`).test(t), "Clientes: Marina aparece com 2 compras e o bairro Meireles");
confere(/Para cliente desconhecido\s?\d+ ·/.test(t), "Clientes: resumo de vendas para desconhecidos");
await verificarTela(p, "Clientes");
await p.screenshot({ path: `${CAPTURAS}/06-clientes.png`, fullPage: true });
await p.getByRole("link", { name: /^Bairros/ }).click();
await esperarPagina(p, /ver=bairros/);
await p.getByText(ALDEOTA).waitFor();
t = await texto(p);
confere(new RegExp(`${MEIRELES}\\s?2 vendas · 1 cliente com nome`).test(t), "Bairros: Meireles com 2 vendas e 1 cliente com nome");
confere(new RegExp(`${ALDEOTA}\\s?1 venda · 1 a desconhecidos`).test(t), "Bairros: Aldeota com 1 venda a desconhecido");
await verificarTela(p, "Bairros");
await p.screenshot({ path: `${CAPTURAS}/07-bairros.png`, fullPage: true });

// ── 5. Exportações novas ──────────────────────────────────────────────────────
for (const tipo of ["clientes", "bairros", "vendas"]) {
  const r = await p.request.get(`${BASE}/exportar?tipo=${tipo}&formato=csv`);
  const csv = await r.text();
  confere(r.ok() && (tipo === "vendas" ? csv.includes("Bairro") : csv.includes(tipo === "clientes" ? CLIENTE : MEIRELES)), `Exportar ${tipo}: baixa e traz os dados novos`);
}

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
