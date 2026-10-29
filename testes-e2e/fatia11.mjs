// Teste de ponta a ponta da fatia 11, em 375 px: custeio por peso (cubos de brownie com cobertura de chocolate).
// Monta a receita por peso, planeja, pesa, conclui e confere custos, estoque e telas.
// Roda contra o app ligado ao Supabase de TESTE.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { adicionarEmbalagem, cadastrarInsumo, criarProduto } from "./cadastro.mjs";

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

// ── Cadastro: massa (farinha + leite condensado), chocolate de cobertura e pote ──
const FARINHA = nome("Farinha");
const LEITE = nome("Leite cond");
const CHOC = nome("Chocolate");
const POTE = nome("Pote");
const CUBOS = nome("Cubos");
await cadastrarInsumo(p, BASE, { nome: FARINHA, tamanho: "1000", preco: "6", estoque: "5000" });
await cadastrarInsumo(p, BASE, { nome: LEITE, tamanho: "395", preco: "7,90", estoque: "3950" });
await cadastrarInsumo(p, BASE, { nome: CHOC, tamanho: "500", preco: "16", estoque: "5000" });
await cadastrarInsumo(p, BASE, { nome: POTE, tipo: "embalagem", base: "und", tamanho: "1", preco: "0,50", estoque: "100" });
await criarProduto(p, BASE, { nome: CUBOS, sabor: "Tradicional", preco: "10" });
await p.getByText("Este sabor ainda não tem receita").waitFor();

// ── 1. Receita por peso: ingredientes da massa, cobertura, pesos esperados e gramagem ──
const botao = p.getByRole("button", { name: "Cadastrar receita" });
await p.getByRole("button", { name: "Por peso" }).click();
confere((await p.getByRole("button", { name: "Por peso" }).getAttribute("aria-pressed")) === "true", "Receita: modo “Por peso” escolhido");
const l1 = p.getByRole("group", { name: "Ingrediente 1" });
await l1.locator('select[id$="-insumo"]').selectOption({ label: FARINHA });
await l1.locator('input[id$="-quantidade"]').fill("500");
await p.getByRole("button", { name: "Adicionar ingrediente" }).click();
const l2 = p.getByRole("group", { name: "Ingrediente 2" });
await l2.locator('select[id$="-insumo"]').selectOption({ label: LEITE });
await l2.locator('select[id$="-unidade"]').selectOption("embalagem");
await l2.locator('input[id$="-quantidade"]').fill("1");
confere(await botao.isDisabled(), "Receita por peso: botão desligado sem cobertura, pesos e gramagem");
await p.selectOption("#rc-cobertura", { label: CHOC });
await p.fill("#rc-cubos", "2000");
await p.fill("#rc-chocolate", "800");
await p.fill("#rc-gramagem", "150");
await p.getByText("Chocolate esperado").waitFor();
let t = await texto(p);
confere(/Chocolate esperado\s?R\$\s?25,60/.test(t), "Receita por peso: chocolate esperado 800 g × R$ 0,032 = R$ 25,60");
confere(/Custo por grama\s?R\$\s?0,013/.test(t), "Receita por peso: custo por grama (10,90 + 25,60) ÷ 2800 g ≈ R$ 0,013");
confere(/Potinho de 150 g[^R]*R\$\s?1,96/.test(t), "Receita por peso: potinho de 150 g custa R$ 1,96 de produto");
confere(/cerca de 18 potinhos/.test(t), "Receita por peso: uma fornada deve dar cerca de 18 potinhos");
await verificarTela(p, "Receita por peso em montagem");
await p.screenshot({ path: `${CAPTURAS}/01-receita-peso.png`, fullPage: true });
await botao.click();
await p.getByText(/Custeio\s+por peso/).waitFor({ timeout: 20000 });
await p.reload();
await p.getByText(/Custeio\s+por peso/).waitFor();
t = await texto(p);
confere(/potinho de 150 g/.test(t) && /R\$\s?1,96 de produto/.test(t), "Receita cadastrada: potinho de 150 g, R$ 1,96 de produto");
confere(/estimativa: ainda não pesaram nenhuma fornada/.test(t), "Antes de pesar, o custo por grama é marcado como estimativa");
await adicionarEmbalagem(p, POTE);
await p.reload();
t = await texto(p);
confere(/custo R\$\s?2,46/.test(t), "Com o pote (R$ 0,50) o custo do produto é R$ 2,46");
await verificarTela(p, "Produto custeado por peso");
await p.screenshot({ path: `${CAPTURAS}/02-produto-peso.png`, fullPage: true });

// ── 2. Planejar 2 fornadas e concluir pesando ───────────────────────────────
await p.goto(`${BASE}/estoque?aba=producao`);
await p.selectOption("#variacao_id", { label: `${CUBOS} · Tradicional` });
await p.fill("#fornadas", "2");
await p.getByRole("button", { name: "Planejar" }).click();
await p.locator("p[role=status]").last().waitFor();
await p.reload();
await p.locator("summary", { hasText: CUBOS }).first().click();
confere((await p.locator('input[name="peso_cubos"]').count()) === 1 && (await p.locator('input[name="peso_final"]').count()) === 1, "Concluir: pede o peso dos cubos e o peso com o chocolate");
await p.fill('input[name="peso_cubos"]', "3800");
await p.fill('input[name="peso_final"]', "3500");
await p.getByText("O peso com o chocolate precisa ser maior").waitFor();
confere(true, "Concluir: peso final menor que o dos cubos avisa na hora");
await p.fill('input[name="peso_final"]', "5200");
await p.getByText(/Chocolate gasto/).waitFor();
t = await texto(p);
confere(/Chocolate gasto\s?1\.400 g · R\$\s?44,80/.test(t), "Concluir: chocolate gasto 5200 − 3800 = 1.400 g, R$ 44,80");
confere(/Custo por grama desta fornada\s?R\$\s?0,0128/.test(t), "Concluir: custo por grama (21,80 + 44,80) ÷ 5200 g = R$ 0,0128");
confere(/Potinho de 150 g[^R]*R\$\s?1,92/.test(t), "Concluir: potinho de 150 g custa R$ 1,92 de produto");
confere(/cerca de 34 potinhos/.test(t), "Concluir: o peso comporta cerca de 34 potinhos");
await p.fill('input[name="boas"]', "40");
await p.getByText(/Você informou 40 potinhos, mas o peso comporta/).waitFor();
confere(true, "Concluir: avisa quando a quantidade digitada destoa do peso (sem impedir)");
await p.fill('input[name="boas"]', "33");
await p.fill('input[name="perdidas"]', "1");
await verificarTela(p, "Concluir produção por peso");
await p.screenshot({ path: `${CAPTURAS}/03-concluir-peso.png`, fullPage: true });
await p.getByRole("button", { name: "Concluir produção" }).first().click();
await esperarPagina(p, /^\/estoque\?aba=producao&feito=concluida/);
await p.getByText("Produção concluída").first().waitFor();
t = await texto(p);
confere(/cubos 3\.800 g → 5\.200 g/.test(t), "Concluídas recentes: mostra os pesos da fornada");

// ── 3. Estoque e custos depois de concluir ──────────────────────────────────
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(CHOC).waitFor();
confere(/3,6 kg/.test(await p.locator("a", { hasText: CHOC }).first().textContent()), "O chocolate que saiu do estoque é a diferença das pesagens: 5 kg − 1,4 kg = 3,6 kg");
confere(/4 kg/.test(await p.locator("a", { hasText: FARINHA }).first().textContent()), "A massa baixou 2 fornadas (farinha 5 kg → 4 kg)");
await p.goto(`${BASE}/estoque`);
await p.getByText(CUBOS).first().waitFor();
confere(/33 und/.test(await p.locator("a", { hasText: CUBOS }).first().textContent()), "33 potinhos prontos no estoque");
await p.goto(`${BASE}/mais/produtos`);
await p.getByRole("link", { name: new RegExp(CUBOS) }).first().click();
await esperarPagina(p, /^\/mais\/produtos\/[0-9a-f-]{36}$/);
await p.getByText(/pela última fornada pesada/).waitFor();
t = await texto(p);
confere(/Custo por grama R\$\s?0,0128 · pela última fornada pesada/.test(t), "O custo por grama agora vem da última fornada pesada");
confere(/custo R\$\s?2,42/.test(t), "O custo do produto acompanha: 150 g × R$ 0,0128 + pote = R$ 2,42");
await p.screenshot({ path: `${CAPTURAS}/04-produto-pesado.png`, fullPage: true });
const urlProduto = p.url();

// ── 4. Voltar a custear por unidades ────────────────────────────────────────
await p.locator("summary", { hasText: "Voltar a custear por unidades" }).first().click();
await p.fill('input[id^="vrend-"]', "20");
await p.getByRole("button", { name: "Voltar para unidades" }).click();
await p.getByText("Receita voltou a ser custeada pelo rendimento").waitFor();
await p.goto(urlProduto);
await p.getByText(/Rende\s+20\s+unidades/).waitFor();
confere(true, "Voltar para unidades: a receita rende 20 e o custo passa a ser da fornada ÷ 20");
await p.locator("summary", { hasText: "Custear por peso" }).first().waitFor();
confere(true, "A opção de custear por peso continua disponível");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
