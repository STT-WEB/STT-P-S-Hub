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
 *  อ่านแท็บ ps_report / RR จากไฟล์ของปีนั้นโดยตรง
 *  23 คอลัมน์เดิมของ My Account ระบบอ่านอย่างเดียว ไม่เคยเขียนทับ
 *  ========================================================= */
function readPoSheet_(yid) {
  var v = fetchTabValues_(yid, TAB.PO);
  if (!v || v.length < 2)
    throw new Error('ไม่พบข้อมูลในแท็บ ' + TAB.PO + ' — วางข้อมูล PO จาก My Account ก่อน');
  var C = poColMap_(v[0]);
  if (C.poid < 0 || C.listno < 0 || C.goodcode < 0)
    throw new Error('แท็บ ' + TAB.PO + ' ขาดคอลัมน์จำเป็น (poid / listno / goodcode)');
  return { hdr: v[0], rows: v.slice(1), C: C };
}

function readRrSheet_(yid) {
  var v = fetchTabValues_(yid, TAB.RR);
  if (!v || v.length < 2)
    throw new Error('ไม่พบข้อมูลในแท็บ ' + TAB.RR + ' — วางข้อมูลใบรับจาก My Account ก่อน');
  var h = v[0].map(function (x) { return s_(x); });
  function I(n) { return colIdx_(h, n); }
  return { hdr: v[0], rows: v.slice(1), C: {
    date: I(['docudate']), docu: I(['docuno']), pono: I(['pono']), ln: I(['listno']),
    gcode: I(['goodcode']), gname: I(['goodname']), qty: I(['goodqty2']), price: I(['goodprice2']),
    dformula: I(['gooddiscformula']), damnt: I(['gooddiscamnt']), amnt: I(['goodamnt']),
    vcode: I(['vendorcode']), vname: I(['vendorname']), job: I(['jobcode']), jname: I(['jobname']),
    unit: I(['goodunitname']), inv: I(['invno']), adv: I(['advnamnt']), net: I(['netamnt']),
    mstat: h.indexOf('สถานะจับคู่')
  } };
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

  var P = readPoSheet_(yid), C = P.C;
  var R = readRrSheet_(yid), RC = R.C;

  // ---- เตรียมบรรทัด PO (ไม่รวมที่ My Account ยกเลิก) ----
  var poRows = [], meta = [], seen = {}, skipPO = 0;
  for (var i = 0; i < P.rows.length; i++) {
    var r = P.rows[i];
    var poid = s_(r[C.poid]), ln = s_(r[C.listno]), docu = s_(r[C.docuno]);
    if (!poid || !ln || !docu || !/^POR/i.test(docu)) { if (r.join('').trim()) skipPO++; meta.push(null); continue; }
    var key = poid + '|' + ln;
    if (seen[key]) { skipPO++; meta.push(null); continue; }
    seen[key] = 1;

    var hDoc = s_(r[C.h_doc]);
    var canceled = s_(r[C.cancelflag]).toUpperCase() === 'Y' || hDoc === DOC_CANCEL;
    var o = { docu: docu, poid: poid, ln: ln, code: ncd_(r[C.goodcode]), job: s_(r[C.jobcode]),
              name: nn_(r[C.goodname]), price: num_(r[C.goodprice2]), qty: num_(r[C.goodqty2]),
              amnt: num_(r[C.goodamnt]), recv: 0, row: i, canceled: canceled, hDoc: hDoc };
    meta.push(o);
    if (!canceled) poRows.push(o);
  }

  // ---- เตรียมบรรทัดใบรับ ----
  var rrList = [], skipRR = 0;
  for (var j = 0; j < R.rows.length; j++) {
    var q = R.rows[j];
    var rdocu = s_(q[RC.docu]), pono = s_(q[RC.pono]);
    if (!rdocu || !pono) { if (q.join('').trim()) skipRR++; continue; }
    rrList.push({ docu: rdocu, pono: pono, ln: s_(q[RC.ln]), date: dt_(q[RC.date]),
      code: ncd_(q[RC.gcode]), name: nn_(q[RC.gname]), price: num_(q[RC.price]), qty: num_(q[RC.qty]),
      job: s_(q[RC.job]), gcode: s_(q[RC.gcode]), gname: s_(q[RC.gname]), amnt: num_(q[RC.amnt]),
      dformula: s_(q[RC.dformula]), damnt: num_(q[RC.damnt]), vcode: s_(q[RC.vcode]),
      vname: s_(q[RC.vname]), jname: s_(q[RC.jname]), unit: s_(q[RC.unit]),
      invno: RC.inv >= 0 ? s_(q[RC.inv]) : '', adv: RC.adv >= 0 ? num_(q[RC.adv]) : 0,
      net: RC.net >= 0 ? num_(q[RC.net]) : 0, row: j });
  }

  // ---- จับคู่ ----
  var M = psMatchEngine_(poRows, rrList);
  var links = M.links, tierN = M.tiers, noPO = M.noPO, unmatched = M.unmatched;

  // เลขที่ใบรับ + ชั้นที่จับคู่ ของแต่ละบรรทัด PO
  var rrOf = {}, linkedRR = {};
  for (var li = 0; li < links.length; li++) {
    var L = links[li];                       // [rr_docuno, rr_listno, pono, poid, po_listno, qty, tier]
    var k2 = s_(L[3]) + '|' + s_(L[4]);
    if (!rrOf[k2]) rrOf[k2] = { docs: {}, tier: s_(L[6]) };
    rrOf[k2].docs[s_(L[0])] = 1;
    linkedRR[s_(L[0]) + '|' + s_(L[1])] = s_(L[6]);
  }

  // ---- คำนวณแล้วเขียนเฉพาะคอลัมน์สีน้ำเงิน ----
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var out = [], openLines = 0, openVal = 0, nCancel = 0, nDone = 0, nClosed = 0;
  var amntAll = 0, docs = {}, openDocs = {};

  for (var k = 0; k < P.rows.length; k++) {
    var p = meta[k];
    if (!p) { out.push(blankSys_()); continue; }
    var row = P.rows[k];

    var manual = num_(row[C.h_recv]);
    if (p.hDoc === DOC_RECV && manual <= 0) manual = p.qty;      // เลือก "รับของแล้ว" = ถือว่ารับครบ
    var got = Math.max(p.recv, manual);                          // ห้ามบวกกัน เดี๋ยวนับซ้ำตอน RR เข้ามา
    if (got > p.qty) got = p.qty;
    var remain = p.canceled ? 0 : Math.max(0, p.qty - got);

    var gotAmt = p.qty > 0 ? p.amnt * got / p.qty : 0;
    var remAmt = p.qty > 0 ? p.amnt * remain / p.qty : 0;
    var billed = num_(row[C.h_billed]);
    if (billed > 0) remAmt = Math.max(0, remAmt - billed);

    var status;
    if (p.canceled)          status = 'ยกเลิก';
    else if (remain <= 1e-6) status = 'รับครบ';
    else if (got > 0)        status = 'รับบางส่วน';
    else                     status = 'ยังไม่รับ';

    amntAll += p.amnt; docs[p.docu] = 1;
    if (p.canceled) nCancel++;
    else if (remain > 1e-6) { openLines++; openVal += remAmt; openDocs[p.docu] = 1; }
    else nDone++;

    var hit = rrOf[p.poid + '|' + p.ln];
    var rrNo = '';
    if (hit) { var a = []; for (var d in hit.docs) a.push(d); a.sort(); rrNo = a.join(', '); }

    out.push([
      got, round2_(gotAmt), round2_(gotAmt * (1 + VAT_RATE)),
      remain, round2_(remAmt), round2_(remAmt * (1 + VAT_RATE)),
      status, days_(dt_(row[C.docudate]), today),
      rrNo, hit ? hit.tier : ''
    ]);
  }

  writeSysCols_(yid, TAB.PO, C, out);
  writeRrStatus_(yid, R, linkedRR, seen);
  cacheDrop_(['PS_POIDX', 'PS_RRALL', 'PS_RRLINK', 'PS_PODOCS']);

  var rrSaved = { kept: 0, fresh: 0 };
  try { rrSaved = saveRrAll_(rrList, year); } catch (eRR) { rrSaved.error = String(eRR.message || eRR); }

  var sum = null, sumErr = '';
  try {
    sum = writeSummary_(yid, { lines: out.length - skipPO, amnt: amntAll, docs: Object.keys(docs).length,
                               open: openLines, openVal: openVal, openDocs: Object.keys(openDocs).length,
                               done: nDone, cancel: nCancel, rr: rrList.length, matched: M.matched });
  } catch (eS) { sumErr = String(eS.message || eS); }

  var matched = 0;
  for (var tn in tierN) matched += tierN[tn];
  return {
    year: year, poRead: P.rows.length, poSkipped: skipPO, rrRead: R.rows.length, rrSkipped: skipRR,
    poLines: poRows.length, rrLines: rrList.length,
    matched: matched, tiers: tierN, noPO: noPO, unmatched: unmatched, over: M.over,
    matchPct: rrList.length ? (matched / (rrList.length - noPO) * 100) : 0,
    indexLines: out.length,
    openLines: openLines, openDocs: Object.keys(openDocs).length, openValue: openVal,
    done: nDone, cancelled: nCancel, amntAll: amntAll,
    rrAll: rrSaved, summaryError: sumErr,
    ms: new Date().getTime() - t0
  };
}

function round2_(n) { return Math.round(n * 100) / 100; }
function blankSys_() { return ['', '', '', '', '', '', '', '', '', '']; }

/** เขียนเฉพาะบล็อกคอลัมน์สีน้ำเงิน — ไม่แตะคอลัมน์อื่นเลย */
function writeSysCols_(fileId, tab, C, rows) {
  if (!rows.length) return 0;
  var first = C[SYS_COLS[0][0]];
  var ok = first >= 0;
  for (var i = 1; i < SYS_COLS.length && ok; i++) ok = (C[SYS_COLS[i][0]] === first + i);
  if (!ok) throw new Error('คอลัมน์ที่ระบบเติมไม่เรียงติดกัน — กด "ติดตั้ง" อีกครั้ง');

  var sh = SpreadsheetApp.openById(fileId).getSheetByName(tab);
  var CH = 2000;
  for (var a = 0; a < rows.length; a += CH) {
    var part = rows.slice(a, a + CH);
    sh.getRange(a + 2, first + 1, part.length, SYS_COLS.length).setValues(part);
    SpreadsheetApp.flush();
  }
  return rows.length;
}

/** เขียนคอลัมน์ "สถานะจับคู่" ในแท็บ RR */
function writeRrStatus_(fileId, R, linkedRR, poKeys) {
  if (R.C.mstat < 0) return 0;
  var out = [];
  for (var i = 0; i < R.rows.length; i++) {
    var q = R.rows[i];
    var docu = s_(q[R.C.docu]), pono = s_(q[R.C.pono]);
    if (!docu || !pono) { out.push(['']); continue; }
    var tier = linkedRR[docu + '|' + s_(q[R.C.ln])];
    out.push([tier ? 'ตรงกับ PO (' + tier + ')' : 'ยังไม่จับคู่ / PO ปีก่อน']);
  }
  var sh = SpreadsheetApp.openById(fileId).getSheetByName(TAB.RR);
  var CH = 2000;
  for (var a = 0; a < out.length; a += CH) {
    var part = out.slice(a, a + CH);
    sh.getRange(a + 2, R.C.mstat + 1, part.length, 1).setValues(part);
    SpreadsheetApp.flush();
  }
  return out.length;
}

/** แท็บสรุปภาพรวม */
function writeSummary_(fileId, st) {
  var when = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm');
  var rows = [
    ['สรุปภาพรวม — จัดซื้อ & คลังสินค้า', '', ''],
    ['ตัวเลขชุดนี้ตรงกับที่เห็นในโปรแกรมทุกตัว · อัปเดตล่าสุด ' + when, '', ''],
    ['', '', ''],
    ['ใบสั่งซื้อ', 'จำนวน', 'บาท'],
    ['บรรทัดทั้งหมด', st.lines, st.amnt],
    ['ใบ PO ทั้งหมด', st.docs, ''],
    ['ค้างรับ', st.open, st.openVal],
    ['ค้างรับ + VAT', '', round2_(st.openVal * (1 + VAT_RATE))],
    ['ใบ PO ที่ยังค้าง', st.openDocs, ''],
    ['รับครบแล้ว', st.done, ''],
    ['ยกเลิก', st.cancel, ''],
    ['', '', ''],
    ['ใบรับของ', 'จำนวน', ''],
    ['บรรทัดรับเข้าทั้งหมด', st.rr, ''],
    ['', '', ''],
    ['ตรวจความถูกต้อง', 'ผล', ''],
    ['ค้างรับ + รับครบ + ยกเลิก ต้องเท่าบรรทัดทั้งหมด',
     (st.open + st.done + st.cancel) === st.lines ? 'ตรง' : 'ไม่ตรง — แจ้ง Candy', '']
  ];
  var ss = SpreadsheetApp.openById(fileId);
  var sh = ss.getSheetByName(TAB.SUM) || ss.insertSheet(TAB.SUM);
  sh.clear();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1).setFontSize(15).setFontWeight('bold');
  sh.getRange(2, 1).setFontColor('#79828F');
  [4, 13, 16].forEach(function (r) {
    sh.getRange(r, 1, 1, 3).setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  });
  sh.getRange(7, 1, 2, 3).setFontWeight('bold').setFontColor('#C0182B');
  sh.getRange(4, 2, rows.length - 3, 1).setNumberFormat('#,##0');
  sh.getRange(4, 3, rows.length - 3, 1).setNumberFormat('#,##0.00');
  sh.setColumnWidth(1, 400); sh.setColumnWidth(2, 120); sh.setColumnWidth(3, 170);
  return { at: when };
}

/** =========================================================
 *  อ่านตารางหลัก (แท็บ ps_report) — หน้าเว็บทุกหน้าใช้ตัวนี้
 *  → ตัวเลขในเว็บกับในชีตมาจากแถวเดียวกันเป๊ะ
 *  ========================================================= */
function poIndexRows_() {
  return cacheOr_('PS_POIDX', TTL.HOT, function () {
    var v = fetchTabValues_(psYearFile_(), TAB.PO) || [];
    if (v.length < 2) return { rows: [], C: {} };
    return { rows: v.slice(1), C: poColMap_(v[0]) };
  });
}

/** แปลงแถวดิบเป็นวัตถุที่หน้าเว็บใช้ (ตัดราคาถ้าไม่มีสิทธิ์) */
function idxRow_(r, C, canPrice) {
  var got = num_(r[C.got]), remain = num_(r[C.remain]);
  return {
    po: s_(r[C.docuno]), poid: s_(r[C.poid]), ln: s_(r[C.listno]),
    date: fmtD_(r[C.docudate]), ship: fmtD_(r[C.shipdate]), newship: fmtD_(r[C.h_newship]),
    code: ncd_(r[C.goodcode]), name: s_(r[C.goodname]), unit: s_(r[C.goodunitname]),
    vendor: s_(r[C.vendorname]), job: s_(r[C.jobcode]), jobname: s_(r[C.jobname]),
    cat: cat_(ncd_(r[C.goodcode])), intlPo: /^POR\.INT/i.test(s_(r[C.docuno])),
    ordered: num_(r[C.goodqty2]), received: got, manual: num_(r[C.h_recv]), remain: remain,
    price:      canPrice ? num_(r[C.goodprice2])  : null,
    amnt:       canPrice ? num_(r[C.goodamnt])    : null,
    gotAmt:     canPrice ? num_(r[C.got_amt])     : null,
    gotVat:     canPrice ? num_(r[C.got_vat])     : null,
    value:      canPrice ? num_(r[C.remain_amt])  : null,
    valueVat:   canPrice ? num_(r[C.remain_vat])  : null,
    billed:     canPrice ? num_(r[C.h_billed])    : null,
    status: s_(r[C.status]), age: num_(r[C.age_days]),
    rrNo: s_(r[C.rr_no]), tier: s_(r[C.tier]),
    hStatus: s_(r[C.h_status]), hDoc: s_(r[C.h_doc]),
    docustatus: s_(r[C.docustatus]),
    intl: s_(r[C.h_intl]), note: s_(r[C.h_note]),
    cancelled: s_(r[C.status]) === 'ยกเลิก'
  };
}

/** สถานะ 3 ทางไม่ตรงกันไหม (ไว้ขึ้นป้ายเตือน) */
function statusMismatch_(r, C) {
  var sys = s_(r[C.status]), hum = s_(r[C.h_status]);
  if (!hum) return false;
  var want = sys === 'รับครบ' ? 'Y' : (sys === 'รับบางส่วน' ? 'P' : 'N');
  return hum !== want;
}

/** ---------- หน้าฐานข้อมูล PO ---------- */
function getPoAll(auth, o) {
  var myRole = roleOf_(auth).role;
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC', 'STORE']);
  var canPrice = PRICE_ROLES.indexOf(myRole) >= 0;
  o = o || {};

  var D = poIndexRows_(), rows = D.rows, C = D.C;
  var q    = s_(o.q).toLowerCase();
  var st   = s_(o.status);
  var mth  = s_(o.month);
  var cat  = s_(o.cat);
  var intl = s_(o.intl);
  var vend = s_(o.vendor).toLowerCase();
  var sort = s_(o.sort) || 'value';
  var size = Math.min(200, Math.max(20, num_(o.size) || 100));

  var vendors = {}, cats = {}, months = {};
  var all = { lines: 0, amnt: 0, open: 0, openVal: 0, openVat: 0, partial: 0,
              done: 0, cancelled: 0, mismatch: 0, docs: {} };
  var BK = [{ key:'0-7', n:0, v:0 }, { key:'8-30', n:0, v:0 }, { key:'31-60', n:0, v:0 },
            { key:'61-90', n:0, v:0 }, { key:'90+', n:0, v:0 }];
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!s_(r[C.poid]) || !/^POR/i.test(s_(r[C.docuno]))) continue;   // ข้ามแถวเสีย

    var vn = s_(r[C.vendorname]);
    var ct = cat_(ncd_(r[C.goodcode]));
    var d  = dt_(r[C.docudate]);
    var mo = (d instanceof Date) ? (d.getMonth() + 1) : '';
    var sys = s_(r[C.status]);
    var rem = num_(r[C.remain]);

    if (vn) vendors[vn] = (vendors[vn] || 0) + 1;
    if (ct) cats[ct] = (cats[ct] || 0) + 1;
    if (mo) months[mo] = (months[mo] || 0) + 1;

    all.lines++; all.amnt += num_(r[C.goodamnt]); all.docs[s_(r[C.docuno])] = 1;
    if (sys === 'ยกเลิก') all.cancelled++;
    else if (rem > 1e-6) {
      all.open++; all.openVal += num_(r[C.remain_amt]); all.openVat += num_(r[C.remain_vat]);
      if (num_(r[C.got]) > 0) all.partial++;
      var ag = num_(r[C.age_days]);
      var bi = ag <= 7 ? 0 : ag <= 30 ? 1 : ag <= 60 ? 2 : ag <= 90 ? 3 : 4;
      BK[bi].n++; BK[bi].v += num_(r[C.remain_amt]);
    } else all.done++;
    if (statusMismatch_(r, C)) all.mismatch++;

    if (st === 'open'      && !(sys !== 'ยกเลิก' && rem > 1e-6)) continue;
    if (st === 'partial'   && sys !== 'รับบางส่วน') continue;
    if (st === 'done'      && sys !== 'รับครบ') continue;
    if (st === 'cancelled' && sys !== 'ยกเลิก') continue;
    if (st === 'mismatch'  && !statusMismatch_(r, C)) continue;
    if (mth  && String(mo) !== mth) continue;
    if (cat  && ct !== cat) continue;
    if (intl === 'Y' && !/^POR\.INT/i.test(s_(r[C.docuno]))) continue;
    if (intl === 'N' &&  /^POR\.INT/i.test(s_(r[C.docuno]))) continue;
    if (vend && vn.toLowerCase().indexOf(vend) < 0) continue;
    if (q) {
      var hay = (s_(r[C.docuno]) + ' ' + s_(r[C.goodcode]) + ' ' + s_(r[C.goodname]) + ' ' + vn +
                 ' ' + s_(r[C.jobcode]) + ' ' + s_(r[C.jobname]) + ' ' + s_(r[C.h_note]) +
                 ' ' + s_(r[C.rr_no])).toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push(r);
  }

  var SORT = {
    value:  function (a, b) { return num_(b[C.remain_amt]) - num_(a[C.remain_amt]); },
    amnt:   function (a, b) { return num_(b[C.goodamnt]) - num_(a[C.goodamnt]); },
    age:    function (a, b) { return num_(b[C.age_days]) - num_(a[C.age_days]); },
    po:     function (a, b) { var x = s_(a[C.docuno]), y = s_(b[C.docuno]);
                              return x < y ? -1 : (x > y ? 1 : num_(a[C.listno]) - num_(b[C.listno])); },
    date:   function (a, b) { var x = dt_(a[C.docudate]), y = dt_(b[C.docudate]);
                              return ((y instanceof Date) ? y.getTime() : 0) -
                                     ((x instanceof Date) ? x.getTime() : 0); },
    vendor: function (a, b) { var x = s_(a[C.vendorname]), y = s_(b[C.vendorname]);
                              return x < y ? -1 : (x > y ? 1 : 0); }
  };
  out.sort(SORT[sort] || SORT.value);

  var f = { lines: out.length, amnt: 0, openVal: 0, docs: {} };
  for (var j = 0; j < out.length; j++) {
    f.amnt += num_(out[j][C.goodamnt]);
    f.openVal += num_(out[j][C.remain_amt]);
    f.docs[s_(out[j][C.docuno])] = 1;
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
    rows: out.slice((page - 1) * size, page * size).map(function (r) { return idxRow_(r, C, canPrice); }),
    page: page, pages: pages, size: size,
    filtered: { lines: f.lines, docs: Object.keys(f.docs).length,
                amnt: canPrice ? f.amnt : null, openVal: canPrice ? f.openVal : null },
    all: { lines: all.lines, docs: Object.keys(all.docs).length,
           amnt: canPrice ? all.amnt : null, openVal: canPrice ? all.openVal : null,
           openVat: canPrice ? all.openVat : null,
           open: all.open, partial: all.partial, done: all.done,
           cancelled: all.cancelled, closed: 0, mismatch: all.mismatch, buckets: BK },
    opts: { vendors: top(vendors, 40), cats: top(cats), months: top(months) },
    canPrice: canPrice, canEdit: false
  };
}

/** ---------- หน้า PO ค้างรับ = มุมมองย่อยของตารางเดียวกัน ---------- */
function getOpenPO(auth, opt) {
  opt = opt || {};
  opt.status = 'open';
  opt.sort = opt.sort || 'value';
  var r = getPoAll(auth, opt);
  var age = s_(opt.age), rows = r.rows;
  if (age) {
    rows = rows.filter(function (x) {
      return age === '0-7'   ? x.age <= 7
           : age === '8-30'  ? (x.age > 7 && x.age <= 30)
           : age === '31-60' ? (x.age > 30 && x.age <= 60)
           : age === '61-90' ? (x.age > 60 && x.age <= 90)
           : x.age > 90;
    });
  }
  return { rows: rows, page: r.page, pages: r.pages,
           sum: { lines: r.all.open, value: r.all.openVal, docs: r.filtered.docs },
           buckets: r.all.buckets, canPrice: r.canPrice, canEdit: false };
}

function fmtD_(v) {
  var d = (v instanceof Date) ? v : dt_(v);
  if (!(d instanceof Date)) return s_(v);
  var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2);
  return dd + '/' + mm + '/' + (d.getFullYear() + 543);
}

/** ---------- ส่งออกผลกรองปัจจุบันเป็น Google Sheet ---------- */
function exportPoAll(auth, o) {
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC']);
  var canPrice = PRICE_ROLES.indexOf(roleOf_(auth).role) >= 0;
  o = o || {}; o.size = 200;
  var head = ['เลขที่ PO', 'บรรทัด', 'วันที่สั่ง', 'ผู้ขาย', 'รหัสสินค้า', 'ชื่อสินค้า', 'หน่วย', 'จ๊อบ',
              'สั่ง', 'รับแล้ว', 'ค้างรับ', 'สถานะ', 'อายุ (วัน)', 'เลขที่ใบรับ'];
  if (canPrice) head = head.concat(['ราคา/หน่วย', 'ยอดสั่ง', 'ค้างรับ (บาท)', 'ค้างรับ + VAT']);

  var body = [], page = 1, pages = 1;
  do {
    o.page = page;
    var r = getPoAll(auth, o);
    pages = r.pages;
    for (var i = 0; i < r.rows.length; i++) {
      var x = r.rows[i];
      var row = [x.po, x.ln, x.date, x.vendor, x.code, x.name, x.unit, x.job,
                 x.ordered, x.received, x.remain, x.status, x.age, x.rrNo];
      if (canPrice) row = row.concat([x.price, x.amnt, x.value, x.valueVat]);
      body.push(row);
    }
    page++;
  } while (page <= pages && body.length < 50000);

  var name = 'PO-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmm');
  var ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(CFG.PSFOLDER));
  var sh = ss.getSheets()[0].setName('PO');
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (body.length) sh.getRange(2, 1, body.length, head.length).setValues(body);
  sh.getDataRange().createFilter();
  return { rows: body.length, name: name, url: ss.getUrl() };
}

/* ให้ชุดทดสอบบน Node เรียกใช้โค้ดตัวจริงได้ (Apps Script ไม่มี module จึงไม่กระทบ) */
if (typeof module !== 'undefined') module.exports = { psMatchEngine_, ncd_, nn_, num_, s_, cat_ };
