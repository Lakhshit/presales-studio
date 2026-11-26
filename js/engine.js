/* ==========================================================================
   Presales Estimation Studio — Estimation Engine (pure functions)
   Method: bottom-up WBS x three-point (PERT) estimates, statistical
   confidence (P50/P80/P90), risk reserve (EMV), management reserve.
   ========================================================================== */
(function (root) {
  // Acklam's inverse-normal approximation (accurate to ~1e-9)
  function invNorm(p) {
    if (p <= 0 || p >= 1) return 0;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var q, r, pl = 0.02425;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p <= 1 - pl) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  function r1(x) { return Math.round(x * 10) / 10; }
  function halfUp(x) { return Math.ceil(x * 2) / 2; }

  function factorValue(cat, factors) {
    var f = 1, detail = [];
    cat.FACTORS.forEach(function (fd) {
      var sel = (factors && factors[fd.key]) || fd.def;
      var opt = fd.options.find(function (o) { return o[0] === sel; }) || fd.options[1] || fd.options[0];
      f *= opt[1];
      detail.push({ key: fd.key, label: fd.label, choice: opt[0], value: opt[1] });
    });
    return { value: f, detail: detail };
  }

  function driverValue(cat, project, key) {
    var d = project.drivers && project.drivers[key];
    if (d && d.value !== '' && d.value !== null && d.value !== undefined && !isNaN(+d.value)) return +d.value;
    var def = cat.DRIVERS.find(function (x) { return x.key === key; });
    return def ? def.def : 0;
  }

  /* Returns the WBS lines applicable to the project (catalogue + custom). */
  function activeLines(cat, project) {
    var doms = ['COMMON'].concat(project.domains || []);
    var lines = cat.LINES.filter(function (l) { return doms.indexOf(l.domain) >= 0; }).map(function (l) {
      var ov = (project.lineOverrides && project.lineOverrides[l.id]) || {};
      return Object.assign({}, l, {
        o: ov.o !== undefined ? +ov.o : l.o, m: ov.m !== undefined ? +ov.m : l.m, p: ov.p !== undefined ? +ov.p : l.p,
        include: ov.include !== undefined ? ov.include : true, note: ov.note || '', custom: false, overridden: (ov.o !== undefined || ov.m !== undefined || ov.p !== undefined)
      });
    });
    (project.customLines || []).forEach(function (c) {
      lines.push(Object.assign({ include: true, custom: true, basis: 'Custom line', roles: { PM: 0, SA: 0, SC: .5, C: .5, QA: 0 } }, c));
    });
    // keep PCT line last
    lines.sort(function (a, b) { return (a.driver === 'PCT') - (b.driver === 'PCT'); });
    return lines;
  }

  function compute(cat, project) {
    var s = Object.assign({ confidence: 80, mgmtReservePct: 0, marginPct: 25, teamFTE: 3, rates: {} }, project.settings || {});
    var fac = factorValue(cat, project.factors);
    var lines = activeLines(cat, project);
    var base = 0, out = [];

    lines.forEach(function (l) {
      if (l.driver === 'PCT') return;
      var qty = l.driver === 'FIXED' ? 1 : (l.driver === 'CUSTOM' ? +l.qty || 0 : driverValue(cat, project, l.driver));
      var pert = (l.o + 4 * l.m + l.p) / 6, sdu = (l.p - l.o) / 6;
      var eff = l.include ? qty * pert * fac.value : 0;
      var sig = l.include ? qty * sdu * fac.value : 0;
      base += eff;
      out.push(Object.assign({}, l, { qty: qty, pert: pert, sdUnit: sdu, factor: fac.value, effort: eff, sigma: sig }));
    });
    lines.filter(function (l) { return l.driver === 'PCT'; }).forEach(function (l) {
      var pert = (l.o + 4 * l.m + l.p) / 6, sdu = (l.p - l.o) / 6;
      out.push(Object.assign({}, l, { qty: base, pert: pert, sdUnit: sdu, factor: 1, effort: l.include ? base * pert : 0, sigma: l.include ? base * sdu : 0 }));
    });

    var mean = out.reduce(function (a, l) { return a + l.effort; }, 0);
    var sigma = Math.sqrt(out.reduce(function (a, l) { return a + l.sigma * l.sigma; }, 0));
    var z = invNorm(s.confidence / 100);
    var pConf = mean + z * sigma;
    var p90 = mean + invNorm(0.9) * sigma;
    var risks = project.risks || [];
    var riskReserve = risks.reduce(function (a, r) { return a + (+r.prob || 0) / 100 * (+r.impact || 0); }, 0);
    var mgmt = (pConf + riskReserve) * (+s.mgmtReservePct || 0) / 100;
    var final = halfUp(pConf + riskReserve + mgmt);

    // phases
    var phases = cat.PHASES.map(function (ph) {
      var e = out.filter(function (l) { return l.phase === ph; }).reduce(function (a, l) { return a + l.effort; }, 0);
      return { phase: ph, base: e, final: mean ? e / mean * final : 0 };
    }).filter(function (p) { return p.base > 0; });

    // roles & cost
    var fte = Math.max(+s.teamFTE || 1, 0.5);
    var roles = cat.ROLES.map(function (r) {
      var b = out.reduce(function (a, l) { return a + l.effort * ((l.roles && l.roles[r.code]) || 0); }, 0);
      var rate = s.rates[r.code] !== undefined ? +s.rates[r.code] : r.rate;
      var fd = mean ? b / mean * final : 0;
      return { code: r.code, name: r.name, base: b, share: mean ? b / mean : 0, final: fd, rate: rate, cost: fd * rate };
    });
    var cost = roles.reduce(function (a, r) { return a + r.cost; }, 0);
    var margin = Math.min(+s.marginPct || 0, 90) / 100;
    var price = margin < 1 ? cost / (1 - margin) : cost;
    var weeks = Math.ceil(final / (fte * 5));

    // quality checks
    var checks = [];
    var delivery = mean - out.filter(function (l) { return l.driver === 'PCT'; }).reduce(function (a, l) { return a + l.effort; }, 0);
    var pmPct = delivery ? (mean - delivery) / delivery * 100 : 0;
    var testE = out.filter(function (l) { return /Test/.test(l.phase); }).reduce(function (a, l) { return a + l.effort; }, 0);
    var testPct = delivery ? testE / delivery * 100 : 0;
    var contPct = mean ? (final - mean) / mean * 100 : 0;
    checks.push(pmPct >= 8 && pmPct <= 15 ? { level: 'ok', msg: 'PM overhead ' + r1(pmPct) + '% (norm 8–15%)' } : { level: 'warn', msg: 'PM overhead ' + r1(pmPct) + '% is outside the 8–15% norm' });
    checks.push(testPct >= 12 ? { level: 'ok', msg: 'Testing share ' + r1(testPct) + '% of delivery effort' } : { level: 'warn', msg: 'Testing is only ' + r1(testPct) + '% of delivery effort — industry norm is 15–30%' });
    checks.push(contPct >= 10 && contPct <= 40 ? { level: 'ok', msg: 'Total contingency ' + r1(contPct) + '% over P50' } : { level: 'warn', msg: 'Total contingency ' + r1(contPct) + '% over P50 — review (typical 10–40%)' });

    var drvKeys = cat.DRIVERS.filter(function (d) { return ['COMMON'].concat(project.domains || []).indexOf(d.domain) >= 0; });
    var unsourced = drvKeys.filter(function (d) {
      var v = project.drivers && project.drivers[d.key];
      var src = v && v.source;
      if (src === 'RFP' || src === 'Discovery' || src === 'Customer') return false;
      var hasQ = (project.clarifications || []).some(function (c) { return c.driver === d.key; });
      return !hasQ;
    });
    checks.push(unsourced.length ? { level: 'warn', msg: unsourced.length + ' sizing driver(s) use defaults with no source or clarification: ' + unsourced.map(function (d) { return d.label; }).slice(0, 4).join(', ') + (unsourced.length > 4 ? '…' : '') } : { level: 'ok', msg: 'All sizing drivers are sourced or have a clarification raised' });
    var openQ = (project.clarifications || []).filter(function (c) { return c.status !== 'Answered'; }).length;
    if (openQ) checks.push({ level: 'warn', msg: openQ + ' clarification question(s) still open — keep matching assumptions in the SOW' });
    var reqs = project.requirements || [];
    var unresp = reqs.filter(function (r) { return !r.response; }).length;
    if (reqs.length) checks.push(unresp ? { level: 'warn', msg: unresp + ' of ' + reqs.length + ' requirements have no compliance response' } : { level: 'ok', msg: 'All ' + reqs.length + ' requirements have a compliance response' });
    var wide = out.filter(function (l) { return l.include && l.effort > 0 && l.o > 0 && l.p / l.o > 4; });
    if (wide.length) checks.push({ level: 'warn', msg: wide.length + ' line(s) have very wide ranges (P > 4×O) — clarify scope: ' + wide.map(function (l) { return l.id; }).join(', ') });
    var bid = bidScore(cat, project);
    if (bid.answered) checks.push(bid.pct >= 70 ? { level: 'ok', msg: 'Bid score ' + bid.pct + '% — ' + bid.decision } : { level: bid.pct >= 50 ? 'warn' : 'err', msg: 'Bid score ' + bid.pct + '% — ' + bid.decision });
    else checks.push({ level: 'warn', msg: 'Bid / No-Bid qualification not completed' });

    return {
      factor: fac, lines: out, base: base, mean: mean, sigma: sigma, z: z, confidence: s.confidence,
      pConf: pConf, p90: p90, riskReserve: riskReserve, mgmtReserve: mgmt, final: final, contingencyPct: contPct,
      phases: phases, roles: roles, cost: cost, price: price, marginPct: margin * 100, fte: fte, weeks: weeks,
      pmPct: pmPct, testPct: testPct, checks: checks, currency: (project.meta && project.meta.currency) || 'USD'
    };
  }

  function bidScore(cat, project) {
    var b = (project.bid && project.bid.scores) || {};
    var tot = 0, w = 0, answered = 0;
    cat.BID_CRITERIA.forEach(function (c) { var v = +b[c.key]; if (v) { tot += v / 5 * c.weight; answered++; } w += c.weight; });
    var pct = Math.round(tot / w * 100);
    var decision = pct >= 70 ? 'BID' : pct >= 50 ? 'BID WITH CONDITIONS — escalate for review' : 'NO-BID recommended';
    return { pct: pct, decision: decision, answered: answered === cat.BID_CRITERIA.length, count: answered };
  }

  var API = { compute: compute, bidScore: bidScore, invNorm: invNorm, activeLines: activeLines, driverValue: driverValue, factorValue: factorValue };
  root.PS_ENGINE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
