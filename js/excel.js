/* ==========================================================================
   Presales Estimation Studio — SAE Excel export (ExcelJS)
   Every total is a live Excel formula that traces back to the Inputs sheet,
   so reviewers can change a quantity or an O/M/P value and the whole
   estimate recalculates. Cached results are included for instant preview.
   Colour convention: blue text on yellow = input · black = formula.
   ========================================================================== */
(function (root) {
  var C_HEAD = 'FF13202E', C_ACC = 'FF0F5C8C', C_GRP = 'FFEEF3F8', C_IN = 'FFFFF8DC', C_TOT = 'FFF3F5F8';
  function q(name) { return "'" + name.replace(/'/g, "''") + "'"; }

  function build(cat, p, r) {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Presales Estimation Studio'; wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    var cur = p.meta.currency || 'USD';
    var MONEY = '"' + cur + '" #,##0', DAYS = '#,##0.0', PCT = '0.0%';

    var S = {
      sum: wb.addWorksheet('Summary', { properties: { tabColor: { argb: C_ACC } } }),
      inp: wb.addWorksheet('Inputs'), wbs: wb.addWorksheet('WBS Estimate'), res: wb.addWorksheet('Resources & Cost'),
      risk: wb.addWorksheet('Risks'), ae: wb.addWorksheet('Assumptions & Exclusions'), rtm: wb.addWorksheet('Requirements Matrix'),
      clar: wb.addWorksheet('Clarifications'), bid: wb.addWorksheet('Bid-No-Bid'), appr: wb.addWorksheet('Approval Log')
    };
    var N = { inp: q('Inputs'), wbs: q('WBS Estimate'), res: q('Resources & Cost'), risk: q('Risks'), sum: q('Summary') };

    function title(ws, t, sub) {
      ws.getCell('A1').value = t; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: C_ACC } };
      ws.getCell('A2').value = sub || (p.meta.customer + ' — ' + p.meta.opportunity + '  ·  ' + p.id); ws.getCell('A2').font = { italic: true, color: { argb: 'FF5A6573' } };
    }
    function header(ws, row, cols) {
      var rw = ws.getRow(row);
      cols.forEach(function (c, i) { var cell = rw.getCell(i + 1); cell.value = c; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_HEAD } }; cell.alignment = { vertical: 'middle', wrapText: true }; });
      rw.height = 30;
    }
    function input(cell) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_IN } }; cell.font = { color: { argb: 'FF0000FF' } }; }
    function f(formula, result) { return { formula: formula, result: result }; }
    function border(ws, r1, r2, c1, c2) {
      for (var i = r1; i <= r2; i++) for (var j = c1; j <= c2; j++) ws.getCell(i, j).border = { top: { style: 'thin', color: { argb: 'FFD0D5DD' } }, bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } }, left: { style: 'thin', color: { argb: 'FFD0D5DD' } }, right: { style: 'thin', color: { argb: 'FFD0D5DD' } } };
    }
    function totRow(ws, row, c1, c2) { for (var j = c1; j <= c2; j++) { var c = ws.getCell(row, j); c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_TOT } }; } }

    var doms = ['COMMON'].concat(p.domains || []);

    // ---------------- Inputs ----------------
    var ws = S.inp; title(ws, 'Inputs & traceability');
    ws.columns = [{ width: 18 }, { width: 42 }, { width: 10 }, { width: 14 }, { width: 11 }, { width: 13 }, { width: 90 }];
    header(ws, 4, ['Driver key', 'Sizing driver', 'Area', 'Unit', 'Value', 'Source', 'Evidence (RFP sentence / discovery note / clarification)']);
    var row = 5, DRV = {};
    cat.DRIVERS.filter(function (d) { return doms.indexOf(d.domain) >= 0; }).forEach(function (d) {
      var v = (p.drivers || {})[d.key] || {}, val = root.PS_ENGINE.driverValue(cat, p, d.key), src = v.source || 'Default';
      ws.getRow(row).values = [d.key, d.label, d.domain, d.unit, val, src, v.evidence || (src === 'Default' ? 'Not yet confirmed — default from catalogue' : '')];
      input(ws.getCell(row, 5));
      if (src === 'Default' || src === 'Assumed') ws.getCell(row, 6).font = { bold: true, color: { argb: 'FFB26B00' } };
      ws.getCell(row, 7).alignment = { wrapText: true, vertical: 'top' };
      DRV[d.key] = N.inp + '!$E$' + row; row++;
    });
    border(ws, 4, row - 1, 1, 7);
    row += 1; header(ws, row, ['Factor', 'Description', '', 'Selection', 'Multiplier']); row++;
    var f1 = row;
    r.factor.detail.forEach(function (fd) {
      var def = cat.FACTORS.find(function (x) { return x.key === fd.key; });
      ws.getRow(row).values = [fd.label, def ? def.help : '', '', fd.choice, fd.value]; input(ws.getCell(row, 5)); ws.getCell(row, 5).numFmt = '0.00'; row++;
    });
    ws.getRow(row).values = ['Combined complexity multiplier', 'Product of the factors above — applied to every delivery line', '', '', f('PRODUCT(E' + f1 + ':E' + (row - 1) + ')', r.factor.value)];
    ws.getCell(row, 5).numFmt = '0.000'; totRow(ws, row, 1, 5); var FAC = N.inp + '!$E$' + row; row += 2;
    header(ws, row, ['Setting', 'Meaning', '', '', 'Value']); row++;
    var st = p.settings || {};
    function setting(label, mean, val, fmt) { ws.getRow(row).values = [label, mean, '', '', val]; input(ws.getCell(row, 5)); if (fmt) ws.getCell(row, 5).numFmt = fmt; return N.inp + '!$E$' + (row++); }
    var CONF = setting('Confidence level', 'Probability the work fits the quoted effort (P80 recommended)', (+st.confidence || 80) / 100, '0%');
    var MGMT = setting('Management reserve', '% added on top of P-level + risk reserve', (+st.mgmtReservePct || 0) / 100, '0.0%');
    var MARGIN = setting('Target gross margin', 'Price = cost ÷ (1 − margin)', (+st.marginPct || 0) / 100, '0.0%');
    var FTE = setting('Average team size (FTE)', 'Used to derive duration', +st.teamFTE || 3, '0.0');
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    // ---------------- WBS ----------------
    ws = S.wbs; title(ws, 'WBS estimate — three-point (PERT)', 'Effort = Qty × (O + 4M + P)/6 × Factor × Include  ·  σ = Qty × (P − O)/6 × Factor  ·  O/M/P are person-days per unit');
    ws.columns = [{ width: 8 }, { width: 22 }, { width: 52 }, { width: 30 }, { width: 8 }, { width: 7 }, { width: 7 }, { width: 7 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 9 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 50 }];
    header(ws, 4, ['ID', 'Phase', 'Activity', 'Driver', 'Qty', 'O', 'M', 'P', 'PERT /unit', 'Factor', 'Include (1/0)', 'Effort (days)', 'σ (days)', 'PM', 'SA', 'SC', 'C', 'QA', 'Basis of estimate / source']);
    row = 5; var w1 = row, lastNonPct = row;
    var roleCodes = ['PM', 'SA', 'SC', 'C', 'QA'];
    r.lines.forEach(function (l) {
      var pct = l.driver === 'PCT';
      var d = cat.DRIVERS.find(function (x) { return x.key === l.driver; });
      var dl = l.driver === 'FIXED' ? 'Fixed' : pct ? '% of delivery effort (rows above)' : l.driver === 'CUSTOM' ? 'Custom quantity' : (d ? d.label : l.driver);
      var src = d ? ((p.drivers[l.driver] || {}).source || 'Default') : '';
      var qty = pct ? f('SUM(L' + w1 + ':L' + (row - 1) + ')', l.qty) : (DRV[l.driver] ? f(DRV[l.driver], l.qty) : l.qty);
      ws.getRow(row).values = [l.id, l.phase, l.activity, dl, qty, l.o, l.m, l.p,
        f('(F' + row + '+4*G' + row + '+H' + row + ')/6', l.pert), pct ? 1 : f(FAC, l.factor), l.include ? 1 : 0,
        f('E' + row + '*I' + row + '*J' + row + '*K' + row, l.effort), f('E' + row + '*(H' + row + '-F' + row + ')/6*J' + row + '*K' + row, l.sigma)]
        .concat(roleCodes.map(function (k) { return (l.roles && l.roles[k]) || 0; }))
        .concat([(l.basis || '') + (src ? '  [driver source: ' + src + ']' : '') + (l.overridden ? '  [O/M/P changed from catalogue]' : '')]);
      ['F', 'G', 'H', 'K'].forEach(function (c) { input(ws.getCell(c + row)); });
      if (!DRV[l.driver] && !pct) input(ws.getCell('E' + row));
      roleCodes.forEach(function (k, i) { ws.getCell(row, 14 + i).numFmt = '0%'; });
      ['E', 'I', 'J'].forEach(function (c) { ws.getCell(c + row).numFmt = '0.00'; });
      ['L', 'M'].forEach(function (c) { ws.getCell(c + row).numFmt = DAYS; });
      if (pct) { ['F', 'G', 'H', 'I'].forEach(function (c) { ws.getCell(c + row).numFmt = '0%'; }); ws.getCell('E' + row).numFmt = DAYS; }
      else lastNonPct = row;
      if (l.overridden) ws.getCell('C' + row).font = { color: { argb: 'FFB26B00' } };
      ws.getCell('S' + row).alignment = { wrapText: true, vertical: 'top' };
      row++;
    });
    var wN = row - 1;
    ws.getRow(row).values = ['', 'TOTAL', 'Expected effort (P50) and combined σ = √Σσ²', '', '', '', '', '', '', '', '', f('SUM(L' + w1 + ':L' + wN + ')', r.mean), f('SQRT(SUMSQ(M' + w1 + ':M' + wN + '))', r.sigma)];
    ws.getCell('L' + row).numFmt = DAYS; ws.getCell('M' + row).numFmt = DAYS; totRow(ws, row, 1, 19);
    border(ws, 4, row, 1, 19);
    var MEAN = N.wbs + '!$L$' + row, SIGMA = N.wbs + '!$M$' + row;
    ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 3 }];
    ws.autoFilter = { from: 'A4', to: 'S' + wN };

    // ---------------- Risks ----------------
    ws = S.risk; title(ws, 'Risk register — quantified risk reserve', 'EMV = probability × impact. The total is added to the estimate as an explicit risk reserve.');
    ws.columns = [{ width: 6 }, { width: 60 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 60 }, { width: 16 }];
    header(ws, 4, ['#', 'Risk', 'Probability', 'Impact (days)', 'EMV (days)', 'Mitigation', 'Owner']);
    row = 5;
    (p.risks || []).forEach(function (x, i) {
      var pr = (+x.prob || 0) / 100, im = +x.impact || 0;
      ws.getRow(row).values = ['R' + (i + 1), x.risk, pr, im, f('C' + row + '*D' + row, pr * im), x.mitigation, x.owner || ''];
      input(ws.getCell('C' + row)); input(ws.getCell('D' + row)); ws.getCell('C' + row).numFmt = '0%'; ws.getCell('E' + row).numFmt = DAYS;
      ws.getCell('B' + row).alignment = ws.getCell('F' + row).alignment = { wrapText: true, vertical: 'top' }; row++;
    });
    var rN = row - 1;
    ws.getRow(row).values = ['', 'Total risk reserve', '', '', rN >= 5 ? f('SUM(E5:E' + rN + ')', r.riskReserve) : 0];
    ws.getCell('E' + row).numFmt = DAYS; totRow(ws, row, 1, 7); border(ws, 4, row, 1, 7);
    var RISK = N.risk + '!$E$' + row;

    // ---------------- Summary ----------------
    ws = S.sum; var approved = /Approved|Submitted/.test(p.review.status);
    title(ws, 'Solution & Effort Estimate (SAE)', approved ? 'Status: ' + p.review.status : 'DRAFT — status: ' + p.review.status + ' (not approved)');
    if (!approved) ws.getCell('A2').font = { bold: true, color: { argb: 'FFC2362B' } };
    ws.columns = [{ width: 44 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 50 }];
    var m = p.meta, info = [['Customer', m.customer], ['Opportunity', m.opportunity], ['Request type / reference', m.type + (m.rfpRef ? ' · ' + m.rfpRef : '')], ['Opportunity ID / version', p.id + ' · v' + (p.versions || []).length],
      ['Technology areas', (p.domains || []).map(function (d) { return cat.DOMAINS[d].name; }).join('; ')], ['Submission deadline', m.dueDate], ['Commercial model', m.contractType], ['Sales owner', m.salesOwner], ['Presales owner', m.presalesOwner], ['Delivery lead (reviewer)', m.deliveryLead], ['Catalogue version', cat.version], ['Generated', new Date().toISOString().slice(0, 16).replace('T', ' ')]];
    row = 4; info.forEach(function (x) { ws.getCell('A' + row).value = x[0]; ws.getCell('A' + row).font = { bold: true }; ws.getCell('B' + row).value = x[1] || ''; ws.mergeCells('B' + row + ':E' + row); row++; });
    row++; header(ws, row, ['Estimate build-up', 'Value', 'Unit', '', 'How it is calculated']); row++;
    var A = {};
    function line(key, label, formula, result, unit, how, fmt) {
      ws.getRow(row).values = [label, f(formula, result), unit, '', how]; ws.getCell('B' + row).numFmt = fmt || DAYS; ws.getCell('E' + row).alignment = { wrapText: true };
      A[key] = 'B' + row; row++;
    }
    var sb = row;
    line('mean', 'Expected effort (P50)', MEAN, r.mean, 'person-days', 'Σ of all WBS lines (WBS Estimate sheet)');
    line('sigma', 'Standard deviation σ', SIGMA, r.sigma, 'person-days', '√Σσ² of WBS lines (assumes independent lines)');
    line('conf', 'Confidence level', CONF, r.confidence / 100, '', 'Inputs sheet', '0%');
    line('z', 'z-value', 'NORMSINV(' + A.conf + ')', r.z, '', 'Inverse normal of the confidence level', '0.000');
    line('pconf', 'Effort at confidence level', A.mean + '+' + A.z + '*' + A.sigma, r.pConf, 'person-days', 'P50 + z × σ');
    line('risk', 'Risk reserve', RISK, r.riskReserve, 'person-days', 'Σ probability × impact (Risks sheet)');
    line('mgmt', 'Management reserve', '(' + A.pconf + '+' + A.risk + ')*' + MGMT, r.mgmtReserve, 'person-days', '% on top (Inputs sheet)');
    line('final', 'FINAL ESTIMATE', 'ROUNDUP((' + A.pconf + '+' + A.risk + '+' + A.mgmt + ')*2,0)/2', r.final, 'person-days', 'Rounded up to the nearest 0.5 day');
    totRow(ws, row - 1, 1, 5); ws.getCell(A.final).font = { bold: true, size: 13, color: { argb: C_ACC } };
    line('cont', 'Total contingency over P50', A.final + '/' + A.mean + '-1', r.contingencyPct / 100, '', 'Typical range 10–40%', PCT);
    line('weeks', 'Indicative duration', 'ROUNDUP(' + A.final + '/(' + FTE + '*5),0)', r.weeks, 'weeks', 'Final effort ÷ (team FTE × 5 days)', '0');
    var costRow = row; row++; var priceRow = row; row++;
    border(ws, sb - 1, row - 1, 1, 5);

    // phases
    row++; header(ws, row, ['Effort by phase', 'Base (P50)', 'Final', 'Share', '']); row++;
    var p1 = row;
    r.phases.forEach(function (ph) {
      ws.getRow(row).values = [ph.phase, f('SUMIF(' + N.wbs + '!$B$' + w1 + ':$B$' + wN + ',A' + row + ',' + N.wbs + '!$L$' + w1 + ':$L$' + wN + ')', ph.base),
        f('B' + row + '/' + A.mean + '*' + A.final, ph.final), f('B' + row + '/' + A.mean, ph.base / r.mean)];
      ws.getCell('B' + row).numFmt = DAYS; ws.getCell('C' + row).numFmt = DAYS; ws.getCell('D' + row).numFmt = PCT; row++;
    });
    ws.getRow(row).values = ['Total', f('SUM(B' + p1 + ':B' + (row - 1) + ')', r.mean), f('SUM(C' + p1 + ':C' + (row - 1) + ')', r.final), f('SUM(D' + p1 + ':D' + (row - 1) + ')', 1)];
    ws.getCell('B' + row).numFmt = DAYS; ws.getCell('C' + row).numFmt = DAYS; ws.getCell('D' + row).numFmt = PCT; totRow(ws, row, 1, 4); border(ws, p1 - 1, row, 1, 4); row += 2;
    header(ws, row, ['Quality checks at export', 'Result', '', '', '']); row++;
    r.checks.forEach(function (c) {
      ws.getCell('A' + row).value = c.msg; ws.mergeCells('A' + row + ':D' + row); ws.getCell('A' + row).alignment = { wrapText: true };
      ws.getCell('E' + row).value = c.level === 'ok' ? 'OK' : c.level === 'warn' ? 'REVIEW' : 'FAIL';
      ws.getCell('E' + row).font = { bold: true, color: { argb: c.level === 'ok' ? 'FF1D8A5B' : c.level === 'warn' ? 'FFB26B00' : 'FFC2362B' } }; row++;
    });
    row++; ws.getCell('A' + row).value = 'Colour convention: blue text on yellow = input you can change · black = formula. All totals recalculate.'; ws.getCell('A' + row).font = { italic: true, color: { argb: 'FF5A6573' } };
    var FINAL = N.sum + '!$' + A.final.replace(/(\D+)(\d+)/, '$1$$$2');
    var MEANS = N.sum + '!$' + A.mean.replace(/(\D+)(\d+)/, '$1$$$2');
    var WEEKS = N.sum + '!$' + A.weeks.replace(/(\D+)(\d+)/, '$1$$$2');

    // ---------------- Resources & Cost ----------------
    ws = S.res; title(ws, 'Resources, cost & indicative price');
    ws.columns = [{ width: 26 }, { width: 8 }, { width: 13 }, { width: 10 }, { width: 13 }, { width: 14 }, { width: 16 }, { width: 14 }];
    header(ws, 4, ['Role', 'Code', 'Base days (P50)', 'Share', 'Final days', 'Day rate (' + cur + ')', 'Cost (' + cur + ')', 'Avg FTE']);
    row = 5;
    var colOf = { PM: 'N', SA: 'O', SC: 'P', C: 'Q', QA: 'R' };
    r.roles.forEach(function (ro) {
      ws.getRow(row).values = [ro.name, ro.code, f('SUMPRODUCT(' + N.wbs + '!$L$' + w1 + ':$L$' + wN + ',' + N.wbs + '!$' + colOf[ro.code] + '$' + w1 + ':$' + colOf[ro.code] + '$' + wN + ')', ro.base),
        f('IF(' + MEANS + '=0,0,C' + row + '/' + MEANS + ')', ro.share), f('D' + row + '*' + FINAL, ro.final), ro.rate, f('E' + row + '*F' + row, ro.cost), f('E' + row + '/MAX(' + WEEKS + '*5,1)', ro.final / Math.max(r.weeks * 5, 1))];
      input(ws.getCell('F' + row)); ws.getCell('C' + row).numFmt = DAYS; ws.getCell('D' + row).numFmt = PCT; ws.getCell('E' + row).numFmt = DAYS; ws.getCell('F' + row).numFmt = MONEY; ws.getCell('G' + row).numFmt = MONEY; ws.getCell('H' + row).numFmt = '0.00'; row++;
    });
    var rr = row - 1;
    ws.getRow(row).values = ['Total', '', f('SUM(C5:C' + rr + ')', r.mean), f('SUM(D5:D' + rr + ')', 1), f('SUM(E5:E' + rr + ')', r.final), f('IF(E' + row + '=0,0,G' + row + '/E' + row + ')', r.final ? r.cost / r.final : 0), f('SUM(G5:G' + rr + ')', r.cost), f('SUM(H5:H' + rr + ')', r.final / Math.max(r.weeks * 5, 1))];
    ws.getCell('C' + row).numFmt = DAYS; ws.getCell('D' + row).numFmt = PCT; ws.getCell('E' + row).numFmt = DAYS; ws.getCell('F' + row).numFmt = MONEY; ws.getCell('G' + row).numFmt = MONEY; ws.getCell('H' + row).numFmt = '0.00';
    totRow(ws, row, 1, 8); var COST = q('Resources & Cost') + '!$G$' + row; row += 2;
    ws.getRow(row).values = ['Target gross margin', '', '', '', '', '', f(MARGIN, r.marginPct / 100)]; ws.getCell('G' + row).numFmt = PCT; row++;
    ws.getRow(row).values = ['Indicative price = cost ÷ (1 − margin)', '', '', '', '', '', f(COST + '/(1-G' + (row - 1) + ')', r.price)]; ws.getCell('G' + row).numFmt = MONEY; totRow(ws, row, 1, 8);
    var PRICE = q('Resources & Cost') + '!$G$' + row;
    border(ws, 4, row, 1, 8);
    ws.getCell('A' + (row + 2)).value = 'Blended rate column F of the Total row = cost ÷ final days. Final pricing is owned by Sales / Commercial.'; ws.getCell('A' + (row + 2)).font = { italic: true, color: { argb: 'FF5A6573' } };
    // back-fill cost & price into Summary
    S.sum.getRow(costRow).values = ['Total cost', f(COST, r.cost), cur, '', 'Resources & Cost sheet'];
    S.sum.getRow(priceRow).values = ['INDICATIVE PRICE', f(PRICE, r.price), cur, '', 'Cost ÷ (1 − target margin)'];
    S.sum.getCell('B' + costRow).numFmt = MONEY; S.sum.getCell('B' + priceRow).numFmt = MONEY; totRow(S.sum, priceRow, 1, 5);
    S.sum.getCell('B' + priceRow).font = { bold: true, size: 13, color: { argb: C_ACC } };
    border(S.sum, costRow, priceRow, 1, 5);

    // ---------------- Assumptions & Exclusions ----------------
    ws = S.ae; title(ws, 'Assumptions & exclusions'); ws.columns = [{ width: 8 }, { width: 120 }];
    header(ws, 4, ['#', 'Assumption']); row = 5;
    (p.assumptions || []).filter(Boolean).forEach(function (a, i) { ws.getRow(row).values = ['A' + (i + 1), a]; ws.getCell('B' + row).alignment = { wrapText: true }; row++; });
    row++; header(ws, row, ['#', 'Exclusion / out of scope']); row++;
    (p.exclusions || []).filter(Boolean).forEach(function (a, i) { ws.getRow(row).values = ['E' + (i + 1), a]; ws.getCell('B' + row).alignment = { wrapText: true }; row++; });

    // ---------------- Requirements ----------------
    ws = S.rtm; title(ws, 'Requirements traceability & compliance matrix');
    ws.columns = [{ width: 10 }, { width: 80 }, { width: 22 }, { width: 12 }, { width: 18 }, { width: 40 }, { width: 26 }];
    header(ws, 4, ['ID', 'Requirement', 'Category', 'Priority', 'Response', 'Response notes', 'Source']); row = 5;
    (p.requirements || []).forEach(function (x) { ws.getRow(row).values = [x.id, x.text, x.category, x.priority, x.response || 'NOT ANSWERED', x.notes, x.source]; ws.getCell('B' + row).alignment = { wrapText: true, vertical: 'top' }; if (!x.response) ws.getCell('E' + row).font = { bold: true, color: { argb: 'FFC2362B' } }; row++; });
    if (row > 5) { border(ws, 4, row - 1, 1, 7); ws.autoFilter = { from: 'A4', to: 'G' + (row - 1) }; }
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    // ---------------- Clarifications ----------------
    ws = S.clar; title(ws, 'Clarification questions log');
    ws.columns = [{ width: 6 }, { width: 80 }, { width: 30 }, { width: 12 }, { width: 11 }, { width: 50 }];
    header(ws, 4, ['#', 'Question', 'Related driver', 'Raised', 'Status', 'Customer answer']); row = 5;
    (p.clarifications || []).forEach(function (c, i) {
      var d = c.driver && cat.DRIVERS.find(function (x) { return x.key === c.driver; });
      ws.getRow(row).values = ['Q' + (i + 1), c.question, d ? d.label : (c.ref || ''), c.raised, c.status, c.answer || '']; ws.getCell('B' + row).alignment = { wrapText: true }; row++;
    });
    if (row > 5) border(ws, 4, row - 1, 1, 6);

    // ---------------- Bid / No-Bid ----------------
    ws = S.bid; title(ws, 'Bid / No-Bid qualification'); ws.columns = [{ width: 52 }, { width: 10 }, { width: 12 }, { width: 12 }];
    header(ws, 4, ['Criterion', 'Weight', 'Score (1–5)', 'Weighted']); row = 5;
    cat.BID_CRITERIA.forEach(function (c) {
      var s = +((p.bid || {}).scores || {})[c.key] || 0;
      ws.getRow(row).values = [c.label, c.weight / 100, s, f('C' + row + '/5*B' + row, s / 5 * c.weight / 100)]; input(ws.getCell('C' + row)); ws.getCell('B' + row).numFmt = '0%'; ws.getCell('D' + row).numFmt = PCT; row++;
    });
    var bs = root.PS_ENGINE.bidScore(cat, p);
    ws.getRow(row).values = ['Total score', f('SUM(B5:B' + (row - 1) + ')', 1), '', f('SUM(D5:D' + (row - 1) + ')', bs.pct / 100)]; ws.getCell('B' + row).numFmt = '0%'; ws.getCell('D' + row).numFmt = PCT; totRow(ws, row, 1, 4);
    ws.getRow(row + 1).values = ['Decision', '', '', f('IF(D' + row + '>=0.7,"BID",IF(D' + row + '>=0.5,"BID WITH CONDITIONS","NO-BID"))', bs.pct >= 70 ? 'BID' : bs.pct >= 50 ? 'BID WITH CONDITIONS' : 'NO-BID')];
    ws.getRow(row + 1).font = { bold: true }; border(ws, 4, row + 1, 1, 4);
    ws.getCell('A' + (row + 3)).value = 'Notes: ' + ((p.bid || {}).notes || ''); ws.getCell('A' + (row + 3)).alignment = { wrapText: true };

    // ---------------- Approval log ----------------
    ws = S.appr; title(ws, 'Review & approval log'); ws.columns = [{ width: 18 }, { width: 22 }, { width: 22 }, { width: 28 }, { width: 9 }, { width: 12 }, { width: 60 }];
    header(ws, 4, ['Date', 'Name', 'Role', 'Decision', 'Version', 'Estimate (d)', 'Comment']); row = 5;
    (p.review.approvals || []).forEach(function (a) { ws.getRow(row).values = [a.date, a.by, a.role, a.decision, 'v' + a.version, a.final, a.comment]; row++; });
    row++; header(ws, row, ['Reviewer checklist', '', '', '', '', '', 'Done']); row++;
    cat.REVIEW_CHECKLIST.forEach(function (c, i) { ws.getCell('A' + row).value = c; ws.mergeCells('A' + row + ':F' + row); ws.getCell('G' + row).value = p.review.checklist[i] ? 'Yes' : 'No'; row++; });

    return wb.xlsx.writeBuffer();
  }

  root.PS_EXCEL = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
