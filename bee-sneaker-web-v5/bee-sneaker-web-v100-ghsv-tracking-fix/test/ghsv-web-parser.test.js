'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { findExactOrderRecord,extractWebOrderFields } = require('../src/ghsv-web-parser');

test('exact legacy partner code yields correct B57, never neighbor B57', () => {
  const payload={data:{items:[
    { partner_order_code:'GYRHYKPM',required_code:'B57BRYK0021153',status_name:'Giao hàng thành công',note_public:'Đơn hàng được giao cho shipper: Bùi Minh Hải (0392371502)',tracking:[{time:'2026-10-08T13:55:00',status:'Giao hàng thành công',note:'Đã giao'}]},
    { partner_order_code:'GYOTHER1',required_code:'B57BRYK0099999',note_public:'Đơn hàng được giao cho shipper: Người Khác (0999999999)'}
  ]}};
  const x=extractWebOrderFields(payload,'GYRHYKPM');
  assert.equal(x.matched,true);
  assert.equal(x.requiredCode,'B57BRYK0021153');
  assert.equal(x.status,'Giao hàng thành công');
  assert.equal(x.tracking.length,1);
  assert.ok(!JSON.stringify(x.record).includes('Người Khác'));
});

test('unrelated order not matched if response is about another order', () => {
  const payload={data:{items:[{partner_order_code:'GYOTHER1',required_code:'B57BRYK0099999',note_public:'Đơn hàng được giao cho shipper: Người Khác (0999999999)'}]}};
  assert.equal(extractWebOrderFields(payload,'GYRHYKPM').matched,false);
});

test('no mixing B57 when response contains GY and B57 in different rows', () => {
  const payload={data:{orders:[
    { partner_order_code:'GYRHYKPM', status_name:'Chờ lấy hàng'},
    { partner_order_code:'GYOTHER1', required_code:'B57BRYK0099999'}
  ]}};
  const x=extractWebOrderFields(payload,'GYRHYKPM');
  assert.equal(x.matched,true);
  assert.equal(x.requiredCode,'');
});

test('ambiguous multiple B57 codes in one matching record do not auto-link', () => {
  const payload={data:{orders:[{partner_order_code:'GYRHYKPM',required_code:'B57BRYK0021153',alternate:'B57BRYK0021154'}]}};
  assert.equal(findExactOrderRecord(payload,'GYRHYKPM').requiredCode,'');
});

test('no regex near-match or broad strings', () => {
  const payload={data:{orders:[{partner_order_code:'OTHER-GYRHYKPM',required_code:'B57BRYK0021153'}]}};
  assert.equal(extractWebOrderFields(payload,'GYRHYKPM').matched,false);
});

test('supports nested records with separate shipper object', () => {
  const payload={data:{orders:[{partner_order_code:'GYRHYKPM',metadata:{required_code:'B57BRYK0021153'},shipper:{name:'Bùi Minh Hải',phone:'0392371502'}}]}};
  const x=extractWebOrderFields(payload,'GYRHYKPM');
  assert.equal(x.requiredCode,'B57BRYK0021153');
  assert.equal(x.shipper.phone,'0392371502');
});
