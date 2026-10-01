function normalizePhone(value) {
  const raw = String(value || '').replace(/[\s().-]/g, '');
  const phone = raw.startsWith('+84') ? '0' + raw.slice(3) : raw.startsWith('84') ? '0' + raw.slice(2) : raw;
  return /^0[35789][0-9]{8}$/.test(phone) ? phone : null;
}
module.exports = { normalizePhone };
