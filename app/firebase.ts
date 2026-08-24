import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

type PublicEnv = Record<string, string | undefined>;

const viteEnv = ((import.meta as ImportMeta & { env?: PublicEnv }).env ?? {}) as PublicEnv;
const nodeEnv: PublicEnv = typeof process !== "undefined" ? process.env as PublicEnv : {};

function env(name: string) {
  return viteEnv[`VITE_${name}`] ?? nodeEnv[`NEXT_PUBLIC_${name}`];
}

const firebaseConfig = {
  apiKey: env("FIREBASE_API_KEY"),
  authDomain: env("FIREBASE_AUTH_DOMAIN"),
  projectId: env("FIREBASE_PROJECT_ID"),
  storageBucket: env("FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("FIREBASE_APP_ID"),
};

export const firebaseEnabled = Object.values(firebaseConfig).every(Boolean);
export const paymentsEnabled = env("PAYMENTS_ENABLED") === "true";
export const storageEnabled = env("STORAGE_ENABLED") === "true";
const adminUid = env("FIREBASE_ADMIN_UID");
const app = firebaseEnabled ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;
export const auth = app ? getAuth(app) : null;
export const database = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const functions = app ? getFunctions(app, env("FIREBASE_FUNCTIONS_REGION") ?? "europe-west1") : null;

export type FirebaseSession = {
  uid: string;
  name: string;
  email: string;
  role: "customer" | "admin";
};

async function sessionFromUser(user: User): Promise<FirebaseSession> {
  const token = await user.getIdTokenResult(true);
  return {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Cliente",
    email: user.email || "",
    role: token.claims.admin === true || user.uid === adminUid ? "admin" : "customer",
  };
}

export function watchSession(callback: (session: FirebaseSession | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, async (user) => callback(user ? await sessionFromUser(user) : null));
}

export async function loginWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase ainda não está configurado.");
  const result = await signInWithEmailAndPassword(auth, email, password);
  return sessionFromUser(result.user);
}

export async function registerWithEmail(name: string, email: string, password: string) {
  if (!auth || !database) throw new Error("Firebase ainda não está configurado.");
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName: name });
  await setDoc(doc(database, "profiles", result.user.uid), {
    name,
    email: result.user.email,
    createdAt: new Date().toISOString(),
  }, { merge: true });
  return sessionFromUser(result.user);
}

export async function loginWithGoogle() {
  if (!auth || !database) throw new Error("Firebase ainda não está configurado.");
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  await setDoc(doc(database, "profiles", result.user.uid), {
    name: result.user.displayName,
    email: result.user.email,
    createdAt: new Date().toISOString(),
  }, { merge: true });
  return sessionFromUser(result.user);
}

export async function logoutFirebase() {
  if (auth) await signOut(auth);
}

function cleanData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function watchProducts<T>(callback: (products: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(query(collection(database, "products"), orderBy("name.pt")), (snapshot) => {
    const products = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
    if (products.length) callback(products);
  }, (error) => console.error("Não foi possível acompanhar o catálogo Firebase.", error));
}

export async function saveProduct<T extends object>(id: string, product: T) {
  if (!database) return;
  await setDoc(doc(database, "products", id), cleanData(product), { merge: true });
}

export async function removeProduct(id: string) {
  if (!database) return;
  await deleteDoc(doc(database, "products", id));
}

export async function seedProducts<T extends { id: string }>(products: T[]) {
  if (!database) return;
  await Promise.all(products.map((product) => setDoc(doc(database, "products", product.id), cleanData(product), { merge: true })));
}

export async function uploadProductImage(productId: string, file: File) {
  if (!storage || !storageEnabled) throw new Error("O envio de imagens será ativado quando o Firebase Storage estiver disponível.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const imageRef = ref(storage, `products/${productId}/${crypto.randomUUID()}.${extension}`);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return { imageUrl: await getDownloadURL(imageRef), imagePath: imageRef.fullPath };
}

export function watchOrders<T>(session: FirebaseSession, callback: (orders: T[]) => void) {
  if (!database) return () => undefined;
  const ordersQuery = session.role === "admin"
    ? query(collection(database, "orders"), orderBy("createdAt", "desc"))
    : query(collection(database, "orders"), where("customerUid", "==", session.uid), orderBy("createdAt", "desc"));
  return onSnapshot(ordersQuery, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T))));
}

export async function updateOrder(id: string, data: Record<string, unknown>) {
  if (!database) return;
  await updateDoc(doc(database, "orders", id), cleanData(data));
}

export function watchCoupons<T>(callback: (coupons: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(query(collection(database, "coupons"), orderBy("createdAt", "desc")), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
  }, (error) => console.error("Não foi possível acompanhar os cupões.", error));
}

export async function saveCoupon<T extends object>(code: string, coupon: T) {
  if (!database) return;
  await setDoc(doc(database, "coupons", code), cleanData(coupon));
}

export async function removeCoupon(code: string) {
  if (!database) return;
  await deleteDoc(doc(database, "coupons", code));
}

export async function validateCoupon(code: string) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<{ code: string }, { code: string; discount: number }>(functions, "validateCoupon");
  return (await callable({ code })).data;
}

export function watchReviews<T>(productId: string, callback: (reviews: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(
    query(collection(database, "reviews"), where("productId", "==", productId)),
    (snapshot) => {
      const reviews = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as unknown as T & { createdAt?: string }))
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
      callback(reviews);
    },
    (error) => console.error("Não foi possível acompanhar as avaliações.", error),
  );
}

export async function submitReview(payload: { productId: string; rating: number; comment: string }) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<typeof payload, { reviewId: string }>(functions, "submitReview");
  return (await callable(payload)).data;
}

export function watchFavoriteFolders<T>(uid: string, callback: (folders: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(collection(database, "profiles", uid, "favoriteFolders"), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
  });
}

export async function saveFavoriteFolders(uid: string, folders: Array<{ id: string; name: string; productIds: string[] }>) {
  if (!database) return;
  await Promise.all(folders.map((folder) => setDoc(doc(database, "profiles", uid, "favoriteFolders", folder.id), cleanData(folder))));
}

export async function createCheckout(payload: Record<string, unknown>) {
  if (!functions) throw new Error("O pagamento real ainda não está configurado.");
  const callable = httpsCallable<Record<string, unknown>, { orderId: string; paymentUrl: string }>(functions, "createCheckout");
  return (await callable(payload)).data;
}

export async function createPendingOrder(payload: Record<string, unknown>) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<Record<string, unknown>, { orderId: string }>(functions, "createPendingOrder");
  return (await callable(payload)).data;
}
