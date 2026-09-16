/**
 * NOVA – PURCHASE & STORE HUB
 * 08-report.js — เขียน "รายงานที่อ่านเองได้" ลง Google Sheet
 *
 * เบียร์สั่ง: เปิดไฟล์ Google Sheet มาแล้วต้องดูได้เหมือนในโปรแกรมเลย
 * ไฟล์นี้จึงสร้าง 3 แท็บใน STT-PS-<ปี> — ไฟล์เดียวกับที่เก็บ PO และการรับเข้าของปีนั้น
 * (ห้ามไปสร้างใน STT-DB-MASTER เด็ดขาด นั่นเป็นไฟล์ของ NOVA ใหญ่)
 *   สรุปภาพรวม        = การ์ดตัวเลขหน้าแรกของโปรแกรม
 *   รายงาน PO         = หน้าฐานข้อมูล PO (มี "ค้างรับ / รับครบ" รายบรรทัด)
 *   รายงานการรับเข้า  = หน้าฐานข้อมูลการรับเข้า
 *
 * กฎ
 *  - เป็น "ภาพสะท้อน" เท่านั้น สร้างใหม่ทั้งแท็บทุกครั้ง — ห้ามใครพิมพ์แก้ในนี้ (จะโดนทับ)
 *  - สร้างจากตารางเดียวกับที่หน้าเว็บอ่าน (PS_PO_INDEX / RR_ALL) ตัวเลขจึงตรงกันเสมอ
 *  - หัวตารางเป็นภาษาไทย เพราะแท็บนี้ทำไว้ให้คนอ่าน ไม่ใช่ให้โค้ดอ่าน
 */

var RPT = { PO: TAB.PO, RR: TAB.RR, SUM: TAB.SUM };


/** ---------- ปุ่ม/ตัวเรียก ---------- */
function psBuildReports(auth) {
  if (auth) requireRole_(auth, ['PURCHASE', 'ADMIN']);
  var t0 = new Date().getTime();
  var po = statPoReport_();          // ตารางหลักเป็นรายงานอยู่แล้ว — แค่นับยอดกับใส่สี
  var rr = buildRrReport_();
  var sm = buildSummary_(po, rr);
  return { poRows: po.rows, rrRows: rr.rows, summary: sm, ms: new Date().getTime() - t0 };
}

/** ---------- นับยอดจากแท็บ "รายงาน PO" + ใส่สี (ไม่เขียนทับข้อมูล) ---------- */
function statPoReport_() {
  var src = poIndexRows_();
  var open = 0, openVal = 0, done = 0, cancel = 0, closed = 0, amnt = 0, docs = {}, n = 0;
  for (var i = 0; i < src.length; i++) {
    var r = src[i];
    if (!s_(r[IDX.poid])) continue;
    n++;
    amnt += num_(r[IDX.amnt]); docs[s_(r[IDX.docuno])] = 1;
    if (s_(r[IDX.cancelled]) === 'Y') cancel++;
    else if (s_(r[IDX.closed]) === 'Y') closed++;
    else if (num_(r[IDX.remain]) > 1e-6) { open++; openVal += num_(r[IDX.amnt_remain]); }
    else done++;
  }
  try {
    var sh = SpreadsheetApp.openById(psYearFile_()).getSheetByName(TAB.PO);
    if (sh) paintPoReport_(sh, n);
  } catch (e) {}
  return { rows: n, open: open, openVal: openVal, done: done,
           cancel: cancel, closed: closed, amnt: amnt, docs: Object.keys(docs).length };
}

/** ---------- รายงานการรับเข้า ---------- */
function buildRrReport_() {
  var src  = rrAllRows_();
  var link = rrLinkMap_(), poDocs = poDocSet_();
  var out = [], amnt = 0, docs = {}, ok = 0, cross = 0, todo = 0, nopo = 0;

  for (var i = 0; i < src.length; i++) {
    var r = src[i];
    if (!s_(r[RIDX.docuno])) continue;
    var st = rrMatchState_(r[RIDX.docuno], r[RIDX.listno], r[RIDX.pono], link, poDocs);
    if (st.k === 'ok') ok++; else if (st.k === 'cross') cross++;
    else if (st.k === 'todo') todo++; else nopo++;
    amnt += num_(r[RIDX.goodamnt]); docs[s_(r[RIDX.docuno])] = 1;

    out.push([
      s_(r[RIDX.docuno]), s_(r[RIDX.listno]), r[RIDX.docudate], s_(r[RIDX.pono]),
      s_(r[RIDX.vendorname]), s_(r[RIDX.goodcode_n]), s_(r[RIDX.goodname]),
      s_(r[RIDX.goodunitname]), num_(r[RIDX.goodqty2]), num_(r[RIDX.goodprice2]),
      num_(r[RIDX.goodamnt]), s_(r[RIDX.jobcode]), s_(r[RIDX.invno]),
      st.t, st.tier, s_(r[RIDX.year_th]), s_(r[RIDX.jobname])
    ]);
  }

  var sh = writeReport_(TAB.RR, SCHEMA.YEAR[TAB.RR], out);
  paintRrReport_(sh, out.length);
  return { rows: out.length, amnt: amnt, docs: Object.keys(docs).length,
           ok: ok, cross: cross, todo: todo, nopo: nopo };
}

/** ---------- สรุปภาพรวม (การ์ดตัวเลขแบบเดียวกับหน้าแรกของโปรแกรม) ---------- */
function buildSummary_(po, rr) {
  var when = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm');
  var rows = [
    ['สรุปภาพรวม — NOVA Purchase & Store Hub', '', ''],
    ['ตัวเลขชุดนี้ตรงกับที่เห็นในโปรแกรมทุกตัว · สร้างใหม่อัตโนมัติทุกครั้งที่กด "คำนวณค้างรับใหม่"', '', ''],
    ['อัปเดตล่าสุด ' + when + ' · เวอร์ชัน ' + PS_VERSION, '', ''],
    ['', '', ''],
    ['ฝั่งจัดซื้อ — ใบสั่งซื้อ', 'จำนวน', 'บาท'],
    ['บรรทัดทั้งหมด', po.rows, po.amnt],
    ['ใบ PO ทั้งหมด', po.docs, ''],
    ['ค้างรับ', po.open, po.openVal],
    ['รับครบแล้ว', po.done, ''],
    ['ปิดรายการ', po.closed, ''],
    ['ยกเลิก', po.cancel, ''],
    ['', '', ''],
    ['ฝั่งรับเข้า — ใบรับของ', 'จำนวน', 'บาท'],
    ['บรรทัดรับเข้าทั้งหมด', rr.rows, rr.amnt],
    ['ใบรับทั้งหมด', rr.docs, ''],
    ['จับคู่กับ PO ได้', rr.ok, ''],
    ['รับข้ามปี (PO ปีก่อน)', rr.cross, ''],
    ['ยังจับคู่ไม่ได้', rr.todo, ''],
    ['ไม่ได้อ้าง PO', rr.nopo, ''],
    ['', '', ''],
    ['ตรวจความถูกต้อง', 'ผล', ''],
    ['ค้างรับ + รับครบ + ปิด + ยกเลิก ต้องเท่าบรรทัดทั้งหมด',
     (po.open + po.done + po.closed + po.cancel) === po.rows ? 'ตรง' : 'ไม่ตรง — แจ้ง Candy', ''],
    ['สถานะการรับเข้า 4 กลุ่มรวมกันต้องเท่าบรรทัดรับเข้า',
     (rr.ok + rr.cross + rr.todo + rr.nopo) === rr.rows ? 'ตรง' : 'ไม่ตรง — แจ้ง Candy', '']
  ];

  var ss = SpreadsheetApp.openById(psYearFile_());
  var sh = ss.getSheetByName(RPT.SUM) || ss.insertSheet(RPT.SUM);
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sh.getRange(2, 1, 2, 1).setFontColor('#79828F');
  [5, 13, 21].forEach(function (r) {
    sh.getRange(r, 1, 1, 3).setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  });
  sh.getRange(8, 1, 1, 3).setFontWeight('bold').setFontColor('#C0182B');   // แถวค้างรับ
  sh.getRange(5, 2, rows.length - 4, 1).setNumberFormat('#,##0');
  sh.getRange(5, 3, rows.length - 4, 1).setNumberFormat('#,##0.00');
  sh.setColumnWidth(1, 430); sh.setColumnWidth(2, 130); sh.setColumnWidth(3, 170);
  sh.setFrozenRows(3);
  return { checked: true, at: when };
}

/** ---------- เขียนแท็บรายงาน (ล้างแล้วเขียนใหม่ทั้งแท็บ) ---------- */
function writeReport_(tab, cols, rows) {
  var ss = SpreadsheetApp.openById(psYearFile_());
  var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
  var f = sh.getFilter();
  if (f) f.remove();                                   // ต้องถอดตัวกรองก่อน ไม่งั้นเขียนทับไม่ได้
  sh.clear();
  sh.clearConditionalFormatRules();
  if (sh.getMaxColumns() > cols.length) sh.deleteColumns(cols.length + 1, sh.getMaxColumns() - cols.length);
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());

  sh.getRange(1, 1, 1, cols.length).setValues([cols])
    .setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);

  var CH = 2000;
  for (var i = 0; i < rows.length; i += CH) {
    var part = rows.slice(i, i + CH);
    sh.getRange(i + 2, 1, part.length, cols.length).setValues(part);
    SpreadsheetApp.flush();
  }
  if (rows.length) sh.getRange(1, 1, rows.length + 1, cols.length).createFilter();
  return sh;
}

/** ---------- สี/รูปแบบของรายงาน PO ---------- */
function paintPoReport_(sh, n) {
  if (!n) return;
  var last = n + 1;
  sh.setFrozenColumns(1);
  sh.getRange(2, 3, n, 1).setNumberFormat('dd/MM/yyyy');          // วันที่สั่ง
  sh.getRange(2, 9, n, 3).setNumberFormat('#,##0.###');           // สั่ง / รับแล้ว / ค้างรับ
  sh.getRange(2, 13, n, 3).setNumberFormat('#,##0.00');           // ราคา / ยอดสั่ง / ค้างรับบาท
  sh.getRange(2, 16, n, 1).setNumberFormat('#,##0');              // อายุ
  sh.getRange(2, 17, n, 2).setNumberFormat('dd/MM/yyyy');         // นัดส่งเดิม / ใหม่
  sh.getRange(2, 19, n, 2).setNumberFormat('#,##0.00');           // ยืนยันเอง / ตั้งเบิก
  var W = { 1:150, 4:220, 5:115, 6:300, 7:70, 8:120, 12:130, 22:240, 26:200 };
  for (var c = 1; c <= PO_COLS.length; c++) sh.setColumnWidth(c, W[c] || 100);

  var all = sh.getRange(2, 1, n, PO_COLS.length);
  var st  = 'INDIRECT("L"&ROW())';                                 // คอลัมน์ L = สถานะ
  var rules = [
    rule_('=REGEXMATCH(' + st + ',"ยกเลิก")',   all, '#EEF0F3', '#79828F', true),
    rule_('=REGEXMATCH(' + st + ',"ปิดรายการ")', all, '#EEF0F3', '#4A5565', false),
    rule_('=REGEXMATCH(' + st + ',"รับครบ")',    all, '#E6F6EE', '#0E8A52', false),
    rule_('=AND(REGEXMATCH(' + st + ',"ยังไม่รับ|รับบางส่วน"),INDIRECT("P"&ROW())>90)',
          all, '#FDECEE', '#C0182B', false),
    rule_('=REGEXMATCH(' + st + ',"รับบางส่วน")', all, '#FFF6E5', '#B5710A', false),
    rule_('=REGEXMATCH(' + st + ',"ยังไม่รับ")',  all, '#FFF1F2', '#C0182B', false)
  ];
  sh.setConditionalFormatRules(rules);
}

/** ---------- สี/รูปแบบของรายงานการรับเข้า ---------- */
function paintRrReport_(sh, n) {
  if (!n) return;
  sh.setFrozenColumns(1);
  sh.getRange(2, 3, n, 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(2, 9, n, 1).setNumberFormat('#,##0.###');
  sh.getRange(2, 10, n, 2).setNumberFormat('#,##0.00');
  var W = { 1:150, 4:150, 5:220, 6:115, 7:300, 8:70, 12:120, 13:150, 14:130, 17:200 };
  for (var c = 1; c <= RR_RPT_COLS.length; c++) sh.setColumnWidth(c, W[c] || 100);

  var all = sh.getRange(2, 1, n, RR_RPT_COLS.length);
  var st  = 'INDIRECT("N"&ROW())';                                 // คอลัมน์ N = สถานะจับคู่
  sh.setConditionalFormatRules([
    rule_('=REGEXMATCH(' + st + ',"ตรงกับ PO")',    all, '#E6F6EE', '#0E8A52', false),
    rule_('=REGEXMATCH(' + st + ',"PO ปีก่อน")',    all, '#EEF0F3', '#4A5565', false),
    rule_('=REGEXMATCH(' + st + ',"ยังไม่จับคู่")', all, '#FFF6E5', '#B5710A', false),
    rule_('=REGEXMATCH(' + st + ',"ไม่ได้อ้าง PO")', all, '#FDECEE', '#C0182B', false)
  ]);
}

function rule_(formula, range, bg, fg, strike) {
  var b = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula).setBackground(bg).setFontColor(fg).setRanges([range]);
  if (strike) b = b.setStrikethrough(true);
  return b.build();
}

/** ---------- คำนวณรายงานสำหรับเทส (ไม่แตะ Google Sheet) ---------- */
function poReportRows_(src) {
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var r = src[i];
    if (!s_(r[IDX.poid])) continue;
    out.push({
      po: s_(r[IDX.docuno]), ln: s_(r[IDX.listno]),
      ordered: num_(r[IDX.ordered]),
      got: num_(r[IDX.recv_rr]) + num_(r[IDX.recv_manual]),
      remain: num_(r[IDX.remain]), status: s_(r[IDX.status]),
      amnt: num_(r[IDX.amnt]), openVal: num_(r[IDX.amnt_remain])
    });
  }
  return out;
}
