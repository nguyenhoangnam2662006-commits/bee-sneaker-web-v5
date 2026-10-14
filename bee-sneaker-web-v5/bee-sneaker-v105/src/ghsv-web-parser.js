// V99: Parse response GHSV web theo ĐÚNG mã đơn đối tác.
// Never join data across unrelated order rows (e.g. names, shipper phones or B57 codes).
'use strict';

const MVD_RE = /^B\d{2}[A-Z0-9]{7,40}$/i;
const PARTNER_RE = /^[A-Z][A-Z0-9._-]{5,30}$/i;
const code = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const isObject = v => v && typeof v === 'object' && !Array.isArray(v);

const uniqueB57Within = (obj, depthLimit=3) => {
  const hits = new Set();
  const walk = (node, depth=0) => {
    if (depth > depthLimit || node == null) return;
    if (typeof node === 'string') { const c=code(node); if(MVD_RE.test(c)) hits.add(c); return; }
    // Never search another order hidden inside a nested array/list.
    if (Array.isArray(node)) return;
    if (!isObject(node)) return;
    for(const [key,val] of Object.entries(node).slice(0,90)) {
      // Don't derive tracking codes from free-text notes or status descriptions.
      if(/note|message|content|description|history|log|status|address/i.test(key))continue;
      // String-valued codes on the same verified order record are safe.
      // Nested objects are traversed only for ordinary shipment metadata.
      if(val && typeof val === 'object' && !/(meta|shipment|order_info|waybill|delivery|info|detail)/i.test(key))continue;
      walk(val,depth+1);
    }
  };
  walk(obj);
  return hits.size===1 ? [...hits][0] : '';
};

// Search for a record whose direct field EXACTLY equals the partner code.
// If an ancestor contains several orders, we never take codes from its siblings.
function findExactOrderRecord(payload, partnerCode) {
  const requested = code(partnerCode);
  if(!PARTNER_RE.test(requested)) return null;
  const root=payload?.__ghsvData ?? payload;
  const matches=[];
  const seen=new Set();
  function walk(node,depth=0) {
    if(depth>10 || node==null || typeof node!=='object'||seen.has(node))return;
    seen.add(node);
    if(Array.isArray(node)){node.slice(0,250).forEach(x=>walk(x,depth+1)); return;}
    const values=Object.entries(node).slice(0,110);
    if(values.some(([k,v])=>typeof v==='string' && code(v)===requested && !/message|note|description|content|history|log/i.test(k))) {
      matches.push({node,depth,b57:uniqueB57Within(node)});
    }
    for(const [,v] of values) if(v && typeof v==='object') walk(v,depth+1);
  }
  walk(root);
  if(!matches.length) return null;
  // Refuse mismatched/ambiguous required codes across otherwise matching records.
  const codes=new Set(matches.map(x=>x.b57).filter(Boolean));
  if(codes.size>1) return {record:null,requiredCode:'',ambiguous:true};
  // Prefer smallest (deepest) matching object that carries a unique MVD.
  matches.sort((a,b)=>Number(Boolean(b.b57))-Number(Boolean(a.b57)) || b.depth-a.depth);
  return {record:matches[0].node,requiredCode:codes.size===1?[...codes][0]:'',ambiguous:false};
}

const firstString = (obj,keys) => {
  for(const k of keys) {
    const val=obj?.[k];
    if(typeof val==='string' && val.trim())return val.trim();
  }
  return '';
};

function extractWebOrderFields(payload, partnerCode) {
  const found=findExactOrderRecord(payload,partnerCode);
  if(!found || !found.record || found.ambiguous) return {matched:false,ambiguous:Boolean(found?.ambiguous),requiredCode:'',status:'',shipper:{name:'',phone:''},tracking:[]};
  const record=found.record;
  const status=firstString(record,['status_name','status_text','status_label','order_status_name','current_status_name']);
  const name=firstString(record,['shipper_name','driver_name','courier_name']) || firstString(record.shipper,['name','full_name']) || firstString(record.driver,['name','full_name']);
  const phone=firstString(record,['shipper_phone','driver_phone','courier_phone']) || firstString(record.shipper,['phone','mobile']) || firstString(record.driver,['phone','mobile']);
  const tracking=[];
  for(const key of ['tracking','tracking_history','histories','journey','events','order_history','status_history','logs']) {
    const rows=record[key];
    if(!Array.isArray(rows))continue;
    for(const ev of rows.slice(0,100)) {
      if(!isObject(ev))continue;
      const status=firstString(ev,['status_name','status','title','action','status_description']);
      const time=firstString(ev,['time','created_at','created','date','updated_at','timestamp']);
      const note=firstString(ev,['note_public','note','description','content','message','detail']);
      if(status || time || note) tracking.push({time,status,note,_raw:ev});
    }
    if(tracking.length)break;
  }
  return {matched:true,requiredCode:found.requiredCode,status,shipper:{name,phone},tracking,record};
}

module.exports={findExactOrderRecord,extractWebOrderFields};
