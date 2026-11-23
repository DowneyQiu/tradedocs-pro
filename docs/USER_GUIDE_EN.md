# TradeDocs Pro — English User Guide

> **Source-available · free for your own use · NOT an OSI open source licence.**
> The binding licence is the Chinese [`LICENSE`](../LICENSE).
> [`LICENSE-EN.md`](../LICENSE-EN.md) is a non-binding English summary.
> Repository: <https://github.com/DowneyQiu/tradedocs-pro>
> Shared by **Downey (Mr. Tang) · Topo New Material**

---

## 1. What this is

TradeDocs Pro is a Windows desktop tool that runs entirely on your own computer.
You enter one order once, then generate, preview, print and save **five separate
export documents** — each as its own file.

It was built around the paperwork that actually follows an export order:
a quotation, a proforma invoice, a sales contract, a commercial invoice and a
packing list. It is deliberately local: no account, no cloud, no telemetry.

## 2. What it is not

- **Not open source in the OSI sense.** The code is public and free for your own
  use, but commercialising the software itself is not permitted.
  See [`LICENSE`](../LICENSE).
- Not a hosted service, web app or multi-user server. It binds to `127.0.0.1` only.
- It does **not** produce customs declarations, bills of lading, certificates of
  origin or booking documents.
- It does **not** look up exchange rates, HS codes, weights or carton dimensions.
  Anything you have not entered stays out of the document.
- It does **not** guarantee that a bank, customs office, forwarder or customer
  will accept a document. Final compliance is always yours to check.

## 3. Requirements and quick start

### Option A — Portable build (nothing else to install)

1. Download `TradeDocsPro_Share_v1.0_Portable.zip` from the
   [Releases page](https://github.com/DowneyQiu/tradedocs-pro/releases/tag/v1.0.0).
2. Unzip it into any folder you own (a USB drive works).
3. Double-click **`启动TradeDocsPro.bat`**. Your browser opens at a local address.

The portable ZIP contains its own Python runtime, so the target machine does not
need Python installed. The launcher picks a free port in the range **8965–8995**.

### Option B — Run from source

Python **3.8+** is enough; the server uses only the standard library, so there is
no `pip install` step.

```
python server.py
```

Then open the local address printed in the console. The `runtime/` folder exists
only in the portable ZIP; it is excluded from the git repository by `.gitignore`.

## 4. First run — three things to fill in

The download ships with an **empty database** and a blank company template.
No real company, customer, bank or order data is included.

1. **Issuing entity** — your company's legal English name, address and contact
   details. This becomes the letterhead on every document.
2. **Bank account** — account number, bank name and SWIFT, then mark it verified
   after checking it by hand.
3. **Optional** — upload your own logo in *Company & System Settings*, or load the
   **DEMO data** to explore the interface. DEMO records are fictional, clearly
   marked, and can be removed with one click.

> Until step 1 and 2 are done, the letterhead shows placeholder text such as
> `YOUR COMPANY NAME LTD` and a `YOUR LOGO` box. That is expected, not a defect —
> do not send such a document to a customer.

## 5. Everyday workflow

```
Customer  →  Product  →  New order (5 steps)  →  Document studio  →  Print / Save PDF
```

- **New order** is a five-step wizard covering the parties, goods and amounts,
  trade terms and payment, shipment details, and document options.
- A quotation can hold **several trade terms** (for example FOB and DAP) with a
  per-product × per-term price matrix, so one order can produce more than one
  version of a quote.
- **Empty fields are not printed.** Unfilled weight, volume, remarks or clauses
  produce no blank rows and no zero values.
- The **Packing List** blocks export when measured packing data is missing,
  so a document with empty carton figures is not sent out by accident.
- Each document has its **own date and remarks**, and each is previewed, printed
  and downloaded separately from its own card in the Document Studio.
- **11 interface languages and 9 colour themes** are available in Settings.

## 6. The five document kinds

| # | Document | Typical use |
|---|---|---|
| 1 | Quotation | First price offer, optionally with several Incoterms |
| 2 | Proforma Invoice | Advance-payment / deposit request |
| 3 | Sales Contract | Signed commercial terms |
| 4 | Commercial Invoice | Payment, customs and bank paperwork |
| 5 | Packing List | Carton-level packing, weights, volumes and shipping marks |

A separate **Shipping Mark** card is available for printing carton labels.

## 7. Printing (important)

Documents are styled for **A4 with zero page margins**; browser headers and
footers are suppressed by the built-in print CSS.

In Chrome or Edge, when you print or save as PDF:

- Destination: **Save as PDF** (or your A4 printer)
- Paper: **A4** · Scale: **100%** · Margins: **None**
- **Enable** "Background graphics" so the header rule and table fills appear
- **Disable** "Headers and footers" (no URL, date or `about:blank` in the footer)
- Print **one document at a time** from its own card — never print the dashboard

A separate print-acceptance checklist with sample A4 PDFs is included in the
local delivery bundle; use it to review each page before your first real order.

## 8. Data and privacy

- Pure local operation: only `127.0.0.1`, no remote API, no upload, no telemetry.
- All business data lives in **`tradedocs.sqlite3`** beside the program.
  SQLite is the single source of truth; browser storage is only a write-through
  cache and is overwritten from SQLite at startup.
- Responses are served with `Cache-Control: no-store`.
- The launcher writes `runtime.json` and a daily snapshot under `backups/` —
  both stay **inside the program folder**, so copying the whole folder is enough
  to move your setup to another computer.
- Back up the whole folder (or at least the `.sqlite3` file) before any upgrade.
- The 8965–8995 port band and the `tdshare_` cache namespace keep this edition
  separate from other editions that may also be installed on the same machine.

## 9. Frequently asked questions

**Can my company use this for real business?** Yes. Installing it on your own
equipment and using it for your own export paperwork is explicitly allowed,
including at for-profit factories and trading companies. The documents you
generate are entirely yours.

**May I change the code?** Yes, for your own use, with no obligation to publish
your changes.

**May I give it to a colleague?** Yes, free of charge, under the same licence and
with the copyright notices kept.

**May I sell it, bundle it into a paid product, or run it as a paid service?**
No — that requires prior written permission. See `LICENSE` §3.

**May I write a tutorial or make a video about it?** Yes, as long as it is free
and you do not present yourself as the original author or as officially endorsed.

**Where are the interface screenshots from?** All promotional images and video
come from the real running interface with fictional DEMO data. Nothing is mocked up.

## 10. Contributing, issues and disclaimer

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) before opening a pull request, and
[`docs/FAQ.md`](FAQ.md) for more answers. Please do not edit `LICENSE`, the
copyright notices, the in-app attribution or the version marker.

The software is provided "as is". The final compliance of any document you send
— trade terms, HS codes, declaration elements, bank details, certification
wording — remains your responsibility. See `LICENSE` §7 for the full disclaimer.
Third-party components are listed in
[`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md).

---

Shared by Downey (Mr. Tang) · Topo New Material
