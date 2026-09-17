/**
 * guard-v0500 — รันทั้งสายงานของจริงบน Node
 *   อ่านแท็บ ps_report / RR จากไฟล์ของเบียร์ → จับคู่ → เขียนคอลัมน์สีน้ำเงิน → อ่านผ่านหน้าเว็บ
 * รัน:  node _tests/guard-v0500.js
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

console.log('\n=== guard-v0500 : ไฟล์เดียว ps_report + คอลัมน์ที่ระบบต่อท้าย ===\n');

const H = build({ role: 'ADMIN' });
const S = H.sandbox;

/* ---------- 1. อ่าน + จับคู่ ---------- */
console.log('— อ่าน ps_report / RR จากไฟล์เดียวกัน แล้วจับคู่ —');
const rb = S.psRebuild({});
eq('อ่าน ps_report',        rb.poRead, 7951);
eq('แถวเสีย 1 แถว',         rb.poSkipped, 1);
eq('อ่าน RR',               rb.rrRead, 7513);
eq('RR แถวเสีย 1 แถว',      rb.rrSkipped, 1);
eq('บรรทัด PO ที่ใช้จับคู่', rb.poLines, 7878);
eq('จับคู่ได้',              rb.matched, 7375);
eq('ชั้น C1',                rb.tiers.C1, 7373);
eq('รับข้ามปี',              rb.noPO, 137);
eq('จับคู่ไม่ได้',           rb.unmatched, 0);
eq('รับเกินที่สั่ง',         rb.over, 0);
eq('บรรทัดค้างรับ',          rb.openLines, 617);
eq('ใบ PO ที่ยังค้าง',       rb.openDocs, 184);
near('มูลค่าค้างรับ',         rb.openValue, 28432882.99);
eq('เก็บใบรับลงไฟล์สะสม',     rb.rrAll.fresh, 7512);
eq('เขียนแท็บสรุปสำเร็จ',     rb.summaryError, '');

/* ---------- 2. ห้ามแตะของเบียร์ ---------- */
console.log('\n— 23 คอลัมน์เดิมของ My Account ต้องไม่ถูกแตะ —');
const po = H.store.YEAR.ps_report, C = S.poColMap_(po[0]);
eq('จำนวนแถว ps_report เท่าเดิม', po.length, 7952);
eq('คอลัมน์แรกยังเป็น ShipDate',  String(po[0][0]), 'ShipDate');
eq('คอลัมน์ที่ 23 ยังเป็น LocaCode', String(po[0][22]), 'LocaCode');
ok('คอลัมน์เดิม 23 ช่องอยู่ก่อนของระบบเสมอ', C.got >= 23 && C.h_status > C.tier);
eq('แท็บ RR แถวเท่าเดิม', H.store.YEAR.RR.length, 7514);
eq('MASTER ต้องว่าง', Object.keys(H.store.MASTER).length, 0);

/* ---------- 3. คอลัมน์ที่ระบบเติม ---------- */
console.log('\n— คอลัมน์สีน้ำเงินที่ระบบเติม —');
let sumGot = 0, sumRem = 0, sumRemVat = 0, badMath = 0, nStatus = 0;
for (let i = 1; i < po.length; i++) {
  const r = po[i];
  if (!String(r[C.poid]) || !/^POR/i.test(String(r[C.docuno]))) continue;
  const qty = Number(r[C.goodqty2]) || 0;
  const got = Number(r[C.got]) || 0, rem = Number(r[C.remain]) || 0;
  if (String(r[C.status]) !== 'ยกเลิก' && Math.abs((qty - got) - rem) > 1e-6) badMath++;
  if (String(r[C.status])) nStatus++;
  sumGot += Number(r[C.got_amt]) || 0;
  sumRem += Number(r[C.remain_amt]) || 0;
  sumRemVat += Number(r[C.remain_vat]) || 0;
}
eq('ทุกบรรทัดมีสถานะ', nStatus, 7950);
eq('ทุกบรรทัด: สั่ง − รับแล้ว = ค้างรับ', badMath, 0);
near('ยอดค้างรับรวมในชีต', sumRem, 28432882.99, 1);
near('ค้างรับ + VAT = ค้างรับ × 1.07', sumRemVat, 28432882.99 * 1.07, 5);

/* ---------- 4. หน้าเว็บอ่านจากแถวเดียวกัน ---------- */
console.log('\n— หน้าเว็บต้องได้เลขชุดเดียวกับในชีต —');
const all = S.getPoAll({}, { size: 100 });
eq('บรรทัดทั้งหมด', all.all.lines, 7950);
eq('ใบ PO ทั้งหมด', all.all.docs, 2273);
eq('ค้างรับ',       all.all.open, 617);
eq('รับครบ',        all.all.done, 7261);
eq('ยกเลิก',        all.all.cancelled, 72);
eq('รวมกันต้องเท่าบรรทัดทั้งหมด',
   all.all.open + all.all.done + all.all.cancelled, 7950);
near('ยอดสั่งรวม',   all.all.amnt, 77674802.64, 1);
near('ค้างรับ (บาท)', all.all.openVal, 28432882.99, 1);
near('ค้างรับ + VAT', all.all.openVat, 28432882.99 * 1.07, 5);
eq('จำนวนหน้า', all.pages, 80);

const op = S.getOpenPO({}, {});
eq('หน้าค้างรับตรงกัน', op.sum.lines, 617);
near('มูลค่าตรงกัน', op.sum.value, 28432882.99, 1);
eq('ช่วงอายุรวมกันเท่าบรรทัดค้างรับ',
   op.buckets.reduce(function (a, b) { return a + b.n; }, 0), 617);
eq('เกิน 90 วัน', op.buckets[4].n, 78);

/* ---------- 5. ช่องที่จัดซื้อพิมพ์เอง ---------- */
console.log('\n— ช่องสีส้มที่จัดซื้อพิมพ์เอง —');
const KEY = ['186013', '1'];                                   // POR.INT-69/0007 สั่ง 1 ค้าง 1
function one(edits, q) {
  const h = build({ edits: edits });
  h.sandbox.psRebuild({});
  const rows = h.sandbox.getPoAll({}, { q: q, size: 20 }).rows;
  return { row: rows.filter(function (x) { return x.ln === KEY[1]; })[0],
           all: h.sandbox.getPoAll({}, { size: 1 }).all };
}
const A = one([[KEY[0], KEY[1], { 'สถานะเอกสาร': 'รับของแล้ว ยังไม่ RR' }]], 'POR.INT-69/0007');
eq('เลือก "รับของแล้ว ยังไม่ RR" → ค้างรับเป็น 0', A.row.remain, 0);
eq('   สถานะเปลี่ยนเป็นรับครบ', A.row.status, 'รับครบ');
eq('   บรรทัดค้างรับรวมลดลง 1', A.all.open, 616);

const B = one([[KEY[0], KEY[1], { 'สถานะเอกสาร': 'ยกเลิก / ไม่รับแล้ว' }]], 'POR.INT-69/0007');
eq('เลือก "ยกเลิก / ไม่รับแล้ว" → สถานะยกเลิก', B.row.status, 'ยกเลิก');
eq('   ยกเลิกรวมเพิ่มเป็น 73', B.all.cancelled, 73);

const D = one([[KEY[0], KEY[1], { 'ยืนยันรับเอง (จำนวน)': 0.4 }]], 'POR.INT-69/0007');
near('ใส่ยืนยันรับเอง 0.4 → ค้าง 0.6', D.row.remain, 0.6);
eq('   สถานะเป็นรับบางส่วน', D.row.status, 'รับบางส่วน');

const E = one([[KEY[0], KEY[1], { 'สถานะ (จัดซื้อ)': 'Y' }]], 'POR.INT-69/0007');
eq('สถานะจัดซื้อไม่ตรงกับระบบ → ขึ้นเตือน 1 บรรทัด', E.all.mismatch, 1);

// กันนับซ้ำ: บรรทัดที่รับครบจาก RR แล้ว ใส่ยืนยันเองทับ ต้องไม่บวกเพิ่ม
const doneRow = S.getPoAll({}, { status: 'done', size: 5 }).rows[0];
const F = build({ edits: [[doneRow.poid, doneRow.ln,
  { 'ยืนยันรับเอง (จำนวน)': doneRow.ordered, 'สถานะเอกสาร': 'รับของแล้ว ยังไม่ RR' }]] });
F.sandbox.psRebuild({});
const fr = F.sandbox.getPoAll({}, { q: doneRow.po, size: 20 })
             .rows.filter(function (x) { return x.ln === doneRow.ln; })[0];
eq('RR มาแล้ว + ยืนยันเองทับ → ไม่นับซ้ำ', fr.received, doneRow.ordered);
near('   ยอดค้างรับรวมไม่เปลี่ยน',
     F.sandbox.getPoAll({}, { size: 1 }).all.openVal, 28432882.99, 1);

/* ---------- 6. สิทธิ์ราคา ---------- */
console.log('\n— สโตร์ต้องไม่เห็นราคา —');
const HS = build({ role: 'ADMIN' });
HS.sandbox.psRebuild({});
HS.sandbox.__ROLE = 'STORE';
const st = HS.sandbox.getPoAll({}, { size: 20 });
ok('สโตร์: ยอดรวมเป็น null', st.all.amnt === null && st.all.openVal === null && st.all.openVat === null);
ok('สโตร์: ทุกบรรทัดไม่มีราคา',
   st.rows.every(function (x) { return x.price === null && x.amnt === null && x.value === null; }));
ok('สโตร์: ยังเห็นจำนวนและสถานะ',
   st.rows.every(function (x) { return typeof x.ordered === 'number' && x.status; }));

/* ---------- 7. colIdx_ ต้องตรงตัวก่อน ---------- */
console.log('\n— colIdx_ ต้องไม่ไปโดนคอลัมน์ผิด —');
const CI = S.colIdx_;
eq('goodamnt ไม่ไปโดน sumGoodamnt', CI(['sumGoodamnt', 'goodamnt'], ['goodamnt']), 1);
eq('vendorname ไม่ไปโดน vendornameeng',
   CI(['vendorcode', 'vendornameeng', 'VendorName'], ['vendorname']), 2);
eq('ไม่เจอเลยต้องได้ -1', CI(['a', 'b'], ['zzz']), -1);

/* ---------- 8. ฐานข้อมูลการรับเข้า ---------- */
console.log('\n— หน้าฐานข้อมูลการรับเข้า —');
const rr = S.getRrAll({}, { size: 100 });
eq('บรรทัดรับเข้าทั้งหมด', rr.all.lines, 7512);
eq('จำนวนใบรับ',          rr.all.docs, 2408);
eq('จับคู่กับ PO ได้',     rr.all.ok, 7375);
eq('รับข้ามปี',           rr.all.cross, 137);
near('มูลค่ารับเข้ารวม',   rr.all.amnt, 53035868.64, 0.05);
ok('ทุกบรรทัดมีชื่อผู้ขาย', rr.rows.every(function (x) { return !!x.vendor; }));
const one2 = S.getRrOfPo({}, 'POR-69/2158');
eq('ใบรับของ PO ใบเดียว', one2.lines, 3);
near('   ยอดเงิน', one2.amnt, 36240, 0.01);

console.log('\n' + (fail ? '✗ ไม่ผ่าน ' + fail + ' ข้อ' : '✓ ผ่านหมด') + ' (' + pass + '/' + (pass + fail) + ')\n');
process.exit(fail ? 1 : 0);
