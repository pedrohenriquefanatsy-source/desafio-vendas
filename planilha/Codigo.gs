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
    escreverVendas(ss.getSheetByName(ABA.vendas), d.pedidos);
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

  // Vendas por dia e sabor (kits já abertos em caixinhas)
  var mapa = {};
  d.vendas.forEach(function (v) {
    var k = v.dia + '|' + v.sabor;
    var m = mapa[k] || (mapa[k] = [paraData(v.dia), v.sabor, 0, 0]);
    m[2] += Number(v.q); m[3] += Number(v.fat);
  });
  // Valor a mais pago pelo cliente entra no faturamento do dia
  d.fluxo.forEach(function (f) {
    if (f.item !== 'Valor a mais') return;
    var k = f.dia + '|Valor a mais';
    var m = mapa[k] || (mapa[k] = [paraData(f.dia), 'Valor a mais', 0, 0]);
    m[3] += Number(f.valor);
  });
  var vendas = Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
  limpar(sh, 3, 11, 4);
  if (vendas.length) sh.getRange(3, 11, vendas.length, 4).setValues(vendas);

  // Pedidos por dia
  var ped = d.pedidos.map(function (p) { return [paraData(p.dia), Number(p.n)]; });
  limpar(sh, 3, 16, 2);
  if (ped.length) sh.getRange(3, 16, ped.length, 2).setValues(ped);

  // Parâmetros vindos do sistema
  sh.getRange('T5').setValue(Number(d.investimento));
  sh.getRange('T7').setValue(d.atualizado);
}

function escreverFluxo(sh, fluxo) {
  var ini = 4, n = fluxo.length;
  var resto = sh.getMaxRows() - ini + 1;
  if (resto > 0) {
    sh.getRange(ini, 2, resto, 6).clearContent().setBackground(null).setBorder(false, false, false, false, false, false);
  }
  if (!n) return;
  if (sh.getMaxRows() < ini + n) sh.insertRowsAfter(sh.getMaxRows(), ini + n - sh.getMaxRows());

  var valores = [], formB = [], formG = [];
  fluxo.forEach(function (f, i) {
    var r = ini + i;
    valores.push([paraData(f.dia), f.item, Math.abs(Number(f.valor)), f.forma]);
    formB.push(["=VLOOKUP(D" + r + ",'Banco de dados'!$B$3:$C$300,2,0)"]);
    formG.push([i === 0 ? '=IF(B' + r + '="ENTRADA",E' + r + ',-E' + r + ')'
                        : '=G' + (r - 1) + '+IF(B' + r + '="ENTRADA",E' + r + ',-E' + r + ')']);
  });
  sh.getRange(ini, 3, n, 4).setValues(valores);
  sh.getRange(ini, 2, n, 1).setFormulas(formB);
  sh.getRange(ini, 7, n, 1).setFormulas(formG);

  var tab = sh.getRange(ini, 2, n, 6);
  estiloCorpo(tab);
  listrar(tab);
  sh.getRange(ini, 3, n, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(ini, 5, n, 1).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 7, n, 1).setNumberFormat('R$ #,##0.00');
  sh.getRange(ini, 2, n, 1).setFontWeight('bold');
}

function escreverVendas(sh, pedidos) {
  var ini = 4;
  var resto = sh.getMaxRows() - ini + 1;
  sh.getRange(ini, 2, resto, 10).breakApart().clearContent().setBackground(null)
    .setBorder(false, false, false, false, false, false).setFontWeight('normal').setFontColor(COR.amargo);
  var dias = pedidos.map(function (p) { return paraData(p.dia); });
  var n = dias.length;
  if (!n) return;

  var linhas = [];
  dias.forEach(function (dia, i) {
    var r = ini + i;
    linhas.push([
      dia,
      "=VLOOKUP(B" + r + ",'Banco de dados'!$P:$Q,2,0)",
      "=SUMIFS('Banco de dados'!$M:$M,'Banco de dados'!$K:$K,$B" + r + ",'Banco de dados'!$L:$L,D$3)",
      "=SUMIFS('Banco de dados'!$M:$M,'Banco de dados'!$K:$K,$B" + r + ",'Banco de dados'!$L:$L,E$3)",
      "=SUMIFS('Banco de dados'!$M:$M,'Banco de dados'!$K:$K,$B" + r + ",'Banco de dados'!$L:$L,F$3)",
      '=SUM(D' + r + ':F' + r + ')',
      "=SUMIF('Banco de dados'!$K:$K,B" + r + ",'Banco de dados'!$N:$N)",
      '=H' + r + '/C' + r,
      "=G" + r + "/'Banco de dados'!$T$6",
      i === 0 ? '=H' + r : '=K' + (r - 1) + '+H' + r
    ]);
  });
  var tab = sh.getRange(ini, 2, n, 10);
  tab.setValues(linhas);
  estiloCorpo(tab);
  listrar(tab);

  var t = ini + n, f = ini + n - 1;
  sh.getRange(t, 2, 1, 10).setValues([[
    'TOTAL', '=SUM(C' + ini + ':C' + f + ')', '=SUM(D' + ini + ':D' + f + ')', '=SUM(E' + ini + ':E' + f + ')',
    '=SUM(F' + ini + ':F' + f + ')', '=SUM(G' + ini + ':G' + f + ')', '=SUM(H' + ini + ':H' + f + ')',
    '=H' + t + '/C' + t, "=G" + t + "/('Banco de dados'!$T$6*COUNT(B" + ini + ':B' + f + '))', '=K' + f
  ]]);
  var tot = sh.getRange(t, 2, 1, 10);
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

/* ============================================================
   MONTAR PLANILHA (rodar uma vez numa planilha vazia)
   ============================================================ */

var LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAKwAAAB4CAYAAABvnhnhAABP2UlEQVR42u1dZ3hUVdddt05LJr2RQCihhU4QkSKKiKCIWMCCigVBUcTeXn0jVhAbFhSkqKAoCIj03iFAQiCQ3vuUlOkzt57vxySISEkolvfLeh4eYMqde89dd5999t5nbaAFLbg0UOMABgDltGZPcFlzT7gsOV/NnzYprmVoWvCPQzJAjwlDYEHKxnslV7mPCFWEKBZSlrHzDQD05f49umXIW3ApmAGot98/MSwyPv5tlmM1oiACqgqGYQfCb3lbCNuCfxb6jRp5V0BIcAdJEBqcBAoMy1UDUFsI24J/nEvQpmePERRDgzS+qCjgDbrdAJTmHo8AVAthW3DFMPz7z3rwev3ViigBABiGhs/rc9aVmw809Rh5KRuMnrrCwVvnvnPng60CQ1tGtQVXBOMA3pKX8igRqongKCGCo4QQ0UTc1txNuIClBIChAGs3Z00UbMU5kqtMFV1lQs7e354cB/AtFrYFlx0rAMkYEZkE5ncaEVWFz+H85ULfXfDIPa1+Lc9YEhgU/C2v1XQmhFCcXse36thhcCIgn+t7bMuwt+BisXjiUI0siUkaRQcA4DgOboej/PCaVesbLCw5y9eYnNSdIW07tFmkCQy4SfL6QAg55fvWVFSmzTj791oIe8ZMc1lXtD8+/WjU2Ddf07AaNoKjKIMkE0JoxZG195B9yVPPKx8XVlXgPDfmSoHYSkNsNls7m6mqc6tu3YjP49YRSfAGhYSVQM8Vj6CiXVsBd1OOFdihV2tC1Paq4l9bUSwDW1XVT4vefE8413gufnli67Yd2nytMQbeJLo9p17n9Xp4nc6N+VnHvzrfuFD/35i57v1XQmK7dR4K0P3bX92vXvWJctbe/TWHv1mx9tndu22XcGj+q0fHDR05+dGkiHbtBlA01YvTaEJB0QGchqMBCookybIku9z1dbWCx3NIEjxrSo9m77z20enWK3jJ/Op3Xrp+wJ23DTRGRAxheb4zgAiO4ziKpv0MUAkkSQIoyuqwWCpsFvNP5QcPz7/+2RnnHQ+3uzyOVZRMmqaNNE3D5/GYU1etuWbH5BdLZ5yFsO+NvSHssY9mfR/ets3NfySrDqLHe4SnlFupwA7mFvsJIHXeZM5amPqky5qbJzpLVUJqCCH1hJA6IrnKiLe+cHdx2tZrmnlYCgBzYOnnPUqP7VjitubWErGaENlCiFpDfPWFpKY4jZSkbSWZ25aTsvTtxFmdSYhkIoTYCRFNxFtfeDJv75p3PrhtaG8AVPLQS5v1CCGNRohK37jkOld11lJPXaGv8VoVbwURnaWnFkmNf0RnKZHd5YSI1f7zqis8suf7T+8BwM9LSuLO9ltbP3/7Ok9dgSi5ygiRTKS+7OgLZzOCy8eNY0YD+srMvR8T0URE5++/S2Qz8doK093u8pZUbiM+nnB7TE1x6m9ENBGiWInLkkPy960lJ9YtJbm7VhNvfSEhioV46wrNa2e9eHNTjzsmLCww9deFX/vqC2uIbCGKp4KIrjJirzpJfpv1MvlgzBDyar8E8ly3VuSpdsHkqfYh5OU+bcmHd1xHNn76X1J+fGcDeetIXcnRitw9v95zObJDK995LcZccGie4CjxEWInLksOSV29kKx6+1lSkLKByJ6KPxH2zD9ENBF3TZ5wdMOPE8/1O7+++3yiy5JrI8RO7NWZe+dNvjf8XA923v7fHhYdJURylZ16QIhsId76gt0bv5jZbSigbaqF+Mfj0wdGt+kxZNB1cZ26RMR2Taxx1tTlzBg2vPhrs9tyoe9OjoH+/YNH3w1t0/oZVZSQtWcPtn+zAJHt2yMwOAQ1lRXoeNVVGDB+HBiOhcNs3fnTM8/cPmXFNvv5jvvDc5O7jH7h6fcDw0LHEkWFLMsNSR4KgscDU0EBWI3m1OdlUYS1pARVuXkoPXECVbm5ELxedLnmGoyYMgUdhwyBKvhEWRQ/N9uq3mjTZqD3YsZq/w+f39Rz+PCPAyKjEyWnHbt/+AF7lixFXGIirn/4IbTp1g0U3bTgEK/RQPT5SnmK70cZY2vOfH9CQqjxvwsWP6YLDRpwZPWqD+5M/uzI2Y6zZU7ygGsnTvyF12hiJUkCTdNgeR5V+fmbts2bP2XiZ0vKkhMT+RlZWSL+zRmUdwf3jhDsxQ956wuzG59IIluI5CrzWfJS9h1c8U3PM6bBP2H7/PeHCY5il+KpIJ7afLL1y3dIWfp2IjrLiCpUE9ldQVyWnFNPvegsVY+sWnjvZIA710J1+4JZnWuKUtOJYjn39OqtJLKnwv+3t5Io3kqiiiZCRBORXGXEWpRKdi6YTd6+oS95OiGM/DbzZSK5ygghdURwlKzZ+Ely2/uCENKcMTu0csEET21+PSH1pOjwJvL+yKvJiz1bk/1LPyeyp4IovqoLWtY/WVrJTIqObH7prHHYcReaDShMCA01lqZt20Vks/94vioiucuF6qx9s58dEKf7X5nFqRevbt+x8NDG7f5p3OK/yYVHiLUwlSjeCkJUK3HX5OWe3Ptbm+TzxJOL07bObhwswV7sJ9EZU+LppCOymZQd27Ec5wheb/roo1BHdeZBIluaffNP/XGWEsldTohoIj5bEUlbs5i8MbArmXPPCFJXdowQUkfqy48fWDhtQmIzLOs93roCJyF1JHf3r+S5xBjy/qgBpCpzLyGS+awPVpMIK5tJffnxuRfrquz97tOJorNUlt3lhEhm4q0vLD38y7zpF0uMyx7W+mjcAN2gW+/rxBkNfcPiYsMi23UgUIheJaqYtW9faH1lRV5ZdvaBx776ObvROlIURU63rLsA/bT5C59q3S1xGFSCgpTDWP3+TNitFuiMRnQfdj1GTp0KfVhop3bdEqfPAF4+VxglJqFDHBrjfBQFRZbPtlD5/d+yAmNkRO9ZwweGv7ztQNXpn5veKz64z5jBXwZGhA8QPZ5LWRlBVRSIigKaYdB31Cgk9OuHdXPmYMlLL2PSF58jOC72mnvffPOd9p0THrz+qRmu81rW1Yt7d736qrna4OCA4sOHMW/qVMR07IjHvvwCgREREL3eS7qnDouVvcgQHB2VkNCPCwhhREctqcrP311y+OiUaye/kHfRluyip+yhQ9kZu3fLAPBsx7jYpxbNS2zVrdNwVSU3URTVkddq9YxWC9BcQ5iTAJAhu91QFblE8HrXMgw90xDRtepM0qb8NO/63qNGbOS1Wk1xejp+Sn4TPYffgF4jRiAgOBh2aw2i2rWF1qCH4PWW5u8/1Kfn6An1ZxswlyV3ryHIOFBsrCS60AjTNGRZ8ppzcvu1HXBz1qlRIkDKz1+/dtXoW95VVPUPJL8sgWCGAcNx2PfDj3BYLbjpySfBaniYCos+iel8zSsAxLOkRpkRT98Tfl/y2z/og4Nu8Dmc+Pjue8DyPKbM+xoBoaFQJOnipzmKAk3TqMjOubVtvxvXXcwxlr/x5DUJVw+Y4LXZDy165fmDByuEsqyzXMsVJywAzQe3Dex689Tpt4bGxjwe1rp1K96gB2QFiqJAkWXUlJfDVFAIS2kJaJpBq06dENupE0Li2wAUILs9xSe2bX1z1NhHV5p/D1azVVn7fojp1HG8IkrI2rUbQVFRaNOrJxRJAlEUUDQNRVH8IURFIembNo++5p4nNpztJAVHyQFew18jCk0fI47j4HW5xxgiOq1tfO3gj99E9Rp5/W6tXt9ZEq/c2oDleViLihEUHQVWo4GqKNKJnTsn9Lvt4RVn+3jBoU2fdujb50kQgs1zv0L65s144pv5CAgLu0SyAlyAAeaCoi2zXps+9pMVKV78RSDkJL/5s58HBYXHhPYaeWPVkVW/KUMfez4VgHpRLsELiRHRz69cPdIYFvGyPsjYBSCQRAmix+u/UlVFyi+rkH84BW6HA6qi+l9buRKix4O+N9+Mm56cCkNIcLuu113/2bqVi6qvuvORrQCwc/HigKDIqKtVSYYiy0i8bigA4A9TsKo2lqJBo9NS3YdeG3Cuc23MwjTrZnEsLKUlNwJYCwBJANdlcP8HdYGBnS91er0QZFFEWHwbqIoCVVHAazVc+z59kj+4c3DukZX7MlecVrK3+ZM3kmI6tHuIKApsFgsytm/H/bNmIjA8HPJFPlQ0TYHleIAC6isqt+5bumT6GWRlf3v31QRWS3UNDI+0ykX1qdfPmCFeZKaQBqBOTkriHk9+sndYXOsbWnXs3FVyq32vfWBiB5qmdRRNk2vuvctjHjpo3tzHHklutoU9uW15Ynz37rMNwUE3UywHoqqQRRFEVf/goymyDJbnQTOMn8SEQHC7UZWbhx3ffgsQggdmfwBdkBGuurq9mT8uGz1g+gxn6bGdg2Lat9tJ0RSrqheednm9DnaTOTk4rudbZ+Oey5K73RBsvF70CU2+Rl6ng9fh+PaJvh2f+K4UvnVz3w8Zds+4A1q9roskSvirwWs0qC4serJV4qC5ja+NBcI+Tdv2eXyvHveqkozcgylwWCy4+o7bIfp8zTo+w9BgOP8aU/B4JRD1aP6RI1u+f2PGktmHsvMBYP/K7yNbtYmaENWu3QgCXM2wrJFmWUkWhQO1uTmPt77m1vzmXtf2BbPjew4dOtoYFXE7UclAjUHvjxrICmRFOeV2cVoNvE6necePS3s3y8I6TDm3abT8V7zRGEMkCVU5ucjZvw/dr7sOoXFxv1szigLD8yANxD011ep0aN8vCe369kHGtm1w1tSA12qh0equ6TvxwS6YPuNwQEhILMfzrNgMC8HrdFHnml14rdYEqpnPparA63T1CRJDIoH6soG3jBrMa7WdZUn+28ImoXGxD1ampn4b26+fBwAmz3mrTVTb+FGKIEJRVcT37AGW55tFVpqmwWp4+NxuZ121JaW2vPyAzVR9aEB01609RtwjAzCueOuZbqMef/wuXqd7kOP59qAoqIoCyeeDIgiMLjR8WHC7Dq8CeLQpC7OhAPv8rFeHDn/koVspmr5XGxAQCQqQRQmi13fGg8SA4TlAUVBbXrl687pD9Rck7MT4eO2R0lL1qL14KstxsxitlneYTFj/2edI/e033DDpUQRFR//RwjZY2T+xp8Eag6LQa8SNkBumfV6nZbP2HbkjCMiryMoaGtoqphnkIiCq0vZc1UEExNJcwqoqgaoq8VFJXfTj1h0MIsB4hucoxSNf9OLlzGhEcyCJIhiavorSeYcC2AgA191/7w1aozG40UXhNBr/xTfxN3gND5/HK9ZVVi7N3Ldv/rBHXzwKoHH6oN4deXXP+2e+d0todPSzhtCQCCJJEAUBoChQAH77+BMMHD8escFB8LncSZNjoJtfjQuGTual7gyOi2+1WBce0Zr4vJAkCVTDGHEcB4qhAZoGFAWiINpUn7rdXlO39N3b7z7wdZFZuCBhvystVbN3rVrA8fwDNMeh6MgR/Pjaf2ApKcF9776D/mPH+hdDzbkZhED+w9RKQZXlrnbAQbN0cPM8dBU0y4efGWlohLmoGK27JTbzkCoMwcGY9Pmntrm+qUEMy1xPLsK6siwDmuMgen2EYRiK4TnIgghVVZtbHwBOq6V9Lvek/sD+Q+Skz1dP3YvT/PPmjD+v06Kuqrr02NYdL94w6fnVOKP+1GnKHCZL8hfBUVFdVEX2r01OXROLwtQ0ZGzbhhGPTwGRZRgjwgPezchm5kd0veBv67xuhShqkeJxhyiiGKASAoplvIooeSmGsUpej9XndOXRFLOzxlJ1pOvgsbnNisP67MVPcRr+fpphkbt/PxZOmwbB68OkLz5HzxtvxCXFI0+LVbTp1i0bgEpRVGDzZm8VRJFbr3hlShyAsjPf1wcZS9FMy0YIAc2yek7VRd761FSd1mCIUJq5eOM1GvjcbnNdYdHSssycVIMxkI3t2vm6gLCweziOM0jNXMETRUZQVFTStX3atT22KT2068DB3WW5+f40r9NBcLt3ZW3b9OgNk14tOv29hQ+Pi7jl5efe0AYaH2NZVns294JmGJRlnoTo9YKiKCiyAobj2vnKSqcB+DQBUAqAcy4Y4oeMtn1///23jPv89cj9y37pEhwd40waNbr66I7tXkGsrh84/nnvxSYO6LqS9HtZjptF0zRVnZ+Pxc8+B1EQ8ehnc9Bz+PDLQ9aGad1mtpgBQG8Mtjdv+lYBmg4ObhXT6myE5ViWNDd4RwgByzC822ZK6DTgGsJrNXxzFlscz8Nlq885uHzFMyOmJW++A2i/CigCsDR93ZItnQcM+IrX60LPlsQ4FxRZgdYYGHPrtCcDYtq276XRafnmLCRPPUQud6rsc9w95NFXT9VhJAHcQ4+MiRj/7oyvAiLCx8g+H84VtyaEIDA8HG6bDZbiYnTo1w+KJFGRbdomV2cdCJV9rnlvPzaiZH4a5HP4tOTBpUvdDy5dWgyg+LLtms3Y+MPVmsCA+TRNsYLXh5/fnAG3zYaHP/nYT9bLFN6haRqSTxAsBUXpABCXmJjZHIKpqgqNTqdrm9Svz1nfp9D3Ikr0wLAMdKGhRlmSu1AM26zrcdsd0r4GsgJAA1kBAH1GP7By38/LF6qKQqhm+NaEEGg0PH/NXXdR+pDQjqDoZkcCJFmyWYpKHg+M6f2HoqEIIHjUpClzAyLDx0he73ldFkVREN+zJziNBtsWLITc4NfSDM1Hd2j3fEyXxNSP1mfPIVew0v5PmDlyaFy7Pn1m642BetA09ixdipy9e3HHK6+g14gRuJyxSFbDQ/B5UvvdNWkfAFTl5hsvZlET2S5+ys7FH0SflvNm3TV5AwzBwSOUiwlF0TRKMk4M4DV8WHOvx+u0L/t6WvKh5ORk+ixFPWTN51/Oqq82Z7E837yHiOOQm3JwqNfl7Itm+sEMz8NmMi+ITxqWdubwfZ2+7aY2PbrfJnm8fl/4PA+SKssIb90a1z/0ENLWrcPK92dCVWSwGo1/ccgyRprjbt6/YFbAFUms/DHdCnbGbshjXn7q8YDQ0EGyKMFhsWDr/G8w9IEHcN3EBy8rWWmahiyIctnJzM+7DesqA0BAaJCluVlrSRQRFBbWa8DYO1cX9ui9jciyLr5b9zAVZCxDM8GyLF+UY80wXHhNWVm8ISS4ydkhWRRJYEjosjWAbc2MGTibUgpyqmqTKWoZRVPvNLMEATazdXh0h4RWzVm4MSwDn8tjztiyZfGZ76187ZnosJjYNziegyiIoGkaRJCg0pR/xX4O0o6a9hQkQcC2b75ByfHjGHD77bj6jttB0TQ4DRcR1aNrdwApxL9EIVfEwnaLBNm/9Iv4Dn2TJqiKAobjcHDlSkTGx+P2V16GLEnAZcqhMwwDVsPDZrHO7jbsrlNpx6Cw0FJcRHZKFCVodboB7Xv1fL1DUtLzrJZ/iKGpiyRrw4It2KiRBDGg6ZaehiRIUnFGRsWFPmspLq4istysiBtFCGI6JtSxGq2WkGYQluPgrLHuH/7Ef7LOfK/r8GsfCwgN7iQKImiWRV1xKbLWb4JorTtn3WxjROK2F1/A9B+WIiQ6GsveeAOlGSdAMwxYltNrtIHLPrlz2EjqMu9b+8MZrVkBQ7s+vR/n9Ya2iizDY7cjL+UQxicng9fr/xxrbWbRAk3TYFkWvF4HRZbl8szMT9fNeO6t09N61rJyj6IooCjqIkgrQvT6IHq9EL0+KIp6SRVVRFUjGY6VQfxuR1MKn2mGlnL374+9UDkeIY1jTzVHFQWyKOo4rUZpDg2IosJaVnbwzNf3zZoV2KZ74niiElAUBSLJ+GXmTKxbOP+ChomoKlRVRZchQ3DL00+D5XnkHz4MmuchiSJad+kSP3XRgg9tVRmPp65aODh1+bzBK5Kf7HdZXYLbkp8ODggNmUhkGRRNw11Xh4Hj7kJc90TIwsXlpjmOA8WyUCUJsiwLqqJY6svKso5u3bLs0WlvrqgG/hA7CW3dvkiWZR/D0NrLXRHVXNGcoIgIgeG4MjA0XHV1sJvMiOvRHeo5rDYhBAxNGyLbto8cB2DFuZ9dKq5bl2CKZdGc+C4FwBgamsfxXNfm+PeiICihcXF7zyx66v3Y2Gu1WkM3WRTBajQ4sWUrju/Yjtuffga6iDCoFxp/QiB5PAhv0xqtu3XDvmXL0HvECLTu0R2S1wuO1yTyWu1XiUOvBUXTaudrhziPDxj0RK9R9y27LIQdcu89AwJCQmIaq5GCo6ORdMstF0VWlmVA0wxcNluBz+1eV1dVma43BB63W2rLu48c37gb808m0EfqrFoqoJ6m2RhVVf9GvhKExrZyiIJYDIqC1+lE/pHDaNOr5zmrPAgh4HRaRLVvd2Ma8BsA+1kWXdQugNYGBFzXXPdKURRis1hsgZGRrD6AazJhKQqiPsRYd/o5WNsGtxbdvumGwCAoigJZELDz+yXoNmQIBo0bB8IxTXL/CCHg9Xrc9uILWDDtaXw9ZQrufedtdOjXDyzPQ26oKQFAa3TaoC6DBs6zVWT0d9sdq0JiYkpTfvohoiQzR5zx5Y/5pYDvXAmgP7kELw7sHKjR6cb/wdGmKFwMaXieh0pg9jidUzbOmT0wosNVL3QeMvb71n1vON595Pi6BqKe9cCf3PCw4HN77DT9d4vSUCAErKWwsJxIMnitDtbSUlwodqpIMqITEm5es2FZ+DnkKek1penDWI67sTmGgKIoyLIsZe/dJ/lcLr45oT+iEtZTY9Gcdg6k/9jbr9Lq9YNlQQTDsqjIyoa7vg53PPk0tGEhzXI8ZVFEl0GDMP377xHVvj0WTX8GH9x+B75/8SU4rFYwHAtC/BV9DEMHBkVGPhPaKmY3zdDpV4+/Z+fdbyZvzzTnLEpf82036gK+4ClWTPzwbU4fZOynXmKBB8fzELzessK01AmGiM7zx7+/2NocFbsZaWkeXqPNBfP3qyixHIv9y5c73HY7CYqMAFFUOMxmUAxzngC/DEOwMax1j8TvFk4Z3+vM99NXLx7MaDRLaZrWqM2wsAzDQHB7XBnbt+YwDFtK00yT49Qcz3Mel7f36a/3vWn4IF1goK7RILnr6nHr41MR3jYehGWavbiWBAGxiV0xdcE3eH75cgy9/36krFqF7196GQ5rDXi9HizHAZS/lllrMFAagyFUFxAQqDUYIgyR4fe26d1z1fI574Y1ibCqXepL00ycchEr9NMHVRJF24k9uyeNvvb2fRd7HJuputkFK1cCgs8XcGjNhgrR6y3jDAZEtG2LwtQ0sOz5EwmiT0BQZOSgu99+a4nLnPfw4VULhx76Zf5NDlPma92G3/BjQHBwhNzM1CzNMhDc7uzik5mHaJbNRTNmIJrjEN667UD8vlOBju/dp59f3JKC6HQjNrIV2rRPAGU0XPR4KZIElRBEJ3TAdQ9NxMipTyB7zx58NP5ubJ03HyUZGajOy0NZRgYO/boGKT8vR2VmFhRFgeh0IbRVbKcbx4wc3SQfVh8clMhpNExTt5KcPXzCwllTM+eq2/zF2BcLu9mcG5PQ4ZLDZjRDgxCCiysLJAAoqrDQkqkqylrQ7FPRCQnY+OWX6D7senA63XmjJqIgwGA09gCwqPt1Q1WKpmmtXg9VliBeTHE1RYPT8Ku/r0PlHFk+BkIeaOpXVUkCwzLjf3xx8qIf5s8v/GDTumheq+kri5Lf1XC6IDvd0LeLA81xlxQNAiF+4soybpk+HTEJHbFv2TJs/uor0DQNmmWhNxoRFheH3jeNgDEm+g9LQW1QUPcmETYwLDz+UqZhlmXhcTgtdWXli3CJEo4lmSfy2yUlCQzDaJrrQ1M0BY7jIQi+WldNvZOiaENIeHiEpCjNnuYYhlW20LSjPDtnQ1Bk5BMJV/VjBJcLRzdswOAJEy5YS9FITJbjaL/l9V30wyd6PfVajf5XADi+fUf+1WPHqCzH0U1xK2RZhiEoKKzHiBs+xuz5Mx0O15C2BoNe9Pn8GzPdHjAGHbjQoEsj6xmLMaKquOq2Mehz8yg4rFZIPh8IAENQEAzBwaAZxl/8f/o1ULTYJJdAHxwcdiknSHMszEVFea+Pv89zqRKOx7ftLPa5XHU0w1xE3SklVhXkf+Q2W/u8e/eYpIXTpo+oM1vmcRx3MfuaFEVRqMWvvHnCWlxcpA+PwpD77sW2hYtgrzahqedHCLmkTYuMhoe1tCxFF9WpFAC17duFBaqinmCacU2SIKDzgAEDX1v6+aDQqOir/hAQ5jhooiMA+jK7YYRAEgQQQhAUGYmI+HhExsdDH2SEqqqn3ju9CIpmSGGTCMswjBHqpcU9DWEh65dVu2ou9TJXrNlTKHq8J5tLWE6jgaum9pfYbtf+N6xj//JPUirqXlqz+9j+pYtmeRwO84V8zzOnYJvZwnSkKP7zEwWmY1u2rlS9Llx9553Q6vVY9f77YFgWV9rXpmkaPqdLTtu4YXlD3Sp5Z09mdm1F+XaKZZpl8SiaYpJGj34hPD5uoHSa68caA8AaA3Cp9/9C29oVWfb/LUgQ6+wgp62XaIqCJAgSFDq1aYTlWPaSsmiEIDIuruxyXF8a4KEoemuz9/QSgtqKil3AHyvfn37ji2qbxZJHN4uwgCIK9gJ/kF1et2jR3PLs7Ex9WARuf+UVZGzfjoPLV4DT8FeUsKxOC6/d8c03L81afvrrZZnZS3wuVz3TDNKqigqGZXiG43WnWzY20ACKvvKLXIqmAQJ4LTWQaush212nrDrDslAUtYQPZnKbmJqlyCWeDSwlZZ0TzyP3fSFMTvpdHkiVhP2ST5Cal6Il8Hm9f2JlKSBJgpDTvMQ9BY/T6UZDJu6rzKryjC3bXnWaq72drx2C+955Bxu/+AKFqWngdVdGcYfXamCrrCq31Nj+u+6Mh3DG/U/lOyzWxQzPo7n1w+RvSMhQFAWx3o5f3nob373xH6BxO0yjxgnLwmE151JUG2+TCCt6vPIlTW9EhQrcEAs0qbRpyYuT+6au/GaS7Cp/sK4k7f7fPnjlmvlpv5v47//zeqXbZrM0dxpP6Jd0tniRotXpjzdr0aWq8DldBae/NObVWWsrs3OeUwVRumrsbbjj1Vex+7vvkZeSApbnLusN5ngOos9Xn733wPNd+l3/JzdrK+Auzyl831VbW8RrNfhHg6JACRJSVq3CtsWLQLMsGI4Fo9edqvEmigJLQdHe5Au0MaB/n01V16UQVhYlhERH93lj6af9z1Z21/h7OZt+6WKvzJg77rVXNvQZNfIbRsN9FxITs2TE5Mmb7NWZX2Tv+7UVALy4amel1+HcQ3HNICxNwW619DxbRUnRsXSz4PE0qWjaL87rVbQGw8Yz3+t6/R1fV+flfUhkGX1G34IbHn0E2Xv3oeJkFprrc5+PrF6nW8pLSZk+cMLUFecSu+s3ZkJNRV7uM6JPcDfrwf6Lyap6BdSWlGHPiuUIj2+DWx5/AlxgACje74WyLAvB46koTkn9LaupbY+IqpZeynmpqgpeo9F3GzL0iw0fJQ84vVqJEGD+pHHt8g+u/2/7gf22G6Oin+A0fJSiqP7qKkEEy3FGY1TklDadE9dXH9vdbijA2syWzYogNr1yixBodIb4sw3b/pWr8iRRrGCacGNZjoXo8+UsSX71T3vtpyVAM63XdZ9X5uW/Lft8atu+fXDL9KcRGht7UaIdf3YDtJBlxVKafXLioyPuXdMwnZ5zaug65PZ1BUeOvKmqqtwcfxZ/YU0GcXlxbNcOmIqKMObxJxHTqjVUop6yZDTPQRbFtWNmfJyz4gJZ0VNM8NTmj9MFBCy/lMRBYx2Bs77eZi0tXe1zOA+3S+pVL0vqIJqmxxiCjPHqaVqqZ/2+QQ93vX3t7HsfnJR00wj1hon379EFGro2RR6I12ogCeImPjB+1NkeTkd15oeBkRHPni5Xfq5zcNXUPRUY1eUrnEfRxFaWMUFrDPhIE2CIkgXBr3BzCYkORsPDU1+fXpVX8lTHQSMPNMeOmXMOPhEUFfklr9OiWWIfjcbgSlTGURQUpxs+ay3mPjcdCUn9MPKe+6FIEgI6twdoyl/WSIiSu//AbT1H3be+yfWwJ3budPjcbkJfYphGFEXog4zB7ZP6Ppx47eCvdAbjT4FhYdP0gYHxoiDiQgXVkscLrU5766hHHrx1zAszakqOH9/XnPCNJAj8OYpMVYe59mvB4bLw51mo8AYDnGbr4Yr8nO8vJL8T3KbnD/kph2+qKS3dRBSi8jot6GYkXygKDfXBeqiqUucwm95aM3/uqI6DRh452/aa89mxqC7XzK8uLH5YkdUqXqdr2qxEUVAFEUSSmixy3MxpF3KtDYXHjkETGIAb750AxSeAjwgDGu4px/OQfGLqwdWr9zWrgPvo1k1Fgs9noi+DL6TIin+qF6WGomq/YEKT9y5peMR1T7wOAHJS9n0tuDxNi6HSNCRBKD/X2y/1vtZacOTI67IsO3m93p++pWkwDA1ew4PX6+C21R8+vHbdE10Hj3U2pZ9Aj5H3HH+1X/8XNsz5bIbNbNmoSLKL12rBa7XgOO7Ub9A0DZppKGBv+C2GYeF1uSze+vpPrcXFg4JieyXf95/PzACkGTNmNNdcy+36Df82bd3aOx0W626W8//O+YhLUYDsdMOVWwLBXPOnBcclBpAh1TugegU47fUY8eDD4DkN2BAjuBAj0LhjggKq8nI2Tpm/okm7pf9wdlXZ+3+OSUgYf6UFz5qyHVmSpG3vzn5g1IwZuxVfbcGLGmPgrPOdF0VRYDkWWXv2TOs+4t4vzvaZRlnyvL3rb4zp2P5piqaG0BynpwBBcLvLiEq+Kyksmt/n+tttzVULb+yacmL7yl4RraJGB4SFX01RVFeKYUJURTGCgCJQFY1Ob6JAyn1ub4bdatlzdP2Gg2NemVV2GYePSh46VPPgh69Oio5v+7guMLAbxTJQJQmKcnaZULHWBqHaAlrDQ9c6Boxed8mhL0IIPPmlUHwCwDLgeB6KIkMbGw020AAQApZlIYli1cmD+/v1G/VAdbMJW350+83RnTutJapK/53V/rxGA7fdfjAgsstgAKr55M4AQ0T0KkNE+I2S2/OnQacoCpxBD0tB4fZvX3j9wZd/21bVlGv/9a3pnQJbxcaLTq9z3deflX6ZW1t1ua5hKMC+/81HRr5teEDRjgOdZUkMYDU667h33svc9eYnzutnzLiiQl2dgcBnJt4WNnLa1Otiu3S5SZWV61mOjWJ4zakwZIO2EWRZgSJKEExWSPV2cKHB0ESH+8soL4YHNA3RWgdvWRUomvb7qQ3hq4BO7UDrtAAh/nZHbt8HmqD4ly9KH/a1m5Jinp/3zfbQmJiujYsvmmVAVPKXBpt5nQ6V2dmbJ/W8bvwmwAEAB9Z+G9u2Q8K3UW3bDqd5Dmhc4DA0ZJ9ALCUlG1e89fbLzyzfehIt+FPgI3fb2ihdmO4qSRKvj2zTNsRVX9dNFiUNw3GasNjYBF6rgSjJUFweCGYriKRA2zoarKH5e/mIqsKdVwLVJ/zuYlAUuOBA6OJj/fULNA1VVTxZe/eP6HPL/QeaqvD9B8dw/+Y0591ZmfODIiM/pii/6tfJ7TvRoV8SdEbjZQnbNDVjxWn4dW0aNJ8atk1UTgjFnY/PmfNI+z59bgxtFRvEaTVua3FRTfHR41vmPTF1zXd22Fq4eXb/tvPwWysBVAL4FQDuA0I8AN22Szj/1u69AyVRmGUIDumg0DQYgw6y3QXRXAtJ44QmMuycW77PFguX7e4/kpUQUAwNPiz4j3oUbs+qX2e8eYI0YysmdaZSYduuUfyL33//iyE05EZVVpC2dh2Obd6MB2bNBG8wXLRQbnN2LIg+X5GG4vtTQXG1ZxuSHkDQZ8nJ3sBWrZR+U6ZIl6ErNbOiibsiGvxVuuFhF0hyMlX+6KMaX0lKQKsu3VlWwwfUl1tCJJ8rJKZLFyiqYjDlFXTgNHzdkQ3rNo59efZ53Y6n20VGRbePDio8klGz0AHnaYqCVxTbPnontufYEU8FhoRO0xoDDbIgQpFkyHYniKL4ydakyAPgKzdBrKn//fMqARscCH371n7yUhQIUcnh39bcP+T+Z368aMn4Bs0Pkr7ph/6d+l21WWcwBKsNUuR2iwXX3j8BsV27+svCroCLQNE0aIYhisd7nyYs4ae/yvw80SYoJC6hXcwzy38OLDhy2NZr1AN5xD+wf5qmkpM6hd/13tuvhLWOvdoQEgKNXq+jaSpAlpQQhqVZAmiJSnQcy1AUTYOmGYChAYaBy2JduXFP8t3jx68468NxZMU317Xvf9UciqiRFE2bJUl0GsPC8ymGKs9PORLUqnPHI+XHT7Ki4CtY/vGHGbMP5Dov1xgkAVwagOX/nTZ+8N3jHw2Njb1Oo9dRkig1/V5TFBS3F+78kj8lDwwJ8WCMBkAl4LValGdl5X807u7xc/Ktxy65x8EYIPCD3avvTujf/wsK0KiqiuXJbyJ1/XqMeOwxDLnvPuhDQ/yy5rJ8WRpUUBQFTqtBbUXFvPB2/R7/K+fLiUPjte98tnh1q85dbpIFoVK0eUYGxnfLPNtnC/evu6V9v77rQDN+6XpC/OVzRG34JzmV3qUpym8CKAC8FrUlxeXv3jF+2CfphQVnO3ZNydGNYfFtRxKf1189RVEA1dAPlhBAUaEoMlSVSB67fe2yt99++ol5K6qa0eGFSgLYNP8M8YcMUXJyMp2VNYNasQIKAE358V3DQmKi3zAYA68BqKbtkqAp+MpNECy1f4jrcsFG6OJb/V6zTNFq2fFjE94bdOv6RYDzkrW1fgOcXYbevrAiM/s9QojIMAzu/M9ruHHSJGz66mssmDYNOxYuRPnJk1BkGZxGA06rBcNxF5VPZ1kWLMehrqLyy/dGj3m3OQmieaNH64mnso0pc88NxYc3jyo+uLEtmlkx9vhzrwdFtG3flyIqxRsD4zyC895zfTa6U1eLJEoyaMovvEsBKiFQFBWKokAlBLIsS6IgWkVJzPM4nZmC15fiNJs25B448NIeuvCsKfDkQYltaIrq3ijyS1SCU4JvhPiFmwHQNANOq+F0RuMdfUbeEn0+siYPHcoCoJNHJ+lPbFz2gLXw8KLtFRnbnKasVU5z1tvlx3Zc3Wi0ZsyYoTaQFQCE1r2u27js1TdvL83MniZJUjqv1aApRfBEVv5gB9mgQGjjok65B5xWA9nn3dph4Oifm0vWC+rDtu03/J2snavEtj17vKUzGrlR055Cl8GDsWfJEmya+xXcNhv633YbYjt1QkBoKCLatoUxMgLGiIgmEZeiKHA6LQS321FdUPBBu6QRTSJr+urFwT7JNzYkOvqumI6dOkiKHB3Suk1wqN+a1VRl7d1nKy2ZmtjE2J6Go1VVlhTCsaAUBaLPl3Cuzz4U0eHo+/vXPRgSE30Vp9ObvW6XJX/fgZjeN498WhcQEEWxLLwu54rqMsuzugiNa/4zs2SsWCHPuEDWrNtNN+o0BoNBVVWwHIfC9PRcR431aMJV/R0Mw0SwPB9ks1gSOV7DGoIC5arC4qNHVv1acr5j2mzHAj6+64ZbHvr4o4eM4WHDGZ5vaGhCATR1M6fTv1BxYvfqDXM+eXPygl//1DvrsYU/mbHwpy++efrRFbc/88Q9gaGhT/IGfUciK2dPBBGAjwiF4vFCFSQwBi200eGgWPZUZEDyCUr69i3fDbq7E7kibY9GAKFv//zV8L633Pw8q9H2B0VB9vlgLipC1u49MBUWwlJaCtHjQdvevRDbsROSxtwKXqc7p6vQqK0vi5Lqddg3FaeffLvXzfekXGBhFPTcinldOvTuM1YfZLxLo9clsBot0GDVQFFQZRkURYHR61FfUbFl1sPPj5+1bdsFMygzx17bddLHH+8MjYmJolgGPpf7J11Ih3ubM5A+e1GaRqPtC4aB5PEt5IPiJzXn+5XHd/cNbxd/gKZpDcOyOLpx47P9bn/0G/jbQVHzJiexVblSZ51WQzoPHuI4sPQ72wc5Na7zFcYsX57MD7/mjnUhcbE3Si63P+vGNvSII/4t6YxWC4fZstPIR42lwsMdZ+EgNR7gVgDi0eULIzpeN/Bemmae1RuNbYlyFuJSFIgkQZVkMFqNfxZqICur18Fbb/t0VljH52dcXNeZpmPz3ORIuznzRZcl20wkEyGqlRDF4u9fai8mgqPE38/UW0mEs7SJlFxlhAhVhMhm4rMX+2wVGTsK9q+9Z0JoaJPkNY9tWDLNZy/yEtlMVG8lkd3lRBVNRPZUkPry46QkbStxmXOI6ColorOUSM4Skr9nzcgmRQkSwbssOQeJUE2IUE2cpqz95+k1+ydMG5mgcVpz0omvihDJRHz2kp+bO751lcdvUzwVRHKVEtFRKteUHx9wqfesOnPvONVXSURnKVG9lcRTW1BkLjjycnnGrqcrM/cekt3lRPVWEEJqicOUObapx90w86U4a8GRl4T6ojwi+sessUt3Y2tSwd+319/SXjYT0V5EqjL3Ll6SPM2IK41x48Yx4+KgA4Ct82a2KU/f8bKnrnCHp67ARXxVhCj+psVEMhEiVvv/SCZCJDPxE6yCCM5Su9OUnVadvf+j4mO7+jSWH16oYLcRLnPWUqJaTw1KfflxkrJ8Hpn/2F3kP1d3ItMSwsj8SXeeGjAimYngKGmSlUsANOaCQ7uIaCKqt5JYCg9bPr1jeMcmp2YTE3mXNfcgEaoIEU3EU5e/vrlN+woObXiPiCYiucuJpzbfuWvRpx0v8bYx5cd3riKymcjuciI6SyuqM/d2a3xzcgiCnJb853z2Yput/HjJjm8+GNTcH9izcE6Ew3Rysseal+KzFQlErCZENv/hvnusuTaXKeuXlOXz7+oPGC+rGNy5sGLFCgWAFwBunPJKGYBZAGbtmPfe1cGtYgZ3GTTUIPm8nbQGvZYAgQCI5Hb7HPV1Cs/rTgTHRB9WFSrv5WF3muZmZbn+pJfahMVhTVV1jSEsDFRD251vn3sOeQcPgWJoMCwLVVVRmZsL2ecDp9cDICg6erTNubrL/CGzBnAua60aGR8PQgiM4RGe26Y9aX1m1bamWTJdFgEosfGn6qvNsQ1j26QY6uQY6GPaJXCgKRBVBc1ybO+bhn1kK8/IVWS12llrMtdVVAqh0XFpbQfcVH5mE42zYSCgZ3g+BqoKhuMgupzHY7oNyWocj/n1sM+P7PjxshcnHXF6nObJX/7c7P6vjz863Z4FzH9xYOdlt02e2i+uR9duDK9pJ4tiYFir2MKi9HRH1p79R++bOTcdl9Cu87I1Rx425bVDAA79Famv3D17zXGdOoE0pG6Do2P8GgQaf25c8HrRZfBgaI1GKJIEWRCV6pzciqGAZvcZColnIgtwiaJY6dfTIqAoKqDtdQOaHGngSnQRDrMp0mD09xMJa9XK0pyAv8UFXb3ZNEAfbPQ3BKEpbVBE5K2gqVtBCEKiIxDXtRsUVamrzT80Iazj1ZsudMwDgFuj0+WAZgYoggCaovstmnbfmEc+/3HN6Z+7d/aCvRd7Uxp7xs4+kOucfWD6TgA7rzQR/n4BqyYStjwnL8XrcrkZmgYoCh369fOrujSUL/YecSNGPjkVqqKA5TjYrNasn154ddWFyHpa8XchQKD6tyQb936/vMmSlvZar53heQcofxzWbauPfTYxLrSp3+/QLorRBgSENJbcsSzr301KGlY9NA2GZcAHhIUaIiKubuJhVVdt3SrZ5/PvBtHpIm995pnZ+1fM7fNvzjH/WwiL8qzcE4os59EsA1VR0KZHd+iDgtC+bxLue/ttPPzJJwgIDfXve1cUaPX6kDkVhS+mr/v2+gtd51CAddfXO4nsV4dhGIZrlZDQ5IDyUsDDaTT1/jwhIElSMMcQfVO/f/V9Dwm6wEAtUYlf7qnedrgw7egvgte7yF5bs7G2ujpD8InHrQVZKatnzj7Y1OO+e/s9qTXl5ds4vR6SKCK8deuO/UeNXlN4cMPUS2yM3QI0qXVo1hwim4ngLCWe2nxSfnwn8dmLCRFNRGyITDT+LXvKCVEsxFNX4KvKOvDs+UibDNDb5r33lNiwslU9FcRecWJ0c85NdJYsJpKJEF8l8dqKjqfOm9fkKANxVkf67MUW2V1OiGQmNUWpT5/+fiLA70xOZi+k6n022afvnpvUyVaRsY8oloZoQQWR3eWkMnPv8nmTx7VpYdUVRNWJvQ8SoeoUMWVPhT+E1RDiagytiM5SogrVRHCUEMVTQQRnqVSatmXMSEBz7jhqYSefo9gjucoIEU1EsJdObM65CfaSr4lkJsQf1sskhDSZsD5HcVefvdgnu8qI6q0gx9YvffxyRXcSAM2cB8b0qczcu7Yx7Cg6SwlRLESwF/+yb8GCwH8TB9h/08kqknhc8Pp8DMtqVVWFqiigGQa1FRXIPXAAxzZvgdflAk3T6DNyJK6dcB9kWQav07GGkLBnWeCcy/6y7FxPXMeOAqtldaApKLIY0bwUDPH526UQQFU0JSUlTFMXXoVH0tp16n+VhgAQBZFk7twZ3Nia/VLGqyG6o0xf8lt6XVnBvXe+8vq0Nr16PB8UFh4muj3gAwx3Jo7oVwDgVVzm5hn/731YANi15tdiSRBLG/dJuW02LHp6Oj4afzd++m8ycg8eRPnJkyg5fhyr3nsPmXv2+JsGyxICQkPaLjy585zXu/6jOQavy6U27oGyW62dmrcspDyNIp1elydw76w3mhxzNBUV9GpMZRNACoqONC576YnOGet+CHk2Lk73aJwx9FLHbsbuLFfPUfd9sGfJshH2mppMjuegCgK0AQFTyo+nxLYsuq4AfprxeaCpoMBCsQxIQzuf8swsuG02cFotWJ4Hw3FgeR6EELjq6hpqLwGKpunIbt3PudCoqSnzgYKtUf+J5fmwZviMlKumxtAo+KQLNHgfSJ7tbup1BYSGsTTDQFVV0DTN3TDpsWdve+X53QnX9E9588imPe/v2vqzt7bgXdFR/HjJkc13pWxYct6HIR7Q4uyZOmXqy+9lH16z5lNZkmVVVaHT64JDYoJ7tBD2CmA9UCXL4paGlkTQBwUhrlvin2oWBI8Hbfv0Rp+RIyGJImiWgcfhME9p1fOcRdrv7swuNQSF5FE0BRACbUBAs6Soq0uKeDA8KJ0Obptd+ei5e5osuKU3BqcrkgReqwHDMhTP81qtThuhM+g7GUND+0W0iR+uDQp8jdPpv4rv03tF70GDPz6XGgwAzP34PwNrCo9skj0Vy1N/WXQTTvPdKwBvWHzrY6qqyIC/fFElsgEtPuyVicfGde+xWvAKrzOMv0ikXZ/eOLZli7+lvSxDlWV07H8V7n7zTegCA/1NNAhgt5iXzq+uPu92YMHtqtQY/ds4OJ2mrBm9GUj+/oNz23bvEUqxbHRVft5Ha5ftbvJ2HaGobnNdfNWzgeHhEyVBaM9qNDzNMBoNz1NgmN9zdUQFWA0knzDk8ycf0MNfGPMnaz9o/N33BMXGD4MioNsNQ2+qOLHnyxO7tv+yc9GP3n5jbgpMvGbQ87xGo5UlGaLPRyrz8mvQgiuDnV8kB7hq8vJUXyVRvJWk+Mhm8lS7YPJ0QhiZNXoQ2fP9p8RTm+8vwnGUEKJYidOUtfydYb0u6KdZsvZ0cpqyN7pqcn/N3bWq60WcHvVIGC561b1hzhzNlw/efP3OeTMHi7aCfg5T5tjy47teqzy55yt71YmlDlPWdqc5e9feJZ9NOZexGQcwZcd3vUQkE1E8/hAWEauJuzbfbi04Uu2y5NSrjWMjm0lNUeqJmeOGB7Uw6wqituToaiL5Y68uay7Z9vV7JHfvGuKtK/DHZF1lRPFUECKZSX3Z8d8IqdT/29yfi0UyQD/es31k/r61bwv2EguRLUTxVhDFU0FUXyWRPeX+yjnZTAR7UW1ByvphLYy6wnBb854gkun3mKtoIoqvikiuMqJ6K/0ljLbCqtrio8+/O6x7FP7qBl/NfziuxMPEm3IPt7cWpn7mtuZWic7SU5V0orNUkJ1lm23VJ/s37kr+t9z7f2V67sSWX25KHDxgU2PvAIZhQHEsFEGEz+MpzE85dLwiL++tW59/5/jl+L1xcdBNfuplvjQzu31QZDQf3TrWyOsDQzp16ymeOJIyKDgsVGnVLsGhqkpgVXFRL4ZhNBFxcRaGYSgQiiKE0PDrnqGh1pwQADRFi/U1NVpHbY02tkOH44LHI5fl5oTpAwJKjWERJYU5mVxEq9YnTh5KkTokda+YM+llYYU/ttusmOne7z5tM+COO9vbzKbOxvBQl6O2Nu+uDv3Tdzeh6quFsJfhnN8antT9kU8/+Sy6ffv+gtfLSD6fiWG47dayki05ubkbb35gurM5NzUR4N+c9nBQTMd2rdw2R7ewVq3CaIrqEhQRpdHq9DFEVaIYjgtQJDmSoqDnNBpQoDQsy57SzaIaRpOQBgHfxp//41+/D/hp/1AJOfVfAgK1QbhElCSVAvHKsuxjWLZGEuU6m9XsNYaEnbRUlosuu73IWVuXZyotrS3Kzy2feSTH1pwmfv9G/DsLICgK8/r25R7cvjr+0C8/RRTvPVL88HcrTBf62o2AYfTtQ0O69x8S1qV//6iKgvwxQWHhrQyBxlCaodrQDBNGUbSB5zjmdPG5RktOGql3ipSNu0D9L9M0dWpI/SQk55NN/cNdoCn61M04vZVR429SDR9s0DcBAfGL7QmiTyWqTfR63QpRitx2e667vv6YIImZFbkZpa/PX11f2sSKtRbC/s14sXNYq+seeKSVTmfoFRoR2SMgKKibVq+PpxkmiuW4QC2voRqtGlHJKaL4GwpToBvIoTYQVpZlSJIICrRHUWWfJAgegzGotN5qCfR5PEJkbFyWx+1SLGXlISCqENm6dY4xJLSWECigiArQhGFpVmVYnoiSD6pKURSYqtLiDj6vNyq+Y2czzbB6l90W47Lb2odFR7sln9Bao9fzqqoaWZblGhURT1clbHyUaIqCqhKIoghZlgVZkmpcDlspCHWwsqg4q9ZSlrLiy8WuFT6UtRD2H4Dnr2kfec2QYX3adenZUaPV3KDVGbrrjcZojuMCeJ73T9mnEZOmKP90TgGqSiDJEiRREhVZdgDELPh8VlmSKuy1NU6v01FFM2x5rclUz3KsGapkOnnoEGk/+eXK9ePHB24CJPPZ46IXhZ6A4fahQ4UAgxg74t57lNy09E7hsa11QeHhoYqsdKIIEoyhYaFag74VRdFRvEYTQNG0VqvRUMyfdiwTCIIIn8db63Y5cymK3mouLT6Run1H/jNrd2S0EPYvxNz7b4/scVXS1dGt2wzjtbobeK02QaPV6FiWhaqSU93IG8kJ+EWXRUF0EaKaFEWuEAWhqKqoqF6RpczqshKnTq9LLUlJsT27+7jzH+4Taqb1T9Akdu0WGhMX28ZgDGkdEhbVKjwuJpYmVAeaodsTIJ7XaHUaDU9zLOffYqQq8Hp98LrdZp/XvbM4M3NXztGM9dNXb6poIeyViDUOTYwe+/CTPXUBARMMRuMgXqNpo9NqOL84itogakiDpilIkgxREHySKFYpqpJRb7GUe9yudGtRUZbZ6SycMn9ZHa70luO/CXNG9jcGt2nfqU3XxDhjcEg3rUY7JCA4uBOv0cZodVqtRqMBTVNwuz1wOR2ldSbz/orC3NWrFizevdjksrYQ9tLA/vrK1KTWnTqPC42MGmkwBnXUabW8oiiNRSOgaRqiJMHn8boErzvHXlub6/N49ope99EjB7aVvrj6oOX/eQibSr4qMWrkQw9F8jp9P5alrw+JiOzB67RdjIGBGoZhYHc41VpTdbG1onJRjcU0746ZX9a2ELYZSAT4T999aXTbxO4PBgQGDwsIDAhUCYGqKqBpBhQAn8+nCoKvst5iSbNWV+02FRYe2TjvxxM/NGjLtuDcmH1jT0N896uGdOjRvV9waESSxhDQR2/Qx/McB5fLlWeprl6RumX7vEe+/bm8hbDnwWhA//Kcd0dHtYp70hgRNlCv07OKqoACBYZh4PF44LLbCr0u93prdeXWwuLco5O+/Mn0vzq9/1VYPHFcdO/h1/VkaXZ0YFDwUF6nTagoLZnW/5Hpi1oIe3bQG2a8cFu7xG7PhUVFX6PVahhVVUFTNHyCoPo87mKfx7Ot8OTJHft+Xnnw3czC8v/vJEtOStLH94uPLZ23qvBySgC92Kd1q54Dro2lQQomfPVjfQthz8CqFyZ3SBxwzRshEZF363V6LSH+Vb7H7a63Wa0Hiap8s2PtisPTftpW1WILf0dJ2vYHgqIiphWaDg7q12+KhJZM15VHzvJFw0Ijo740BBi6ABS8Hg9cTkdOjdn8U2l+1so73/86H2domv7dWD4OTJcpP4avfHte7Yzdu/+2vLzoKPnW5/Z2MsZ0HXyGS0TDv/NAREPSbMGLjwQaZYob/8nCupZH/SLx7IABurLNq45Lx/eTym2/2nJWfPvbro+S73v16nZR/+TzLj64eZTkKjMdWvH1DX/bQ5P8bKi3vrCs7NiOj880QIVHt15lLUrbc2zDj338D9g4xl6d+Y254NC7/1au/CN2HFQ4HEp1Yf7ntVUVIYe3bk6f8uP67U0sXuE2zEnuGNm+XecOg4fuDAlpd6rKf/FT93aJ79M3aPejLx65UtKOtprqWmSSQ+kbt0gAkDpvHpc4dmj/yvycsM0//rDjqbkrXOcoJVQbtn+BAsg4gHnyu086HfjpRyV14xGB10HK98Ka5k9anPfcjeEhI4lKWhWlph48c8xcZkuvyFaxPWRJ0ADAwBcmd9AaDHeAYe5vMZN/MQ4sndfDWpS63GcrMsmeCou3vnDfurmvhADAF+OGBljyD2+vyty77DLXmuoarRghhJ43Okk/GAh5tJ0haubopDZuS/Z3Pnuxy1WTV1masbf9nyxy6uaH8vevfR4AqvIODBXsJSuJ+WTAhjnvRjiqs/JObP7xpYqTezaUHN22aUr7wI7mwsNPeury5xJSF3SuSMqxjUu/dZizzc/0at3tvRuu6vRECFpPBLTjIhAAgH8lqe2I5a89cUtN0ZEvvPWFvwqOUtltyVlcU5L2+qwxA1u1MOkvgK3s2EivrchaV348uzzz4M1ea/b1juqsvOX/eaodAJhyDkzy1BU4Dy+fN3TcuKarpTRIrP8Jmz58tcvJLctmHf5l/jdFhzZ9Mbl9SNDqT6YH11ec2FJ8aONDAJiMzcs+cZmz6/d//9nYnfNnDjhDSINanJysddfk5Qv2kncTAd5WcWKPz15USAjhqtP3dhMcJfUua16K5Cyrdpqzrem/ffep6Cqv89mKpJrCI/3Pdl4TQmGsLU477Kg6uc6UmzLXZy+uLD22Y+erAxKGrnnvlYSa4tSvN36S3PaXGU/fWXRoQ5riKiX1lScOKe7yhTWFqe9PitQN+H76xLGE1N9QlXc0ooVZVwBFhzbe5K0v9JYf3/nTcz27dAKADXOmaUpSN8YAoB/pHBZoLjh01GXOfREX0NO6ETAAQMnujTEpS+YY79Gh1aZP37jz6Npv75o8eTIHALX5h7oJzpL88qNbiWQvIu7avO3JiYl8yvJ5t/jsxZKl6OjQ2TfeaHCYstNL0rZuvg1oe+YW62SAXfXW8+O9dQW+tDWLR7osOaOIbCXV2QdWAwiszjnwKZHMqqc231KVvf8FwVFidpizTAWHNi5wmrMsn90/euy2rz6KNeWmTF6ePDUAp0oU64J8tqJyRaiuLDmymaz871NEqC8kWz9/676awtRXPXX5tuMblsQB4HZ+M/MptzWH/Prei2Mavq7Zt+Sz99zW3HqnKZO4rLm/tLDrMsPpLIwSHCWl9sqTX51Ndqhxq8fn99w05slWfKd5kydz52oOnLV71Yja4vQFpvxD10jeipKyjF3ff//cw0+4a/JFn724gtQXB88cnhQkOEo252xfQd4YlEjc5mxSU3T0DQCoKzn6tbs2L39iPLR5e9aMFp2l1b76gmqnJXdf7u5Vf7KIVSf3TnaasmrnPXLHnT57caoiWp0ZW376IHvvmsmSu4wQyUxqi48857TkjCfEQerKjq1IW7Nwcn1FhvXb6Q+Oclmy94nO0nk7dyafmgUK9m+4QfJUKPVlx8grSe3I+zcPIJ66AnX5f5+cZqs8edxWkTEfAIr2/drZW19UXluSnvdin9atkofGa93W7CTJXW7f8NF/yNFf5hPZW7nh35D5/FdtzOMI/ShU1bN//ryXN501xJXJHdv8feQtzz176ztH0pbEdQp/pZHE0xIS/kDw1l0Tu7EsfZdWq/tC8vo0WoN+6HUPPDjdWVNTLfq83PZfftQMn/rkWCjKiFWzP8TQ+ydAHxmFvMMp1Q5L5pCg2LhHiKKmt0no18MYFfldWUbG3IXPvDjJ63TGRLRrn3zm2OqMgQrNsfpbnn3mC9HjsdaVl+xv1bnLQzEdOryhykq51+kwLX39jeWK6AsV3fV1WoPhuYQBA09qDQHGca//51tLSalx/8a1z19//e89amkNM5DleHr522/DbXfgnv/+F1DIYZ/TY+d12vYOU83KnN3L28V067lUawyK0wYYfpudXl7lsCp6SVReZXne2O+WW9Dp2muLTu7ZPWMsEHp8/dIn09cuj20xj5cBgqNkk60y4/vzRTgkd9m7zsoMcnLjUlJXml72zVMP3FFblLYgc9uKP6yMHdWZH8qucmLOPViSvWvVx7KvWnBb87KOr//htZrSo3Wzbx0y0WcrOmjJ3k8WPXEPcVRnOlyWnLqiw5vX2qtOFtpN2aWio+SYy5SzvzR92+6xGnT44sHbptSXH6stPrzp6zNVY9a++3x3a/6hXfXlGWtKUjfGpP264NqSo9tXr5v93wdObFn2deWJPS/5ZwlbaKO0+w+vPBFiK8+YUp2X8mjy4C6dzrSAPkfJIuKtIDvnvksq07cTyVNhOvLLNzeXZ2zr6bMV+0zZB2d56vJzXdbcXzx1BVmHVsxf/lCE5qb8A+vXEVJHbGXHthJSd+uCqffFPwCE1ZQc/cpedbIiZfn8di1suwzw1he+5a4rFAtTNiyuzDp4Y0nK5nYj/br5FADm8OpFA4loclRm7CKLn5pAvLYiyVtfWGXJP7Ry9SfJbf8gQV+Y+gMhdlKavu0/2TtWvkaIk9RXZLybtnrxA+6afKHy5N5cb11BmcOURVzmbMWce2hafUXGc5JQnZ2yfN7cbybfNclnK9xpLUpdtO6D125zWnIOuGrynPbqk5sXTL0jHueQhr8FCFk+blwjmen+gPF2IPJsvcXGnUcqaSjAOkyZa+tL03f76go21RSn/bx/2ZcDhwIsIYTz2Yq+UURTTknati9fvbp7lOSt/Kmu9Ji7rjQ9u748I7e+7HiKy5qzO3/vmm7FhzY/5DBlp/scJcfKT2zvNRpoMzEIwS0aspeIDXOSjYUpGz61V50s9tmL7T5bodtSeOTExs/enAKA9VjzXqovSSNHVi0kNUWpRHJXeC05B+8+09oNAHSm3IP7BEepN2/7qg7FRzY/67LmifuXfHrVtq/eiXVZcn6oLT76y5cTx9ySteOX5/L2//Zw3pw5GkIInTpv8p80q6oL9kd66wpny57yB0henuavybKNY/Yt+KTzF/fdHH+uz5DU1FPnWnxoc2+freibutKjH3z56J09lz770H01xaklgrPE6qnNr7QUps4tTt8ZDAAlqZvfqcrat+/lQYkt+rGXA29f3yc+a+uyTrVFqeOcpuxdorO0ourongi3NWde5qYfycQgkPWzXyWCoyT/i6njAs62OBOdpRvsVSf3TE5K4gghxuydK/pNSwg1EkIafU96DBAYAQTAb7Woc28o/Ov39VMUdcllm68P6tqt9MS+DsuTn25zWmSDspefmG6vOPHjzOEtijCXHTvmz7zJU1sgec0nE2qKjibbilPJVw+NIe7qkyRv32+fn0PFj6qvONZnxYzpo5rTj6sFLbhU8Ln7fvtZdJWfOLlzecCBpfN62CtP5CtCdY2t6sTiuU/cF/L/fedwC/4hiAN0qb8ufNJdk6/6HMVjfy8GmRpdU348rnHB8m+S4WnB/y6Y4qPbnvc5SsS8vb8tHgGE/tNPeDSgX5/83NiCVUumpy6cM/75nj0NLbfxfxQjAY0pZ/8b1Zl7x+35bs4Drpq8XwVXuc2UcyA5EeAn+hWn/1ZMBrjJSUnc2RZiq1+b2rt43bJN1n2bJHfaHlJ7cKtyaN6H/2m5s/+jGAfoTLkHNoiOErfbkmOuLT22aue8D4YnAfp/wvltnvnaqIrNqw6adqw9enDurNlT4oPaNr63/q2Xe5RtXpnnTd9HKrasJse+/YI4j+wieSu/P345ehf8f8O/QoF7BeAdu3jJhO6DBnaXKaosafT9pf+Uc5uWEGqM79Dpv+GRkQMUQtC9X/8+D73yn67znnhp7Ee3DIvq3LPn9xFR0R2LC/Lw0ycfolV8W3Ts0QsMw+iD9CrdQsH/Ucn4CTO/qge+2vtPO69e1w5tYwwN7VxjsWDbyp8x7Pa70LlX35v3ff7OJAp0p5i41r2rqyqx7KMPYC4rwbA7xoFmaMiqXPZxnqu2hYL/2z0O/nGgJBJMiBog+LxI3bYFLpsND7zwChXbtsNMluNVSZGx4dsFsJaXIbJ1GyT06g1REGCtqtr+b+mNhZZqrf8dBAaH5AJUVVBYGKLaxCM79RAKMk8gNCo6yBgaGpJ/MgO5R9PAcBwG3jwawcGhsNXVlmccPbqyZfRaCPuXY9bni921pupivSEAbTp2guD1ImP/XhAAsiTh4Pq1EH0+xHXshH7X3wiiKqguLvx16qIVRS2j10LYvxxpgIdh6KWKLKPHNYOg0elQeCIDPrcboiDAVFYCmqZxzYhRMBgMqK+vKz+RlvYZmtjWswUtPuxlR0Fqxo6Q8Mia9t16hHfsnYTc1MM4tG0zOJ6HraYGHXv3QfcBA+Hzeom5pPSTxxauKGgZtRYL+7fhto++KK+1mLdoeB6Dbh4NjuexddlSrP9uETR6PYbffR/0ej3qzKZDP8//5LeWEWsh7N8NOT8t7Su7zV7fqWdvdBswEKqigCgKug+4Bm07d4XTbhezj6V9+mFaeYvv2kLYvx93fDx/n7WqYgXPsrh2zO0wGIOgCwzEoFG3ggZQkJGx7rm35vyKllDWJYFpGYLLhy6ytzK2U8dRsfHtgniDHiHRMbjqumFw2u3l+zese+S7jBxTyyihpSnHPwk7P/zvvT0GDFxEUbRWFAXodXpSXlyU3P3ex95uGZ0Wl+Afh+tfeGtZcXbWEp5jodcbUFdTU711yZIWkYoWwv5z8dOiL16vrihfr9frYK4oM3+zYU95y6i0+LD/WBysqHff1C5mo6W2RijLzV309aFjOS2jcpmQnPjn/fAtaME/Ff8HCO8Hv1HLYYoAAAAASUVORK5CYII=';
var BOTAO_B64 = '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';

function montarPlanilha() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetLocale('pt_BR');
  ss.setSpreadsheetTimeZone('America/Fortaleza');

  var ordem = [ABA.fluxo, ABA.vendas, ABA.custos, ABA.markup, ABA.indicadores, ABA.swot, ABA.banco];
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
  montarSwot(ss.getSheetByName(ABA.swot));

  atualizarDados();
  ss.getSheetByName(ABA.banco).hideSheet();
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

function faixaTitulo(sh, intervalo, texto, botao) {
  sh.setRowHeight(1, 64);
  sh.getRange(1, 1, 1, sh.getMaxColumns()).setBackground(COR.amargo);
  sh.getRange(intervalo).merge().setValue(texto).setFontFamily(FONTE).setFontSize(20)
    .setFontWeight('bold').setFontColor(COR.creme).setHorizontalAlignment('center');
  sh.setRowHeight(2, 14);
  var logo = sh.insertImage(Utilities.newBlob(Utilities.base64Decode(LOGO_B64), 'image/png', 'logo.png'), 2, 1, 6, 4);
  logo.setHeight(56).setWidth(80);
  if (botao) {
    var col = sh.getRange(intervalo).getLastColumn();
    var b = sh.insertImage(Utilities.newBlob(Utilities.base64Decode(BOTAO_B64), 'image/png', 'botao.png'), col, 1, 0, 14);
    b.setWidth(150).setHeight(37);
    b.setAnchorCellXOffset(Math.max(sh.getColumnWidth(col) - 160, 0));
    b.assignScript('atualizarDados');
  }
}

function secao(sh, a1, texto) {
  sh.getRange(a1).merge().setValue(texto).setBackground(COR.rosa).setFontColor(COR.creme)
    .setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
}

function cabecalho(r) {
  r.setBackground(COR.leite).setFontColor(COR.creme).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBorder(true, true, true, true, true, true, COR.amargo, SpreadsheetApp.BorderStyle.SOLID);
}

function corpo(r) {
  estiloCorpo(r);
  r.setBackground(COR.branco);
}

function cartao(sh, rotulo, valor, formula, formato) {
  sh.getRange(rotulo).merge().setValue(valor).setBackground(COR.leite).setFontColor(COR.creme)
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
  var v = sh.getRange(formula.a1).merge();
  v.setFormula(formula.f).setBackground(COR.branco).setFontSize(16).setFontWeight('bold')
    .setFontColor(COR.amargo).setHorizontalAlignment('center').setNumberFormat(formato)
    .setBorder(true, true, true, true, false, false, COR.brilho, SpreadsheetApp.BorderStyle.SOLID);
}

function larguras(sh, mapa) {
  Object.keys(mapa).forEach(function (c) { sh.setColumnWidth(sh.getRange(c + '1').getColumn(), mapa[c]); });
}

/* ---------------- Banco de dados (oculta) ---------------- */

function montarBanco(sh) {
  faixaTitulo(sh, 'B1:T1', 'BANCO DE DADOS', false);
  var blocos = [['B2:C2', ['Item', 'Classificação']], ['E2', ['Forma de pagamento']],
                ['G2:I2', ['Insumo', 'Custo por unidade', 'Unidade']], ['K2:N2', ['Data', 'Sabor', 'Caixinhas', 'Faturamento']],
                ['P2:Q2', ['Data', 'Pedidos']], ['S2:T2', ['Parâmetro', 'Valor']]];
  blocos.forEach(function (b) { sh.getRange(b[0]).setValues([b[1]]); cabecalho(sh.getRange(b[0])); });
  sh.getRange('S3:T7').setValues([
    ['Meta de lucro do grupo', 5000],
    ['Piso coletivo do PTPJ', 13500],
    ['Investimento recebido', 0],
    ['Meta de caixinhas por dia', 78],
    ['Atualizado em', '']
  ]);
  corpo(sh.getRange('S3:T7'));
  sh.getRange('T3:T5').setNumberFormat('R$ #,##0.00');
  sh.getRange('H3:H200').setNumberFormat('R$ #,##0.00000');
  sh.getRange('K3:K400').setNumberFormat('dd/mm/yyyy');
  sh.getRange('N3:N400').setNumberFormat('R$ #,##0.00');
  sh.getRange('P3:P400').setNumberFormat('dd/mm/yyyy');
  larguras(sh, { B: 230, C: 110, D: 20, E: 150, F: 20, G: 170, H: 130, I: 80, J: 20, K: 100, L: 110, M: 90, N: 110, O: 20, P: 100, Q: 80, R: 20, S: 200, T: 130 });
}

/* ---------------- Fluxo de caixa ---------------- */

function montarFluxo(sh) {
  faixaTitulo(sh, 'B1:K1', 'FLUXO DE CAIXA', true);
  sh.getRange('B3:G3').setValues([['Movimentação', 'Data', 'Produto', 'Valor', 'Forma de pagamento', 'Saldo']]);
  cabecalho(sh.getRange('B3:G3'));
  sh.setRowHeight(3, 30);
  sh.setFrozenRows(3);

  sh.getRange('I3:K3').setValues([['ENTRADAS', 'SAÍDAS', 'SALDO']]);
  cabecalho(sh.getRange('I3:K3'));
  sh.getRange('I4:K4').setFormulas([['=SUMIF(B:B,"ENTRADA",E:E)', '=SUMIF(B:B,"SAÍDA",E:E)', '=I4-J4']]);
  corpo(sh.getRange('I4:K4'));
  sh.getRange('I4:K4').setNumberFormat('R$ #,##0.00').setFontSize(13).setFontWeight('bold');
  sh.setRowHeight(4, 34);
  sh.getRange('I4').setFontColor(COR.verde);
  sh.getRange('J4').setFontColor(COR.vermelho);

  sh.getRange('I6:K6').merge().setValue('ATUALIZADO EM');
  cabecalho(sh.getRange('I6:K6'));
  sh.getRange('I7:K7').merge().setFormula("='Banco de dados'!T7");
  corpo(sh.getRange('I7:K7'));

  var regras = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ENTRADA').setFontColor(COR.verde).setRanges([sh.getRange('B4:B2000')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('SAÍDA').setFontColor(COR.vermelho).setRanges([sh.getRange('B4:B2000')]).build()
  ];
  sh.setConditionalFormatRules(regras);
  larguras(sh, { B: 130, C: 100, D: 240, E: 110, F: 160, G: 120, H: 30, I: 140, J: 140, K: 170 });
}

/* ---------------- Vendas por dia ---------------- */

function montarVendas(sh) {
  faixaTitulo(sh, 'B1:K1', 'VENDAS POR DIA', true);
  sh.getRange('B3:K3').setValues([['Data', 'Pedidos', 'Ao leite', 'Meio amargo', 'Branco', 'Caixinhas',
                                   'Faturamento', 'Ticket médio', '% da meta de caixinhas', 'Faturamento acumulado']]);
  cabecalho(sh.getRange('B3:K3'));
  sh.setRowHeight(3, 36);
  sh.setFrozenRows(3);
  larguras(sh, { B: 80, C: 80, D: 85, E: 95, F: 80, G: 90, H: 115, I: 105, J: 110, K: 130, L: 24 });
}

/* ---------------- Custos gerais (custeio) ---------------- */

function montarCustos(sh) {
  faixaTitulo(sh, 'B1:J1', 'CUSTEIO E PRECIFICAÇÃO', false);

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
    sh.getRange(r, 2, 1, 9).setValues([[n,
      "=VLOOKUP(B" + r + ",'Banco de dados'!$G:$I,2,0)", "=VLOOKUP(B" + r + ",'Banco de dados'!$G:$I,3,0)",
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
    sh.getRange(r, 5, 1, 2).merge().setValue(l[1]);
    sh.getRange(r, 7, 1, 2).merge().setValue(l[2]);
    sh.getRange(r, 9, 1, 2).merge().setValue(l[3]);
    corpo(sh.getRange(r, 2, 1, 9));
    sh.getRange(r, 2, 1, 3).setBackground(COR.brilho).setFontWeight('bold');
    sh.getRange(r, 5, 1, 6).setNumberFormat(l[4]).setFontWeight('bold');
  });

  secao(sh, 'B18:J18', 'EMBALAGEM POR CAIXINHA');
  sh.getRange('B19:F19').setValues([['Item', 'Custo por unidade', 'Unidade', 'Quantidade', 'Custo']]);
  cabecalho(sh.getRange('B19:F19'));
  ['Embalagem pote', 'Adesivos - 5cm'].forEach(function (n, i) {
    var r = 20 + i;
    sh.getRange(r, 2, 1, 5).setValues([[n, "=VLOOKUP(B" + r + ",'Banco de dados'!$G:$I,2,0)",
      "=VLOOKUP(B" + r + ",'Banco de dados'!$G:$I,3,0)", 1, '=C' + r + '*E' + r]]);
  });
  sh.getRange('B22:E22').merge().setValue('Total de embalagem');
  sh.getRange('F22').setFormula('=SUM(F20:F21)');
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
  sh.getRange('B26:C26').merge().setFormula("=SUMIF('Fluxo de Caixa'!D:D,\"Gasolina\",'Fluxo de Caixa'!E:E)+SUMIF('Fluxo de Caixa'!D:D,\"Entrega 99 (encomendas)\",'Fluxo de Caixa'!E:E)");
  sh.getRange('D26:E26').merge().setFormula("=SUM('Banco de dados'!M:M)");
  sh.getRange('F26:G26').merge().setFormula('=B26/D26');
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
    sh.getRange(r, 4, 1, 2).merge().setFormula('=' + s[1]);
    sh.getRange(r, 6, 1, 2).merge().setFormula('=$F$22');
    sh.getRange(r, 8).setFormula('=$F$26');
    sh.getRange(r, 9, 1, 2).merge().setFormula('=D' + r + '+F' + r + '+H' + r);
  });
  corpo(sh.getRange('B30:J32'));
  sh.getRange('D30:J32').setNumberFormat('R$ #,##0.00');
  sh.getRange('B30:C32').setFontWeight('bold');
  sh.getRange('I30:J32').setFontWeight('bold').setBackground(COR.brilho);

  larguras(sh, { B: 200, C: 120, D: 80, E: 95, F: 95, G: 95, H: 95, I: 95, J: 95 });
}

/* ---------------- Markup ---------------- */

function montarMarkup(sh) {
  faixaTitulo(sh, 'B1:G1', 'MARKUP', false);
  secao(sh, 'B3:G3', 'MARKUP E MARGEM DE CONTRIBUIÇÃO POR PRODUTO');
  sh.getRange('B4:G4').setValues([['Produto', 'Preço de venda', 'Custo', 'Markup', 'Margem de contribuição', 'MC (%)']]);
  cabecalho(sh.getRange('B4:G4'));
  sh.setRowHeight(4, 32);
  var itens = [
    ['Chocobite ao leite', 10, "='Custos Gerais'!I30"],
    ['Chocobite meio amargo', 10, "='Custos Gerais'!I31"],
    ['Chocobite branco', 10, "='Custos Gerais'!I32"],
    ['Promo 2 por R$ 18 (2 ao leite)', 18, "=2*'Custos Gerais'!I30"],
    ['Promo 3 por R$ 25 (3 ao leite)', 25, "=3*'Custos Gerais'!I30"]
  ];
  itens.forEach(function (it, i) {
    var r = 5 + i;
    sh.getRange(r, 2, 1, 6).setValues([[it[0], it[1], it[2], '=C' + r + '/D' + r, '=C' + r + '-D' + r, '=F' + r + '/C' + r]]);
  });
  corpo(sh.getRange('B5:G9'));
  listrar(sh.getRange('B5:G9'));
  sh.getRange('B5:B9').setHorizontalAlignment('left').setFontWeight('bold');
  sh.getRange('C5:C9').setBackground(COR.brilho);
  sh.getRange('C5:D9').setNumberFormat('R$ #,##0.00');
  sh.getRange('E5:E9').setNumberFormat('0.00');
  sh.getRange('F5:F9').setNumberFormat('R$ #,##0.00');
  sh.getRange('G5:G9').setNumberFormat('0.0%');
  larguras(sh, { B: 240, C: 120, D: 110, E: 100, F: 160, G: 100 });
}

/* ---------------- Indicadores financeiros ---------------- */

function montarIndicadores(sh) {
  faixaTitulo(sh, 'B1:G1', 'INDICADORES FINANCEIROS', true);
  var R$ = 'R$ #,##0.00', P = '0.0%', N = '#,##0';

  secao(sh, 'B3:G3', 'RESULTADO');
  cartao(sh, 'B4:C4', 'FATURAMENTO', { a1: 'B5:C5', f: "=SUM('Banco de dados'!N:N)" }, R$);
  cartao(sh, 'D4:E4', 'SAÍDAS DO CAIXA', { a1: 'D5:E5', f: "='Fluxo de Caixa'!J4" }, R$);
  cartao(sh, 'F4:G4', 'SALDO DE CAIXA', { a1: 'F5:G5', f: "='Fluxo de Caixa'!K4" }, R$);
  cartao(sh, 'B7:C7', 'INVESTIMENTO RECEBIDO', { a1: 'B8:C8', f: "='Banco de dados'!T5" }, R$);
  cartao(sh, 'D7:E7', 'LUCRO', { a1: 'D8:E8', f: '=F5-B8' }, R$);
  cartao(sh, 'F7:G7', 'ROI', { a1: 'F8:G8', f: '=D8/D5' }, P);

  secao(sh, 'B10:G10', 'META');
  cartao(sh, 'B11:C11', 'META DE LUCRO DO GRUPO', { a1: 'B12:C12', f: "='Banco de dados'!T3" }, R$);
  cartao(sh, 'D11:E11', '% DA META', { a1: 'D12:E12', f: '=D8/B12' }, P);
  cartao(sh, 'F11:G11', '% DO PISO DE R$ 13.500', { a1: 'F12:G12', f: "=D8/'Banco de dados'!T4" }, P);

  secao(sh, 'B14:G14', 'VENDAS');
  cartao(sh, 'B15:C15', 'CAIXINHAS VENDIDAS', { a1: 'B16:C16', f: "=SUM('Banco de dados'!M:M)" }, N);
  cartao(sh, 'D15:E15', 'PEDIDOS', { a1: 'D16:E16', f: "=SUM('Banco de dados'!Q:Q)" }, N);
  cartao(sh, 'F15:G15', 'TICKET MÉDIO', { a1: 'F16:G16', f: '=B5/D16' }, R$);

  secao(sh, 'B18:G18', 'MARGENS');
  cartao(sh, 'B19:C19', 'LUCRATIVIDADE', { a1: 'B20:C20', f: '=D8/B5' }, P);
  cartao(sh, 'D19:E19', 'MC MÉDIA DOS SABORES', { a1: 'D20:E20', f: '=AVERAGE(Markup!G5:G7)' }, P);
  cartao(sh, 'F19:G19', 'CUSTO MÉDIO POR CAIXINHA', { a1: 'F20:G20', f: "=AVERAGE('Custos Gerais'!I30:I32)" }, R$);

  [5, 8, 12, 16, 20].forEach(function (r) { sh.setRowHeight(r, 42); });
  [4, 7, 11, 15, 19].forEach(function (r) { sh.setRowHeight(r, 26); });
  larguras(sh, { B: 115, C: 115, D: 115, E: 115, F: 115, G: 115 });
}

/* ---------------- SWOT quantitativa ---------------- */

function montarSwot(sh) {
  faixaTitulo(sh, 'B1:N1', 'SWOT', false);
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
      sh.getRange(r, 7).setFormula('=SUM(D' + r + ':F' + r + ')');
      sh.getRange(r, 11).setFormula('=SUM(H' + r + ':J' + r + ')');
      sh.getRange(r, 13).setFormula('=G' + r + '+K' + r);
      sh.getRange(r, 14).setFormula('=RANK(M' + r + ',$M$' + ini + ':$M$' + (ini + 2) + ',0)');
      sh.setRowHeight(r, 34);
    }
    var s = ini + 3;
    sh.getRange(s, 2, 1, 2).merge().setValue('SUBTOTAL');
    ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach(function (c) {
      sh.getRange(c + s).setFormula('=SUM(' + c + ini + ':' + c + (ini + 2) + ')');
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
    var lista = SpreadsheetApp.newDataValidation().requireValueInList(['0', '1', '2'], true).setAllowInvalid(false).build();
    sh.getRange(ini, 4, 3, 3).setDataValidation(lista);
    sh.getRange(ini, 8, 3, 3).setDataValidation(lista);
  }
  bloco(6, 'FORÇAS', forcas);
  bloco(11, 'FRAQUEZAS', fraq);

  sh.getRange('B16:C16').merge().setValue('SOMA');
  sh.getRange('B17:C17').merge().setValue('ORDEM');
  ['D', 'E', 'F', 'H', 'I', 'J'].forEach(function (c) {
    var grupo = 'DEF'.indexOf(c) >= 0 ? '$D$16:$F$16' : '$H$16:$J$16';
    sh.getRange(c + '16').setFormula('=' + c + '9+' + c + '14');
    sh.getRange(c + '17').setFormula('=RANK(' + c + '16,' + grupo + ',0)');
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
    sh.getRange(r, 2, 1, 6).setValues([[c[0], c[1], c[2], 18, '=D' + r + '/E' + r, '=RANK(F' + r + ',$F$20:$F$23,0)']]);
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
