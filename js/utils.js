// Utilitários compartilhados (mesmos formatos do projeto base)
export function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function num(v){
  if (v == null || v === '') return 0;
  let s = String(v).trim().replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
export function brl(n){
  return 'R$ ' + n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}
export function pad(n){ return String(n).padStart(4, '0'); }
export function fmtD(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (v || '');
}
let toastTimer;
export function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// Valor curto para rótulos de gráfico: R$ 450 · R$ 1,2 mil · R$ 2,5 mi
export function brlCompact(n){
  const f = (v, d) => v.toLocaleString('pt-BR', {maximumFractionDigits: d});
  if (n >= 1e6) return 'R$ ' + f(n / 1e6, 1) + ' mi';
  if (n >= 1e3) return 'R$ ' + f(n / 1e3, 1) + ' mil';
  return 'R$ ' + f(Math.round(n), 0);
}

// ---- Formatação e máscaras (portados do projeto base) ----
export const digits = v => String(v || '').replace(/\D/g, '');
export function money(v){
  return v === '' || v == null ? '' : num(v).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
export function today(offsetDays = 0){
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function fmtDT(v){
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : fmtD(v);
}
export const MASK = {
  tel(v){ const d = digits(v).slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7); },
  cpf(v){ return digits(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); },
  // CPF até 11 dígitos; acima disso vira CNPJ
  doc(v){ const d = digits(v).slice(0, 14);
    if (d.length <= 11) return MASK.cpf(d);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'); },
  km(v){ return digits(v).slice(0, 7); },
  ano(v){ return digits(v).slice(0, 4); },
  placa(v){ return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); },
  cep(v){ const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
};
export const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const firstName = s => String(s || '').trim().split(/\s+/)[0] || '';
/** Link wa.me com mensagem pronta (abre o WhatsApp; você só toca em enviar). */
export function waLink(tel, text){
  let t = digits(tel); if (t.length >= 10 && t.slice(0, 2) !== '55') t = '55' + t;
  return 'https://wa.me/' + t + '?text=' + encodeURIComponent(text);
}
export const isUrl = u => /^https?:\/\/\S+\.\S+/i.test(String(u || '').trim());

// Número do orçamento no formato do modelo: 000125
export const padO = n => String(n || 0).padStart(6, '0');
