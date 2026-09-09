/**
 * ชุดทดสอบกันพัง — NOVA P&S Hub
 * รัน:  node _tests/guard-v0100.js
 * เขียนเป็น "กติกาที่ต้องจริงเสมอ" ไม่ล็อกค่าเป๊ะ ๆ (ปรับปรุงระบบแล้วเทสไม่พังตาม)
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DEP  = path.join(ROOT, 'deploy');
const read = f => fs.readFileSync(path.join(DEP, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? ('  — ' + detail) : '')); }
  else      { fail++; console.log('  ✗ ' + name + (detail ? ('  — ' + detail) : '')); }
}

console.log('\n=== guard-v0100 : กติกาที่ต้องจริงเสมอ ===\n');

// 1. สโตร์ต้องไม่เห็นราคา — ตัดที่เซิร์ฟเวอร์
const cfg = read('00-config.js');
const m = cfg.match(/var\s+PRICE_ROLES\s*=\s*\[([^\]]*)\]/);
ok('มี PRICE_ROLES', !!m);
if (m) {
  const roles = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  ok('PRICE_ROLES ไม่มี STORE', roles.indexOf('STORE') < 0, roles.join(', '));
}
const auth = read('01-auth.js');
ok('requireNotStore_ โยน Error จริง (ไม่ใช่แค่ return)',
   /function\s+requireNotStore_[\s\S]{0,400}?throw\s+new\s+Error/.test(auth));

// 2. ห้าม fallback getEffectiveUser (ตรวจเฉพาะ "โค้ดจริง" — คำเตือนในคอมเมนต์ต้องเก็บไว้)
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok('getEmail_ ไม่ใช้ getEffectiveUser ในโค้ดจริง', !/getEffectiveUser/.test(stripComments(auth)));
ok('ยังมีคำเตือนเรื่อง getEffectiveUser ในคอมเมนต์', /getEffectiveUser/.test(auth));

// 3. roleOf_ ต้องเชื่อ PIN ก่อนอีเมล
const ro = auth.match(/function\s+roleOf_[\s\S]{0,300}?\n\}/);
ok('roleOf_ เช็ค PIN ก่อน fallback อีเมล',
   !!ro && ro[0].indexOf('pinUser_') < ro[0].indexOf('emailUser_'));

// 4. ห้ามฝัง File ID ของไฟล์รายปีในโค้ด
const idRe = /['"][-\w]{40,}['"]/g;
const allowed = new Set([
  '1ZCKb_KRECWRSRaObBQz4nDUmwazvV2lhoPMj2O5j744',                    // MASTER
  '1rVHUm8GdXsG_VElRFuIoAX-E2o24bQmE',                               // Drive folder
  '11omqFMc3yIYDEernlRYhafVNDHWSA2NCFmuEWiIl_weebnn0OHVbsUT9'        // Script ID
]);
let stray = [];
fs.readdirSync(DEP).filter(f => f.endsWith('.js')).forEach(f => {
  (read(f).match(idRe) || []).forEach(x => {
    const id = x.slice(1, -1);
    if (!allowed.has(id)) stray.push(f + ':' + id.slice(0, 12) + '...');
  });
});
ok('ไม่มี File ID แปลกปลอมในโค้ด (ต้องอ่านจาก REGISTRY)', stray.length === 0, stray.join(' '));
ok('มีฟังก์ชัน yearFile_ อ่านจาก REGISTRY', /function\s+yearFile_/.test(read('02-master.js')));

// 5. ห้ามมี ?> ในไฟล์ html ที่ไม่ใช่ template หลัก
let bad = [];
fs.readdirSync(DEP).filter(f => f.endsWith('.html') && f !== 'PS-Hub-Index.html')
  .forEach(f => { if (read(f).indexOf('?' + '>') >= 0) bad.push(f); });
ok('ไม่มี ?> ในไฟล์ html ประกอบ (ชน template)', bad.length === 0, bad.join(' '));

// 6. ป้ายเวอร์ชันต้องดึงจาก PS_VERSION (แหล่งเดียว)
const idx = read('PS-Hub-Index.html');
ok('ป้ายเวอร์ชันดึงจาก PS_VERSION โดยตรง', /class="ver"[^>]*>\s*<\?=\s*PS_VERSION\s*\?>/.test(idx));
ok('00-config.js มี PS_VERSION', /var\s+PS_VERSION\s*=\s*'v\d+\.\d+\.\d+'/.test(cfg));

// 7. ไฟล์ .bat ต้อง ASCII ล้วน
let nonAscii = [];
fs.readdirSync(ROOT).filter(f => f.endsWith('.bat')).forEach(f => {
  const b = fs.readFileSync(path.join(ROOT, f));
  for (let i = 0; i < b.length; i++) if (b[i] > 0x7e) { nonAscii.push(f); break; }
});
ok('ไฟล์ .bat เป็น ASCII ล้วน', nonAscii.length === 0, nonAscii.join(' '));

// 8. ไฟล์โค้ดต้องไม่ยาวเกิน 1,500 บรรทัด
let big = [];
fs.readdirSync(DEP).filter(f => /\.(js|html)$/.test(f)).forEach(f => {
  const n = read(f).split('\n').length;
  if (n > 1500) big.push(f + '=' + n);
});
ok('ไม่มีไฟล์โค้ดเกิน 1,500 บรรทัด', big.length === 0, big.join(' '));

// 9. .gitignore ต้องกันความลับ + .BAK
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok('.gitignore กัน .clasp.json', /\.clasp\.json/.test(gi));
ok('.gitignore กัน *.BAK', /\*\.BAK/.test(gi));

console.log('\n=== ผล: ผ่าน ' + pass + ' · ไม่ผ่าน ' + fail + ' ===\n');
process.exit(fail ? 1 : 0);
