# Presales Estimation Studio

Takes you from an RFP to an approved estimate. Upload the RFP documents and the app builds a requirements matrix and pulls out the sizing numbers. From there it produces a bottom-up PERT estimate at P80 with a risk reserve, the roles and cost, a review gate with approvals, and an **SAE Excel workbook with live formulas**.

It is a static website with no server, no API keys and no database. RFP files are read **inside the user's browser** and are never uploaded anywhere.

Live URL (after setup): **https://presales.lakhshit.in**

---

## 1. The process the app follows

| # | Stage | What happens | Output |
|---|-------|--------------|--------|
| 1 | Opportunity intake | Customer, RFP reference, deadlines, owners, technology areas | Opportunity record |
| 2 | Bid / No-Bid | 7 weighted criteria. ≥70% Bid, 50–69% Bid with conditions, <50% No-Bid | Go / no-go decision |
| 3 | RFP & requirements | Upload PDF / DOCX / XLSX / TXT. Requirements are extracted and classified, and sizing numbers are found **with the sentence they came from** | Compliance matrix, sizing drivers |
| 4 | Scoping & discovery | Confirm every driver (servers, composites, TB…). Each one has a source: RFP, Discovery, Customer or Default. Complexity factors are set here | Confirmed scope |
| 5 | Clarifications | Unknowns become questions. Applying an answer updates the estimate | Q&A log |
| 6 | Effort estimate | WBS lines × PERT `(O+4M+P)/6` × complexity. σ combined as √Σσ². Quoted at P80 | Effort by line and phase |
| 7 | Resources & cost | Role mix per line × rate card. Price = cost ÷ (1 − margin) | Team, cost, price, duration |
| 8 | Risks & assumptions | Risk reserve = Σ probability × impact. Assumptions and exclusions | RAID |
| 9 | Review & approval | Automatic quality checks, a reviewer checklist, an approval log and saved versions | Approved estimate |
| 10 | Export | SAE Excel with live formulas, a proposal summary (print to PDF) and the project JSON | Customer submission |

### Why the numbers can be defended
- **Traceable inputs.** Every quantity shows where it came from. Defaults are flagged until confirmed.
- **Benchmarked unit effort.** O/M/P days per unit come from one shared catalogue that delivery calibrates from actuals.
- **Uncertainty is made explicit** with PERT and a confidence level, instead of a hidden "+20%".
- **Known risks are priced separately** (EMV), so the risk reserve can be discussed openly with the customer.
- **Automatic quality checks:**
  - PM overhead 8–15%
  - testing at least 12–15%
  - contingency 10–40%
  - drivers with no source
  - very wide ranges
- **The Excel is fully formula-driven.** Change a quantity or an O/M/P value and every total recalculates.

> ⚠️ The built-in O/M/P values and day rates are **starter benchmarks**. Before you send quotes to customers, review them with your delivery leads (in the app: Effort catalogue & rates).

---

## 2. Deploy on GitHub Pages with your GoDaddy domain

### Step 1: Create the repository
1. Sign in to GitHub and create a new repository, e.g. `presales-studio`. It must be **Public** for free GitHub Pages.
2. Upload the files with one of these methods:
   - **In the browser:** open the repo, choose **Add file → Upload files**, and drag in the *contents* of this folder (`index.html`, `CNAME`, `.nojekyll`, `css/`, `js/`, `lib/`, `data/`, `samples/`, `README.md`). Then click **Commit changes**.
   - **With git:**
     ```bash
     cd presales-app
     git init && git add . && git commit -m "Presales Estimation Studio v1"
     git branch -M main
     git remote add origin https://github.com/<your-username>/presales-studio.git
     git push -u origin main
     ```

### Step 2: Turn on GitHub Pages
1. In the repo, go to **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Click **Save**.
3. Under **Custom domain**, enter `presales.lakhshit.in` and click **Save**. The `CNAME` file in this repo already contains this name.
4. If `presales.lakhshit.in` is still attached to an older GitHub Pages repo, **remove it from that repo first**. A domain can only point to one Pages site.

### Step 3: Point the GoDaddy DNS to GitHub
1. Sign in to GoDaddy and go to **My Products → lakhshit.in → DNS → Manage DNS**.
2. Add a record, or edit the existing `presales` record:

   | Type | Name | Value | TTL |
   |------|------|-------|-----|
   | CNAME | `presales` | `<your-username>.github.io` | 1 hour |

   If an **A** record named `presales` already exists, delete it first. A name can't have both an A record and a CNAME.
3. Wait 10–60 minutes. Back in **Settings → Pages**, the DNS check turns green. Then tick **Enforce HTTPS**.

**Using the root domain (`lakhshit.in`) instead:**
1. Put `lakhshit.in` in the `CNAME` file.
2. In GoDaddy, add four **A** records with Name `@`, pointing to:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
3. Add a CNAME record `www` → `<your-username>.github.io`.

**Recommended:** verify the domain in GitHub. Go to your **profile Settings → Pages → Add a domain**, then add the TXT record GitHub shows you in GoDaddy. This stops anyone else from claiming your subdomain.

### Step 4: Updating the app later
Edit the files and commit, or upload the changed files again. GitHub Pages redeploys in about a minute.

---

## 3. Sharing one calibrated catalogue with the team
1. In the app, open **Effort catalogue & rates**, adjust the O/M/P values and day rates, and click **Export catalogue**.
2. Rename the file to `catalogue.json` and commit it to `data/catalogue.json` in the repo.
3. Every user who hasn't customised their own catalogue loads it automatically. Users who have can click **Load team catalogue**.

The catalogue holds benchmark numbers only. It contains no customer data, so it is safe to keep in the public repo.

## 4. Data and security
- Opportunities are saved in the user's browser (localStorage). Use **Export project JSON** to back up or to send to a reviewer, who loads it with **Import project JSON**.
- **Never commit customer RFPs or project JSON files to this public repo.** Keep them in SharePoint, OneDrive or a private repo.
- There is no login, on purpose. A static site can't keep passwords secret, so the app doesn't pretend to. For real multi-user sign-in and a shared database, the next step would be a small backend (for example Supabase or Cloudflare Access in front of the site).

## 5. Project structure
```
index.html              App shell
css/app.css             Styles
js/catalogue.js         Default effort catalogue, drivers, factors, risks, assumptions
js/engine.js            Estimation engine (PERT, confidence, risk reserve, roles, checks)
js/extract.js           RFP analysis (requirements, sizing numbers with evidence)
js/excel.js             SAE Excel export with live formulas
js/app.js               User interface
lib/                    pdf.js, mammoth, SheetJS, ExcelJS (stored locally, no CDN)
data/catalogue.json     Team catalogue (optional; loaded automatically)
samples/                Sample RFP to try the full flow
CNAME / .nojekyll       GitHub Pages settings
```

## 6. Try it
Open the site, click **Load sample RFP**, then **Analyse documents → Apply**. Walk through steps 4–10 and download the Excel.
