/* ==========================================================================
   Presales Estimation Studio — Effort Catalogue (default benchmarks)
   --------------------------------------------------------------------------
   Every WBS line = Quantity (driver) x PERT unit effort x complexity factors.
   O / M / P = Optimistic / Most-likely / Pessimistic person-days PER UNIT.
   These are STARTER BENCHMARKS. Calibrate them with your delivery team and
   past project actuals (Settings > Effort Catalogue), then export the JSON
   and commit it so the whole team estimates from the same baseline.
   ========================================================================== */
(function (root) {
  var ROLES = [
    { code: 'PM', name: 'Project Manager',     rate: 900 },
    { code: 'SA', name: 'Solution Architect',  rate: 1100 },
    { code: 'SC', name: 'Senior Consultant',   rate: 850 },
    { code: 'C',  name: 'Consultant',          rate: 600 },
    { code: 'QA', name: 'Test Lead / Analyst', rate: 550 }
  ];

  var PHASES = [
    '1. Initiate',
    '2. Discover & Assess',
    '3. Design',
    '4. Build / Migrate',
    '5. Test',
    '6. Deploy & Cutover',
    '7. Hypercare & Close',
    '8. Project Management'
  ];

  var DOMAINS = {
    COMMON: { code: 'COMMON', name: 'Common / Governance', always: true },
    MW:   { code: 'MW',   name: 'Middleware (WebLogic / SOA / OSB / OHS)' },
    OCI:  { code: 'OCI',  name: 'OCI Infrastructure (Landing Zone / Lift & Shift)' },
    DB:   { code: 'DB',   name: 'Oracle Database (Upgrade / Migration)' }
  };

  /* Drivers = the sizing questions. Each has extraction patterns used to
     find quantities in RFP text, and a clarification question used when the
     value is unknown. */
  var DRIVERS = [
    // ---- COMMON
    { key: 'hypercare_weeks', domain: 'COMMON', label: 'Hypercare period', unit: 'weeks', type: 'number', def: 2,
      q: 'What post go-live hypercare / warranty period is expected (in weeks)?',
      patterns: [/(\d+)\s*(?:-|\s)?\s*weeks?\s+(?:of\s+)?(?:hypercare|warranty|post[- ]go[- ]live support)/i, /(?:hypercare|warranty)[^.\n]{0,40}?(\d+)\s*weeks?/i] },
    { key: 'perf_testing', domain: 'COMMON', label: 'Performance testing in scope', unit: 'yes=1 / no=0', type: 'flag', def: 0,
      q: 'Is performance / load testing in scope for the vendor, and who provides the tooling and scripts?',
      patterns: [/(performance|load|stress)\s+test/i] },

    // ---- MIDDLEWARE
    { key: 'mw_envs', domain: 'MW', label: 'Environments (Dev/SIT/UAT/Prod…)', unit: 'count', type: 'number', def: 4,
      q: 'How many environments are in scope for the middleware work (e.g. DEV, SIT, UAT, PROD, DR)?',
      patterns: [/(\d+)\s+(?:[\w-]+\s+)?environments\b/i] },
    { key: 'mw_domains', domain: 'MW', label: 'WebLogic domains (total across envs)', unit: 'count', type: 'number', def: 4,
      q: 'How many WebLogic domains exist in total across all environments?',
      patterns: [/(\d+)\s+(?:weblogic\s+|wls\s+)?domains?/i] },
    { key: 'mw_servers', domain: 'MW', label: 'Managed servers (total)', unit: 'count', type: 'number', def: 16,
      q: 'How many managed servers (and clusters) are configured in total?',
      patterns: [/(\d+)\s+managed\s+servers?/i, /(\d+)\s+(?:weblogic|wls)\s+servers?/i] },
    { key: 'mw_apps', domain: 'MW', label: 'Deployed applications (distinct)', unit: 'count', type: 'number', def: 10,
      q: 'How many distinct applications (EAR/WAR) are deployed, and how many contain custom code?',
      patterns: [/(\d+)\s+(?:(?:custom|java|j2ee|jee|deployed|business|web|in-house)\s+){0,2}(?:applications|apps|ears?|wars?)\b/i] },
    { key: 'mw_soa', domain: 'MW', label: 'SOA composites', unit: 'count', type: 'number', def: 0,
      q: 'How many SOA Suite composites (BPEL/Mediator) are deployed?',
      patterns: [/(\d+)\s+(?:soa\s+)?composites?/i, /(\d+)\s+bpel\s+process/i] },
    { key: 'mw_osb', domain: 'MW', label: 'OSB services (proxy + business)', unit: 'count', type: 'number', def: 0,
      q: 'How many OSB proxy and business services are deployed?',
      patterns: [/(\d+)\s+(?:osb\s+)?(?:proxy|business)\s+services?/i, /(\d+)\s+osb\s+services?/i] },
    { key: 'mw_ohs', domain: 'MW', label: 'OHS / web-tier instances', unit: 'count', type: 'number', def: 0,
      q: 'How many Oracle HTTP Server (web tier) instances are in scope?',
      patterns: [/(\d+)\s+(?:ohs|oracle http server|web\s*tier)\s+(?:instances?|nodes?|servers?)/i] },

    // ---- OCI INFRA
    { key: 'oci_envs', domain: 'OCI', label: 'Environments', unit: 'count', type: 'number', def: 3,
      q: 'How many environments must be built on OCI (e.g. DEV, TEST, PROD)?',
      patterns: [/(\d+)\s+(?:[\w-]+\s+)?environments\b/i] },
    { key: 'oci_vms', domain: 'OCI', label: 'Servers / VMs to migrate', unit: 'count', type: 'number', def: 20,
      q: 'How many servers / VMs are to be migrated, and what is the split by OS?',
      patterns: [/(\d+)\s+(?:virtual machines|vms?|servers|compute instances|hosts)\b/i] },
    { key: 'oci_os', domain: 'OCI', label: 'Distinct OS variants', unit: 'count', type: 'number', def: 2,
      q: 'Which operating systems and versions are in use (e.g. OL8, RHEL 7, Windows 2019)?',
      patterns: [/(\d+)\s+(?:different\s+)?(?:operating systems|os (?:types|variants|flavours|flavors))/i] },
    { key: 'oci_vcn', domain: 'OCI', label: 'VCNs / network segments', unit: 'count', type: 'number', def: 2,
      q: 'How many VCNs / network segments are required, and is connectivity via FastConnect or IPSec VPN?',
      patterns: [/(\d+)\s+(?:vcns?|virtual cloud networks?|network segments|subnets)/i] },
    { key: 'oci_storage', domain: 'OCI', label: 'Storage to migrate', unit: 'TB', type: 'number', def: 5,
      q: 'What is the total volume of data / storage to be migrated (TB)?',
      patterns: [/(\d+(?:\.\d+)?)\s*tb\b/i] },
    { key: 'oci_lz', domain: 'OCI', label: 'Landing zone build required', unit: 'yes=1 / no=0', type: 'flag', def: 1,
      q: 'Does a new OCI landing zone (tenancy, compartments, IAM, logging) need to be built?',
      patterns: [/landing\s+zone/i] },
    { key: 'oci_sec', domain: 'OCI', label: 'Security services to configure', unit: 'count', type: 'number', def: 3,
      q: 'Which security services are required (WAF, Vault/KMS, Cloud Guard, Bastion, Security Zones)?',
      patterns: [/(\d+)\s+security\s+services?/i] },
    { key: 'oci_dr', domain: 'OCI', label: 'DR region setup required', unit: 'yes=1 / no=0', type: 'flag', def: 0,
      q: 'Is a disaster-recovery setup in a second region required? What RPO / RTO?',
      patterns: [/disaster\s+recovery|\bdr\s+(?:site|region|setup)|\brpo\b|\brto\b/i] },
    { key: 'oci_mon', domain: 'OCI', label: 'Monitoring & logging setup', unit: 'yes=1 / no=0', type: 'flag', def: 1,
      q: 'Is monitoring, alerting and log aggregation setup in scope?',
      patterns: [/monitoring|alerting|observability/i] },

    // ---- DATABASE
    { key: 'db_count', domain: 'DB', label: 'Databases in scope', unit: 'count', type: 'number', def: 5,
      q: 'How many databases are in scope (by environment), and what are their versions?',
      patterns: [/(\d+)\s+(?:oracle\s+)?databases?/i, /(\d+)\s+(?:dbs|db instances|pdbs)\b/i] },
    { key: 'db_size', domain: 'DB', label: 'Total database size', unit: 'TB', type: 'number', def: 2,
      q: 'What is the total database size to migrate (TB) and the daily change rate?',
      patterns: [/(\d+(?:\.\d+)?)\s*tb\b/i] },
    { key: 'db_envs', domain: 'DB', label: 'Target environments', unit: 'count', type: 'number', def: 3,
      q: 'How many target database environments must be provisioned?',
      patterns: [/(\d+)\s+(?:[\w-]+\s+)?environments\b/i] },
    { key: 'db_zdt', domain: 'DB', label: 'DBs needing near-zero downtime (GoldenGate/ZDM)', unit: 'count', type: 'number', def: 0,
      q: 'Which databases require near-zero downtime migration (GoldenGate / ZDM online)? What outage window is acceptable?',
      patterns: [/(\d+)\s+[^.\n]{0,30}(?:zero|minimal|near[- ]zero)\s+downtime/i] },
    { key: 'db_rac', domain: 'DB', label: 'RAC databases', unit: 'count', type: 'number', def: 0,
      q: 'How many databases run on (or must move to) RAC?',
      patterns: [/(\d+)\s+rac\b/i, /(\d+)\s+[^.\n]{0,20}real application clusters/i] },
    { key: 'db_dg', domain: 'DB', label: 'Data Guard standby setups', unit: 'count', type: 'number', def: 0,
      q: 'How many databases need Data Guard standby configuration?',
      patterns: [/(\d+)\s+[^.\n]{0,20}data\s*guard/i] },
    { key: 'db_apps', domain: 'DB', label: 'Connected applications to re-test', unit: 'count', type: 'number', def: 5,
      q: 'How many applications connect to these databases and need connectivity / regression testing?',
      patterns: [/(\d+)\s+(?:connected|dependent|consuming)\s+applications?/i] }
  ];

  function R(pm, sa, sc, c, qa) { return { PM: pm, SA: sa, SC: sc, C: c, QA: qa }; }

  /* WBS lines. driver: a driver key, 'FIXED' (qty 1) or 'PCT' (qty = sum of
     all non-PCT effort; O/M/P are fractions). */
  var LINES = [
    // ---- COMMON
    { id: 'CM-01', domain: 'COMMON', phase: PHASES[0], activity: 'Mobilisation, kick-off, governance & access onboarding', driver: 'FIXED', o: 1.5, m: 2, p: 4, roles: R(.4, .3, .3, 0, 0), basis: 'Typical 1 week mobilisation, part-time' },
    { id: 'CM-02', domain: 'COMMON', phase: PHASES[4], activity: 'Performance / load test support', driver: 'perf_testing', o: 3, m: 5, p: 8, roles: R(0, .2, .3, 0, .5), basis: 'Customer provides tooling; vendor supports tuning' },
    { id: 'CM-03', domain: 'COMMON', phase: PHASES[6], activity: 'Documentation, runbooks & knowledge transfer', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(0, .3, .4, .3, 0), basis: 'As-built + operations runbook + 2 KT sessions' },
    { id: 'CM-04', domain: 'COMMON', phase: PHASES[6], activity: 'Hypercare (per week, part-time)', driver: 'hypercare_weeks', o: 2, m: 2.5, p: 3, roles: R(.1, .1, .4, .4, 0), basis: '~50% of one consultant per week' },
    { id: 'CM-05', domain: 'COMMON', phase: PHASES[7], activity: 'Project management & reporting (% of delivery effort)', driver: 'PCT', o: 0.10, m: 0.12, p: 0.15, roles: R(1, 0, 0, 0, 0), basis: 'Industry norm 10–15% of delivery effort' },

    // ---- MIDDLEWARE
    { id: 'MW-01', domain: 'MW', phase: PHASES[1], activity: 'Current-state assessment, inventory & compatibility analysis', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(0, .6, .4, 0, 0), basis: 'Certification matrix, deprecated APIs, JDK' },
    { id: 'MW-02', domain: 'MW', phase: PHASES[1], activity: 'Environment inventory & health check (per env)', driver: 'mw_envs', o: 0.5, m: 0.75, p: 1, roles: R(0, .2, .5, .3, 0), basis: '' },
    { id: 'MW-03', domain: 'MW', phase: PHASES[2], activity: 'Upgrade strategy, target architecture & runbook design', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(0, .7, .3, 0, 0), basis: 'In-place vs out-of-place, rollback plan' },
    { id: 'MW-04', domain: 'MW', phase: PHASES[3], activity: 'Install binaries, JDK & latest patch set (per env)', driver: 'mw_envs', o: 0.5, m: 1, p: 1.5, roles: R(0, 0, .4, .6, 0), basis: '' },
    { id: 'MW-05', domain: 'MW', phase: PHASES[3], activity: 'Schema upgrade (RCU/UA) & domain reconfiguration (per domain)', driver: 'mw_domains', o: 1, m: 1.5, p: 2.5, roles: R(0, .1, .6, .3, 0), basis: '' },
    { id: 'MW-06', domain: 'MW', phase: PHASES[3], activity: 'Managed server / cluster config & validation (per server)', driver: 'mw_servers', o: 0.1, m: 0.2, p: 0.4, roles: R(0, 0, .3, .7, 0), basis: '' },
    { id: 'MW-07', domain: 'MW', phase: PHASES[3], activity: 'Application remediation & rebuild (per app)', driver: 'mw_apps', o: 0.25, m: 0.5, p: 1.5, roles: R(0, .1, .5, .4, 0), basis: 'Wide range: custom code unknowns' },
    { id: 'MW-08', domain: 'MW', phase: PHASES[3], activity: 'SOA composite upgrade & redeploy (per composite)', driver: 'mw_soa', o: 0.15, m: 0.25, p: 0.5, roles: R(0, .1, .5, .4, 0), basis: '' },
    { id: 'MW-09', domain: 'MW', phase: PHASES[3], activity: 'OSB service migration & redeploy (per service)', driver: 'mw_osb', o: 0.1, m: 0.2, p: 0.4, roles: R(0, .1, .4, .5, 0), basis: '' },
    { id: 'MW-10', domain: 'MW', phase: PHASES[3], activity: 'OHS / web-tier upgrade (per instance)', driver: 'mw_ohs', o: 0.25, m: 0.5, p: 1, roles: R(0, 0, .4, .6, 0), basis: '' },
    { id: 'MW-11', domain: 'MW', phase: PHASES[4], activity: 'Smoke & SIT support (per env)', driver: 'mw_envs', o: 0.75, m: 1.25, p: 2, roles: R(0, 0, .3, .3, .4), basis: '' },
    { id: 'MW-12', domain: 'MW', phase: PHASES[4], activity: 'UAT support & defect fixing', driver: 'FIXED', o: 2, m: 4, p: 6, roles: R(0, .1, .4, .3, .2), basis: '' },
    { id: 'MW-13', domain: 'MW', phase: PHASES[5], activity: 'Production cutover rehearsal & go-live', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(.1, .2, .4, .3, 0), basis: 'Includes weekend window' },

    // ---- OCI INFRA
    { id: 'OC-01', domain: 'OCI', phase: PHASES[1], activity: 'Discovery workshops & migration assessment', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(0, .7, .3, 0, 0), basis: '' },
    { id: 'OC-02', domain: 'OCI', phase: PHASES[1], activity: 'Server discovery & dependency mapping (per VM)', driver: 'oci_vms', o: 0.05, m: 0.1, p: 0.2, roles: R(0, .2, .4, .4, 0), basis: '' },
    { id: 'OC-03', domain: 'OCI', phase: PHASES[2], activity: 'Target architecture, sizing & HLD/LLD', driver: 'FIXED', o: 3, m: 5, p: 8, roles: R(0, .8, .2, 0, 0), basis: '' },
    { id: 'OC-04', domain: 'OCI', phase: PHASES[3], activity: 'Landing zone build (tenancy, compartments, IAM, tagging, logging)', driver: 'oci_lz', o: 4, m: 6, p: 10, roles: R(0, .3, .5, .2, 0), basis: 'CIS-aligned landing zone, Terraform' },
    { id: 'OC-05', domain: 'OCI', phase: PHASES[3], activity: 'Network build: VCN, subnets, gateways, security lists (per VCN)', driver: 'oci_vcn', o: 0.5, m: 1, p: 2, roles: R(0, .2, .5, .3, 0), basis: '' },
    { id: 'OC-06', domain: 'OCI', phase: PHASES[3], activity: 'Security services configuration (per service)', driver: 'oci_sec', o: 0.5, m: 1, p: 1.5, roles: R(0, .2, .6, .2, 0), basis: '' },
    { id: 'OC-07', domain: 'OCI', phase: PHASES[3], activity: 'OS image / template hardening (per OS variant)', driver: 'oci_os', o: 0.5, m: 1, p: 2, roles: R(0, 0, .5, .5, 0), basis: '' },
    { id: 'OC-08', domain: 'OCI', phase: PHASES[3], activity: 'VM migration / rebuild & validation (per VM)', driver: 'oci_vms', o: 0.25, m: 0.5, p: 1, roles: R(0, 0, .3, .7, 0), basis: 'Lift & shift via OCM / rehost' },
    { id: 'OC-09', domain: 'OCI', phase: PHASES[3], activity: 'Data / storage migration (per TB)', driver: 'oci_storage', o: 0.05, m: 0.1, p: 0.25, roles: R(0, 0, .3, .7, 0), basis: '' },
    { id: 'OC-10', domain: 'OCI', phase: PHASES[3], activity: 'DR region setup & DR drill', driver: 'oci_dr', o: 3, m: 5, p: 8, roles: R(0, .3, .5, .2, 0), basis: '' },
    { id: 'OC-11', domain: 'OCI', phase: PHASES[3], activity: 'Monitoring, alarms, logging & backup policies', driver: 'oci_mon', o: 1, m: 2, p: 4, roles: R(0, .1, .5, .4, 0), basis: '' },
    { id: 'OC-12', domain: 'OCI', phase: PHASES[4], activity: 'Infrastructure testing & validation (per env)', driver: 'oci_envs', o: 1, m: 2, p: 3, roles: R(0, 0, .3, .3, .4), basis: '' },
    { id: 'OC-13', domain: 'OCI', phase: PHASES[5], activity: 'Cutover planning & go-live', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(.1, .2, .4, .3, 0), basis: '' },

    // ---- DATABASE
    { id: 'DB-01', domain: 'DB', phase: PHASES[1], activity: 'Database assessment (AWR, compatibility, CPAT)', driver: 'FIXED', o: 2, m: 3, p: 5, roles: R(0, .6, .4, 0, 0), basis: '' },
    { id: 'DB-02', domain: 'DB', phase: PHASES[1], activity: 'Per-database analysis (per DB)', driver: 'db_count', o: 0.25, m: 0.5, p: 1, roles: R(0, .2, .6, .2, 0), basis: '' },
    { id: 'DB-03', domain: 'DB', phase: PHASES[2], activity: 'Migration strategy & target design', driver: 'FIXED', o: 2, m: 4, p: 6, roles: R(0, .8, .2, 0, 0), basis: 'Data Pump / RMAN / ZDM / GoldenGate' },
    { id: 'DB-04', domain: 'DB', phase: PHASES[3], activity: 'Target DB provisioning & configuration (per env)', driver: 'db_envs', o: 0.5, m: 1, p: 2, roles: R(0, 0, .5, .5, 0), basis: '' },
    { id: 'DB-05', domain: 'DB', phase: PHASES[3], activity: 'Database migration / upgrade execution (per DB)', driver: 'db_count', o: 0.5, m: 1, p: 2, roles: R(0, 0, .6, .4, 0), basis: '' },
    { id: 'DB-06', domain: 'DB', phase: PHASES[3], activity: 'Data transfer & validation (per TB)', driver: 'db_size', o: 0.25, m: 0.5, p: 1, roles: R(0, 0, .4, .6, 0), basis: '' },
    { id: 'DB-07', domain: 'DB', phase: PHASES[3], activity: 'GoldenGate / ZDM online migration setup (per DB)', driver: 'db_zdt', o: 2, m: 3, p: 5, roles: R(0, .2, .6, .2, 0), basis: '' },
    { id: 'DB-08', domain: 'DB', phase: PHASES[3], activity: 'RAC configuration (per RAC DB)', driver: 'db_rac', o: 1, m: 2, p: 3, roles: R(0, .1, .7, .2, 0), basis: '' },
    { id: 'DB-09', domain: 'DB', phase: PHASES[3], activity: 'Data Guard standby setup (per DB)', driver: 'db_dg', o: 1, m: 1.5, p: 2.5, roles: R(0, .1, .7, .2, 0), basis: '' },
    { id: 'DB-10', domain: 'DB', phase: PHASES[3], activity: 'Backup & recovery configuration (per env)', driver: 'db_envs', o: 0.5, m: 1, p: 1.5, roles: R(0, 0, .5, .5, 0), basis: '' },
    { id: 'DB-11', domain: 'DB', phase: PHASES[4], activity: 'Post-migration tuning & validation (per DB)', driver: 'db_count', o: 0.25, m: 0.5, p: 1, roles: R(0, .1, .6, .1, .2), basis: '' },
    { id: 'DB-12', domain: 'DB', phase: PHASES[4], activity: 'Application connectivity & regression support (per app)', driver: 'db_apps', o: 0.25, m: 0.5, p: 1, roles: R(0, 0, .3, .3, .4), basis: '' },
    { id: 'DB-13', domain: 'DB', phase: PHASES[5], activity: 'Cutover rehearsal & production migration', driver: 'FIXED', o: 1.5, m: 2.5, p: 4, roles: R(.1, .2, .5, .2, 0), basis: '' }
  ];

  /* Complexity & environmental adjustment factors (multiply all non-PM lines). */
  var FACTORS = [
    { key: 'tech', label: 'Technical complexity', options: [['Low', 0.85], ['Medium', 1.0], ['High', 1.25]], def: 'Medium',
      help: 'Custom code, integrations, version gap, non-standard configs' },
    { key: 'docs', label: 'Quality of customer documentation', options: [['Good', 0.95], ['Average', 1.0], ['Poor', 1.1]], def: 'Average',
      help: 'Architecture diagrams, inventories, runbooks available?' },
    { key: 'access', label: 'Customer access & team availability', options: [['Good', 0.95], ['Average', 1.0], ['Poor', 1.15]], def: 'Average',
      help: 'VPN/access lead time, SME availability, decision speed' },
    { key: 'compliance', label: 'Compliance / security constraints', options: [['Low', 1.0], ['Medium', 1.05], ['High', 1.15]], def: 'Low',
      help: 'Regulated industry, change-board approvals, audits' },
    { key: 'model', label: 'Delivery model', options: [['Offshore', 1.0], ['Hybrid', 1.05], ['Onsite', 1.1]], def: 'Offshore',
      help: 'Coordination overhead' }
  ];

  var DEFAULT_RISKS = {
    COMMON: [
      { risk: 'Customer environment access / VPN delayed at start', prob: 40, impact: 3, mitigation: 'Access checklist sent in week 0; start clock on access granted' },
      { risk: 'Customer SMEs not available for workshops / testing', prob: 30, impact: 4, mitigation: 'Named SMEs and RACI agreed in SOW' }
    ],
    MW: [
      { risk: 'Custom code uses deprecated / removed APIs', prob: 35, impact: 5, mitigation: 'Code scan in assessment; remediation beyond the agreed app count via change request' },
      { risk: 'Third-party libraries not certified on target JDK', prob: 25, impact: 3, mitigation: 'Certification matrix check in discovery' }
    ],
    OCI: [
      { risk: 'Application dependencies not documented — migration waves change', prob: 35, impact: 5, mitigation: 'Dependency mapping tool; wave plan sign-off' },
      { risk: 'Network connectivity (FastConnect/VPN) lead time', prob: 30, impact: 4, mitigation: 'Order connectivity in week 1' }
    ],
    DB: [
      { risk: 'Downtime window shorter than migration time', prob: 30, impact: 4, mitigation: 'Test migration timings; switch to online method if needed' },
      { risk: 'Performance regression after migration', prob: 25, impact: 3, mitigation: 'Baseline AWR, SQL Plan Management' }
    ]
  };

  var DEFAULT_ASSUMPTIONS = {
    COMMON: [
      'Estimates are based on the information in the RFP and discovery session; material changes will be handled via change request.',
      'Customer provides timely remote access (VPN, accounts, privileges) to all in-scope environments.',
      'Customer provides named SMEs for workshops, testing and sign-offs within 2 business days of request.',
      'All required software licenses are provided by the customer.',
      'Work is performed remotely during standard business hours, except agreed cutover windows.',
      'User acceptance testing is executed by the customer; vendor provides defect-fix support.'
    ],
    MW: [
      'Source and target versions are on the Oracle certification matrix for the customer\'s OS and JDK.',
      'Application code changes are limited to configuration and minor API remediation; functional changes are out of scope.'
    ],
    OCI: [
      'OCI tenancy and subscription are available before the build phase starts.',
      'Servers are rehosted (lift & shift); re-platforming or re-architecting is out of scope.'
    ],
    DB: [
      'Source databases are on a version supported for direct upgrade / migration to the target.',
      'Data cleansing and application code changes are out of scope.'
    ]
  };

  var DEFAULT_EXCLUSIONS = [
    'Hardware, software licences and cloud consumption costs.',
    'Functional changes, new features or application re-development.',
    'Third-party vendor coordination beyond reasonable effort.',
    '24x7 support after the hypercare period.'
  ];

  var BID_CRITERIA = [
    { key: 'fit',     label: 'Solution fit with our capabilities', weight: 20 },
    { key: 'rel',     label: 'Customer relationship / access to decision makers', weight: 15 },
    { key: 'budget',  label: 'Budget known and realistic', weight: 15 },
    { key: 'compet',  label: 'Competitive position (incumbent, differentiation)', weight: 15 },
    { key: 'res',     label: 'Delivery resources available for the timeline', weight: 15 },
    { key: 'time',    label: 'Customer timeline realistic', weight: 10 },
    { key: 'risk',    label: 'Commercial / contractual risk acceptable', weight: 10 }
  ];

  var REVIEW_CHECKLIST = [
    'Bid / No-Bid decision recorded and approved by sales lead',
    'Every sizing driver has a source (RFP / discovery) or a clarification raised',
    'Requirements matrix responded (Comply / Partial / Not comply) for every requirement',
    'Effort reviewed by delivery lead (peer review of WBS)',
    'Assumptions & exclusions reviewed and aligned with SOW',
    'Risks reviewed; contingency confidence level agreed',
    'Rate card and margin approved by finance / commercial',
    'Timeline validated against resource availability'
  ];

  var CAT = { version: '2026.11-default', ROLES: ROLES, PHASES: PHASES, DOMAINS: DOMAINS, DRIVERS: DRIVERS, LINES: LINES,
    FACTORS: FACTORS, DEFAULT_RISKS: DEFAULT_RISKS, DEFAULT_ASSUMPTIONS: DEFAULT_ASSUMPTIONS, DEFAULT_EXCLUSIONS: DEFAULT_EXCLUSIONS,
    BID_CRITERIA: BID_CRITERIA, REVIEW_CHECKLIST: REVIEW_CHECKLIST };
  root.PS_CATALOGUE = CAT;
  if (typeof module !== 'undefined' && module.exports) module.exports = CAT;
})(typeof window !== 'undefined' ? window : globalThis);
