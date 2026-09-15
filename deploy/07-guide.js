/**
 * NOVA – PURCHASE & STORE HUB
 * 07-guide.js — ทำให้ "เปิดชีตดูเองได้" ตอนหน้าเว็บมีปัญหา
 *
 * เบียร์สั่งไว้: ข้อมูลการรับเข้า ถ้าโปรแกรมมีปัญหา ก็ต้องยังเปิดดูในฐานข้อมูลได้เลย
 * ไฟล์นี้เลยทำ 3 อย่างกับ Google Sheet ต้นทาง
 *   1. ตรึงหัวตาราง + ใส่ตัวกรอง + จัดรูปแบบวันที่/ตัวเลข/ความกว้าง ให้อ่านออกด้วยตาเปล่า
 *   2. ใส่ "คำอธิบายไทย" ไว้ในหมายเหตุของหัวคอลัมน์ทุกช่อง (เอาเมาส์ชี้แล้วเห็น)
 *      → ไม่เปลี่ยนชื่อหัวคอลัมน์ เพราะโค้ดทั้งระบบหาคอลัมน์จากชื่อในแถวที่ 1
 *   3. สร้างแท็บ "คู่มือฐานข้อมูล" ใน STT-DB-MASTER — เปิดไฟล์เดียวรู้ครบว่าอะไรอยู่ไหน
 *
 * ปลอดภัย: ไม่แตะข้อมูลในตารางเลย แตะแค่รูปแบบการแสดงผลกับหมายเหตุ เรียกซ้ำกี่รอบก็ได้
 */

/** ---------- คำอธิบายไทยของทุกคอลัมน์ที่ใช้ในระบบ ---------- */
var PS_LABEL = {
  year_th: 'ปี พ.ศ. ของเอกสาร', poid: 'รหัสภายในของบรรทัด PO (จาก My Account)',
  listno: 'เลขบรรทัดในใบเดียวกัน', docuno: 'เลขที่เอกสาร', month: 'เดือนของเอกสาร (1-12)',
  docudate: 'วันที่ออกเอกสาร', shipdate: 'วันนัดส่งเดิม', newship: 'วันนัดส่งใหม่ (จัดซื้อกรอกเอง)',
  docustatus: 'สถานะเอกสารจาก My Account (ระดับใบ ไม่ใช่ระดับบรรทัด)',
  onhold: 'พักไว้', cancelflag: 'Y = ใบนี้ถูกยกเลิก', cancelled: 'Y = บรรทัดนี้ถูกยกเลิก',
  goodcode: 'รหัสสินค้าดิบจาก My Account', goodcode_n: 'รหัสสินค้ามาตรฐาน (ตัด 8- / INT- ออกแล้ว)',
  goodname: 'ชื่อสินค้า', goodqty2: 'จำนวน', goodprice2: 'ราคาต่อหน่วย',
  gooddiscformula: 'สูตรส่วนลด', gooddiscamnt: 'จำนวนเงินส่วนลด',
  goodamnt: 'จำนวนเงินหลังหักส่วนลด', goodunitname: 'หน่วยนับ', unit: 'หน่วยนับ',
  vendorcode: 'รหัสผู้ขาย', vendorname: 'ชื่อผู้ขาย', jobcode: 'รหัสจ๊อบ', jobname: 'ชื่อจ๊อบ',
  invecode: 'รหัสคลัง (My Account)', locacode: 'รหัสที่เก็บ (My Account)',
  prdocuno: 'เลขที่ใบขอซื้อ (ตอนนี้ว่างทั้งไฟล์)', cat: 'หมวดสินค้า = ตัวแรกของรหัส (1-7 สโตร์กดรับ · 8-9 ข้าม)',
  imported_at: 'เวลาที่นำเข้าระบบ', updated_at: 'เวลาที่แก้ล่าสุด',
  is_intl: 'Y = PO ต่างประเทศ (POR.INT)', ordered: 'จำนวนที่สั่ง',
  recv_rr: 'รับแล้วจากใบรับ RR', recv_manual: 'รับแล้วที่จัดซื้อยืนยันเอง (ไม่มีใบ RR)',
  remain: 'ค้างรับ = สั่ง − รับ RR − ยืนยันเอง', price: 'ราคาต่อหน่วย',
  amnt: 'จำนวนเงินที่สั่ง (หลังหักส่วนลด)', amnt_remain: 'มูลค่าที่ยังค้างรับ (หักยอดตั้งเบิกแล้ว)',
  billed_amount: 'ยอดที่ตั้งเบิกบัญชีไปแล้ว', billed_note: 'เลขที่ใบตั้งเบิก',
  intl_status: 'สถานะของนำเข้า: สั่งแล้ว · ลงเรือ · ถึงท่า · ผ่านศุลกากร · ถึงโรงงาน',
  note: 'หมายเหตุ / ติดตามถึงไหน', closed: 'Y = จัดซื้อสั่งปิดรายการ',
  close_reason: 'เหตุผลที่ปิด (บังคับกรอก)', status: 'สถานะรวมของบรรทัด',
  age_days: 'อายุ PO เป็นวัน นับจากวันที่ออกเอกสาร', recv_date: 'วันที่ยืนยันรับเอง',
  by_emp: 'รหัส/ชื่อพนักงานที่ทำรายการ',
  pono: 'เลขที่ PO ที่ใบรับนี้อ้างถึง', invno: 'เลขที่ใบกำกับภาษีของผู้ขาย',
  advnamnt: 'เงินมัดจำ', netamnt: 'ยอดสุทธิทั้งใบ',
  rr_docuno: 'เลขที่ใบรับ', rr_listno: 'บรรทัดในใบรับ', po_listno: 'บรรทัดใน PO ที่จับคู่ได้',
  qty: 'จำนวน', tier: 'ชั้นที่ใช้จับคู่ C1-C5 (C1 = ตรงครบทั้งรหัส จ๊อบ ชื่อ ราคา)',
  matched_at: 'เวลาที่จับคู่', last_price: 'ราคาซื้อล่าสุด', last_date: 'วันที่ซื้อล่าสุด',
  last_vendor: 'ผู้ขายรายล่าสุด', wac_policy: 'ต้นทุนเฉลี่ยตามนโยบาย', wac: 'ต้นทุนเฉลี่ยถ่วงน้ำหนัก',
  source: 'ที่มาของราคา', n_buy_12m: 'จำนวนครั้งที่ซื้อใน 12 เดือน',
  min_price: 'ราคาต่ำสุด', max_price: 'ราคาสูงสุด', n_receipt: 'จำนวนครั้งที่รับ',
  amount: 'จำนวนเงิน', warehouse: 'คลัง', min_qty: 'จุดสั่งซื้อ', max_qty: 'เก็บสูงสุด',
  first_seen: 'เจอครั้งแรก', last_seen: 'เจอครั้งล่าสุด', type: 'ประเภทสินค้า',
  first_rr: 'รับของจากเจ้านี้ครั้งแรก', last_rr: 'รับครั้งล่าสุด', n_rr: 'จำนวนครั้งที่รับ',
  amount_ytd: 'ยอดซื้อสะสมปีนี้', lead_days_avg: 'ระยะเวลาส่งของเฉลี่ย (วัน)',
  is_new: 'Y = ผู้ขายรายใหม่', tax_id: 'เลขประจำตัวผู้เสียภาษี',
  incl_vat: 'ราคารวม VAT แล้วหรือยัง', source_url: 'ลิงก์ที่มาของราคาตลาด',
  ref_date: 'วันที่อ้างอิงราคา', screenshot_id: 'ไฟล์ภาพหน้าจอที่แนบ',
  approve_by: 'ผู้อนุมัติ', approve_at: 'เวลาที่อนุมัติ', approve_status: 'สถานะอนุมัติ',
  expire_at: 'ราคาหมดอายุเมื่อ', grn_no: 'เลขที่ใบรับของสโตร์', grn_date: 'วันที่รับของ',
  qty_recv: 'จำนวนที่รับจริง', photo_ids: 'รูปถ่ายตอนรับของ',
  move_id: 'เลขที่การเคลื่อนไหวสต๊อก', move_date: 'วันที่เคลื่อนไหว',
  move_type: 'รับเข้า / เบิกออก / โอน / ปรับยอด', ref_type: 'อ้างอิงจากเอกสารประเภทไหน',
  ref_no: 'เลขที่เอกสารอ้างอิง', reason: 'เหตุผล',
  req_no: 'เลขที่ใบตั้งเบิก', req_date: 'วันที่ตั้งเบิก',
  run_id: 'รหัสรอบการนำเข้า', run_at: 'เวลานำเข้า', file_id: 'รหัสไฟล์ต้นทาง',
  rows_read: 'อ่านมากี่แถว', rows_written: 'เขียนลงกี่แถว', rows_skipped: 'ข้ามกี่แถว',
  ms: 'ใช้เวลากี่มิลลิวินาที', detail: 'รายละเอียด', at: 'เวลา', action: 'การกระทำ',
  target: 'เป้าหมาย', before: 'ค่าก่อนแก้', after: 'ค่าหลังแก้',
  po_lines: 'จำนวนบรรทัด PO', po_amount: 'ยอดสั่งรวม', rr_lines: 'จำนวนบรรทัดรับเข้า',
  rr_amount: 'ยอดรับรวม', open_lines: 'บรรทัดค้างรับ', open_amount: 'มูลค่าค้างรับ',
  vendors: 'จำนวนผู้ขาย', items: 'จำนวนรายการสินค้า',
  doc_no: 'เลขที่เอกสาร', doc_type: 'ประเภทเอกสาร', tab: 'อยู่แท็บไหน', row_hint: 'อยู่แถวประมาณไหน',
  created_at: 'เวลาที่สร้าง'
};

/** ---------- คำอธิบายของแต่ละตาราง ---------- */
var PS_TABLE_DOC = {
  PO_LINE:     'ใบสั่งซื้อทุกบรรทัดของปีนี้ ดึงดิบจาก My Account ไม่แก้ไขอะไรเลย',
  RR_ALL:      'ใบรับของทุกบรรทัดทุกปีรวมไว้ไฟล์เดียว — ห้ามลบแถวเด็ดขาด ต้นทุนเฉลี่ยใช้ยอดสะสมจากตารางนี้',
  MATCH_LINK:  'ผลการจับคู่ใบรับกับบรรทัด PO บอกด้วยว่าจับคู่ด้วยชั้นไหน (C1-C5)',
  PS_PO_INDEX: 'ตารางกลางที่หน้าเว็บอ่าน — ทุกบรรทัด PO พร้อมยอดรับ ยอดค้าง และสถานะ',
  PS_PO_EDIT:  'เฉพาะสิ่งที่คนกรอกเอง แยกจากข้อมูลดิบ ดึงข้อมูลใหม่ทับกี่รอบก็ไม่หาย',
  GRN:         'ใบรับของฝั่งสโตร์ (ยังไม่เปิดใช้)',
  STOCK_MOVE:  'การเคลื่อนไหวสต๊อกทุกรายการ (ยังไม่เปิดใช้)',
  IMPORT_LOG:  'ประวัติการนำเข้าข้อมูลทุกครั้ง ใครกด เมื่อไหร่ ได้กี่แถว',
  LOG:         'ประวัติการแก้ข้อมูลทุกครั้ง ใคร แก้อะไร จากอะไรเป็นอะไร เพราะอะไร',
  PRICE_HISTORY: 'ต้นทุนรายปีของแต่ละรหัสสินค้า (เฟสต้นทุน)',
  PS_PRICE_LATEST: 'ราคาซื้อล่าสุดและต้นทุนเฉลี่ยกลาง — ตัวที่จะส่งต่อให้ NOVA ใหญ่',
  PS_ITEM_MASTER: 'ทะเบียนสินค้า', PS_VENDOR: 'ทะเบียนผู้ขาย',
  PS_MARKET_PRICE: 'ราคาตลาดที่จัดซื้อกรอกและผู้บริหารอนุมัติ',
  PS_SUM_YEAR: 'สรุปรายปีไว้เทียบ KPI', PS_DOC_INDEX: 'สารบัญเอกสาร',
  'ตั้งเบิก':   'รายการตั้งเบิกบัญชี'
};

/** ---------- จัดรูปแบบแท็บให้อ่านออกด้วยตาเปล่า ---------- */
function beautifyTab_(sh, cols) {
  var n = cols.length;
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');

  // คำอธิบายไทยใส่ไว้ในหมายเหตุของหัวคอลัมน์ (ไม่เปลี่ยนชื่อหัว โค้ดยังหาคอลัมน์เจอ)
  var notes = [];
  for (var i = 0; i < n; i++) notes.push(PS_LABEL[cols[i]] || '');
  sh.getRange(1, 1, 1, n).setNotes([notes]);

  var last = Math.max(sh.getMaxRows() - 1, 1);
  for (var c = 0; c < n; c++) {
    var name = String(cols[c]);
    var rng = sh.getRange(2, c + 1, last, 1);
    if (/_at$/.test(name))                                        rng.setNumberFormat('dd/MM/yyyy HH:mm');
    else if (/date$|^date|ship|expire|first_rr|last_rr|first_seen|last_seen/.test(name))
                                                                  rng.setNumberFormat('dd/MM/yyyy');
    else if (/price|amnt|amount|wac|netamnt|advnamnt/.test(name)) rng.setNumberFormat('#,##0.00');
    else if (/qty|ordered|recv_rr|recv_manual|remain|^n_|lines|days/.test(name))
                                                                  rng.setNumberFormat('#,##0.###');

    var w = /goodname|jobname|vendorname|note|reason|detail|close_reason/.test(name) ? 260
          : /docuno|pono|goodcode|jobcode|status/.test(name) ? 150 : 110;
    sh.setColumnWidth(c + 1, w);
  }

  if (!sh.getFilter()) {
    try { sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), n).createFilter(); } catch (_) {}
  }
  return sh.getName();
}

/** ---------- ปุ่ม: จัดหน้าตาฐานข้อมูลทั้งหมด ---------- */
function psBeautify(auth) {
  requireRole_(auth, ['ADMIN']);
  var t0 = new Date().getTime(), done = [], err = [];
  var jobs = [
    { id: CFG.MASTER, tabs: SCHEMA.MASTER, name: 'STT-DB-MASTER' },
    { id: yearFile_(currentYearTH_(), 'YEAR'), tabs: SCHEMA.YEAR, name: 'STT-PS-' + currentYearTH_() },
    { id: yearFile_('ALL', 'RRALL'), tabs: SCHEMA.RRALL, name: 'STT-PS-RR-ALL' }
  ];
  for (var j = 0; j < jobs.length; j++) {
    var ss;
    try { ss = SpreadsheetApp.openById(jobs[j].id); }
    catch (e) { err.push(jobs[j].name + ': เปิดไฟล์ไม่ได้'); continue; }
    for (var t in jobs[j].tabs) {
      var sh = ss.getSheetByName(t);
      if (!sh) { err.push(jobs[j].name + ' / ' + t + ': ไม่มีแท็บ'); continue; }
      try { beautifyTab_(sh, jobs[j].tabs[t]); done.push(jobs[j].name + ' / ' + t); }
      catch (e2) { err.push(jobs[j].name + ' / ' + t + ': ' + e2.message); }
    }
  }
  var guide = psWriteGuide_(jobs);
  return { tabs: done.length, errors: err, guideUrl: guide, ms: new Date().getTime() - t0 };
}

/** ---------- แท็บ "คู่มือฐานข้อมูล" ใน STT-DB-MASTER ---------- */
function psWriteGuide_(jobs) {
  var ss = SpreadsheetApp.openById(CFG.MASTER);
  var sh = ss.getSheetByName('คู่มือฐานข้อมูล') || ss.insertSheet('คู่มือฐานข้อมูล');
  sh.clear();
  sh.clearNotes();

  var rows = [];
  rows.push(['คู่มือฐานข้อมูล NOVA – PURCHASE & STORE HUB', '', '', '']);
  rows.push(['อัปเดตอัตโนมัติเมื่อ ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm') +
             ' · เวอร์ชัน ' + PS_VERSION, '', '', '']);
  rows.push(['', '', '', '']);
  rows.push(['ถ้าหน้าเว็บเปิดไม่ได้ ให้เปิดไฟล์ข้างล่างนี้ดูข้อมูลดิบได้เลย ทุกแท็บตรึงหัวและใส่ตัวกรองไว้แล้ว',
             '', '', '']);
  rows.push(['ไฟล์', 'ลิงก์', '', '']);
  for (var j = 0; j < jobs.length; j++) {
    var url = '';
    try { url = SpreadsheetApp.openById(jobs[j].id).getUrl(); } catch (_) { url = '(เปิดไม่ได้)'; }
    rows.push([jobs[j].name, url, '', '']);
  }
  rows.push(['', '', '', '']);
  rows.push(['ตารางทั้งหมด', '', '', '']);
  var hdrRow = rows.length + 1;                  // แถวหัวตารางของบล็อกรายละเอียด
  rows.push(['ไฟล์', 'แท็บ', 'คอลัมน์', 'คำอธิบาย']);

  for (var k = 0; k < jobs.length; k++) {
    for (var t in jobs[k].tabs) {
      var cols = jobs[k].tabs[t];
      rows.push([jobs[k].name, t, '— ตารางนี้คืออะไร —', PS_TABLE_DOC[t] || '']);
      for (var c = 0; c < cols.length; c++) {
        rows.push(['', '', cols[c], PS_LABEL[cols[c]] || '']);
      }
    }
  }

  sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.getRange(1, 1).setFontSize(15).setFontWeight('bold');
  sh.getRange(4, 1).setFontWeight('bold');
  sh.getRange(5, 1, 1, 2).setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  sh.getRange(hdrRow, 1, 1, 4).setFontWeight('bold')
    .setBackground('#12151A').setFontColor('#FFFFFF');
  sh.setColumnWidth(1, 170); sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 190); sh.setColumnWidth(4, 620);
  sh.getRange(1, 4, rows.length, 1).setWrap(true);
  sh.setFrozenRows(hdrRow);
  return ss.getUrl() + '#gid=' + sh.getSheetId();
}

/** ---------- ลิงก์ไฟล์ฐานข้อมูล (หน้าเว็บเรียกไปแสดง) ---------- */
function getDbLinks(auth) {
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC', 'STORE']);
  var year = currentYearTH_();
  var want = [
    { key: 'MASTER', name: 'STT-DB-MASTER', what: 'ตารางกลาง PS_PO_INDEX · PS_PO_EDIT · คู่มือฐานข้อมูล',
      id: CFG.MASTER, tabs: ['PS_PO_INDEX', 'PS_PO_EDIT', 'คู่มือฐานข้อมูล'] },
    { key: 'YEAR', name: 'STT-PS-' + year, what: 'ข้อมูลดิบ PO ปีนี้ · ผลการจับคู่ · ประวัติการนำเข้า/แก้ไข',
      id: '', tabs: ['PO_LINE', 'MATCH_LINK', 'IMPORT_LOG', 'LOG'] },
    { key: 'RRALL', name: 'STT-PS-RR-ALL', what: 'ใบรับของทุกปี — ข้อมูลการรับเข้าทั้งหมดอยู่ที่นี่',
      id: '', tabs: ['RR_ALL'] }
  ];
  try { want[1].id = yearFile_(year, 'YEAR'); } catch (_) {}
  try { want[2].id = yearFile_('ALL', 'RRALL'); } catch (_) {}

  var out = [];
  for (var i = 0; i < want.length; i++) {
    var w = want[i], url = '', ok = false, tabs = [];
    if (w.id) {
      try {
        var ss = SpreadsheetApp.openById(w.id);
        url = ss.getUrl(); ok = true;
        for (var t = 0; t < w.tabs.length; t++) {
          var sh = ss.getSheetByName(w.tabs[t]);
          tabs.push({ name: w.tabs[t], rows: sh ? Math.max(0, sh.getLastRow() - 1) : null,
                      url: sh ? url + '#gid=' + sh.getSheetId() : '' });
        }
      } catch (e) { url = ''; }
    }
    out.push({ name: w.name, what: w.what, url: url, ok: ok, tabs: tabs });
  }
  return { year: year, files: out };
}
