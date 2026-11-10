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
  vermelho: '#B3261E'
};
var FONTE = 'Montserrat';

var ABA = {
  fluxo: 'Fluxo de Caixa',
  vendas: 'Vendas por Dia',
  custos: 'Custos Gerais',
  markup: 'Markup',
  indicadores: 'Indicadores Financeiros',
  swot: 'SWOT',
  banco: 'Banco de dados'
};

var SABORES = ['Ao leite', 'Meio amargo', 'Branco'];
var COL_SABOR_CUSTOS = { 'Ao leite': 5, 'Meio amargo': 7, 'Branco': 9 }; // colunas E, G, I
var NOMES = { 'Gas': 'Gás' };

/* ---------------- Menu ---------------- */

function onOpen() {
  var menu = SpreadsheetApp.getUi().createMenu('Choc Bites')
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
    SpreadsheetApp.flush();
    avisar('Dados atualizados: ' + d.atualizado);
  } finally {
    trava.releaseLock();
  }
}

function limpar(sh, linha, coluna, nCols) {
  var ult = Math.max(sh.getMaxRows() - linha + 1, 1);
  sh.getRange(linha, coluna, ult, nCols).clearContent();
}

// Escreve uma tabela: valores com setValues e fórmulas com setFormula
// (setFormula sempre entende a fórmula em inglês com vírgula, qualquer que seja o idioma da planilha)
function escrever(range, matriz) {
  var semFormula = matriz.map(function (l) {
    return l.map(function (v) { return (typeof v === 'string' && v.charAt(0) === '=') ? '' : v; });
  });
  range.setValues(semFormula);
  var r0 = range.getRow(), c0 = range.getColumn();
  var sh = range.getSheet();
  matriz.forEach(function (l, i) {
    l.forEach(function (v, j) {
      if (typeof v === 'string' && v.charAt(0) === '=') sh.getRange(r0 + i, c0 + j).setFormula(v);
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
  var vendas = Object.keys(dias).sort().map(function (k) { return dias[k]; });
  limpar(sh, 3, 11, 6);
  if (vendas.length) sh.getRange(3, 11, vendas.length, 6).setValues(vendas);

  // Parâmetros vindos do sistema
  var entregas = 0;
  d.fluxo.forEach(function (f) {
    if (f.item === 'Gasolina' || f.item === 'Entrega 99 (encomendas)') entregas += Math.abs(Number(f.valor));
  });
  sh.getRange('T5').setValue(Number(d.investimento));
  sh.getRange('T7').setValue(d.atualizado);
  sh.getRange('T8').setValue(entregas);
}

function escreverFluxo(sh, fluxo) {
  var ini = 4, n = fluxo.length;
  var resto = sh.getMaxRows() - ini + 1;
  if (resto > 0) {
    sh.getRange(ini, 2, resto, 8).clearContent().setBackground(null).setBorder(false, false, false, false, false, false);
  }
  if (!n) return;
  if (sh.getMaxRows() < ini + n) sh.insertRowsAfter(sh.getMaxRows(), ini + n - sh.getMaxRows());

  var valores = [], fB = [], fGHI = [];
  fluxo.forEach(function (f, i) {
    var r = ini + i;
    valores.push([paraData(f.dia), f.item, Math.abs(Number(f.valor)), f.forma]);
    fB.push(["=VLOOKUP(D" + r + ",'Banco de dados'!$B$3:$C$300,2,0)"]);
    fGHI.push([
      '=IF(B' + r + '="ENTRADA",E' + r + ',0)',
      '=IF(B' + r + '="SAÍDA",E' + r + ',0)',
      i === 0 ? '=G' + r + '-H' + r : '=I' + (r - 1) + '+G' + r + '-H' + r
    ]);
  });
  sh.getRange(ini, 3, n, 4).setValues(valores);
  sh.getRange(ini, 2, n, 1).setFormulas(fB);
  sh.getRange(ini, 7, n, 3).setFormulas(fGHI);

  var tab = sh.getRange(ini, 2, n, 8);
  estiloCorpo(tab);
  listrar(tab);
  sh.getRange(ini, 3, n, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(ini, 5, n, 1).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 7, n, 3).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 2, n, 1).setFontWeight('bold');
}

function escreverVendas(sh, d) {
  var ini = 4;
  var resto = sh.getMaxRows() - ini + 1;
  sh.getRange(ini, 2, resto, 10).breakApart().clearContent().setBackground(null)
    .setBorder(false, false, false, false, false, false).setFontWeight('normal').setFontColor(COR.amargo);
  var vistos = {}, dias = [];
  d.pedidos.concat(d.vendas).forEach(function (p) { if (!vistos[p.dia]) { vistos[p.dia] = true; dias.push(p.dia); } });
  dias.sort();
  var n = dias.length;
  if (!n) return;

  var BD = "'Banco de dados'!$K:$P";
  var linhas = dias.map(function (t, i) {
    var r = ini + i;
    return [
      paraData(t),
      '=VLOOKUP(B' + r + ',' + BD + ',2,0)',
      '=VLOOKUP(B' + r + ',' + BD + ',3,0)',
      '=VLOOKUP(B' + r + ',' + BD + ',4,0)',
      '=VLOOKUP(B' + r + ',' + BD + ',5,0)',
      '=D' + r + '+E' + r + '+F' + r,
      '=VLOOKUP(B' + r + ',' + BD + ',6,0)',
      '=H' + r + '/C' + r,
      "=G" + r + "/'Banco de dados'!$T$6",
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
    .addRange(sh.getRange(3, 2, n + 1, 1))
    .addRange(sh.getRange(3, 8, n + 1, 1))
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
  var nomes = sh.getRange(6, 2, 7, 1).getValues().map(function (r) { return r[0]; });
  var qtd = {};
  d.receitas.forEach(function (r) { qtd[r.sabor + '|' + nome(r.insumo)] = Number(r.qtd); });
  SABORES.forEach(function (s) {
    var col = COL_SABOR_CUSTOS[s];
    sh.getRange(6, col, 7, 1).setValues(nomes.map(function (n) { return [qtd[s + '|' + n] || 0]; }));
  });
  d.rendimento.forEach(function (r) {
    if (COL_SABOR_CUSTOS[r.sabor]) sh.getRange(14, COL_SABOR_CUSTOS[r.sabor]).setValue(Number(r.rend));
  });
}

/* ---------------- Estilo ---------------- */

function estiloCorpo(r) {
  r.setFontFamily(FONTE).setFontSize(10).setFontColor(COR.amargo)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, COR.brilho, SpreadsheetApp.BorderStyle.SOLID);
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
