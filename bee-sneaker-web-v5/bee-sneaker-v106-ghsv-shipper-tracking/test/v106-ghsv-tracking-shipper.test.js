'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizePhone,parseAssignmentNote,extractTrackingShipper}=require('../src/ghsv-tracking-shipper');
const assigned=(note,time='08-10-2026 10:00')=>({time,status:'Đang giao',note,_raw:{note}});

test('official tracking note: explicit shipper with Vietnamese name and phone',()=>{
  const s=extractTrackingShipper([assigned('Đơn hàng được giao cho shipper: Bùi Minh Hải (0392371502)')]);
  assert.deepEqual({name:s.name,phone:s.phone,source:s.source},{name:'Bùi Minh Hải',phone:'0392371502',source:'tracking_note'});
});

test('normalize international +84 and separated digits',()=>{
  assert.equal(normalizePhone('+84 393 374 588'),'0393374588');
  assert.equal(normalizePhone('84-393-374-588'),'0393374588');
  assert.equal(normalizePhone('0393.374.588'),'0393374588');
  assert.equal(normalizePhone('0393374588 extra'), '');
});

test('never infer shipper from signature on delivered status',()=>{
  const p=extractTrackingShipper([assigned('Nguyễn Đức Thịnh (0378872140) xác nhận Đã Giao Hàng Toàn Bộ')]);
  assert.equal(p.phone,'');
  assert.equal(p.reason,'no_explicit_assignment');
});

test('never infer recipient number in a phone-call note',()=>{
  const p=extractTrackingShipper([assigned('Lương Thị Hà gọi điện cho người nhận (0966778899) nhưng khách không nghe')]);
  assert.equal(p.phone,'');
});

test('if same note mentions customer phone, only explicit shipper number is chosen',()=>{
  const p=extractTrackingShipper([assigned('Đơn hàng được giao cho shipper: Bùi Minh Hải (0392371502)\nKhách nhận (0987654321)')]);
  assert.equal(p.phone,'0392371502');
});

test('newly assigned shipper without a number overrides older different shipper',()=>{
  const p=extractTrackingShipper([
    assigned('Đơn hàng được giao cho shipper: Người Mới (undefined)','09-10-2026 08:00'),
    assigned('Đơn hàng được giao cho shipper: Người Cũ (0392371502)','08-10-2026 08:00')
  ]);
  assert.equal(p.name,'Người Mới');
  assert.equal(p.phone,'');
  assert.equal(p.reason,'assigned_without_phone');
});

test('same driver reassigned with undefined phone may use previous confirmed number',()=>{
  const p=extractTrackingShipper([
    assigned('Đơn hàng được giao cho shipper: Bùi Minh Hải (undefined)','09-10-2026 08:00'),
    assigned('Đơn hàng được giao cho shipper: Bùi Minh Hải (0392371502)','08-10-2026 08:00')
  ]);
  assert.equal(p.phone,'0392371502');
});

test('sorts based on tracking timestamp when API responds old-to-new',()=>{
  const p=extractTrackingShipper([
    assigned('Đơn hàng được giao cho shipper: Người Cũ (0392371502)','08-10-2026 08:00'),
    assigned('Đơn hàng được giao cho shipper: Người Mới (0356628773)','09-10-2026 08:00')
  ]);
  assert.equal(p.name,'Người Mới');
  assert.equal(p.phone,'0356628773');
});

test('structured shipper fields work but to_phone alone does not',()=>{
  const p=extractTrackingShipper([{time:'09-10-2026 08:00',_raw:{shipper:{name:'Nhân Viên A',phone:'0393374588'},to_phone:'0987654321'}}]);
  assert.equal(p.phone,'0393374588');
  const notShipper=extractTrackingShipper([{time:'09-10-2026 08:00',_raw:{to_phone:'0987654321',to_name:'Khách hàng'}}]);
  assert.equal(notShipper.phone,'');
});

test('recognizes assignment name when number not supplied, not fake a contact',()=>{
  const p=extractTrackingShipper([assigned('Đơn hàng được giao cho shipper: Bùi Minh Hải (undefined)')]);
  assert.equal(p.name,'Bùi Minh Hải');
  assert.equal(p.phone,'');
});

test('ignores malformed phone values',()=>{
  assert.equal(parseAssignmentNote('Đơn hàng được giao cho shipper: Bùi Minh Hải (12345)').phone,'');
  assert.equal(parseAssignmentNote('Shipper: Bùi Minh Hải (098765432100000)').phone,'');
});

test('preserves authenticated order access and official API tracking calls in route',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.match(server,/if\(!canAccessOrder\(req,order\)\)/);
  assert.match(server,/const trackedShipper=extractTrackingShipper\(tracking\);/);
  assert.match(server,/const rawShipper=extractShipperFromPayload\(infoRaw\);/);
  assert.match(server,/GHSV_TRACKING_URL,/);
});
