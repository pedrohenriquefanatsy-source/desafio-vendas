// Teste de ponta a ponta da fatia 2 (insumos, receita dentro do sabor, produtos, kits), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Refaz o teste de aceite 1 pelas telas e confere custo e MC calculados pelo banco.
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

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await entrar(p, admin);

// ── Insumos: embalagem e preço, do jeito que se compra ───────────────────────
const FARINHA = nome("Farinha");
const LC = nome("Leite condensado");
const OVOS = nome("Ovos");
const ACUCAR = nome("Açúcar");
const EMB = nome("Embalagem");

await cadastrarInsumo(p, BASE, { nome: FARINHA, base: "g", tamanho: "1000", preco: "6,00" });
const idFarinha = await idInsumo(p, BASE, FARINHA);
const urlFarinha = `${BASE}/mais/insumos/${idFarinha}`;
await p.goto(urlFarinha);
await p.getByText("Embalagem e preço").first().waitFor();
confere(/R\$\s?0,006\/g/.test(await texto(p)), "Farinha: R$ 6,00 por embalagem de 1000 g vira R$ 0,006/g");
await verificarTela(p, "Insumo");
await p.screenshot({ path: `${CAPTURAS}/01-insumo-farinha.png`, fullPage: true });

await cadastrarInsumo(p, BASE, { nome: LC, base: "g", tamanho: "395", preco: "7,90" });
await p.goto(`${BASE}/mais/insumos/${await idInsumo(p, BASE, LC)}`);
await p.getByText("Embalagem e preço").first().waitFor();
confere(/R\$\s?7,90 por embalagem de 395 g/.test(await texto(p)) && /R\$\s?0,02\/g/.test(await texto(p)), "Leite condensado: R$ 7,90 por embalagem de 395 g = R$ 0,02/g");
await p.screenshot({ path: `${CAPTURAS}/02-insumo-leite-condensado.png`, fullPage: true });

await cadastrarInsumo(p, BASE, { nome: OVOS, base: "und", tamanho: "30", preco: "15,60" });
await p.goto(`${BASE}/mais/insumos/${await idInsumo(p, BASE, OVOS)}`);
await p.getByText("Embalagem e preço").first().waitFor();
confere(/R\$\s?0,52\/und/.test(await texto(p)), "Ovos: R$ 15,60 a bandeja de 30 = R$ 0,52/und");

await cadastrarInsumo(p, BASE, { nome: ACUCAR, base: "g", tamanho: "1000", preco: "4,80" });
await cadastrarInsumo(p, BASE, { nome: EMB, tipo: "embalagem", base: "und", tamanho: "1", preco: "0,08" });

// "kg" como outra unidade de compra é recusado com explicação (avançado).
await p.goto(urlFarinha);
await p.locator("summary", { hasText: "Outras unidades de compra" }).click();
await p.fill("#nova-unidade", "kg");
await p.fill("#nova-qtd", "1000");
await p.getByRole("button", { name: "Adicionar unidade" }).click();
await p.locator("p[role=alert]").waitFor();
confere((await p.locator("p[role=alert]").textContent()).includes("já é convertida automaticamente"), "Outra unidade chamada kg é recusada com explicação");

await p.goto(`${BASE}/mais/insumos`);
await p.getByText(FARINHA).waitFor();
await verificarTela(p, "Lista de insumos");
await p.screenshot({ path: `${CAPTURAS}/03-insumos.png`, fullPage: true });

// ── Produto com a receita dentro (teste de aceite 1) ─────────────────────────
const BOLO = nome("Bolo");
await criarProduto(p, BASE, { nome: BOLO, preco: "6,50" });
const urlBolo = p.url();
await p.getByText("Falta criar a receita deste sabor").waitFor();
confere(true, "Produto sem receita avisa o que falta");
await montarReceita(p, {
  rendimento: 24,
  ingredientes: [[FARINHA, "0,4", "kg"], [LC, "1,17", "embalagem"], [OVOS, "6", "und"], [ACUCAR, "550", "g"]],
});
await p.reload();
await p.getByText("Rende").first().waitFor();
let t = await texto(p);
confere(/fornada\s?R\$\s?17,40/.test(t), "Aceite 1: custo da fornada R$ 17,40 (17,403)");
confere(/R\$\s?0,73 cada/.test(t), "Aceite 1: custo por unidade R$ 0,73 (0,725125)");
confere(/1,17 embalagem = 462,15 g/.test(t), "1,17 embalagem aparece convertida em 462,15 g");
confere(/Custo\s?R\$\s?0,73/.test(t) && /Sobra\s?R\$\s?5,77/.test(t), "Bolo com a receita: custo R$ 0,73 e sobra R$ 5,77");
await verificarTela(p, "Produto com receita");
await p.screenshot({ path: `${CAPTURAS}/04-produto-receita.png`, fullPage: true });

await adicionarEmbalagem(p, EMB);
await p.reload();
await p.getByText("Embalagem de cada unidade vendida").first().waitFor();
t = await texto(p);
confere(/Custo\s?R\$\s?0,81/.test(t) && /Sobra\s?R\$\s?5,69/.test(t), "Com embalagem de R$ 0,08: custo R$ 0,81 e sobra R$ 5,69");
await verificarTela(p, "Produto");
await p.screenshot({ path: `${CAPTURAS}/05-produto.png`, fullPage: true });

const COMBO = nome("Combo");
await criarProduto(p, BASE, { nome: COMBO, tipo: "kit", preco: "12" });
await p.getByText("Adicione os produtos que formam o kit").waitFor();
await p.locator("summary", { hasText: "＋ Adicionar produto ao kit" }).click();
await p.locator('select[name="componente_id"]').selectOption({ label: BOLO });
await p.fill('input[id^="comp-qtd-"]', "2");
await p.getByRole("button", { name: "Adicionar", exact: true }).first().click();
await sucesso(p).waitFor();
await p.reload();
await p.getByText("Embalagem de cada unidade vendida").first().waitFor();
t = await texto(p);
confere(/Custo\s?R\$\s?1,61/.test(t) && /Sobra\s?R\$\s?10,39/.test(t), "Kit com 2 bolos: custo R$ 1,61 e sobra R$ 10,39");
await p.screenshot({ path: `${CAPTURAS}/06-kit.png`, fullPage: true });

// ── Teste de aceite 3 (parte de custo): mudar o preço do insumo ───────────────
await p.goto(urlFarinha);
await p.fill("#embalagem-preco", "7,20");
await p.getByRole("button", { name: "Salvar embalagem e preço" }).click();
await p.getByText("Embalagem e preço salvos.").waitFor();
await p.goto(urlBolo);
await p.getByText("Rende").first().waitFor();
t = await texto(p);
confere(/fornada\s?R\$\s?17,88/.test(t), "Farinha a R$ 7,20/kg: custo da fornada passa a R$ 17,88");
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
await pm.getByText("Embalagem de cada unidade vendida").first().waitFor();
confere((await pm.getByText("Nome, preço e se está à venda").count()) === 0 && (await pm.locator('input[name="preco"]').count()) === 0, "Membro vê o produto sem campos de edição");
await pm.goto(`${BASE}/mais/insumos`);
confere((await pm.getByText("＋ Cadastrar insumo").count()) === 0, "Membro não vê o cadastro de insumo");
await pm.screenshot({ path: `${CAPTURAS}/08-membro-produto.png`, fullPage: true });

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
