// Tema claro/escuro. Sem escolha salva, segue o do aparelho; com escolha, vale a escolha (fica salva neste navegador).
const KEY = "fb-theme";
export const savedTheme = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
export const effectiveTheme = () => document.documentElement.getAttribute("data-theme")
  || (typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
export function setTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem(KEY, t); } catch (e) {} }
export function toggleTheme() { const n = effectiveTheme() === "dark" ? "light" : "dark"; setTheme(n); return n; }
