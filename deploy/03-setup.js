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

/**
 * ---------- คอลัมน์ที่ระบบ "ต่อท้าย" ในแท็บ ps_report ----------
 * 23 คอลัมน์เดิมของ My Account อยู่ครบเป๊ะ ไม่ขยับ ไม่แตะ
 * ระบบต่อท้ายอีก 2 กลุ่ม แล้วหาคอลัมน์จาก "ชื่อหัว" เสมอ (ไม่ยึดตำแหน่ง)
 * → ถ้าวันหลัง My Account เพิ่มคอลัมน์ ระบบก็ยังหาถูก
 */

/** กลุ่มน้ำเงิน — ระบบคำนวณให้ ห้ามพิมพ์ทับ (โดนเขียนทับทุกครั้งที่กดอัปเดต) */
var SYS_COLS = [
  ['got',        'รับแล้ว (จำนวน)'],
  ['got_amt',    'รับแล้ว (บาท)'],
  ['got_vat',    'รับแล้ว + VAT'],
  ['remain',     'ค้างรับ (จำนวน)'],
  ['remain_amt', 'ค้างรับ (บาท)'],
  ['remain_vat', 'ค้างรับ + VAT'],
  ['status',     'สถานะ (ระบบ)'],
  ['age_days',   'อายุ (วัน)'],
  ['rr_no',      'เลขที่ใบรับ'],
  ['tier',       'ชั้นที่จับคู่']
];

/** กลุ่มส้ม — จัดซื้อพิมพ์เอง ระบบไม่แตะเด็ดขาด */
var HUM_COLS = [
  ['h_status',   'สถานะ (จัดซื้อ)'],
  ['h_doc',      'สถานะเอกสาร'],
  ['h_recv',     'ยืนยันรับเอง (จำนวน)'],
  ['h_recvdate', 'วันที่ยืนยัน'],
  ['h_newship',  'นัดส่งใหม่'],
  ['h_billed',   'ตั้งเบิกแล้ว (บาท)'],
  ['h_intl',     'สถานะของนำเข้า'],
  ['h_note',     'หมายเหตุ'],
  ['h_reason',   'เหตุผล']
];

/** ตัวเลือกในช่องกดเลือก */
var LIST_STATUS = ['Y', 'N', 'P'];                       // ลิสต์เดียวกับ docustatus เป๊ะ
var LIST_DOC    = ['ยังไม่ได้ของ', 'รับของแล้ว ยังไม่ RR', 'RR แล้ว', 'ยกเลิก / ไม่รับแล้ว'];
var LIST_INTL   = ['สั่งแล้ว', 'ลงเรือแล้ว', 'ถึงท่าเรือ', 'ผ่านศุลกากร', 'ถึงโรงงาน'];
var DOC_RECV    = 'รับของแล้ว ยังไม่ RR';                 // = ถือว่าของมาแล้ว
var DOC_CANCEL  = 'ยกเลิก / ไม่รับแล้ว';
var VAT_RATE    = 0.07;

/** คอลัมน์ดิบของ My Account ที่ระบบต้องใช้ — หาจากชื่อหัว */
var SRC_KEYS = {
  docuno:['docuno'], poid:['poid'], listno:['listno'], docudate:['docudate'], shipdate:['shipdate'],
  docustatus:['docustatus'], cancelflag:['cancelflag'], goodname:['goodname'], goodqty2:['goodqty2'],
  goodprice2:['goodprice2'], goodamnt:['goodamnt'], vendorcode:['vendorcode'], vendorname:['vendorname'],
  goodcode:['goodcode'], goodunitname:['goodunitname'], jobcode:['jobcode'], jobname:['jobname']
};

/** อ่านหัวตาราง แล้วบอกว่าคอลัมน์ไหนอยู่ตำแหน่งไหน (0-based) */
function poColMap_(hdr) {
  var h = [];
  for (var i = 0; i < hdr.length; i++) h.push(s_(hdr[i]));
  var C = {};
  for (var k in SRC_KEYS) C[k] = colIdx_(h, SRC_KEYS[k]);
  function exact(name) {
    for (var j = 0; j < h.length; j++) if (h[j] === name) return j;
    return -1;
  }
  for (var a = 0; a < SYS_COLS.length; a++) C[SYS_COLS[a][0]] = exact(SYS_COLS[a][1]);
  for (var b = 0; b < HUM_COLS.length; b++) C[HUM_COLS[b][0]] = exact(HUM_COLS[b][1]);
  return C;
}

function colKeys_(defs) { var a = []; for (var i = 0; i < defs.length; i++) a.push(defs[i][0]); return a; }
function colHeads_(defs) { var a = []; for (var i = 0; i < defs.length; i++) a.push(defs[i][1]); return a; }

/** ชื่อแท็บ — รวมไว้ที่เดียว */
var TAB = {
  PO  : 'ps_report',          // ตารางหลัก (ของเบียร์ + คอลัมน์ที่ระบบต่อท้าย)
  RR  : 'RR',                 // ใบรับ (ของเบียร์ + คอลัมน์สถานะจับคู่)
  SUM : 'สรุปภาพรวม'
};
var RR_SYS_COLS = [['mstat', 'สถานะจับคู่']];

var SCHEMA = {
  /* ไฟล์ข้ามปี : STT-PS-RR-ALL */
  RRALL: {
    RR_ALL: ['year_th','docuno','docudate','pono','listno','goodcode','goodcode_n','goodname','goodqty2',
             'goodprice2','gooddiscformula','gooddiscamnt','goodamnt','vendorcode','vendorname',
             'jobcode','jobname','goodunitname','invno','advnamnt','netamnt','imported_at'],
    PS_PRICE_LATEST: ['goodcode_n','goodname','unit','last_price','last_date','last_vendor','wac_policy',
                      'source','n_buy_12m','min_price','max_price','updated_at']
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
  try { yearId = yearFile_(year, 'YEAR'); } catch (_) { yearId = ''; }
  if (s_(poUrl)) yearId = fileIdOf_(poUrl);
  if (!yearId)
    throw new Error('ยังไม่รู้ว่าไฟล์ของปี ' + year + ' คือไฟล์ไหน — วางลิงก์ไฟล์ PO Report ' +
                    'ที่มีแท็บ ' + TAB.PO + ' และ ' + TAB.RR + ' ก่อน');

  step('ตรวจไฟล์ของปี ' + year, function () {
    var ss = SpreadsheetApp.openById(yearId);
    var miss = [];
    if (!ss.getSheetByName(TAB.PO)) miss.push(TAB.PO);
    if (!ss.getSheetByName(TAB.RR)) miss.push(TAB.RR);
    if (miss.length)
      throw new Error('ไฟล์นี้ไม่มีแท็บ ' + miss.join(' และ ') + ' — ใช่ไฟล์ PO Report หรือเปล่า');
    return ss.getName();
  });

  step('ต่อคอลัมน์ในแท็บ ' + TAB.PO, function () {
    return addCols_(yearId, TAB.PO, SYS_COLS.concat(HUM_COLS));
  });

  step('ต่อคอลัมน์ในแท็บ ' + TAB.RR, function () {
    return addCols_(yearId, TAB.RR, RR_SYS_COLS);
  });

  step('ใส่ช่องกดเลือก + สีหัวตาราง', function () {
    return dressPo_(yearId);
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

  step('ล้างแคช', function () {
    cacheDrop_(['PS_REGISTRY', 'PS_SETTINGS', 'PS_USERS', 'PS_POIDX', 'PS_RRALL',
                'PS_RRLINK', 'PS_PODOCS']);
    return 'เรียบร้อย';
  });

  var failed = log.filter(function (x) { return !x.ok; }).length;
  return { year: year, fileId: yearId, steps: log,
           passed: log.length - failed, failed: failed,
           totalMs: new Date().getTime() - t0 };
}

/**
 * ต่อคอลัมน์ที่ยังไม่มีไว้ท้ายตาราง — ของเดิมไม่ขยับสักช่อง
 * หาจากชื่อหัวแบบตรงตัว ถ้ามีแล้วข้าม (กดซ้ำกี่รอบก็ได้ผลเท่าเดิม)
 */
function addCols_(fileId, tab, defs) {
  var sh = SpreadsheetApp.openById(fileId).getSheetByName(tab);
  if (!sh) throw new Error('ไม่พบแท็บ ' + tab);
  var lastCol = sh.getLastColumn();
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return s_(x); });

  var need = [];
  for (var i = 0; i < defs.length; i++) if (hdr.indexOf(defs[i][1]) < 0) need.push(defs[i][1]);
  if (!need.length) return 'ครบอยู่แล้ว ' + defs.length + ' คอลัมน์';

  if (sh.getMaxColumns() < lastCol + need.length)
    sh.insertColumnsAfter(sh.getMaxColumns(), lastCol + need.length - sh.getMaxColumns());
  sh.getRange(1, lastCol + 1, 1, need.length).setValues([need]);
  return 'เพิ่ม ' + need.length + ' คอลัมน์ (' + need.join(', ') + ')';
}

/** สีหัวตาราง + ช่องกดเลือก + ตรึงหัว — ทำกับแท็บ ps_report */
function dressPo_(fileId) {
  var sh = SpreadsheetApp.openById(fileId).getSheetByName(TAB.PO);
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return s_(x); });
  var C = poColMap_(hdr);
  var done = [];

  function paint(defs, bg) {
    for (var i = 0; i < defs.length; i++) {
      var c = C[defs[i][0]];
      if (c < 0) continue;
      sh.getRange(1, c + 1).setBackground(bg).setFontColor('#FFFFFF').setFontWeight('bold');
      done.push(defs[i][1]);
    }
  }
  paint(SYS_COLS, '#1D6FD1');       // น้ำเงิน = ระบบเติม
  paint(HUM_COLS, '#B5710A');       // ส้ม = คนกรอก

  var rows = Math.max(sh.getMaxRows() - 1, 1);
  function dropdown(key, list) {
    var c = C[key];
    if (c < 0) return;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true)
                 .setAllowInvalid(false).build();
    sh.getRange(2, c + 1, rows, 1).setDataValidation(rule);
  }
  dropdown('h_status', LIST_STATUS);
  dropdown('h_doc',    LIST_DOC);
  dropdown('h_intl',   LIST_INTL);

  sh.setFrozenRows(1);
  return 'ทาสีหัว ' + done.length + ' คอลัมน์ · ใส่ช่องกดเลือก 3 ช่อง';
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
