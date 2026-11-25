// CEP automático: depois que você preenche rua, número, bairro e cidade do local de carga ou descarga, o campo CEP é preenchido sozinho.
//  • só mexe no CEP se estiver vazio ou se foi o próprio sistema que preencheu (CEP digitado por você nunca é trocado);
//  • se o endereço mudar, o CEP automático acompanha; se não achar um CEP seguro, esvazia em vez de deixar um CEP velho;
//  • se a rua tiver vários CEPs e o número não resolver, deixa em branco e avisa.
import { buscarCep, ufDe, maskCep, nucleoRua, cidadeLimpa } from "../../js/cep.js";

const ESPERA = 900; // ms depois da última tecla
export function bindCepAuto(view, rec, { cfg = {}, onChange = () => {} } = {}) {
  const ws = ["col", "ent"].filter(w => view.querySelector(`[data-k="${w}.cep"]`));
  const timers = {}, auto = {}, ultima = {}, seq = {};
  const ufPadrao = () => (cfg.base && cfg.base.uf) || "PE";
  ws.forEach(w => { // aviso pequeno embaixo do campo CEP
    const lab = view.querySelector(`[data-k="${w}.cep"]`).closest("label");
    lab.insertAdjacentHTML("beforeend", `<small class="cep-hint" data-cep-hint="${w}" aria-live="polite"></small>`);
  });
  const hint = (w, txt, cls = "") => { const h = view.querySelector(`[data-cep-hint="${w}"]`); if (h) { h.textContent = txt; h.className = "cep-hint " + cls; } };
  const digits = v => String(v || "").replace(/\D/g, "");
  const gravar = (w, cep) => { const a = rec[w]; a.cep = cep ? maskCep(cep) : ""; const el = view.querySelector(`[data-k="${w}.cep"]`); if (el) el.value = a.cep; auto[w] = digits(a.cep); onChange(); };

  async function rodar(w) {
    const a = rec[w], atual = digits(a.cep);
    if (atual && atual !== auto[w]) { hint(w, ""); return; }              // CEP digitado por você: não mexe
    const rua = nucleoRua(a.rua), cid = cidadeLimpa(a.cidade);
    if (rua.length < 3 || !cid) { if (auto[w] && atual === auto[w]) gravar(w, ""); hint(w, ""); return; }
    const uf = ufDe(a.cidade, ufPadrao());
    if (!uf) { hint(w, "Informe o estado (UF) em Configurações para o CEP automático.", "aviso"); return; }
    const chave = [uf, cid, rua, a.num, a.bairro].join("|").toLowerCase();
    if (ultima[w] === chave) return; ultima[w] = chave;
    const minha = seq[w] = (seq[w] || 0) + 1;
    hint(w, "Buscando CEP…");
    const r = await buscarCep({ rua: a.rua, num: a.num, bairro: a.bairro, cidade: a.cidade, uf });
    if (minha !== seq[w]) return;                                        // chegou uma resposta mais nova: ignora esta
    const agora = digits(rec[w].cep); if (agora && agora !== auto[w]) { hint(w, ""); return; } // você digitou um CEP enquanto buscava
    if (r.status === "ok") { gravar(w, r.cep); hint(w, "CEP preenchido automaticamente. Confira.", "ok"); }
    else {
      if (auto[w] && agora === auto[w]) gravar(w, "");                   // o endereço mudou e o CEP antigo não vale mais
      hint(w, r.status === "varios" ? "Esta rua tem vários CEPs. Informe o número (ou o bairro) para achar o certo." : r.status === "nenhum" ? "CEP não encontrado para este endereço." : "Não foi possível buscar o CEP agora.", "aviso");
    }
  }
  const agendar = w => { clearTimeout(timers[w]); timers[w] = setTimeout(() => rodar(w), ESPERA); };
  view.addEventListener("input", e => {
    const k = e.target.dataset && e.target.dataset.k, m = k && k.match(/^(col|ent)\.(rua|num|bairro|cidade)$/);
    if (m && ws.includes(m[1])) agendar(m[1]);
    const c = k && k.match(/^(col|ent)\.cep$/); if (c) hint(c[1], ""); // mexeu no CEP na mão: some o aviso
  });
  return { rodar };
}
