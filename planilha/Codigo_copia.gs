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
