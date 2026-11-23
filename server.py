"""TradeDocs Pro - local-only offline server.

Binds to 127.0.0.1 only. All business data lives in the SQLite file next to
this script. Seller entities and bank accounts are seeded once from
seller-config.json and thereafter are read from / written to SQLite only.
No network calls, no cloud APIs, no telemetry.
Copyright (c) 2026 拓珀新材料（成都）有限公司.
   Licensed under the TradeDocs Pro Source-Available / Non-Commercial Distribution License 1.0; see LICENSE.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import base64, json, math, os, re, socket, sqlite3, sys, threading, uuid, webbrowser
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree import ElementTree as ET
from urllib.parse import urlparse
from datetime import datetime, timedelta

VERSION = "3.0.0"
ROOT = Path(__file__).resolve().parent
DB = ROOT / "tradedocs.sqlite3"
CONFIG = ROOT / "seller-config.json"
IMAGE_DIR = ROOT / "product-images"
RUNTIME = ROOT / "runtime.json"
COLLECTIONS = {"orders", "customers", "products", "accounts", "entities", "settings"}
BUSINESS_COLLECTIONS = ("orders", "customers", "products", "settings")
SENSITIVE_COLLECTIONS = ("accounts", "entities")

STATIC_FILES = {
    "/index.html", "/app.css", "/app-logo.png", "/app-logo-wide.png", "/brand.js",
    "/core.js", "/i18n.js", "/seller-info.js", "/account-select.js", "/packing-calculations.js",
    "/documents.js", "/document-checks.js", "/order-form.js", "/record-editor.js",
    "/workspace.js", "/studio.js",
}


# --------------------------------------------------------------------------
# SQLite
# --------------------------------------------------------------------------
def connect():
    c = sqlite3.connect(DB, timeout=30)
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA synchronous=FULL")
    c.execute("CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(collection,id))")
    c.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    # Once this database has held real business records, an old browser cache must
    # never be migrated back into it (e.g. after a restore or an intentional cleanup).
    if c.execute("SELECT 1 FROM records WHERE collection IN ('orders','customers','products') LIMIT 1").fetchone():
        c.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('cache_migration_done', datetime('now'))")
        c.commit()
    return c


def collection_rows(name):
    c = connect()
    try:
        return [json.loads(r[0]) for r in c.execute(
            "SELECT body FROM records WHERE collection=? ORDER BY rowid", (name,))]
    finally:
        c.close()


def save_collection(name, items):
    c = connect()
    try:
        c.execute("BEGIN IMMEDIATE")
        c.execute("DELETE FROM records WHERE collection=?", (name,))
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            rid = str(item.get("id") or "row-%d" % i)
            item["id"] = rid
            c.execute("INSERT OR REPLACE INTO records(collection,id,body) VALUES(?,?,?)",
                      (name, rid, json.dumps(item, ensure_ascii=False)))
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


# Identity fields of an account / company. A config revision must never
# silently rewrite these: if the user edited one locally, the local value wins.
INFO_REVISION_PROTECTED = ("account_no", "swift", "beneficiary", "entity",
                           "entity_cn", "currency", "id")


def apply_info_revision(cfg, c):
    """One-time, idempotent sync of user-verified company / account info.

    An additive-only seed cannot correct records that an older build already
    wrote into SQLite. This optional, idempotent sync merges verified display
    metadata from the configuration file. Identity fields (account numbers,
    SWIFT codes, beneficiary names) are protected and never rewritten. The
    factory configuration of the sales edition has no infoRevision, so this
    sync is skipped entirely.
    """
    revision = cfg.get("infoRevision")
    if not revision:
        return {"skipped": "config has no infoRevision"}
    row = c.execute("SELECT value FROM meta WHERE key='info_revision'").fetchone()
    if row and row[0] == revision:
        return {"skipped": "already applied", "revision": revision}

    targets = (
        ("entities", next((x for x in (cfg.get("entities") or [])
                           if x.get("id") == "hk"), None)),
        ("accounts", next((x for x in (cfg.get("accounts") or [])
                           if x.get("id") == "hk-contract"), None)),
    )
    updated = []
    for collection, fresh in targets:
        if not fresh:
            continue
        old_row = c.execute("SELECT body FROM records WHERE collection=? AND id=?",
                            (collection, fresh["id"])).fetchone()
        if not old_row:
            continue  # empty database: handled by the additive seed above
        try:
            old = json.loads(old_row[0])
        except (ValueError, TypeError):
            old = {}
        merged = dict(old)
        for key, value in fresh.items():
            if key in INFO_REVISION_PROTECTED and old.get(key):
                continue
            merged[key] = value
        # A verified account must not keep a stale "to be checked" note.
        if collection == "accounts" and merged.get("verified") is True:
            merged["note"] = fresh.get("note", "")
        c.execute("UPDATE records SET body=?, updated_at=CURRENT_TIMESTAMP "
                  "WHERE collection=? AND id=?",
                  (json.dumps(merged, ensure_ascii=False), collection, fresh["id"]))
        updated.append({"collection": collection, "id": fresh["id"],
                        "accountNoBefore": old.get("account_no"),
                        "accountNoAfter": merged.get("account_no"),
                        "accountNoConfig": fresh.get("account_no"),
                        "protectedMismatch": bool(
                            fresh.get("account_no") and old.get("account_no")
                            and fresh["account_no"] != old["account_no"])})

    c.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('info_revision',?)", (revision,))
    c.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('info_revision_audit',?)",
              (json.dumps({"revision": revision,
                           "appliedAt": datetime.now().isoformat(timespec="seconds"),
                           "updated": updated}, ensure_ascii=False),))
    return {"applied": revision, "updated": updated}


def seed_from_config():
    """One-time, additive-only seed. Never overwrites existing business rows.

    Plus one idempotent, audited metadata revision for verified company info.
    """
    if not CONFIG.exists():
        return {"ok": False, "reason": "seller-config.json is missing"}
    try:
        cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    except Exception as e:
        return {"ok": False, "reason": "seller-config.json is invalid: %s" % e}
    c = connect()
    try:
        c.execute("BEGIN IMMEDIATE")
        added = {}
        for key in ("entities", "accounts"):
            count = c.execute("SELECT COUNT(*) FROM records WHERE collection=?", (key,)).fetchone()[0]
            if count:
                added[key] = 0
                continue
            rows = cfg.get(key) or []
            for i, row in enumerate(rows):
                rid = str(row.get("id") or "%s-%d" % (key, i))
                row["id"] = rid
                c.execute("INSERT OR REPLACE INTO records(collection,id,body) VALUES(?,?,?)",
                          (key, rid, json.dumps(row, ensure_ascii=False)))
            added[key] = len(rows)
        revision = apply_info_revision(cfg, c)
        c.commit()
        return {"ok": True, "added": added, "mode": "additive-only",
                "infoRevision": revision}
    except Exception as e:
        c.rollback()
        return {"ok": False, "reason": str(e)}
    finally:
        c.close()


def backup_database(reason):
    if not DB.exists():
        return None
    source = connect()
    try:
        count = source.execute("SELECT COUNT(*) FROM records").fetchone()[0]
        if not count:
            return None
        folder = ROOT / "backups"
        folder.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = folder / ("TradeDocsPro-%s-%s-%s.sqlite3" % (reason, stamp, uuid.uuid4().hex[:6]))
        dest = sqlite3.connect(target)
        try:
            source.backup(dest)
        finally:
            dest.close()
        cutoff = datetime.now() - timedelta(days=30)
        for old in folder.glob("TradeDocsPro-*.sqlite3"):
            try:
                if datetime.fromtimestamp(old.stat().st_mtime) < cutoff:
                    old.unlink()
            except OSError:
                pass
        return target
    finally:
        source.close()


def create_daily_backup():
    folder = ROOT / "backups"
    today = datetime.now().strftime("%Y%m%d")
    if folder.exists() and any(today in p.name and "-daily-" in p.name for p in folder.glob("TradeDocsPro-*.sqlite3")):
        return None
    return backup_database("daily")


# --------------------------------------------------------------------------
# Minimal XLSX reader/writer (standard library only)
# --------------------------------------------------------------------------
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
ET.register_namespace('', MAIN_NS)
ET.register_namespace('r', REL_NS)


def xlsx_column(n):
    out = ''
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def make_workbook(rows):
    sheet = ET.Element('{%s}worksheet' % MAIN_NS)
    views = ET.SubElement(sheet, '{%s}sheetViews' % MAIN_NS)
    view = ET.SubElement(views, '{%s}sheetView' % MAIN_NS, {'workbookViewId': '0'})
    ET.SubElement(view, '{%s}pane' % MAIN_NS, {'ySplit': '1', 'topLeftCell': 'A2', 'activePane': 'bottomLeft', 'state': 'frozen'})
    data = ET.SubElement(sheet, '{%s}sheetData' % MAIN_NS)
    for ri, row in enumerate(rows, 1):
        rowel = ET.SubElement(data, '{%s}row' % MAIN_NS, {'r': str(ri)})
        for ci, value in enumerate(row, 1):
            if value is None:
                continue
            cell = ET.SubElement(rowel, '{%s}c' % MAIN_NS,
                                 {'r': xlsx_column(ci) + str(ri), **({'s': '1'} if ri == 1 else {})})
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                ET.SubElement(cell, '{%s}v' % MAIN_NS).text = str(value)
            else:
                cell.set('t', 'inlineStr')
                is_el = ET.SubElement(cell, '{%s}is' % MAIN_NS)
                ET.SubElement(is_el, '{%s}t' % MAIN_NS).text = str(value)
    if rows and rows[0]:
        ET.SubElement(sheet, '{%s}autoFilter' % MAIN_NS, {'ref': 'A1:' + xlsx_column(len(rows[0])) + str(len(rows))})
    ct = "http://schemas.openxmlformats.org/package/2006/content-types"
    root = ET.Element('{%s}Types' % ct)
    ET.SubElement(root, '{%s}Default' % ct, {'Extension': 'rels', 'ContentType': 'application/vnd.openxmlformats-package.relationships+xml'})
    ET.SubElement(root, '{%s}Default' % ct, {'Extension': 'xml', 'ContentType': 'application/xml'})
    ET.SubElement(root, '{%s}Override' % ct, {'PartName': '/xl/workbook.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'})
    ET.SubElement(root, '{%s}Override' % ct, {'PartName': '/xl/worksheets/sheet1.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet+xml'})
    ET.SubElement(root, '{%s}Override' % ct, {'PartName': '/xl/styles.xml', 'ContentType': 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'})
    wb = ET.Element('{%s}workbook' % MAIN_NS)
    sheets = ET.SubElement(wb, '{%s}sheets' % MAIN_NS)
    ET.SubElement(sheets, '{%s}sheet' % MAIN_NS, {'name': 'TradeDocs', 'sheetId': '1', '{%s}id' % REL_NS: 'rId1'})
    rels = ET.Element('{%s}Relationships' % PKG_REL_NS)
    ET.SubElement(rels, '{%s}Relationship' % PKG_REL_NS, {'Id': 'rId1', 'Type': REL_NS + '/worksheet', 'Target': 'worksheets/sheet1.xml'})
    ET.SubElement(rels, '{%s}Relationship' % PKG_REL_NS, {'Id': 'rId2', 'Type': REL_NS + '/styles', 'Target': 'styles.xml'})
    rootrels = ET.Element('{%s}Relationships' % PKG_REL_NS)
    ET.SubElement(rootrels, '{%s}Relationship' % PKG_REL_NS, {'Id': 'rId1', 'Type': REL_NS + '/officeDocument', 'Target': 'xl/workbook.xml'})
    styles = ET.fromstring('''<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173E67"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>''')
    buff = BytesIO()
    with ZipFile(buff, 'w', ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', ET.tostring(root, encoding='utf-8', xml_declaration=True))
        z.writestr('_rels/.rels', ET.tostring(rootrels, encoding='utf-8', xml_declaration=True))
        z.writestr('xl/workbook.xml', ET.tostring(wb, encoding='utf-8', xml_declaration=True))
        z.writestr('xl/styles.xml', ET.tostring(styles, encoding='utf-8', xml_declaration=True))
        z.writestr('xl/_rels/workbook.xml.rels', ET.tostring(rels, encoding='utf-8', xml_declaration=True))
        z.writestr('xl/worksheets/sheet1.xml', ET.tostring(sheet, encoding='utf-8', xml_declaration=True))
    return buff.getvalue()


def read_workbook(raw):
    ns = {'m': MAIN_NS}
    rows = []
    with ZipFile(BytesIO(raw)) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            shared = [''.join(t.text or '' for t in si.findall('.//m:t', ns)) for si in root.findall('m:si', ns)]
        sheet_name = next((n for n in z.namelist() if n.startswith('xl/worksheets/') and n.endswith('.xml')), None)
        if not sheet_name:
            raise ValueError('工作簿没有可读取的工作表')
        root = ET.fromstring(z.read(sheet_name))
        for rowel in root.findall('.//m:sheetData/m:row', ns):
            values = []
            for cell in rowel.findall('m:c', ns):
                ref = cell.get('r', 'A1')
                letters = ''.join(ch for ch in ref if ch.isalpha())
                col = 0
                for ch in letters:
                    col = col * 26 + ord(ch.upper()) - 64
                while len(values) < col:
                    values.append(None)
                typ = cell.get('t')
                val = cell.find('m:v', ns)
                if typ == 'inlineStr':
                    value = ''.join(t.text or '' for t in cell.findall('.//m:t', ns))
                elif val is None:
                    value = None
                elif typ == 's':
                    value = shared[int(val.text)]
                else:
                    try:
                        value = float(val.text)
                        value = int(value) if value.is_integer() else value
                    except Exception:
                        value = val.text
                values[col - 1] = value
            rows.append(values)
    return rows


# --------------------------------------------------------------------------
# Import / export field definitions
# --------------------------------------------------------------------------
CUSTOMER_FIELDS = ['name', 'country', 'city', 'address', 'shippingAddress', 'contact',
                   'email', 'phone', 'fax', 'taxId', 'payment', 'incoterm',
                   'defaultCurrency', 'packingNotes', 'docNote', 'whatsapp']
# `whatsapp` 必须追加在末尾：import_rows 对「无表头旧表」按 CUSTOMER_FIELDS 的位置映射，
# 插在中间会让旧文件的列整体错位。字段值只存本机客户档案，不进入任何单证字段。
PRODUCT_FIELDS = ['name', 'model', 'material', 'specification', 'color', 'hardness',
                  'dimensions', 'unit', 'unitOptions', 'packageMethod', 'qtyPerCarton',
                  'grossWeight', 'netWeight', 'cartonDimensions', 'price', 'hsCode',
                  'origin', 'moq', 'leadTime', 'docDescription']
NUMERIC_PRODUCT_FIELDS = ('price', 'qtyPerCarton', 'grossWeight', 'netWeight', 'moq')
ALIASES = {
    'name': ['name', 'company', 'company name', '客户名称', '公司名称', '产品名称', 'product name'],
    'model': ['model', '型号', 'part no', 'part number', 'model no'],
    'country': ['country', '国家'], 'city': ['city', '城市'],
    'address': ['address', '地址', 'bill to', '账单地址'],
    'shippingAddress': ['shipping address', 'shippingaddress', 'ship to', '收货地址'],
    'contact': ['contact', 'contact person', '联系人'],
    'email': ['email', '邮箱'], 'phone': ['phone', 'telephone', 'tel', '电话'],
    'fax': ['fax', '传真'],
    'whatsapp': ['whatsapp', 'whats app', 'whatsapp no', 'whatsapp number',
                 'whatsapp 号码', 'whatsapp号码', '即时通讯'],
    'taxId': ['tax id', 'vat', 'vat/tax id', '税号', 'siret', 'eori'],
    'payment': ['payment', 'payment terms', '付款方式'],
    'incoterm': ['incoterm', 'trade terms', '贸易术语'],
    'defaultCurrency': ['default currency', '报价币种', 'currency'],
    'packingNotes': ['packing notes', '装箱要求'],
    'docNote': ['doc note', '单证要求', 'invoice requirement'],
    'material': ['material', '材料'], 'specification': ['specification', 'spec', '规格'],
    'color': ['color', '颜色'], 'hardness': ['hardness', 'shore a', '硬度'],
    'dimensions': ['dimensions', '产品尺寸'],
    'unit': ['unit', 'uom', '单位'], 'unitOptions': ['unit options', '可选单位'],
    'packageMethod': ['packing', 'package method', '包装方式'],
    'qtyPerCarton': ['qty per carton', 'quantity per carton', '每箱数量'],
    'grossWeight': ['gross weight', '毛重'], 'netWeight': ['net weight', '净重'],
    'cartonDimensions': ['carton dimensions', 'carton size', '箱规', '单箱尺寸'],
    'price': ['price', 'unit price', '单价'],
    'hsCode': ['hs code', 'hscode', '商品编码'],
    'origin': ['origin', 'country of origin', '原产国'],
    'moq': ['moq', '最小起订量'], 'leadTime': ['lead time', '交期'],
    'docDescription': ['doc description', '单证描述', '产品详细描述'],
}


def parse_dimensions(value):
    parts = re.split(r'[x×*]', str(value or '').lower())
    nums = []
    for part in parts:
        try:
            nums.append(float(part.strip()))
        except ValueError:
            return None
    if len(nums) != 3 or any(n <= 0 for n in nums):
        return None
    return nums[0] * nums[1] * nums[2] / 1_000_000


def validate_import_row(kind, item, row_number, seen, existing_keys, errors, warnings):
    """Append human-readable errors for one row. Returns True when row is usable."""
    ok = True
    name = str(item.get('name') or '').strip()
    if not name:
        errors.append({'row': row_number, 'field': 'name', 'value': '', 'message': '缺少名称，已跳过该行'})
        return False
    if kind == 'products':
        model = str(item.get('model') or '').strip()
        key = (name.lower(), model.lower())
        if key in seen:
            errors.append({'row': row_number, 'field': 'model', 'value': model or name,
                           'message': '文件内重复的产品名称+型号，已跳过重复行'})
            return False
        seen.add(key)
        if key in existing_keys:
            warnings.append({'row': row_number, 'field': 'model', 'value': model or name,
                             'message': '与现有档案同名同型号，将覆盖现有档案'})
        for field in NUMERIC_PRODUCT_FIELDS:
            raw = item.get(field, '')
            if raw in (None, ''):
                item[field] = 0 if field == 'price' else ''
                continue
            try:
                value = float(str(raw).replace(',', ''))
            except (TypeError, ValueError):
                errors.append({'row': row_number, 'field': field, 'value': str(raw), 'message': '不是有效数字'})
                ok = False
                continue
            if not math.isfinite(value) or value < 0:
                errors.append({'row': row_number, 'field': field, 'value': str(raw), 'message': '必须为非负数'})
                ok = False
                continue
            if field == 'qtyPerCarton' and value > 0 and not float(value).is_integer():
                errors.append({'row': row_number, 'field': field, 'value': str(raw), 'message': '每箱数量必须为正整数'})
                ok = False
                continue
            item[field] = int(value) if field == 'qtyPerCarton' and value > 0 else value
        if not str(item.get('unit') or '').strip():
            warnings.append({'row': row_number, 'field': 'unit', 'value': '', 'message': '计量单位为空，导入后按 PCS 处理'})
            item['unit'] = 'PCS'
        dims = str(item.get('cartonDimensions') or '').strip()
        if dims and parse_dimensions(dims) is None:
            errors.append({'row': row_number, 'field': 'cartonDimensions', 'value': dims,
                           'message': '箱规格式无效，应形如 40x30x25（厘米）'})
            ok = False
        gross, net = item.get('grossWeight'), item.get('netWeight')
        if isinstance(gross, (int, float)) and isinstance(net, (int, float)) and net > gross + 0.01:
            warnings.append({'row': row_number, 'field': 'netWeight', 'value': str(net),
                             'message': '单箱净重大于毛重，请核对'})
    else:
        key = name.lower()
        if key in seen:
            errors.append({'row': row_number, 'field': 'name', 'value': name, 'message': '文件内重复的客户名称，已跳过重复行'})
            return False
        seen.add(key)
        if key in existing_keys:
            warnings.append({'row': row_number, 'field': 'name', 'value': name,
                             'message': '与现有档案同名，将覆盖现有档案'})
        email = str(item.get('email') or '').strip()
        if email and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            errors.append({'row': row_number, 'field': 'email', 'value': email, 'message': '邮箱格式无效'})
            ok = False
    return ok


def import_rows(kind, values):
    fields = CUSTOMER_FIELDS if kind == 'customers' else PRODUCT_FIELDS
    headers = [str(v or '').strip().lower() for v in (values[0] if values else [])]
    known = set()
    for field in fields:
        known.update(ALIASES.get(field, []))
        known.add(field.lower())
        known.add(field)
    # If the first row is clearly a named header, match strictly by name.
    # Otherwise (old headerless sheets) fall back to positional mapping.
    named_header = sum(1 for h in headers if h in known) >= 2
    idx = {}
    for n, field in enumerate(fields):
        names = list(ALIASES.get(field, [])) + [field.lower(), field]
        found = next((i for i, h in enumerate(headers) if h in names), -1)
        idx[field] = found if (named_header or found >= 0) else n
    existing = collection_rows(kind)
    existing_keys = set()
    for row in existing:
        if kind == 'products':
            existing_keys.add((str(row.get('name', '')).strip().lower(), str(row.get('model', '')).strip().lower()))
        else:
            existing_keys.add(str(row.get('name', '')).strip().lower())
    errors, warnings, incoming = [], [], []
    seen = set()
    for row_number, row in enumerate(values[1:], start=2):
        item = {'id': str(uuid.uuid4())}
        for field in fields:
            pos = idx[field]
            if pos < 0:
                item[field] = ''
                continue
            val = row[pos] if pos < len(row) else None
            item[field] = '' if val is None else val
        if not any(str(v).strip() for v in item.values() if v is not None):
            continue
        if validate_import_row(kind, item, row_number, seen, existing_keys, errors, warnings):
            incoming.append(item)
    merged = {}
    for row in existing:
        key = ((str(row.get('name', '')).strip().lower(), str(row.get('model', '')).strip().lower())
               if kind == 'products' else str(row.get('name', '')).strip().lower())
        merged[key] = row
    for row in incoming:
        key = ((str(row.get('name', '')).strip().lower(), str(row.get('model', '')).strip().lower())
               if kind == 'products' else str(row.get('name', '')).strip().lower())
        old = merged.get(key)
        if old:
            row['id'] = old.get('id') or row['id']
            for extra in ('image', 'detailImage', 'prices'):
                if old.get(extra) and not row.get(extra):
                    row[extra] = old[extra]
        merged[key] = row
    save_collection(kind, list(merged.values()))
    return {'records': list(merged.values()), 'applied': len(incoming),
            'errors': errors, 'warnings': warnings}


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        pass  # never log payloads (bank / customer data)

    def end_headers(self):
        # Local single-user app: never serve a stale copy of JS/CSS from the
        # browser cache. Without this, an updated documents.js could stay cached
        # and the UI would silently keep running the previous code after an upgrade.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, status, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def send_bytes(self, status, raw, content_type, filename):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Disposition', 'attachment; filename="%s"' % filename)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_body(self):
        return json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.send_json(200, {'ok': True, 'version': VERSION, 'storage': 'sqlite',
                                        'database': DB.name, 'port': getattr(self.server, 'app_port', 8965),
                                        'entities': len(collection_rows('entities')),
                                        'accounts': len(collection_rows('accounts'))})
        if path == '/api/seed-status':
            return self.send_json(200, {'entities': len(collection_rows('entities')),
                                        'accounts': len(collection_rows('accounts')),
                                        'configPresent': CONFIG.exists()})
        if path == '/api/backups':
            folder = ROOT / 'backups'
            items = []
            if folder.exists():
                for p in sorted(folder.glob('TradeDocsPro-*.sqlite3'), key=lambda q: q.stat().st_mtime, reverse=True):
                    items.append({'name': p.name,
                                  'modified': datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec='seconds'),
                                  'size': p.stat().st_size})
            return self.send_json(200, items)
        if path == '/api/export/sqlite':
            snap = backup_database('manual-export')
            if not snap:
                return self.send_json(400, {'error': '数据库为空，无法导出快照'})
            return self.send_bytes(200, snap.read_bytes(), 'application/octet-stream', snap.name)
        if path.startswith('/api/export/xlsx/'):
            name = path.rsplit('/', 1)[-1]
            try:
                return self.send_bytes(200, self.make_xlsx(name),
                                       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                       'TradeDocsPro-%s.xlsx' % name)
            except Exception as e:
                return self.send_json(400, {'error': str(e)})
        if path == '/api/data':
            create_daily_backup()
            c = connect()
            data = {k: [] for k in COLLECTIONS}
            for k, rid, body in c.execute('SELECT collection,id,body FROM records ORDER BY rowid'):
                if k in data:
                    try:
                        data[k].append(json.loads(body))
                    except Exception:
                        pass
            marker = c.execute("SELECT value FROM meta WHERE key='cache_migration_done'").fetchone()
            used = c.execute("SELECT 1 FROM records WHERE collection IN ('orders','customers','products') LIMIT 1").fetchone()
            c.close()
            # Tells the UI whether a legacy browser-cache migration is still allowed.
            # Sales edition: a fresh database is never migration-eligible.
            data['cacheMigrated'] = True
            return self.send_json(200, data)
        if path == '/':
            self.path = '/index.html'
            path = '/index.html'
        if path.startswith('/product-images/') and re.match(r'^/product-images/[A-Za-z0-9_.-]+$', path):
            return super().do_GET()
        if path not in STATIC_FILES:
            return self.send_json(404, {'error': 'Not found'})
        return super().do_GET()

    def make_xlsx(self, name):
        if name == 'orders':
            head = ['Order No', 'Date', 'Buyer PO', 'Buyer', 'Country/City', 'Buyer Address', 'Ship To',
                    'Contact', 'Email', 'Currency', 'Reference Currency', 'FX Rate', 'Incoterm',
                    'Payment Terms', 'Lead Time', 'Validity', 'Deposit %', 'Ship Via',
                    'Port of Loading', 'Port of Destination', 'Seller Entity ID', 'Receiving Account ID',
                    'Status', 'Notes', 'Packing Confirmed', 'Product', 'Model', 'Material',
                    'Specification', 'Hardness', 'Color', 'Dimensions', 'Qty', 'Unit', 'Unit Price',
                    'Line Amount', 'HS Code', 'Origin', 'Packing Method', 'Qty per Carton',
                    'Carton Gross kg', 'Carton Net kg', 'Carton Dimensions cm']
            order_fields = ('no', 'date', 'po', 'buyer', 'country', 'buyerAddress',
                            'shipTo', 'contact', 'email', 'currency', 'refCurrency',
                            'fxRate', 'incoterm', 'payment', 'lead', 'valid',
                            'depositPct', 'shipVia', 'portLoad', 'portDest',
                            'entity', 'account', 'state', 'notes')
            line_fields = ('name', 'model', 'material', 'specification',
                           'hardness', 'color', 'dimensions', 'qty', 'unit',
                           'price', 'total', 'hsCode', 'origin',
                           'packageMethod', 'qtyPerCarton', 'grossWeight',
                           'netWeight', 'cartonDimensions')
            rows = [head]
            for o in collection_rows('orders'):
                for line in o.get('lines', []):
                    rows.append([o.get(k) for k in order_fields] +
                                ['Y' if o.get('packingConfirmed') else 'N'] +
                                [line.get(k) for k in line_fields])
            return make_workbook(rows)
        fields = CUSTOMER_FIELDS if name == 'customers' else PRODUCT_FIELDS if name == 'products' else None
        if not fields:
            raise ValueError('该集合不支持表格导出')
        rows = [fields]
        for item in collection_rows(name):
            rows.append([item.get(k, '') for k in fields])
        return make_workbook(rows)

    def do_PUT(self):
        parts = urlparse(self.path).path.strip('/').split('/')
        try:
            body = self.read_body()
        except Exception:
            return self.send_json(400, {'error': 'Invalid JSON'})
        if len(parts) != 3 or parts[:2] != ['api', 'collection'] or parts[2] not in COLLECTIONS or not isinstance(body, list):
            return self.send_json(404, {'error': 'Unknown collection'})
        if any(not isinstance(item, dict) for item in body):
            return self.send_json(400, {'error': 'Collection entries must be objects'})
        create_daily_backup()
        try:
            save_collection(parts[2], body)
        except Exception as e:
            return self.send_json(500, {'error': str(e)})
        return self.send_json(200, {'ok': True, 'count': len(body)})

    def do_POST(self):
        path = urlparse(self.path).path
        parts = path.strip('/').split('/')
        try:
            length = int(self.headers.get('Content-Length', '0') or '0')
            body = self.read_body() if length > 0 else {}
        except Exception:
            return self.send_json(400, {'error': 'Invalid JSON'})

        if path == '/api/upload-image':
            return self.upload_image(body)

        if path == '/api/reseed-config':
            if not isinstance(body, dict) or body.get('confirm') != 'RESEED':
                return self.send_json(400, {'error': '需要显式确认 RESEED'})
            result = seed_from_config()
            return self.send_json(200 if result.get('ok') else 400, result)

        if path == '/api/migrate':
            # Sales edition: browser-cache import is permanently disabled.
            # The local SQLite database is the only source of truth.
            return self.send_json(410, {'error': '此版本不支持浏览器缓存迁移；本机数据库为唯一数据源'})

        if len(parts) == 4 and parts[:3] == ['api', 'import', 'rows'] and parts[3] in ('customers', 'products'):
            values = body.get('rows') if isinstance(body, dict) else None
            if not isinstance(values, list) or not values:
                return self.send_json(400, {'error': '缺少数据行'})
            try:
                return self.send_json(200, {'ok': True, **import_rows(parts[3], values)})
            except Exception as e:
                return self.send_json(400, {'error': '导入失败：' + str(e)})

        if path == '/api/restore-snapshot':
            return self.restore_snapshot(body)

        if path == '/api/restore':
            return self.restore_json(body)

        return self.send_json(404, {'error': 'Not found'})

    # POST with a binary body is handled separately so we can read raw bytes.
    def handle_import_xlsx(self, kind):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length > 20 * 1024 * 1024:
                return self.send_json(400, {'error': '文件超过 20 MB'})
            raw = self.rfile.read(length)
            values = read_workbook(raw)
            if not values:
                return self.send_json(400, {'error': '工作簿没有表头'})
            result = import_rows(kind, values)
            return self.send_json(200, {'ok': True, **result})
        except Exception as e:
            return self.send_json(400, {'error': '导入失败：' + str(e)})

    def upload_image(self, body):
        if not isinstance(body, dict) or not body.get('data'):
            return self.send_json(400, {'error': '缺少图片数据'})
        match = re.match(r'^data:image/(png|jpeg|jpg|gif|webp);base64,(.+)$', str(body['data']), re.S)
        if not match:
            return self.send_json(400, {'error': '仅支持 PNG / JPEG / GIF / WebP 图片'})
        ext = 'jpg' if match.group(1) == 'jpeg' else match.group(1)
        try:
            raw = base64.b64decode(match.group(2), validate=True)
        except Exception:
            return self.send_json(400, {'error': '图片编码无效'})
        if len(raw) > 5 * 1024 * 1024:
            return self.send_json(400, {'error': '图片超过 5 MB'})
        IMAGE_DIR.mkdir(exist_ok=True)
        filename = 'img-%s.%s' % (uuid.uuid4().hex[:16], ext)
        (IMAGE_DIR / filename).write_bytes(raw)
        return self.send_json(200, {'ok': True, 'file': filename, 'url': '/product-images/' + filename})

    def validate_snapshot(self, path):
        if not path.exists() or path.stat().st_size < 512:
            return '快照文件不存在或已损坏'
        try:
            src = sqlite3.connect(str(path))
            check = src.execute('PRAGMA integrity_check').fetchone()
            tables = [r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            count = src.execute('SELECT COUNT(*) FROM records').fetchone()[0] if 'records' in tables else 0
            src.close()
            if not check or check[0] != 'ok':
                return '快照未通过 SQLite 完整性检查'
            if 'records' not in tables or count == 0:
                return '快照中没有可恢复的记录'
        except Exception as e:
            return '快照无法读取：' + str(e)
        return None

    def restore_snapshot(self, req):
        name = req.get('name', '') if isinstance(req, dict) else ''
        folder = (ROOT / 'backups').resolve()
        snap = (folder / name).resolve()
        if snap.parent != folder or not snap.name.startswith('TradeDocsPro-') or snap.suffix != '.sqlite3':
            return self.send_json(400, {'error': '无效的快照选择'})
        problem = self.validate_snapshot(snap)
        if problem:
            return self.send_json(400, {'error': '已取消恢复，当前数据库未改动：' + problem})
        try:
            safety = backup_database('pre-restore')
            if not safety:
                return self.send_json(500, {'error': '无法创建恢复前安全快照，已取消恢复'})
            src = sqlite3.connect(snap)
            rows = {}
            for key in BUSINESS_COLLECTIONS:
                rows[key] = src.execute('SELECT id,body FROM records WHERE collection=?', (key,)).fetchall()
                for rid, payload in rows[key]:
                    json.loads(payload)  # fail before touching the live DB
            src.close()
            c = connect()
            try:
                c.execute('BEGIN IMMEDIATE')
                for key, items in rows.items():
                    c.execute('DELETE FROM records WHERE collection=?', (key,))
                    for rid, payload in items:
                        c.execute('INSERT INTO records(collection,id,body) VALUES(?,?,?)', (key, rid, payload))
                c.commit()
            except Exception:
                c.rollback()
                raise
            finally:
                c.close()
            return self.send_json(200, {'ok': True, 'safetyBackup': safety.name})
        except Exception as e:
            return self.send_json(500, {'error': '恢复失败，原数据库未改动：' + str(e)})

    def restore_json(self, data):
        if not isinstance(data, dict):
            return self.send_json(400, {'error': '备份必须是 JSON 对象'})
        for key in BUSINESS_COLLECTIONS:
            if key in data and not isinstance(data[key], list):
                return self.send_json(400, {'error': '集合格式无效：' + key})
        if any(not isinstance(x, dict) for key in BUSINESS_COLLECTIONS for x in data.get(key, [])):
            return self.send_json(400, {'error': '集合只能包含对象'})
        if any(not x.get('no') or not isinstance(x.get('lines'), list) for x in data.get('orders', [])):
            return self.send_json(400, {'error': '订单缺少编号或产品明细，已取消恢复'})
        try:
            safety = backup_database('pre-restore')
            if not safety:
                return self.send_json(500, {'error': '无法创建恢复前安全快照，已取消恢复'})
            c = connect()
            try:
                c.execute('BEGIN IMMEDIATE')
                for key in BUSINESS_COLLECTIONS:
                    c.execute('DELETE FROM records WHERE collection=?', (key,))
                    for i, item in enumerate(data.get(key, [])):
                        rid = str(item.get('id') or 'restored-%d' % i)
                        item['id'] = rid
                        c.execute('INSERT OR REPLACE INTO records(collection,id,body) VALUES(?,?,?)',
                                  (key, rid, json.dumps(item, ensure_ascii=False)))
                c.commit()
            except Exception:
                c.rollback()
                raise
            finally:
                c.close()
            return self.send_json(200, {'ok': True, 'safetyBackup': safety.name,
                                        'note': '账户与主体资料保持本机当前版本，未被备份覆盖'})
        except Exception as e:
            return self.send_json(500, {'error': '恢复失败，原数据库未改动：' + str(e)})


# Allow raw-binary POSTs for XLSX import while keeping JSON POSTs above.
_original_do_POST = Handler.do_POST


def do_POST_dispatch(self):
    path = urlparse(self.path).path
    parts = path.strip('/').split('/')
    if len(parts) == 4 and parts[:3] == ['api', 'import', 'xlsx'] and parts[3] in ('customers', 'products'):
        return self.handle_import_xlsx(parts[3])
    return _original_do_POST(self)


Handler.do_POST = do_POST_dispatch


def pick_port(start=8965, end=8995, preferred=None):
    candidates = ([preferred] if preferred else []) + list(range(start, end + 1))
    for port in candidates:
        if not port:
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return None


def main():
    preferred = None
    if '--port' in sys.argv:
        try:
            preferred = int(sys.argv[sys.argv.index('--port') + 1])
        except (ValueError, IndexError):
            pass
    seed = seed_from_config()
    connect().close()
    create_daily_backup()
    port = pick_port(preferred=preferred)
    if port is None:
        print('错误：8965-8995 端口都被占用。请关闭其它 TradeDocs Pro 实例或指定 --port。')
        return 1
    url = 'http://127.0.0.1:%d/' % port
    RUNTIME.write_text(json.dumps({'status': 'running', 'version': VERSION, 'port': port,
                                   'url': url, 'pid': os.getpid(),
                                   'startedAt': datetime.now().isoformat(timespec='seconds'),
                                   'database': DB.name, 'seed': seed}, ensure_ascii=False, indent=2),
                       encoding='utf-8')
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.app_port = port
    print('=' * 62)
    print(' TradeDocs Pro v%s  ·  本机离线运行' % VERSION)
    print(' 地址：%s' % url)
    print(' 数据库：%s' % DB)
    print(' 主体/账户播种：%s' % json.dumps(seed, ensure_ascii=False))
    print(' 只监听 127.0.0.1，不联网、不上传任何资料。')
    print(' 使用期间请保持此窗口打开；退出按 Ctrl+C。')
    print('=' * 62)
    if '--no-browser' not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n正在停止服务…')
    finally:
        server.server_close()
        try:
            info = json.loads(RUNTIME.read_text(encoding='utf-8'))
            info['status'] = 'stopped'
            info['stoppedAt'] = datetime.now().isoformat(timespec='seconds')
            RUNTIME.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception:
            pass
        print('已安全退出，数据已保存在本机 SQLite。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
