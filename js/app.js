/* ==========================================================================
   Presales Estimation Studio — UI
   Static single-page app. All data stays in the browser (localStorage);
   RFP files are parsed locally and never uploaded anywhere.
   ========================================================================== */
(function () {
  'use strict';
  var DEFAULT_CAT = window.PS_CATALOGUE, E = window.PS_ENGINE, X = window.PS_EXTRACT;
  var LS_P = 'pes.projects.v1', LS_C = 'pes.catalogue.v1', LS_CUR = 'pes.current.v1';

  // ---------- storage ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { toast('Browser storage is full or blocked — export your project JSON to keep a copy'); return false; } }
  function rxReplacer(k, v) { return v instanceof RegExp ? { __rx: v.source } : v; }
  function rxReviver(k, v) { return v && typeof v === 'object' && v.__rx !== undefined ? new RegExp(v.__rx, 'i') : v; }
  function loadCat() {
    var s = lsGet(LS_C);
    if (s) { try { return JSON.parse(s, rxReviver); } catch (e) { /* fall through */ } }
    return structuredClone(DEFAULT_CAT);
  }
  var CAT = loadCat();
  var S = { projects: {}, cur: lsGet(LS_CUR), view: 'home', analysis: null };
  try { S.projects = JSON.parse(lsGet(LS_P) || '{}'); } catch (e) { S.projects = {}; }
  if (!S.projects[S.cur]) S.cur = null;
  function P() { return S.projects[S.cur]; }
  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { lsSet(LS_P, JSON.stringify(S.projects)); lsSet(LS_CUR, S.cur || ''); }, 250);
  }
  function touch() { if (P()) P().updated = new Date().toISOString(); save(); }

  // ---------- utils ----------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function d1(x) { return (Math.round((+x || 0) * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function d2(x) { return (+x || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function money(x, cur) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(x || 0); }
    catch (e) { return (cur || '') + ' ' + Math.round(x || 0).toLocaleString(); }
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid(p) { return p + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase(); }
  function getPath(o, path) { return path.split('.').reduce(function (a, k) { return a === undefined || a === null ? undefined : a[k]; }, o); }
  function setPath(o, path, v) {
    var ks = path.split('.'), last = ks.pop();
    var t = ks.reduce(function (a, k) { if (a[k] === undefined || a[k] === null || typeof a[k] !== 'object') a[k] = {}; return a[k]; }, o);
    t[last] = v;
  }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function download(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function safeName(s) { return String(s || 'Opportunity').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60); }
  function drv(key) { return CAT.DRIVERS.find(function (d) { return d.key === key; }); }
  function inDoms(p) { return ['COMMON'].concat(p.domains || []); }

  // ---------- project model ----------
  function newProject() {
    return {
      id: uid('OPP-'), created: new Date().toISOString(), updated: new Date().toISOString(), catalogueVersion: CAT.version,
      meta: { customer: '', opportunity: '', type: 'RFP', rfpRef: '', industry: '', issueDate: today(), qaDeadline: '', dueDate: '',
        salesOwner: '', presalesOwner: '', deliveryLead: '', currency: 'USD', contractType: 'Fixed Price', description: '' },
      domains: [], bid: { scores: {}, notes: '' }, docs: [], requirements: [], drivers: {}, factors: {}, lineOverrides: {}, customLines: [],
      settings: { confidence: 80, mgmtReservePct: 0, marginPct: 25, teamFTE: 3, rates: {} },
      clarifications: [], risks: CAT.DEFAULT_RISKS.COMMON.map(function (r) { return Object.assign({ owner: '' }, r); }),
      assumptions: CAT.DEFAULT_ASSUMPTIONS.COMMON.slice(), exclusions: CAT.DEFAULT_EXCLUSIONS.slice(),
      review: { checklist: {}, status: 'Draft', approvals: [] }, versions: [], facts: [], exported: false
    };
  }
  function addDomainDefaults(p, d) {
    (CAT.DEFAULT_RISKS[d] || []).forEach(function (r) { if (!p.risks.some(function (x) { return x.risk === r.risk; })) p.risks.push(Object.assign({ owner: '' }, r)); });
    (CAT.DEFAULT_ASSUMPTIONS[d] || []).forEach(function (a) { if (p.assumptions.indexOf(a) < 0) p.assumptions.push(a); });
  }

  // ---------- navigation ----------
  var STEPS = [
    ['intake', '1', 'Opportunity intake'], ['bid', '2', 'Bid / No-Bid'], ['rfp', '3', 'RFP & requirements'],
    ['scope', '4', 'Scoping & discovery'], ['clar', '5', 'Clarifications'], ['est', '6', 'Effort estimate'],
    ['cost', '7', 'Resources & cost'], ['raid', '8', 'Risks & assumptions'], ['review', '9', 'Review & approval'], ['export', '10', 'Export & submit']
  ];
  function stepDone(id, p, r) {
    switch (id) {
      case 'intake': return !!(p.meta.customer && p.meta.opportunity && p.domains.length);
      case 'bid': return E.bidScore(CAT, p).answered;
      case 'rfp': return p.requirements.length > 0;
      case 'scope': return !r.checks.some(function (c) { return /sizing driver/.test(c.msg) && c.level !== 'ok'; });
      case 'clar': return p.clarifications.length > 0 && p.clarifications.every(function (c) { return c.status === 'Answered'; });
      case 'est': return r.final > 0 && p.domains.length > 0;
      case 'cost': return r.cost > 0 && p.domains.length > 0;
      case 'raid': return p.risks.length > 0 && p.assumptions.length > 0;
      case 'review': return /Approved|Submitted/.test(p.review.status);
      case 'export': return !!p.exported;
    }
  }

  function render() {
    var p = P(), r = p ? E.compute(CAT, p) : null;
    var side = '<h6>Workspace</h6>' +
      btnStep('home', '⌂', 'Opportunities', false) + btnStep('settings', '⚙', 'Effort catalogue & rates', false) + btnStep('guide', '?', 'How it works', false);
    side += '<h6>Presales pipeline</h6>';
    STEPS.forEach(function (s) { side += btnStep(s[0], s[1], s[2], !p, p && stepDone(s[0], p, r)); });
    document.getElementById('side').innerHTML = side;
    document.getElementById('opp').textContent = p ? (p.meta.customer || 'New customer') + ' — ' + (p.meta.opportunity || 'Untitled opportunity') + '  ·  ' + p.id : '';
    document.getElementById('kpichip').innerHTML = p && p.domains.length ? '<span>Estimate <b data-out="final">' + d1(r.final) + '</b> days</span><span>Price <b data-out="price">' + money(r.price, r.currency) + '</b></span><span><span class="pill ' + statusCls(p.review.status) + '">' + esc(p.review.status) + '</span></span>' : '';
    var v = VIEWS[S.view] || VIEWS.home;
    if (!p && STEPS.some(function (s) { return s[0] === S.view; })) S.view = 'home', v = VIEWS.home;
    document.getElementById('main').innerHTML = v(p, r);
    document.getElementById('main').scrollTop = S.keepScroll ? document.getElementById('main').scrollTop : 0;
    S.keepScroll = false;
  }
  function btnStep(id, n, label, disabled, done) {
    return '<button class="step' + (S.view === id ? ' active' : '') + (done ? ' done' : '') + '" data-action="go" data-arg="' + id + '"' + (disabled ? ' disabled' : '') + '><span class="n">' + (done ? '✓' : n) + '</span>' + esc(label) + '</button>';
  }
  function statusCls(s) { return s === 'Approved' || s === 'Submitted' ? 'ok' : s === 'Rejected' ? 'err' : s === 'In Review' ? 'warn' : 'acc'; }
  function head(title, desc, right) { return '<div class="page-h"><div><h1>' + title + '</h1>' + (desc ? '<p>' + desc + '</p>' : '') + '</div>' + (right ? '<div class="right">' + right + '</div>' : '') + '</div>'; }
  function nextBtn(id) {
    var i = STEPS.findIndex(function (s) { return s[0] === id; });
    var n = STEPS[i + 1];
    return n ? '<div class="flex" style="margin-top:6px"><span class="right"></span><button class="btn pri" data-action="go" data-arg="' + n[0] + '">Next: ' + esc(n[2]) + ' →</button></div>' : '';
  }
  function inp(path, val, o) {
    o = o || {};
    return '<input class="in' + (o.num ? ' num' : '') + (o.edit ? ' edit' : '') + '" ' + (o.type ? 'type="' + o.type + '"' : (o.num ? 'type="number" step="any"' : '')) +
      ' data-bind="' + esc(path) + '"' + (o.num ? ' data-num="1"' : '') + ' value="' + esc(val) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.style ? ' style="' + o.style + '"' : '') + '>';
  }
  function sel(path, val, opts, o) {
    o = o || {};
    return '<select class="in' + (o.edit ? ' edit' : '') + '" data-bind="' + esc(path) + '" data-rerender="1"' + (o.num ? ' data-num="1"' : '') + '>' +
      opts.map(function (x) { var v = Array.isArray(x) ? x[0] : x, l = Array.isArray(x) ? x[1] : x; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
  }
  function field(label, html, full) { return '<label class="f' + (full ? ' full' : '') + '">' + label + html + '</label>'; }

  // ---------- views ----------
  var VIEWS = {};

  VIEWS.home = function () {
    var list = Object.values(S.projects).sort(function (a, b) { return b.updated.localeCompare(a.updated); });
    var h = head('Opportunities', 'Every presales request — RFP, RFI, RFQ or a customer email — starts here. Data is stored only in this browser; export JSON to share with reviewers.',
      '<button class="btn" data-action="importJSON">Import project JSON</button><button class="btn" data-action="sample">Load sample RFP</button><button class="btn pri" data-action="newProject">+ New opportunity</button>');
    if (!list.length) return h + '<div class="card empty"><div class="big">No opportunities yet</div><p>Create a new opportunity, or load the sample WebLogic upgrade RFP to see the full flow end to end.</p><button class="btn" data-action="sample">Load sample RFP</button> <button class="btn pri" data-action="newProject">+ New opportunity</button></div>' + flowCard();
    h += '<div class="card"><table class="t"><thead><tr><th>ID</th><th>Customer</th><th>Opportunity</th><th>Technology</th><th>Due</th><th class="n">Estimate (days)</th><th class="n">Price</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>';
    list.forEach(function (p) {
      var r = E.compute(CAT, p);
      h += '<tr><td class="mono">' + esc(p.id) + '</td><td>' + esc(p.meta.customer) + '</td><td><a href="#" data-action="open" data-arg="' + p.id + '">' + esc(p.meta.opportunity || 'Untitled') + '</a></td><td>' + esc(p.domains.join(', ')) + '</td><td>' + esc(p.meta.dueDate) + '</td>' +
        '<td class="n">' + (p.domains.length ? d1(r.final) : '—') + '</td><td class="n">' + (p.domains.length ? money(r.price, r.currency) : '—') + '</td><td><span class="pill ' + statusCls(p.review.status) + '">' + esc(p.review.status) + '</span></td><td class="small muted">' + esc(p.updated.slice(0, 16).replace('T', ' ')) + '</td>' +
        '<td class="n"><button class="btn sm" data-action="open" data-arg="' + p.id + '">Open</button> <button class="btn sm" data-action="dup" data-arg="' + p.id + '">Copy</button> <button class="btn sm danger" data-action="del" data-arg="' + p.id + '">Delete</button></td></tr>';
    });
    return h + '</tbody></table></div>' + flowCard();
  };
  function flowCard() {
    return '<div class="card"><h3>The pipeline this tool follows</h3><div class="flow">' +
      '<div><b>1–2 · Qualify</b>Log the request, score Bid / No-Bid before spending effort.</div>' +
      '<div><b>3 · Analyse RFP</b>Upload PDF/Word/Excel. Requirements and sizing numbers are extracted with the sentence they came from.</div>' +
      '<div><b>4–5 · Scope</b>Confirm each sizing driver in discovery; anything unknown becomes a clarification question.</div>' +
      '<div><b>6–8 · Estimate</b>WBS × three-point (PERT) effort → P80 confidence + risk reserve → roles, cost, price.</div>' +
      '<div><b>9–10 · Govern</b>Quality gate, peer review, approvals, versioned SAE Excel and proposal.</div></div></div>';
  }

  VIEWS.guide = function () {
    return head('How it works', 'The method follows common industry practice for IT services estimation (bottom-up WBS, three-point PERT, statistical confidence, risk reserve), so every number can be explained to the customer and to delivery.') +
      '<div class="card"><h3>1 · Why the numbers are defensible</h3><ul>' +
      '<li><b>Traceable quantities.</b> Every quantity (servers, composites, TB…) has a <i>source</i>: the RFP sentence it was found in, a discovery answer, or a clarification. Defaults are flagged until confirmed.</li>' +
      '<li><b>Benchmarked unit effort.</b> Each WBS activity has Optimistic / Most-likely / Pessimistic days per unit, from the shared effort catalogue that your delivery team calibrates from past actuals.</li>' +
      '<li><b>PERT.</b> Expected effort = (O + 4M + P) / 6, standard deviation = (P − O) / 6 for each line.</li>' +
      '<li><b>Complexity factors.</b> Technical complexity, documentation quality, customer access, compliance and delivery model multiply the effort (e.g. High complexity × 1.25).</li>' +
      '<li><b>Confidence level.</b> Line uncertainties combine as √Σσ². The estimate is quoted at P80 by default: an 80% chance the work fits the effort.</li>' +
      '<li><b>Risk reserve.</b> For each identified risk, probability × impact days (expected monetary value, EMV) is added explicitly, not hidden in padding.</li>' +
      '<li><b>Quality gate.</b> Automatic checks (PM 8–15%, testing ≥ 12–15%, contingency 10–40%, unsourced drivers, wide ranges) plus a reviewer checklist and approval log.</li></ul></div>' +
      '<div class="card"><h3>2 · Roles in the process</h3><table class="t"><thead><tr><th>Stage</th><th>Who</th><th>Output</th></tr></thead><tbody>' +
      '<tr><td>Intake & Bid / No-Bid</td><td>Sales + Presales lead</td><td>Qualified opportunity, go decision</td></tr>' +
      '<tr><td>RFP analysis & requirements matrix</td><td>Presales consultant</td><td>Compliance matrix, sizing drivers</td></tr>' +
      '<tr><td>Discovery & clarifications</td><td>Presales + customer SMEs</td><td>Confirmed drivers, Q&A log</td></tr>' +
      '<tr><td>Estimate, roles & cost</td><td>Presales + Solution architect</td><td>WBS, P80 effort, resource plan, cost</td></tr>' +
      '<tr><td>Review</td><td>Delivery lead (peer), Commercial/Finance</td><td>Approved estimate & rate card</td></tr>' +
      '<tr><td>Submit</td><td>Sales</td><td>SAE Excel, proposal, SOW inputs</td></tr></tbody></table></div>' +
      '<div class="card"><h3>3 · Keeping estimates honest over time</h3><p>After each project, compare actual days per WBS line against the catalogue and update O/M/P under <b>Effort catalogue & rates</b>. Export the catalogue JSON and commit it to the website repo as <span class="mono">data/catalogue.json</span>. Every user who has not customised their own catalogue loads it automatically, so the whole team estimates from the same, improving baseline. (The catalogue holds only benchmark numbers — no customer data.)</p></div>';
  };

  VIEWS.intake = function (p) {
    var m = p.meta;
    var h = head('1 · Opportunity intake', 'Capture the request details and the technology areas in scope. This is your single source of truth for the bid.');
    h += '<div class="card"><h3>Request details</h3><div class="grid g4">' +
      field('Customer', inp('meta.customer', m.customer, { ph: 'e.g. Contoso Retail' })) +
      field('Opportunity name', inp('meta.opportunity', m.opportunity, { ph: 'e.g. WebLogic 12.2.1.4 upgrade' })) +
      field('Request type', sel('meta.type', m.type, ['RFP', 'RFI', 'RFQ', 'RFT', 'Customer email / call', 'Change request'])) +
      field('Customer reference no.', inp('meta.rfpRef', m.rfpRef)) +
      field('Issue date', inp('meta.issueDate', m.issueDate, { type: 'date' })) +
      field('Clarification deadline', inp('meta.qaDeadline', m.qaDeadline, { type: 'date' })) +
      field('Submission deadline', inp('meta.dueDate', m.dueDate, { type: 'date' })) +
      field('Industry', inp('meta.industry', m.industry, { ph: 'e.g. Retail, BFSI, Education' })) +
      field('Sales owner', inp('meta.salesOwner', m.salesOwner)) +
      field('Presales owner', inp('meta.presalesOwner', m.presalesOwner)) +
      field('Delivery lead (reviewer)', inp('meta.deliveryLead', m.deliveryLead)) +
      field('Currency', sel('meta.currency', m.currency, ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'AED', 'SGD', 'CAD'])) +
      field('Commercial model', sel('meta.contractType', m.contractType, ['Fixed Price', 'Time & Materials', 'Capped T&M', 'Managed Service'])) +
      '<label class="f full">Summary of the requirement<textarea class="in" data-bind="meta.description">' + esc(m.description) + '</textarea></label></div></div>';
    h += '<div class="card"><h3>Technology areas in scope <small>select one or more — this decides which WBS lines and sizing questions apply</small></h3><div class="domains">';
    ['MW', 'OCI', 'DB'].forEach(function (k) {
      var on = p.domains.indexOf(k) >= 0;
      h += '<button class="dom' + (on ? ' on' : '') + '" data-action="toggleDomain" data-arg="' + k + '"><b>' + (on ? '✓ ' : '') + esc(CAT.DOMAINS[k].name) + '</b><span>' + CAT.LINES.filter(function (l) { return l.domain === k; }).length + ' WBS activities · ' + CAT.DRIVERS.filter(function (d) { return d.domain === k; }).length + ' sizing questions</span></button>';
    });
    h += '</div></div>';
    return h + nextBtn('intake');
  };

  VIEWS.bid = function (p) {
    var b = E.bidScore(CAT, p);
    var h = head('2 · Bid / No-Bid qualification', 'Score the opportunity before investing presales effort. 1 = very weak, 5 = very strong. ≥ 70% Bid · 50–69% Bid with conditions · < 50% No-Bid.');
    h += '<div class="card"><table class="t"><thead><tr><th>Criterion</th><th class="n">Weight</th><th>Score (1–5)</th><th class="n">Weighted</th></tr></thead><tbody>';
    CAT.BID_CRITERIA.forEach(function (c) {
      var v = +p.bid.scores[c.key] || 0;
      h += '<tr><td>' + esc(c.label) + '</td><td class="n">' + c.weight + '%</td><td><div class="score">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="' + (v === n ? 'on' : '') + '" data-action="bidScore" data-arg="' + c.key + ':' + n + '">' + n + '</button>'; }).join('') + '</div></td><td class="n">' + d1(v / 5 * c.weight) + '</td></tr>';
    });
    h += '<tr class="tot"><td>Total</td><td class="n">100%</td><td></td><td class="n">' + b.pct + '%</td></tr></tbody></table>';
    h += '<div class="flex" style="margin-top:12px"><span class="big">' + b.pct + '%</span><span class="pill ' + (b.pct >= 70 ? 'ok' : b.pct >= 50 ? 'warn' : 'err') + '">' + (b.answered ? esc(b.decision) : 'Score all ' + CAT.BID_CRITERIA.length + ' criteria (' + b.count + ' done)') + '</span></div>';
    h += '<label class="f" style="margin-top:12px">Decision notes / conditions<textarea class="in" data-bind="bid.notes">' + esc(p.bid.notes) + '</textarea></label></div>';
    return h + nextBtn('bid');
  };

  VIEWS.rfp = function (p) {
    var h = head('3 · RFP documents & requirements', 'Upload the RFP pack (PDF, Word, Excel, text). Files are read inside your browser — nothing is uploaded to any server. The analysis finds requirements and sizing numbers, each with the sentence it came from.');
    h += '<div class="card"><div class="drop" id="drop"><b>Drop RFP files here</b> or <button class="btn sm" data-action="pickFiles">Choose files</button><div class="small" style="margin-top:6px">PDF · DOCX · XLSX/XLS/CSV · TXT/MD. Scanned (image-only) PDFs need OCR first.</div></div>';
    if (p.docs.length) {
      h += '<table class="t" style="margin-top:12px"><thead><tr><th>Document</th><th class="n">Characters</th><th>Loaded</th><th></th></tr></thead><tbody>' + p.docs.map(function (d, i) {
        return '<tr><td>' + esc(d.name) + '</td><td class="n">' + d.text.length.toLocaleString() + '</td><td class="small muted">' + esc(d.added) + '</td><td class="n"><button class="btn sm" data-action="viewDoc" data-arg="' + i + '">Preview</button> <button class="btn sm danger" data-action="delDoc" data-arg="' + i + '">Remove</button></td></tr>';
      }).join('') + '</tbody></table><div class="flex" style="margin-top:12px"><button class="btn pri" data-action="analyse">Analyse documents</button><span class="small muted">Re-run after adding documents.</span></div>';
    }
    if (S.preview !== undefined && p.docs[S.preview]) h += '<pre class="mono" style="white-space:pre-wrap;max-height:260px;overflow:auto;background:#f7f8fa;padding:10px;border-radius:6px;margin-top:10px">' + esc(p.docs[S.preview].text.slice(0, 20000)) + '</pre>';
    h += '</div>';

    var a = S.analysis;
    if (a) {
      h += '<div class="card"><h3>Analysis results</h3>';
      var sd = a.suggestedDomains.filter(function (d) { return p.domains.indexOf(d) < 0; });
      h += '<p class="small">Technology signals — Middleware: <b>' + a.domainScore.MW + '</b> · OCI: <b>' + a.domainScore.OCI + '</b> · Database: <b>' + a.domainScore.DB + '</b> mentions. ' +
        (sd.length ? '<button class="btn sm" data-action="applyDomains">Add suggested: ' + sd.join(', ') + '</button>' : '') + '</p>';
      var keys = Object.keys(a.drivers).filter(function (k) { var d = drv(k); return d && inDoms(p).indexOf(d.domain) >= 0; });
      var other = Object.keys(a.drivers).length - keys.length;
      h += '<h3 style="margin-top:14px">Sizing numbers found <small>' + keys.length + ' for selected technologies' + (other ? ' · ' + other + ' more for unselected areas' : '') + '</small></h3>';
      if (keys.length) {
        h += '<table class="t"><thead><tr><th>Driver</th><th class="n">Value</th><th>Evidence (RFP sentence)</th><th>Source</th></tr></thead><tbody>' + keys.map(function (k) {
          var x = a.drivers[k], d = drv(k);
          return '<tr><td>' + esc(d.label) + (x.conflict ? ' <span class="pill warn" title="Different values found: ' + esc(x.candidates.map(function (c) { return c.value; }).join(', ')) + '">check</span>' : '') + '</td><td class="n"><b>' + x.value + '</b> ' + esc(d.type === 'flag' ? (x.value ? '(yes)' : '(no)') : d.unit) + '</td><td class="ev">“' + esc(x.evidence) + '”</td><td class="small">' + esc(x.source) + '</td></tr>';
        }).join('') + '</tbody></table>';
      } else h += '<p class="muted">No quantities found for the selected technologies. Select the technology areas on step 1, or capture numbers in discovery.</p>';
      if (a.facts.length) h += '<h3 style="margin-top:14px">Facts detected</h3><ul class="small">' + a.facts.slice(0, 12).map(function (f) { return '<li><b>' + esc(f.type) + ':</b> ' + esc(f.value) + ' — <span class="muted">' + esc(f.evidence.slice(0, 140)) + '</span></li>'; }).join('') + '</ul>';
      h += '<div class="flex" style="margin-top:12px"><button class="btn pri" data-action="applyAnalysis">Apply: load ' + a.requirements.length + ' requirements + ' + keys.length + ' sizing numbers</button><span class="small muted">Requirements are added to the matrix below. Sizing numbers go to step 4 with source = RFP.</span></div></div>';
    }

    h += '<div class="card"><div class="flex"><h3 style="margin:0">Requirements traceability & compliance matrix <small>' + p.requirements.length + ' requirements</small></h3><span class="right"></span><button class="btn sm" data-action="addReq">+ Add requirement</button>' + (p.requirements.length ? '<button class="btn sm" data-action="allComply">Mark unanswered as Comply</button>' : '') + '</div>';
    if (p.requirements.length) {
      h += '<div class="scroll" style="margin-top:10px"><table class="t"><thead><tr><th>ID</th><th style="min-width:340px">Requirement</th><th>Category</th><th>Priority</th><th>Response</th><th>Response notes / how we meet it</th><th></th></tr></thead><tbody>' +
        p.requirements.map(function (q, i) {
          return '<tr><td class="mono">' + esc(q.id) + '</td><td><textarea class="in" style="min-height:44px" data-bind="requirements.' + i + '.text">' + esc(q.text) + '</textarea><div class="ev">' + esc(q.source || 'Manual') + '</div></td><td>' + esc(q.category) + '</td><td>' +
            sel('requirements.' + i + '.priority', q.priority, ['Mandatory', 'Desirable', 'Information']) + '</td><td>' + sel('requirements.' + i + '.response', q.response, [['', '— select —'], 'Comply', 'Partially comply', 'Not comply', 'Clarification raised', 'Noted']) +
            '</td><td>' + inp('requirements.' + i + '.notes', q.notes, { ph: 'Approach / reference' }) + '</td><td><button class="btn sm ghost" data-action="reqToClar" data-arg="' + i + '" title="Raise clarification">?</button><button class="btn sm ghost danger" data-action="delReq" data-arg="' + i + '">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>';
    } else h += '<p class="muted">No requirements yet. Analyse the RFP documents or add requirements manually.</p>';
    h += '</div>';
    return h + nextBtn('rfp');
  };

  VIEWS.scope = function (p) {
    var h = head('4 · Scoping & discovery', 'Confirm every sizing driver. Each value needs a source: RFP (with evidence), a discovery answer, or a customer clarification. Anything left on a default is flagged and should become a clarification question and an assumption.',
      '<button class="btn" data-action="genClar">Raise clarifications for all unconfirmed</button>');
    if (!p.domains.length) return h + '<div class="note warn">Select at least one technology area on step 1 first.</div>';
    inDoms(p).forEach(function (dk) {
      var ds = CAT.DRIVERS.filter(function (d) { return d.domain === dk; });
      if (!ds.length) return;
      h += '<div class="card"><h3>' + esc(CAT.DOMAINS[dk].name) + '</h3><table class="t"><thead><tr><th>Sizing driver</th><th class="n">Value</th><th>Unit</th><th>Source</th><th style="min-width:300px">Evidence / discovery note</th><th></th></tr></thead><tbody>';
      ds.forEach(function (d) {
        var v = p.drivers[d.key] || {};
        var src = v.source || 'Default';
        var hasQ = p.clarifications.some(function (c) { return c.driver === d.key; });
        var val = v.value !== undefined && v.value !== '' ? v.value : d.def;
        h += '<tr><td><b>' + esc(d.label) + '</b><div class="ev">' + esc(d.q) + '</div></td><td class="n">' + inp('drivers.' + d.key + '.value', val, { num: true, edit: true }) + '</td><td class="small">' + esc(d.unit) + '</td><td>' +
          sel('drivers.' + d.key + '.source', src, ['Default', 'Assumed', 'RFP', 'Discovery', 'Customer']) + (src === 'Default' || src === 'Assumed' ? (hasQ ? ' <span class="pill acc">Q raised</span>' : ' <span class="pill warn">unconfirmed</span>') : ' <span class="pill ok">sourced</span>') +
          '</td><td>' + inp('drivers.' + d.key + '.evidence', v.evidence || '', { ph: 'Quote the RFP line or the discovery answer' }) + '</td><td>' + (hasQ ? '' : '<button class="btn sm" data-action="raiseClar" data-arg="' + d.key + '">Raise Q</button>') + '</td></tr>';
      });
      h += '</tbody></table></div>';
    });
    var fac = E.factorValue(CAT, p.factors);
    h += '<div class="card"><h3>Complexity & environmental factors <small>combined multiplier × ' + d2(fac.value) + '</small></h3><div class="grid g5" style="grid-template-columns:repeat(5,minmax(0,1fr))">';
    CAT.FACTORS.forEach(function (f) {
      h += field(f.label + ' <span class="ev" style="font-weight:400">' + esc(f.help) + '</span>', sel('factors.' + f.key, (p.factors[f.key] || f.def), f.options.map(function (o) { return [o[0], o[0] + ' (× ' + o[1] + ')']; })));
    });
    h += '</div></div>';
    return h + nextBtn('scope');
  };

  VIEWS.clar = function (p) {
    var h = head('5 · Clarification questions', 'Questions to send to the customer before the clarification deadline. When an answer arrives, apply it to the sizing driver so the estimate updates and the source becomes “Customer”.',
      '<button class="btn" data-action="genClar">Raise for unconfirmed drivers</button><button class="btn" data-action="addClar">+ Add question</button><button class="btn" data-action="copyClar">Copy open questions</button>');
    if (!p.clarifications.length) return h + '<div class="card empty">No clarification questions yet.</div>' + nextBtn('clar');
    h += '<div class="card"><table class="t"><thead><tr><th>#</th><th style="min-width:320px">Question</th><th>Related driver</th><th>Raised</th><th>Status</th><th style="min-width:200px">Customer answer</th><th></th></tr></thead><tbody>';
    p.clarifications.forEach(function (c, i) {
      var d = c.driver && drv(c.driver);
      h += '<tr><td class="mono">Q' + (i + 1) + '</td><td><textarea class="in" style="min-height:44px" data-bind="clarifications.' + i + '.question">' + esc(c.question) + '</textarea>' + (c.ref ? '<div class="ev">Ref: ' + esc(c.ref) + '</div>' : '') + '</td><td class="small">' + (d ? esc(d.label) : '—') + '</td><td class="small">' + esc(c.raised) + '</td><td>' +
        sel('clarifications.' + i + '.status', c.status, ['Open', 'Sent', 'Answered']) + '</td><td>' + inp('clarifications.' + i + '.answer', c.answer || '', { ph: d ? 'e.g. ' + (d.type === 'flag' ? '1 (yes) / 0 (no)' : 'a number') : 'Answer' }) +
        '</td><td class="n">' + (d ? '<button class="btn sm" data-action="applyAnswer" data-arg="' + i + '">Apply to driver</button> ' : '') + '<button class="btn sm ghost danger" data-action="delClar" data-arg="' + i + '">✕</button></td></tr>';
    });
    return h + '</tbody></table></div>' + nextBtn('clar');
  };

  function kpis(r, p) {
    return '<div class="kpis">' +
      '<div class="kpi"><div class="l">P50 (expected)</div><div class="v" data-out="mean">' + d1(r.mean) + '</div><div class="s">person-days · σ <span data-out="sigma">' + d1(r.sigma) + '</span></div></div>' +
      '<div class="kpi"><div class="l">P' + r.confidence + ' confidence</div><div class="v" data-out="pconf">' + d1(r.pConf) + '</div><div class="s">P90 <span data-out="p90">' + d1(r.p90) + '</span></div></div>' +
      '<div class="kpi"><div class="l">Risk reserve (EMV)</div><div class="v" data-out="risk">' + d1(r.riskReserve) + '</div><div class="s">' + p.risks.length + ' risks · mgmt <span data-out="mgmt">' + d1(r.mgmtReserve) + '</span></div></div>' +
      '<div class="kpi hl"><div class="l">Final estimate</div><div class="v" data-out="final">' + d1(r.final) + '</div><div class="s">person-days · +<span data-out="cont">' + d1(r.contingencyPct) + '</span>% over P50</div></div>' +
      '<div class="kpi"><div class="l">Duration</div><div class="v"><span data-out="weeks">' + r.weeks + '</span> wks</div><div class="s">at ' + d2(r.fte) + ' FTE average</div></div>' +
      '<div class="kpi"><div class="l">Price (' + esc(r.currency) + ')</div><div class="v" data-out="price">' + money(r.price, r.currency) + '</div><div class="s">cost <span data-out="cost">' + money(r.cost, r.currency) + '</span></div></div></div>';
  }

  VIEWS.est = function (p, r) {
    var h = head('6 · Effort estimate (WBS × PERT)', 'Expected effort per line = Quantity × (O + 4M + P) / 6 × complexity factor. Yellow cells can be edited; changed O/M/P values are marked so reviewers can see where you moved away from the benchmark.',
      '<button class="btn" data-action="addLine">+ Custom line</button>');
    if (!p.domains.length) return h + '<div class="note warn">Select at least one technology area on step 1 first.</div>';
    h += kpis(r, p);
    h += '<div class="card"><div class="grid g4">' +
      field('Confidence level to quote', sel('settings.confidence', p.settings.confidence, [[50, 'P50 — 50% (aggressive)'], [70, 'P70 — 70%'], [80, 'P80 — 80% (recommended)'], [90, 'P90 — 90% (conservative)']], { num: true })) +
      field('Management reserve %', inp('settings.mgmtReservePct', p.settings.mgmtReservePct, { num: true, edit: true })) +
      field('Average team size (FTE) for duration', inp('settings.teamFTE', p.settings.teamFTE, { num: true, edit: true })) +
      field('Complexity multiplier (from step 4)', '<div class="in" style="background:#f7f8fa">× ' + d2(r.factor.value) + '</div>') + '</div></div>';
    h += '<div class="card"><div class="scroll" style="max-height:none"><table class="t"><thead><tr><th></th><th>ID</th><th style="min-width:280px">Activity</th><th>Driver</th><th class="n">Qty</th><th class="n">O</th><th class="n">M</th><th class="n">P</th><th class="n">PERT /unit</th><th class="n">Effort</th><th class="n">σ</th></tr></thead><tbody>';
    CAT.PHASES.forEach(function (ph) {
      var ls = r.lines.filter(function (l) { return l.phase === ph; });
      if (!ls.length) return;
      var pe = ls.reduce(function (a, l) { return a + l.effort; }, 0);
      h += '<tr class="grp"><td colspan="9">' + esc(ph) + '</td><td class="n">' + d1(pe) + '</td><td></td></tr>';
      ls.forEach(function (l) {
        var base = l.custom ? 'customLines.' + p.customLines.findIndex(function (c) { return c.id === l.id; }) : 'lineOverrides.' + l.id;
        var dl = l.driver === 'FIXED' ? 'Fixed (1)' : l.driver === 'PCT' ? '% of delivery' : l.driver === 'CUSTOM' ? 'Custom qty' : (drv(l.driver) ? drv(l.driver).label : l.driver);
        var src = l.driver !== 'FIXED' && l.driver !== 'PCT' && l.driver !== 'CUSTOM' ? ((p.drivers[l.driver] || {}).source || 'Default') : '';
        var pct = l.driver === 'PCT';
        h += '<tr class="' + (l.include ? '' : 'off') + '"><td><input type="checkbox" data-action="toggleLine" data-arg="' + l.id + '"' + (l.include ? ' checked' : '') + ' title="Include in estimate"></td><td class="mono">' + esc(l.id) + '</td><td>' + (l.custom ? inp(base + '.activity', l.activity) + '<div class="flex" style="margin-top:4px;flex-wrap:nowrap">' + sel(base + '.phase', l.phase, CAT.PHASES.slice(0, 7)) + inp(base + '.basis', l.basis, { ph: 'Basis of estimate' }) + '<button class="btn sm ghost danger" data-action="delLine" data-arg="' + l.id + '">✕</button></div>' : esc(l.activity)) +
          (l.overridden ? ' <span class="pill warn">changed</span> <button class="btn sm ghost" data-action="resetLine" data-arg="' + l.id + '">reset</button>' : '') + (l.custom ? '' : '<div class="ev">' + esc(l.basis || '') + '</div>') + '</td><td class="small">' + esc(dl) +
          (src ? ' <span class="pill ' + (src === 'Default' || src === 'Assumed' ? 'warn' : 'ok') + '">' + esc(src) + '</span>' : '') + '</td><td class="n">' + (l.custom ? inp(base + '.qty', l.qty, { num: true, edit: true }) : '<span data-out="line:' + l.id + ':qty">' + d2(l.qty) + '</span>') + '</td>' +
          ['o', 'm', 'p'].map(function (k) { return '<td class="n">' + inp(base + '.' + k, pct ? l[k] : l[k], { num: true, edit: true }) + '</td>'; }).join('') +
          '<td class="n" data-out="line:' + l.id + ':pert">' + (pct ? d1(l.pert * 100) + '%' : d2(l.pert)) + '</td><td class="n"><b data-out="line:' + l.id + ':effort">' + d1(l.effort) + '</b></td><td class="n small" data-out="line:' + l.id + ':sigma">' + d1(l.sigma) + '</td></tr>';
      });
    });
    h += '<tr class="tot"><td colspan="9">Total expected effort (P50)</td><td class="n" data-out="mean">' + d1(r.mean) + '</td><td class="n" data-out="sigma">' + d1(r.sigma) + '</td></tr></tbody></table></div></div>';
    h += '<div class="card"><h3>Effort by phase <small>final estimate, contingency spread pro-rata</small></h3><div class="bars">' + r.phases.map(function (ph) {
      var mx = Math.max.apply(null, r.phases.map(function (x) { return x.final; }));
      return '<div class="row"><span>' + esc(ph.phase) + '</span><div class="track"><div class="fill" style="width:' + (ph.final / mx * 100) + '%"></div></div><span class="n" style="text-align:right">' + d1(ph.final) + ' d</span></div>';
    }).join('') + '</div></div>';
    h += '<div class="card"><h3>Build-up from P50 to the quoted figure</h3><table class="t" style="max-width:640px"><tbody>' +
      '<tr><td>Expected effort (P50) = Σ line effort</td><td class="n" data-out="mean">' + d1(r.mean) + '</td></tr>' +
      '<tr><td>+ Estimate uncertainty to P' + r.confidence + ' = z(' + d2(r.z) + ') × σ(' + d1(r.sigma) + ')</td><td class="n">' + d1(r.pConf - r.mean) + '</td></tr>' +
      '<tr><td>+ Risk reserve = Σ probability × impact (step 8)</td><td class="n" data-out="risk">' + d1(r.riskReserve) + '</td></tr>' +
      '<tr><td>+ Management reserve (' + d2(p.settings.mgmtReservePct) + '%)</td><td class="n" data-out="mgmt">' + d1(r.mgmtReserve) + '</td></tr>' +
      '<tr class="tot"><td>Final estimate (rounded up to 0.5 day)</td><td class="n" data-out="final">' + d1(r.final) + '</td></tr></tbody></table></div>';
    return h + nextBtn('est');
  };

  VIEWS.cost = function (p, r) {
    var h = head('7 · Resources, cost & price', 'Role effort comes from the role mix on each WBS line. Rates here apply to this opportunity only; defaults live in the rate card under settings.');
    if (!p.domains.length) return h + '<div class="note warn">Select at least one technology area on step 1 first.</div>';
    h += kpis(r, p);
    h += '<div class="card"><table class="t"><thead><tr><th>Role</th><th class="n">Base days</th><th class="n">Share</th><th class="n">Final days</th><th class="n">Day rate (' + esc(r.currency) + ')</th><th class="n">Cost</th><th class="n">Avg FTE over ' + r.weeks + ' wks</th></tr></thead><tbody>';
    r.roles.forEach(function (ro) {
      h += '<tr><td>' + esc(ro.name) + '</td><td class="n">' + d1(ro.base) + '</td><td class="n">' + d1(ro.share * 100) + '%</td><td class="n" data-out="role:' + ro.code + ':final">' + d1(ro.final) + '</td><td class="n">' + inp('settings.rates.' + ro.code, ro.rate, { num: true, edit: true, style: 'width:90px' }) + '</td><td class="n" data-out="role:' + ro.code + ':cost">' + money(ro.cost, r.currency) + '</td><td class="n">' + d2(ro.final / Math.max(r.weeks * 5, 1)) + '</td></tr>';
    });
    h += '<tr class="tot"><td>Total</td><td class="n">' + d1(r.mean) + '</td><td class="n">100%</td><td class="n" data-out="final">' + d1(r.final) + '</td><td class="n">' + money(r.final ? r.cost / r.final : 0, r.currency) + ' blended</td><td class="n" data-out="cost">' + money(r.cost, r.currency) + '</td><td class="n">' + d2(r.final / Math.max(r.weeks * 5, 1)) + '</td></tr></tbody></table></div>';
    h += '<div class="card"><div class="grid g4">' + field('Target gross margin %', inp('settings.marginPct', p.settings.marginPct, { num: true, edit: true })) +
      field('Cost', '<div class="in" style="background:#f7f8fa" data-out="cost">' + money(r.cost, r.currency) + '</div>') +
      field('Indicative price = cost ÷ (1 − margin)', '<div class="in" style="background:#f7f8fa;font-weight:700" data-out="price">' + money(r.price, r.currency) + '</div>') +
      field('Commercial model', '<div class="in" style="background:#f7f8fa">' + esc(p.meta.contractType) + '</div>') + '</div>' +
      '<p class="small muted" style="margin-top:10px">Indicative only. Final pricing, discounts and payment milestones are owned by Sales / Commercial and should be approved in step 9.</p></div>';
    return h + nextBtn('cost');
  };

  VIEWS.raid = function (p, r) {
    var h = head('8 · Risks, assumptions & exclusions', 'Risks are quantified (probability × impact in days) and added as an explicit risk reserve. Assumptions and exclusions go straight into the SAE and proposal — they protect delivery.');
    h += '<div class="card"><div class="flex"><h3 style="margin:0">Risk register <small>reserve = <span data-out="risk">' + d1(r.riskReserve) + '</span> days</small></h3><span class="right"></span><button class="btn sm" data-action="addRisk">+ Add risk</button></div>' +
      '<table class="t" style="margin-top:10px"><thead><tr><th>#</th><th style="min-width:260px">Risk</th><th class="n">Probability %</th><th class="n">Impact (days)</th><th class="n">EMV (days)</th><th style="min-width:220px">Mitigation</th><th>Owner</th><th></th></tr></thead><tbody>' +
      p.risks.map(function (x, i) {
        return '<tr><td class="mono">R' + (i + 1) + '</td><td>' + inp('risks.' + i + '.risk', x.risk) + '</td><td class="n">' + inp('risks.' + i + '.prob', x.prob, { num: true, edit: true }) + '</td><td class="n">' + inp('risks.' + i + '.impact', x.impact, { num: true, edit: true }) +
          '</td><td class="n" data-out="risk:' + i + '">' + d1((+x.prob || 0) / 100 * (+x.impact || 0)) + '</td><td>' + inp('risks.' + i + '.mitigation', x.mitigation) + '</td><td>' + inp('risks.' + i + '.owner', x.owner || '', { style: 'width:110px' }) + '</td><td><button class="btn sm ghost danger" data-action="delRisk" data-arg="' + i + '">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    function list(name, title, arr) {
      return '<div class="card"><div class="flex"><h3 style="margin:0">' + title + ' <small>' + arr.length + '</small></h3><span class="right"></span><button class="btn sm" data-action="addItem" data-arg="' + name + '">+ Add</button></div>' +
        arr.map(function (a, i) { return '<div class="flex" style="margin-top:8px;flex-wrap:nowrap"><span class="mono" style="width:34px">' + (name === 'assumptions' ? 'A' : 'E') + (i + 1) + '</span><textarea class="in" style="min-height:38px" data-bind="' + name + '.' + i + '">' + esc(a) + '</textarea><button class="btn sm ghost danger" data-action="delItem" data-arg="' + name + ':' + i + '">✕</button></div>'; }).join('') + '</div>';
    }
    var openQ = p.clarifications.filter(function (c) { return c.status !== 'Answered'; });
    if (openQ.length) h += '<div class="note warn">' + openQ.length + ' clarification(s) are still open. <button class="btn sm" data-action="clarToAssump">Add them as assumptions</button></div>';
    h += list('assumptions', 'Assumptions', p.assumptions) + list('exclusions', 'Exclusions / out of scope', p.exclusions);
    return h + nextBtn('raid');
  };

  VIEWS.review = function (p, r) {
    var h = head('9 · Review & approval', 'Quality gate before anything goes to the customer: automatic checks, a reviewer checklist, approvals and saved versions.');
    h += '<div class="grid g2"><div class="card"><h3>Automatic quality checks</h3><ul class="checks">' + r.checks.map(function (c) { return '<li><span class="dot ' + c.level + '"></span><span>' + esc(c.msg) + '</span></li>'; }).join('') + '</ul></div>';
    h += '<div class="card"><h3>Reviewer checklist</h3><ul class="checks">' + CAT.REVIEW_CHECKLIST.map(function (c, i) {
      return '<li><input type="checkbox" data-action="check" data-arg="' + i + '"' + (p.review.checklist[i] ? ' checked' : '') + '><span>' + esc(c) + '</span></li>';
    }).join('') + '</ul></div></div>';
    var done = CAT.REVIEW_CHECKLIST.filter(function (c, i) { return p.review.checklist[i]; }).length;
    h += '<div class="card"><h3>Approval <small>current status: <span class="pill ' + statusCls(p.review.status) + '">' + esc(p.review.status) + '</span> · checklist ' + done + '/' + CAT.REVIEW_CHECKLIST.length + '</small></h3>' +
      '<div class="grid g4">' + field('Reviewer name', '<input class="in" id="apName" value="' + esc(p.meta.deliveryLead) + '">') +
      field('Reviewer role', '<select class="in" id="apRole"><option>Delivery Lead</option><option>Presales Manager</option><option>Commercial / Finance</option><option>Practice Director</option></select>') +
      field('Decision', '<select class="in" id="apDec"><option>Submit for review</option><option>Approve</option><option>Reject — rework</option><option>Mark as submitted to customer</option></select>') +
      field('Comment', '<input class="in" id="apCom" placeholder="What was reviewed / what must change">') + '</div>' +
      '<div class="flex" style="margin-top:10px"><button class="btn pri" data-action="approve">Record decision</button><span class="small muted">Approvals are recorded in the project and exported to the SAE. Export the project JSON to send it to a reviewer.</span></div>';
    if (p.review.approvals.length) h += '<table class="t" style="margin-top:12px"><thead><tr><th>Date</th><th>Name</th><th>Role</th><th>Decision</th><th>Version</th><th class="n">Estimate</th><th>Comment</th></tr></thead><tbody>' + p.review.approvals.map(function (a) {
      return '<tr><td class="small">' + esc(a.date) + '</td><td>' + esc(a.by) + '</td><td>' + esc(a.role) + '</td><td>' + esc(a.decision) + '</td><td>v' + esc(a.version) + '</td><td class="n">' + d1(a.final) + '</td><td>' + esc(a.comment) + '</td></tr>';
    }).join('') + '</tbody></table>';
    h += '</div>';
    h += '<div class="card"><div class="flex"><h3 style="margin:0">Versions</h3><span class="right"></span><input class="in" id="verLabel" style="width:260px" placeholder="Version label, e.g. After customer Q&A"><button class="btn" data-action="saveVersion">Save version</button></div>';
    if (p.versions.length) h += '<table class="t" style="margin-top:10px"><thead><tr><th>Version</th><th>Date</th><th>Label</th><th class="n">P50</th><th class="n">Final</th><th class="n">Price</th><th class="n">Δ vs current</th><th></th></tr></thead><tbody>' + p.versions.map(function (v, i) {
      var dlt = r.final - v.final;
      return '<tr><td>v' + v.v + '</td><td class="small">' + esc(v.date) + '</td><td>' + esc(v.label) + '</td><td class="n">' + d1(v.mean) + '</td><td class="n">' + d1(v.final) + '</td><td class="n">' + money(v.price, r.currency) + '</td><td class="n">' + (dlt >= 0 ? '+' : '') + d1(dlt) + ' d</td><td class="n"><button class="btn sm" data-action="restoreVersion" data-arg="' + i + '">Restore</button></td></tr>';
    }).join('') + '</tbody></table>';
    else h += '<p class="muted small" style="margin-top:8px">Save a version before each review and before submission, so you can show how the estimate changed and why.</p>';
    return h + '</div>' + nextBtn('review');
  };

  VIEWS.export = function (p, r) {
    var h = head('10 · Export & submit', 'Generate the deliverables. The Excel SAE keeps live formulas, so reviewers can change a quantity or O/M/P value and every total recalculates.');
    if (!/Approved|Submitted/.test(p.review.status)) h += '<div class="note warn">This estimate is <b>' + esc(p.review.status) + '</b>. Outputs are marked DRAFT until it is approved in step 9.</div>';
    h += '<div class="grid g3">' +
      '<div class="card"><h3>SAE estimate workbook (.xlsx)</h3><p class="small muted">Summary · Inputs & traceability · WBS (PERT formulas) · Resources & cost · Risks · Assumptions & exclusions · Requirements matrix · Clarifications · Bid / No-Bid · Approval log.</p><button class="btn pri" data-action="exportXlsx">Download Excel SAE</button></div>' +
      '<div class="card"><h3>Proposal summary (print / PDF)</h3><p class="small muted">Customer-facing summary: understanding, scope, approach by phase, team, timeline, commercials, assumptions and exclusions. Opens a print view — choose “Save as PDF”.</p><button class="btn pri" data-action="proposal">Open proposal summary</button></div>' +
      '<div class="card"><h3>Project file (.json)</h3><p class="small muted">The complete opportunity — send it to a reviewer to import, or keep it as a backup. Store it in your team\'s private storage (SharePoint / OneDrive / private repo) — never in the public website repo, as it contains customer data.</p><button class="btn pri" data-action="exportJSON">Download project JSON</button></div></div>';
    h += '<div class="card"><h3>Before you send</h3><ul class="checks">' + r.checks.map(function (c) { return '<li><span class="dot ' + c.level + '"></span><span>' + esc(c.msg) + '</span></li>'; }).join('') + '</ul></div>';
    return h;
  };

  VIEWS.settings = function () {
    var h = head('Effort catalogue & rate card', 'The shared baseline every estimate uses. Calibrate O/M/P per unit from past project actuals, then export the catalogue and share it so the whole team estimates the same way. Changes apply to all opportunities in this browser.',
      '<button class="btn" data-action="loadTeamCat">Load team catalogue (data/catalogue.json)</button><button class="btn" data-action="importCat">Import catalogue</button><button class="btn" data-action="exportCat">Export catalogue</button><button class="btn danger" data-action="resetCat">Reset to defaults</button>');
    h += '<div class="note">Catalogue version <b>' + esc(CAT.version) + '</b>. Default values are starter benchmarks — validate them with your delivery leads before using them for customer quotes.</div>';
    h += '<div class="card"><h3>Default rate card <small>day rates, used for new opportunities</small></h3><div class="grid g5" style="grid-template-columns:repeat(5,minmax(0,1fr))">' + CAT.ROLES.map(function (ro, i) {
      return field(esc(ro.name), '<input class="in num edit" type="number" data-cat="ROLES.' + i + '.rate" value="' + ro.rate + '">');
    }).join('') + '</div></div>';
    ['COMMON', 'MW', 'OCI', 'DB'].forEach(function (dk) {
      h += '<div class="card"><h3>' + esc(CAT.DOMAINS[dk].name) + '</h3><table class="t"><thead><tr><th>ID</th><th>Phase</th><th style="min-width:280px">Activity</th><th>Driver</th><th class="n">O</th><th class="n">M</th><th class="n">P</th><th>Role mix (PM/SA/SC/C/QA)</th></tr></thead><tbody>';
      CAT.LINES.forEach(function (l, i) {
        if (l.domain !== dk) return;
        var d = drv(l.driver);
        h += '<tr><td class="mono">' + esc(l.id) + '</td><td class="small">' + esc(l.phase) + '</td><td><input class="in" data-cat="LINES.' + i + '.activity" value="' + esc(l.activity) + '"></td><td class="small">' + esc(d ? d.label : l.driver) + '</td>' +
          ['o', 'm', 'p'].map(function (k) { return '<td class="n"><input class="in num edit" type="number" step="any" data-cat="LINES.' + i + '.' + k + '" value="' + l[k] + '"></td>'; }).join('') +
          '<td class="small mono">' + ['PM', 'SA', 'SC', 'C', 'QA'].map(function (k) { return Math.round((l.roles[k] || 0) * 100); }).join(' / ') + '</td></tr>';
      });
      h += '</tbody></table>';
      var ds = CAT.DRIVERS.map(function (d, i) { return [d, i]; }).filter(function (x) { return x[0].domain === dk; });
      if (ds.length) h += '<div class="small muted" style="margin:12px 0 6px">Default driver values (used until the driver is confirmed):</div><div class="grid g4">' + ds.map(function (x) { return field(esc(x[0].label), '<input class="in num" type="number" step="any" data-cat="DRIVERS.' + x[1] + '.def" value="' + x[0].def + '">'); }).join('') + '</div>';
      h += '</div>';
    });
    return h;
  };

  // ---------- outputs refresh (no full re-render while typing) ----------
  function refreshOutputs() {
    var p = P(); if (!p) return;
    var r = E.compute(CAT, p), o = {};
    o.mean = d1(r.mean); o.sigma = d1(r.sigma); o.pconf = d1(r.pConf); o.p90 = d1(r.p90); o.risk = d1(r.riskReserve); o.mgmt = d1(r.mgmtReserve);
    o.final = d1(r.final); o.cont = d1(r.contingencyPct); o.weeks = r.weeks; o.cost = money(r.cost, r.currency); o.price = money(r.price, r.currency);
    r.lines.forEach(function (l) { o['line:' + l.id + ':effort'] = d1(l.effort); o['line:' + l.id + ':sigma'] = d1(l.sigma); o['line:' + l.id + ':qty'] = d2(l.qty); o['line:' + l.id + ':pert'] = l.driver === 'PCT' ? d1(l.pert * 100) + '%' : d2(l.pert); });
    r.roles.forEach(function (ro) { o['role:' + ro.code + ':final'] = d1(ro.final); o['role:' + ro.code + ':cost'] = money(ro.cost, r.currency); });
    p.risks.forEach(function (x, i) { o['risk:' + i] = d1((+x.prob || 0) / 100 * (+x.impact || 0)); });
    document.querySelectorAll('[data-out]').forEach(function (el) { var k = el.getAttribute('data-out'); if (o[k] !== undefined) el.textContent = o[k]; });
  }

  // ---------- events ----------
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.cat !== undefined) { setPath(CAT, t.dataset.cat, t.type === 'number' ? +t.value : t.value); lsSet(LS_C, JSON.stringify(CAT, rxReplacer)); return; }
    if (!t.dataset.bind || !P() || t.tagName === 'SELECT') return;
    var v = t.dataset.num ? (t.value === '' ? '' : +t.value) : t.value;
    setPath(P(), t.dataset.bind, v);
    // typing a driver value marks it as discovery-confirmed if it was a default
    var m = t.dataset.bind.match(/^drivers\.(\w+)\.value$/);
    if (m) { var dv = P().drivers[m[1]]; if (!dv.source || dv.source === 'Default') { dv.source = 'Discovery'; S.dirtySource = true; } }
    touch(); refreshOutputs();
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.tagName === 'SELECT' && t.dataset.bind && P()) {
      setPath(P(), t.dataset.bind, t.dataset.num ? +t.value : t.value); touch(); S.keepScroll = true; keepScrollRender();
    } else if (S.dirtySource) { S.dirtySource = false; keepScrollRender(); }
  });
  function keepScrollRender() { var m = document.getElementById('main'), y = m.scrollTop; render(); m.scrollTop = y; }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    if (t.tagName === 'A') e.preventDefault();
    var fn = ACT[t.dataset.action];
    if (fn) fn(t.dataset.arg, t, e);
  });

  var ACT = {
    go: function (v) { S.view = v; S.preview = undefined; render(); },
    newProject: function () { var p = newProject(); S.projects[p.id] = p; S.cur = p.id; S.view = 'intake'; S.analysis = null; save(); render(); },
    open: function (id) { S.cur = id; S.view = 'intake'; S.analysis = null; save(); render(); },
    dup: function (id) { var c = structuredClone(S.projects[id]); c.id = uid('OPP-'); c.meta.opportunity += ' (copy)'; c.review = { checklist: {}, status: 'Draft', approvals: [] }; c.versions = []; c.updated = new Date().toISOString(); S.projects[c.id] = c; save(); render(); },
    del: function (id) { if (!window.confirm('Delete this opportunity from this browser? Export it first if you need a copy.')) return; delete S.projects[id]; if (S.cur === id) S.cur = null; save(); render(); },
    toggleDomain: function (d) {
      var p = P(), i = p.domains.indexOf(d);
      if (i >= 0) p.domains.splice(i, 1); else { p.domains.push(d); addDomainDefaults(p, d); }
      touch(); keepScrollRender();
    },
    bidScore: function (a) { var x = a.split(':'); P().bid.scores[x[0]] = +x[1]; touch(); keepScrollRender(); },
    pickFiles: function () { document.getElementById('fileIn').click(); },
    viewDoc: function (i) { S.preview = S.preview === +i ? undefined : +i; keepScrollRender(); },
    delDoc: function (i) { P().docs.splice(+i, 1); S.analysis = null; touch(); keepScrollRender(); },
    analyse: function () {
      var p = P();
      S.analysis = X.analyse(p.docs, CAT);
      p.facts = S.analysis.facts;
      toast('Found ' + S.analysis.requirements.length + ' requirements and ' + Object.keys(S.analysis.drivers).length + ' sizing numbers');
      touch(); keepScrollRender();
    },
    applyDomains: function () { var p = P(); S.analysis.suggestedDomains.forEach(function (d) { if (p.domains.indexOf(d) < 0) { p.domains.push(d); addDomainDefaults(p, d); } }); touch(); keepScrollRender(); },
    applyAnalysis: function () {
      var p = P(), a = S.analysis, n = 0;
      var manual = p.requirements.filter(function (q) { return !q.auto; });
      var prev = {}; p.requirements.forEach(function (q) { if (q.auto) prev[q.text] = q; });
      p.requirements = a.requirements.map(function (q) { var o = prev[q.text]; return Object.assign(q, { auto: true }, o ? { response: o.response, notes: o.notes, priority: o.priority } : {}); }).concat(manual);
      Object.keys(a.drivers).forEach(function (k) {
        var d = drv(k); if (!d || inDoms(p).indexOf(d.domain) < 0) return;
        var cur = p.drivers[k];
        if (cur && (cur.source === 'Discovery' || cur.source === 'Customer')) return; // never overwrite confirmed values
        p.drivers[k] = { value: a.drivers[k].value, source: 'RFP', evidence: a.drivers[k].evidence + ' [' + a.drivers[k].source + ']' };
        n++;
      });
      toast('Loaded ' + a.requirements.length + ' requirements and ' + n + ' sizing numbers');
      touch(); keepScrollRender();
    },
    addReq: function () { var p = P(); p.requirements.push({ id: 'REQ-M' + String(p.requirements.filter(function (q) { return !q.auto; }).length + 1).padStart(2, '0'), text: '', source: 'Manual', category: 'Functional / Technical', priority: 'Mandatory', response: '', notes: '' }); touch(); keepScrollRender(); },
    delReq: function (i) { P().requirements.splice(+i, 1); touch(); keepScrollRender(); },
    allComply: function () { P().requirements.forEach(function (q) { if (!q.response) q.response = 'Comply'; }); touch(); keepScrollRender(); },
    reqToClar: function (i) { var p = P(), q = p.requirements[+i]; p.clarifications.push({ question: 'Please clarify: ' + q.text, driver: '', ref: q.id, raised: today(), status: 'Open', answer: '' }); q.response = q.response || 'Clarification raised'; toast('Clarification raised for ' + q.id); touch(); keepScrollRender(); },
    raiseClar: function (k) { raise(k); touch(); keepScrollRender(); },
    genClar: function () {
      var p = P(), n = 0;
      CAT.DRIVERS.forEach(function (d) {
        if (inDoms(p).indexOf(d.domain) < 0) return;
        var v = p.drivers[d.key], src = v && v.source;
        if (src === 'RFP' || src === 'Discovery' || src === 'Customer') return;
        if (raise(d.key)) n++;
      });
      toast(n ? n + ' clarification question(s) raised' : 'Nothing to raise — all drivers are confirmed or already have a question');
      touch(); keepScrollRender();
    },
    addClar: function () { P().clarifications.push({ question: '', driver: '', raised: today(), status: 'Open', answer: '' }); touch(); keepScrollRender(); },
    delClar: function (i) { P().clarifications.splice(+i, 1); touch(); keepScrollRender(); },
    applyAnswer: function (i) {
      var p = P(), c = p.clarifications[+i], d = drv(c.driver);
      var num = parseFloat(String(c.answer).replace(/,/g, '').match(/-?\d+(\.\d+)?/) || '');
      if (d.type === 'flag' && /^\s*(yes|y|true|in scope)\b/i.test(c.answer)) num = 1;
      if (d.type === 'flag' && /^\s*(no|n|false|out of scope|not)\b/i.test(c.answer)) num = 0;
      if (isNaN(num)) { toast('Enter a number in the answer first (e.g. 16)'); return; }
      p.drivers[c.driver] = { value: num, source: 'Customer', evidence: 'Clarification Q' + (+i + 1) + ' answered ' + today() + ': ' + c.answer };
      c.status = 'Answered'; toast(d.label + ' set to ' + num + ' (source: Customer)'); touch(); keepScrollRender();
    },
    copyClar: function () {
      var p = P(), open = p.clarifications.filter(function (c) { return c.status !== 'Answered'; });
      var txt = 'Clarification questions — ' + p.meta.customer + ' / ' + p.meta.opportunity + (p.meta.rfpRef ? ' (' + p.meta.rfpRef + ')' : '') + '\n\n' + open.map(function (c, i) { return 'Q' + (i + 1) + '. ' + c.question; }).join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Copied ' + open.length + ' questions'); }, function () { download('Clarifications.txt', new Blob([txt], { type: 'text/plain' })); });
      open.forEach(function (c) { if (c.status === 'Open') c.status = 'Sent'; }); touch(); keepScrollRender();
    },
    toggleLine: function (id, t) {
      var p = P(), c = p.customLines.find(function (x) { return x.id === id; });
      if (c) c.include = t.checked; else { p.lineOverrides[id] = p.lineOverrides[id] || {}; p.lineOverrides[id].include = t.checked; }
      touch(); keepScrollRender();
    },
    delLine: function (id) { var p = P(); p.customLines = p.customLines.filter(function (c) { return c.id !== id; }); touch(); keepScrollRender(); },
    resetLine: function (id) { var ov = P().lineOverrides[id]; if (ov) { delete ov.o; delete ov.m; delete ov.p; } touch(); keepScrollRender(); },
    addLine: function () {
      var p = P(), n = p.customLines.length + 1;
      p.customLines.push({ id: 'CU-' + String(n).padStart(2, '0'), domain: 'CUSTOM', phase: CAT.PHASES[3], activity: 'Custom activity ' + n, driver: 'CUSTOM', qty: 1, o: 1, m: 2, p: 3, include: true, basis: 'Custom line — describe basis of estimate', roles: { PM: 0, SA: .1, SC: .5, C: .4, QA: 0 } });
      toast('Custom line added in “4. Build / Migrate” — rename it below'); touch(); keepScrollRender();
      setTimeout(function () { var el = document.querySelector('[data-out="line:CU-' + String(n).padStart(2, '0') + ':effort"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 50);
    },
    addRisk: function () { P().risks.push({ risk: '', prob: 20, impact: 2, mitigation: '', owner: '' }); touch(); keepScrollRender(); },
    delRisk: function (i) { P().risks.splice(+i, 1); touch(); keepScrollRender(); },
    addItem: function (n) { P()[n].push(''); touch(); keepScrollRender(); },
    delItem: function (a) { var x = a.split(':'); P()[x[0]].splice(+x[1], 1); touch(); keepScrollRender(); },
    clarToAssump: function () {
      var p = P();
      p.clarifications.filter(function (c) { return c.status !== 'Answered'; }).forEach(function (c) {
        var d = c.driver && drv(c.driver), v = d ? E.driverValue(CAT, p, d.key) : null;
        var t = d ? 'Pending customer confirmation: ' + d.label + ' is assumed to be ' + v + ' ' + (d.type === 'flag' ? (v ? '(in scope)' : '(not in scope)') : d.unit) + '.' : 'Pending customer confirmation: ' + c.question.replace(/^Please clarify:\s*/, '');
        if (p.assumptions.indexOf(t) < 0) p.assumptions.push(t);
      });
      toast('Open clarifications added as assumptions'); touch(); keepScrollRender();
    },
    check: function (i, t) { P().review.checklist[i] = t.checked; touch(); keepScrollRender(); },
    approve: function () {
      var p = P(), r = E.compute(CAT, p), dec = document.getElementById('apDec').value;
      var by = document.getElementById('apName').value.trim();
      if (!by) { toast('Enter the reviewer name'); return; }
      var status = { 'Submit for review': 'In Review', 'Approve': 'Approved', 'Reject — rework': 'Rejected', 'Mark as submitted to customer': 'Submitted' }[dec];
      if (status === 'Approved' && r.checks.some(function (c) { return c.level === 'err'; })) { toast('Resolve the red quality checks before approving'); return; }
      snapshot(p, r, dec);
      p.review.approvals.push({ date: new Date().toISOString().slice(0, 16).replace('T', ' '), by: by, role: document.getElementById('apRole').value, decision: dec, comment: document.getElementById('apCom').value, version: p.versions.length, final: r.final });
      p.review.status = status; toast('Recorded: ' + dec + ' (v' + p.versions.length + ' saved)'); touch(); keepScrollRender();
    },
    saveVersion: function () { var p = P(); snapshot(p, E.compute(CAT, p), document.getElementById('verLabel').value || 'Manual save'); toast('Saved v' + p.versions.length); touch(); keepScrollRender(); },
    restoreVersion: function (i) {
      var p = P(), v = p.versions[+i];
      if (!window.confirm('Restore v' + v.v + '? The current state is saved as a new version first.')) return;
      snapshot(p, E.compute(CAT, p), 'Auto-save before restoring v' + v.v);
      var keep = { versions: p.versions, review: p.review, docs: p.docs, id: p.id };
      var restored = Object.assign(structuredClone(v.data), keep);
      S.projects[p.id] = restored; touch(); keepScrollRender();
    },
    exportXlsx: function () {
      var p = P();
      window.PS_EXCEL.build(CAT, p, E.compute(CAT, p)).then(function (buf) {
        download('SAE_' + safeName(p.meta.customer) + '_' + safeName(p.meta.opportunity) + '_v' + (p.versions.length || 0) + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        p.exported = true; touch(); toast('Excel SAE downloaded'); keepScrollRender();
      }).catch(function (err) { console.error(err); toast('Excel export failed: ' + err.message); });
    },
    exportJSON: function () {
      var p = P(); p.exported = true; touch();
      download(safeName(p.id + '_' + p.meta.customer) + '.json', new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    },
    importJSON: function () { pickJSON(function (o) {
      if (!o || !o.meta || !o.id) { toast('This is not a project file'); return; }
      if (S.projects[o.id] && !window.confirm('A project with ID ' + o.id + ' exists here. Replace it with the imported copy?')) return;
      S.projects[o.id] = o; S.cur = o.id; S.view = 'review'; save(); toast('Imported ' + o.id); render();
    }); },
    exportCat: function () { download('catalogue_' + CAT.version + '.json', new Blob([JSON.stringify(CAT, rxReplacer, 2)], { type: 'application/json' })); },
    importCat: function () { pickJSON(function (o) {
      if (!o || !o.LINES || !o.DRIVERS) { toast('This is not a catalogue file'); return; }
      CAT = JSON.parse(JSON.stringify(o), rxReviver); lsSet(LS_C, JSON.stringify(CAT, rxReplacer)); toast('Catalogue ' + CAT.version + ' imported'); render();
    }, true); },
    resetCat: function () { if (!window.confirm('Reset the effort catalogue and rate card to the built-in defaults?')) return; CAT = structuredClone(DEFAULT_CAT); try { localStorage.removeItem(LS_C); } catch (e) {} toast('Catalogue reset'); render(); },
    proposal: function () { openProposal(); },
    loadTeamCat: function () { loadTeamCatalogue(true); },
    sample: function () {
      fetch('samples/Sample_RFP_Middleware_Upgrade.txt').then(function (r) { if (!r.ok) throw new Error(); return r.text(); }).then(function (txt) {
        var p = newProject();
        Object.assign(p.meta, { customer: 'Contoso Retail (sample)', opportunity: 'WebLogic 12.2.1.2 → 12.2.1.4 upgrade', rfpRef: 'RFP-2026-117', industry: 'Retail', qaDeadline: '2026-12-08', dueDate: '2026-12-15', description: 'Upgrade of WebLogic, SOA Suite, OSB and OHS across DEV, SIT, UAT and PROD.' });
        p.docs.push({ name: 'Sample_RFP_Middleware_Upgrade.txt', text: txt, added: today() });
        S.projects[p.id] = p; S.cur = p.id; S.view = 'rfp'; S.analysis = null; save(); render(); toast('Sample loaded — click “Analyse documents”');
      }).catch(function () { toast('Open the app from a web server (e.g. presales.lakhshit.in) to load the sample, or upload samples/Sample_RFP_Middleware_Upgrade.txt'); });
    }
  };

  function raise(key) {
    var p = P(), d = drv(key);
    if (p.clarifications.some(function (c) { return c.driver === key; })) return false;
    p.clarifications.push({ question: d.q, driver: key, raised: today(), status: 'Open', answer: '' });
    return true;
  }
  function snapshot(p, r, label) {
    var data = structuredClone(p); delete data.versions; delete data.docs;
    p.versions.push({ v: p.versions.length + 1, date: new Date().toISOString().slice(0, 16).replace('T', ' '), label: label, mean: r.mean, final: r.final, cost: r.cost, price: r.price, data: data });
  }
  function pickJSON(cb) {
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = function () { var f = i.files[0]; if (!f) return; f.text().then(function (t) { try { cb(JSON.parse(t)); } catch (e) { toast('Could not read JSON: ' + e.message); } }); };
    i.click();
  }

  // ---------- file reading (in-browser) ----------
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  function readFile(f) {
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') {
      return f.arrayBuffer().then(function (buf) { return pdfjsLib.getDocument({ data: buf }).promise; }).then(function (pdf) {
        var pages = [];
        for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var lines = [], last = null;
          tc.items.forEach(function (it) { var y = Math.round(it.transform[5]); if (last !== null && Math.abs(y - last) > 2) lines.push('\n'); lines.push(it.str + (it.hasEOL ? '\n' : ' ')); last = y; });
          return lines.join('').replace(/ +\n/g, '\n');
        }));
        return Promise.all(pages).then(function (t) { return t.join('\n\n'); });
      });
    }
    if (ext === 'docx') return f.arrayBuffer().then(function (buf) { return mammoth.extractRawText({ arrayBuffer: buf }); }).then(function (r) { return r.value; });
    if (['xlsx', 'xls', 'xlsm', 'csv', 'ods'].indexOf(ext) >= 0) {
      return f.arrayBuffer().then(function (buf) {
        var wb = XLSX.read(buf, { type: 'array' });
        return wb.SheetNames.map(function (n) {
          var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
          return '## Sheet: ' + n + '\n' + rows.map(function (r) { return r.filter(function (c) { return String(c).trim(); }).join(' | '); }).filter(Boolean).join('\n');
        }).join('\n\n');
      });
    }
    if (ext === 'doc') return Promise.reject(new Error('Old .doc format — save it as .docx or PDF first'));
    return f.text();
  }
  function handleFiles(files) {
    var p = P(); if (!p) return;
    var list = Array.from(files);
    toast('Reading ' + list.length + ' file(s)…');
    Promise.all(list.map(function (f) {
      return readFile(f).then(function (txt) {
        if (!txt || txt.trim().length < 20) throw new Error('no text found (scanned image?)');
        p.docs.push({ name: f.name, text: txt.slice(0, 400000), added: today() }); return null;
      }).catch(function (e) { return f.name + ': ' + e.message; });
    })).then(function (errs) {
      errs = errs.filter(Boolean);
      touch(); S.analysis = null; keepScrollRender();
      toast(errs.length ? 'Some files failed — ' + errs.join('; ') : 'Loaded — click “Analyse documents”');
    });
  }
  document.addEventListener('dragover', function (e) { var d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  document.addEventListener('dragleave', function (e) { var d = e.target.closest && e.target.closest('#drop'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', function (e) { var d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.remove('over'); handleFiles(e.dataTransfer.files); } });
  document.getElementById('fileIn').addEventListener('change', function (e) { handleFiles(e.target.files); e.target.value = ''; });

  // ---------- proposal (print view) ----------
  function openProposal() {
    var p = P(), r = E.compute(CAT, p), m = p.meta, draft = !/Approved|Submitted/.test(p.review.status);
    var scopeRows = CAT.DRIVERS.filter(function (d) { return inDoms(p).indexOf(d.domain) >= 0; }).map(function (d) {
      var v = E.driverValue(CAT, p, d.key), s = (p.drivers[d.key] || {}).source || 'Default';
      return '<tr><td>' + esc(d.label) + '</td><td class="n">' + (d.type === 'flag' ? (v ? 'Yes' : 'No') : esc(v) + ' ' + esc(d.unit)) + '</td><td>' + (s === 'Default' || s === 'Assumed' ? 'Assumed' : 'Confirmed (' + esc(s) + ')') + '</td></tr>';
    }).join('');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proposal — ' + esc(m.customer) + '</title><style>' +
      'body{font:11pt/1.5 Georgia,"Times New Roman",serif;color:#1b2430;max-width:780px;margin:30px auto;padding:0 24px}h1{font:700 22pt Arial,sans-serif;margin:0 0 4px;color:#0f5c8c}h2{font:700 13pt Arial,sans-serif;color:#0f5c8c;border-bottom:1.5px solid #0f5c8c;padding-bottom:3px;margin-top:26px}' +
      'table{width:100%;border-collapse:collapse;font:10pt Arial,sans-serif;margin:8px 0}th,td{border:1px solid #ccd3db;padding:5px 7px;text-align:left}th{background:#eef3f8}td.n,th.n{text-align:right}.meta{font:10pt Arial,sans-serif;color:#5a6573}.draft{color:#c2362b;font:700 10pt Arial;border:1.5px solid #c2362b;display:inline-block;padding:2px 8px;margin-bottom:10px}.tot td{font-weight:700;background:#f7f9fb}@media print{.noprint{display:none}}</style></head><body>' +
      '<p class="noprint"><button onclick="window.print()">Print / Save as PDF</button></p>' + (draft ? '<div class="draft">DRAFT — NOT APPROVED</div>' : '') +
      '<h1>' + esc(m.opportunity || 'Proposal') + '</h1><div class="meta">Prepared for <b>' + esc(m.customer) + '</b>' + (m.rfpRef ? ' · Reference ' + esc(m.rfpRef) : '') + ' · ' + today() + ' · ' + esc(p.id) + ' v' + p.versions.length + '</div>' +
      '<h2>1. Our understanding</h2><p>' + esc(m.description || 'Summary of the customer requirement.') + '</p>' +
      '<h2>2. Scope and sizing basis</h2><p>The estimate is based on the following sizing parameters. Items marked “Assumed” must be confirmed; changes will be managed through change control.</p><table><tr><th>Parameter</th><th class="n">Value</th><th>Status</th></tr>' + scopeRows + '</table>' +
      '<h2>3. Approach and effort by phase</h2><table><tr><th>Phase</th><th class="n">Effort (person-days)</th><th class="n">Indicative weeks</th></tr>' + r.phases.map(function (ph) { return '<tr><td>' + esc(ph.phase) + '</td><td class="n">' + d1(ph.final) + '</td><td class="n">' + d1(ph.final / (r.fte * 5)) + '</td></tr>'; }).join('') +
      '<tr class="tot"><td>Total</td><td class="n">' + d1(r.final) + '</td><td class="n">' + r.weeks + ' weeks</td></tr></table>' +
      '<h2>4. Team</h2><table><tr><th>Role</th><th class="n">Person-days</th></tr>' + r.roles.filter(function (x) { return x.final > 0.05; }).map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + d1(x.final) + '</td></tr>'; }).join('') + '</table>' +
      '<h2>5. Commercials</h2><table><tr><th>Commercial model</th><td>' + esc(m.contractType) + '</td></tr><tr><th>Total effort</th><td>' + d1(r.final) + ' person-days</td></tr><tr><th>Indicative price</th><td><b>' + money(r.price, r.currency) + '</b> (excluding taxes)</td></tr></table>' +
      '<h2>6. Assumptions</h2><ol>' + p.assumptions.filter(Boolean).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol>' +
      '<h2>7. Exclusions</h2><ol>' + p.exclusions.filter(Boolean).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ol>' +
      '<h2>8. Key risks and mitigations</h2><table><tr><th>Risk</th><th>Mitigation</th></tr>' + p.risks.filter(function (x) { return x.risk; }).map(function (x) { return '<tr><td>' + esc(x.risk) + '</td><td>' + esc(x.mitigation) + '</td></tr>'; }).join('') + '</table>' +
      '</body></html>';
    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else download('Proposal_' + safeName(m.customer) + '.html', new Blob([html], { type: 'text/html' }));
  }

  function loadTeamCatalogue(explicit) {
    return fetch('data/catalogue.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('not found'); return r.text(); }).then(function (t) {
      var o = JSON.parse(t, rxReviver);
      if (!o.LINES || !o.DRIVERS) throw new Error('invalid file');
      CAT = o; if (explicit) lsSet(LS_C, JSON.stringify(CAT, rxReplacer));
      toast('Team catalogue ' + CAT.version + ' loaded'); render();
    }).catch(function (e) { if (explicit) toast('No team catalogue found at data/catalogue.json (' + e.message + ')'); });
  }
  if (!lsGet(LS_C) && location.protocol.indexOf('http') === 0) loadTeamCatalogue(false);

  window.PS_APP = { state: S, render: render, getCat: function () { return CAT; } };
  render();
})();
