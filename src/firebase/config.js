// Firebase (SDK modular via CDN — sem npm/bundler).
// Estes valores identificam o projeto e são públicos por natureza; a proteção real
// está nas regras do Firestore (firestore.rules) e na autenticação.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCTN8WZ3e6btbZ5D1i8Bxo1h-IbV4_vA4k",
  authDomain: "os-fb-fretes.firebaseapp.com",
  projectId: "os-fb-fretes",
  storageBucket: "os-fb-fretes.firebasestorage.app",
  messagingSenderId: "22993942711",
  appId: "1:22993942711:web:3de96925975e77c7233532",
  measurementId: "G-CGJWEL4KQ1"
};

// Única conta autorizada a entrar no sistema (mesma do projeto base).
export const COMPANY_UID = "ZU4Sv4TMQzTjjUuvXFh7fBj2Csx2";
export const COMPANY_EMAIL = "fbfretesemudancas@gmail.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Sessão encerra ao fechar a aba/navegador (igual ao projeto base).
export const persistenceReady = setPersistence(auth, browserSessionPersistence);

// Atalhos do Firestore para as páginas importarem de um lugar só.
export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
