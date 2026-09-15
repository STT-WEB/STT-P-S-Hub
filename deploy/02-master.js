/**
 * NOVA – PURCHASE & STORE HUB
 * 02-master.js — อ่านข้อมูลจากไฟล์กลาง · แคช · ทะเบียนไฟล์รายปี (REGISTRY)
 *
 * หลักการความเร็ว (ชั้น 0–4):
 *   ชั้น 0  cacheOr_()        จำคำตอบไว้ ไม่ยิงซ้ำ
 *   ชั้น 2  fetchTabValues_() อ่านเฉพาะ "แท็บเดียว" ไม่เปิดทั้งไฟล์
 *   ชั้น 4  yearFile_()       เปิดไฟล์ปีเก่าเฉพาะเมื่อมีคนกดขอจริง
 */

/** ---------- ชั้น 2: อ่านเฉพาะแท็บเดียว (เร็วกว่า openById ทั้งไฟล์) ---------- */
function fetchTabValues_(fileId, tabName) {
  try {
    var range = "'" + String(tabName).replace(/'/g, "''") + "'";
    var r = Sheets.Spreadsheets.Values.get(fileId, range);
    return (r && r.values) ? r.values : null;
  } catch (e) {
    return null;
  }
}

/** สำรอง: ถ้า Sheets API ใช้ไม่ได้ ค่อยเปิดทั้งไฟล์ (ช้ากว่า ใช้เท่าที่จำเป็น) */
function openTabValues_(fileId, tabName) {
  var v = fetchTabValues_(fileId, tabName);
  if (v) return v;
  try {
    var sh = SpreadsheetApp.openById(fileId).getSheetByName(tabName);
    return sh ? sh.getDataRange().getValues() : null;
  } catch (e) {
    return null;
  }
}

/** ---------- ชั้น 0: แคช ---------- */
function cacheOr_(key, ttlSec, fn) {
  var c = null;
  try { c = CacheService.getScriptCache(); } catch (e) {}
  if (c) {
    try {
      var hit = c.get(key);
      if (hit) return JSON.parse(hit);
    } catch (e) {}
  }
  var val = fn();
  if (c && val !== null && val !== undefined) {
    try { c.put(key, JSON.stringify(val), ttlSec); } catch (e) {}
  }
  return val;
}

/** ล้างแคช — ทุกฟังก์ชันที่ "เขียนข้อมูล" ต้องเรียกตัวนี้กับตารางที่มันแตะ (กฎข้อ 7) */
function cacheDrop_(keys) {
  try {
    var c = CacheService.getScriptCache();
    if (c) c.removeAll([].concat(keys));
  } catch (e) {}
}

/** ---------- หาคอลัมน์จาก "ชื่อหัวตาราง" ไม่ใช่ตำแหน่ง (แทรกคอลัมน์แล้วไม่พัง) ---------- */
/**
 * หาคอลัมน์จาก "ชื่อหัวตาราง" — ต้องเทียบแบบตรงตัวก่อนเสมอ
 *
 * บทเรียน 15 ก.ย. 2569: ไฟล์ RR ของ My Account มีทั้ง sumGoodamnt และ goodamnt
 * และมีทั้ง vendornameeng กับ VendorName ถ้าเทียบแบบ "มีคำนี้อยู่ข้างใน" อย่างเดียว
 * จะไปโดนคอลัมน์ผิดที่อยู่ก่อน → ยอดเงินรับเข้าเพี้ยนทั้งไฟล์
 * จึงต้องกวาดหาแบบตรงตัวให้ครบทุกคอลัมน์ก่อน แล้วค่อยยอมให้เป็นการเดาแบบใกล้เคียง
 */
function colIdx_(hdr, names) {
  var h = [];
  for (var j = 0; j < hdr.length; j++) h.push(String(hdr[j]).toLowerCase().trim());

  for (var k = 0; k < names.length; k++) {                 // รอบที่ 1 — ตรงตัวเป๊ะ
    var want = String(names[k]).toLowerCase().trim();
    for (var a = 0; a < h.length; a++) if (h[a] === want) return a;
  }
  for (var k2 = 0; k2 < names.length; k2++) {              // รอบที่ 2 — มีคำนี้อยู่ข้างใน
    var w2 = String(names[k2]).toLowerCase().trim();
    for (var b = 0; b < h.length; b++) if (h[b].indexOf(w2) >= 0) return b;
  }
  return -1;
}

/** ---------- SETTINGS ---------- */
function getSettings_() {
  return cacheOr_('PS_SETTINGS', TTL.SETTINGS, function () {
    var v = openTabValues_(CFG.MASTER, 'SETTINGS');
    var o = {};
    if (v) {
      for (var i = 0; i < v.length; i++) {
        var k = String(v[i][0] || '').trim();
        if (k) o[k] = v[i][1];
      }
    }
    return o;
  });
}

function getSetting_(key, dflt) {
  var s = getSettings_();
  return (s && s[key] !== undefined && s[key] !== '') ? s[key] : dflt;
}

/** ---------- REGISTRY: ปี พ.ศ. -> File ID (ห้ามฝัง ID ในโค้ด) ---------- */
function getRegistryPS_() {
  return cacheOr_('PS_REGISTRY', TTL.REGISTRY, function () {
    var v = openTabValues_(CFG.MASTER, 'REGISTRY');
    if (!v || v.length < 2) return [];
    var hdr = v[0].map(function (x) { return String(x).trim(); });
    var iYr  = colIdx_(hdr, ['year(พ.ศ.)', 'year (พ.ศ.)', 'พ.ศ.', 'year']);
    var iSrc = colIdx_(hdr, ['source']);
    var iFid = colIdx_(hdr, ['file_id', 'fileid']);
    var iFnm = colIdx_(hdr, ['file_name', 'filename']);
    var iAct = colIdx_(hdr, ['active']);
    var iTyp = colIdx_(hdr, ['type']);
    var out = [];
    for (var i = 1; i < v.length; i++) {
      var src = iSrc >= 0 ? String(v[i][iSrc] || '').trim().toUpperCase() : '';
      if (src !== 'PS') continue;                                   // เอาเฉพาะของ P&S Hub
      if (iAct >= 0 && String(v[i][iAct]).trim().toUpperCase() === 'N') continue;
      out.push({
        year: String(iYr >= 0 ? v[i][iYr] : '').trim(),
        type: iTyp >= 0 ? String(v[i][iTyp] || '').trim() : '',
        fileId: iFid >= 0 ? String(v[i][iFid] || '').trim() : '',
        fileName: iFnm >= 0 ? String(v[i][iFnm] || '').trim() : '',
        row: i + 1
      });
    }
    return out;
  });
}

/** หา File ID ของปีที่ต้องการ — ไม่เจอให้ error ชัด ๆ ห้ามคืนค่าว่างเงียบ ๆ */
function yearFile_(yearTH, type) {
  var want = String(yearTH).trim();
  var wantType = String(type || '').trim().toUpperCase();
  var reg = getRegistryPS_();
  for (var i = 0; i < reg.length; i++) {
    if (reg[i].year !== want) continue;
    if (wantType && String(reg[i].type).toUpperCase() !== wantType) continue;
    if (reg[i].fileId) return reg[i].fileId;
  }
  throw new Error('ยังไม่ได้ลงทะเบียนไฟล์ของปี ' + want +
                  (wantType ? (' (ชนิด ' + wantType + ')') : '') +
                  ' ในแท็บ REGISTRY ของ STT-DB-MASTER');
}

/** ปีปัจจุบัน (พ.ศ.) — อ่านจาก SETTINGS.year_th ถ้ามี ไม่มีค่อยคำนวณ */
function currentYearTH_() {
  var y = getSetting_('year_th', '');
  if (y) return String(y).trim();
  return String(new Date().getFullYear() + 543);
}
