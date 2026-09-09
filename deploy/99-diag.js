/**
 * NOVA – PURCHASE & STORE HUB
 * 99-diag.js — ตรวจระบบด้วย "การวัดจริง" ไม่ใช่การเดา
 * เปิดใน Apps Script editor แล้วรัน psSelfTest() → ดูผลใน Execution log
 * หรือเรียกจากหน้าเว็บ (เฉพาะ ADMIN) ผ่าน psDiag(auth)
 *
 * ⚠️ ห้ามคืนค่า PIN จริงออกไปเด็ดขาด — คืนแค่ "มี / ยังไม่มี"
 */

function psDiag(auth) {
  requireRole_(auth, ['ADMIN']);
  return psCollectDiag_();
}

function psSelfTest() {
  var r = psCollectDiag_();
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function psCollectDiag_() {
  var out = { version: PS_VERSION, build: PS_BUILD, at: new Date().toISOString(), checks: [] };

  function check(name, fn) {
    var t0 = new Date().getTime(), ok = false, detail = '', err = '';
    try { detail = fn(); ok = true; }
    catch (e) { err = String(e && e.message ? e.message : e); }
    out.checks.push({
      name: name, ok: ok, ms: new Date().getTime() - t0,
      detail: detail, error: err
    });
  }

  check('เปิดไฟล์ MASTER ได้', function () {
    var v = openTabValues_(CFG.MASTER, 'SETTINGS');
    if (!v) throw new Error('อ่านแท็บ SETTINGS ไม่ได้');
    return v.length + ' แถว';
  });

  check('Sheets API (ชั้น 2) ใช้ได้', function () {
    var v = fetchTabValues_(CFG.MASTER, 'SETTINGS');
    if (!v) throw new Error('Sheets advanced service ยังไม่เปิด — ระบบจะช้าลงเพราะต้องเปิดทั้งไฟล์');
    return 'ใช้ได้ (' + v.length + ' แถว)';
  });

  check('พบคอลัมน์ role for P&S', function () {
    var v = openTabValues_(CFG.MASTER, 'USERS');
    if (!v) throw new Error('อ่านแท็บ USERS ไม่ได้');
    var hdr = v[0].map(function (x) { return String(x).trim(); });
    var i = colIdx_(hdr, ['p&s', 'p & s', 'ps hub']);
    if (i < 0) throw new Error('ไม่เจอ — หัวตาราง: ' + hdr.join(' | '));
    return 'คอลัมน์ที่ ' + (i + 1) + ' (' + hdr[i] + ')';
  });

  check('ทะเบียนผู้ใช้ P&S', function () {
    var us = getUsersPS_(), by = {}, noPin = [], nActive = 0;
    us.forEach(function (u) {
      by[u.role] = (by[u.role] || 0) + 1;
      if (u.active) nActive++;
      if (!u.pin) noPin.push((u.name || '?') + ' (' + u.empId + ')');
    });
    var s = [];
    for (var k in by) s.push((ROLE_LABEL[k] || k) + ' ' + by[k]);
    return 'รวม ' + us.length + ' คน · ใช้งานอยู่ ' + nActive + ' · ' + s.join(' · ') +
           ' · ยังไม่มี PIN ' + noPin.length + ' คน' +
           (noPin.length ? ': ' + noPin.join(', ') : '');
  });

  check('กันราคาหลุด (requireNotStore_)', function () {
    var blocked = [], allowed = [];
    ['PURCHASE', 'STORE', 'ADMIN', 'EXEC', 'GUEST'].forEach(function (r) {
      if (PRICE_ROLES.indexOf(r) >= 0) allowed.push(r); else blocked.push(r);
    });
    if (PRICE_ROLES.indexOf('STORE') >= 0) throw new Error('อันตราย! STORE อยู่ใน PRICE_ROLES');
    return 'เห็นราคา: ' + allowed.join(', ') + ' · ห้ามเห็น: ' + blocked.join(', ');
  });

  check('ทะเบียนไฟล์รายปี (REGISTRY source=PS)', function () {
    var reg = getRegistryPS_();
    if (!reg.length) throw new Error('ยังไม่มีแถว source=PS — ต้องเพิ่มก่อนถึงจะเปิดไฟล์รายปีได้');
    return reg.map(function (r) { return r.year + (r.type ? ('/' + r.type) : ''); }).join(', ');
  });

  check('ปีปัจจุบัน', function () { return currentYearTH_(); });

  check('แคชทำงาน', function () {
    var k = 'PS_DIAG_' + new Date().getTime();
    var a = cacheOr_(k, 30, function () { return { n: 1 }; });
    var b = cacheOr_(k, 30, function () { return { n: 2 }; });
    cacheDrop_([k]);
    if (b.n !== 1) throw new Error('แคชไม่ทำงาน (ครั้งที่ 2 ควรได้ค่าเดิม)');
    return 'ผ่าน';
  });

  out.passed = out.checks.filter(function (c) { return c.ok; }).length;
  out.failed = out.checks.length - out.passed;
  out.totalMs = out.checks.reduce(function (s, c) { return s + c.ms; }, 0);
  return out;
}
