// Tela de login — rota pública (#/login). Nada do sistema é carregado aqui.
import { auth, COMPANY_EMAIL } from "../firebase/config.js";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { consumeAuthError } from "./authGuard.js";
import { effectiveTheme, toggleTheme } from "../../js/theme.js";

// Ícones em traço (estilo Feather, licença MIT)
const ic = (d, extra = "") => `<svg class="lg-ic" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const MAIL = ic('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>');
const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
const ENTER = ic('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>');
const SUN = ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'id="icSun"');
const MOON = ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', 'id="icMoon"');

export function render(root) {
  root.innerHTML = `
  <main class="lg-page">
    <button class="lg-theme" id="themeBtn" type="button" aria-label="Alternar entre tema claro e escuro" title="Alternar tema">${SUN}${MOON}</button>
    <section class="lg-card">
      <header class="lg-brand">
        <div class="lg-mark" role="img" aria-label="FB"></div><i class="lg-div"></i>
        <div><div class="lg-name">FB Fretes e <b>Mudanças</b></div><div class="lg-tag">Transporte com responsabilidade</div></div>
      </header>
      <div class="lg-title">${ic(LOCK, 'style="stroke:currentColor"')}<div><h2>Entrar no sistema</h2><p>Informe o e-mail e a senha da conta da empresa.</p></div></div>
      <form id="loginForm">
        <div class="lg-fld">${MAIL}<label class="sr" for="loginEmail">E-mail</label>
          <input id="loginEmail" type="email" placeholder="E-mail" autocomplete="off" autocapitalize="none" spellcheck="false" required></div>
        <div class="lg-fld">${ic(LOCK)}<label class="sr" for="loginPassword">Senha</label>
          <input id="loginPassword" type="password" placeholder="Senha" autocomplete="current-password" required>
          <button class="lg-show" id="togglePassword" type="button" aria-pressed="false" aria-label="Mostrar senha">Mostrar</button></div>
        <button class="lg-btn" id="loginButton" type="submit">${ENTER}<span>Entrar</span></button>
      </form>
      <div class="lg-forgot"><i></i><button class="lg-link" id="forgot" type="button">Esqueceu sua senha?</button><i></i></div>
      <div class="lg-msg" id="loginMsg" role="status" aria-live="polite"></div>
    </section>
  </main>`;

  const $ = id => root.querySelector("#" + id);
  const msg = (t, err) => { const m = $("loginMsg"); m.textContent = t || ""; m.className = "lg-msg" + (t ? (err ? " err" : " ok") : ""); };
  const blocked = consumeAuthError();
  if (blocked) msg(blocked, true);

  // sol quando está escuro (toque para clarear), lua quando está claro
  const syncTheme = () => { const dark = effectiveTheme() === "dark"; $("icSun").style.display = dark ? "" : "none"; $("icMoon").style.display = dark ? "none" : ""; };
  syncTheme();
  $("themeBtn").addEventListener("click", () => { toggleTheme(); syncTheme(); });

  $("togglePassword").addEventListener("click", e => {
    const f = $("loginPassword"), show = f.type === "password";
    f.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Ocultar" : "Mostrar";
    e.currentTarget.setAttribute("aria-pressed", String(show));
    e.currentTarget.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  });

  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("loginButton"); btn.disabled = true; msg("Verificando acesso…");
    try {
      await signInWithEmailAndPassword(auth, $("loginEmail").value.trim().toLowerCase(), $("loginPassword").value);
      // Sucesso: o authGuard avisa o router, que leva ao painel.
    } catch (err) {
      console.error("Erro no login:", err);
      msg("Não foi possível entrar. Confira o e-mail e a senha.", true);
    } finally { btn.disabled = false; }
  });

  $("forgot").addEventListener("click", async () => {
    if ($("loginEmail").value.trim().toLowerCase() !== COMPANY_EMAIL) {
      msg("Digite o e-mail da empresa no campo acima para receber o link de recuperação.", true); return;
    }
    try { await sendPasswordResetEmail(auth, COMPANY_EMAIL); msg("Enviamos o link de recuperação. Confira também o spam."); }
    catch (err) { console.error(err); msg("Não foi possível enviar o e-mail de recuperação.", true); }
  });
}
