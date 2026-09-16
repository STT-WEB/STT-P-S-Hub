/**
 * NOVA – PURCHASE & STORE HUB
 * 04-import.js — นำเข้า PO/RR จาก My Account · จับคู่ PO↔RR · สร้างตาราง PO ค้างรับ
 *
 * พิสูจน์กับข้อมูลจริง 15 ก.ย. 2569 (PO 7,951 · RR 7,513 บรรทัด)
 *   จับคู่ได้ 7,375/7,375 = 100%  ·  C1 = 99.97%  ·  รับเกิน 0 บรรทัด
 *
 * กฎเหล็ก
 *  - จับคู่ด้วย "รหัสสินค้า" เป็นหลักเสมอ 5 ชั้น — ไม่ใช้ List No. และไม่เดา
 *  - ที่จับคู่ไม่ได้ → เข้าคิวให้คนตัดสิน ไม่ยัดลงมั่ว
 *  - คีย์ถาวรของทุกบรรทัด = poid + listno
 *  - PO ที่ยกเลิก (cancelflag=Y) เก็บไว้ แต่ไม่นับเข้าการจับคู่และค้างรับ
 */

/** ---------- ตัวช่วยแปลงค่า ---------- */
function s_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return (v === Math.floor(v)) ? String(Math.floor(v)) : String(v);
  return String(v).trim();
}
function num_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  var t = String(v).replace(/[^0-9.\-]/g, '');
  var n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
function ncd_(v) {                       // รหัสสินค้ามาตรฐาน: 8-81641001 -> 81641001
  var t = s_(v).toUpperCase();
  t = t.replace(/^\d-/, '').replace(/^INT-/, '');
  return t;
}
function nn_(v) {                        // ชื่อสินค้ามาตรฐาน
  return s_(v).toLowerCase()
    .replace(/’/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, '');
}
function cat_(codeN) {                   // หมวดสินค้า -> สโตร์ต้องกดรับไหม
  var c = s_(codeN);
  if (!c) return '';
  var d = c.charAt(0);
  return /[0-9]/.test(d) ? d : '?';
}
function dt_(v) {
  if (v instanceof Date) return v;
  var t = s_(v);
  if (!t) return '';
  var m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  var d = new Date(t);
  return isNaN(d.getTime()) ? '' : d;
}
function days_(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return '';
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function fileIdOf_(url) {
  var t = s_(url);
  var m = t.match(/[-\w]{25,}/);
  if (!m) throw new Error('อ่านรหัสไฟล์จากลิงก์ไม่ได้ — วางลิงก์ Google Sheet เต็ม ๆ');
  return m[0];
}

/** ---------- เขียนข้อมูลลงแท็บแบบเป็นก้อน (ล้างของเดิมก่อน) ---------- */
function writeRows_(fileId, tab, cols, rows) {
  var ss = SpreadsheetApp.openById(fileId);
  var sh = ss.getSheetByName(tab);
  if (!sh) throw new Error('ไม่พบแท็บ ' + tab + ' — กด "ติดตั้งโครงข้อมูล" ก่อน');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clearContent();
  if (!rows.length) return 0;
  var CH = 2000, at = 2;
  for (var i = 0; i < rows.length; i += CH) {
    var part = rows.slice(i, i + CH);
    sh.getRange(at, 1, part.length, cols.length).setValues(part);
    at += part.length;
    SpreadsheetApp.flush();
  }
  return rows.length;
}

/** =========================================================
 *  อ่าน PO และ RR จาก "ไฟล์ของปีนั้น" โดยตรง
 *  เบียร์ดึงจาก My Account มาวางทับแท็บ ps_report / RR ทุกวัน
 *  ระบบจึงอ่านจากแท็บนั้นตรง ๆ ไม่ก๊อปออกมาเก็บซ้ำอีกที่
 *  ========================================================= */
function readSrcPO_(yid) {
  var src = fetchTabValues_(yid, TAB.SRC_PO);
  if (!src || src.length < 2)
    throw new Error('ไม่พบข้อมูลในแท็บ ' + TAB.SRC_PO + ' — วางข้อมูล PO จาก My Account ก่อน');
  var h = [];
  for (var hh = 0; hh < src[0].length; hh++) h.push(s_(src[0][hh]));
  function I(n) { return colIdx_(h, n); }
  var c = {
    ship: I(['shipdate']), date: I(['docudate']), docu: I(['docuno']), poid: I(['poid']),
    cancel: I(['cancelflag']), ln: I(['listno']), gname: I(['goodname']),
    qty: I(['goodqty2']), price: I(['goodprice2']), amnt: I(['goodamnt']),
    vcode: I(['vendorcode']), vname: I(['vendorname']), gcode: I(['goodcode']),
    unit: I(['goodunitname']), job: I(['jobcode']), jname: I(['jobname'])
  };
  if (c.poid < 0 || c.ln < 0 || c.gcode < 0)
    throw new Error('แท็บ ' + TAB.SRC_PO + ' ขาดคอลัมน์จำเป็น (poid / listno / goodcode) — หัวตารางที่เจอ: ' + h.join(' | '));

  var live = [], cancelled = [], skipped = 0, seen = {};
  for (var i = 1; i < src.length; i++) {
    var r = src[i];
    var poid = s_(r[c.poid]), ln = s_(r[c.ln]), docu = s_(r[c.docu]);
    if (!poid || !ln || !docu || !/^POR/i.test(docu)) { if (r.join('').trim()) skipped++; continue; }
    var key = poid + '|' + ln;
    if (seen[key]) { skipped++; continue; }
    seen[key] = 1;
    var codeN = ncd_(r[c.gcode]);
    var o = {
      docu: docu, poid: poid, ln: ln, code: codeN, job: s_(r[c.job]),
      name: nn_(r[c.gname]), price: num_(r[c.price]), qty: num_(r[c.qty]), amnt: num_(r[c.amnt]),
      recv: 0,
      gname: s_(r[c.gname]), unit: s_(r[c.unit]), vcode: s_(r[c.vcode]), vname: s_(r[c.vname]),
      jname: s_(r[c.jname]), date: dt_(r[c.date]), ship: dt_(r[c.ship]), cat: cat_(codeN)
    };
    if (s_(r[c.cancel]).toUpperCase() === 'Y') cancelled.push(o); else live.push(o);
  }
  return { live: live, cancelled: cancelled, read: src.length - 1, skipped: skipped };
}

function readSrcRR_(yid) {
  var src = fetchTabValues_(yid, TAB.SRC_RR);
  if (!src || src.length < 2)
    throw new Error('ไม่พบข้อมูลในแท็บ ' + TAB.SRC_RR + ' — วางข้อมูลใบรับจาก My Account ก่อน');
  var h = [];
  for (var hh = 0; hh < src[0].length; hh++) h.push(s_(src[0][hh]));
  function I(n) { return colIdx_(h, n); }
  var c = {
    date: I(['docudate']), docu: I(['docuno']), pono: I(['pono']), ln: I(['listno']),
    gcode: I(['goodcode']), gname: I(['goodname']), qty: I(['goodqty2']), price: I(['goodprice2']),
    dformula: I(['gooddiscformula']), damnt: I(['gooddiscamnt']), amnt: I(['goodamnt']),
    vcode: I(['vendorcode']), vname: I(['vendorname']), job: I(['jobcode']), jname: I(['jobname']),
    unit: I(['goodunitname']), inv: I(['invno']), adv: I(['advnamnt']), net: I(['netamnt'])
  };
  if (c.docu < 0 || c.pono < 0 || c.gcode < 0)
    throw new Error('แท็บ ' + TAB.SRC_RR + ' ขาดคอลัมน์จำเป็น (docuno / pono / goodcode)');

  var list = [], skipped = 0;
  for (var i = 1; i < src.length; i++) {
    var r = src[i];
    var docu = s_(r[c.docu]), pono = s_(r[c.pono]);
    if (!docu || !pono) { if (r.join('').trim()) skipped++; continue; }
    var codeN = ncd_(r[c.gcode]);
    list.push({
      docu: docu, pono: pono, ln: s_(r[c.ln]), date: dt_(r[c.date]),
      code: codeN, name: nn_(r[c.gname]), price: num_(r[c.price]), qty: num_(r[c.qty]),
      job: s_(r[c.job]),
      gcode: s_(r[c.gcode]), gname: s_(r[c.gname]), amnt: num_(r[c.amnt]),
      dformula: s_(r[c.dformula]), damnt: num_(r[c.damnt]),
      vcode: s_(r[c.vcode]), vname: s_(r[c.vname]), jname: s_(r[c.jname]), unit: s_(r[c.unit]),
      invno: c.inv >= 0 ? s_(r[c.inv]) : '', adv: c.adv >= 0 ? num_(r[c.adv]) : 0,
      net: c.net >= 0 ? num_(r[c.net]) : 0
    });
  }
  return { list: list, read: src.length - 1, skipped: skipped };
}

/** เก็บใบรับของปีนี้ลงไฟล์สะสม RR-ALL (ของปีอื่นคงไว้ ห้ามลบ) */
function saveRrAll_(rrList, year) {
  var rid = psAllFile_();
  var old = fetchTabValues_(rid, 'RR_ALL') || [];
  var keep = [];
  for (var k = 1; k < old.length; k++) if (s_(old[k][0]) !== String(year)) keep.push(old[k]);
  var now = new Date(), fresh = [];
  for (var i = 0; i < rrList.length; i++) {
    var x = rrList[i];
    fresh.push([year, x.docu, x.date, x.pono, x.ln, x.gcode, x.code, x.gname,
                x.qty, x.price, x.dformula, x.damnt, x.amnt, x.vcode, x.vname,
                x.job, x.jname, x.unit, x.invno, x.adv, x.net, now]);
  }
  writeRows_(rid, 'RR_ALL', SCHEMA.RRALL.RR_ALL, keep.concat(fresh));
  return { kept: keep.length, fresh: fresh.length };
}

/** ---------------------------------------------------------
 *  เครื่องจับคู่ (แยกออกมาให้บริสุทธิ์ = ทดสอบได้โดยไม่ต้องต่อ Google Sheets)
 *  poList : [{docu,poid,ln,code,job,name,price,qty,recv}]  ← จะถูกแก้ค่า recv ในตัว
 *  rrList : [{docu,date,pono,ln,code,job,name,price,qty}]
 *  ------------------------------------------------------- */
function psMatchEngine_(poList, rrList) {
  var TIERS = [
    ['C1', function (x) { return x.code + '|' + x.job + '|' + x.name + '|' + x.price.toFixed(4); }],
    ['C2', function (x) { return x.code + '|' + x.job + '|' + x.name; }],
    ['C3', function (x) { return x.code + '|' + x.name + '|' + x.price.toFixed(4); }],
    ['C4', function (x) { return x.code + '|' + x.job; }],
    ['C5', function (x) { return x.code; }]
  ];

  var byDoc = {};
  for (var i = 0; i < poList.length; i++) {
    poList[i].recv = 0;
    (byDoc[poList[i].docu] = byDoc[poList[i].docu] || []).push(poList[i]);
  }

  var work = rrList.slice().sort(function (a, b) {
    var da = (a.date instanceof Date) ? a.date.getTime() : 0;
    var db = (b.date instanceof Date) ? b.date.getTime() : 0;
    if (da !== db) return da - db;
    if (a.docu !== b.docu) return a.docu < b.docu ? -1 : 1;
    return num_(a.ln) - num_(b.ln);
  });

  var links = [], tiers = {}, noPO = 0, unmatched = 0, over = 0;
  for (var m = 0; m < work.length; m++) {
    var rr = work[m], plist = byDoc[rr.pono];
    if (!plist) { noPO++; continue; }
    var hit = false;
    for (var t = 0; t < TIERS.length && !hit; t++) {
      var nameT = TIERS[t][0], fn = TIERS[t][1], key = fn(rr);
      var cands = [];
      for (var z = 0; z < plist.length; z++) if (fn(plist[z]) === key) cands.push(plist[z]);
      if (nameT === 'C5' && cands.length !== 1) continue;
      if (!cands.length) continue;
      cands.sort(function (a, b) { return num_(a.ln) - num_(b.ln); });
      var left = rr.qty;
      for (var y = 0; y < cands.length && left > 1e-9; y++) {
        var p = cands[y], room = p.qty - p.recv;
        if (room <= 1e-9) continue;
        var take = Math.min(room, left);
        p.recv += take; left -= take;
        links.push([rr.docu, rr.ln, rr.pono, p.poid, p.ln, take, nameT]);
      }
      if (left < rr.qty) {
        hit = true;
        tiers[nameT] = (tiers[nameT] || 0) + 1;
        if (left > 1e-9) over++;              // รับมากกว่าที่ PO สั่ง
      }
    }
    if (!hit) unmatched++;
  }
  return { links: links, tiers: tiers, noPO: noPO, unmatched: unmatched, over: over };
}

/** =========================================================
 *  จับคู่ PO↔RR แล้วสร้างตาราง PO ค้างรับ
 *  ========================================================= */
function psRebuild(auth) {
  requireRole_(auth, ['PURCHASE', 'ADMIN']);
  var t0 = new Date().getTime();
  var year = currentYearTH_();
  var yid = psYearFile_();

  // ---- อ่านจากแท็บของเบียร์ในไฟล์เดียวกัน ----
  var P = readSrcPO_(yid);
  var R = readSrcRR_(yid);
  var poRows = P.live, rrList = R.list;

  // ---- จับคู่ ----
  var M = psMatchEngine_(poRows, rrList);
  var links = M.links, tierN = M.tiers, noPO = M.noPO, unmatched = M.unmatched, now = new Date();
  for (var li = 0; li < links.length; li++) links[li].push(now);
  writeRows_(yid, TAB.LINK, SCHEMA.YEAR[TAB.LINK], links);

  // ---- เก็บใบรับลงไฟล์สะสมข้ามปี ----
  var rrSaved = { kept: 0, fresh: 0 };
  try { rrSaved = saveRrAll_(rrList, year); } catch (eRR) { rrSaved.error = String(eRR.message || eRR); }

  // ---- สร้างแท็บ "รายงาน PO" : ทุกบรรทัด (ค้าง + รับครบ + ปิด + ยกเลิก) ----
  var EDIT = poEditMap_();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var idx = [], openLines = 0, openVal = 0, nClosed = 0, nManual = 0, billedTotal = 0;

  function pushRow(p, cancelled) {
    var ed = EDIT[p.poid + '|' + p.ln] || null;
    var manual  = ed ? ed.recv_manual : 0;
    var billed  = ed ? ed.billed_amount : 0;
    var closed  = !!(ed && ed.closed);
    var gotAll  = p.recv + manual;
    var remain  = Math.max(0, p.qty - gotAll);
    var amntRem = 0;

    var status;
    if (cancelled)           status = 'ยกเลิก';
    else if (closed)         status = 'ปิดรายการ';
    else if (remain <= 1e-6) status = 'รับครบ';
    else if (gotAll > 0)     status = 'รับบางส่วน';
    else                     status = 'ยังไม่รับ';
    if (!cancelled && !closed && manual > 0 && remain > 1e-6) status += ' (ยืนยันเอง)';

    if (!cancelled && !closed && remain > 1e-6) {
      amntRem = p.qty > 0 ? p.amnt * remain / p.qty : 0;
      if (billed > 0) { billedTotal += billed; amntRem = Math.max(0, amntRem - billed); }
      openLines++; openVal += amntRem;
      if (manual > 0) nManual++;
    }
    if (closed) nClosed++;

    var mth = (p.date instanceof Date) ? (p.date.getMonth() + 1) : '';
    var row = [];
    row[IDX.docuno] = p.docu;          row[IDX.listno] = p.ln;
    row[IDX.docudate] = p.date;        row[IDX.vendorname] = p.vname;
    row[IDX.goodcode_n] = p.code;      row[IDX.goodname] = p.gname;
    row[IDX.unit] = p.unit;            row[IDX.jobcode] = p.job;
    row[IDX.ordered] = p.qty;          row[IDX.got] = gotAll;
    row[IDX.remain] = remain;          row[IDX.status] = status;
    row[IDX.price] = p.price;          row[IDX.amnt] = p.amnt;
    row[IDX.amnt_remain] = amntRem;    row[IDX.age_days] = days_(p.date, today);
    row[IDX.shipdate] = p.ship;        row[IDX.newship] = (ed && ed.newship) ? ed.newship : '';
    row[IDX.recv_rr] = p.recv;         row[IDX.recv_manual] = manual;
    row[IDX.billed_amount] = billed;   row[IDX.intl_status] = ed ? ed.intl_status : '';
    row[IDX.note] = ed ? ed.note : ''; row[IDX.closed] = closed ? 'Y' : '';
    row[IDX.cancelled] = cancelled ? 'Y' : '';
    row[IDX.cat] = p.cat;
    row[IDX.is_intl] = /^POR\.INT/i.test(p.docu) ? 'ต่างประเทศ' : 'ในประเทศ';
    row[IDX.jobname] = p.jname;        row[IDX.poid] = p.poid;
    row[IDX.year_th] = year;           row[IDX.month] = mth;
    row[IDX.vendorcode] = p.vcode;     row[IDX.updated_at] = now;
    idx.push(row);
  }

  for (var k = 0; k < poRows.length; k++) pushRow(poRows[k], false);
  // บรรทัดที่ยกเลิกต้องอยู่ครบ — เบียร์สั่งไว้ว่าห้ามซ่อนทิ้ง
  for (var cq = 0; cq < P.cancelled.length; cq++) pushRow(P.cancelled[cq], true);

  // เรียง: ค้างรับมูลค่ามากก่อน แล้วที่เหลือเรียงตามเลขที่ PO
  idx.sort(function (a, b) {
    if (b[IDX.amnt_remain] !== a[IDX.amnt_remain]) return b[IDX.amnt_remain] - a[IDX.amnt_remain];
    return a[IDX.docuno] < b[IDX.docuno] ? -1
         : (a[IDX.docuno] > b[IDX.docuno] ? 1 : num_(a[IDX.listno]) - num_(b[IDX.listno]));
  });
  writeRows_(yid, TAB.PO, SCHEMA.YEAR[TAB.PO], idx);
  cacheDrop_(['PS_OPENPO', 'PS_POIDX', 'PS_RRALL', 'PS_RRLINK', 'PS_PODOCS']);

  // แท็บที่เหลือให้คนอ่าน — พังแล้วห้ามลากการคำนวณพังไปด้วย
  var rpt = null, rptErr = '';
  try { rpt = psBuildReports(null); }
  catch (eR) { rptErr = String(eR && eR.message ? eR.message : eR); }

  logImport_(yid, auth, 'REFRESH', yid, P.read + R.read, idx.length,
             P.skipped + R.skipped, new Date().getTime() - t0);

  var matched = 0;
  for (var tn in tierN) matched += tierN[tn];
  return {
    year: year,
    poRead: P.read, poSkipped: P.skipped, rrRead: R.read, rrSkipped: R.skipped,
    poLines: poRows.length, rrLines: rrList.length,
    matched: matched, tiers: tierN, noPO: noPO, unmatched: unmatched, over: M.over,
    matchPct: rrList.length ? (matched / (rrList.length - noPO) * 100) : 0,
    indexLines: idx.length,
    openLines: openLines, openDocs: countOpenDocs_(idx), openValue: openVal,
    closed: nClosed, manualRecv: nManual, billedTotal: billedTotal,
    rrAll: rrSaved, report: rpt, reportError: rptErr,
    ms: new Date().getTime() - t0
  };
}

function countOpenDocs_(rows) {
  var o = {}, n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (num_(rows[i][IDX.remain]) <= 1e-6) continue;
    if (s_(rows[i][IDX.cancelled]) === 'Y' || s_(rows[i][IDX.closed]) === 'Y') continue;
    if (!o[rows[i][IDX.docuno]]) { o[rows[i][IDX.docuno]] = 1; n++; }
  }
  return n;
}

function logImport_(fileId, auth, kind, srcId, read, written, skipped, ms) {
  try {
    var sh = SpreadsheetApp.openById(fileId).getSheetByName(TAB.IMPORT);
    if (!sh) return;
    var me = roleOf_(auth);
    sh.appendRow([Utilities.getUuid().slice(0, 8), new Date(), me.name || me.label,
                  kind, srcId, read, written, skipped, ms, 'OK', '']);
  } catch (e) {}
}

/** =========================================================
 *  อ่านตารางกลาง PS_PO_INDEX — ใช้ร่วมกันทั้งหน้าฐานข้อมูล PO และหน้า PO ค้างรับ
 *  → สองหน้าอ่านตัวเลขจากที่เดียวกัน ไม่มีทางไม่ตรงกัน
 *  ========================================================= */
/** ตำแหน่งคอลัมน์ของแท็บ "รายงาน PO" — มาจากนิยามกลางใน 03-setup.js ที่เดียว */
var IDX = idxOf_(PO_COLS);

function poIndexRows_() {
  return cacheOr_('PS_POIDX', TTL.HOT, function () {
    var v = fetchTabValues_(psYearFile_(), TAB.PO) || [];
    return v.slice(1);
  });
}

/** แปลงแถวดิบเป็นวัตถุที่หน้าเว็บใช้ (ตัดราคาถ้าไม่มีสิทธิ์) */
function idxRow_(r, canPrice, canEdit) {
  return {
    po: s_(r[IDX.docuno]), poid: s_(r[IDX.poid]), ln: s_(r[IDX.listno]),
    date: fmtD_(r[IDX.docudate]), ship: fmtD_(r[IDX.shipdate]), newship: fmtD_(r[IDX.newship]),
    month: num_(r[IDX.month]),
    code: s_(r[IDX.goodcode_n]), name: s_(r[IDX.goodname]), unit: s_(r[IDX.unit]),
    vendor: s_(r[IDX.vendorname]), vcode: s_(r[IDX.vendorcode]),
    job: s_(r[IDX.jobcode]), jobname: s_(r[IDX.jobname]),
    cat: s_(r[IDX.cat]), intlPo: s_(r[IDX.is_intl]) === 'ต่างประเทศ',
    cancelled: s_(r[IDX.cancelled]) === 'Y', closed: s_(r[IDX.closed]) === 'Y',
    ordered: num_(r[IDX.ordered]), received: num_(r[IDX.recv_rr]),
    manual: num_(r[IDX.recv_manual]), remain: num_(r[IDX.remain]),
    price: canPrice ? num_(r[IDX.price]) : null,
    amnt:  canPrice ? num_(r[IDX.amnt]) : null,
    value: canPrice ? num_(r[IDX.amnt_remain]) : null,
    billed: canPrice ? num_(r[IDX.billed_amount]) : null,
    intl: s_(r[IDX.intl_status]), note: s_(r[IDX.note]),
    status: s_(r[IDX.status]), age: num_(r[IDX.age_days]),
    canEdit: canEdit
  };
}

/** ---------- หน้าฐานข้อมูล PO (เห็นทุกบรรทัดจาก My Account) ---------- */
function getPoAll(auth, o) {
  var myRole  = roleOf_(auth).role;
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC', 'STORE']);
  var canPrice = PRICE_ROLES.indexOf(myRole) >= 0;
  var canEdit  = ['PURCHASE', 'ADMIN'].indexOf(myRole) >= 0;
  o = o || {};

  var rows = poIndexRows_();
  var q     = s_(o.q).toLowerCase();
  var st    = s_(o.status);                 // '' | open | done | cancelled | closed | partial
  var mth   = s_(o.month);
  var cat   = s_(o.cat);
  var intl  = s_(o.intl);                   // '' | Y | N
  var vend  = s_(o.vendor).toLowerCase();
  var sort  = s_(o.sort) || 'value';
  var size  = Math.min(200, Math.max(20, num_(o.size) || 100));

  // ตัวเลือกสำหรับกล่องกรอง + สรุปทั้งชุด (นับก่อนกรอง)
  var vendors = {}, cats = {}, months = {};
  var all = { lines: 0, amnt: 0, open: 0, openVal: 0, partial: 0, done: 0,
              cancelled: 0, closed: 0, docs: {} };

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!s_(r[IDX.poid])) continue;

    var vn = s_(r[IDX.vendorname]), ct = s_(r[IDX.cat]), mo = num_(r[IDX.month]);
    if (vn) vendors[vn] = (vendors[vn] || 0) + 1;
    if (ct) cats[ct] = (cats[ct] || 0) + 1;
    if (mo) months[mo] = (months[mo] || 0) + 1;

    var isCancel = s_(r[IDX.cancelled]) === 'Y';
    var isClosed = s_(r[IDX.closed]) === 'Y';
    var rem = num_(r[IDX.remain]);
    var isOpen = !isCancel && !isClosed && rem > 1e-6;

    all.lines++; all.amnt += num_(r[IDX.amnt]); all.docs[s_(r[IDX.docuno])] = 1;
    if (isCancel) all.cancelled++;
    else if (isClosed) all.closed++;
    else if (isOpen) {
      all.open++; all.openVal += num_(r[IDX.amnt_remain]);
      if ((num_(r[IDX.recv_rr]) + num_(r[IDX.recv_manual])) > 0) all.partial++;
    }
    else all.done++;

    // ---- ตัวกรอง ----
    if (st === 'open'      && !isOpen) continue;
    if (st === 'done'      && (isCancel || isClosed || rem > 1e-6)) continue;
    if (st === 'cancelled' && !isCancel) continue;
    if (st === 'closed'    && !isClosed) continue;
    if (st === 'partial'   && !(isOpen && (num_(r[IDX.recv_rr]) + num_(r[IDX.recv_manual])) > 0)) continue;
    if (mth  && String(mo) !== mth) continue;
    if (cat  && ct !== cat) continue;
    if (intl === 'Y' && s_(r[IDX.is_intl]) !== 'ต่างประเทศ') continue;
    if (intl === 'N' && s_(r[IDX.is_intl]) === 'ต่างประเทศ') continue;
    if (vend && vn.toLowerCase().indexOf(vend) < 0) continue;
    if (q) {
      var hay = (s_(r[IDX.docuno]) + ' ' + s_(r[IDX.goodcode_n]) + ' ' + s_(r[IDX.goodname]) + ' ' +
                 vn + ' ' + s_(r[IDX.jobcode]) + ' ' + s_(r[IDX.jobname]) + ' ' +
                 s_(r[IDX.note])).toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push(r);
  }

  // ---- เรียง ----
  var SORT = {
    value:  function (a, b) { return num_(b[IDX.amnt_remain]) - num_(a[IDX.amnt_remain]); },
    amnt:   function (a, b) { return num_(b[IDX.amnt]) - num_(a[IDX.amnt]); },
    age:    function (a, b) { return num_(b[IDX.age_days]) - num_(a[IDX.age_days]); },
    po:     function (a, b) { var x = s_(a[IDX.docuno]), y = s_(b[IDX.docuno]);
                              return x < y ? -1 : (x > y ? 1 : num_(a[IDX.listno]) - num_(b[IDX.listno])); },
    date:   function (a, b) { var x = a[IDX.docudate], y = b[IDX.docudate];
                              var ax = (x instanceof Date) ? x.getTime() : 0;
                              var by = (y instanceof Date) ? y.getTime() : 0; return by - ax; },
    vendor: function (a, b) { var x = s_(a[IDX.vendorname]), y = s_(b[IDX.vendorname]);
                              return x < y ? -1 : (x > y ? 1 : 0); }
  };
  out.sort(SORT[sort] || SORT.value);

  // ---- สรุปเฉพาะที่กรองแล้ว ----
  var f = { lines: out.length, amnt: 0, openVal: 0, docs: {} };
  for (var j = 0; j < out.length; j++) {
    f.amnt += num_(out[j][IDX.amnt]);
    f.openVal += num_(out[j][IDX.amnt_remain]);
    f.docs[s_(out[j][IDX.docuno])] = 1;
  }

  var page = Math.max(1, num_(o.page) || 1);
  var pages = Math.ceil(out.length / size) || 1;
  if (page > pages) page = pages;

  function top(obj, n) {
    var a = [];
    for (var k in obj) a.push({ k: k, n: obj[k] });
    a.sort(function (x, y) { return y.n - x.n; });
    return n ? a.slice(0, n) : a;
  }

  return {
    rows: out.slice((page - 1) * size, page * size).map(function (r) {
      return idxRow_(r, canPrice, canEdit);
    }),
    page: page, pages: pages, size: size,
    filtered: { lines: f.lines, docs: Object.keys(f.docs).length,
                amnt: canPrice ? f.amnt : null, openVal: canPrice ? f.openVal : null },
    all: { lines: all.lines, docs: Object.keys(all.docs).length,
           amnt: canPrice ? all.amnt : null, openVal: canPrice ? all.openVal : null,
           open: all.open, partial: all.partial, done: all.done,
           cancelled: all.cancelled, closed: all.closed },
    opts: { vendors: top(vendors, 40), cats: top(cats), months: top(months) },
    canPrice: canPrice, canEdit: canEdit
  };
}

/** ---------- หน้า PO ค้างรับ = มุมมองย่อยของตารางเดียวกัน ---------- */
function getOpenPO(auth, opt) {
  var myRole = roleOf_(auth).role;
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC', 'STORE']);
  var canPrice = PRICE_ROLES.indexOf(myRole) >= 0;
  var canEdit  = ['PURCHASE', 'ADMIN'].indexOf(myRole) >= 0;
  opt = opt || {};

  var rows = poIndexRows_();
  var q = s_(opt.q).toLowerCase(), age = s_(opt.age);
  var BK = [['0-7', 0, 7], ['8-30', 8, 30], ['31-60', 31, 60], ['61-90', 61, 90], ['90+', 91, 999999]];
  var list = [], sum = { lines: 0, value: 0 }, bucket = {};

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!s_(r[IDX.poid])) continue;
    if (s_(r[IDX.cancelled]) === 'Y' || s_(r[IDX.closed]) === 'Y') continue;
    if (num_(r[IDX.remain]) <= 1e-6) continue;

    var a = num_(r[IDX.age_days]), val = num_(r[IDX.amnt_remain]);
    for (var b = 0; b < BK.length; b++) {
      if (a >= BK[b][1] && a <= BK[b][2]) {
        bucket[BK[b][0]] = bucket[BK[b][0]] || { n: 0, v: 0 };
        bucket[BK[b][0]].n++; bucket[BK[b][0]].v += val; break;
      }
    }
    sum.lines++; sum.value += val;

    if (age) {
      var ok = false;
      for (var b2 = 0; b2 < BK.length; b2++)
        if (BK[b2][0] === age && a >= BK[b2][1] && a <= BK[b2][2]) ok = true;
      if (!ok) continue;
    }
    if (q) {
      var hay = (s_(r[IDX.docuno]) + ' ' + s_(r[IDX.goodcode_n]) + ' ' + s_(r[IDX.goodname]) + ' ' +
                 s_(r[IDX.vendorname]) + ' ' + s_(r[IDX.jobcode])).toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    list.push(idxRow_(r, canPrice, canEdit));
  }

  var page = Math.max(1, num_(opt.page) || 1), size = 50;
  var docs = {};
  for (var d = 0; d < list.length; d++) docs[list[d].po] = 1;

  return {
    total: list.length, page: page, pages: Math.ceil(list.length / size) || 1,
    rows: list.slice((page - 1) * size, page * size),
    sum: { lines: sum.lines, value: canPrice ? sum.value : null, docs: Object.keys(docs).length },
    buckets: BK.map(function (b) {
      var x = bucket[b[0]] || { n: 0, v: 0 };
      return { key: b[0], n: x.n, v: canPrice ? x.v : null };
    }),
    canPrice: canPrice, canEdit: canEdit
  };
}

function fmtD_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (!(v instanceof Date)) { var d = dt_(v); if (!(d instanceof Date)) return s_(v); v = d; }
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(v.getDate()) + '/' + p(v.getMonth() + 1) + '/' + (v.getFullYear() + 543);
}

/* สำหรับชุดทดสอบใน node เท่านั้น — Apps Script ไม่มี module จึงข้ามบรรทัดนี้ */
if (typeof module !== 'undefined') module.exports = { psMatchEngine_: psMatchEngine_, ncd_: ncd_, nn_: nn_, num_: num_, s_: s_, cat_: cat_ };

/** =========================================================
 *  ส่งออกตามตัวกรองปัจจุบันเป็น Google Sheet ใหม่ในโฟลเดอร์ P&S Hub
 *  (จัดซื้อเอาไปทำงานต่อ / ส่งให้คนอื่นดูได้ โดยไม่ต้องเปิดระบบ)
 *  ========================================================= */
function exportPoAll(auth, o) {
  requireRole_(auth, ['PURCHASE', 'ADMIN']);
  var canPrice = PRICE_ROLES.indexOf(roleOf_(auth).role) >= 0;
  o = o || {}; o.page = 1; o.size = 200;

  // ดึงทุกหน้าโดยใช้ตัวกรองชุดเดียวกับหน้าจอ
  var first = getPoAll(auth, o);
  var rows = first.rows.slice();
  for (var p = 2; p <= first.pages; p++) {
    o.page = p;
    rows = rows.concat(getPoAll(auth, o).rows);
  }

  var head = ['เลขที่ PO', 'บรรทัด', 'วันที่', 'นัดส่ง', 'นัดส่งใหม่', 'รหัสสินค้า', 'ชื่อสินค้า', 'หน่วย',
              'ผู้ขาย', 'จ๊อบ', 'ชื่อจ๊อบ', 'หมวด', 'ต่างประเทศ',
              'สั่ง', 'รับจากใบรับ', 'จัดซื้อยืนยันเอง', 'ค้าง'];
  if (canPrice) head = head.concat(['ราคา/หน่วย', 'ยอดสั่ง', 'ค้าง (บาท)', 'ตั้งเบิกแล้ว']);
  head = head.concat(['สถานะของนำเข้า', 'หมายเหตุ', 'อายุ (วัน)', 'สถานะ']);

  var body = rows.map(function (x) {
    var a = [x.po, x.ln, x.date, x.ship, x.newship, x.code, x.name, x.unit,
             x.vendor, x.job, x.jobname, x.cat, x.intlPo ? 'Y' : '',
             x.ordered, x.received, x.manual, x.remain];
    if (canPrice) a = a.concat([x.price, x.amnt, x.value, x.billed]);
    return a.concat([x.intl, x.note, x.age, x.status]);
  });

  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmm');
  var name = 'STT-PS-PO-Export-' + stamp;
  var ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(CFG.PSFOLDER));
  var sh = ss.getSheets()[0].setName('PO');
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  var CH = 2000;
  for (var i = 0; i < body.length; i += CH) {
    var part = body.slice(i, i + CH);
    sh.getRange(i + 2, 1, part.length, head.length).setValues(part);
  }
  sh.autoResizeColumns(1, Math.min(head.length, 12));

  writeLog_(auth, 'ส่งออกข้อมูล PO', name, '', body.length + ' บรรทัด', '');
  return { name: name, rows: body.length, url: ss.getUrl() };
}
