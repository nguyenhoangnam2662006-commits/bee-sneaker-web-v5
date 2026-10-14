// Regression checks for V102 shipper phone inference and same-order guards.
'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../server.js'),'utf8');
const start=code.indexOf('const parseShipperFromText = value => {');
const end=code.indexOf('\nconst extractShipper = tracking => {',start);
assert.ok(start>=0&&end>start);
const make=new Function(code.slice(start,end)+';return parseShipperFromText;');
const parse=make();
test('finds GHSV explicit assigned shipper name and number',()=>{
 assert.deepEqual(parse('Đơn hàng được giao cho shipper: Bùi Minh Hải (0392371502)'),{name:'Bùi Minh Hải',phone:'0392371502'});
});
test('does not infer unrelated receiver phone',()=>{
 assert.equal(parse('Khách hàng Nguyễn An (0987654321) không nghe máy'),null);
});
test('does not infer a shipping employee from generic status confirmation',()=>{
 assert.equal(parse('Nguyễn A (0987654321) xác nhận giao thành công'),null);
});
test('admin screen automatically polls authenticated shipper-only endpoint',()=>{
 const tpl=fs.readFileSync(require('node:path').join(__dirname,'../views/ghsv.ejs'),'utf8');
 assert.match(tpl,/setInterval\(refreshShipper,180000\)/);
 assert.match(tpl,/\/orders\/<%= order.id %>\/ghsv\?format=shipper/);
});

test('raw response does not confuse recipient phone with shipper name',()=>{
  const vm=require('node:vm');
  const start=code.indexOf('const SHIPPER_HINT_RE =');
  const end=code.indexOf('\nconst maskPhoneForDebug =',start);
  assert.ok(start>=0&&end>start);
  const source=code.slice(start,end);
  const ctx=vm.createContext({});
  vm.runInContext('const parseShipperFromText = '+parse.toString()+';\n'+source+'\nthis.parse = extractShipperFromPayload;',ctx);
  const contact=ctx.parse({order:{shipper_name:'Driver One',to_phone:'0912345678',to_name:'Customer'}});
  assert.equal(contact.name,'Driver One');
  assert.equal(contact.phone,'');
  const actual=ctx.parse({order:{shipper:{name:'Driver Two',phone:'0391234567'},to_phone:'0912345678'}});
  assert.equal(actual.name,'Driver Two');
  assert.equal(actual.phone,'0391234567');
});
