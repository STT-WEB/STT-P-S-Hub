/**
 * harness.js — จำลอง Apps Script ให้โค้ดตัวจริงใน deploy/ รันบน Node ได้
 * ใช้สำหรับ: สร้างข้อมูลตัวอย่างหน้าเว็บ (preview) และเทสที่ต้องรันทั้งสายงาน
 * หลักการเดิม: ไม่ก๊อปโค้ดมาเขียนใหม่ — โหลดไฟล์ตัวจริงเข้า vm
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const D = f => fs.readFileSync(path.join(ROOT, 'deploy', f), 'utf8');

function revive(v) {
  if (v && typeof v === 'object' && v.__d) return new Date(v.__d);
  return v;
}

function build(opts) {
  opts = opts || {};
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw-sheets.json'), 'utf8'));
  const SRC = {
    ps_report: raw.ps_report.map(r => r.map(revive)),
    RR: raw.RR.map(r => r.map(revive))
  };

  // ---- คลังแท็บจำลอง: fileId -> tab -> values ----
  // ไฟล์ของปี = ไฟล์เดียวกับที่มีแท็บ ps_report / RR ของเบียร์ (ไม่ก๊อปออกมา)
  const store = { MASTER: {}, YEAR: { ps_report: SRC.ps_report, RR: SRC.RR }, RRALL: {} };
  // เติมคอลัมน์ที่ระบบต่อท้าย (เหมือน psSetup ทำในชีตจริง)
  const SYS_H = ['รับแล้ว (จำนวน)','รับแล้ว (บาท)','รับแล้ว + VAT','ค้างรับ (จำนวน)','ค้างรับ (บาท)',
                 'ค้างรับ + VAT','สถานะ (ระบบ)','อายุ (วัน)','เลขที่ใบรับ','ชั้นที่จับคู่'];
  const HUM_H = ['สถานะ (จัดซื้อ)','สถานะเอกสาร','ยืนยันรับเอง (จำนวน)','วันที่ยืนยัน','นัดส่งใหม่',
                 'ตั้งเบิกแล้ว (บาท)','สถานะของนำเข้า','หมายเหตุ','เหตุผล'];
  {
    const po = store.YEAR.ps_report;
    po[0] = po[0].concat(SYS_H, HUM_H);
    const pad = SYS_H.length + HUM_H.length;
    for (let i = 1; i < po.length; i++) po[i] = po[i].concat(new Array(pad).fill(''));
    const rr = store.YEAR.RR;
    rr[0] = rr[0].concat(['สถานะจับคู่']);
    for (let i = 1; i < rr.length; i++) rr[i] = rr[i].concat(['']);
    (opts.edits || []).forEach(e => {                      // [poid, listno, {คีย์:ค่า}]
      const C = {}; po[0].forEach((h, k) => C[String(h)] = k);
      for (let i = 1; i < po.length; i++) {
        if (String(po[i][C['Poid']]) === e[0] && String(po[i][C['listno']]) === e[1]) {
          for (const k in e[2]) po[i][C[k]] = e[2][k];
        }
      }
    });
  }
  const written = {};

  const sandbox = {
    module: { exports: {} }, console, Date, Math, String, Number, Boolean, Array, Object,
    isNaN, parseFloat, parseInt, JSON, RegExp, Error,
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 16).replace('T', ' ') },
    Session: { getActiveUser: () => ({ getEmail: () => '' }) },
    SpreadsheetApp: null          // ใส่ทีหลัง (ต้องใช้ store)
  };
  /* ---- Google Sheet จำลองเท่าที่โค้ดจริงเรียกใช้ ---- */
  const noop = () => fake;
  const fake = {};
  function makeSheet(name, bag) {
    const grid = [];
    const sh = {
      _name: name, _grid: grid,
      getName: () => name,
      getSheetId: () => 1,
      getLastRow: () => grid.length,
      getMaxRows: () => Math.max(grid.length, 1000),
      getMaxColumns: () => 60,
      getFilter: () => null,
      clear() { grid.length = 0; return sh; },
      clearNotes() { return sh; },
      clearConditionalFormatRules() { return sh; },
      deleteColumns() { return sh; },
      insertColumnsAfter() { return sh; },
      setFrozenRows() { return sh; },
      setFrozenColumns() { return sh; },
      setColumnWidth() { return sh; },
      setConditionalFormatRules() { return sh; },
      appendRow(r) { grid.push(r); return sh; },
      getDataRange: () => sh.getRange(1, 1, grid.length || 1, 60),
      getRange(row, col, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        const rg = {
          setValues(v) {
            for (let i = 0; i < v.length; i++) {
              const r = row - 1 + i;
              while (grid.length <= r) grid.push([]);
              for (let j = 0; j < v[i].length; j++) grid[r][col - 1 + j] = v[i][j];
            }
            bag[name] = grid;
            return rg;
          },
          getValues() {
            const o = [];
            for (let i = 0; i < nr; i++) o.push((grid[row - 1 + i] || []).slice(col - 1, col - 1 + nc));
            return o;
          },
          setValue(v) { return rg.setValues([[v]]); },
          setFontWeight: () => rg, setBackground: () => rg, setFontColor: () => rg,
          setFontSize: () => rg, setNumberFormat: () => rg, setNotes: () => rg,
          setWrap: () => rg, setVerticalAlignment: () => rg, createFilter: () => rg,
          clearContent: () => rg
        };
        return rg;
      }
    };
    return sh;
  }
  function makeSS(id, bag) {
    const sheets = {};
    return {
      getId: () => id,
      getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
      getSheets: () => Object.keys(sheets).map(k => sheets[k]),
      getSheetByName(n) { return sheets[n] || (bag[n] ? (sheets[n] = adopt(n, bag)) : null); },
      insertSheet(n) { bag[n] = []; return (sheets[n] = makeSheet(n, bag)); }
    };
    function adopt(n, b) { const s = makeSheet(n, b); b[n].forEach(r => s._grid.push(r)); return s; }
  }
  const files = {};
  sandbox.SpreadsheetApp = {
    flush() {},
    openById(id) {
      const bag = store[id] || (store[id] = {});
      return files[id] || (files[id] = makeSS(id, bag));
    },
    newConditionalFormatRule() {
      const b = { whenFormulaSatisfied: () => b, setBackground: () => b, setFontColor: () => b,
                  setRanges: () => b, setStrikethrough: () => b, build: () => ({}) };
      return b;
    }
  };
  sandbox.DriveApp = {
    getFolderById: () => ({ getFilesByName: () => ({ hasNext: () => false }) }),
    getFileById: () => ({ moveTo() {} })
  };

  vm.createContext(sandbox);

  // โค้ดตัวจริง
  vm.runInContext(D('00-config.js').replace(/function doGet[\s\S]*$/, ''), sandbox, { filename: '00-config.js' });
  vm.runInContext(D('03-setup.js'), sandbox, { filename: '03-setup.js' });
  vm.runInContext(D('04-import.js'), sandbox, { filename: '04-import.js' });
  vm.runInContext(D('06-rrdb.js'), sandbox, { filename: '06-rrdb.js' });
  vm.runInContext(D('07-guide.js'), sandbox, { filename: '07-guide.js' });

  // ---- ตัวแทนบริการของ Apps Script ----
  const stub = `
    var CFG = { MASTER:'MASTER', PSFOLDER:'F', SCRIPT_ID:'S' };
    function requireRole_(auth, roles){ return { role: __ROLE }; }
    function roleOf_(auth){ return { role: __ROLE, name:'เบียร์' }; }
    function requireNotStore_(auth){ if (PRICE_ROLES.indexOf(__ROLE) < 0) throw new Error('ไม่มีสิทธิ์'); }
    function currentYearTH_(){ return 2569; }
    function yearFile_(y, t){ return t === 'RRALL' ? 'RRALL' : 'YEAR'; }
    function psYearFile_(){ return 'YEAR'; }
    function psAllFile_(){ return 'RRALL'; }
    function cacheOr_(k, ttl, fn){ return fn(); }
    function cacheDrop_(a){}
    __COLIDX__
    function fetchTabValues_(fileId, tab){
      return __store[fileId] && __store[fileId][tab] || null;
    }
    function openTabValues_(fileId, tab){ return fetchTabValues_(fileId, tab); }
    function writeRows_(fileId, tab, cols, rows){
      __store[fileId] = __store[fileId] || {};
      __store[fileId][tab] = [cols.slice()].concat(rows);
      __written[tab] = rows.length;
      return rows.length;
    }
    function logImport_(){ }
    function writeLog_(){ }
  `;
  sandbox.__store = store;
  sandbox.__written = written;
  sandbox.__ROLE = opts.role || 'ADMIN';
  // ใช้ colIdx_ ตัวจริงจาก 02-master.js — ห้ามเขียนใหม่ในเทส ไม่งั้นเทสกับของจริงไม่ตรงกัน
  var colSrc = D('02-master.js').match(/function colIdx_\(hdr, names\) \{[\s\S]*?\n\}/)[0];
  vm.runInContext(stub.replace('__COLIDX__', colSrc), sandbox, { filename: 'stub.js' });


  return { sandbox, store, written, SRC };
}

module.exports = { build, revive };
