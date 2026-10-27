// Teste de ponta a ponta da fatia 1, no navegador, em tela de celular (375 px).
// Roda contra o app ligado ao Supabase de TESTE. Nunca use com o banco principal.
//
//   BASE_URL=http://localhost:3000 \
//   E2E_ADMIN_EMAIL=... E2E_ADMIN_SENHA=... E2E_MEMBRO_EMAIL=... E2E_MEMBRO_SENHA=... \
//   PASTA_CAPTURAS=/caminho node testes-e2e/fatia1.mjs
//
// Pré-condição (rode antes supabase/testes/preparar-e2e-fatia1.sql no banco de TESTE):
// admin ativo e sem nome, membro desativado e sem nome, nenhum desafio em andamento
// ou planejado. Nada é apagado: cada rodada usa nomes únicos.
import { createRequire } from "node:module";
// O Playwright do ambiente é instalado globalmente; `require` o encontra.
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAPTURAS = process.env.PASTA_CAPTURAS ?? "capturas";
const admin = { email: process.env.E2E_ADMIN_EMAIL, senha: process.env.E2E_ADMIN_SENHA };
const membro = { email: process.env.E2E_MEMBRO_EMAIL, senha: process.env.E2E_MEMBRO_SENHA };
if (!admin.email || !admin.senha || !membro.email || !membro.senha) {
  throw new Error("Defina E2E_ADMIN_EMAIL, E2E_ADMIN_SENHA, E2E_MEMBRO_EMAIL e E2E_MEMBRO_SENHA.");
}
mkdirSync(CAPTURAS, { recursive: true });
const SUFIXO = new Date().toISOString().slice(11, 19).replace(/:/g, "");
const NOME_DESAFIO = `Desafio TESTE ${SUFIXO}`;
const NOME_FORMA = `Cartão TESTE ${SUFIXO}`;

const resultados = [];
function confere(condicao, descricao) {
  resultados.push({ ok: Boolean(condicao), descricao });
  console.log(`${condicao ? "PASSOU" : "FALHOU"}  ${descricao}`);
}

const navegador = await chromium.launch();
const celular = { viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR" };

async function semRolagemLateral(pagina, nome) {
  const largura = await pagina.evaluate(() => document.documentElement.scrollWidth);
  confere(largura <= 375, `${nome}: sem rolagem lateral em 375 px (largura ${largura})`);
}

async function alvosDeToque(pagina, nome) {
  const pequenos = await pagina.evaluate(() =>
    [...document.querySelectorAll("button, a, input:not([type=hidden]), select")]
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ e, r }) => r.height < 44 && !(e.type === "checkbox" && e.closest("label")?.getBoundingClientRect().height >= 44))
      .map(({ e, r }) => `${e.tagName}:${(e.textContent || e.name || "").trim().slice(0, 20)}(${Math.round(r.height)}px)`),
  );
  confere(pequenos.length === 0, `${nome}: alvos de toque com 44 px ou mais${pequenos.length ? ` — menores: ${pequenos.join(", ")}` : ""}`);
}

// Mensagem de erro do formulário (o Next também usa role=alert para anunciar páginas).
const aviso = (local) => local.locator("p[role=alert]");
const esperarPagina = (pagina, caminho) =>
  pagina.waitForURL((u) => u.pathname === caminho, { timeout: 20000, waitUntil: "commit" });

async function entrar(pagina, quem, destino) {
  await pagina.goto(`${BASE}/entrar`);
  await pagina.fill("#email", quem.email);
  await pagina.fill("#senha", quem.senha);
  await pagina.click("button[type=submit]");
  await esperarPagina(pagina, destino);
}

// 1. Sem login, tudo leva para /entrar.
{
  const ctx = await navegador.newContext(celular);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/mais/participantes`);
  confere(new URL(p.url()).pathname === "/entrar", "Sem login, uma tela interna leva para Entrar");
  await semRolagemLateral(p, "Entrar");
  await alvosDeToque(p, "Entrar");
  await p.screenshot({ path: `${CAPTURAS}/01-entrar.png`, fullPage: true });

  await p.fill("#email", admin.email);
  await p.fill("#senha", "senha-errada-123");
  await p.click("button[type=submit]");
  await aviso(p).waitFor();
  confere((await aviso(p).textContent()).includes("E-mail ou senha incorretos"), "Senha errada mostra mensagem que diz como resolver");
  await p.screenshot({ path: `${CAPTURAS}/02-senha-errada.png`, fullPage: true });
  await ctx.close();
}

// 2. Admin: primeiro acesso, desafio, formas de pagamento.
const ctxAdmin = await navegador.newContext(celular);
const pa = await ctxAdmin.newPage();
await entrar(pa, admin, "/primeiro-acesso");
await pa.locator("#nome").waitFor();
confere(true, "Admin sem nome cai no Primeiro acesso");
await pa.screenshot({ path: `${CAPTURAS}/03-primeiro-acesso.png`, fullPage: true });
await pa.fill("#nome", "Admin Teste");
await pa.click("button[type=submit]");
await esperarPagina(pa, "/");
await pa.getByText("Nenhum desafio cadastrado").waitFor();
confere(await pa.getByRole("link", { name: "Cadastrar desafio" }).isVisible(), "Início sem desafio mostra estado vazio com ação");
await semRolagemLateral(pa, "Início vazio");
await alvosDeToque(pa, "Início vazio");
await pa.screenshot({ path: `${CAPTURAS}/04-inicio-vazio.png`, fullPage: true });

await pa.goto(`${BASE}/mais/desafios/novo`);
await pa.fill("#nome", NOME_DESAFIO);
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
await pa.fill("#inicio", somaDias(hoje, -2));
await pa.fill("#fim", somaDias(hoje, 4));
await pa.fill("#meta_resultado", "abc");
await pa.selectOption("#situacao", "em_andamento");
await pa.click("button[type=submit]");
await aviso(pa).waitFor();
confere((await aviso(pa).textContent()).includes("maior que zero"), "Meta inválida explica o formato esperado");
await pa.fill("#meta_resultado", "R$ 1.500,00");
// Duplo toque no botão: deve gravar um desafio só.
await pa.locator("button[type=submit]").dblclick();
await esperarPagina(pa, "/mais/desafios");
await pa.getByText(NOME_DESAFIO).first().waitFor();
const linhas = await pa.getByText(NOME_DESAFIO).count();
confere(linhas === 1, `Duplo toque em Cadastrar grava um desafio só (encontrados: ${linhas})`);
await pa.screenshot({ path: `${CAPTURAS}/05-desafios.png`, fullPage: true });

await pa.goto(`${BASE}/`);
await pa.locator("dd").first().waitFor();
const texto = await pa.locator("main").textContent();
confere(texto.includes(NOME_DESAFIO) && /R\$\s?1\.500,00/.test(texto), "Início mostra o desafio e a meta de R$ 1.500,00");
// Desafio de 7 dias que começou anteontem: o painel mostra o período e 5 dias restantes (com hoje).
const inicio = new Date(Date.now() - 3 * 3600 * 1000 - 2 * 86_400_000).toISOString().slice(0, 10).split("-").reverse().join("/");
const fim = new Date(Date.now() - 3 * 3600 * 1000 + 4 * 86_400_000).toISOString().slice(0, 10).split("-").reverse().join("/");
const limpo = texto.replace(/\s+/g, " ");
confere(limpo.includes(`${inicio} a ${fim}`) && /Faltam \(com hoje\)\s?5 dias/.test(limpo), `Início mostra o período de 7 dias (${inicio} a ${fim}) e 5 dias restantes`);
await semRolagemLateral(pa, "Início com desafio");
await pa.screenshot({ path: `${CAPTURAS}/06-inicio-desafio.png`, fullPage: true });

await pa.goto(`${BASE}/mais/formas-pagamento`);
await pa.fill("#nova-nome", NOME_FORMA);
await pa.fill("#nova-taxa", "3,99");
await pa.locator("form").last().locator("button[type=submit]").click();
await pa.getByText(`${NOME_FORMA} cadastrada.`).waitFor();
confere(await pa.locator(`input[value="${NOME_FORMA}"]`).count() === 1, "Forma de pagamento nova aparece na lista");
await pa.fill("#nova-nome", "pix");
await pa.locator("form").last().locator("button[type=submit]").click();
await aviso(pa).waitFor();
confere((await aviso(pa).textContent()).includes("Já existe"), "Nome repetido (pix/Pix) é recusado com mensagem clara");
await semRolagemLateral(pa, "Formas de pagamento");
await alvosDeToque(pa, "Formas de pagamento");
await pa.screenshot({ path: `${CAPTURAS}/07-formas-pagamento.png`, fullPage: true });

// 3. Membro desativado vê a tela de acesso pendente.
const ctxMembro = await navegador.newContext(celular);
const pm = await ctxMembro.newPage();
await entrar(pm, membro, "/acesso-pendente");
await pm.getByText("Acesso ainda não liberado").waitFor();
confere(true, "Membro novo (desativado) cai em Acesso pendente");
await pm.screenshot({ path: `${CAPTURAS}/08-acesso-pendente.png`, fullPage: true });

// 4. Admin ativa o membro.
await pa.goto(`${BASE}/mais/participantes`);
await pa.getByText("Como adicionar alguém").waitFor();
confere(await pa.getByText("Aguardando", { exact: true }).count() === 1, "Admin vê 1 participante aguardando ativação");
const cartaoMembro = pa.locator("details").filter({ has: pa.getByText("Aguardando", { exact: true }) });
await cartaoMembro.locator('input[name="ativo"]').check();
await cartaoMembro.locator("button[type=submit]").click();
await pa.getByText("Participante atualizado.").waitFor();
await pa.screenshot({ path: `${CAPTURAS}/09-participantes.png`, fullPage: true });

// Tentar tirar o próprio papel de admin (único admin) é recusado.
const cartaoAdmin = pa.locator("details").filter({ hasText: "(você)" });
await cartaoAdmin.locator("summary").click();
await cartaoAdmin.locator('select[name="papel"]').selectOption("membro");
await cartaoAdmin.locator("button[type=submit]").click();
await aviso(cartaoAdmin).waitFor();
confere((await aviso(cartaoAdmin).textContent()).includes("pelo menos um administrador"), "Não deixa o sistema sem administrador");

// 5. Membro ativo: primeiro acesso, vê dados, não altera.
await pm.goto(`${BASE}/`);
await esperarPagina(pm, "/primeiro-acesso");
await pm.locator("#nome").waitFor();
confere(true, "Membro ativado vai para o Primeiro acesso");
await pm.fill("#nome", "Membro Teste");
await pm.click("button[type=submit]");
await esperarPagina(pm, "/");
await pm.getByText(NOME_DESAFIO).waitFor();
confere((await pm.locator("main").textContent()).includes(NOME_DESAFIO), "Membro vê o desafio no Início");
await pm.goto(`${BASE}/mais/desafios/novo`);
await esperarPagina(pm, "/mais/desafios");
confere(await pm.locator("#nome").count() === 0, "Membro não abre o cadastro de desafio");
await pm.goto(`${BASE}/mais/formas-pagamento`);
await pm.getByText(NOME_FORMA).waitFor();
confere(await pm.locator('input[name="taxa"]').count() === 0, "Membro vê as formas de pagamento sem campos de edição");
await pm.screenshot({ path: `${CAPTURAS}/10-formas-membro.png`, fullPage: true });

// 6. Sem conexão: aparece a faixa de aviso e um envio não se perde em silêncio.
await ctxMembro.setOffline(true);
await pm.evaluate(() => window.dispatchEvent(new Event("offline")));
await pm.getByText("Sem conexão.").waitFor({ timeout: 5000 });
confere(true, "Sem conexão: aparece a faixa avisando que nada será salvo");
await pm.screenshot({ path: `${CAPTURAS}/11-sem-conexao.png`, fullPage: true });
await ctxMembro.setOffline(false);

// Admin tenta salvar uma forma de pagamento sem conexão.
await pa.goto(`${BASE}/mais/formas-pagamento`);
await pa.fill("#nova-nome", `${NOME_FORMA} B`);
await pa.fill("#nova-taxa", "2,5");
await ctxAdmin.setOffline(true);
await pa.locator("form").last().locator("button[type=submit]").click();
await aviso(pa.locator("form").last()).waitFor({ timeout: 15000 });
confere((await aviso(pa.locator("form").last()).textContent()).includes("Não foi salvo"), "Envio sem conexão avisa que não foi salvo");
confere((await pa.inputValue("#nova-nome")) === `${NOME_FORMA} B` && (await pa.inputValue("#nova-taxa")) === "2,5", "Envio sem conexão mantém o que foi digitado");
await pa.screenshot({ path: `${CAPTURAS}/12-envio-sem-conexao.png`, fullPage: true });
await ctxAdmin.setOffline(false);
await pa.locator("form").last().locator("button[type=submit]").click();
await pa.getByText(`${NOME_FORMA} B cadastrada.`).waitFor();
confere((await pa.inputValue("#nova-nome")) === "", "Depois de reenviar com conexão, salva e limpa o formulário de inclusão");

// 7. Sair.
await pm.goto(`${BASE}/mais`);
await pm.getByRole("button", { name: "Sair" }).click();
await esperarPagina(pm, "/entrar");
confere(true, "Sair volta para Entrar");

await navegador.close();
const falhas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
