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
import { validateProductImageFiles } from "./product-gallery";
import { DEFAULT_SHIPPING_SETTINGS, isValidShippingSettings, normalizeShippingSettings, type ShippingSettings } from "../functions/shipping.mjs";
import { brandKey } from "./brand-catalogue";
import { DEFAULT_DECANT_PRICING, isValidDecantPricing, normalizeDecantPricing, type DecantPricingRule } from "../functions/decant-pricing.mjs";
import { normalizeBlockedDecantSizes } from "../functions/decant-availability.mjs";
import type { DecantSize } from "../functions/decant-pricing.mjs";

type PublicEnv = Record<string, string | undefined>;

const nodeEnv: PublicEnv = typeof process !== "undefined" ? process.env as PublicEnv : {};

// Vite only replaces environment variables that are referenced statically.
const publicEnv: PublicEnv = {
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  FIREBASE_ADMIN_UID: import.meta.env.VITE_FIREBASE_ADMIN_UID,
  FIREBASE_FUNCTIONS_REGION: import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION,
  PAYMENTS_ENABLED: import.meta.env.VITE_PAYMENTS_ENABLED,
  STORAGE_ENABLED: import.meta.env.VITE_STORAGE_ENABLED,
};

function env(name: string) {
  return publicEnv[name] ?? nodeEnv[`NEXT_PUBLIC_${name}`];
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
  isInfluencer?: boolean;
  influencerCouponCode?: string | null;
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

export function watchSession(
  callback: (session: FirebaseSession | null) => void,
  onPending: (uid: string | null) => void = () => undefined,
) {
  if (!auth) {
    onPending(null);
    callback(null);
    return () => undefined;
  }
  let stopProfile: () => void = () => undefined;
  let generation = 0;
  const stopAuth = onAuthStateChanged(auth, async (user) => {
    generation += 1;
    const currentGeneration = generation;
    stopProfile();
    stopProfile = () => undefined;
    onPending(user?.uid ?? null);
    if (!user) {
      callback(null);
      return;
    }
    const baseSession = await sessionFromUser(user);
    if (currentGeneration !== generation) return;
    if (!database) {
      callback(baseSession);
      return;
    }
    stopProfile = onSnapshot(doc(database, "profiles", user.uid), (snapshot) => {
      if (currentGeneration !== generation || auth.currentUser?.uid !== user.uid) return;
      const profile = snapshot.data();
      callback({
        ...baseSession,
        name: typeof profile?.name === "string" && profile.name.trim() ? profile.name : baseSession.name,
        isInfluencer: profile?.isInfluencer === true,
        influencerCouponCode: typeof profile?.influencerCouponCode === "string" ? profile.influencerCouponCode : null,
      });
    }, () => {
      if (currentGeneration === generation && auth.currentUser?.uid === user.uid) callback(baseSession);
    });
  });
  return () => {
    generation += 1;
    stopProfile();
    stopAuth();
  };
}

export async function loginWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase ainda não está configurado.");
  const result = await signInWithEmailAndPassword(auth, email, password);
  if (database) {
    await setDoc(doc(database, "profiles", result.user.uid), {
      name: result.user.displayName || result.user.email?.split("@")[0] || "Cliente",
      email: result.user.email,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
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

export function watchShippingSettings(callback: (settings: ShippingSettings) => void, onError: (error: Error) => void) {
  if (!database) {
    onError(new Error("Firebase não está configurado."));
    return () => undefined;
  }
  return onSnapshot(doc(database, "settings", "shipping"), (snapshot) => {
    const settings = snapshot.exists() ? normalizeShippingSettings(snapshot.data().zones) : DEFAULT_SHIPPING_SETTINGS;
    if (!isValidShippingSettings(settings)) {
      onError(new Error("Os portes guardados são inválidos."));
      return;
    }
    callback(settings);
  }, onError);
}

export async function saveShippingSettings(zones: ShippingSettings) {
  if (!database) throw new Error("Firebase não está configurado.");
  if (!isValidShippingSettings(zones)) throw new Error("Valores de portes inválidos.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      setDoc(doc(database, "settings", "shipping"), { zones }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Sem confirmação do servidor. Verifique a ligação e reabra os portes antes de tentar novamente.")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function watchDecantPricing(callback: (rules: DecantPricingRule[]) => void, onError: (error: Error) => void) {
  if (!database) {
    callback(DEFAULT_DECANT_PRICING.map((rule) => ({ ...rule })));
    return () => undefined;
  }
  return onSnapshot(doc(database, "settings", "decants"), (snapshot) => {
    callback(snapshot.exists() ? normalizeDecantPricing(snapshot.data().rules) : DEFAULT_DECANT_PRICING.map((rule) => ({ ...rule })));
  }, onError);
}

export async function saveDecantPricing(rules: DecantPricingRule[]) {
  if (!database) throw new Error("Firebase não está configurado.");
  if (!isValidDecantPricing(rules)) throw new Error("Regras de preços de decants inválidas.");
  await setDoc(doc(database, "settings", "decants"), { rules: cleanData(rules), updatedAt: new Date().toISOString() });
}

export function watchDecantAvailability(callback: (sizes: DecantSize[]) => void, onError: (error: Error) => void) {
  if (!database) { onError(new Error("Firebase não está configurado.")); return () => undefined; }
  return onSnapshot(doc(database, "settings", "decantAvailability"), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    try { callback(normalizeBlockedDecantSizes(snapshot.data()?.blockedSizes)); }
    catch { onError(new Error("A disponibilidade dos decants é inválida.")); }
  }, onError);
}

export async function saveDecantAvailability(sizes: DecantSize[]) {
  if (!database) throw new Error("Firebase não está configurado.");
  const blockedSizes = normalizeBlockedDecantSizes(sizes);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      setDoc(doc(database, "settings", "decantAvailability"), { blockedSizes }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Sem confirmação do servidor. Reabra o painel para confirmar a disponibilidade.")), 10000);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function watchBrands(callback: (names: string[]) => void, onError: (error: Error) => void) {
  if (!database) { onError(new Error("Firebase não está configurado.")); return () => undefined; }
  return onSnapshot(collection(database, "brands"), (snapshot) => {
    callback(snapshot.docs.map((item) => item.data().name).filter((name): name is string => typeof name === "string"));
  }, onError);
}

export async function saveBrand(name: string) {
  if (!database) throw new Error("Firebase não está configurado.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      setDoc(doc(database, "brands", encodeURIComponent(brandKey(name))), { name }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Sem confirmação do servidor. Reabra as marcas antes de tentar novamente.")), 10000);
      }),
    ]);
  } finally { clearTimeout(timer); }
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
  if (validateProductImageFiles([file], 0)) throw new Error("Escolha uma imagem JPG, PNG ou WebP com menos de 5 MB.");
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
  return onSnapshot(ordersQuery, (snapshot) => callback(snapshot.docs
    .filter((item) => item.data().paymentStatus === "paid")
    .map((item) => ({ id: item.id, ...item.data() } as T))));
}

export function watchProfiles<T>(callback: (profiles: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(collection(database, "profiles"), (snapshot) => {
    const profiles = snapshot.docs
      .map((item) => ({ uid: item.id, ...item.data() } as unknown as T & { email?: string }))
      .sort((a, b) => String(a.email ?? "").localeCompare(String(b.email ?? ""), "pt"));
    callback(profiles);
  }, (error) => console.error("Não foi possível acompanhar as contas.", error));
}

export function watchInfluencerCouponUses<T>(uid: string, callback: (uses: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(query(collection(database, "influencerCouponUses"), where("influencerUid", "==", uid)), (snapshot) => {
    const uses = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as unknown as T & { usedAt?: string }))
      .sort((a, b) => String(b.usedAt ?? "").localeCompare(String(a.usedAt ?? "")));
    callback(uses);
  }, (error) => console.error("Não foi possível acompanhar os usos do cupão.", error));
}

export async function setInfluencerAccount(payload: { uid: string; isInfluencer: boolean; couponCode: string | null }) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<typeof payload, { uid: string; isInfluencer: boolean; couponCode: string | null }>(functions, "setInfluencerAccount");
  return (await callable(payload)).data;
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

export async function subscribeToRestock(payload: { productId: string; volume: string; email: string; lang: "pt" | "en" }) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<typeof payload, { subscriptionId: string }>(functions, "subscribeToRestock");
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

export async function deleteFavoriteFolder(uid: string, folderId: string) {
  if (!database) return;
  await deleteDoc(doc(database, "profiles", uid, "favoriteFolders", folderId));
}

export type IfthenpayCheckoutResult = {
  orderId: string;
  amount: number;
  method: "mbway" | "multibanco" | "payshop" | "card";
  paymentStatus: "pending";
  paymentUrl?: string;
  entity?: string;
  reference?: string;
  requestId?: string;
  expiresAt?: string;
  message?: string;
};

export async function createCheckout(payload: Record<string, unknown>) {
  if (!functions) throw new Error("O pagamento real ainda não está configurado.");
  const callable = httpsCallable<Record<string, unknown>, IfthenpayCheckoutResult>(functions, "createCheckout");
  return (await callable(payload)).data;
}

export async function createPendingOrder(payload: Record<string, unknown>) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<Record<string, unknown>, { orderId: string }>(functions, "createPendingOrder");
  return (await callable(payload)).data;
}
