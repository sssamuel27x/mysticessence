import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  limit,
  runTransaction,
  writeBatch,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { validateProductImageFiles } from "./product-gallery";
import { DEFAULT_SHIPPING_SETTINGS, isValidShippingSettings, normalizeShippingSettings, type ShippingSettings } from "../functions/shipping.mjs";
import { brandKey } from "./brand-catalogue";
import { DEFAULT_DECANT_PRICING, isValidDecantPricing, normalizeDecantPricing, type DecantPricingRule } from "../functions/decant-pricing.mjs";
import { normalizeBlockedDecantSizes } from "../functions/decant-availability.mjs";
import { isValidDecantStock, normalizeDecantStock } from "../functions/decant-stock.mjs";
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
  RECAPTCHA_ENTERPRISE_SITE_KEY: import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY,
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
if (app && typeof window !== "undefined" && env("RECAPTCHA_ENTERPRISE_SITE_KEY")) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env("RECAPTCHA_ENTERPRISE_SITE_KEY")!), isTokenAutoRefreshEnabled: true });
}
export const auth = app ? getAuth(app) : null;
export const database = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export const functions = app ? getFunctions(app, env("FIREBASE_FUNCTIONS_REGION") ?? "europe-west1") : null;

export type FirebaseSession = {
  uid: string;
  name: string;
  email: string;
  role: "customer" | "admin";
  emailVerified?: boolean;
  authTime?: number;
  isInfluencer?: boolean;
  influencerCouponCode?: string | null;
  loyaltyPoints?: number;
  loyaltyLifetimePoints?: number;
};

async function sessionFromUser(user: User): Promise<FirebaseSession> {
  const token = await user.getIdTokenResult(true);
  return {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Cliente",
    email: user.email || "",
    emailVerified: user.emailVerified,
    authTime: Number(token.claims.auth_time || 0),
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
  let stopRevocations: () => void = () => undefined;
  let generation = 0;
  const stopAuth = onAuthStateChanged(auth, async (user) => {
    generation += 1;
    const currentGeneration = generation;
    stopProfile();
    stopRevocations();
    stopProfile = () => undefined;
    onPending(user?.uid ?? null);
    if (!user) {
      callback(null);
      return;
    }
    let baseSession: FirebaseSession;
    try {
      baseSession = await sessionFromUser(user);
    } catch {
      // Never retain the previous account when token verification fails.
      if (currentGeneration === generation) callback(null);
      return;
    }
    if (database && currentGeneration === generation && auth.currentUser?.uid === user.uid) {
      stopRevocations = onSnapshot(doc(database, "sessionRevocations", user.uid), snapshot => {
        if (currentGeneration === generation && auth?.currentUser?.uid === user.uid && snapshot.exists() && (baseSession.authTime || 0) <= snapshot.data().revokedAt) void signOut(auth).catch(syncFailed);
      }, () => { if (currentGeneration === generation && auth?.currentUser?.uid === user.uid) { callback(null); syncFailed(); } });
    }
    if (currentGeneration !== generation) return;
    if (!database) {
      callback(baseSession);
      return;
    }
    stopProfile = onSnapshot(doc(database, "profiles", user.uid), (snapshot) => {
      if (currentGeneration !== generation || auth.currentUser?.uid !== user.uid) return;
      const profile = snapshot.data();
      const loyaltyPoints = Number(profile?.loyaltyPoints);
      const loyaltyLifetimePoints = Number(profile?.loyaltyLifetimePoints);
      callback({
        ...baseSession,
        name: typeof profile?.name === "string" && profile.name.trim() ? profile.name : baseSession.name,
        isInfluencer: profile?.isInfluencer === true,
        influencerCouponCode: typeof profile?.influencerCouponCode === "string" ? profile.influencerCouponCode : null,
        loyaltyPoints: Number.isInteger(loyaltyPoints) && loyaltyPoints > 0 ? loyaltyPoints : 0,
        loyaltyLifetimePoints: Number.isInteger(loyaltyLifetimePoints) && loyaltyLifetimePoints > 0 ? loyaltyLifetimePoints : 0,
      });
    }, () => {
      if (currentGeneration === generation && auth.currentUser?.uid === user.uid) { callback(null); syncFailed(); }
    });
  });
  return () => {
    generation += 1;
    stopProfile();
    stopRevocations();
    stopAuth();
  };
}

export async function loginWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase ainda não está configurado.");
  const result = await signInWithEmailAndPassword(auth, email, password);
  await ensureProfile(result.user);
  return sessionFromUser(result.user);
}

export async function registerWithEmail(name: string, email: string, password: string) {
  if (!auth || !database) throw new Error("Firebase ainda não está configurado.");
  const result = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await updateProfile(result.user, { displayName: name });
    await ensureProfile(result.user);
  } catch (error) {
    if (auth.currentUser?.uid === result.user.uid) await signOut(auth);
    throw error;
  }
  // Account creation succeeded; delivery can be retried from the verification panel.
  await sendEmailVerification(result.user).catch(() => undefined);
  return sessionFromUser(result.user);
}

export async function loginWithGoogle() {
  if (!auth || !database) throw new Error("Firebase ainda não está configurado.");
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  await ensureProfile(result.user);
  return sessionFromUser(result.user);
}

export async function logoutFirebase() {
  checkoutAttempt = undefined;
  if (auth) await signOut(auth);
}

export async function revokeMySessions() {
  if (!functions) throw new Error("Firebase não está configurado.");
  await httpsCallable(functions, "revokeMySessions")();
  await logoutFirebase();
}

async function ensureProfile(user: User) {
  if (!database) throw new Error("Firebase não está configurado.");
  try {
    await runTransaction(database, async transaction => {
      const reference = doc(database!, "profiles", user.uid);
      const existing = await transaction.get(reference);
      if (!existing.exists()) transaction.set(reference, { name: user.displayName || user.email?.split("@")[0] || "Cliente", email: user.email, createdAt: new Date().toISOString() });
    });
  } catch (error) {
    if (auth?.currentUser?.uid === user.uid) await signOut(auth);
    throw error;
  }
}

export async function requestPasswordReset(email: string) {
  if (!auth) throw new Error("Firebase não está configurado.");
  try { await sendPasswordResetEmail(auth, email.trim()); }
  catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
}

export async function requestEmailVerification() {
  if (!auth?.currentUser) throw new Error("Inicie sessão.");
  await sendEmailVerification(auth.currentUser);
}

function comparable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

export async function saveProductGroup<T extends { id: string }>(product: T, decant: T | null, expected: T | null) {
  if (!database) throw new Error("Firebase não está configurado.");
  await runTransaction(database, async transaction => {
    const reference = doc(database!, "products", product.id);
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null;
    const revision = (value: object | null) => value && Object.fromEntries(["variants", "name", "price", "brand", "category", "audiences", "desc", "discount", "updatedAt"].map(key => [key, (value as Record<string, unknown>)[key] ?? null]));
    if (comparable(revision(current)) !== comparable(revision(expected))) {
      throw new Error("O produto ou stock mudou entretanto. Reabra o editor antes de guardar.");
    }
    transaction.set(reference, cleanData({ ...product, updatedAt: new Date().toISOString() }));
    const decantRef = doc(database!, "products", `decant-${product.id}`);
    if (decant) transaction.set(decantRef, cleanData({ ...decant, updatedAt: new Date().toISOString() }));
    else transaction.delete(decantRef);
  });
}

export async function applyGlobalDecantPricing(rules: DecantPricingRule[]) {
  if (!functions) throw new Error("Firebase não está configurado.");
  return (await httpsCallable(functions, "applyDecantPricing", { timeout: 120000 })({ rules })).data;
}

export async function reconcilePayment(orderId: string) {
  if (!functions) throw new Error("Firebase não está configurado.");
  return (await httpsCallable<{ orderId: string }, { status: string }>(functions, "reconcilePayment")({ orderId })).data;
}

export async function releaseCancelledPayment(orderId: string, evidence: string) {
  if (!functions) throw new Error("Firebase não está configurado.");
  return (await httpsCallable(functions, "releaseCancelledPayment")({ orderId, evidence, providerCancellationConfirmed: true })).data;
}

function cleanData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function syncFailed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("firebase-sync-error"));
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

type DecantStock = Record<DecantSize, number | null>;

export function watchDecantStock(callback: (stock: DecantStock | null) => void, onError: (error: Error) => void) {
  if (!database) { onError(new Error("Firebase não está configurado.")); return () => undefined; }
  return onSnapshot(doc(database, "settings", "decantStock"), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.hasPendingWrites) return;
    try { callback(snapshot.exists() ? normalizeDecantStock(snapshot.data().quantities) as DecantStock : null); }
    catch { onError(new Error("O stock geral dos decants é inválido.")); }
  }, onError);
}

export async function saveDecantStock(stock: DecantStock, expected: DecantStock | null) {
  if (!database) throw new Error("Firebase não está configurado.");
  if (!isValidDecantStock(stock)) throw new Error("Quantidades de decants inválidas.");
  await runTransaction(database, async (transaction) => {
    const reference = doc(database!, "settings", "decantStock");
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? normalizeDecantStock(snapshot.data().quantities) as DecantStock : null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      throw new Error("O stock mudou entretanto. Os valores atuais foram recarregados; confirme antes de guardar novamente.");
    }
    transaction.set(reference, { quantities: stock, updatedAt: new Date().toISOString() });
  });
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
    callback(products);
  }, () => { callback([]); syncFailed(); });
}

export async function saveProduct<T extends object>(id: string, product: T) {
  if (!database) throw new Error("Firebase não está configurado.");
  await setDoc(doc(database, "products", id), cleanData(product), { merge: true });
}

export async function removeProduct(id: string) {
  if (!database) throw new Error("Firebase não está configurado.");
  const batch = writeBatch(database);
  batch.delete(doc(database, "products", id));
  if (!id.startsWith("decant-")) batch.delete(doc(database, "products", `decant-${id}`));
  await batch.commit();
}

export async function seedProducts<T extends { id: string }>(products: T[]) {
  if (!database) throw new Error("Firebase não está configurado.");
  if (products.length > 450) throw new Error("O catálogo excede o limite de envio atómico.");
  await runTransaction(database, async transaction => {
    const references = products.map(product => doc(database!, "products", product.id));
    const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
    products.forEach((product, index) => {
      if (!snapshots[index].exists()) transaction.set(references[index], cleanData(product));
    });
  });
}

export async function uploadProductImage(productId: string, file: File) {
  if (!storage || !storageEnabled) throw new Error("O envio de imagens será ativado quando o Firebase Storage estiver disponível.");
  if (validateProductImageFiles([file], 0)) throw new Error("Escolha uma imagem JPG, PNG ou WebP com menos de 5 MB.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const imageRef = ref(storage, `products/${productId}/${crypto.randomUUID()}.${extension}`);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return { imageUrl: await getDownloadURL(imageRef), imagePath: imageRef.fullPath };
}

export function watchOrders<T>(session: FirebaseSession, callback: (orders: T[]) => void) {
  if (!database) return () => undefined;
  const ordersQuery = session.role === "admin"
    ? query(collection(database, "orders"), orderBy("createdAt", "desc"))
    : query(collection(database, "orders"), where("customerUid", "==", session.uid), orderBy("createdAt", "desc"));
  return onSnapshot(ordersQuery, (snapshot) => {
    if (auth?.currentUser?.uid !== session.uid) return;
    callback(snapshot.docs
    .filter((item) => session.role === "admin" || item.data().paymentStatus === "paid")
    .map((item) => ({ id: item.id, ...item.data() } as T)));
  }, () => { if (auth?.currentUser?.uid === session.uid) { callback([]); syncFailed(); } });
}

export function watchProfiles<T>(callback: (profiles: T[]) => void) {
  if (!database) return () => undefined;
  const ownerUid = auth?.currentUser?.uid;
  return onSnapshot(collection(database, "profiles"), (snapshot) => {
    if (!ownerUid || auth?.currentUser?.uid !== ownerUid) return;
    const profiles = snapshot.docs
      .map((item) => ({ uid: item.id, ...item.data() } as unknown as T & { email?: string }))
      .sort((a, b) => String(a.email ?? "").localeCompare(String(b.email ?? ""), "pt"));
    callback(profiles);
  }, () => { if (auth?.currentUser?.uid === ownerUid) { callback([]); syncFailed(); } });
}

export function watchInfluencerCouponUses<T>(uid: string, callback: (uses: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(query(collection(database, "influencerCouponUses"), where("influencerUid", "==", uid)), (snapshot) => {
    if (auth?.currentUser?.uid !== uid) return;
    const uses = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as unknown as T & { usedAt?: string }))
      .sort((a, b) => String(b.usedAt ?? "").localeCompare(String(a.usedAt ?? "")));
    callback(uses);
  }, () => { if (auth?.currentUser?.uid === uid) { callback([]); syncFailed(); } });
}

export function watchLoyaltyHistory<T>(uid: string, callback: (entries: T[]) => void) {
  if (!database) return () => undefined;
  return onSnapshot(query(collection(database, "profiles", uid, "loyaltyHistory"), orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
    if (auth?.currentUser?.uid !== uid) return;
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
  }, () => { if (auth?.currentUser?.uid === uid) { callback([]); syncFailed(); } });
}

export async function setInfluencerAccount(payload: { uid: string; isInfluencer: boolean; couponCode: string | null }) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<typeof payload, { uid: string; isInfluencer: boolean; couponCode: string | null }>(functions, "setInfluencerAccount");
  return (await callable(payload)).data;
}

export async function grantLoyaltyPoints(payload: { uid: string; points: number }) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<typeof payload, { uid: string; points: number; balance: number }>(functions, "grantLoyaltyPoints");
  return (await callable(payload)).data;
}

export async function updateOrder(id: string, data: Record<string, unknown>) {
  if (!database) throw new Error("Firebase não está configurado.");
  await updateDoc(doc(database, "orders", id), cleanData(data));
}

export function watchCoupons<T>(callback: (coupons: T[]) => void) {
  if (!database) return () => undefined;
  const ownerUid = auth?.currentUser?.uid;
  return onSnapshot(query(collection(database, "coupons"), orderBy("createdAt", "desc")), (snapshot) => {
    if (!ownerUid || auth?.currentUser?.uid !== ownerUid) return;
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
  }, () => { if (auth?.currentUser?.uid === ownerUid) { callback([]); syncFailed(); } });
}

export async function saveCoupon<T extends object>(code: string, coupon: T) {
  if (!database) throw new Error("Firebase não está configurado.");
  await runTransaction(database, async transaction => {
    const reference = doc(database!, "coupons", code);
    if ((await transaction.get(reference)).exists()) throw new Error("Este cupão já existe.");
    transaction.set(reference, cleanData(coupon));
  });
}

export async function removeCoupon(code: string) {
  if (!database) throw new Error("Firebase não está configurado.");
  await runTransaction(database, async transaction => {
    const reference = doc(database!, "coupons", code);
    if ((await transaction.get(reference)).data()?.influencerUid) throw new Error("Retire primeiro a associação à influencer.");
    transaction.delete(reference);
  });
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
    () => { callback([]); syncFailed(); },
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
  return onSnapshot(collection(database, "profiles", uid, "favoriteFolders"), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.hasPendingWrites || auth?.currentUser?.uid !== uid) return;
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T)));
  }, () => { if (auth?.currentUser?.uid === uid) { callback([]); syncFailed(); } });
}

type FavoriteFolderData = { id: string; name: string; productIds: string[] };
let favoriteSaveQueue: Promise<void> = Promise.resolve();
export async function saveFavoriteFolders(uid: string, folders: FavoriteFolderData[], expected: FavoriteFolderData[] = []) {
  if (!database) throw new Error("Firebase não está configurado.");
  if (folders.length > 450) throw new Error("Limite de pastas atingido.");
  const previous = new Map(expected.map(folder => [folder.id, folder]));
  const changes = folders.filter(folder => comparable(folder) !== comparable(previous.get(folder.id)));
  const save = favoriteSaveQueue.then(() => runTransaction(database!, async transaction => {
    const refs = changes.map(folder => doc(database!, "profiles", uid, "favoriteFolders", folder.id));
    const snapshots = await Promise.all(refs.map(reference => transaction.get(reference)));
    snapshots.forEach((snapshot, index) => {
      if (comparable(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : undefined) !== comparable(previous.get(changes[index].id))) {
        throw new Error("Os favoritos mudaram noutro dispositivo. Recarregue antes de guardar.");
      }
    });
    changes.forEach((folder, index) => transaction.set(refs[index], cleanData(folder)));
  }));
  favoriteSaveQueue = save.catch(() => undefined);
  await save;
}

export async function deleteFavoriteFolder(uid: string, folderId: string) {
  if (!database) throw new Error("Firebase não está configurado.");
  await favoriteSaveQueue;
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
  const fingerprint = JSON.stringify([auth?.currentUser?.uid, payload]);
  if (checkoutAttempt?.fingerprint !== fingerprint) checkoutAttempt = { fingerprint, id: crypto.randomUUID() };
  return (await callable({ ...payload, attemptId: checkoutAttempt.id })).data;
}

let checkoutAttempt: { fingerprint: string; id: string } | undefined;

export async function createPendingOrder(payload: Record<string, unknown>) {
  if (!functions) throw new Error("O Firebase ainda não está configurado.");
  const callable = httpsCallable<Record<string, unknown>, { orderId: string }>(functions, "createPendingOrder");
  return (await callable(payload)).data;
}
