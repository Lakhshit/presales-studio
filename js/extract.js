/* ==========================================================================
   Presales Estimation Studio — RFP analysis (runs fully in the browser)
   1. Splits RFP text into statements and keeps the ones that are requirements
   2. Classifies each requirement (category, priority, domain)
   3. Finds sizing quantities (servers, composites, TB…) WITH the sentence they
      came from, so every number in the estimate is traceable to the RFP.
   ========================================================================== */
(function (root) {
  var WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

  function normNumbers(s) {
    return s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b(\s*\(\d+\))?/gi,
      function (m, w, paren) { return paren ? paren.replace(/[()\s]/g, '') : String(WORDNUM[w.toLowerCase()]); })
      .replace(/(\d),(\d{3})\b/g, '$1$2');
  }

  function statements(text) {
    var t = (text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    var out = [];
    t.split(/\n+/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      // split long lines into sentences, keep list items whole
      line.split(/(?<=[.;!?])\s+(?=[A-Z(•\-\d])/).forEach(function (s) {
        s = s.replace(/^[•\-–*•\s]+/, '').trim();
        if (s.length >= 12 && s.length <= 700) out.push(s);
      });
    });
    return out;
  }

  var REQ_RX = /\b(shall|must|should|is required|are required|required to|will be required|will need|needs? to|expected to|mandatory|is expected|are expected|the (?:vendor|bidder|supplier|respondent|contractor|partner) (?:will|is to|to)|please (?:provide|describe|confirm|explain)|provide details)\b/i;

  var CATS = [
    ['Security & Compliance', /secur|encrypt|iam\b|identity|access control|audit|complian|iso ?27001|soc ?2|gdpr|pci|hipaa|vulnerab|penetration|harden/i],
    ['Availability & DR', /availability|uptime|disaster|\bdr\b|\brto\b|\brpo\b|backup|restore|high availability|\bha\b|failover|data guard|clustering/i],
    ['Performance', /performance|response time|throughput|latency|load test|scalab|concurrent/i],
    ['Migration & Upgrade', /migrat|upgrade|cutover|lift and shift|rehost|move to|transition/i],
    ['Integration', /integrat|interface|api\b|soa|osb|service bus|middleware|message|queue/i],
    ['Support & SLA', /support|hypercare|warranty|\bsla\b|incident|24x7|24\/7|service level/i],
    ['Project & Governance', /project plan|status report|governance|milestone|timeline|schedule|steering|raci|project manage/i],
    ['Documentation & Training', /document|training|knowledge transfer|\bkt\b|runbook|handover/i],
    ['Commercial & Contract', /pric|payment|invoice|penalt|liabilit|insurance|contract|fixed fee|time and material|rate card/i],
    ['Testing', /test|uat|sit\b|regression|defect/i]
  ];

  var DOM_RX = {
    MW: /weblogic|\bwls\b|soa suite|\bsoa\b|\bosb\b|service bus|\bohs\b|oracle http server|fusion middleware|composite|managed server|j2ee|jee\b|\bjdk\b/i,
    OCI: /\boci\b|oracle cloud|landing zone|\bvcn\b|tenancy|compartment|lift and shift|fastconnect|compute instance|bastion|cloud guard/i,
    DB: /database|\brac\b|data guard|goldengate|golden gate|exadata|\b19c\b|\b23ai\b|\b12c\b|rman|data pump|\bzdm\b|autonomous|\bpdb/i
  };

  function categorise(s) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i][1].test(s)) return CATS[i][0];
    return 'Functional / Technical';
  }
  function priority(s) {
    if (/\b(shall|must|mandatory|is required|are required|required to)\b/i.test(s)) return 'Mandatory';
    if (/\b(should|desirable|preferred|nice to have|optional)\b/i.test(s)) return 'Desirable';
    return 'Information';
  }
  function domainsOf(s) { return Object.keys(DOM_RX).filter(function (k) { return DOM_RX[k].test(s); }); }

  function analyse(docs, cat) {
    var reqs = [], domainScore = { MW: 0, OCI: 0, DB: 0 }, drivers = {}, facts = [];
    var n = 0, seen = {};
    docs.forEach(function (doc) {
      var sts = statements(doc.text);
      sts.forEach(function (s, idx) {
        var ns = normNumbers(s);
        domainsOf(s).forEach(function (d) { domainScore[d]++; });
        var keyTxt = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (REQ_RX.test(s) && !seen[keyTxt]) {
          seen[keyTxt] = 1; n++;
          reqs.push({ id: 'REQ-' + String(n).padStart(3, '0'), text: s, source: doc.name + ' §' + (idx + 1), category: categorise(s),
            priority: priority(s), domain: domainsOf(s).join(', '), response: '', notes: '' });
        }
        // sizing drivers
        cat.DRIVERS.forEach(function (d) {
          d.patterns.forEach(function (rx) {
            var rxx = rx instanceof RegExp ? rx : new RegExp(rx, 'i');
            var m = ns.match(rxx);
            if (!m) return;
            var val = d.type === 'flag' ? 1 : parseFloat(m[1]);
            if (d.type !== 'flag' && (isNaN(val) || val <= 0 || val > 100000)) return;
            // flags: negative phrasing means not in scope
            if (d.type === 'flag' && /\b(not in scope|out of scope|excluded|not required|no need)\b/i.test(s)) val = 0;
            drivers[d.key] = drivers[d.key] || { candidates: [] };
            drivers[d.key].candidates.push({ value: val, evidence: s, source: doc.name + ' §' + (idx + 1) });
          });
        });
        // facts (versions, deadlines)
        var v = s.match(/\b(?:weblogic|wls|soa|osb|fmw|fusion middleware)[^.\n]{0,25}?\b(1[0-4]\.\d(?:\.\d){1,3})\b/i);
        if (v) facts.push({ type: 'Version', value: v[1], evidence: s });
        var dbv = s.match(/\b(1[1-9]c|2[1-3](?:ai|c))\b/i);
        if (dbv) facts.push({ type: 'DB version', value: dbv[1], evidence: s });
        var dl = s.match(/\b(?:deadline|due|submi(?:t|ssion)|go[- ]live|complete(?:d)? by|no later than)\b[^.\n]{0,40}?(\d{1,2}[\/\-. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-. ]\d{2,4}|[A-Za-z]{3,9} \d{1,2},? \d{4}|\d{1,2} [A-Za-z]{3,9} \d{4}|Q[1-4] ?\d{4})/i);
        if (dl) facts.push({ type: 'Date / deadline', value: dl[1], evidence: s });
      });
    });
    // pick a value per driver: most frequent, tie -> largest (conservative)
    Object.keys(drivers).forEach(function (k) {
      var c = drivers[k].candidates, freq = {};
      c.forEach(function (x) { freq[x.value] = (freq[x.value] || 0) + 1; });
      var best = Object.keys(freq).map(Number).sort(function (a, b) { return freq[b] - freq[a] || b - a; })[0];
      var ev = c.find(function (x) { return x.value === best; });
      drivers[k].value = best; drivers[k].evidence = ev.evidence; drivers[k].source = ev.source;
      drivers[k].conflict = Object.keys(freq).length > 1;
    });
    var fk = {}; facts = facts.filter(function (f) { var k = f.type + f.value; if (fk[k]) return false; fk[k] = 1; return true; });
    var top = Math.max(domainScore.MW, domainScore.OCI, domainScore.DB);
    var suggested = Object.keys(domainScore).filter(function (k) { return domainScore[k] >= 3 && domainScore[k] >= top * 0.2; });
    return { requirements: reqs, drivers: drivers, domainScore: domainScore, suggestedDomains: suggested, facts: facts };
  }

  var API = { analyse: analyse, statements: statements, normNumbers: normNumbers };
  root.PS_EXTRACT = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
