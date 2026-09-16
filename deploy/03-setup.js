/**
 * NOVA – PURCHASE & STORE HUB
 * 03-setup.js — ติดตั้งโครงข้อมูล (สร้างไฟล์รายปี · RR-ALL · ตารางกลาง · ลงทะเบียน REGISTRY)
 *
 * กฎ
 *  - ปลอดภัย: ถ้ามีอยู่แล้วจะไม่สร้างทับ แค่รายงานว่ามีแล้ว (เรียกกี่รอบก็ได้ผลเท่าเดิม)
 *  - ไม่แตะแท็บเดิมของ NOVA ใน STT-DB-MASTER (USERS / SETTINGS / REGISTRY เดิม) เพิ่มแท็บใหม่อย่างเดียว
 *  - โค้ดชุดนี้จะถูกใช้ซ้ำตอน "ปิดปี" (X5) ทุกปี → เขียนครั้งเดียวใช้ 20 ปี
 */

/**
 * ---------- โครงตารางทั้งหมด (แหล่งความจริงเดียว) ----------
 *
 * กติกาที่เบียร์เคาะแล้ว 16 ก.ย. 2569
 *   1. ไฟล์เดียวต่อปี — ใช้ไฟล์ "PO Report <ปี>" ของเบียร์เป็นไฟล์หลักเลย
 *      ระบบ "เพิ่มแท็บ" เข้าไปในไฟล์เดียวกัน ไม่ก๊อป PO/RR ออกมาไว้ที่อื่น
 *   2. เบียร์ดึงข้อมูลจาก My Account มาวางทับแท็บ ps_report / RR ทุกวัน
 *      -> ของที่คนกรอกต้องอยู่คนละแท็บ ไม่งั้นโดนวางทับหาย
 *   3. ห้ามสร้างแท็บใน STT-DB-MASTER (ไฟล์ของ NOVA ใหญ่) เพิ่มได้แค่แถวใน REGISTRY
 *   4. STT-PS-RR-ALL = ไฟล์เดียวที่ข้ามปีจริง ๆ (ใบรับสะสม + ต้นทุนกลาง)
 */

/** คู่ [ชื่อที่โค้ดใช้, หัวตารางภาษาไทยที่คนอ่าน] — ลำดับนี้คือลำดับคอลัมน์จริง */
var PO_COLS = [
  ['docuno',        'เลขที่ PO'],
  ['listno',        'บรรทัด'],
  ['docudate',      'วันที่สั่ง'],
  ['vendorname',    'ผู้ขาย'],
  ['goodcode_n',    'รหัสสินค้า'],
  ['goodname',      'ชื่อสินค้า'],
  ['unit',          'หน่วย'],
  ['jobcode',       'จ๊อบ'],
  ['ordered',       'จำนวนที่สั่ง'],
  ['got',           'รับแล้ว'],
  ['remain',        'ค้างรับ'],
  ['status',        'สถานะ'],
  ['price',         'ราคา/หน่วย'],
  ['amnt',          'ยอดสั่ง (บาท)'],
  ['amnt_remain',   'ค้างรับ (บาท)'],
  ['age_days',      'อายุ (วัน)'],
  ['shipdate',      'นัดส่งเดิม'],
  ['newship',       'นัดส่งใหม่'],
  ['recv_rr',       'รับจากใบรับ'],
  ['recv_manual',   'ยืนยันรับเอง'],
  ['billed_amount', 'ตั้งเบิกแล้ว (บาท)'],
  ['intl_status',   'สถานะของนำเข้า'],
  ['note',          'หมายเหตุ'],
  ['closed',        'ปิดรายการ'],
  ['cancelled',     'ยกเลิก'],
  ['cat',           'หมวด'],
  ['is_intl',       'ในประเทศ / ต่างประเทศ'],
  ['jobname',       'ชื่อจ๊อบ'],
  ['poid',          'รหัสบรรทัด'],
  ['year_th',       'ปี พ.ศ.'],
  ['month',         'เดือน'],
  ['vendorcode',    'รหัสผู้ขาย'],
  ['updated_at',    'อัปเดตเมื่อ']
];

var RR_RPT_COLS = [
  ['docuno',     'เลขที่ใบรับ'],
  ['listno',     'บรรทัด'],
  ['docudate',   'วันที่รับ'],
  ['pono',       'เลขที่ PO'],
  ['vendorname', 'ผู้ขาย'],
  ['goodcode_n', 'รหัสสินค้า'],
  ['goodname',   'ชื่อสินค้า'],
  ['goodunitname', 'หน่วย'],
  ['goodqty2',   'จำนวน'],
  ['goodprice2', 'ราคา/หน่วย'],
  ['goodamnt',   'จำนวนเงิน'],
  ['jobcode',    'จ๊อบ'],
  ['invno',      'เลขที่ใบกำกับ'],
  ['mstat',      'สถานะจับคู่'],
  ['tier',       'ชั้นที่จับคู่'],
  ['year_th',    'ปี พ.ศ.'],
  ['jobname',    'ชื่อจ๊อบ']
];

function colKeys_(defs) { var a = []; for (var i = 0; i < defs.length; i++) a.push(defs[i][0]); return a; }
function colHeads_(defs) { var a = []; for (var i = 0; i < defs.length; i++) a.push(defs[i][1]); return a; }
function idxOf_(defs) { var m = {}; for (var i = 0; i < defs.length; i++) m[defs[i][0]] = i; return m; }

/** ชื่อแท็บ — รวมไว้ที่เดียว เวลาเปลี่ยนชื่อจะได้แก้จุดเดียว */
var TAB = {
  SRC_PO : 'ps_report',              // ของเบียร์ — ระบบอ่านอย่างเดียว ห้ามเขียน
  SRC_RR : 'RR',                     // ของเบียร์ — ระบบอ่านอย่างเดียว ห้ามเขียน
  PO     : 'รายงาน PO',
  EDIT   : 'ช่องที่จัดซื้อกรอก',
  LINK   : 'ผลการจับคู่',
  RR     : 'รายงานการรับเข้า',
  SUM    : 'สรุปภาพรวม',
  IMPORT : 'ประวัติการนำเข้า',
  LOG    : 'ประวัติการแก้ไข'
};

var SCHEMA = {

  /* ===== แท็บที่ระบบเพิ่มเข้าไปใน "ไฟล์ PO Report ของปีนั้น" ===== */
  YEAR: {
    'รายงาน PO':          colHeads_(PO_COLS),
    'ช่องที่จัดซื้อกรอก': ['รหัสบรรทัด', 'บรรทัด', 'เลขที่ PO', 'ยืนยันรับเอง', 'วันที่ยืนยัน',
                           'ตั้งเบิกแล้ว (บาท)', 'เลขที่ใบตั้งเบิก', 'นัดส่งใหม่', 'หมายเหตุ',
                           'สถานะของนำเข้า', 'ปิดรายการ', 'เหตุผลที่ปิด', 'ผู้ทำรายการ', 'อัปเดตเมื่อ'],
    'ผลการจับคู่':        ['เลขที่ใบรับ', 'บรรทัดใบรับ', 'เลขที่ PO', 'รหัสบรรทัด PO', 'บรรทัด PO',
                           'จำนวน', 'ชั้นที่จับคู่', 'จับคู่เมื่อ'],
    'รายงานการรับเข้า':   colHeads_(RR_RPT_COLS),
    'ประวัติการนำเข้า':   ['รอบที่', 'เวลา', 'ผู้ทำรายการ', 'ชนิด', 'ไฟล์ต้นทาง', 'อ่านมา',
                           'เขียนลง', 'ข้าม', 'ใช้เวลา (ms)', 'สถานะ', 'รายละเอียด'],
    'ประวัติการแก้ไข':    ['เวลา', 'ผู้ทำรายการ', 'การกระทำ', 'เป้าหมาย', 'ค่าก่อนแก้', 'ค่าหลังแก้', 'เหตุผล']
  },

  /* ===== ไฟล์ข้ามปี : STT-PS-RR-ALL (ไฟล์เดียวตลอด 20 ปี) ===== */
  RRALL: {
    RR_ALL: ['year_th','docuno','docudate','pono','listno','goodcode','goodcode_n','goodname','goodqty2',
             'goodprice2','gooddiscformula','gooddiscamnt','goodamnt','vendorcode','vendorname',
             'jobcode','jobname','goodunitname','invno','advnamnt','netamnt','imported_at'],
    PRICE_HISTORY: ['goodcode_n','year_th','qty','amount','wac','last_date','last_price','n_receipt','updated_at'],
    PS_PRICE_LATEST: ['goodcode_n','goodname','unit','last_price','last_date','last_vendor','wac_policy',
                      'source','n_buy_12m','min_price','max_price','updated_at'],
    PS_ITEM_MASTER:  ['goodcode_n','goodname','unit','cat','type','warehouse','min_qty','max_qty',
                      'first_seen','last_seen','updated_at'],
    PS_VENDOR:       ['vendorcode','vendorname','first_rr','last_rr','n_rr','amount_ytd','lead_days_avg',
                      'is_new','tax_id','note','updated_at'],
    PS_MARKET_PRICE: ['goodcode_n','price','unit','incl_vat','source_url','ref_date','screenshot_id',
                      'by_emp','approve_by','approve_at','expire_at'],
    PS_SUM_YEAR:     ['year_th','po_lines','po_amount','rr_lines','rr_amount','open_lines','open_amount',
                      'vendors','items','updated_at']
  }
};

/** ---------- ฟังก์ชันที่หน้าเว็บเรียก ---------- */
function psSetup(auth, poUrl) {
  requireRole_(auth, ['ADMIN']);
  var t0 = new Date().getTime();
  var year = currentYearTH_();
  var log = [];
  function step(name, fn) {
    var s0 = new Date().getTime();
    try { log.push({ name: name, ok: true, ms: new Date().getTime() - s0, detail: fn() }); }
    catch (e) { log.push({ name: name, ok: false, ms: new Date().getTime() - s0,
                           detail: '', error: String(e && e.message ? e.message : e) }); }
  }

  // ---- ไฟล์ของปีนี้ = ไฟล์ PO Report ของเบียร์เอง ----
  var yearId = '';
  try { yearId = yearFile_(year, 'YEAR'); } catch (_) { yearId = ''; }   // เคยลงทะเบียนไว้แล้วหรือยัง
  if (s_(poUrl)) yearId = fileIdOf_(poUrl);
  if (!yearId)
    throw new Error('ยังไม่รู้ว่าไฟล์ของปี ' + year + ' คือไฟล์ไหน — วางลิงก์ไฟล์ PO Report ' +
                    'ที่มีแท็บ ' + TAB.SRC_PO + ' และ ' + TAB.SRC_RR + ' ก่อน');

  step('ตรวจไฟล์ของปี ' + year, function () {
    var ss = SpreadsheetApp.openById(yearId);
    var miss = [];
    if (!ss.getSheetByName(TAB.SRC_PO)) miss.push(TAB.SRC_PO);
    if (!ss.getSheetByName(TAB.SRC_RR)) miss.push(TAB.SRC_RR);
    if (miss.length)
      throw new Error('ไฟล์นี้ไม่มีแท็บ ' + miss.join(' และ ') + ' — ใช่ไฟล์ PO Report หรือเปล่า');
    return ss.getName() + ' · มีแท็บ ' + TAB.SRC_PO + ' และ ' + TAB.SRC_RR + ' ครบ';
  });

  step('เพิ่มแท็บของระบบเข้าไปในไฟล์เดียวกัน', function () {
    return ensureTabs_(yearId, SCHEMA.YEAR);
  });

  var rrId = '';
  step('ไฟล์สะสมข้ามปี STT-PS-RR-ALL', function () {
    var r = ensureFile_('STT-PS-RR-ALL', SCHEMA.RRALL);
    rrId = r.id;
    return r.msg;
  });

  // เพิ่ม "แถว" ใน REGISTRY เดิมของ NOVA เท่านั้น — ไม่สร้างแท็บใหม่ใน MASTER
  step('ลงทะเบียนใน REGISTRY (source = PS)', function () {
    var nm = '';
    try { nm = SpreadsheetApp.openById(yearId).getName(); } catch (_) { nm = 'PO Report ' + year; }
    var a = ensureRegistry_(year, 'YEAR', yearId, nm);
    var b = ensureRegistry_('ALL', 'RRALL', rrId, 'STT-PS-RR-ALL');
    return a + ' · ' + b;
  });

  step('จัดหน้าตาให้อ่านง่าย (ตรึงหัว · ตัวกรอง · คำอธิบายไทย)', function () {
    var b = psBeautify(auth);
    return 'จัดแล้ว ' + b.tabs + ' แท็บ' + (b.errors.length ? ' · ข้าม ' + b.errors.length : '');
  });

  step('ล้างแคช', function () {
    cacheDrop_(['PS_REGISTRY', 'PS_SETTINGS', 'PS_USERS', 'PS_POIDX', 'PS_POEDIT',
                'PS_RRALL', 'PS_RRLINK', 'PS_PODOCS']);
    return 'เรียบร้อย';
  });

  var failed = log.filter(function (x) { return !x.ok; }).length;
  return { year: year, fileId: yearId, steps: log,
           passed: log.length - failed, failed: failed,
           totalMs: new Date().getTime() - t0 };
}

/** ---------- เพิ่มแท็บที่ยังไม่มี (ไม่แตะของเดิม) ---------- */
function ensureTabs_(fileId, tabs) {
  var ss = SpreadsheetApp.openById(fileId);
  var made = [], had = [];
  for (var name in tabs) {
    var sh = ss.getSheetByName(name);
    if (sh) { had.push(name); continue; }
    sh = ss.insertSheet(name);
    writeHeader_(sh, tabs[name]);
    made.push(name);
  }
  var out = [];
  if (made.length) out.push('สร้างใหม่ ' + made.length + ' แท็บ (' + made.join(', ') + ')');
  if (had.length)  out.push('มีอยู่แล้ว ' + had.length + ' แท็บ');
  return out.join(' · ');
}

function writeHeader_(sh, cols) {
  sh.getRange(1, 1, 1, cols.length).setValues([cols])
    .setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (sh.getMaxColumns() > cols.length) {
    sh.deleteColumns(cols.length + 1, sh.getMaxColumns() - cols.length);
  }
}

/** ---------- สร้างไฟล์ถ้ายังไม่มี (หาในโฟลเดอร์ P&S ก่อนเสมอ) ---------- */
function ensureFile_(name, tabs) {
  var folder = DriveApp.getFolderById(CFG.PSFOLDER);
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    var f = it.next();
    var msg = ensureTabs_(f.getId(), tabs);
    return { id: f.getId(), msg: 'มีไฟล์อยู่แล้ว — ' + msg };
  }
  var ss = SpreadsheetApp.create(name);
  var id = ss.getId();
  DriveApp.getFileById(id).moveTo(folder);
  var first = true;
  for (var t in tabs) {
    var sh = first ? ss.getSheets()[0].setName(t) : ss.insertSheet(t);
    writeHeader_(sh, tabs[t]);
    first = false;
  }
  return { id: id, msg: 'สร้างไฟล์ใหม่ พร้อม ' + Object.keys(tabs).length + ' แท็บ' };
}

/** ---------- เพิ่มแถวใน REGISTRY ถ้ายังไม่มี ---------- */
function ensureRegistry_(year, type, fileId, fileName) {
  if (!fileId) throw new Error('ยังไม่มี File ID ของ ' + fileName);
  var sh = SpreadsheetApp.openById(CFG.MASTER).getSheetByName('REGISTRY');
  if (!sh) throw new Error('ไม่พบแท็บ REGISTRY ใน STT-DB-MASTER');
  var v = sh.getDataRange().getValues();
  var hdr = v[0].map(function (x) { return String(x).trim(); });
  var iYr  = colIdx_(hdr, ['year(พ.ศ.)', 'year (พ.ศ.)', 'พ.ศ.', 'year']);
  var iTyp = colIdx_(hdr, ['type']);
  var iSrc = colIdx_(hdr, ['source']);
  var iFid = colIdx_(hdr, ['file_id', 'fileid']);
  var iFnm = colIdx_(hdr, ['file_name', 'filename']);
  var iAct = colIdx_(hdr, ['active']);
  if (iSrc < 0 || iFid < 0) throw new Error('แท็บ REGISTRY ไม่มีคอลัมน์ source หรือ file_id');

  for (var i = 1; i < v.length; i++) {
    if (String(v[i][iSrc]).trim().toUpperCase() !== 'PS') continue;
    if (String(v[i][iYr]).trim() !== String(year)) continue;
    if (iTyp >= 0 && String(v[i][iTyp]).trim().toUpperCase() !== type) continue;
    if (String(v[i][iFid]).trim() !== fileId) {            // มีแถวแล้วแต่ ID ไม่ตรง → อัปเดตให้
      sh.getRange(i + 1, iFid + 1).setValue(fileId);
      return fileName + ': แก้ File ID ให้ตรง';
    }
    return fileName + ': ลงทะเบียนไว้แล้ว';
  }
  var row = new Array(hdr.length).fill('');
  if (iYr  >= 0) row[iYr]  = year;
  if (iTyp >= 0) row[iTyp] = type;
  row[iSrc] = 'PS';
  row[iFid] = fileId;
  if (iFnm >= 0) row[iFnm] = fileName;
  if (iAct >= 0) row[iAct] = 'Y';
  sh.appendRow(row);
  return fileName + ': เพิ่มแถวใหม่';
}
