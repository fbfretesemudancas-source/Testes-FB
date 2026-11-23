// Acesso ao Firestore: companies/{uid}/{clients | orders | orcamentos | private/settings}
// (orders e private/settings são os mesmos caminhos do projeto base).
import { auth, db, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc } from "./config.js";
import { DEFAULT_MSG, DEFAULT_PRECO } from "../../js/domain.js";

export const DEFAULT_CFG = {
  tel: "(81) 99510-9353", ig: "fbfretesrecife", email: "fbfretesemudancas@gmail.com",
  regiao: "Recife, Olinda e Região Metropolitana", cidade: "Recife - PE",
  pixKey: "fbfretesemudancas@gmail.com", pixNome: "FERNANDO BUARQUE RAMALHO", pixCidade: "RECIFE",
  waUrl: "https://wa.me/qr/QEOJI2IQNYIMJ1", reviewUrl: "", startNum: 1, logo: "", truck: "",
  empresa: "FB Fretes e Mudanças",
  base: { rua: "", num: "", bairro: "", cidade: "", coord: "", lat: "", lon: "", label: "", precisao: "" },  // ponto de partida (casa/garagem)
  rotas: { provedor: "osm", googleKey: "", fator: "1,35", servidor: "", folga: "0" },
  preco: { ...DEFAULT_PRECO },
  veiculos: [],               // [{ placa, nome }]
  equipes: [],                // [{ nome }]
  agenda: { duracao: "3" },   // horas, quando o serviço não tem horário de término
  msgs: { ...DEFAULT_MSG }
};
const NESTED = ["base", "rotas", "preco", "msgs", "agenda"];
/** Junta o salvo por cima do padrão, inclusive dentro de base/rotas/preco/msgs. */
export function mergeCfg(def, saved) {
  const out = { ...def, ...saved };
  NESTED.forEach(k => { out[k] = { ...(def[k] || {}), ...((saved || {})[k] || {}) }; });
  return out;
}

const uid = () => auth.currentUser.uid;
const cache = {};

export async function listAll(name, force = false) {
  if (force || !cache[name]) {
    const snap = await getDocs(collection(db, "companies", uid(), name));
    cache[name] = snap.docs.map(d => ({ ...d.data(), _id: d.id }));
  }
  return cache[name].slice();
}
/** Cria (sem _id) ou atualiza (com _id). Devolve o registro salvo com _id. */
export async function saveItem(name, item) {
  const data = JSON.parse(JSON.stringify(item)); // Firestore recusa "undefined"
  delete data._id; data.savedAt = new Date().toISOString();
  let id = item._id;
  if (id) await setDoc(doc(db, "companies", uid(), name, id), data);
  else id = (await addDoc(collection(db, "companies", uid(), name), data)).id;
  delete cache[name];
  return { ...data, _id: id };
}
/** Fotos do checklist: companies/{uid}/checklists/{id}/fotos, uma por documento (já reduzidas no celular). */
export async function photosOf(id) {
  const s = await getDocs(collection(db, "companies", uid(), "checklists", id, "fotos"));
  return s.docs.map(d => ({ ...d.data(), _id: d.id })).sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
export async function addPhoto(id, data) { const d = { ...data }; delete d._id; return (await addDoc(collection(db, "companies", uid(), "checklists", id, "fotos"), d)).id; }
export const delPhoto = (id, fid) => deleteDoc(doc(db, "companies", uid(), "checklists", id, "fotos", fid));
export async function removeItem(name, id) {
  await deleteDoc(doc(db, "companies", uid(), name, id));
  delete cache[name];
}
export async function getCfg() {
  if (!cache.cfg) {
    let saved = {};
    try { const s = await getDoc(doc(db, "companies", uid(), "private", "settings")); saved = s.exists() ? (s.data().cfg || {}) : {}; }
    catch (e) { console.error("Ajustes:", e); }
    cache.cfg = mergeCfg(DEFAULT_CFG, saved);
  }
  return cache.cfg;
}
/** Veículos ativos para os seletores (agenda, OS, orçamento). Sem nada em Frota ainda, usa o cadastro antigo das Configurações. */
export async function getFleet() {
  const v = await listAll("vehicles");
  if (v.length) return v.filter(x => x.ativo !== false).sort((a, b) => String(a.placa).localeCompare(String(b.placa))).map(x => ({ placa: x.placa, nome: x.nome || x.modelo || "" }));
  return ((await getCfg()).veiculos || []).filter(x => x.placa);
}
/** Primeira vez na Frota: transforma os veículos que estavam em Configurações em fichas. Devolve quantos criou. */
export async function migrateFleet(blank) {
  const [v, cfg] = await Promise.all([listAll("vehicles", true), getCfg()]);
  if (v.length) return 0;
  const antigos = (cfg.veiculos || []).filter(x => x.placa);
  for (const x of antigos) await saveItem("vehicles", { ...blank(), placa: x.placa, nome: x.nome || "" });
  return antigos.length;
}
/** Equipes ativas para os seletores (agenda, OS, orçamento). Sem nada em Funcionários e equipes ainda, usa o cadastro antigo das Configurações. */
export async function getTeams() {
  const t = await listAll("teams");
  if (t.length) return t.filter(x => x.ativo !== false && (x.nome || "").trim()).sort((a, b) => String(a.nome).localeCompare(String(b.nome))).map(x => ({ nome: x.nome.trim() }));
  return ((await getCfg()).equipes || []).filter(x => x.nome);
}
/** Primeira vez em Funcionários e equipes: transforma as equipes que estavam em Configurações em cadastros. Devolve quantas criou. */
export async function migrateTeams(blank) {
  const [t, cfg] = await Promise.all([listAll("teams", true), getCfg()]);
  if (t.length) return 0;
  const antigas = (cfg.equipes || []).filter(x => x.nome);
  for (const x of antigas) await saveItem("teams", { ...blank(), nome: x.nome });
  return antigas.length;
}
/** Salva só as chaves enviadas (o resto do documento de ajustes, como logos, fica como está). */
export async function saveCfg(partial) {
  const data = JSON.parse(JSON.stringify({ cfg: partial }));
  await setDoc(doc(db, "companies", uid(), "private", "settings"), data, { merge: true });
  cache.cfg = mergeCfg(cache.cfg || DEFAULT_CFG, partial);
}
/** Próximo número da sequência (maior já usado + 1). */
export const nextNum = (list, start = 1) => Math.max(list.reduce((m, o) => Math.max(m, Number(o.num) || 0), 0) + 1, parseInt(start, 10) || 1);
