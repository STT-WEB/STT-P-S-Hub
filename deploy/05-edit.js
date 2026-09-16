/**
 * NOVA – PURCHASE & STORE HUB
 * 05-edit.js — ช่องที่ "จัดซื้อต้องใส่เอง" (เครื่องคิดแทนไม่ได้)
 *
 * 6 อย่างที่คนเท่านั้นรู้:
 *   1. ยืนยันรับของ PO ต่างประเทศ  (ไม่มีใบ RR ในระบบ)
 *   2. ยอดที่ตั้งเบิกบัญชีไปแล้ว   (อยู่ฝั่งบัญชี — หักออกจากค้างรับตามที่เบียร์สั่ง)
 *   3. วันนัดส่งใหม่               (ผู้ขายเลื่อนวัน)
 *   4. หมายเหตุ / ติดตามถึงไหน
 *   5. สถานะของนำเข้า             (ลงเรือ · ถึงท่า · ผ่านศุลกากร · ถึงโรงงาน)
 *   6. ปิดรายการ + เหตุผล          (ของไม่มาแล้ว)
 *
 * กฎ
 *  - เก็บแยกตาราง PS_PO_EDIT ไม่เขียนทับข้อมูลดิบจาก My Account เด็ดขาด
 *    → ดึงข้อมูลใหม่ทับกี่รอบ สิ่งที่คนกรอกไว้ก็ไม่หาย
 *  - คีย์ = poid + listno (คีย์ถาวรเดียวกับทั้งระบบ)
 *  - ทุกการแก้ลง LOG: ใคร · เมื่อไหร่ · จากอะไรเป็นอะไร · เหตุผล
 *  - ปิดรายการต้องมีเหตุผลเสมอ ปล่อยว่างไม่ได้
 */

var INTL_STATUS = ['', 'สั่งแล้ว', 'ลงเรือแล้ว', 'ถึงท่าเรือ', 'ผ่านศุลกากร', 'ถึงโรงงาน'];
var EDIT_COLS = ['poid','listno','docuno','recv_manual','recv_date','billed_amount','billed_note',
                 'newship','note','intl_status','closed','close_reason','by_emp','updated_at'];

/** อ่านทั้งตารางเป็น map: "poid|listno" -> object */
function poEditMap_() {
  return cacheOr_('PS_POEDIT', TTL.HOT, function () {
    var v = fetchTabValues_(psYearFile_(), TAB.EDIT) || [];
    var m = {};
    for (var i = 1; i < v.length; i++) {
      var r = v[i], poid = s_(r[0]), ln = s_(r[1]);
      if (!poid || !ln) continue;
      m[poid + '|' + ln] = {
        poid: poid, listno: ln, docuno: s_(r[2]),
        recv_manual: num_(r[3]), recv_date: r[4],
        billed_amount: num_(r[5]), billed_note: s_(r[6]),
        newship: r[7], note: s_(r[8]), intl_status: s_(r[9]),
        closed: s_(r[10]).toUpperCase() === 'Y',
        close_reason: s_(r[11]), by_emp: s_(r[12]), updated_at: r[13],
        _row: i + 1
      };
    }
    return m;
  });
}

/** หน้าจอเรียกตอนกดแถวเพื่อเปิดกล่องแก้ไข */
function getPoEdit(auth, poid, listno) {
  requireRole_(auth, ['PURCHASE', 'ADMIN']);
  var m = poEditMap_();
  var e = m[s_(poid) + '|' + s_(listno)];
  return {
    found: !!e,
    edit: e || { poid: s_(poid), listno: s_(listno), recv_manual: 0, billed_amount: 0,
                 note: '', intl_status: '', closed: false, close_reason: '' },
    intlOptions: INTL_STATUS
  };
}

/** บันทึกสิ่งที่จัดซื้อกรอก */
function savePoEdit(auth, p) {
  var role = requireRole_(auth, ['PURCHASE', 'ADMIN']);
  var me = roleOf_(auth);
  var poid = s_(p.poid), ln = s_(p.listno);
  if (!poid || !ln) throw new Error('ไม่พบรหัสบรรทัด (poid / listno)');

  var closed = !!p.closed;
  var reason = s_(p.close_reason);
  if (closed && !reason) throw new Error('ปิดรายการต้องใส่เหตุผลด้วย');

  var recvM = num_(p.recv_manual);
  if (recvM < 0) throw new Error('จำนวนที่รับเองติดลบไม่ได้');
  var billed = num_(p.billed_amount);
  if (billed < 0) throw new Error('ยอดตั้งเบิกติดลบไม่ได้');

  // กันรับเองเกินจำนวนที่สั่ง
  var line = findPoLine_(poid, ln);
  if (line && recvM > 0) {
    var room = line.ordered - line.recvRR;
    if (recvM - room > 1e-6)
      throw new Error('รับเองได้ไม่เกิน ' + room + ' ' + line.unit +
                      ' (สั่ง ' + line.ordered + ' · มีใบรับแล้ว ' + line.recvRR + ')');
  }

  var ss = SpreadsheetApp.openById(psYearFile_());
  var sh = ss.getSheetByName(TAB.EDIT);
  if (!sh) throw new Error('ไม่พบตาราง PS_PO_EDIT — กด "ติดตั้งโครงข้อมูล" ก่อน');

  var m = poEditMap_();
  var before = m[poid + '|' + ln] || null;
  var row = [poid, ln, s_(p.docuno), recvM, dt_(p.recv_date), billed, s_(p.billed_note),
             dt_(p.newship), s_(p.note), s_(p.intl_status), closed ? 'Y' : '', reason,
             me.name || me.label, new Date()];

  if (before) sh.getRange(before._row, 1, 1, EDIT_COLS.length).setValues([row]);
  else        sh.appendRow(row);

  writeLog_(auth, 'แก้ข้อมูลจัดซื้อ', poid + '|' + ln,
            before ? briefEdit_(before) : '(ยังไม่เคยกรอก)', briefRow_(row), reason);

  cacheDrop_(['PS_POEDIT', 'PS_OPENPO']);
  return { ok: true, msg: 'บันทึกแล้ว — กด "คำนวณค้างรับใหม่" เพื่อให้ตัวเลขอัปเดต' };
}

function briefEdit_(e) {
  return 'รับเอง ' + e.recv_manual + ' · ตั้งเบิก ' + e.billed_amount +
         ' · ' + (e.intl_status || '-') + (e.closed ? ' · ปิดแล้ว' : '');
}
function briefRow_(r) {
  return 'รับเอง ' + r[3] + ' · ตั้งเบิก ' + r[5] +
         ' · ' + (r[9] || '-') + (r[10] === 'Y' ? ' · ปิดแล้ว' : '');
}

/** หาบรรทัด PO เพื่อตรวจว่ารับเองเกินไหม */
function findPoLine_(poid, ln) {
  try {
    var year = currentYearTH_();
    var v = fetchTabValues_(yearFile_(year, 'YEAR'), 'PO_LINE') || [];
    var P = SCHEMA.YEAR.PO_LINE;
    for (var i = 1; i < v.length; i++) {
      if (s_(v[i][P.indexOf('poid')]) === s_(poid) && s_(v[i][P.indexOf('listno')]) === s_(ln)) {
        var got = 0;
        var lk = fetchTabValues_(yearFile_(year, 'YEAR'), 'MATCH_LINK') || [];
        var L = SCHEMA.YEAR.MATCH_LINK;
        for (var j = 1; j < lk.length; j++) {
          if (s_(lk[j][L.indexOf('poid')]) === s_(poid) &&
              s_(lk[j][L.indexOf('po_listno')]) === s_(ln)) got += num_(lk[j][L.indexOf('qty')]);
        }
        return { ordered: num_(v[i][P.indexOf('goodqty2')]), recvRR: got,
                 unit: s_(v[i][P.indexOf('goodunitname')]) };
      }
    }
  } catch (e) {}
  return null;
}

/** ประวัติการใช้งาน (X4) */
function writeLog_(auth, action, target, before, after, reason) {
  try {
    var me = roleOf_(auth);
    var sh = SpreadsheetApp.openById(yearFile_(currentYearTH_(), 'YEAR')).getSheetByName(TAB.LOG);
    if (sh) sh.appendRow([new Date(), me.name || me.label, action, target, before, after, reason || '']);
  } catch (e) {}
}
