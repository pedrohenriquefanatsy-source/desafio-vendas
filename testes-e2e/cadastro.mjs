// Passos de cadastro reaproveitados pelos testes de tela: insumo com embalagem e preço,
// produto com sabor, receita dentro do sabor. Cada função recebe a página e o endereço base.

const esperar = (p, re) => p.waitForURL((u) => re.test(u.pathname), { timeout: 20000, waitUntil: "commit" });
const sucesso = (p) => p.locator("p[role=status]").last();

// Abre a linha "＋ Cadastrar …" se ela ainda estiver fechada.
async function abrir(p, titulo) {
  const d = p.locator("details").filter({ has: p.locator("summary", { hasText: titulo }) }).last();
  if (!(await d.evaluate((e) => e.open))) await d.locator("summary").first().click();
}

export async function cadastrarInsumo(p, BASE, { nome, tipo = "ingrediente", base = "g", tamanho, preco, estoque }) {
  await p.goto(`${BASE}/mais/insumos`);
  await abrir(p, "＋ Cadastrar insumo");
  await p.fill("#nome", nome);
  await p.selectOption("#tipo", tipo);
  await p.selectOption("#novo-medida", base);
  if (tamanho) await p.fill("#novo-tamanho", String(tamanho));
  if (preco) await p.fill("#novo-preco", String(preco));
  if (estoque) await p.fill("#novo-estoque", String(estoque));
  await p.getByRole("button", { name: "Cadastrar insumo", exact: true }).click();
  await p.getByText(`${nome} cadastrado.`).waitFor();
}

export async function idInsumo(p, BASE, nome) {
  await p.goto(`${BASE}/mais/insumos`);
  const href = await p.getByRole("link", { name: new RegExp(nome) }).first().getAttribute("href");
  return href.split("/").pop();
}

// Cria o produto e fica na tela dele (primeiro sabor aberto).
export async function criarProduto(p, BASE, { nome, tipo = "simples", preco, sabor }) {
  await p.goto(`${BASE}/mais/produtos`);
  await abrir(p, "＋ Cadastrar produto");
  await p.fill("#nome", nome);
  await p.selectOption("#tipo", tipo);
  if (sabor) await p.fill("#sabor", sabor);
  await p.fill("#preco", String(preco));
  await p.getByRole("button", { name: "Cadastrar e montar a receita" }).click();
  await esperar(p, /^\/mais\/produtos\/[0-9a-f-]{36}$/);
}

// Na tela do produto, no sabor que está aberto e ainda sem receita: lista os ingredientes (o custo da
// fornada aparece na hora), diz quantas unidades rende e cadastra tudo de uma vez.
export async function montarReceita(p, { rendimento, ingredientes }) {
  for (let n = 0; n < ingredientes.length; n++) {
    const [insumo, qtd, unidade] = ingredientes[n];
    if (n > 0) await p.getByRole("button", { name: "Adicionar ingrediente" }).click();
    const linha = p.getByRole("group", { name: `Ingrediente ${n + 1}` });
    await linha.locator('select[id$="-insumo"]').selectOption({ label: insumo });
    await linha.locator('input[id$="-quantidade"]').fill(String(qtd));
    if (unidade) await linha.locator('select[id$="-unidade"]').selectOption(unidade);
  }
  await p.fill("#rc-rendimento", String(rendimento));
  await p.getByRole("button", { name: "Cadastrar receita" }).click();
  await p.locator("summary").filter({ hasText: ingredientes[0][0] }).first().waitFor({ timeout: 20000 });
}

export async function adicionarIngrediente(p, insumo, qtd, unidade) {
  const ing = p.locator('select[id^="ing-"][id$="-insumo"]').first();
  if (!(await ing.isVisible())) await p.locator("summary", { hasText: "＋ Adicionar ingrediente" }).first().click();
  await ing.selectOption({ label: insumo });
  const id = (await ing.getAttribute("id")).replace(/-insumo$/, "");
  await p.fill(`#${id}-quantidade`, String(qtd));
  if (unidade) await p.selectOption(`#${id}-unidade`, unidade);
  await p.getByRole("button", { name: "Adicionar", exact: true }).first().click();
  await p.locator("summary").filter({ hasText: insumo }).first().waitFor();
}

export async function adicionarEmbalagem(p, insumo) {
  await p.locator("summary", { hasText: "＋ Adicionar embalagem" }).first().click();
  await p.locator('select[id^="emb-"][id$="-insumo"]').first().selectOption({ label: insumo });
  await p.getByRole("button", { name: "Adicionar", exact: true }).last().click();
  await p.locator("li").filter({ hasText: `de ${insumo}` }).first().waitFor();
}

export { esperar, sucesso };
