// Teste de ponta a ponta da fatia 9 (cadastro simplificado e marca Choc Bites), em 375 px.
// Roda contra o app ligado ao Supabase de TESTE. Antes: supabase/testes/preparar-e2e-fatia2.sql.
// Confere: logo, ícones e manifesto do app; cores da marca nos dois temas; menu Mais em grupos;
// insumo com embalagem e preço (com a conta na tela); produto com sabores e a receita dentro;
// copiar receita de outro sabor; excluir só o que nunca foi usado; despesa grande não mexe no faturamento.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { cadastrarInsumo, criarProduto, idInsumo, montarReceita } from "./cadastro.mjs";

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

// Abre a linha do sabor se ela ainda estiver fechada (o primeiro sabor já vem aberto).
async function abrirCartao(cartao) {
  if (!(await cartao.evaluate((e) => e.open))) await cartao.locator("summary").first().click();
}

const navegador = await chromium.launch();
const celular = { viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" };

// ── Marca: ícones, manifesto, logo e cores (sem estar logado) ───────────────
const ctxAnon = await navegador.newContext(celular);
const pa0 = await ctxAnon.newPage();
const manifesto = await (await pa0.request.get(`${BASE}/manifest.webmanifest`)).json();
confere(manifesto.name?.includes("Choc Bites") && manifesto.short_name === "Choc Bites" && manifesto.display === "standalone", "Manifesto do app: nome Choc Bites e abre como aplicativo");
confere(manifesto.icons?.length >= 3 && manifesto.icons.some((i) => i.purpose === "maskable") && manifesto.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"), "Manifesto tem os ícones (192, 512 e o redondo do Android)");
for (const i of manifesto.icons) {
  const r = await pa0.request.get(`${BASE}${i.src}`);
  confere(r.ok() && r.headers()["content-type"] === "image/png", `Ícone ${i.src} abre sem precisar entrar`);
}
await pa0.goto(`${BASE}/entrar`);
const apple = await pa0.locator('link[rel="apple-touch-icon"]').getAttribute("href");
confere(Boolean(apple) && (await pa0.request.get(`${BASE}${apple.split("?")[0]}`)).ok(), "iPhone: ícone de tela inicial (apple-touch-icon) existe");
confere((await pa0.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content")) === "Choc Bites", "iPhone: o app se chama Choc Bites");
const logo = pa0.getByRole("img", { name: /Choc Bites/ });
await logo.waitFor();
confere((await logo.evaluate((i) => i.complete && i.naturalWidth > 100)), "Tela de entrada mostra a logo");
confere((await pa0.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(250, 240, 226)", "Fundo creme da logo (tema claro)");
await verificarTela(pa0, "Entrar");
await pa0.screenshot({ path: `${CAPTURAS}/01-entrar.png`, fullPage: true });
await ctxAnon.close();

const ctx = await navegador.newContext(celular);
const p = await ctx.newPage();
await entrar(p, admin);
confere((await p.locator("header").getByRole("img", { name: "Choc Bites" }).evaluate((i) => i.complete && i.naturalWidth > 50)), "Topo do sistema mostra a logo redonda");
const marcaAtiva = await p.evaluate(() => document.querySelector("nav[aria-label=Principal] a[aria-current=page] span")?.className ?? "");
confere(/bg-acento/.test(marcaAtiva), "Item ativo da barra de baixo destacado com o rosa da logo");
await p.screenshot({ path: `${CAPTURAS}/02-inicio.png`, fullPage: false });

// ── Menu Mais em grupos, sem "Receitas" ─────────────────────────────────────
await p.goto(`${BASE}/mais`);
const menu = await texto(p);
confere(["Cadastros", "Desafio", "Relatórios e ajuda"].every((g) => menu.includes(g)), "Mais: Cadastros, Desafio e Relatórios e ajuda");
confere((await p.getByRole("link", { name: /^Receitas/ }).count()) === 0 && (await p.getByRole("link", { name: /Produtos e sabores/ }).count()) === 1, "Mais: não há tela de Receitas (a receita fica dentro do sabor)");
await verificarTela(p, "Mais");
await p.screenshot({ path: `${CAPTURAS}/03-mais.png`, fullPage: true });

// ── Insumo: a conta aparece na tela antes de salvar ─────────────────────────
const CHOC = nome("Chocolate");
const LEITE = nome("Leite condensado");
const DESC = nome("Descartável");
await p.goto(`${BASE}/mais/insumos`);
await p.locator("summary", { hasText: "＋ Cadastrar insumo" }).click();
await p.fill("#nome", CHOC);
await p.fill("#novo-tamanho", "500");
await p.fill("#novo-preco", "16,00");
await p.getByText("Cada g custa").waitFor();
confere(/Cada g custa R\$\s?0,032/.test(await texto(p)), "Cadastro do insumo mostra a conta: R$ 16,00 ÷ 500 g = R$ 0,032 por g");
await p.screenshot({ path: `${CAPTURAS}/04-cadastro-insumo.png`, fullPage: true });
await verificarTela(p, "Cadastro de insumo");
await cadastrarInsumo(p, BASE, { nome: CHOC, tamanho: "500", preco: "16,00", estoque: "1500" });
await cadastrarInsumo(p, BASE, { nome: LEITE, tamanho: "395", preco: "7,90" });
const idChoc = await idInsumo(p, BASE, CHOC);
await p.goto(`${BASE}/mais/insumos/${idChoc}`);
await p.getByText("Em estoque").waitFor();
let t = await texto(p);
confere(/R\$\s?16,00 por embalagem de 500 g/.test(t) && /R\$\s?0,032\/g/.test(t), "Insumo cadastrado com embalagem e preço");
confere(/Em estoque\s?1,5 kg/.test(t), "Estoque inicial de 1500 g aparece como 1,5 kg");
await p.goto(`${BASE}/compras/nova`);
await p.getByRole("group", { name: "Item 1" }).locator("select").first().selectOption({ label: CHOC });
{
  const item = p.getByRole("group", { name: "Item 1" });
  await item.getByText("Embalagem de 500 g").waitFor();
  confere((await item.locator("select").count()) === 1, "Na compra, não há escolha de unidade: só o insumo");
}

// ── Produto com sabores e a receita dentro ──────────────────────────────────
const BITES = nome("Bites");
await criarProduto(p, BASE, { nome: BITES, sabor: "Tradicional", preco: "5" });
const urlBites = p.url();
await p.getByText("Este sabor ainda não tem receita").waitFor();
await verificarTela(p, "Produto novo");
await montarReceita(p, { rendimento: 20, ingredientes: [[CHOC, "200", "g"], [LEITE, "1", "embalagem"]] });
await p.reload();
await p.getByText("Rende").first().waitFor();
t = await texto(p);
confere(/fornada\s?R\$\s?14,30/.test(t) && /R\$\s?0,72 cada/.test(t), "Receita do sabor: fornada R$ 14,30 (6,40 + 7,90) e R$ 0,72 por unidade");
await p.screenshot({ path: `${CAPTURAS}/05-produto-receita.png`, fullPage: true });

// Novo sabor começando com a receita do primeiro.
await p.locator("summary", { hasText: "＋ Adicionar sabor" }).click();
await p.fill("#var-nome", "Ninho");
await p.fill("#var-preco", "6");
await p.selectOption("#var-copiar", { label: `${BITES} · Tradicional` });
await p.getByRole("button", { name: "Adicionar sabor", exact: true }).click();
await sucesso(p).filter({ hasText: "receita copiada" }).waitFor();
confere(true, "Novo sabor criado com a receita copiada do Tradicional");
await p.reload();
const cartaoNinho = p.locator("details").filter({ has: p.locator("summary").filter({ hasText: "Ninho" }) }).first();
await abrirCartao(cartaoNinho);
await cartaoNinho.getByText("Rende").first().waitFor();
const tn = (await cartaoNinho.textContent()).replace(/\s+/g, " ");
confere(/Rende cerca de 20 unidades/.test(tn) && /fornada\s?R\$\s?14,30/.test(tn) && /Choc|Chocolate/.test(tn), "O sabor Ninho tem os mesmos ingredientes, rendimento e custo");
await verificarTela(p, "Produto com dois sabores");
await p.screenshot({ path: `${CAPTURAS}/06-dois-sabores.png`, fullPage: true });

// Troca um ingrediente só no Ninho: o Tradicional não muda.
await cartaoNinho.locator("summary", { hasText: CHOC }).first().click();
await cartaoNinho.locator('input[name="quantidade"]').first().fill("100");
await cartaoNinho.getByRole("button", { name: "Salvar", exact: true }).first().click();
await sucesso(cartaoNinho).filter({ hasText: "Quantidade salva" }).waitFor();
await p.reload();
const grupos = await p.locator("details").filter({ has: p.locator("summary").filter({ hasText: /^(Tradicional|Ninho)/ }) }).all();
confere(grupos.length === 2, "Os dois sabores aparecem em linhas que abrem");
const cartaoTrad = p.locator("details").filter({ has: p.locator("summary").filter({ hasText: "Tradicional" }) }).first();
await abrirCartao(cartaoTrad);
confere(/fornada\s?R\$\s?14,30/.test((await cartaoTrad.textContent()).replace(/\s+/g, " ")), "Mudar o Ninho não mexeu no custo do Tradicional (R$ 14,30)");

// ── Excluir: sabor sem uso sai; insumo em receita não ───────────────────────
const cartaoNinho2 = p.locator("details").filter({ has: p.locator("summary").filter({ hasText: "Ninho" }) }).first();
await abrirCartao(cartaoNinho2);
await cartaoNinho2.locator("summary", { hasText: "Excluir este sabor" }).click();
await cartaoNinho2.getByRole("button", { name: "Excluir Ninho" }).click();
await p.getByText("Sabor excluído.").waitFor();
confere((await p.locator("summary").filter({ hasText: /^Ninho/ }).count()) === 0 && (await p.locator("summary").filter({ hasText: /^Tradicional/ }).count()) === 1, "Sabor excluído: some do produto, com a receita dele");

await p.goto(`${BASE}/mais/insumos/${idChoc}`);
await p.getByText("Em estoque").waitFor();
t = await texto(p);
confere(t.includes("Não dá para excluir: Está em uma receita"), "Insumo que está numa receita não pode ser excluído (a tela explica)");
confere((await p.getByRole("button", { name: /^Excluir/ }).count()) === 0, "…e o botão Excluir nem aparece");
await p.screenshot({ path: `${CAPTURAS}/07-insumo-em-uso.png`, fullPage: true });

// Insumo que nunca foi usado (só tem contagem de estoque): exclui.
await cadastrarInsumo(p, BASE, { nome: DESC, tamanho: "100", preco: "5", estoque: "300" });
await p.goto(`${BASE}/mais/insumos/${await idInsumo(p, BASE, DESC)}`);
await p.locator("summary", { hasText: "Excluir este insumo" }).click();
await p.screenshot({ path: `${CAPTURAS}/08-excluir-insumo.png`, fullPage: true });
await p.getByRole("button", { name: `Excluir ${DESC}` }).click();
await esperarPagina(p, /^\/mais\/insumos$/);
await p.getByText("Insumo excluído.").waitFor();
confere((await p.getByText(DESC).count()) === 0, "Insumo sem uso excluído: sai da lista");

// Produto sem uso: exclui inteiro.
const TESTE = nome("Produto de teste");
await criarProduto(p, BASE, { nome: TESTE, preco: "3" });
await p.locator("summary", { hasText: "Excluir este produto" }).click();
await p.getByRole("button", { name: `Excluir ${TESTE}` }).click();
await esperarPagina(p, /^\/mais\/produtos$/);
await p.getByText("Produto excluído.").waitFor();
confere((await p.getByText(TESTE).count()) === 0, "Produto sem uso excluído com tudo o que tinha dentro");

// ── Membro: vê o motivo, mas não tem o botão ────────────────────────────────
const ctxM = await navegador.newContext(celular);
const pm = await ctxM.newPage();
await entrar(pm, membro);
await pm.goto(urlBites);
await pm.getByText("Rende").first().waitFor();
confere((await pm.getByRole("button", { name: /^Excluir/ }).count()) === 0 && (await pm.getByText("＋ Adicionar sabor").count()) === 0, "Membro vê a receita, sem editar nem excluir");

// ── Despesa grande: o faturamento da meta não é afetado; o lucro estimado fica negativo ─────
await pm.goto(`${BASE}/caixa/despesa`);
await pm.fill("#valor", "5000,00");
await pm.fill("#descricao", `Despesa grande ${S}`);
await pm.getByRole("button", { name: "Registrar despesa" }).click();
await sucesso(pm).waitFor();
await p.goto(`${BASE}/`);
await p.getByText("Faturamento").first().waitFor();
t = await texto(p);
confere(!t.includes("O resultado está negativo") && !/-\d+(,\d+)?% da meta/.test(t), "Início: despesa grande não gera aviso de resultado negativo nem porcentagem negativa");
confere(/Lucro estimado:\s?-R\$\s?\d/.test(t), "Início: o lucro estimado negativo aparece só como informação");
confere(Number(await p.locator("[role=progressbar]").getAttribute("aria-valuenow")) >= 0, "Barra da meta (faturamento) segue válida");
await verificarTela(p, "Início com lucro negativo");
await p.screenshot({ path: `${CAPTURAS}/09-lucro-negativo.png`, fullPage: false });
// desfaz: cancela a despesa para não sujar os outros testes
await pm.reload();
await pm.locator("summary", { hasText: `Despesa grande ${S}` }).click();
await pm.locator('input[name="motivo"]').first().fill("Teste da tela");
await pm.getByRole("button", { name: "Cancelar despesa" }).first().click();
await pm.getByText(/Cancelada em .*Teste da tela/).first().waitFor();
await p.goto(`${BASE}/`);
confere(!/Lucro estimado:\s?-R\$/.test(await texto(p)), "Cancelada a despesa, o lucro estimado deixa de ser negativo");

// ── Tema escuro com as cores da marca ───────────────────────────────────────
const ctxE = await navegador.newContext({ ...celular, colorScheme: "dark" });
const pe = await ctxE.newPage();
await entrar(pe, admin);
const escuro = await pe.evaluate(() => ({ fundo: getComputedStyle(document.body).backgroundColor, acao: getComputedStyle(document.querySelector("main")).color }));
confere(escuro.fundo === "rgb(30, 15, 9)", `Tema escuro: fundo chocolate (${escuro.fundo})`);
await pe.goto(`${BASE}/mais/produtos`);
await pe.getByRole("heading", { name: "Produtos e sabores" }).waitFor();
await pe.screenshot({ path: `${CAPTURAS}/10-escuro-produtos.png`, fullPage: false });
await verificarTela(pe, "Produtos (escuro)");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
