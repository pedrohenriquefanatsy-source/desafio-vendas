// Teste de ponta a ponta da fatia 12, em 375 px: faturamento na meta, produção simples (fornadas + quantos renderam),
// custo pelo rendimento real, correção, aviso de falta sem travar, contagem do dia, encomenda com pagamento
// adiantado e título da venda com vendedor - cliente · horário.
// Roda contra o app ligado ao Supabase de TESTE.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { adicionarEmbalagem, cadastrarInsumo, criarProduto, montarReceita } from "./cadastro.mjs";

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

// ── Faturamento no Início ────────────────────────────────────────────────────
await p.goto(`${BASE}/`);
await p.getByText("Ritmo necessário").waitFor();
let t = await texto(p);
confere(/Faturamento\s?realizado/.test(t) && !/Resultado\s?realizado/.test(t), "Início: o número principal é o faturamento");
await verificarTela(p, "Início");
await p.screenshot({ path: `${CAPTURAS}/01-inicio-faturamento.png`, fullPage: true });

// ── Receita fixa por fornada: farinha + chocolate, rende ~12 ─────────────────
const FARINHA = nome("Farinha");
const CHOC = nome("Chocolate");
const POTE = nome("Pote");
const BITES = nome("Bites");
await cadastrarInsumo(p, BASE, { nome: FARINHA, tamanho: "1000", preco: "6", estoque: "5000" });
await cadastrarInsumo(p, BASE, { nome: CHOC, tamanho: "500", preco: "16", estoque: "1000" });
await cadastrarInsumo(p, BASE, { nome: POTE, tipo: "embalagem", base: "und", tamanho: "1", preco: "0,50", estoque: "100" });
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "12" });
await montarReceita(p, { rendimento: 12, ingredientes: [[FARINHA, "500", "g"], [CHOC, "400", "g"]] });
await adicionarEmbalagem(p, POTE);
await p.reload();
t = await texto(p);
confere(/Rende cerca de 12 unidades por fornada/.test(t) && /esperado, até registrar uma produção/.test(t), "Receita: antes de produzir, o rendimento é o esperado (12)");
confere(/fornada R\$\s?15,80/.test(t), "Receita: fornada R$ 15,80 (farinha 3,00 + chocolate 12,80)");
const urlProduto = p.url();

// ── Simulação (nada gravado) ─────────────────────────────────────────────────
await p.goto(`${BASE}/estoque/simular`);
await p.getByLabel(`Fornadas de ${BITES} · Tradicional`).fill("3");
await p.getByRole("button", { name: "Simular", exact: true }).click();
await p.getByText("O que isso rende").waitFor();
t = await texto(p);
confere(new RegExp(`${CHOC}\\s?precisa 1\\.200 g · tem 1\\.000\\s?comprar 200 g`).test(t), "Simulação: 3 fornadas precisam de 1.200 g de chocolate, tem 1.000, comprar 200 g");
confere(/3 fornadas de .*≈ 36 potinhos/.test(t), "Simulação: 3 fornadas rendem cerca de 36 potinhos");
await verificarTela(p, "Simular produção");

// ── Registrar produção: só os potinhos prontos (24 com receita de ~12 = 2 fornadas) ──
await p.goto(`${BASE}/estoque?aba=producao`);
await p.selectOption("#variacao_id", { label: `${BITES} · Tradicional` });
await p.fill("#boas", "24");
confere((await p.locator("#fornadas").count()) === 0, "Registrar produção: não pede fornadas, só os potinhos prontos");
await verificarTela(p, "Registrar produção");
await p.screenshot({ path: `${CAPTURAS}/02-registrar-producao.png`, fullPage: true });
await p.getByRole("button", { name: "Registrar produção" }).first().click();
await p.waitForURL((u) => u.searchParams.get("feito") === "registrada", { timeout: 20000, waitUntil: "commit" });
await p.getByText("Produção registrada").first().waitFor();
t = await texto(p);
confere(!t.includes("o estoque não tinha tudo"), "Produção com insumos em dia: sem aviso");
confere(/2 fornada\(s\) · 24 renderam/.test(t), "Produções recentes: o sistema calculou 2 fornadas para 24 potinhos");
await p.goto(urlProduto);
await p.getByText(/pela última produção registrada/).waitFor();
t = await texto(p);
confere(/Rende cerca de 12 unidades por fornada/.test(t), "O produto mostra o rendimento: 24 ÷ 2 = 12 por fornada");
await p.goto(`${BASE}/estoque`);
await p.getByText(BITES).first().waitFor();
confere(/24 und/.test(await p.locator("a", { hasText: BITES }).first().textContent()), "24 potinhos prontos no estoque");
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(CHOC).waitFor();
confere(/200 g/.test(await p.locator("a", { hasText: CHOC }).first().textContent()), "Chocolate: 1.000 g − 800 g = 200 g");

// ── Corrigir quanto rendeu ───────────────────────────────────────────────────
await p.goto(`${BASE}/estoque?aba=producao`);
await p.locator("summary", { hasText: BITES }).first().click();
await p.locator('input[id^="corr-"]').first().fill("18");
await p.getByRole("button", { name: "Corrigir quanto rendeu" }).first().click();
await p.getByText(/Corrigido: o estoque/).waitFor();
await p.goto(`${BASE}/estoque`);
await p.getByText(BITES).first().waitFor();
confere(/18 und/.test(await p.locator("a", { hasText: BITES }).first().textContent()), "Corrigido para 18: o estoque do produto passa a 18");
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(CHOC).waitFor();
confere(/400 g/.test(await p.locator("a", { hasText: CHOC }).first().textContent()), "Corrigido para 18: fornadas viram 1,5 e o chocolate volta para 400 g");

// ── Faltou chocolate: registra mesmo assim e avisa ───────────────────────────
await p.goto(`${BASE}/estoque?aba=producao`);
await p.selectOption("#variacao_id", { label: `${BITES} · Tradicional` });
await p.fill("#boas", "36");
await p.getByRole("button", { name: "Registrar produção" }).first().click();
await p.waitForURL((u) => u.searchParams.get("feito") === "registrada", { timeout: 20000, waitUntil: "commit" });
await p.getByText("o estoque não tinha tudo").waitFor();
t = await texto(p);
confere(new RegExp(`${CHOC}: faltavam 800 g`).test(t), "Faltou chocolate: 36 potinhos = 3 fornadas, registra mesmo assim e avisa quanto faltava (800 g)");
await p.screenshot({ path: `${CAPTURAS}/03-producao-com-aviso.png`, fullPage: true });

// ── Contagem do dia: acerta o chocolate ─────────────────────────────────────
await p.goto(`${BASE}/estoque/contagem`);
await p.getByLabel(`Contagem de ${CHOC}`).fill("500");
await verificarTela(p, "Contagem do dia");
await p.screenshot({ path: `${CAPTURAS}/04-contagem.png`, fullPage: false });
await p.getByRole("button", { name: "Salvar contagem" }).click();
await p.getByText(/Contagem registrada: 1 item ajustado/).waitFor({ timeout: 20000 });
await p.goto(`${BASE}/estoque?aba=insumos`);
await p.getByText(CHOC).waitFor();
confere(/500 g/.test(await p.locator("a", { hasText: CHOC }).first().textContent()), "Contagem do dia: o chocolate passa a ser os 500 g contados");

// ── Encomenda: pagou uma parte; o restante é recebido na entrega ────────────
const CLIENTE = nome("Dona Rita");
const amanha = new Date(Date.now() + 27 * 3600 * 1000).toISOString().slice(0, 10);
await p.goto(`${BASE}/vendas/nova`);
const tile = p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first();
await tile.click();
await tile.click();
const botaoEncomenda = p.getByRole("button", { name: "Encomenda", exact: true });
confere(await botaoEncomenda.isVisible(), "Nova venda: “Encomenda” aparece sem abrir “Mais opções”");
await botaoEncomenda.click();
await p.fill('input[name="entrega"]', amanha);
await p.getByRole("button", { name: "Pagou uma parte" }).click();
await p.fill('input[name="valor_recebido"]', "10,00");
await p.getByText(/Falta receber na entrega:\s?R\$\s?14,00/).waitFor();
confere(true, "Encomenda de R$ 24,00 com R$ 10,00 já recebidos: mostra “falta receber na entrega R$ 14,00”");
await p.fill('input[name="cliente"]', CLIENTE);
await verificarTela(p, "Nova encomenda");
await p.screenshot({ path: `${CAPTURAS}/05-nova-encomenda.png`, fullPage: true });
const antes = p.url();
await p.getByRole("button", { name: /^Confirmar encomenda/ }).click();
await p.waitForURL((u) => u.href !== antes && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
const idVenda = new URL(p.url()).searchParams.get("id");
await p.goto(`${BASE}/vendas/${idVenda}`);
await p.getByText("Falta receber").first().waitFor();
t = await texto(p);
confere(/Recebido\s?R\$\s?10,00/.test(t) && /Falta receber\s?R\$\s?14,00/.test(t), "Detalhe: recebido 10,00 e falta receber 14,00");
await p.getByLabel(/Recebi o restante/).check();
await p.getByRole("button", { name: "Marcar como entregue" }).click();
await p.getByText("Encomenda entregue").waitFor({ timeout: 20000 });
t = await texto(p);
confere(/Recebido\s?R\$\s?24,00/.test(t) && !t.includes("Falta receber"), "Entregue recebendo o restante: recebido 24,00 e nada a receber");
await p.screenshot({ path: `${CAPTURAS}/06-encomenda-entregue.png`, fullPage: true });

// ── Título da venda: vendedor - cliente · horário ───────────────────────────
await p.goto(`${BASE}/vendas?ver=todas`);
await p.getByText(CLIENTE).first().waitFor();
const tituloVenda = (await p.locator("a", { hasText: CLIENTE }).first().textContent()).replace(/\s+/g, " ");
confere(new RegExp(` - ${CLIENTE} · \\d{2}:\\d{2}`).test(tituloVenda), `Lista de vendas: título “vendedor - cliente · horário” (${tituloVenda.slice(0, 60)})`);
await verificarTela(p, "Lista de vendas");
await p.screenshot({ path: `${CAPTURAS}/07-lista-vendas.png`, fullPage: false });

// ── Faturamento sobe com a venda entregue ───────────────────────────────────
await p.goto(`${BASE}/`);
await p.getByText("Ritmo necessário").waitFor();
t = await texto(p);
confere(/Faturamento\s?realizado\s?R\$\s?[\d.]*[1-9]/.test(t), "Início: o faturamento inclui a encomenda entregue");

// ── Encomenda paga por inteiro já conta no faturamento, antes de entregar ───
const lerFaturamento = (x) => Number(x.match(/Faturamento\s?realizado\s?R\$\s?([\d.]+,\d{2})/)[1].replace(/\./g, "").replace(",", "."));
const faturamentoAntes = lerFaturamento(t);
await p.goto(`${BASE}/vendas/nova`);
await p.getByRole("list", { name: "Produtos" }).getByRole("button", { name: new RegExp(`^${BITES}`) }).first().click();
await p.getByRole("button", { name: "Encomenda", exact: true }).click();
await p.fill('input[name="entrega"]', amanha);
await p.getByRole("button", { name: "Pagou tudo" }).click();
const antesPaga = p.url();
await p.getByRole("button", { name: /^Confirmar encomenda/ }).click();
await p.waitForURL((u) => u.href !== antesPaga && u.searchParams.has("ok"), { timeout: 20000, waitUntil: "commit" });
await p.goto(`${BASE}/`);
await p.getByText("Ritmo necessário").waitFor();
const faturamentoDepois = lerFaturamento(await texto(p));
confere(Math.abs(faturamentoDepois - faturamentoAntes - 12) < 0.01, `Início: encomenda paga por inteiro (R$ 12,00) entra no faturamento sem entregar (${faturamentoAntes} → ${faturamentoDepois})`);
await p.screenshot({ path: `${CAPTURAS}/08-encomenda-paga-no-faturamento.png`, fullPage: true });

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
