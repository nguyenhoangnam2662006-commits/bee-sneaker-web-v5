const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = code.indexOf('const ghsvLookupTracking = async (');
const end = code.indexOf('\nconst normalizeGhsvInfo = ', start);
assert.ok(start >= 0 && end > start);
const fnSource = code.slice(start, end);
function setup(mock) {
  const calls = [];
  const ctx = {
    URL, console: {log() {},warn(){}},
    GHSV_TOKEN: 'fake-token',
    GHSV_TRACKING_URL: 'https://api.svexpress.vn/v1/open-api/order/tracking',
    GHSV_TRACKING_ALT_URL: '',
    ghsvCodeFields:()=>['required_code','client_code'],
    ghsvMessage: r=>r?.data?.msg||'',
    ghsvNotFound:r=>/không tồn tại|not found/i.test(r?.data?.msg||''),
    ghsvSuccess:r=>Boolean(r?.ok && r?.data?.success===true),
    normalizeGhsvTracking:p=>Array.isArray(p.tracking)?p.tracking:[],
    ghsvHttpRequest:async(url,c,opts)=>{calls.push({url,code:c,field:opts.codeField});return mock(url,opts.codeField)}
  };
  vm.createContext(ctx);
  vm.runInContext(fnSource+'\nthis.callTracking = ghsvLookupTracking;',ctx);
  return {call:ctx.callTracking,calls};
}
const OLD='https://api.svexpress.vn/v1/open-api/order/tracking';
const DOC='https://api.svexpress.vn/v1/order/open-api/tracking';
test('preserves working V99 route before newer documented route', async()=>{
  const {call,calls}=setup(async()=>({ok:true,status:200,data:{success:true,tracking:[{status:'Delivered'}]}}));
  const data=await call('B57BRYK0021153','required_code');
  assert.equal(data.tracking.length,1);
  assert.deepEqual(calls.map(x=>x.url),[OLD]);
});
test('tries the documented endpoint after success with empty tracking array', async()=>{
  const {call,calls}=setup(async url=>({ok:true,status:200,data:{success:true,tracking:url===DOC?[{status:'Delivered'}]:[]}}));
  const data=await call('B57BRYK0021153','required_code');
  assert.equal(data.tracking.length,1);
  assert.ok(calls.some(x=>x.url===DOC));
});
test('tries other route when old endpoint reports not found', async()=>{
  const {call,calls}=setup(async url=>url===DOC
    ? {ok:true,status:200,data:{success:true,tracking:[{status:'Delivered'}]}}
    : {ok:true,status:200,data:{success:false,msg:'Đơn hàng không tồn tại.'}});
  const data=await call('GYRHYKPM','client_code');
  assert.equal(data.tracking.length,1);
  assert.ok(calls.some(x=>x.url===DOC));
});
test('retries alternate route after transport error', async()=>{
  const {call}=setup(async url=>{
    if(url===OLD)throw Error('timeout');
    return {ok:true,status:200,data:{success:true,tracking:[{status:'Delivered'}]}};
  });
  const data=await call('B57BRYK0021153','required_code');
  assert.equal(data.tracking.length,1);
});
