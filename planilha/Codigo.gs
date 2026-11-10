/* ============================================================
   CHOC BITES · Planilha do Desafio do Produto (PTPJ 26.2)
   Dados lidos do sistema (Supabase) somente para leitura.
   ============================================================ */

var SUPABASE_URL = 'https://iebzbiccuwrchgdsojgn.supabase.co';
var SUPABASE_CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllYnpiaWNjdXdyY2hnZHNvamduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODU2NjksImV4cCI6MjA4MTY2MTY2OX0.gy3BOcoCgYNQwCAdgKPKrskYHJyHrIib9Cprp0xa7xE';

var COR = {
  amargo: '#4F1407',
  leite: '#6F2615',
  rosa: '#D5667C',
  brilho: '#EBC3B8',
  creme: '#F9F2E0',
  claro: '#FDF9F1',
  branco: '#FFFFFF',
  verde: '#2E7D4F',
  vermelho: '#B3261E',
  borda: '#000000'
};
var FONTE = 'Montserrat';

var ABA = {
  fluxo: 'Fluxo de Caixa',
  vendas: 'Vendas por Dia',
  custos: 'Custos Gerais',
  markup: 'Markup',
  indicadores: 'Indicadores Financeiros',
  swot: 'SWOT',
  banco: 'Banco de dados',
  manuais: 'Lançamentos da planilha',
  porter: '5 Forças de Porter'
};

var SABORES = ['Ao leite', 'Meio amargo', 'Branco'];
var COL_SABOR_CUSTOS = { 'Ao leite': 5, 'Meio amargo': 7, 'Branco': 9 }; // colunas E, G, I
var NOMES = { 'Gas': 'Gás' };

/* ---------------- Menu ---------------- */

function onOpen() {
  // O menu só existe quando a planilha é aberta no navegador.
  // Se esta função for executada pelo editor do Apps Script, não há tela para criar o menu: sai sem erro.
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return; }
  var menu = ui.createMenu('Choc Bites')
    .addItem('Novo lançamento', 'abrirLancamento')
    .addItem('Atualizar dados agora', 'atualizarDados')
    .addSeparator()
    .addItem('Ligar atualização automática (a cada hora)', 'ligarAtualizacaoAutomatica')
    .addItem('Desligar atualização automática', 'desligarAtualizacaoAutomatica');
  if (typeof montarPlanilha === 'function') {
    menu.addSeparator().addItem('Montar planilha', 'montarPlanilha');
  }
  menu.addToUi();
}

function ligarAtualizacaoAutomatica() {
  desligarAtualizacaoAutomatica(true);
  ScriptApp.newTrigger('atualizarDados').timeBased().everyHours(1).create();
  avisar('Atualização automática ligada: a planilha busca os dados do sistema a cada hora.');
}

function desligarAtualizacaoAutomatica(silencioso) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'atualizarDados') ScriptApp.deleteTrigger(t);
  });
  if (silencioso !== true) avisar('Atualização automática desligada.');
}

function avisar(texto) {
  try { SpreadsheetApp.getActive().toast(texto, 'Choc Bites', 6); } catch (e) {}
  console.log(texto);
}

/* ---------------- Leitura do sistema ---------------- */

function buscarDados() {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/dados_planilha', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_CHAVE, Authorization: 'Bearer ' + SUPABASE_CHAVE },
    payload: '{}',
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Não foi possível ler o sistema (' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

// Data como número de série da planilha (sem risco de fuso horário)
function paraData(texto) {
  var p = String(texto).slice(0, 10).split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000 + 25569;
}

function nome(n) { return NOMES[n] || n; }

/* ---------------- Atualização ---------------- */

function atualizarDados() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) return;
  try {
    var d = buscarDados();
    var ss = SpreadsheetApp.getActive();
    juntarManuais(d);

    // Itens do fluxo: quem aparece com entrada e saída ganha o sentido no nome
    var sinais = {};
    d.fluxo.forEach(function (f) {
      f.item = nome(f.item);
      var s = sinais[f.item] || (sinais[f.item] = { e: false, s: false });
      if (Number(f.valor) >= 0) s.e = true; else s.s = true;
    });
    d.fluxo.forEach(function (f) {
      if (sinais[f.item].e && sinais[f.item].s) f.item += Number(f.valor) >= 0 ? ' (entrada)' : ' (saída)';
    });

    escreverBanco(ss.getSheetByName(ABA.banco), d);
    escreverFluxo(ss.getSheetByName(ABA.fluxo), d.fluxo);
    escreverVendas(ss.getSheetByName(ABA.vendas), d);
    escreverReceitas(ss.getSheetByName(ABA.custos), d);
    escreverLancamentos(ss.getSheetByName(ABA.manuais), d);
    SpreadsheetApp.flush();
    var erros = contarErros(ss);
    avisar('Dados atualizados: ' + d.atualizado + (erros ? ' · ' + erros + ' célula(s) com erro' : ''));
  } finally {
    trava.releaseLock();
  }
}

function contarErros(ss) {
  var n = 0;
  [ABA.fluxo, ABA.vendas, ABA.custos, ABA.markup, ABA.indicadores].forEach(function (a) {
    var sh = ss.getSheetByName(a);
    if (!sh) return;
    sh.getDataRange().getDisplayValues().forEach(function (l) {
      l.forEach(function (v) { if (/^#(ERROR|N\/A|REF|VALUE|NAME|DIV)/.test(v)) n++; });
    });
  });
  return n;
}

function limpar(sh, linha, coluna, nCols) {
  var ult = Math.max(sh.getMaxRows() - linha + 1, 1);
  sh.getRange(linha, coluna, ult, nCols).clearContent();
}

// Escreve uma tabela: valores com setValues e fórmulas com setFormula
// (as fórmulas passam por fx(), que ajusta ao idioma da planilha)
function escrever(range, matriz) {
  var semFormula = matriz.map(function (l) {
    return l.map(function (v) { return (typeof v === 'string' && v.charAt(0) === '=') ? '' : v; });
  });
  range.setValues(semFormula);
  var r0 = range.getRow(), c0 = range.getColumn();
  var sh = range.getSheet();
  matriz.forEach(function (l, i) {
    l.forEach(function (v, j) {
      if (typeof v === 'string' && v.charAt(0) === '=') sh.getRange(r0 + i, c0 + j).setFormula(fx(v));
    });
  });
}

function escreverBanco(sh, d) {
  // Itens e classificação
  var vistos = {}, itens = [];
  d.fluxo.forEach(function (f) {
    if (vistos[f.item]) return;
    vistos[f.item] = true;
    itens.push([f.item, Number(f.valor) >= 0 ? 'ENTRADA' : 'SAÍDA']);
  });
  itens.sort(function (a, b) { return a[1] === b[1] ? a[0].localeCompare(b[0]) : (a[1] === 'ENTRADA' ? -1 : 1); });
  limpar(sh, 3, 2, 2);
  if (itens.length) sh.getRange(3, 2, itens.length, 2).setValues(itens);

  // Formas de pagamento
  var formas = ['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito'];
  d.fluxo.forEach(function (f) { if (formas.indexOf(f.forma) < 0) formas.push(f.forma); });
  limpar(sh, 3, 5, 1);
  sh.getRange(3, 5, formas.length, 1).setValues(formas.map(function (f) { return [f]; }));

  // Insumos
  var ins = d.insumos.map(function (i) { return [nome(i.nome), Number(i.custo), i.unidade]; });
  limpar(sh, 3, 7, 3);
  if (ins.length) sh.getRange(3, 7, ins.length, 3).setValues(ins);

  // Vendas: uma linha por dia (Data | Pedidos | Ao leite | Meio amargo | Branco | Faturamento)
  var dias = {};
  function dia(t) { return dias[t] || (dias[t] = [paraData(t), 0, 0, 0, 0, 0]); }
  d.pedidos.forEach(function (p) { dia(p.dia)[1] += Number(p.n); });
  d.vendas.forEach(function (v) {
    var l = dia(v.dia), i = SABORES.indexOf(v.sabor);
    if (i >= 0) l[2 + i] += Number(v.q);
    l[5] += Number(v.fat);
  });
  d.fluxo.forEach(function (f) { if (f.item === 'Valor a mais') dia(f.dia)[5] += Number(f.valor); });
  d.diasVendas = Object.keys(dias).sort();
  var vendas = d.diasVendas.map(function (k) { return dias[k]; });
  limpar(sh, 3, 11, 6);
  if (vendas.length) sh.getRange(3, 11, vendas.length, 6).setValues(vendas);

  // Parâmetros vindos do sistema
  var entregas = 0;
  d.fluxo.forEach(function (f) {
    if (f.item === 'Gasolina' || f.item === 'Entrega 99 (encomendas)') entregas += Math.abs(Number(f.valor));
  });
  sh.getRange('T5').setValue(Number(d.investimento));
  sh.getRange('T7').setValue(d.atualizado);
  sh.getRange('T8').setValue(entregas + (d.entregasExtra || 0));
}

function escreverFluxo(sh, fluxo) {
  // Mais recentes em cima: o saldo de cada linha soma a partir da linha de baixo (mais antiga)
  fluxo = fluxo.slice().reverse();
  var ini = 4, n = fluxo.length;
  var resto = sh.getMaxRows() - ini + 1;
  if (resto > 0) {
    sh.getRange(ini, 2, resto, 8).clearContent().setBackground(null).setBorder(false, false, false, false, false, false);
  }
  if (!n) return;
  if (sh.getMaxRows() < ini + n) sh.insertRowsAfter(sh.getMaxRows(), ini + n - sh.getMaxRows());

  var valores = [], fGHI = [];
  fluxo.forEach(function (f, i) {
    var r = ini + i;
    valores.push([Number(f.valor) >= 0 ? 'ENTRADA' : 'SAÍDA', paraData(f.dia), f.item, Math.abs(Number(f.valor)), f.forma]);
    fGHI.push([
      '=E' + r + '*(B' + r + '="ENTRADA")',
      '=E' + r + '*(B' + r + '="SAÍDA")',
      i === n - 1 ? '=G' + r + '-H' + r : '=I' + (r + 1) + '+G' + r + '-H' + r
    ]);
  });
  sh.getRange(ini, 2, n, 5).setValues(valores);
  sh.getRange(ini, 7, n, 3).setFormulas(fxM(fGHI));

  var tab = sh.getRange(ini, 2, n, 8);
  estiloCorpo(tab);
  listrar(tab);
  sh.getRange(ini, 3, n, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(ini, 5, n, 1).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 7, n, 3).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 2, n, 1).setFontWeight('bold');
}

function escreverVendas(sh, d) {
  var ini = 8;
  var resto = sh.getMaxRows() - ini + 1;
  sh.getRange(ini, 2, resto, 10).breakApart().clearContent().setBackground(null)
    .setBorder(false, false, false, false, false, false).setFontWeight('normal').setFontColor(COR.amargo);
  var dias = d.diasVendas || [];
  var n = dias.length;
  if (!n) return;

  var B = "'Banco de dados'!";
  var linhas = dias.map(function (t, i) {
    var r = ini + i, rb = 3 + i;
    return [
      paraData(t),
      '=' + B + 'L' + rb,
      '=' + B + 'M' + rb,
      '=' + B + 'N' + rb,
      '=' + B + 'O' + rb,
      '=D' + r + '+E' + r + '+F' + r,
      '=' + B + 'P' + rb,
      '=H' + r + '/C' + r,
      '=G' + r + '/$J$5',
      i === 0 ? '=H' + r : '=K' + (r - 1) + '+H' + r
    ];
  });
  var tab = sh.getRange(ini, 2, n, 10);
  escrever(tab, linhas);
  estiloCorpo(tab);
  listrar(tab);

  var t = ini + n, f = ini + n - 1;
  var tot = sh.getRange(t, 2, 1, 10);
  escrever(tot, [[
    'TOTAL', '=SUM(C' + ini + ':C' + f + ')', '=SUM(D' + ini + ':D' + f + ')', '=SUM(E' + ini + ':E' + f + ')',
    '=SUM(F' + ini + ':F' + f + ')', '=SUM(G' + ini + ':G' + f + ')', '=SUM(H' + ini + ':H' + f + ')',
    '=H' + t + '/C' + t, '=AVERAGE(J' + ini + ':J' + f + ')', '=K' + f
  ]]);
  estiloCorpo(tot);
  tot.setBackground(COR.leite).setFontColor(COR.creme).setFontWeight('bold');

  sh.getRange(ini, 2, n, 1).setNumberFormat('dd/mm');
  sh.getRange(ini, 8, n + 1, 2).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 11, n + 1, 1).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 10, n + 1, 1).setNumberFormat('0%');

  // Gráfico de faturamento por dia
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  var grafico = sh.newChart().asColumnChart()
    .addRange(sh.getRange(7, 2, n + 1, 1))
    .addRange(sh.getRange(7, 8, n + 1, 1))
    .setNumHeaders(1)
    .setPosition(3, 13, 10, 0)
    .setOption('title', 'Faturamento por dia')
    .setOption('titleTextStyle', { fontName: FONTE, fontSize: 13, bold: true, color: COR.amargo })
    .setOption('legend', { position: 'none' })
    .setOption('colors', [COR.rosa])
    .setOption('fontName', FONTE)
    .setOption('backgroundColor', COR.creme)
    .setOption('vAxis', { format: 'R$ #,##0', gridlines: { color: COR.brilho }, textStyle: { color: COR.leite } })
    .setOption('hAxis', { format: 'dd/MM', textStyle: { color: COR.leite } })
    .setOption('series', { 0: { dataLabel: 'value', dataLabelPlacement: 'outsideEnd' } })
    .setOption('width', 620).setOption('height', 340)
    .build();
  sh.insertChart(grafico);
}

function escreverReceitas(sh, d) {
  // Custo e unidade de cada insumo: referência direta à linha dele no Banco de dados
  var linhaBanco = {};
  d.insumos.forEach(function (i, k) { linhaBanco[nome(i.nome)] = 3 + k; });
  [[6, 7], [20, 2]].forEach(function (bloco) {
    var nomesB = sh.getRange(bloco[0], 2, bloco[1], 1).getValues();
    nomesB.forEach(function (l, k) {
      var lb = linhaBanco[l[0]], r = bloco[0] + k;
      if (lb) sh.getRange(r, 3, 1, 2).setFormulas(fxM([["='Banco de dados'!H" + lb, "='Banco de dados'!I" + lb]]));
      else sh.getRange(r, 3, 1, 2).setValues([[0, '']]);
    });
  });

  var nomes = sh.getRange(6, 2, 7, 1).getValues().map(function (r) { return r[0]; });
  var qtd = {};
  d.receitas.forEach(function (r) { qtd[r.sabor + '|' + nome(r.insumo)] = Number(r.qtd); });
  SABORES.forEach(function (s) {
    var col = COL_SABOR_CUSTOS[s];
    nomes.forEach(function (n, k) {
      var cel = sh.getRange(6 + k, col);
      if (n === 'Gás') cel.setFormula(fx('=$M$6'));
      else cel.setValue(qtd[s + '|' + n] || 0);
    });
  });
  sh.getRange('M4').setValue(Number(d.botijoes) || 0);
  sh.getRange('M5').setValue(Number(d.fornadas) || 0);
  d.rendimento.forEach(function (r) {
    if (COL_SABOR_CUSTOS[r.sabor]) sh.getRange(14, COL_SABOR_CUSTOS[r.sabor]).setValue(Number(r.rend));
  });
}


/* ---------------- Fórmulas ---------------- */
// Todas as fórmulas são escritas sem vírgula (sem separador de argumentos),
// então funcionam igual em planilha em português ou em inglês.
function fx(f) { return f; }

function fxM(m) { return m.map(function (l) { return l.map(fx); }); }

/* ---------------- Estilo ---------------- */

function estiloCorpo(r) {
  r.setFontFamily(FONTE).setFontSize(10).setFontColor(COR.amargo)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, COR.borda, SpreadsheetApp.BorderStyle.SOLID);
}

function listrar(r) {
  var n = r.getNumRows(), c = r.getNumColumns(), cores = [];
  for (var i = 0; i < n; i++) {
    var linha = [];
    for (var j = 0; j < c; j++) linha.push(i % 2 ? COR.claro : COR.branco);
    cores.push(linha);
  }
  r.setBackgrounds(cores);
}

/* ============================================================
   LANÇAMENTOS PELA PLANILHA (painel HTML)
   Ficam na aba "Lançamentos da planilha" e entram no fluxo,
   nas vendas e nos indicadores junto com os dados do sistema.
   ============================================================ */

var PESSOAS = ['Arthur', 'Lucas', 'Marcela', 'Pedro'];
var CATEGORIAS = ['Transporte', 'Divulgação', 'Material', 'Alimentação', 'Outros'];
var PRECO = 10;
var PROMOS = [
  { nome: 'Promo 2 por R$ 18', preco: 18, combos: [
    { nome: '2 ao leite', q: [2, 0, 0] }, { nome: '2 meio amargo', q: [0, 2, 0] }, { nome: '2 branco', q: [0, 0, 2] },
    { nome: '1 ao leite + 1 meio amargo', q: [1, 1, 0] }, { nome: '1 ao leite + 1 branco', q: [1, 0, 1] },
    { nome: '1 meio amargo + 1 branco', q: [0, 1, 1] }] },
  { nome: 'Promo 3 por R$ 25', preco: 25, combos: [
    { nome: '3 ao leite', q: [3, 0, 0] }, { nome: '3 meio amargo', q: [0, 3, 0] }, { nome: '3 branco', q: [0, 0, 3] },
    { nome: '2 ao leite + 1 meio amargo', q: [2, 1, 0] }, { nome: '1 ao leite + 2 meio amargo', q: [1, 2, 0] },
    { nome: '2 ao leite + 1 branco', q: [2, 0, 1] }, { nome: '1 ao leite + 2 branco', q: [1, 0, 2] },
    { nome: '2 meio amargo + 1 branco', q: [0, 2, 1] }, { nome: '1 meio amargo + 2 branco', q: [0, 1, 2] },
    { nome: '1 de cada sabor', q: [1, 1, 1] }] }
];
// Colunas da aba (a partir da B): ID, Data, Tipo, Item, Categoria, Valor, Movimentação, Forma,
// Responsável, Ao leite, Meio amargo, Branco, Cliente, Bairro, Situação, Registrado em, Comprovante
var MAN_COLS = 17, MAN_INI = 4;

function abrirLancamento() {
  var html = HtmlService.createHtmlOutputFromFile('Lancamento').setWidth(580).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'Novo lançamento');
}

function lerManuais() {
  var sh = SpreadsheetApp.getActive().getSheetByName(ABA.manuais);
  if (!sh) return [];
  var ult = sh.getLastRow();
  if (ult < MAN_INI) return [];
  // Só as linhas lançadas pelo painel (ID começa com PL-); as do sistema são reescritas a cada atualização
  return sh.getRange(MAN_INI, 2, ult - MAN_INI + 1, MAN_COLS).getValues()
    .filter(function (r) { return String(r[0]).indexOf('PL-') === 0; });
}

// Aba "Lançamentos da planilha": tudo o que está no sistema + o que foi lançado pelo painel, mais recente em cima
function escreverLancamentos(sh, d) {
  if (!sh) return;
  var manuais = lerManuais();
  var linhas = (d.lancamentos || []).map(function (x) {
    var hm = String(x.em || '').slice(11, 16).split(':');
    var em = paraData(x.em || x.dia) + ((Number(hm[0]) || 0) * 60 + (Number(hm[1]) || 0)) / 1440;
    return [x.id, paraData(x.dia), x.tipo, x.item, x.cat || '', Number(x.valor), x.mov, x.forma || '', x.resp || '',
            Number(x.q[0]) || 0, Number(x.q[1]) || 0, Number(x.q[2]) || 0, '', x.bairro || '', x.sit || '', em, ''];
  });
  manuais.forEach(function (r) {
    var m = r.slice();
    m[1] = paraData(isoDe(r[1]));
    if (r[15] instanceof Date) m[15] = r[15].getTime() / 86400000 + 25569 - 3 / 24;
    linhas.push(m);
  });
  linhas.sort(function (a, b) { return (b[1] - a[1]) || (Number(b[15]) - Number(a[15])); });

  var resto = sh.getMaxRows() - MAN_INI + 1;
  if (resto > 0) sh.getRange(MAN_INI, 2, resto, MAN_COLS).clearContent().setBackground(null).setBorder(false, false, false, false, false, false);
  if (!linhas.length) return;
  if (sh.getMaxRows() < MAN_INI + linhas.length) sh.insertRowsAfter(sh.getMaxRows(), MAN_INI + linhas.length - sh.getMaxRows());
  var rg = sh.getRange(MAN_INI, 2, linhas.length, MAN_COLS);
  rg.setValues(linhas);
  estiloCorpo(rg);
  listrar(rg);
  sh.getRange(MAN_INI, 3, linhas.length, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(MAN_INI, 7, linhas.length, 1).setNumberFormat('R$ #,##0.00');
  sh.getRange(MAN_INI, 17, linhas.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.getRange(MAN_INI, 5, linhas.length, 1).setHorizontalAlignment('left');
}

function isoDe(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  if (typeof v === 'number') return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

// Junta os lançamentos da planilha aos dados do sistema
function juntarManuais(d) {
  lerManuais().forEach(function (r) {
    var dia = isoDe(r[1]), tipo = r[2], item = r[3], cat = r[4], valor = Number(r[5]) || 0, mov = r[6], forma = r[7];
    if (mov === 'ENTRADA' || mov === 'SAÍDA') {
      d.fluxo.push({ id: r[0], dia: dia, item: item, valor: mov === 'ENTRADA' ? valor : -valor, forma: forma || 'Pix' });
    }
    if (tipo === 'Venda') {
      d.pedidos.push({ dia: dia, n: 1 });
      SABORES.forEach(function (s, i) { if (Number(r[9 + i])) d.vendas.push({ dia: dia, sabor: s, q: Number(r[9 + i]), fat: 0 }); });
      d.vendas.push({ dia: dia, sabor: '-', q: 0, fat: valor });
    }
    if (tipo === 'Aporte') d.investimento = Number(d.investimento) + valor;
    if (cat === 'Transporte') d.entregasExtra = (d.entregasExtra || 0) + valor;
  });
  d.fluxo.sort(function (a, b) { return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0; });
}

function listasFormulario() {
  var pend = lerManuais().filter(function (r) { return r[2] === 'Venda' && r[14] === 'pendente'; })
    .map(function (r) { return { id: r[0], cliente: r[12] || 'Cliente', valor: Number(r[5]) }; });
  return {
    pessoas: PESSOAS, formas: ['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito'],
    sabores: SABORES, categorias: CATEGORIAS, preco: PRECO, promos: PROMOS, pendentes: pend,
    hoje: Utilities.formatDate(new Date(), 'America/Fortaleza', 'yyyy-MM-dd')
  };
}

function salvarLancamento(d) {
  var trava = LockService.getDocumentLock();
  trava.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(ABA.manuais);
    if (!sh) throw new Error('A aba "' + ABA.manuais + '" não existe. Rode "Montar planilha".');
    var existentes = lerManuais();
    if (existentes.some(function (r) { return r[0] === d.id; })) return 'Esse lançamento já foi salvo.';

    var data = paraData(d.data), valor = Math.abs(Number(d.valor) || 0), agora = new Date();
    var linha = function (tipo, item, cat, v, mov, forma, q, situacao) {
      q = q || [0, 0, 0];
      return [d.id, data, tipo, item, cat || '', v, mov, forma || '', d.pessoa || '', q[0], q[1], q[2],
              d.cliente || '', d.bairro || '', situacao || '', agora, d.nota || ''];
    };
    var nova, retorno;

    switch (d.tipo) {
      case 'venda': {
        var q = [0, 0, 0], total = 0, produtos = [];
        (d.itens || []).forEach(function (it) {
          var n = Number(it.qtd) || 0, i = SABORES.indexOf(it.sabor);
          if (n > 0 && i >= 0) { q[i] += n; total += n * Number(d.preco || PRECO); produtos.push('Chocobite ' + it.sabor.toLowerCase()); }
        });
        (d.pacotes || []).forEach(function (p) {
          var promo = PROMOS.filter(function (x) { return x.nome === p.promo; })[0];
          var combo = promo && promo.combos.filter(function (c) { return c.nome === p.combo; })[0];
          var n = Number(p.qtd) || 0;
          if (!combo || n <= 0) return;
          for (var i = 0; i < 3; i++) q[i] += combo.q[i] * n;
          total += promo.preco * n;
          produtos.push(promo.nome);
        });
        if (!total) throw new Error('Escolha pelo menos uma caixinha ou um pacote.');
        var unicos = produtos.filter(function (p, i) { return produtos.indexOf(p) === i; });
        var item = unicos.length === 1 ? unicos[0] : 'Pedido com mais de um produto';
        nova = linha('Venda', item, d.encomenda ? 'Encomenda' : '', total, d.pago ? 'ENTRADA' : '—', d.forma, q, d.pago ? 'paga' : 'pendente');
        retorno = d.pago ? 'Venda salva e lançada no caixa.' : 'Venda salva como pendente.';
        break;
      }
      case 'recebimento': {
        if (!(valor > 0)) throw new Error('Informe o valor recebido.');
        nova = linha('Recebimento', 'Recebimento de venda', '', valor, 'ENTRADA', d.forma);
        if (d.vendaId) {
          var ult = sh.getLastRow();
          var ids = sh.getRange(MAN_INI, 2, ult - MAN_INI + 1, 1).getValues();
          ids.forEach(function (r, i) { if (r[0] === d.vendaId) sh.getRange(MAN_INI + i, 16).setValue('paga'); });
        }
        retorno = 'Recebimento salvo.';
        break;
      }
      case 'compra': {
        if (!(valor > 0)) throw new Error('Informe o valor da compra.');
        var caixa = d.pagoPor === 'Caixa';
        nova = linha('Compra', (d.item || 'Compra de insumos') + (d.fornecedor ? ' · ' + d.fornecedor : ''), 'Insumos', valor, caixa ? 'SAÍDA' : '—', d.forma, null, caixa ? '' : 'reembolsar ' + d.pagoPor);
        retorno = caixa ? 'Compra salva e lançada no caixa.' : 'Compra salva. Fica como reembolso para ' + d.pagoPor + '.';
        break;
      }
      case 'despesa': {
        if (!(valor > 0)) throw new Error('Informe o valor da despesa.');
        var cx = d.pagoPor === 'Caixa';
        nova = linha('Despesa', d.descricao || d.categoria, d.categoria, valor, cx ? 'SAÍDA' : '—', d.forma, null, cx ? '' : 'reembolsar ' + d.pagoPor);
        retorno = 'Despesa salva.';
        break;
      }
      case 'aporte':
        if (!(valor > 0)) throw new Error('Informe o valor.');
        nova = linha('Aporte', d.descricao || 'Investimento', '', valor, 'ENTRADA', d.forma);
        retorno = 'Aporte salvo.';
        break;
      case 'reembolso':
        if (!(valor > 0)) throw new Error('Informe o valor.');
        nova = linha('Reembolso', 'Reembolso', '', valor, 'SAÍDA', d.forma);
        retorno = 'Reembolso salvo.';
        break;
      case 'ajuste':
        if (!(valor > 0)) throw new Error('Informe o valor.');
        nova = linha('Ajuste', 'Ajuste pelo extrato', '', valor, d.sentido === 'Saída' ? 'SAÍDA' : 'ENTRADA', 'Pix');
        retorno = 'Ajuste salvo.';
        break;
      default:
        throw new Error('Tipo de lançamento desconhecido.');
    }

    var r = Math.max(sh.getLastRow() + 1, MAN_INI);
    var rg = sh.getRange(r, 2, 1, MAN_COLS);
    rg.setValues([nova]);
    estiloCorpo(rg);

    sh.getRange(r, 3).setNumberFormat('dd/mm/yyyy');
    sh.getRange(r, 7).setNumberFormat('R$ #,##0.00');
    sh.getRange(r, 17).setNumberFormat('dd/mm/yyyy hh:mm');
    SpreadsheetApp.flush();

    try { atualizarDados(); } catch (e) { return retorno + ' (A planilha não conseguiu ler o sistema agora; atualize depois.)'; }
    return retorno;
  } finally {
    trava.releaseLock();
  }
}

/* ============================================================
   MONTAR PLANILHA (rodar uma vez numa planilha vazia)
   ============================================================ */

var LOGO_B64 = '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';
var BOTAO_B64 = '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';
var BOTAO_LANCAR_B64 = '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';

function montarPlanilha() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetLocale('pt_BR');
  ss.setSpreadsheetTimeZone('America/Fortaleza');

  var guardados = (ss.getSheetByName(ABA.manuais) ? lerManuais() : []);
  var ordem = [ABA.fluxo, ABA.vendas, ABA.custos, ABA.indicadores, ABA.markup, ABA.porter, ABA.swot, ABA.manuais, ABA.banco];
  ordem.forEach(function (n, i) {
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    prepararAba(sh);
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
  ss.getSheets().forEach(function (sh) {
    if (ordem.indexOf(sh.getName()) < 0 && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });

  montarBanco(ss.getSheetByName(ABA.banco));
  montarFluxo(ss.getSheetByName(ABA.fluxo));
  montarVendas(ss.getSheetByName(ABA.vendas));
  montarCustos(ss.getSheetByName(ABA.custos));
  montarMarkup(ss.getSheetByName(ABA.markup));
  montarIndicadores(ss.getSheetByName(ABA.indicadores));
  montarPorter(ss.getSheetByName(ABA.porter));
  montarSwot(ss.getSheetByName(ABA.swot));
  montarManuais(ss.getSheetByName(ABA.manuais), guardados);

  atualizarDados();
  ss.getSheetByName(ABA.banco).hideSheet();
  ss.getSheetByName(ABA.manuais).hideSheet();
  ss.setActiveSheet(ss.getSheetByName(ABA.fluxo));
  avisar('Planilha montada.');
}

/* ---------------- Peças de visual ---------------- */

function prepararAba(sh) {
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.getImages().forEach(function (i) { i.remove(); });
  sh.clearConditionalFormatRules();
  var tudo = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  tudo.breakApart().clear().clearDataValidations();
  sh.setFrozenRows(0);
  sh.setHiddenGridlines(true);
  tudo.setFontFamily(FONTE).setFontSize(10).setFontColor(COR.amargo).setBackground(COR.creme)
    .setVerticalAlignment('middle');
  sh.setColumnWidth(1, 24);
  sh.setTabColor(COR.leite);
}

function faixaTitulo(sh, intervalo, texto) {
  sh.setRowHeight(1, 64);
  sh.getRange(1, 1, 1, sh.getMaxColumns()).setBackground(COR.amargo);
  sh.getRange(intervalo).merge().setValue(texto).setFontFamily(FONTE).setFontSize(20)
    .setFontWeight('bold').setFontColor(COR.creme).setHorizontalAlignment('center');
  sh.setRowHeight(2, 14);
  var logo = sh.insertImage(Utilities.newBlob(Utilities.base64Decode(LOGO_B64), 'image/png', 'logo.png'), 2, 1, 6, 4);
  logo.setHeight(56).setWidth(80);
}

// Botões na faixa do título, alinhados à direita (rodar depois de definir as larguras)
function botoes(sh, intervalo, lista) {
  var BOT = {
    atualizar: [BOTAO_B64, 'atualizarDados', 150],
    lancar: [BOTAO_LANCAR_B64, 'abrirLancamento', 190]
  };
  var rg = sh.getRange(intervalo), c1 = rg.getColumn(), c2 = rg.getLastColumn();
  var direita = 0;
  for (var c = c1; c <= c2; c++) direita += sh.getColumnWidth(c);
  var x = direita - 12;
  lista.forEach(function (nome) {
    var b = BOT[nome];
    x -= b[2];
    var col = c1, resto = Math.max(x, 0);
    while (col < c2 && resto >= sh.getColumnWidth(col)) { resto -= sh.getColumnWidth(col); col++; }
    var img = sh.insertImage(Utilities.newBlob(Utilities.base64Decode(b[0]), 'image/png', nome + '.png'), col, 1, Math.round(resto), 14);
    img.setWidth(b[2]).setHeight(Math.round(b[2] * 88 / 360));
    img.assignScript(b[1]);
    x -= 10;
  });
}

function secao(sh, a1, texto) {
  sh.getRange(a1).merge().setValue(texto).setBackground(COR.rosa).setFontColor(COR.creme)
    .setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
}

function cabecalho(r) {
  r.setBackground(COR.leite).setFontColor(COR.creme).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBorder(true, true, true, true, true, true, COR.borda, SpreadsheetApp.BorderStyle.SOLID);
}

function corpo(r) {
  estiloCorpo(r);
  r.setBackground(COR.branco);
}

function cartao(sh, rotulo, valor, formula, formato) {
  sh.getRange(rotulo).merge().setValue(valor).setBackground(COR.leite).setFontColor(COR.creme)
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  var v = sh.getRange(formula.a1).merge();
  v.setFormula(fx(formula.f)).setBackground(COR.branco).setFontSize(16).setFontWeight('bold')
    .setFontColor(COR.amargo).setHorizontalAlignment('center').setNumberFormat(formato)
    .setBorder(true, true, true, true, false, false, COR.borda, SpreadsheetApp.BorderStyle.SOLID);
}

function larguras(sh, mapa) {
  Object.keys(mapa).forEach(function (c) { sh.setColumnWidth(sh.getRange(c + '1').getColumn(), mapa[c]); });
}

/* ---------------- Banco de dados (oculta) ---------------- */

function montarBanco(sh) {
  faixaTitulo(sh, 'B1:T1', 'BANCO DE DADOS');
  var blocos = [['B2:C2', ['Item', 'Classificação']], ['E2', ['Forma de pagamento']],
                ['G2:I2', ['Insumo', 'Custo por unidade', 'Unidade']],
                ['K2:P2', ['Data', 'Pedidos', 'Ao leite', 'Meio amargo', 'Branco', 'Faturamento']], ['S2:T2', ['Parâmetro', 'Valor']]];
  blocos.forEach(function (b) { sh.getRange(b[0]).setValues([b[1]]); cabecalho(sh.getRange(b[0])); });
  escrever(sh.getRange('S3:T8'), [
    ['Meta de lucro do grupo', "='Vendas por Dia'!F5"],
    ['Meta geral do PTPJ (3 grupos)', "='Vendas por Dia'!B5"],
    ['Investimento recebido', 0],
    ['Meta de caixinhas por dia', "='Vendas por Dia'!J5"],
    ['Atualizado em', ''],
    ['Gasto com entregas', 0]
  ]);
  corpo(sh.getRange('S3:T8'));
  sh.getRange('T3:T5').setNumberFormat('R$ #,##0.00');
  sh.getRange('T8').setNumberFormat('R$ #,##0.00');
  sh.getRange('T6').setNumberFormat('0');
  sh.getRange('H3:H200').setNumberFormat('R$ #,##0.00000');
  sh.getRange('K3:K400').setNumberFormat('dd/mm/yyyy');
  sh.getRange('P3:P400').setNumberFormat('R$ #,##0.00');
  larguras(sh, { B: 230, C: 110, D: 20, E: 150, F: 20, G: 170, H: 130, I: 80, J: 20, K: 100, L: 80, M: 90, N: 100, O: 80, P: 110, Q: 20, R: 20, S: 200, T: 130 });
}

/* ---------------- Fluxo de caixa ---------------- */

function montarFluxo(sh) {
  faixaTitulo(sh, 'B1:M1', 'FLUXO DE CAIXA');
  sh.getRange('B3:I3').setValues([['Movimentação', 'Data', 'Produto', 'Valor', 'Forma de pagamento', 'Entrada', 'Saída', 'Saldo']]);
  cabecalho(sh.getRange('B3:I3'));
  sh.setRowHeight(3, 30);
  sh.setFrozenRows(3);

  sh.getRange('K3:M3').setValues([['ENTRADAS', 'SAÍDAS', 'SALDO']]);
  cabecalho(sh.getRange('K3:M3'));
  sh.getRange('K4:M4').setFormulas(fxM([['=SUM(G4:G3000)', '=SUM(H4:H3000)', '=K4-L4']]));
  corpo(sh.getRange('K4:M4'));
  sh.getRange('K4:M4').setNumberFormat('R$ #,##0.00').setFontSize(13).setFontWeight('bold');
  sh.setRowHeight(4, 34);
  sh.getRange('K4').setFontColor(COR.verde);
  sh.getRange('L4').setFontColor(COR.vermelho);

  sh.getRange('K6:M6').merge().setValue('ATUALIZADO EM');
  cabecalho(sh.getRange('K6:M6'));
  sh.getRange('K7:M7').merge().setFormula(fx("='Banco de dados'!T7"));
  corpo(sh.getRange('K7:M7'));

  var regras = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ENTRADA').setFontColor(COR.verde).setRanges([sh.getRange('B4:B2000')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('SAÍDA').setFontColor(COR.vermelho).setRanges([sh.getRange('B4:B2000')]).build()
  ];
  sh.setConditionalFormatRules(regras);
  larguras(sh, { B: 130, C: 100, D: 240, E: 110, F: 160, G: 110, H: 110, I: 120, J: 30, K: 140, L: 140, M: 170 });
  botoes(sh, 'B1:M1', ['atualizar', 'lancar']);
}

/* ---------------- Vendas por dia ---------------- */

function montarVendas(sh) {
  faixaTitulo(sh, 'B1:K1', 'VENDAS POR DIA');
  secao(sh, 'B3:K3', 'PARÂMETROS DA META');
  var rot = [['B4:C4', 'Meta geral (3 grupos)'], ['D4:E4', 'Grupos'], ['F4:G4', 'Meta de lucro do grupo'],
             ['H4', 'MC média por caixinha'], ['I4', 'Dias de venda'], ['J4:K4', 'Meta de caixinhas por dia']];
  rot.forEach(function (x) { sh.getRange(x[0]).merge().setValue(x[1]); cabecalho(sh.getRange(x[0])); });
  sh.setRowHeight(4, 34);
  ['B5:C5', 'D5:E5', 'F5:G5', 'J5:K5'].forEach(function (a) { sh.getRange(a).merge(); });
  escrever(sh.getRange('B5:K5'), [[20000, '', 3, '', '=B5/D5', '', '=AVERAGE(Markup!I5:I7)', 8, '=F5/H5/I5', '']]);
  corpo(sh.getRange('B5:K5'));
  sh.getRange('B5:K5').setFontWeight('bold').setFontSize(11);
  sh.getRange('B5').setNumberFormat('R$ #,##0.00').setBackground(COR.brilho);
  sh.getRange('D5').setBackground(COR.brilho);
  sh.getRange('I5').setBackground(COR.brilho);
  sh.getRange('F5').setNumberFormat('R$ #,##0.00');
  sh.getRange('H5').setNumberFormat('R$ #,##0.00');
  sh.getRange('J5').setNumberFormat('0');
  sh.setRowHeight(5, 30);

  sh.getRange('B7:K7').setValues([['Data', 'Pedidos', 'Ao leite', 'Meio amargo', 'Branco', 'Caixinhas',
                                   'Faturamento', 'Ticket médio', '% da meta de caixinhas', 'Faturamento acumulado']]);
  cabecalho(sh.getRange('B7:K7'));
  sh.setRowHeight(7, 36);
  sh.setFrozenRows(7);
  larguras(sh, { B: 80, C: 80, D: 85, E: 95, F: 80, G: 90, H: 115, I: 105, J: 110, K: 130, L: 24 });
  botoes(sh, 'B1:K1', ['atualizar', 'lancar']);
}

/* ---------------- Custos gerais (custeio) ---------------- */

function montarCustos(sh) {
  faixaTitulo(sh, 'B1:J1', 'CUSTEIO E PRECIFICAÇÃO');

  secao(sh, 'B3:J3', 'RECEITA POR FORMA');
  sh.getRange('B4:B5').merge().setValue('Insumo');
  sh.getRange('C4:C5').merge().setValue('Custo por unidade');
  sh.getRange('D4:D5').merge().setValue('Unidade');
  sh.getRange('E4:F4').merge().setValue('AO LEITE');
  sh.getRange('G4:H4').merge().setValue('MEIO AMARGO');
  sh.getRange('I4:J4').merge().setValue('BRANCO');
  sh.getRange('E5:J5').setValues([['Quantidade', 'Custo', 'Quantidade', 'Custo', 'Quantidade', 'Custo']]);
  cabecalho(sh.getRange('B4:J5'));

  var insumos = ['Massa de brownie', 'Ovos', 'Margarina', 'Chocolate ao leite', 'Chocolate Meio Amargo', 'Chocolate Branco', 'Gás'];
  insumos.forEach(function (n, i) {
    var r = 6 + i;
    escrever(sh.getRange(r, 2, 1, 9), [[n,
      0, '',
      0, '=E' + r + '*$C' + r, 0, '=G' + r + '*$C' + r, 0, '=I' + r + '*$C' + r]]);
  });
  corpo(sh.getRange('B6:J12'));
  sh.getRange('B6:B12').setHorizontalAlignment('left');
  listrar(sh.getRange('B6:J12'));
  sh.getRange('C6:C12').setNumberFormat('R$ #,##0.0000');
  sh.getRange('F6:F12').setNumberFormat('R$ #,##0.00');
  sh.getRange('H6:H12').setNumberFormat('R$ #,##0.00');
  sh.getRange('J6:J12').setNumberFormat('R$ #,##0.00');

  var linhas = [['Custo da forma', '=SUM(F6:F12)', '=SUM(H6:H12)', '=SUM(J6:J12)', 'R$ #,##0.00'],
                ['Rendimento (caixinhas)', 0, 0, 0, '0.0'],
                ['Custo da massa por caixinha', '=E13/E14', '=G13/G14', '=I13/I14', 'R$ #,##0.00']];
  linhas.forEach(function (l, i) {
    var r = 13 + i;
    sh.getRange(r, 2, 1, 3).merge().setValue(l[0]);
    escrever(sh.getRange(r, 5), [[l[1]]]);
    escrever(sh.getRange(r, 7), [[l[2]]]);
    escrever(sh.getRange(r, 9), [[l[3]]]);
    sh.getRange(r, 5, 1, 2).merge();
    sh.getRange(r, 7, 1, 2).merge();
    sh.getRange(r, 9, 1, 2).merge();
    corpo(sh.getRange(r, 2, 1, 9));
    sh.getRange(r, 2, 1, 3).setBackground(COR.brilho).setFontWeight('bold');
    sh.getRange(r, 5, 1, 6).setNumberFormat(l[4]).setFontWeight('bold');
  });

  secao(sh, 'B18:J18', 'EMBALAGEM POR CAIXINHA');
  sh.getRange('B19:F19').setValues([['Item', 'Custo por unidade', 'Unidade', 'Quantidade', 'Custo']]);
  cabecalho(sh.getRange('B19:F19'));
  ['Embalagem pote', 'Adesivos - 5cm'].forEach(function (n, i) {
    var r = 20 + i;
    escrever(sh.getRange(r, 2, 1, 5), [[n, 0, '', 1, '=C' + r + '*E' + r]]);
  });
  sh.getRange('B22:E22').merge().setValue('Total de embalagem');
  sh.getRange('F22').setFormula(fx('=SUM(F20:F21)'));
  corpo(sh.getRange('B20:F22'));
  sh.getRange('B20:B21').setHorizontalAlignment('left');
  sh.getRange('E20:E21').setBackground(COR.brilho);
  sh.getRange('B22:F22').setFontWeight('bold');
  sh.getRange('B22:E22').setBackground(COR.brilho);
  sh.getRange('C20:C21').setNumberFormat('R$ #,##0.0000');
  sh.getRange('F20:F22').setNumberFormat('R$ #,##0.00');

  secao(sh, 'B24:J24', 'ENTREGA POR CAIXINHA');
  sh.getRange('B25:C25').merge().setValue('Gasolina e frete');
  sh.getRange('D25:E25').merge().setValue('Caixinhas vendidas');
  sh.getRange('F25:G25').merge().setValue('Entrega por caixinha');
  cabecalho(sh.getRange('B25:G25'));
  sh.getRange('B26:C26').merge().setFormula(fx("='Banco de dados'!T8"));
  sh.getRange('D26:E26').merge().setFormula(fx("=SUM('Banco de dados'!M3:O400)"));
  sh.getRange('F26:G26').merge().setFormula(fx('=B26/D26'));
  corpo(sh.getRange('B26:G26'));
  sh.getRange('B26').setNumberFormat('R$ #,##0.00');
  sh.getRange('D26').setNumberFormat('#,##0');
  sh.getRange('F26').setNumberFormat('R$ #,##0.00');

  secao(sh, 'B28:J28', 'CUSTO POR CAIXINHA');
  sh.getRange('B29:C29').merge().setValue('Sabor');
  sh.getRange('D29:E29').merge().setValue('Massa e cobertura');
  sh.getRange('F29:G29').merge().setValue('Embalagem');
  sh.getRange('H29').setValue('Entrega');
  sh.getRange('I29:J29').merge().setValue('Custo total');
  cabecalho(sh.getRange('B29:J29'));
  [['Ao leite', 'E15'], ['Meio amargo', 'G15'], ['Branco', 'I15']].forEach(function (s, i) {
    var r = 30 + i;
    sh.getRange(r, 2, 1, 2).merge().setValue(s[0]);
    sh.getRange(r, 4, 1, 2).merge().setFormula(fx('=' + s[1]));
    sh.getRange(r, 6, 1, 2).merge().setFormula(fx('=$F$22'));
    sh.getRange(r, 8).setFormula(fx('=$F$26'));
    sh.getRange(r, 9, 1, 2).merge().setFormula(fx('=D' + r + '+F' + r + '+H' + r));
  });
  corpo(sh.getRange('B30:J32'));
  sh.getRange('D30:J32').setNumberFormat('R$ #,##0.00');
  sh.getRange('B30:C32').setFontWeight('bold');
  sh.getRange('I30:J32').setFontWeight('bold').setBackground(COR.brilho);

  secao(sh, 'L3:M3', 'GÁS POR FORNADA');
  escrever(sh.getRange('L4:M7'), [
    ['Botijões comprados', 0],
    ['Fornadas produzidas', 0],
    ['Botijão por fornada', '=M4/M5'],
    ['Custo do gás por fornada', '=M6*C12']
  ]);
  corpo(sh.getRange('L4:M7'));
  sh.getRange('L4:L7').setHorizontalAlignment('left').setFontWeight('bold').setBackground(COR.brilho);
  sh.getRange('M5').setNumberFormat('0.00');
  sh.getRange('M6').setNumberFormat('0.0000');
  sh.getRange('M7').setNumberFormat('R$ #,##0.00');
  larguras(sh, { B: 200, C: 120, D: 80, E: 95, F: 95, G: 95, H: 95, I: 95, J: 95, K: 24, L: 190, M: 110 });
}

/* ---------------- Markup ---------------- */

function montarMarkup(sh) {
  faixaTitulo(sh, 'B1:J1', 'MARKUP');
  secao(sh, 'B3:J3', 'MARKUP E MARGEM DE CONTRIBUIÇÃO POR PRODUTO');
  sh.getRange('B4:J4').setValues([['Produto', 'Preço de venda', 'Ao leite', 'Meio amargo', 'Branco', 'Custo', 'Markup', 'Margem de contribuição', 'MC (%)']]);
  cabecalho(sh.getRange('B4:J4'));
  sh.setRowHeight(4, 32);

  // Sabor: o custo vem pronto do Custeio. Promoção: quantidade do combo × custo de cada sabor (linhas 5 a 7)
  var custoPromo = function (r, q) {
    var partes = [];
    ['D', 'E', 'F'].forEach(function (col, i) { if (q[i]) partes.push(col + r + '*$G$' + (5 + i)); });
    return '=' + partes.join('+');
  };
  var linha = function (r, nome, preco, q, custo) {
    escrever(sh.getRange(r, 2, 1, 9), [[nome, preco, q[0], q[1], q[2], custo, '=C' + r + '/G' + r, '=C' + r + '-G' + r, '=I' + r + '/C' + r]]);
    corpo(sh.getRange(r, 2, 1, 9));
  };
  var r = 5;
  [['Chocobite ao leite', [1, 0, 0], "='Custos Gerais'!I30"], ['Chocobite meio amargo', [0, 1, 0], "='Custos Gerais'!I31"],
   ['Chocobite branco', [0, 0, 1], "='Custos Gerais'!I32"]]
    .forEach(function (s) { linha(r, s[0], PRECO, s[1], s[2]); r++; });
  PROMOS.forEach(function (p) {
    secao(sh, 'B' + r + ':J' + r, p.nome.toUpperCase());
    r++;
    p.combos.forEach(function (c) { linha(r, c.nome, p.preco, c.q, custoPromo(r, c.q)); r++; });
  });
  var fim = r - 1;
  listrar(sh.getRange('B5:J7'));
  sh.getRange('B5:B' + fim).setHorizontalAlignment('left');
  sh.getRange('B5:B7').setFontWeight('bold');
  sh.getRange('C5:C' + fim).setNumberFormat('R$ #,##0.00');
  sh.getRange('G5:G' + fim).setNumberFormat('R$ #,##0.00');
  sh.getRange('H5:H' + fim).setNumberFormat('0.00');
  sh.getRange('I5:I' + fim).setNumberFormat('R$ #,##0.00');
  sh.getRange('J5:J' + fim).setNumberFormat('0.0%');
  // Preço e quantidades podem ser editados: ficam destacados
  for (var k = 5; k <= fim; k++) {
    if (sh.getRange(k, 2).isPartOfMerge()) continue;
    sh.getRange(k, 3).setBackground(COR.brilho);
  }
  larguras(sh, { B: 240, C: 115, D: 85, E: 100, F: 80, G: 100, H: 85, I: 150, J: 85 });
}

/* ---------------- Indicadores financeiros ---------------- */

function montarIndicadores(sh) {
  faixaTitulo(sh, 'B1:G1', 'INDICADORES FINANCEIROS');
  var R$ = 'R$ #,##0.00', P = '0.0%', N = '#,##0';

  secao(sh, 'B3:G3', 'RESULTADO');
  cartao(sh, 'B4:C4', 'FATURAMENTO', { a1: 'B5:C5', f: "=SUM('Banco de dados'!P3:P400)" }, R$);
  cartao(sh, 'D4:E4', 'SAÍDAS DO CAIXA', { a1: 'D5:E5', f: "='Fluxo de Caixa'!L4" }, R$);
  cartao(sh, 'F4:G4', 'SALDO DE CAIXA', { a1: 'F5:G5', f: "='Fluxo de Caixa'!M4" }, R$);
  cartao(sh, 'B7:C7', 'INVESTIMENTO RECEBIDO', { a1: 'B8:C8', f: "='Banco de dados'!T5" }, R$);
  cartao(sh, 'D7:E7', 'LUCRO', { a1: 'D8:E8', f: '=F5-B8' }, R$);
  cartao(sh, 'F7:G7', 'ROI', { a1: 'F8:G8', f: '=D8/D5' }, P);

  secao(sh, 'B10:G10', 'META');
  cartao(sh, 'B11:C11', 'META DE LUCRO DO GRUPO', { a1: 'B12:C12', f: "='Banco de dados'!T3" }, R$);
  cartao(sh, 'D11:E11', '% DA META', { a1: 'D12:E12', f: '=D8/B12' }, P);
  cartao(sh, 'F11:G11', '% DA META GERAL DE R$ 20.000', { a1: 'F12:G12', f: "=D8/'Banco de dados'!T4" }, P);

  secao(sh, 'B14:G14', 'VENDAS');
  cartao(sh, 'B15:C15', 'CAIXINHAS VENDIDAS', { a1: 'B16:C16', f: "=SUM('Banco de dados'!M3:O400)" }, N);
  cartao(sh, 'D15:E15', 'PEDIDOS', { a1: 'D16:E16', f: "=SUM('Banco de dados'!L3:L400)" }, N);
  cartao(sh, 'F15:G15', 'TICKET MÉDIO', { a1: 'F16:G16', f: '=B5/D16' }, R$);

  secao(sh, 'B18:G18', 'MARGENS');
  cartao(sh, 'B19:C19', 'LUCRATIVIDADE', { a1: 'B20:C20', f: '=D8/B5' }, P);
  cartao(sh, 'D19:E19', 'MC MÉDIA DOS SABORES', { a1: 'D20:E20', f: '=AVERAGE(Markup!J5:J7)' }, P);
  cartao(sh, 'F19:G19', 'CUSTO MÉDIO POR CAIXINHA', { a1: 'F20:G20', f: "=AVERAGE('Custos Gerais'!I30:I32)" }, R$);

  [5, 8, 12, 16, 20].forEach(function (r) { sh.setRowHeight(r, 42); });
  [4, 7, 11, 15, 19].forEach(function (r) { sh.setRowHeight(r, 26); });
  montarDre(sh, 22);
  larguras(sh, { B: 115, C: 115, D: 115, E: 115, F: 115, G: 115 });
  botoes(sh, 'B1:G1', ['atualizar']);
}

// DRE pelo custeio variável: receita − custos e despesas variáveis = margem de contribuição − fixos = resultado
function montarDre(sh, r0) {
  secao(sh, 'B' + r0 + ':G' + r0, 'DRE PELO CUSTEIO VARIÁVEL');
  var h = r0 + 1;
  sh.getRange(h, 2, 1, 2).merge();
  sh.getRange(h, 2, 1, 6).setValues([['Conta', '', 'Quantidade', 'Valor unitário', 'Valor', '% da receita']]);
  cabecalho(sh.getRange(h, 2, 1, 6));
  sh.setRowHeight(h, 30);

  var BD = "'Banco de dados'!", CG = "'Custos Gerais'!";
  var R = r0 + 2; // linha da receita bruta
  var L = function (k) { return R + k; };
  var linhas = [
    ['RECEITA BRUTA DE VENDAS', '', '', '=B5', 'total'],
    ['(−) Impostos sobre vendas', '', '', 0, 'editavel'],
    ['(−) Taxas de cartão', '', '', 0, 'editavel'],
    ['RECEITA LÍQUIDA', '', '', '=F' + L(0) + '-F' + L(1) + '-F' + L(2), 'total'],
    ['(−) Custo variável · ao leite', '=SUM(' + BD + 'M3:M400)', '=' + CG + 'I30', '=D' + L(4) + '*E' + L(4), ''],
    ['(−) Custo variável · meio amargo', '=SUM(' + BD + 'N3:N400)', '=' + CG + 'I31', '=D' + L(5) + '*E' + L(5), ''],
    ['(−) Custo variável · branco', '=SUM(' + BD + 'O3:O400)', '=' + CG + 'I32', '=D' + L(6) + '*E' + L(6), ''],
    ['MARGEM DE CONTRIBUIÇÃO', '', '', '=F' + L(3) + '-F' + L(4) + '-F' + L(5) + '-F' + L(6), 'total'],
    ['(−) Custos fixos', '', '', 0, 'editavel'],
    ['(−) Despesas fixas', '', '', 0, 'editavel'],
    ['RESULTADO OPERACIONAL', '', '', '=F' + L(7) + '-F' + L(8) + '-F' + L(9), 'total'],
    ['Lucro pelo caixa', '', '', '=D8', ''],
    ['Diferença entre caixa e DRE', '', '', '=F' + L(11) + '-F' + L(10), '']
  ];
  linhas.forEach(function (l, i) {
    var r = R + i;
    sh.getRange(r, 2, 1, 2).merge();
    escrever(sh.getRange(r, 2, 1, 6), [[l[0], '', l[1], l[2], l[3], '=F' + r + '/$F$' + R]]);
    corpo(sh.getRange(r, 2, 1, 6));
    sh.getRange(r, 2).setHorizontalAlignment('left');
    if (l[4] === 'total') sh.getRange(r, 2, 1, 6).setBackground(COR.leite).setFontColor(COR.creme).setFontWeight('bold');
    else if (i % 2) sh.getRange(r, 2, 1, 6).setBackground(COR.claro);
    if (l[4] === 'editavel') sh.getRange(r, 6).setBackground(COR.brilho);
  });
  var fim = R + linhas.length - 1;
  sh.getRange(R + 11, 2, 2, 6).setFontWeight('bold');
  sh.getRange('D' + R + ':D' + fim).setNumberFormat('#,##0');
  sh.getRange('E' + R + ':F' + fim).setNumberFormat('R$ #,##0.00');
  sh.getRange('G' + R + ':G' + fim).setNumberFormat('0.0%');
}

/* ---------------- SWOT quantitativa ---------------- */

function montarSwot(sh) {
  faixaTitulo(sh, 'B1:N1', 'SWOT');
  secao(sh, 'B3:N3', 'SWOT QUANTITATIVA (CRUZADA)');

  var oport = ['Doce depois da refeição é hábito do público', 'Datas de fim de ano e encomendas', 'Revenda em estabelecimentos de conhecidos'];
  var ameac = ['Alta no preço do chocolate e da cobertura', 'Doces de aplicativo e de supermercado', 'Calor de Natal derretendo a cobertura'];
  var forcas = ['Margem de contribuição alta por caixinha', 'Aceitação comprovada na pesquisa', 'Rede de contatos que vende por indicação'];
  var fraq = ['Banho manual limita a produção', 'Entrega própria custa gasolina e tempo', 'Marca nova, pouco conhecida'];

  sh.getRange('D4:F4').merge().setValue('OPORTUNIDADES');
  sh.getRange('H4:J4').merge().setValue('AMEAÇAS');
  sh.getRange('M4:N4').merge().setValue('RESULTADO');
  cabecalho(sh.getRange('D4:F4')); cabecalho(sh.getRange('H4:J4')); cabecalho(sh.getRange('M4:N4'));
  sh.getRange('D5:F5').setValues([oport]);
  sh.getRange('H5:J5').setValues([ameac]);
  sh.getRange('G5').setValue('TOTAL');
  sh.getRange('K5').setValue('TOTAL');
  sh.getRange('M5:N5').setValues([['TOTAL', 'ORDEM']]);
  corpo(sh.getRange('D5:K5'));
  sh.getRange('D5:K5').setWrap(true).setFontWeight('bold').setBackground(COR.brilho);
  cabecalho(sh.getRange('M5:N5'));
  sh.setRowHeight(5, 62);

  function bloco(ini, rotulo, itens) {
    sh.getRange(ini, 2, 3, 1).merge().setValue(rotulo);
    cabecalho(sh.getRange(ini, 2, 3, 1));
    for (var i = 0; i < 3; i++) {
      var r = ini + i;
      sh.getRange(r, 3).setValue(itens[i]);
      sh.getRange(r, 7).setFormula(fx('=SUM(D' + r + ':F' + r + ')'));
      sh.getRange(r, 11).setFormula(fx('=SUM(H' + r + ':J' + r + ')'));
      sh.getRange(r, 13).setFormula(fx('=G' + r + '+K' + r));
      var outras = [ini, ini + 1, ini + 2].filter(function (x) { return x !== r; });
      sh.getRange(r, 14).setFormula(fx('=1+(M' + outras[0] + '>M' + r + ')+(M' + outras[1] + '>M' + r + ')'));
      sh.setRowHeight(r, 34);
    }
    var s = ini + 3;
    sh.getRange(s, 2, 1, 2).merge().setValue('SUBTOTAL');
    ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach(function (c) {
      sh.getRange(c + s).setFormula(fx('=SUM(' + c + ini + ':' + c + (ini + 2) + ')'));
    });
    corpo(sh.getRange(ini, 3, 3, 12));
    sh.getRange(ini, 3, 3, 1).setHorizontalAlignment('left').setWrap(true);
    sh.getRange(ini, 4, 3, 3).setBackground(COR.claro);
    sh.getRange(ini, 8, 3, 3).setBackground(COR.claro);
    sh.getRange(ini, 7, 3, 1).setFontWeight('bold');
    sh.getRange(ini, 11, 3, 1).setFontWeight('bold');
    sh.getRange(ini, 12, 4, 1).setBorder(false, false, false, false, false, false).setBackground(COR.creme);
    corpo(sh.getRange(s, 2, 1, 10));
    sh.getRange(s, 2, 1, 10).setBackground(COR.brilho).setFontWeight('bold');
  }
  bloco(6, 'FORÇAS', forcas);
  bloco(11, 'FRAQUEZAS', fraq);

  sh.getRange('B16:C16').merge().setValue('SOMA');
  sh.getRange('B17:C17').merge().setValue('ORDEM');
  ['D', 'E', 'F', 'H', 'I', 'J'].forEach(function (c) {
    var grupo = 'DEF'.indexOf(c) >= 0 ? '$D$16:$F$16' : '$H$16:$J$16';
    sh.getRange(c + '16').setFormula(fx('=' + c + '9+' + c + '14'));
    var cols = 'DEF'.indexOf(c) >= 0 ? ['D', 'E', 'F'] : ['H', 'I', 'J'];
    var maiores = cols.filter(function (x) { return x !== c; }).map(function (x) { return '+(' + x + '16>' + c + '16)'; }).join('');
    sh.getRange(c + '17').setFormula(fx('=1' + maiores));
  });
  cabecalho(sh.getRange('B16:C17'));
  corpo(sh.getRange('D16:F17'));
  corpo(sh.getRange('H16:J17'));
  sh.getRange('D16:J16').setFontWeight('bold');

  sh.getRange('B19:G19').setValues([['Cenário', 'Cruzamento', 'Pontuação', 'Máxima', '%', 'Ordem']]);
  cabecalho(sh.getRange('B19:G19'));
  var cen = [
    ['Desenvolvimento', 'Forças × oportunidades: quanto a força ajuda a aproveitar a oportunidade?', '=G9'],
    ['Crescimento', 'Fraquezas × oportunidades: quanto a fraqueza atrapalha aproveitar a oportunidade?', '=G14'],
    ['Manutenção', 'Forças × ameaças: quanto a força ajuda a enfrentar a ameaça?', '=K9'],
    ['Sobrevivência', 'Fraquezas × ameaças: quanto a fraqueza deixa a marca exposta à ameaça?', '=K14']
  ];
  cen.forEach(function (c, i) {
    var r = 20 + i;
    var ordemCen = '=1' + [20, 21, 22, 23].filter(function (x) { return x !== r; }).map(function (x) { return '+(F' + x + '>F' + r + ')'; }).join('');
    escrever(sh.getRange(r, 2, 1, 6), [[c[0], c[1], c[2], 18, '=D' + r + '/E' + r, ordemCen]]);
    sh.setRowHeight(r, 40);
  });
  corpo(sh.getRange('B20:G23'));
  listrar(sh.getRange('B20:G23'));
  sh.getRange('B20:B23').setFontWeight('bold');
  sh.getRange('C20:C23').setWrap(true).setHorizontalAlignment('left');
  sh.getRange('F20:F23').setNumberFormat('0%');

  larguras(sh, { B: 120, C: 260, D: 120, E: 120, F: 120, G: 70, H: 120, I: 120, J: 120, K: 70, L: 16, M: 70, N: 70 });
  sh.setFrozenRows(0);
}

/* ---------------- Lançamentos da planilha ---------------- */

function montarManuais(sh, guardados) {
  faixaTitulo(sh, 'B1:R1', 'LANÇAMENTOS DA PLANILHA');
  var cab = ['ID', 'Data', 'Tipo', 'Item', 'Categoria', 'Valor', 'Movimentação', 'Forma de pagamento', 'Responsável',
             'Ao leite', 'Meio amargo', 'Branco', 'Cliente', 'Bairro', 'Situação', 'Registrado em', 'Comprovante'];
  sh.getRange(3, 2, 1, cab.length).setValues([cab]);
  cabecalho(sh.getRange(3, 2, 1, cab.length));
  sh.setRowHeight(3, 32);
  sh.setFrozenRows(3);
  if (guardados && guardados.length) {
    var rg = sh.getRange(MAN_INI, 2, guardados.length, MAN_COLS);
    rg.setValues(guardados);
    estiloCorpo(rg);
    listrar(rg);
  }
  sh.getRange('C4:C2000').setNumberFormat('dd/mm/yyyy');
  sh.getRange('G4:G2000').setNumberFormat('R$ #,##0.00');
  sh.getRange('Q4:Q2000').setNumberFormat('dd/mm/yyyy hh:mm');
  larguras(sh, { B: 120, C: 95, D: 105, E: 220, F: 110, G: 100, H: 115, I: 140, J: 110, K: 75, L: 90, M: 70, N: 130, O: 110, P: 130, Q: 135, R: 200 });
  botoes(sh, 'B1:R1', ['lancar']);
}

/* ---------------- 5 Forças de Porter ---------------- */

function montarPorter(sh) {
  faixaTitulo(sh, 'B1:P1', '5 FORÇAS DE PORTER');
  var forcas = [
    ['RIVALIDADE ENTRE OS CONCORRENTES', [
      ['Existem muitas marcas vendendo doces de chocolate parecidos em Natal?', 'N'],
      ['O mercado de doces está crescendo rápido?', 'S'],
      ['A Choc Bites tem um diferencial claro (cubinhos com casquinha, porção para dividir)?', 'S'],
      ['Os concorrentes brigam por preço baixo e promoções?', 'N'],
      ['O cliente troca de marca de doce com facilidade?', 'N']]],
    ['PODER DE NEGOCIAÇÃO DOS CLIENTES', [
      ['O cliente encontra doces parecidos com facilidade (aplicativos, docerias, mercado)?', 'N'],
      ['O cliente troca de fornecedor sem custo nenhum?', 'N'],
      ['O cliente é sensível a preço?', 'N'],
      ['O cliente compra em grande quantidade de uma vez?', 'N'],
      ['O cliente volta a comprar e indica a marca?', 'S']]],
    ['PODER DE NEGOCIAÇÃO DOS FORNECEDORES', [
      ['A qualidade depende de insumos de marca específica (cobertura Sicao)?', 'N'],
      ['Existem outros fornecedores que vendem os mesmos insumos?', 'S'],
      ['Os fornecedores conseguem impor aumento de preço (chocolate)?', 'N'],
      ['Há falta ou atraso na entrega dos insumos?', 'N'],
      ['A Choc Bites tem boas condições com os fornecedores?', 'S']]],
    ['AMEAÇA DE PRODUTOS SUBSTITUTOS', [
      ['Bombons e barras de supermercado substituem a Choc Bites?', 'N'],
      ['Doces de aplicativo (brigadeiro, brownie) atendem a mesma vontade?', 'N'],
      ['Sobremesa feita em casa substitui a compra?', 'N'],
      ['Os substitutos são mais baratos?', 'N'],
      ['O formato de cubinhos com casquinha é difícil de achar nas alternativas?', 'S']]],
    ['AMEAÇA DE NOVOS CONCORRENTES', [
      ['É preciso muito dinheiro para começar a vender doces?', 'S'],
      ['Um novo concorrente consegue vender pelo WhatsApp e Instagram com facilidade?', 'N'],
      ['Leis ou licenças dificultam vender doces caseiros?', 'S'],
      ['A marca e a rede de clientes da Choc Bites dificultam a entrada?', 'S'],
      ['Quem entra precisa de grande escala para competir?', 'S']]]
  ];
  var pos = [[4, 2], [4, 7], [4, 12], [13, 2], [13, 7]]; // linha, coluna de cada bloco
  var medias = [];
  forcas.forEach(function (f, k) {
    var r0 = pos[k][0], c0 = pos[k][1];
    sh.getRange(r0, c0, 1, 4).merge().setValue(f[0]);
    cabecalho(sh.getRange(r0, c0, 1, 4));
    sh.getRange(r0, c0).setBackground(COR.rosa);
    sh.getRange(r0 + 1, c0, 1, 4).setValues([['QUESTÕES DETERMINANTES', 'AVALIAÇÃO', 'INVERTE?', 'NOTA']]);
    cabecalho(sh.getRange(r0 + 1, c0, 1, 4));
    var corpoQ = f[1].map(function (q) { return [q[0], '', q[1], '']; });
    sh.getRange(r0 + 2, c0, 5, 4).setValues(corpoQ);
    corpo(sh.getRange(r0 + 2, c0, 5, 4));
    sh.getRange(r0 + 2, c0, 5, 1).setHorizontalAlignment('left').setWrap(true);
    sh.getRange(r0 + 2, c0 + 2, 5, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['S', 'N'], true).setAllowInvalid(false).build());
    sh.getRange(r0 + 2, c0 + 1, 5, 1).setBackground(COR.claro);
    sh.getRange(r0 + 2, c0 + 3, 5, 1).setBackground(COR.claro).setFontWeight('bold');
    var nota = letra(c0 + 3);
    sh.getRange(r0 + 7, c0, 1, 3).merge().setValue('MÉDIA DA FORÇA');
    cabecalho(sh.getRange(r0 + 7, c0, 1, 3));
    var media = sh.getRange(r0 + 7, c0 + 3);
    media.setFormula(fx('=SUM(' + nota + (r0 + 2) + ':' + nota + (r0 + 6) + ')/5'));
    corpo(media);
    media.setFontWeight('bold').setNumberFormat('0.0');
    medias.push([f[0], nota + (r0 + 7)]);
    for (var i = 2; i <= 6; i++) sh.setRowHeight(r0 + i, 40);
  });

  // Resumo das forças
  var r = 13, c = 12;
  sh.getRange(r, c, 1, 3).merge().setValue('5 FORÇAS DE PORTER');
  cabecalho(sh.getRange(r, c, 1, 3));
  sh.getRange(r, c).setBackground(COR.rosa);
  sh.getRange(r + 1, c, 1, 3).setValues([['FORÇA', 'MÉDIA', 'INTENSIDADE']]);
  cabecalho(sh.getRange(r + 1, c, 1, 3));
  var nomes = ['RIVALIDADE', 'BARGANHA DOS CLIENTES', 'BARGANHA DOS FORNECEDORES', 'PRODUTOS SUBSTITUTOS', 'NOVOS CONCORRENTES'];
  var sep = separadorArgumentos();
  medias.forEach(function (m2, i) {
    var lin = r + 2 + i;
    sh.getRange(lin, c).setValue(nomes[i]);
    sh.getRange(lin, c + 1).setFormula(fx('=' + m2[1]));
    var M = 'M' + lin;
    // Faixas: abaixo de 1,8 muito baixa; 2,6 baixa; 3,4 média; 4,2 alta; daí para cima muito alta
    var f = '=IF(' + M + '=0;"";IF(' + M + '*10<18;"MUITO BAIXA";IF(' + M + '*10<26;"BAIXA";IF(' + M + '*10<34;"MÉDIA";IF(' + M + '*10<42;"ALTA";"MUITO ALTA")))))';
    if (sep) sh.getRange(lin, c + 2).setFormula(f.replace(/;/g, sep));
  });
  corpo(sh.getRange(r + 2, c, 5, 3));
  sh.getRange(r + 2, c, 5, 1).setFontWeight('bold');
  sh.getRange(r + 2, c + 1, 5, 1).setNumberFormat('0.0');
  sh.getRange(r + 2, c + 2, 5, 1).setFontWeight('bold');
  sh.getRange(r + 7, c, 1, 3).merge().setFormula(fx('=AVERAGE(M' + (r + 2) + ':M' + (r + 6) + ')')).setNumberFormat('"Média geral: "0.0');
  corpo(sh.getRange(r + 7, c, 1, 3));
  sh.getRange(r + 7, c).setFontWeight('bold').setBackground(COR.brilho);

  // Escalas
  var e = 23;
  sh.getRange(e, 2, 1, 3).merge().setValue('ESCALA DE AVALIAÇÃO');
  cabecalho(sh.getRange(e, 2, 1, 3));
  sh.getRange(e, 2).setBackground(COR.rosa);
  sh.getRange(e + 1, 2, 7, 3).setValues([['AVALIAÇÃO', 'NOTA SE N', 'NOTA SE S'],
    ['MUITO ALTA', 5, 1], ['ALTA', 4, 2], ['MÉDIA', 3, 3], ['BAIXA', 2, 4], ['MUITO BAIXA', 1, 5], ['ZERO', 0, 5]]);
  cabecalho(sh.getRange(e + 1, 2, 1, 3));
  corpo(sh.getRange(e + 2, 2, 6, 3));
  sh.getRange(e + 2, 2, 6, 1).setFontWeight('bold');

  sh.getRange(e, 7, 1, 2).merge().setValue('FAIXAS DE INTENSIDADE');
  cabecalho(sh.getRange(e, 7, 1, 2));
  sh.getRange(e, 7).setBackground(COR.rosa);
  sh.getRange(e + 1, 7, 6, 2).setValues([['MÉDIA DA FORÇA', 'INTENSIDADE'],
    ['até 1,7', 'MUITO BAIXA'], ['1,8 a 2,5', 'BAIXA'], ['2,6 a 3,3', 'MÉDIA'], ['3,4 a 4,1', 'ALTA'], ['4,2 ou mais', 'MUITO ALTA']]);
  cabecalho(sh.getRange(e + 1, 7, 1, 2));
  corpo(sh.getRange(e + 2, 7, 5, 2));

  larguras(sh, { B: 300, C: 100, D: 80, E: 60, F: 20, G: 300, H: 100, I: 80, J: 60, K: 20, L: 300, M: 100, N: 110, O: 60, P: 20 });
}

function letra(col) { return String.fromCharCode(64 + col); }

// Testa se a planilha aceita ponto e vírgula ou vírgula entre argumentos (só usado na intensidade do Porter)
function separadorArgumentos() {
  var sh = SpreadsheetApp.getActive().getSheetByName(ABA.banco);
  var c = sh.getRange(1, sh.getMaxColumns());
  var resp = '';
  [';', ','].some(function (s) {
    c.setFormula('=IF(1>0' + s + '3' + s + '4)');
    SpreadsheetApp.flush();
    if (c.getValue() === 3) { resp = s; return true; }
    return false;
  });
  c.clearContent();
  return resp;
}
