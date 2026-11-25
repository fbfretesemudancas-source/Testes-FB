// Busca de CEP pelo endereço (ViaCEP, serviço público e gratuito: https://viacep.com.br).
// A busca é por UF + cidade + nome da rua. Ruas grandes têm vários CEPs (por faixa de numeração e lado par/ímpar):
// o número do imóvel escolhe o CEP certo. Se continuar ambíguo, NÃO chuta: deixa em branco.
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const SUFIXO_UF = /\s*[–—\/-]\s*([A-Za-z]{2})\s*$/;
const TIPOS = /^(rua|r\.?|avenida|av\.?|travessa|trav\.?|tv\.?|alameda|al\.?|estrada|est\.?|rodovia|rod\.?|pra[cç]a|p[cç]a\.?|largo|beco|vila|via)\s+/i;

/** UF do endereço: o que vier no fim da cidade ("Recife - PE") ou, se não vier, a UF padrão das Configurações. "" se não souber. */
export function ufDe(cidade, padrao) {
  const m = String(cidade || "").match(SUFIXO_UF), uf = (m ? m[1] : String(padrao || "")).trim().toUpperCase();
  return UFS.has(uf) ? uf : "";
}
export const cidadeLimpa = c => String(c || "").replace(SUFIXO_UF, "").trim();
/** Nome da rua sem "Rua", "Av.", "Travessa"…: o ViaCEP acha pelo trecho do nome, e o tipo costuma vir abreviado de outro jeito. */
export const nucleoRua = r => String(r || "").trim().replace(TIPOS, "").trim();
export const maskCep = d => { d = String(d || "").replace(/\D/g, "").slice(0, 8); return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d; };

/** O número está dentro da faixa do trecho? true / false, ou null quando o trecho não diz faixa nenhuma. */
export function cobre(complemento, n) {
  const t = semAcento(complemento);
  const par = /lado par/.test(t), impar = /lado impar/.test(t);
  if (par && n % 2 !== 0) return false;
  if (impar && n % 2 === 0) return false;
  let m;
  if ((m = t.match(/ate\s+(\d+)/))) return n <= +m[1];
  if ((m = t.match(/de\s+(\d+)(?:\/\d+)?\s+ao\s+fim/))) return n >= +m[1];
  if ((m = t.match(/de\s+(\d+)(?:\/\d+)?\s+a\s+(\d+)(?:\/\d+)?/))) return n >= +m[1] && n <= +m[2];
  return par || impar ? true : null;
}
/** Escolhe o CEP certo entre os que o ViaCEP devolveu. { cep } | { varios: true } | { nenhum: true } */
export function escolher(lista, { num, bairro }) {
  let l = Array.isArray(lista) ? lista.filter(x => x && x.cep) : [];
  if (!l.length) return { nenhum: true };
  const b = semAcento(bairro);
  if (b) { const f = l.filter(x => { const xb = semAcento(x.bairro); return xb && (xb.includes(b) || b.includes(xb)); }); if (f.length) l = f; } // bairro "de conversa" que não bate não derruba a busca
  const unicos = () => new Set(l.map(x => x.cep)).size === 1;
  if (unicos()) return { cep: l[0].cep, bairro: l[0].bairro };
  const n = parseInt(String(num || "").replace(/\D/g, ""), 10);
  if (n > 0) {
    const sim = l.filter(x => cobre(x.complemento, n) === true), sem = l.filter(x => cobre(x.complemento, n) === null), pool = sim.length ? sim : sem;
    if (pool.length && new Set(pool.map(x => x.cep)).size === 1) return { cep: pool[0].cep, bairro: pool[0].bairro };
  }
  return { varios: true };
}

const cache = new Map();
/** Busca o CEP. status: "ok" | "varios" | "nenhum" | "erro" (rede ou serviço fora do ar). */
export async function buscarCep({ rua, num, bairro, cidade, uf }) {
  const nome = nucleoRua(rua), cid = cidadeLimpa(cidade);
  const key = [uf, semAcento(cid), semAcento(nome)].join("|");
  let lista = cache.get(key);
  if (!lista) {
    try {
      for (const q of [nome, semAcento(nome)].filter((v, i, a) => a.indexOf(v) === i)) { // 2ª tentativa sem acento
        const r = await fetch(`https://viacep.com.br/ws/${uf}/${encodeURIComponent(cid)}/${encodeURIComponent(q)}/json/`);
        if (!r.ok) throw new Error("ViaCEP " + r.status);
        const j = await r.json(); lista = Array.isArray(j) ? j : [];
        if (lista.length) break;
      }
      cache.set(key, lista);
    } catch (e) { return { status: "erro" }; }
  }
  const r = escolher(lista, { num, bairro });
  return r.cep ? { status: "ok", cep: r.cep, bairro: r.bairro } : r.varios ? { status: "varios" } : { status: "nenhum" };
}
