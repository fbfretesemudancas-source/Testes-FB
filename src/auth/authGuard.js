// Guarda de autenticação: descobre quem está logado e barra contas não autorizadas.
import { auth, persistenceReady, COMPANY_UID } from "../firebase/config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

let currentUser = null;
let authError = "";
const listeners = new Set();
let resolveReady;
const ready = new Promise(r => { resolveReady = r; });

function attach() {
  onAuthStateChanged(auth, async user => {
    if (user && user.uid !== COMPANY_UID) {
      authError = "Esta conta não está autorizada a acessar o sistema.";
      await signOut(auth);
      return; // o signOut dispara este callback de novo com user = null
    }
    currentUser = user;
    resolveReady();
    listeners.forEach(fn => fn(user));
  });
}
// Espera a persistência de sessão ser configurada antes de ouvir o login.
persistenceReady.catch(e => console.error("Persistência de sessão:", e)).finally(attach);

/** Resolve com o usuário autorizado ou null. Aguarda a 1ª checagem do Firebase. */
export async function getCurrentUser() {
  await ready;
  return currentUser;
}
/** Chama fn sempre que o login/logout mudar (ex.: sessão expirou em outra aba). */
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Mensagem de bloqueio pendente (conta não autorizada), lida uma única vez. */
export function consumeAuthError() { const m = authError; authError = ""; return m; }
