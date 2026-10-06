const crypto = require('crypto');

const CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const DEFAULT_FOLDER = String(process.env.CLOUDINARY_FOLDER || 'bee-sneaker').trim().replace(/^\/+|\/+$/g, '') || 'bee-sneaker';

function configured() {
  return !!(CLOUD_NAME && API_KEY && API_SECRET);
}

function signature(params = {}) {
  const canonical = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return crypto.createHash('sha1').update(`${canonical}${API_SECRET}`).digest('hex');
}

async function cloudinaryPost(path, fields) {
  if (!configured()) throw new Error('Cloudinary chưa được cấu hình trên Render.');
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && String(v) !== '') body.set(k, String(v));
  }
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const message = data?.error?.message || data?.message || `Cloudinary HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function uploadBuffer(buffer, mimeType = 'image/jpeg', options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Ảnh tải lên trống.');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = String(options.folder || DEFAULT_FOLDER).replace(/^\/+|\/+$/g, '');
  const signed = { folder, timestamp };
  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  const data = await cloudinaryPost('image/upload', {
    file: dataUri,
    api_key: API_KEY,
    ...signed,
    signature: signature(signed)
  });
  return {
    secure_url: String(data.secure_url || data.url || ''),
    public_id: String(data.public_id || ''),
    width: Number(data.width || 0),
    height: Number(data.height || 0),
    bytes: Number(data.bytes || buffer.length),
    format: String(data.format || '')
  };
}

async function destroy(publicId) {
  const id = String(publicId || '').trim();
  if (!configured() || !id) return { skipped: true };
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { invalidate: 'true', public_id: id, timestamp };
  return cloudinaryPost('image/destroy', {
    api_key: API_KEY,
    ...signed,
    signature: signature(signed)
  });
}

function attachmentUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return raw.includes('/upload/') ? raw.replace('/upload/', '/upload/fl_attachment/') : raw;
}

module.exports = {
  configured,
  uploadBuffer,
  destroy,
  attachmentUrl,
  folder: DEFAULT_FOLDER,
  cloudName: CLOUD_NAME
};
