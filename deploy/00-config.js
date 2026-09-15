/**
 * NOVA – PURCHASE & STORE HUB
 * 00-config.js — ค่าคงที่ · เวอร์ชัน · จุดเข้าเว็บแอป
 *
 * ⚠️ กฎเหล็ก
 *  - ห้ามใส่ File ID ของไฟล์รายปีในโค้ด → ต้องอ่านจาก REGISTRY เท่านั้น (ดู 02-master.js)
 *  - ห้ามใส่โทเคน/รหัสลับในไฟล์นี้ → ใช้ Script Properties
 *  - ไฟล์โค้ดทุกไฟล์ยาวไม่เกิน ~1,500 บรรทัด (บทเรียนจาก NOVA: ไฟล์เดียว 807 KB แก้ทีเสี่ยงทั้งระบบ)
 */

var PS_VERSION = 'v0.6.0';
var PS_BUILD   = '2026-09-15';

var CFG = {
  // ใช้ทะเบียนผู้ใช้/ตั้งค่าร่วมกับ NOVA ใหญ่ (แท็บ USERS · SETTINGS · REGISTRY)
  MASTER   : '1ZCKb_KRECWRSRaObBQz4nDUmwazvV2lhoPMj2O5j744',
  // โฟลเดอร์ Drive: NOVA-Purchase&Store Hub
  PSFOLDER : '1rVHUm8GdXsG_VElRFuIoAX-E2o24bQmE',
  SCRIPT_ID: '11omqFMc3yIYDEernlRYhafVNDHWSA2NCFmuEWiIl_weebnn0OHVbsUT9'
};

/** อายุแคช (วินาที) — ตามเอกสารออกแบบความเร็ว 5 ชั้น */
var TTL = {
  USERS    : 300,    // 5 นาที
  SETTINGS : 21600,  // 6 ชม.
  REGISTRY : 21600,  // 6 ชม.
  SUMMARY  : 3600,   // 1 ชม. (ปิดยอดคืนละครั้ง)
  HOT      : 60      // 1 นาที (ค้างรับ / คิวอนุมัติ)
};

/** สิทธิ์ที่เห็นราคา/ต้นทุนได้ — STORE ไม่อยู่ในนี้โดยเจตนา ห้ามเติม */
var PRICE_ROLES = ['PURCHASE', 'ADMIN', 'EXEC'];

/** ป้ายชื่อบทบาทเป็นภาษาไทย */
var ROLE_LABEL = {
  PURCHASE: 'จัดซื้อ',
  STORE   : 'สโตร์ / คลังสินค้า',
  ADMIN   : 'ผู้ดูแลระบบ',
  EXEC    : 'ผู้บริหาร'
};

function getVersion() {
  return { version: PS_VERSION, build: PS_BUILD };
}

/** จุดเข้าเว็บแอป */
function doGet() {
  var t = HtmlService.createTemplateFromFile('PS-Hub-Index');
  return t.evaluate()
    .setTitle('NOVA – Purchase & Store Hub')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** ใช้ใน template: <?!= include('styles') ?>  — ห้ามมี ?> ในโค้ด JS (ชน template) */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
