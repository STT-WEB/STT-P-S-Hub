/**
 * NOVA – PURCHASE & STORE HUB
 * 01-auth.js — เข้าสู่ระบบด้วย รหัสพนักงาน + PIN 6 หลัก · สิทธิ์ · กันราคาหลุด
 *
 * ทะเบียนผู้ใช้ = แท็บ USERS ใน STT-DB-MASTER (ใช้ร่วมกับ NOVA ใหญ่)
 *   A email · B display_name · C role for NOVA BOM · D role for Claim
 *   E role for P&S  ← ไฟล์นี้อ่านคอลัมน์นี้เท่านั้น
 *   F active · G PIN · H รหัสพนักงาน
 *
 * ⚠️ ค้นคอลัมน์ด้วย "ชื่อหัวตาราง" ไม่ใช่ตำแหน่ง → เบียร์แทรกคอลัมน์เพิ่มได้ไม่พัง
 */

/** ---------- อีเมลผู้ใช้ ---------- */
function getEmail_() {
  // ⚠️ ใช้ getActiveUser เท่านั้น — ห้าม fallback getEffectiveUser
  //    (คืนอีเมลเจ้าของสคริปต์=เบียร์ → ทุกคนกลายเป็น ADMIN!)
  try {
    var e = Session.getActiveUser().getEmail();
    if (e) return String(e).toLowerCase();
  } catch (_) {}
  return '';
}

/** ---------- แปลงข้อความในคอลัมน์ E เป็นรหัสบทบาท ---------- */
function normRolePS_(t) {
  t = String(t || '').toLowerCase().trim();
  if (!t) return '';
  // ต้องเช็ค admin ก่อน exec เสมอ เพราะ "ADMIN_EXEC" มีคำว่า exec อยู่ด้วย
  if (/admin/.test(t) || /ผู้ดูแลระบบ/.test(t)) return 'ADMIN';
  if (/purchase|buy|จัดซื้อ/.test(t))            return 'PURCHASE';
  if (/store|stock|สโตร์|คลัง/.test(t))          return 'STORE';
  if (/exec|ผู้บริหาร|ผบห/.test(t))              return 'EXEC';
  return '';
}

/** ---------- อ่านทะเบียนผู้ใช้ (เฉพาะคนที่มีบทบาทใน P&S) ---------- */
function getUsersPS_() {
  return cacheOr_('PS_USERS', TTL.USERS, function () {
    var v = openTabValues_(CFG.MASTER, 'USERS');
    if (!v || v.length < 2) return [];

    var hdr = v[0].map(function (x) { return String(x).trim(); });
    var iRole = colIdx_(hdr, ['p&s', 'p & s', 'ps hub']);
    if (iRole < 0) {
      throw new Error('ไม่พบคอลัมน์ "role for P&S" ในแท็บ USERS ของ STT-DB-MASTER — ' +
                      'หัวตารางที่เจอ: ' + hdr.join(' | '));
    }
    var iMail = colIdx_(hdr, ['email', 'อีเมล']);
    var iName = colIdx_(hdr, ['display_name', 'ชื่อ', 'name']);
    var iEmp  = colIdx_(hdr, ['รหัสพนักงาน', 'empid', 'emp id']);
    var iPin  = colIdx_(hdr, ['pin']);
    var iAct  = colIdx_(hdr, ['active', 'ใช้งาน', 'สถานะ']);

    var out = [];
    for (var i = 1; i < v.length; i++) {
      var role = normRolePS_(iRole >= 0 ? v[i][iRole] : '');
      if (!role) continue;                       // ไม่ได้ระบุบทบาท P&S = เข้าไม่ได้
      out.push({
        email : iMail >= 0 ? String(v[i][iMail] || '').trim().toLowerCase() : '',
        name  : iName >= 0 ? String(v[i][iName] || '').trim() : '',
        role  : role,
        empId : iEmp  >= 0 ? String(v[i][iEmp]  || '').trim() : '',
        pin   : iPin  >= 0 ? String(v[i][iPin]  || '').trim() : '',
        active: !(iAct >= 0 && String(v[i][iAct]).trim().toUpperCase() === 'N'),
        row   : i + 1
      });
    }
    return out;
  });
}

/** ---------- หาสิทธิ์จาก PIN / จากอีเมล ---------- */
function pinUser_(pin) {
  pin = String(pin || '').trim();
  if (pin.length < 4) return null;
  var us = getUsersPS_();
  for (var i = 0; i < us.length; i++) {
    if (us[i].active && us[i].pin && us[i].pin === pin) {
      return { email: '(PIN)', role: us[i].role, name: us[i].name,
               label: us[i].name || ROLE_LABEL[us[i].role] || us[i].role };
    }
  }
  return null;
}

function emailUser_() {
  var email = getEmail_();
  if (!email) return { email: '', role: 'GUEST', name: '', label: 'ลงทะเบียน / ใส่ PIN' };
  var us = getUsersPS_();
  for (var i = 0; i < us.length; i++) {
    if (us[i].active && us[i].email && us[i].email === email) {
      return { email: email, role: us[i].role, name: us[i].name,
               label: us[i].name || ROLE_LABEL[us[i].role] || us[i].role };
    }
  }
  return { email: email, role: 'GUEST', name: '', label: 'ลงทะเบียน / ใส่ PIN' };
}

/** ⚠️ เชื่อ PIN ก่อนเสมอ แล้วค่อย fallback อีเมล
 *  (บทเรียน NOVA v0.38.0: เช็คอีเมลก่อน → เบียร์เปิดในเบราว์เซอร์ตัวเอง ทุกคนกลายเป็น ADMIN) */
function roleOf_(auth) {
  var p = pinUser_(auth);
  if (p) return p;
  return emailUser_();
}

/** ---------- กันราคา/ต้นทุนหลุดถึงสโตร์ (ตัดที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ซ่อนคอลัมน์) ---------- */
function requireNotStore_(auth) {
  var role = roleOf_(auth).role;
  if (PRICE_ROLES.indexOf(role) < 0) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลราคา/ต้นทุน (เฉพาะจัดซื้อ / ผู้ดูแลระบบ / ผู้บริหาร)');
  }
  return role;
}

function requireRole_(auth, roles) {
  var role = roleOf_(auth).role;
  if (roles.indexOf(role) < 0) {
    throw new Error('ไม่มีสิทธิ์ใช้งานส่วนนี้ (บทบาทของคุณคือ ' + (ROLE_LABEL[role] || role) + ')');
  }
  return role;
}

/** ---------- ฟังก์ชันที่หน้าเว็บเรียก ---------- */

/** เข้าสู่ระบบด้วย รหัสพนักงาน + PIN (ต้องตรงกันทั้งคู่ในแถวเดียวกัน) */
function loginEmpPin(empId, pin) {
  empId = String(empId || '').trim();
  pin   = String(pin   || '').trim();
  if (!empId || !pin) return { ok: false, msg: 'กรุณากรอกรหัสพนักงานและ PIN' };

  var us = getUsersPS_();
  for (var i = 0; i < us.length; i++) {
    if (us[i].empId === empId && us[i].pin && us[i].pin === pin) {
      if (!us[i].active) return { ok: false, msg: 'บัญชีนี้ถูกระงับการใช้งาน' };
      return {
        ok: true, role: us[i].role, name: us[i].name,
        label: us[i].name || ROLE_LABEL[us[i].role] || us[i].role,
        roleLabel: ROLE_LABEL[us[i].role] || us[i].role,
        canSeePrice: PRICE_ROLES.indexOf(us[i].role) >= 0,
        version: PS_VERSION
      };
    }
  }
  return { ok: false, msg: 'รหัสพนักงานหรือ PIN ไม่ถูกต้อง' };
}

/** ลงทะเบียนรับ PIN ครั้งแรก — ต้องมีชื่ออยู่ในทะเบียน และมีบทบาท P&S แล้วเท่านั้น */
function registerUser(empId, name) {
  empId = String(empId || '').trim();
  name  = String(name  || '').trim();
  if (!empId || !name) return { ok: false, msg: 'กรุณากรอกรหัสพนักงานและชื่อ' };

  var us = getUsersPS_();
  var me = null;
  for (var i = 0; i < us.length; i++) {
    if (us[i].empId === empId) { me = us[i]; break; }
  }
  if (!me)         return { ok: false, msg: 'ไม่พบรหัสพนักงานนี้ หรือยังไม่ได้กำหนดสิทธิ์ P&S — แจ้งผู้ดูแลระบบ' };
  if (!me.active)  return { ok: false, msg: 'บัญชีนี้ถูกระงับการใช้งาน' };
  if (me.pin)      return { ok: false, msg: 'รหัสพนักงานนี้มี PIN อยู่แล้ว ถ้าลืมให้แจ้งผู้ดูแลระบบรีเซ็ต' };

  var a = String(me.name || '').replace(/\s+/g, '');
  var b = name.replace(/\s+/g, '');
  if (a && b && a.indexOf(b) < 0 && b.indexOf(a) < 0) {
    return { ok: false, msg: 'ชื่อไม่ตรงกับที่ลงทะเบียนไว้' };
  }

  var pin = genPin_();
  var sh  = SpreadsheetApp.openById(CFG.MASTER).getSheetByName('USERS');
  var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
              .map(function (x) { return String(x).trim(); });
  var iPin = colIdx_(hdr, ['pin']);
  if (iPin < 0) return { ok: false, msg: 'ไม่พบคอลัมน์ PIN ในทะเบียนผู้ใช้' };

  sh.getRange(me.row, iPin + 1).setValue("'" + pin);   // ใส่ ' นำหน้า กัน 0 หาย
  cacheDrop_(['PS_USERS']);

  return { ok: true, pin: pin, name: me.name,
           roleLabel: ROLE_LABEL[me.role] || me.role,
           msg: 'ลงทะเบียนสำเร็จ — จดรหัส PIN นี้ไว้ ใช้เข้าระบบครั้งต่อไป' };
}

function genPin_() {
  var us = getUsersPS_(), used = {};
  us.forEach(function (u) { if (u.pin) used[u.pin] = 1; });
  for (var t = 0; t < 80; t++) {
    var p = String(Math.floor(100000 + Math.random() * 900000));
    if (!used[p]) return p;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** ข้อมูลผู้ใช้ปัจจุบัน (หน้าเว็บเรียกตอนเปิด) */
function whoAmI(auth) {
  var r = roleOf_(auth);
  return {
    role: r.role,
    name: r.name || '',
    label: r.label,
    roleLabel: ROLE_LABEL[r.role] || r.role,
    canSeePrice: PRICE_ROLES.indexOf(r.role) >= 0,
    version: PS_VERSION,
    build: PS_BUILD
  };
}
