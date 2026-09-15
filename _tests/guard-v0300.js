/**
 * ชุดทดสอบเครื่องจับคู่ PO↔RR — รันโค้ดตัวจริงจาก deploy/04-import.js กับข้อมูลจริงของ STT
 * รัน:  node _tests/guard-v0300.js
 *
 * จุดประสงค์: พิสูจน์ว่าโค้ดที่จะขึ้น Apps Script ให้ผลเท่ากับที่รายงานเบียร์ไว้เป๊ะ ๆ
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

// โหลดโค้ดตัวจริง (ไม่ก๊อปมาเขียนใหม่ — ป้องกันเทสกับของจริงไม่ตรงกัน)
const src = fs.readFileSync(path.join(ROOT, 'deploy', '04-import.js'), 'utf8');
const sandbox = { module: { exports: {} }, Date, Math, String, Number, isNaN, parseFloat, JSON, Utilities: null };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: '04-import.js' });
const { psMatchEngine_, ncd_, nn_, num_, cat_ } = sandbox.module.exports;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  — ' + detail : '')); }
  else      { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
function eq(name, got, want) { ok(name, got === want, 'ได้ ' + got + (got === want ? '' : ' · ควรได้ ' + want)); }

console.log('\n=== guard-v0300 : เครื่องจับคู่ PO↔RR กับข้อมูลจริง ===\n');

/* ---------- 1. ตัวช่วยแปลงค่า ---------- */
console.log('— ตัวช่วยแปลงค่า —');
eq('ncd_ ตัดคำนำหน้าตัวเลข',  ncd_('8-81641001'), '81641001');
eq('ncd_ ตัดคำนำหน้า INT-',   ncd_('INT-4040'),   '4040');
eq('ncd_ รับตัวเลขทศนิยม',    ncd_(81071011.0),   '81071011');
eq('nn_ ตัดช่องว่างทั้งหมด',  nn_(' ท่อ  PVC 2" '), 'ท่อpvc2"');
eq('num_ ตัดเครื่องหมายคั่น', num_('1,234.50'),   1234.5);
eq('num_ ค่าว่างเป็นศูนย์',    num_(null),         0);
eq('cat_ หมวดจากตัวเลขแรก',   cat_('81641001'),   '8');
eq('cat_ รหัสไม่ใช่ตัวเลข',    cat_('DS-001'),     '?');

/* ---------- 2. เคสสมมติที่ต้องจริงเสมอ ---------- */
console.log('\n— กติกาที่ต้องจริงเสมอ —');
const P = (docu, ln, code, job, name, price, qty) =>
  ({ docu, poid: 'X' + ln, ln: String(ln), code, job, name, price, qty, recv: 0 });
const R = (docu, pono, ln, code, job, name, price, qty, d) =>
  ({ docu, pono, ln: String(ln), code, job, name, price, qty, date: d || new Date(2026, 0, 1) });

let po = [P('A', 1, 'C1', 'J1', 'x', 10, 5)];
let m = psMatchEngine_(po, [R('r1', 'A', 1, 'C1', 'J1', 'x', 10, 5)]);
ok('C1 ตรงครบ 4 อย่าง', m.tiers.C1 === 1 && po[0].recv === 5);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5)];
m = psMatchEngine_(po, [R('r1', 'A', 1, 'C1', 'J1', 'x', 99, 5)]);
ok('ราคาไม่ตรง ตกไปชั้น C2', m.tiers.C2 === 1 && po[0].recv === 5);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5), P('A', 2, 'C1', 'J1', 'x', 10, 5)];
m = psMatchEngine_(po, [R('r1', 'A', 1, 'C1', 'J1', 'x', 10, 7)]);
ok('รับ 7 จาก 2 บรรทัดละ 5 → เติมตามลำดับ', po[0].recv === 5 && po[1].recv === 2);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5)];
m = psMatchEngine_(po, [R('r1', 'A', 1, 'C1', 'J1', 'x', 10, 8)]);
ok('รับเกินที่สั่ง → ไม่ยัดเกิน และรายงาน over', po[0].recv === 5 && m.over === 1);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5)];
m = psMatchEngine_(po, [R('r1', 'ZZZ', 1, 'C1', 'J1', 'x', 10, 5)]);
ok('PO ไม่อยู่ในระบบ → นับเป็น noPO ไม่ยัดมั่ว', m.noPO === 1 && po[0].recv === 0);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5)];
m = psMatchEngine_(po, [R('r1', 'A', 1, 'C9', 'J1', 'x', 10, 5)]);
ok('รหัสสินค้าไม่ตรง → จับคู่ไม่ได้ (ทุกชั้นบังคับรหัสตรง)', m.unmatched === 1 && po[0].recv === 0);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5), P('A', 2, 'C1', 'J2', 'y', 20, 5)];
m = psMatchEngine_(po, [R('r1', 'A', 1, 'C1', 'JZ', 'z', 99, 3)]);
ok('C5 มีผู้สมัคร 2 ราย → ไม่เลือก ไม่เดา', m.unmatched === 1);

po = [P('A', 1, 'C1', 'J1', 'x', 10, 5)];
m = psMatchEngine_(po, [R('r1', 'A', 1, 'C1', 'JZ', 'z', 99, 3)]);
ok('C5 มีผู้สมัครรายเดียว → เลือกได้', m.tiers.C5 === 1 && po[0].recv === 3);

/* ---------- 3. ข้อมูลจริงของ STT ---------- */
const dataFile = path.join(__dirname, 'real-data.json');
if (!fs.existsSync(dataFile)) {
  console.log('\n(ข้าม) ไม่พบ _tests/real-data.json — ชุดทดสอบข้อมูลจริงไม่ได้รัน');
} else {
  console.log('\n— ข้อมูลจริง STT (7 ม.ค. – 15 ก.ย. 2569) —');
  const D = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  D.rr.forEach(r => { r.date = r.date ? new Date(r.date) : ''; });
  const t0 = Date.now();
  const res = psMatchEngine_(D.po, D.rr);
  const ms = Date.now() - t0;

  eq('จำนวน PO ที่ใช้งาน', D.po.length, 7878);
  eq('จำนวน RR ที่ใช้ได้', D.rr.length, 7512);
  const matched = Object.keys(res.tiers).reduce((a, k) => a + res.tiers[k], 0);
  eq('จับคู่สำเร็จ', matched, 7375);
  eq('อ้าง PO ปีอื่น (รับข้ามปี)', res.noPO, 137);
  eq('จับคู่ไม่ได้ ทั้งที่ PO อยู่ในระบบ', res.unmatched, 0);
  eq('รับเกินจำนวนที่สั่ง', res.over, 0);
  eq('จับคู่ชั้น C1', res.tiers.C1, 7373);
  eq('จับคู่ชั้น C3', res.tiers.C3 || 0, 1);
  eq('จับคู่ชั้น C4', res.tiers.C4 || 0, 1);
  ok('จับคู่ได้ 100% ของที่มี PO ในระบบ', matched === D.rr.length - res.noPO,
     matched + ' / ' + (D.rr.length - res.noPO));

  // ค้างรับ — ต้องคิดมูลค่าแบบเฉลี่ยตามยอดเงินหลังหักส่วนลด
  let lines = 0, value = 0, docs = {}, over = 0;
  D.po.forEach(p => {
    const remain = p.qty - p.recv;
    if (remain > 1e-6) { lines++; value += p.qty > 0 ? p.amnt * remain / p.qty : 0; docs[p.docu] = 1; }
    if (p.recv - p.qty > 1e-6) over++;
  });
  eq('บรรทัดค้างรับ', lines, 617);
  eq('ใบ PO ที่ค้างรับ', Object.keys(docs).length, 184);
  ok('มูลค่าค้างรับ', Math.abs(value - 28432882.99) < 1,
     value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' บาท');
  eq('ไม่มีบรรทัดไหนรับเกินที่สั่ง', over, 0);

  // มูลค่าแบบดิบ (ไม่หักส่วนลด) ต้องสูงกว่า = ยืนยันว่าส่วนลดถูกคิดจริง
  let raw = 0;
  D.po.forEach(p => { const r = p.qty - p.recv; if (r > 1e-6) raw += r * p.price; });
  ok('วิธีเฉลี่ยยอดเงิน หักส่วนลดได้จริง', Math.abs((raw - value) - 482136.83) < 1,
     'ต่างจากวิธีดิบ ' + (raw - value).toFixed(2) + ' บาท');

  console.log('  ⏱  เครื่องจับคู่ใช้เวลา ' + ms + ' ms กับ ' +
              (D.po.length + D.rr.length).toLocaleString() + ' บรรทัด');
  ok('เร็วพอสำหรับ Apps Script (จำกัด 6 นาที)', ms < 30000, ms + ' ms');
}

console.log('\n=== ผล: ผ่าน ' + pass + ' · ไม่ผ่าน ' + fail + ' ===\n');
process.exit(fail ? 1 : 0);
