/**
 * NOVA – PURCHASE & STORE HUB
 * 06-rrdb.js — ฐานข้อมูลการรับเข้า (RR) ทุกใบจาก My Account
 *
 * ทำไมต้องมี
 *  - จัดซื้อต้องตอบได้ทันทีว่า "PO ใบนี้ของมาแล้วกี่ครั้ง ใบรับเลขอะไร วันไหน ใครส่ง"
 *  - ถ้าหน้าเว็บมีปัญหา ข้อมูลชุดเดียวกันนี้เปิดดูตรง ๆ ได้ที่ไฟล์ STT-PS-RR-ALL แท็บ RR_ALL
 *    (แท็บมีตัวกรอง ตรึงหัว และหัวคอลัมน์มีคำอธิบายไทยกำกับไว้ — ดู 07-guide.js)
 *
 * กฎเดิมทุกข้อ
 *  - ห้ามลบแถวใน RR_ALL เด็ดขาด (ต้นทุนเฉลี่ยสะสมใช้ยอดรวมทั้งหมด)
 *  - สโตร์เปิดดูได้ แต่ราคาถูกตัดที่ฝั่งเซิร์ฟเวอร์ ไม่เคยส่งออกไปหน้าเว็บ
 */

var RIDX = RR_IDX_();
function RR_IDX_() {
  var m = {}, C = ['year_th', 'docuno', 'docudate', 'pono', 'listno', 'goodcode', 'goodcode_n',
    'goodname', 'goodqty2', 'goodprice2', 'gooddiscformula', 'gooddiscamnt', 'goodamnt',
    'vendorcode', 'vendorname', 'jobcode', 'jobname', 'goodunitname', 'invno', 'advnamnt',
    'netamnt', 'imported_at'];
  for (var i = 0; i < C.length; i++) m[C[i]] = i;
  return m;
}

function rrAllRows_() {
  return cacheOr_('PS_RRALL', TTL.HOT, function () {
    var v = fetchTabValues_(psAllFile_(), 'RR_ALL') || [];
    return v.slice(1);
  });
}

/** แผนที่บรรทัด RR ที่จับคู่กับ PO ได้แล้ว (ของปีปัจจุบัน) : 'ใบรับ|บรรทัด' -> ชั้นที่จับคู่ */
function rrLinkMap_() {
  return cacheOr_('PS_RRLINK', TTL.HOT, function () {
    var v = fetchTabValues_(psYearFile_(), TAB.LINK) || [];
    var m = {};
    for (var i = 1; i < v.length; i++) {
      var r = v[i], k = s_(r[0]) + '|' + s_(r[1]);
      if (!m[k]) m[k] = { tier: s_(r[6]), poid: s_(r[3]), po_ln: s_(r[4]) };
    }
    return m;
  });
}

/** เลขที่ PO ทั้งหมดที่มีในปีนี้ — ใช้แยกว่า "รับข้ามปี" หรือ "ยังไม่จับคู่" */
function poDocSet_() {
  return cacheOr_('PS_PODOCS', TTL.HOT, function () {
    var rows = poIndexRows_(), m = {};
    for (var i = 0; i < rows.length; i++) m[s_(rows[i][IDX.docuno])] = 1;
    return m;
  });
}

/** สถานะการจับคู่ของบรรทัด RR หนึ่งบรรทัด */
function rrMatchState_(rrDocu, rrLn, pono, link, poDocs) {
  if (!s_(pono)) return { k: 'nopo', t: 'ไม่ได้อ้าง PO', tier: '' };
  var hit = link[s_(rrDocu) + '|' + s_(rrLn)];
  if (hit) return { k: 'ok', t: 'ตรงกับ PO', tier: hit.tier };
  if (!poDocs[s_(pono)]) return { k: 'cross', t: 'PO ปีก่อน', tier: '' };
  return { k: 'todo', t: 'ยังไม่จับคู่', tier: '' };
}

/** =========================================================
 *  หน้าฐานข้อมูลการรับเข้า
 *  ========================================================= */
function getRrAll(auth, o) {
  var myRole = roleOf_(auth).role;
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC', 'STORE']);
  var canPrice = PRICE_ROLES.indexOf(myRole) >= 0;
  o = o || {};

  var rows = rrAllRows_(), link = rrLinkMap_(), poDocs = poDocSet_();
  var q     = s_(o.q).toLowerCase();
  var yr    = s_(o.year);
  var mth   = s_(o.month);
  var vend  = s_(o.vendor).toLowerCase();
  var pono  = s_(o.pono).toUpperCase();          // มาจากปุ่ม "ใบรับ" ในหน้าฐานข้อมูล PO
  var mstat = s_(o.mstat);                        // '' | ok | cross | todo | nopo
  var sort  = s_(o.sort) || 'date';
  var size  = Math.min(200, Math.max(20, num_(o.size) || 100));

  var years = {}, vendors = {}, months = {};
  var all = { lines: 0, amnt: 0, docs: {}, ok: 0, cross: 0, todo: 0, nopo: 0 };
  var out = [], state = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!s_(r[RIDX.docuno])) continue;

    var y  = s_(r[RIDX.year_th]);
    var vn = s_(r[RIDX.vendorname]);
    var d  = r[RIDX.docudate];
    var mo = (d instanceof Date) ? (d.getMonth() + 1) : '';

    if (y)  years[y] = (years[y] || 0) + 1;
    if (vn) vendors[vn] = (vendors[vn] || 0) + 1;
    if (mo) months[mo] = (months[mo] || 0) + 1;

    var st = rrMatchState_(r[RIDX.docuno], r[RIDX.listno], r[RIDX.pono], link, poDocs);
    all.lines++; all.amnt += num_(r[RIDX.goodamnt]); all.docs[s_(r[RIDX.docuno])] = 1;
    all[st.k]++;

    // ---- ตัวกรอง ----
    if (yr    && y !== yr) continue;
    if (mth   && String(mo) !== mth) continue;
    if (mstat && st.k !== mstat) continue;
    if (pono  && s_(r[RIDX.pono]).toUpperCase() !== pono) continue;
    if (vend  && vn.toLowerCase().indexOf(vend) < 0) continue;
    if (q) {
      var hay = (s_(r[RIDX.docuno]) + ' ' + s_(r[RIDX.pono]) + ' ' + s_(r[RIDX.invno]) + ' ' +
                 s_(r[RIDX.goodcode_n]) + ' ' + s_(r[RIDX.goodname]) + ' ' + vn + ' ' +
                 s_(r[RIDX.jobcode]) + ' ' + s_(r[RIDX.jobname])).toLowerCase();
      if (hay.indexOf(q) < 0) continue;
    }
    out.push(r); state.push(st);
  }

  // ---- เรียง (เรียงคู่กับสถานะไปด้วย ไม่งั้นป้ายสลับแถว) ----
  var pair = out.map(function (r, k) { return { r: r, s: state[k] }; });
  var SORT = {
    date:   function (a, b) { var x = a.r[RIDX.docudate], y2 = b.r[RIDX.docudate];
                              return ((y2 instanceof Date) ? y2.getTime() : 0) -
                                     ((x instanceof Date) ? x.getTime() : 0); },
    amnt:   function (a, b) { return num_(b.r[RIDX.goodamnt]) - num_(a.r[RIDX.goodamnt]); },
    rr:     function (a, b) { var x = s_(a.r[RIDX.docuno]), y2 = s_(b.r[RIDX.docuno]);
                              return x < y2 ? -1 : (x > y2 ? 1 : num_(a.r[RIDX.listno]) - num_(b.r[RIDX.listno])); },
    po:     function (a, b) { var x = s_(a.r[RIDX.pono]), y2 = s_(b.r[RIDX.pono]);
                              return x < y2 ? -1 : (x > y2 ? 1 : 0); },
    vendor: function (a, b) { var x = s_(a.r[RIDX.vendorname]), y2 = s_(b.r[RIDX.vendorname]);
                              return x < y2 ? -1 : (x > y2 ? 1 : 0); }
  };
  pair.sort(SORT[sort] || SORT.date);

  var f = { lines: pair.length, amnt: 0, docs: {} };
  for (var j = 0; j < pair.length; j++) {
    f.amnt += num_(pair[j].r[RIDX.goodamnt]);
    f.docs[s_(pair[j].r[RIDX.docuno])] = 1;
  }

  var page = Math.max(1, num_(o.page) || 1);
  var pages = Math.ceil(pair.length / size) || 1;
  if (page > pages) page = pages;

  function top(obj, n, numericKey) {
    var a = [];
    for (var k in obj) a.push({ k: k, n: obj[k] });
    a.sort(numericKey ? function (x, y) { return Number(y.k) - Number(x.k); }
                      : function (x, y) { return y.n - x.n; });
    return n ? a.slice(0, n) : a;
  }

  return {
    rows: pair.slice((page - 1) * size, page * size).map(function (p) {
      var r = p.r;
      return {
        rr: s_(r[RIDX.docuno]), ln: s_(r[RIDX.listno]), date: fmtD_(r[RIDX.docudate]),
        year: s_(r[RIDX.year_th]), pono: s_(r[RIDX.pono]), invno: s_(r[RIDX.invno]),
        code: s_(r[RIDX.goodcode_n]), name: s_(r[RIDX.goodname]),
        unit: s_(r[RIDX.goodunitname]), qty: num_(r[RIDX.goodqty2]),
        vendor: s_(r[RIDX.vendorname]), job: s_(r[RIDX.jobcode]), jobname: s_(r[RIDX.jobname]),
        price: canPrice ? num_(r[RIDX.goodprice2]) : null,
        amnt:  canPrice ? num_(r[RIDX.goodamnt])   : null,
        mk: p.s.k, mt: p.s.t, tier: p.s.tier
      };
    }),
    page: page, pages: pages, size: size,
    filtered: { lines: f.lines, docs: Object.keys(f.docs).length, amnt: canPrice ? f.amnt : null },
    all: { lines: all.lines, docs: Object.keys(all.docs).length, amnt: canPrice ? all.amnt : null,
           ok: all.ok, cross: all.cross, todo: all.todo, nopo: all.nopo },
    opts: { years: top(years, 0, true), vendors: top(vendors, 40), months: top(months) },
    canPrice: canPrice
  };
}

/** ---------- ใบรับทั้งหมดของ PO หนึ่งใบ (กดจากหน้าฐานข้อมูล PO) ---------- */
function getRrOfPo(auth, pono) {
  var myRole = roleOf_(auth).role;
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC', 'STORE']);
  var canPrice = PRICE_ROLES.indexOf(myRole) >= 0;
  var want = s_(pono).toUpperCase();
  var rows = rrAllRows_(), link = rrLinkMap_(), poDocs = poDocSet_();
  var out = [], qty = 0, amnt = 0, docs = {};

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (s_(r[RIDX.pono]).toUpperCase() !== want) continue;
    var st = rrMatchState_(r[RIDX.docuno], r[RIDX.listno], r[RIDX.pono], link, poDocs);
    qty += num_(r[RIDX.goodqty2]); amnt += num_(r[RIDX.goodamnt]);
    docs[s_(r[RIDX.docuno])] = 1;
    out.push({
      rr: s_(r[RIDX.docuno]), ln: s_(r[RIDX.listno]), date: fmtD_(r[RIDX.docudate]),
      invno: s_(r[RIDX.invno]), code: s_(r[RIDX.goodcode_n]), name: s_(r[RIDX.goodname]),
      unit: s_(r[RIDX.goodunitname]), qty: num_(r[RIDX.goodqty2]),
      price: canPrice ? num_(r[RIDX.goodprice2]) : null,
      amnt:  canPrice ? num_(r[RIDX.goodamnt])   : null,
      mk: st.k, mt: st.t
    });
  }
  out.sort(function (a, b) { return a.rr < b.rr ? -1 : (a.rr > b.rr ? 1 : num_(a.ln) - num_(b.ln)); });
  return { pono: want, rows: out, lines: out.length, docs: Object.keys(docs).length,
           qty: qty, amnt: canPrice ? amnt : null, canPrice: canPrice };
}

/** ---------- ส่งออกผลกรองปัจจุบันเป็น Google Sheet ---------- */
function exportRrAll(auth, o) {
  requireRole_(auth, ['PURCHASE', 'ADMIN', 'EXEC']);
  o = o || {}; o.page = 1; o.size = 200;
  var head = ['ใบรับ', 'บรรทัด', 'วันที่', 'ปี', 'เลขที่ PO', 'เลขที่ใบกำกับ', 'รหัสสินค้า',
              'ชื่อสินค้า', 'หน่วย', 'จำนวน', 'ผู้ขาย', 'จ๊อบ', 'ชื่อจ๊อบ', 'สถานะจับคู่'];
  var canPrice = PRICE_ROLES.indexOf(roleOf_(auth).role) >= 0;
  if (canPrice) head = head.concat(['ราคา/หน่วย', 'จำนวนเงิน']);

  var body = [], page = 1, pages = 1;
  do {
    o.page = page;
    var r = getRrAll(auth, o);
    pages = r.pages;
    for (var i = 0; i < r.rows.length; i++) {
      var x = r.rows[i];
      var row = [x.rr, x.ln, x.date, x.year, x.pono, x.invno, x.code, x.name, x.unit, x.qty,
                 x.vendor, x.job, x.jobname, x.mt];
      if (canPrice) row = row.concat([x.price, x.amnt]);
      body.push(row);
    }
    page++;
  } while (page <= pages && body.length < 50000);

  var name = 'RR-การรับเข้า-' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmm');
  var ss = SpreadsheetApp.create(name);
  DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(CFG.PSFOLDER));
  var sh = ss.getSheets()[0].setName('RR');
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#12151A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (body.length) sh.getRange(2, 1, body.length, head.length).setValues(body);
  sh.getDataRange().createFilter();
  return { rows: body.length, name: name, url: ss.getUrl() };
}
