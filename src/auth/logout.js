import { auth } from "../firebase/config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export async function logout() {
  await signOut(auth); // o authGuard notifica o router, que volta para #/login
}
