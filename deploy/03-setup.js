/**
 * NOVA – PURCHASE & STORE HUB
 * 03-setup.js — ติดตั้งโครงข้อมูล (สร้างไฟล์รายปี · RR-ALL · ตารางกลาง · ลงทะเบียน REGISTRY)
 *
 * กฎ
 *  - ปลอดภัย: ถ้ามีอยู่แล้วจะไม่สร้างทับ แค่รายงานว่ามีแล้ว (เรียกกี่รอบก็ได้ผลเท่าเดิม)
 *  - ไม่แตะแท็บเดิมของ NOVA ใน STT-DB-MASTER (USERS / SETTINGS / REGISTRY เดิม) เพิ่มแท็บใหม่อย่างเดียว
 *  - โค้ดชุดนี้จะถูกใช้ซ้ำตอน "ปิดปี" (X5) ทุกปี → เขียนครั้งเดียวใช้ 20 ปี
 */

/** ---------- โครงตารางทั้งหมด (แหล่งความจริงเดียว) ---------- */
var SCHEMA = {

  /* ===== ไฟล์รายปี : STT-PS-<ปี> ===== */
  YEAR: {
    PO_LINE: ['year_th','poid','listno','docuno','docudate','shipdate','docustatus','onhold','cancelflag',
              'goodcode','goodcode_n','goodname','goodqty2','goodprice2','gooddiscformula','gooddiscamnt',
              'goodamnt','vendorcode','vendorname','goodunitname','jobcode','jobname','invecode','locacode',
              'prdocuno','cat','imported_at'],
    MATCH_LINK: ['rr_docuno','rr_listno','pono','poid','po_listno','qty','tier','matched_at'],
    GRN:        ['grn_no','grn_date','poid','listno','docuno','goodcode','goodname','qty_recv','unit',
                 'warehouse','by_emp','photo_ids','note','approve_status','approve_by','approve_at','created_at'],
    STOCK_MOVE: ['move_id','move_date','move_type','goodcode','goodname','unit','warehouse','qty',
                 'ref_type','ref_no','jobcode','by_emp','reason','created_at'],
    'ตั้งเบิก':  ['req_no','req_date','poid','listno','docuno','amount','note','created_at'],
    IMPORT_LOG: ['run_id','run_at','by_emp','source','file_id','rows_read','rows_written','rows_skipped',
                 'ms','status','detail'],
    LOG:        ['at','by_emp','action','target','before','after','reason']
  },

  /* ===== ไฟล์ต้นทุน : STT-PS-RR-ALL (ไฟล์เดียวตลอด 20 ปี) ===== */
  RRALL: {
    RR_ALL: ['year_th','docuno','docudate','pono','listno','goodcode','goodcode_n','goodname','goodqty2',
             'goodprice2','gooddiscformula','gooddiscamnt','goodamnt','vendorcode','vendorname',
             'jobcode','jobname','goodunitname','invno','advnamnt','netamnt','imported_at'],
    PRICE_HISTORY: ['goodcode_n','year_th','qty','amount','wac','last_date','last_price','n_receipt','updated_at']
  },

  /* ===== ตารางกลางใน STT-DB-MASTER (เพิ่มใหม่ ไม่แตะของเดิม) ===== */
  MASTER: {
    /* ตารางกลางของฝั่งจัดซื้อ — "ทุกบรรทัด" ไม่ใช่เฉพาะค้างรับ
       หน้าฐานข้อมูล PO และหน้า PO ค้างรับ อ่านจากตารางเดียวกันนี้
       → ตัวเลขสองหน้าไม่มีทางไม่ตรงกัน */
    PS_PO_INDEX:     ['poid','listno','docuno','year_th','month','docudate','shipdate','newship',
                      'goodcode_n','goodname','unit','vendorcode','vendorname','jobcode','jobname',
                      'cat','is_intl','cancelled','ordered','recv_rr','recv_manual','remain',
                      'price','amnt','amnt_remain','billed_amount','intl_status','note','closed',
                      'status','age_days','updated_at'],
    PS_PO_EDIT:      ['poid','listno','docuno','recv_manual','recv_date','billed_amount','billed_note',
                      'newship','note','intl_status','closed','close_reason','by_emp','updated_at'],
    PS_PRICE_LATEST: ['goodcode_n','goodname','unit','last_price','last_date','last_vendor','wac_policy',
                      'source','n_buy_12m','min_price','max_price','updated_at'],
    PS_ITEM_MASTER:  ['goodcode_n','goodname','unit','cat','type','warehouse','min_qty','max_qty',
                      'first_seen','last_seen','updated_at'],
    PS_VENDOR:       ['vendorcode','vendorname','first_rr','last_rr','n_rr','amount_ytd','lead_days_avg',
                      'is_new','tax_id','note','updated_at'],
    PS_MARKET_PRICE: ['goodcode_n','price','unit','incl_vat','source_url','ref_date','screenshot_id',
                      'by_emp','approve_by','approve_at','expire_at'],
    PS_SUM_YEAR:     ['year_th','po_lines','po_amount','rr_lines','rr_amount','open_lines','open_amount',
                      'vendors','items','updated_at'],
    PS_DOC_INDEX:    ['doc_no','doc_type','year_th','file_id','tab','row_hint','updated_at']
  }
};

/** ---------- ฟังก์ชันที่หน้าเว็บเรียก ---------- */
function psSetup(auth) {
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

  step('ตารางกลางใน STT-DB-MASTER', function () {
    return ensureTabs_(CFG.MASTER, SCHEMA.MASTER);
  });

  var yearId = '';
  step('ไฟล์รายปี STT-PS-' + year, function () {
    var r = ensureFile_('STT-PS-' + year, SCHEMA.YEAR);
    yearId = r.id;
    return r.msg;
  });

  var rrId = '';
  step('ไฟล์ต้นทุน STT-PS-RR-ALL', function () {
    var r = ensureFile_('STT-PS-RR-ALL', SCHEMA.RRALL);
    rrId = r.id;
    return r.msg;
  });

  step('ลงทะเบียนใน REGISTRY (source = PS)', function () {
    var a = ensureRegistry_(year, 'YEAR', yearId, 'STT-PS-' + year);
    var b = ensureRegistry_('ALL', 'RRALL', rrId, 'STT-PS-RR-ALL');
    return a + ' · ' + b;
  });

  // ทำให้เปิดชีตดูเองได้ตอนหน้าเว็บมีปัญหา (ตรึงหัว · ตัวกรอง · คำอธิบายไทย · แท็บคู่มือ)
  step('จัดหน้าตาฐานข้อมูล + เขียนแท็บคู่มือ', function () {
    var b = psBeautify(auth);
    return 'จัดแล้ว ' + b.tabs + ' แท็บ' + (b.errors.length ? ' · ข้าม ' + b.errors.length : '');
  });

  step('ล้างแคช', function () {
    cacheDrop_(['PS_REGISTRY', 'PS_SETTINGS', 'PS_USERS']);
    return 'เรียบร้อย';
  });

  var failed = log.filter(function (x) { return !x.ok; }).length;
  return { year: year, steps: log, passed: log.length - failed, failed: failed,
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
