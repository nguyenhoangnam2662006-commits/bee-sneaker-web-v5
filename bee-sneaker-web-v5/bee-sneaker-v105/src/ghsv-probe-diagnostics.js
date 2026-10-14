// Bee V104. Return safe categorical diagnostics only; NEVER expose upstream
// bodies, order notes, phone numbers, cookies, credentials, or upstream headers.
'use strict';

const STATUS_MESSAGES = Object.freeze({
  400: 'GHSV báo yêu cầu không hợp lệ (HTTP 400). Cần kiểm tra tham số tra cứu hoặc tài liệu API.',
  401: 'GHSV trả HTTP 401: token API hiện tại không được chấp nhận cho endpoint website này.',
  403: 'GHSV trả HTTP 403: token hiện tại không có quyền đọc dữ liệu website này.',
  404: 'GHSV trả HTTP 404: đường dẫn API không tồn tại hoặc đã đổi.',
  405: 'GHSV trả HTTP 405: phương thức gọi API không được hỗ trợ.',
  429: 'GHSV trả HTTP 429: quá giới hạn yêu cầu. Hãy chờ một lúc rồi thử lại.'
});
const hasNonemptyPublicNote = order =>
  typeof order?.note_public === 'string' && order.note_public.trim().length>0;

function classifyGhsvProbeResponse(r,code,parseOrder,parseShipper) {
  const status=Number(r?.status)||0;
  if(status===401) return {result:'unauthorized',httpStatus:401,message:STATUS_MESSAGES[401]};
  if(status===403) return {result:'forbidden',httpStatus:403,message:STATUS_MESSAGES[403]};
  if(status===429) return {result:'rate_limited_upstream',httpStatus:429,message:STATUS_MESSAGES[429]};
  if(status>=500) return {result:'upstream_error',httpStatus:status,message:`GHSV đang lỗi máy chủ (HTTP ${status}). Hãy thử lại sau.`};
  if(!r?.ok) return {
    result:'http_error',httpStatus:status,
    message:STATUS_MESSAGES[status] || `GHSV trả HTTP ${status||'không xác định'}; Bee chưa đọc được dữ liệu.`
  };
  const data=r.data;
  const raw=typeof r.raw==='string'?r.raw:'';
  // jsonHttpRequest represents invalid JSON as {raw:'...'}.
  const invalidJson=!!(data && typeof data==='object' &&
    Object.keys(data).length===1 && typeof data.raw==='string' && data.raw===raw);
  if(invalidJson) return {result:'invalid_json',httpStatus:status,
    message:`GHSV trả HTTP ${status} nhưng nội dung không phải JSON hợp lệ. Có thể endpoint yêu cầu phiên đăng nhập website.`};
  if(!data || typeof data!=='object') return {result:'unexpected_body',httpStatus:status,
    message:`GHSV trả HTTP ${status} nhưng định dạng dữ liệu không đúng như mong đợi.`};
  if(data.success===false || data.status===false) return {result:'api_rejected',httpStatus:status,
    message:`GHSV trả HTTP ${status} nhưng nội dung API báo yêu cầu bị từ chối. Cần kiểm tra quyền và tham số API.`};
  const payload={__ghsvData:data,__searchFor:code};
  const found=parseOrder(payload,code);
  if(!found?.matched){
    const rows=Array.isArray(data.data) ? data.data : (Array.isArray(data?.data?.items)?data.data.items:null);
    const total=Number(data?.meta?.totalItem ?? data?.meta?.totalItems);
    const empty=(rows && rows.length===0) || (Number.isFinite(total) && total===0);
    return {
      result:empty?'empty_list':'no_match',httpStatus:status,
      message:empty
        ?`GHSV trả HTTP ${status}, nhưng danh sách đơn rỗng. Có thể token thuộc shop khác, thiếu quyền hoặc khoảng ngày chưa đúng.`
        :`GHSV trả HTTP ${status}, nhưng Bee chưa tìm thấy đúng mã đơn GY trong phản hồi. Không dùng dữ liệu của đơn khác.`,
      matchedOrder:false
    };
  }
  const shipper=parseShipper(payload);
  const hasPhone=Boolean(shipper?.phone);
  return {
    result:hasPhone?'shipper_available':'readable_no_shipper',httpStatus:status,
    message:hasPhone
      ?`GHSV trả HTTP ${status}. Đã tìm đúng đơn và phát hiện SĐT shipper. Có thể chuyển sang tự đồng bộ sau khi xác nhận quyền tích hợp.`
      :`GHSV trả HTTP ${status}. Đã tìm đúng đơn nhưng chưa lấy được SĐT shipper từ trường dữ liệu được phép đọc.`,
    matchedOrder:true,
    notePublicAvailable:hasNonemptyPublicNote(found.record)
  };
}

function classifyGhsvProbeError(e) {
  const code=String(e?.code || '').toUpperCase();
  const message=String(e?.message||'').toLowerCase();
  if(code==='ETIMEDOUT' || code==='ESOCKETTIMEDOUT' || message.includes('timeout')) return {
    result:'timeout', message:'GHSV phản hồi quá thời gian chờ. Hãy thử lại sau.'
  };
  if(code==='ENOTFOUND'||code==='EAI_AGAIN') return {
    result:'dns_error', message:'Máy chủ Render chưa phân giải được tên miền API GHSV.'
  };
  if(code.startsWith('CERT_')||code.startsWith('ERR_TLS_')||code==='UNABLE_TO_VERIFY_LEAF_SIGNATURE')return {
    result:'tls_error',message:'Không xác minh được kết nối bảo mật đến API GHSV.'
  };
  return {result:'network_error',message:'Không kết nối được API GHSV. Có thể đường truyền hoặc endpoint đang lỗi.'};
}
module.exports={classifyGhsvProbeResponse,classifyGhsvProbeError};
