/**
 * guard-v0500 — รัน "ทั้งสายงาน" ของจริงบน Node: นำเข้า PO → นำเข้า RR → สร้างตารางกลาง →
 *                อ่านผ่าน getPoAll / getOpenPO เหมือนที่หน้าเว็บเรียก
 * รัน:  node _tests/guard-v0500.js
 *
 * ต่างจาก guard-v0300 ตรงที่ v0300 ทดสอบเฉพาะ "เครื่องจับคู่"
 * ส่วนชุดนี้ทดสอบตั้งแต่ไฟล์ Excel ของ My Account จนถึงตัวเลขที่หน้าจอแสดง
 */
const { build } = require('./harness.js');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else      { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'ได้ ' + got + (got === want ? '' : ' · ควรได้ ' + want)); }
function near(name, got, want, tol) {
  ok(name, Math.abs(got - want) < (tol || 0.01),
     'ได้ ' + got.toFixed(2) + (Math.abs(got - want) < (tol || 0.01) ? '' : ' · ควรได้ ' + want.toFixed(2)));
}

console.log('\n=== guard-v0500 : ทั้งสายงาน นำเข้า → ตารางกลาง → หน้าจอ ===\n');

const URL = 'https://docs.google.com/spreadsheets/d/1ZRHCnbu-Dzdzk1RwHewgqKDUeb8gjngzHrhls32SSqQ/edit';
const H = build({ role: 'ADMIN' });
const S = H.sandbox;

/* ---------- 1. นำเข้า ---------- */
console.log('— นำเข้าจากไฟล์ My Account จริง —');
const ip = S.psImportPO({}, URL, 'ps_report');
eq('PO อ่านได้',          ip.read, 7951);
eq('PO เขียนลงตาราง',     ip.written, 7950);
eq('PO แถวเสีย 1 แถว',    ip.skipped, 1);
eq('PO แถวเสียคือแถว 179', ip.skippedRows[0].row, 179);

const ir = S.psImportRR({}, URL, 'RR');
eq('RR อ่านได้',          ir.read, 7513);
eq('RR ใช้งานได้',        ir.written, 7512);
eq('RR แถวเสียคือแถว 151', ir.skippedRows[0].row, 151);

/* ---------- 2. จับคู่ + ตารางกลาง ---------- */
console.log('\n— จับคู่และสร้าง PS_PO_INDEX —');
const rb = S.psRebuild({});
eq('บรรทัด PO ที่ใช้จับคู่', rb.poLines, 7878);
eq('จับคู่ได้',             rb.matched, 7375);
eq('ชั้น C1',               rb.tiers.C1, 7373);
eq('รับข้ามปี (ไม่มี PO ปีนี้)', rb.noPO, 137);
eq('จับคู่ไม่ได้',          rb.unmatched, 0);
eq('รับเกินที่สั่ง',        rb.over, 0);
eq('ตารางกลางมีทุกบรรทัด',  rb.indexLines, 7950);
eq('บรรทัดค้างรับ',         rb.openLines, 617);
eq('ใบ PO ที่ยังค้าง',      rb.openDocs, 184);
near('มูลค่าค้างรับ',        rb.openValue, 28432882.99);

/* ---------- 3. ตารางกลางต้องครบทุกสถานะ ---------- */
console.log('\n— ตารางกลางต้องไม่ทิ้งบรรทัดไหน —');
const rows = H.store.MASTER.PS_PO_INDEX.slice(1);
const nCancel = rows.filter(r => r[17] === 'Y').length;
eq('บรรทัดยกเลิกถูกเก็บไว้', nCancel, 72);
eq('รวมแล้วเท่าจำนวนที่นำเข้า', rows.length, 7950);
ok('ทุกบรรทัดมีคีย์ poid+listno', rows.every(r => String(r[0]) && String(r[1])));
const keys = {};
rows.forEach(r => { keys[r[0] + '|' + r[1]] = (keys[r[0] + '|' + r[1]] || 0) + 1; });
eq('คีย์ไม่ซ้ำ', Object.keys(keys).length, 7950);

/* ---------- 4. หน้าฐานข้อมูล PO ---------- */
console.log('\n— getPoAll : หน้าฐานข้อมูล —');
const all = S.getPoAll({}, { page: 1, size: 100 });
eq('บรรทัดทั้งหมด',  all.all.lines, 7950);
eq('ใบ PO ทั้งหมด',  all.all.docs, 2273);
eq('ค้างรับ',        all.all.open, 617);
eq('รับครบ',         all.all.done, 7261);
eq('ยกเลิก',         all.all.cancelled, 72);
eq('ยอดรวมสามช่องต้องเท่าบรรทัดทั้งหมด',
   all.all.open + all.all.done + all.all.cancelled + all.all.closed, 7950);
near('ยอดสั่งรวม',   all.all.amnt, 77674802.64);
near('มูลค่าค้างรับ', all.all.openVal, 28432882.99);
eq('หน้าแรกส่ง 100 บรรทัด', all.rows.length, 100);
eq('จำนวนหน้า',      all.pages, 80);

const openOnly = S.getPoAll({}, { status: 'open', size: 200 });
eq('กรองค้างรับ',    openOnly.filtered.lines, 617);
near('มูลค่าตรงกับหน้าค้างรับ', openOnly.filtered.openVal, 28432882.99);
const cancelOnly = S.getPoAll({}, { status: 'cancelled', size: 200 });
eq('กรองยกเลิก',     cancelOnly.filtered.lines, 72);
const intlOnly = S.getPoAll({}, { intl: 'Y', size: 200 });
ok('กรองต่างประเทศได้', intlOnly.filtered.lines > 0 &&
   intlOnly.rows.every(r => /^POR\.INT/i.test(r.po)), intlOnly.filtered.lines + ' บรรทัด');
const q = S.getPoAll({}, { q: 'yangzhou', size: 200 });
ok('ค้นหาชื่อผู้ขายได้', q.filtered.lines > 0 &&
   q.rows.every(r => /yangzhou/i.test(r.vendor + ' ' + r.name + ' ' + r.po)),
   q.filtered.lines + ' บรรทัด');

/* ---------- 5. หน้าค้างรับต้องตรงกับฐานข้อมูลเป๊ะ ---------- */
console.log('\n— หน้าค้างรับต้องอ่านจากตารางเดียวกัน —');
const op = S.getOpenPO({}, {});
eq('บรรทัดค้างรับตรงกัน', op.sum.lines, openOnly.filtered.lines);
near('มูลค่าค้างรับตรงกัน', op.sum.value, openOnly.filtered.openVal);
eq('ใบ PO ค้างตรงกัน', op.sum.docs, 184);

/* ---------- 6. สิทธิ์: สโตร์ต้องไม่เห็นราคา ---------- */
console.log('\n— สิทธิ์ราคา —');
const HS = build({ role: 'STORE' });
HS.sandbox.psImportPO({}, URL, 'ps_report');
HS.sandbox.psImportRR({}, URL, 'RR');
HS.sandbox.__ROLE = 'ADMIN';
HS.sandbox.psRebuild({});
HS.sandbox.__ROLE = 'STORE';
const st = HS.sandbox.getPoAll({}, { page: 1, size: 20 });
ok('สโตร์: ยอดรวมเป็น null', st.all.amnt === null && st.all.openVal === null);
ok('สโตร์: ทุกบรรทัดไม่มีราคา',
   st.rows.every(r => r.price === null && r.amnt === null && r.value === null));
ok('สโตร์: แก้ข้อมูลไม่ได้', st.canEdit === false);
ok('สโตร์: ยังเห็นจำนวนและสถานะ',
   st.rows.every(r => typeof r.ordered === 'number' && r.status));

/* ---------- 7. หาคอลัมน์ต้องตรงตัวก่อนเสมอ ---------- */
console.log('\n— colIdx_ ต้องไม่ไปโดนคอลัมน์ผิด —');
var CI = S.colIdx_;
eq('goodamnt ต้องไม่ไปโดน sumGoodamnt', CI(['sumGoodamnt', 'goodamnt'], ['goodamnt']), 1);
eq('vendorname ต้องไม่ไปโดน vendornameeng',
   CI(['vendorcode', 'vendornameeng', 'VendorName'], ['vendorname']), 2);
eq('ไม่มีตรงตัว ค่อยยอมให้ใกล้เคียง', CI(['sumGoodamnt'], ['goodamnt']), 0);
eq('ไม่เจอเลยต้องได้ -1', CI(['a', 'b'], ['zzz']), -1);

/* ---------- 8. ฐานข้อมูลการรับเข้า ---------- */
console.log('\n— getRrAll : หน้าฐานข้อมูลการรับเข้า —');
var rr = S.getRrAll({}, { size: 100 });
eq('บรรทัดรับเข้าทั้งหมด', rr.all.lines, 7512);
eq('จำนวนใบรับ',          rr.all.docs, 2408);
eq('จับคู่กับ PO ได้',     rr.all.ok, 7375);
eq('รับข้ามปี',           rr.all.cross, 137);
eq('ยังไม่จับคู่',        rr.all.todo, 0);
eq('ไม่ได้อ้าง PO',       rr.all.nopo, 0);
eq('สามช่องรวมกันต้องเท่าทั้งหมด', rr.all.ok + rr.all.cross + rr.all.todo + rr.all.nopo, 7512);
near('มูลค่ารับเข้ารวม',   rr.all.amnt, 53035868.64, 0.05);

// ยอดเงินต้องเป็นของ "บรรทัด" ไม่ใช่ยอดรวมทั้งใบ — เคยพลาดเพราะไฟล์มี sumGoodamnt
var line1 = rr.rows.filter(function (x) { return x.qty > 0 && x.price > 0; })[0];
ok('ยอดเงินต่อบรรทัด = จำนวน × ราคา (ก่อนหักส่วนลด)',
   Math.abs(line1.qty * line1.price - line1.amnt) <= Math.abs(line1.qty * line1.price) * 0.5,
   line1.qty + ' × ' + line1.price + ' ≈ ' + line1.amnt);
ok('ทุกบรรทัดมีชื่อผู้ขาย', rr.rows.every(function (x) { return !!x.vendor; }));

var cross = S.getRrAll({}, { mstat: 'cross', size: 200 });
eq('กรองรับข้ามปี', cross.filtered.lines, 137);
near('มูลค่ารับข้ามปี', cross.filtered.amnt, 4593786.54, 0.05);
ok('รับข้ามปีทุกบรรทัดต้องไม่ใช่ PO ปีนี้',
   cross.rows.every(function (x) { return x.mk === 'cross'; }));

var one = S.getRrOfPo({}, 'POR-69/2158');
eq('ใบรับของ PO ใบเดียว — บรรทัด', one.lines, 3);
eq('ใบรับของ PO ใบเดียว — ใบรับ',  one.docs, 1);
near('ใบรับของ PO ใบเดียว — ยอดเงิน', one.amnt, 36240, 0.01);

/* ---------- 9. สิทธิ์ราคาในหน้ารับเข้า ---------- */
console.log('\n— สิทธิ์ราคา (หน้ารับเข้า) —');
HS.sandbox.__ROLE = 'STORE';
var rrS = HS.sandbox.getRrAll({}, { size: 20 });
ok('สโตร์: ยอดรวมเป็น null', rrS.all.amnt === null && rrS.filtered.amnt === null);
ok('สโตร์: ทุกบรรทัดไม่มีราคา',
   rrS.rows.every(function (x) { return x.price === null && x.amnt === null; }));
ok('สโตร์: ยังเห็นจำนวนและสถานะจับคู่',
   rrS.rows.every(function (x) { return typeof x.qty === 'number' && x.mt; }));
var oneS = HS.sandbox.getRrOfPo({}, 'POR-69/2158');
ok('สโตร์: กล่องใบรับของ PO ก็ไม่มีราคา',
   oneS.amnt === null && oneS.rows.every(function (x) { return x.amnt === null; }));

console.log('\n' + (fail ? '✗ ไม่ผ่าน ' + fail + ' ข้อ' : '✓ ผ่านหมด') + ' (' + pass + '/' + (pass + fail) + ')\n');
process.exit(fail ? 1 : 0);
