'use strict';

// V106: Parse shipper contacts from GHSV's *official* order tracking events.
// Never interpret a recipient/contact/confirmation phone as a shipper phone.
// This is a pure parser: no tokens, no external requests and no database writes.

function normalizePhone(value) {
  const raw=String(value ?? '').trim();
  if (!raw) return '';
  const digits=raw.replace(/[\s.()\-]/g,'');
  const domestic=digits.startsWith('+84') ? '0'+digits.slice(3) :
    (digits.startsWith('84') ? '0'+digits.slice(2) : digits);
  return /^0\d{9}$/.test(domestic) ? domestic : '';
}

function cleanName(value) {
  const s=String(value||'').trim().replace(/^[-–—: ]+|[-–—: ]+$/g,'').replace(/\s+/g,' ');
  if (!s || s.length>90 || /^(?:undefined|null|không có|chưa có)$/i.test(s)) return '';
  if (/\d{5,}/.test(s)) return '';
  return s;
}

// The caller must only use this for explicit assignment text. Importantly,
// "Nguyễn A (09...) xác nhận giao thành công" does NOT prove A was the shipper.
const ASSIGNMENT = /(?:giao\s+cho\s+(?:shipper|người\s+giao\s+hàng|nhân\s+viên\s+giao\s+hàng)|(?:shipper|người\s+giao\s+hàng|nhân\s+viên\s+giao\s+hàng)\s*[:：-])\s*[:：-]?\s*([^\n\r();|]{2,90}?)(?:\s*\(\s*([^()\n\r]{1,45})\s*\)|(?=\s*(?:[\n\r;|]|$)))/gi;

function parseAssignmentNote(text) {
  const input=String(text||'');
  if (!input) return null;
  ASSIGNMENT.lastIndex=0;
  let match;
  // A single note can have multiple shipment events. The API normally sorts
  // newest first; retain the first explicit assignment in a note.
  while((match=ASSIGNMENT.exec(input))) {
    const name=cleanName(match[1]);
    if (!name) continue;
    return { name, phone:normalizePhone(match[2]), source:'tracking_note' };
  }
  return null;
}

function parseEventTime(value) {
  const v=String(value||'').trim();
  if (!v) return null;
  // The documented tracking format is DD-MM-YYYY HH:mm.
  const m=v.match(/^(\d{2})[-/]([0-1]\d)[-/](20\d{2})\s+(\d{1,2}):(\d{2})/);
  if(m) {
    const day=Number(m[1]),month=Number(m[2]),year=Number(m[3]);
    const hour=Number(m[4]),minute=Number(m[5]);
    if(day<1||day>31||month<1||month>12||hour>23||minute>59)return null;
    const stamp=Date.UTC(year,month-1,day,hour,minute);
    const check=new Date(stamp);
    if(check.getUTCDate()!==day||check.getUTCMonth()!==month-1)return null;
    return stamp;
  }
  // ISO values from other GHSV API variants.
  if(/^20\d{2}-\d{2}-\d{2}[T\s]/.test(v)) {
    const value=Date.parse(v.replace(' ','T'));
    return Number.isFinite(value)?value:null;
  }
  return null;
}

function extractEventAssignment(event) {
  if (!event || typeof event !== 'object') return null;
  const raw=event._raw && typeof event._raw==='object' ? event._raw : event;
  // Explicit per-shipper fields count; receiver/to_phone do not.
  const objects=[raw.shipper,raw.driver,raw.delivery_driver,raw.courier].filter(v=>v && typeof v==='object');
  const candidates=[
    {name:raw.shipper_name,phone:raw.shipper_phone},
    {name:raw.driver_name,phone:raw.driver_phone},
    {name:raw.courier_name,phone:raw.courier_phone},
    ...objects
  ];
  for(const c of candidates) {
    const name=cleanName(c.name || c.full_name);
    const phone=normalizePhone(c.phone || c.mobile || c.phone_number);
    if(name || phone) return {name,phone,source:'tracking_fields'};
  }

  // Search only explicit assignment strings, never a deep sweep of arbitrary
  // note/address/customer fields that can carry the recipient's phone.
  for (const field of ['note','status','description','content','message','detail']) {
    const value=event[field] || raw[field];
    if(typeof value!=='string')continue;
    const match=parseAssignmentNote(value);
    if(match)return match;
  }
  return null;
}

function extractTrackingShipper(events) {
  if(!Array.isArray(events)||!events.length)return {name:'',phone:'',source:'',reason:'no_tracking'};
  const assignments=[];
  events.forEach((event,index)=>{
    const item=extractEventAssignment(event);
    if(item && (item.name||item.phone)) {
      assignments.push({ ...item, index, timestamp:parseEventTime(event.time || event.created_at || event.date || event._raw?.time) });
    }
  });
  if(!assignments.length)return {name:'',phone:'',source:'',reason:'no_explicit_assignment'};
  // Prefer actual timestamps if all relevant assignments have them. Otherwise
  // preserve the GHSV response order, usually newest-to-oldest.
  if(assignments.every(a=>a.timestamp!==null)) assignments.sort((a,b)=>b.timestamp-a.timestamp || a.index-b.index);
  const latest=assignments[0];
  if(latest.phone)return {name:latest.name,phone:latest.phone,source:latest.source,reason:'found'};
  // Reassignment can occur. Never display an old driver's phone if a different
  // newer driver was assigned. Reuse only a previous phone of the *same* name.
  const sameName=assignments.slice(1).find(a=>a.phone && a.name && latest.name && a.name.toLocaleLowerCase('vi')===latest.name.toLocaleLowerCase('vi'));
  if(sameName)return {name:latest.name,phone:sameName.phone,source:latest.source,reason:'found'};
  return {name:latest.name,phone:'',source:latest.source,reason:'assigned_without_phone'};
}

module.exports={normalizePhone,parseAssignmentNote,extractTrackingShipper};
