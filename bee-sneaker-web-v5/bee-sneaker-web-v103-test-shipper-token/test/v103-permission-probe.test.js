const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','views','ghsv.ejs'),'utf8');
test('shipper permission probe admin-only and rate limited',()=>{
  assert.match(server,/app\.post\('\/orders\/:id\/ghsv\/probe-token', admin, shipperProbeLimiter,/);
});
test('probe only reads token from server environment',()=>{
  const route=server.split("app.post('/orders/:id/ghsv/probe-token'")[1].split('// V97:')[0];
  assert.match(route,/GHSV_TOKEN/);
  assert.match(route,/Authorization:`Bearer \$\{token\}`/);
  assert.doesNotMatch(route,/res\.json\(\{\s*(?:token|authorization|raw):/i);
  assert.doesNotMatch(route,/await db\.update/);
});
test('probe uses CSRF protected POST request and only admin sees the button',()=>{
  assert.match(html,/user\.role === 'admin'[^]*?bee-ghsv-probe/);
  assert.match(html,/method:'POST'/);
  assert.match(html,/'x-csrf-token':el\.dataset\.csrf/);
});
