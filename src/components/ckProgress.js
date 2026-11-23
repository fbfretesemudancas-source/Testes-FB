// Regras de andamento do checklist (usadas pelo próprio checklist, pela lista de OS e pelas notificações).
export const STAGE_KEYS = ["antes", "durante", "depois"];

/** [feitos, total] de uma etapa. */
const kmOk = v => (String(v || "").replace(/\D/g, "") ? 1 : 0);
export const stageProg = (c, st) => {
  const mv = c.moveis || [], mat = c.materiais || [], vc = c.compart ? 1 : 0; // veículo compartilhado: km ao retirar (Antes) e ao devolver (Depois)
  if (st === "antes") return [(c.enderecosOk ? 1 : 0) + mat.filter(x => x.ok).length + mv.filter(x => x.estado).length + (vc ? kmOk(c.kmRetirada) : 0), 1 + mat.length + mv.length + vc];
  if (st === "durante") return [mv.filter(x => x.carregado).length, mv.length];
  return [(c.entregaOk ? 1 : 0) + (c.conclusaoOk ? 1 : 0) + mv.filter(x => x.entregue).length + (vc ? kmOk(c.kmDevolucao) : 0), 2 + mv.length + vc];
};

/** Andamento geral em % (0 a 100). */
export const overall = c => {
  let d = 0, t = 0;
  for (const s of STAGE_KEYS) { const [a, b] = stageProg(c, s); d += a; t += b; }
  return t ? Math.round(d / t * 100) : 0;
};
