// PIX copia-e-cola (BR Code estático) — portado do projeto base.
const tlv = (id, v) => id + String(v.length).padStart(2, "0") + v;
export function crc16(str) {
  let c = 0xFFFF;
  for (let i = 0; i < str.length; i++) { c ^= str.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) : (c << 1); c &= 0xFFFF; }
  return c.toString(16).toUpperCase().padStart(4, "0");
}
const ascii = (v, max) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").toUpperCase().slice(0, max);
export function pixPayload(key, nome, cidade, valor, txid) {
  key = String(key || "").trim(); if (!key) return "";
  let p = tlv("00", "01") + tlv("01", "11") + tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key)) + tlv("52", "0000") + tlv("53", "986");
  if (valor > 0) p += tlv("54", valor.toFixed(2));
  p += tlv("58", "BR") + tlv("59", ascii(nome, 25) || "RECEBEDOR") + tlv("60", ascii(cidade, 15) || "BRASIL") + tlv("62", tlv("05", txid || "***"));
  p += "6304"; return p + crc16(p);
}
