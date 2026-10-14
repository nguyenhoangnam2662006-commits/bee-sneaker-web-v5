const test=require('node:test');
const assert=require('node:assert/strict');
const {classifyGhsvProbeResponse,classifyGhsvProbeError}=require('../src/ghsv-probe-diagnostics');
const {extractWebOrderFields}=require('../src/ghsv-web-parser');
const fs=require('node:fs');
const path=require('node:path');
const testCode='GYRHYKPM';
const run=r=>classifyGhsvProbeResponse(r,testCode,extractWebOrderFields,
  (payload)=>({phone:payload.__ghsvData.data[0]?.note_public?.match(/\(0\d{9}\)/) ? '0392371502' : ''}));
const r=(status,data)=>({status,ok:status>=200&&status<300,data,raw:JSON.stringify(data)});
test('401 distinguishes invalid credential',()=>assert.equal(run(r(401,{})).result,'unauthorized'));
test('403 distinguishes missing web privileges',()=>assert.equal(run(r(403,{})).result,'forbidden'));
test('404 explicitly reports endpoint not found',()=>assert.match(run(r(404,{})).message,/404/));
test('429 gets rate-limit guidance',()=>assert.equal(run(r(429,{})).result,'rate_limited_upstream'));
test('500 gets server failure',()=>assert.equal(run(r(500,{})).result,'upstream_error'));
test('HTTP 200 business rejection',()=>assert.equal(run(r(200,{success:false})).result,'api_rejected'));
test('HTTP 200 empty list distinct from wrong order',()=>assert.equal(run(r(200,{data:[],meta:{totalItem:0}})).result,'empty_list'));
test('HTTP 200 another order is not a match',()=>assert.equal(run(r(200,{data:[{partner_order_code:'GYOTHER1',note_public:'Phone (0392371502)'}]})).result,'no_match'));
test('HTTP 200 matched but no shipper',()=>{
 const v=run(r(200,{data:[{partner_order_code:testCode,shipper:null,note_public:'Không có dữ liệu shipper'}]}));
 assert.equal(v.result,'readable_no_shipper');assert.equal(v.notePublicAvailable,true);
});
test('HTTP 200 matched with shipper number only returns boolean and safe text',()=>{
 const v=run(r(200,{data:[{partner_order_code:testCode,note_public:'Đơn hàng được giao cho shipper: Bùi Minh Hải (0392371502)'}]}));
 assert.equal(v.result,'shipper_available');assert.equal(v.matchedOrder,true);
 assert.doesNotMatch(JSON.stringify(v),/0392371502|Bùi Minh Hải|note_public/);
});
test('HTTP 200 invalid JSON is classified',()=>{
 let raw='<!doctype html><html>login</html>';
 assert.equal(run({status:200,ok:true,raw,data:{raw}}).result,'invalid_json');
});
test('timeouts and DNS errors categorized without raw error details',()=>{
 assert.equal(classifyGhsvProbeError(new Error('GHSV timeout')).result,'timeout');
 assert.equal(classifyGhsvProbeError({code:'ENOTFOUND',message:'secret'}).result,'dns_error');
 assert.doesNotMatch(JSON.stringify(classifyGhsvProbeError({message:'secret_token'})),/secret_token/);
});
test('route is restricted to admin and https GHSV, no request response or token leaked',()=>{
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 const route=server.split("app.post('/orders/:id/ghsv/probe-token'")[1].split('// V97:')[0];
 assert.match(route,/admin, shipperProbeLimiter/);
 assert.match(route,/url\.protocol!=='https:'/);
 assert.match(route,/url\.hostname!=='api\.svexpress\.vn'/);
 assert.match(route,/classifyGhsvProbeResponse/);
 assert.match(route,/res\.json\(result\)/);
 assert.doesNotMatch(route,/console\.log\([^\n]*(?:token|raw|note_public)/i);
 assert.doesNotMatch(route,/db\.update[A-Za-z]+\(/);
});
test('admin UI displays httpStatus but never displays raw upstream data',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../views/ghsv.ejs'),'utf8');
 assert.match(html,/Kiểm tra lỗi API lấy SĐT shipper \(V104\)/);
 assert.match(html,/Number\.isInteger\(data\.httpStatus\)/);
 assert.match(html,/user\.role === 'admin'[^]*?bee-ghsv-probe/);
 assert.match(html,/'x-csrf-token':el\.dataset\.csrf/);
});
