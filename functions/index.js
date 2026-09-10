const { createHash, timingSafeEqual, randomUUID } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { defineSecret, defineString, defineBoolean } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { rateLimit, hash, validateDestination } = require("./security.cjs");
const { trackingDetails } = require("./tracking.cjs");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { HttpsError, onCall: firebaseOnCall, onRequest } = require("firebase-functions/v2/https");
const { normalizeBlockedDecantSizes, variantUnavailable } = require("./decant-availability.mjs");

initializeApp();
const db = getFirestore();
function onCall(options, handler) {
  return firebaseOnCall(options, async request => {
    if (request.auth) {
      const revocation = await db.collection("sessionRevocations").doc(request.auth.uid).get();
      if (revocation.exists && Number(request.auth.token.auth_time || 0) <= revocation.data().revokedAt) {
        throw new HttpsError("unauthenticated", "Esta sessão terminou. Volte a iniciar sessão.");
      }
    }
    return handler(request);
  });
}
const region = "europe-west1";
const enforceAppCheck = defineBoolean("ENFORCE_APP_CHECK", { default: false });
const callableOptions = { region, enforceAppCheck };
const ifthenpayMbKey = defineSecret("IFTHENPAY_MB_KEY");
const ifthenpayMbwayKey = defineSecret("IFTHENPAY_MBWAY_KEY");
const ifthenpayPayshopKey = defineSecret("IFTHENPAY_PAYSHOP_KEY");
const ifthenpayCardKey = defineSecret("IFTHENPAY_CARD_KEY");
const callbackKey = defineSecret("IFTHENPAY_CALLBACK_KEY");
const ownerEmail = defineSecret("OWNER_EMAIL");
const publicSiteUrl = defineString("PUBLIC_SITE_URL", { default: "http://localhost:3000" });
const adminAccountUid = "bFGr8AtlSGQTDZ9Nel9BVXB0csC2";

exports.revokeMySessions = onCall(callableOptions, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicie sessão.");
  const now = Math.floor(Date.now() / 1000);
  if (Number(request.auth.token.auth_time || 0) < now - 300) throw new HttpsError("failed-precondition", "Volte a iniciar sessão antes de terminar todas as sessões.");
  await db.collection("sessionRevocations").doc(request.auth.uid).set({ revokedAt: now });
  await getAuth().revokeRefreshTokens(request.auth.uid);
  return { revoked: true };
});

const currency = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const shippingZones = {
  continental: { label: "Portugal Continental", fee: 4.9, freeFrom: 85 },
  islands: { label: "Madeira / Açores", fee: 12, freeFrom: 100 },
  spain: { label: "Espanha", fee: 10, freeFrom: 100 },
};

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicie sessão como administrador.");
  if (request.auth.token.admin !== true && request.auth.uid !== adminAccountUid) {
    throw new HttpsError("permission-denied", "Apenas o administrador pode realizar esta operação.");
  }
}

function html(value) {
  return text(value, 5000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeShippingZone(value) {
  const zone = text(value, 30);
  return Object.prototype.hasOwnProperty.call(shippingZones, zone) ? zone : "continental";
}

function amount(value) {
  return Number(value).toFixed(2);
}

function expiryDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizePortugueseMobile(value) {
  let mobile = text(value, 40).replace(/\D/g, "");
  if (mobile.startsWith("00351")) mobile = mobile.slice(5);
  if (mobile.startsWith("351")) mobile = mobile.slice(3);
  if (!/^9\d{8}$/.test(mobile)) {
    throw new HttpsError("invalid-argument", "No campo Número de telefone, indique o telemóvel associado ao MB WAY: 9 algarismos começados por 9, com ou sem +351.");
  }
  return `351#${mobile}`;
}

async function ifthenpayRequest(url, payload) {
  const apiResponse = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responseText = await apiResponse.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { raw: responseText };
  }
  if (!apiResponse.ok) {
    throw new Error(`IFTHENPAY HTTP ${apiResponse.status}`);
  }
  return data;
}

function assertIfthenpayStatus(data, expectedField, expectedValue) {
  if (String(data?.[expectedField] ?? "") !== expectedValue) {
    throw new Error("Resposta IFTHENPAY não confirmada.");
  }
}

function emailFrame(title, intro, content) {
  return `<!doctype html><html><body style="margin:0;background:#050504;color:#f5efe3;font-family:Arial,sans-serif"><div style="max-width:680px;margin:auto;padding:34px"><div style="border:1px solid #8d691e;background:#0d0c09;padding:34px"><p style="margin:0 0 10px;color:#ddb64e;font-size:12px;letter-spacing:2px;text-transform:uppercase">Mystic Essence</p><h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:400;color:#f8e8b2">${title}</h1><p style="color:#c7beb0;line-height:1.6">${intro}</p>${content}<p style="margin:30px 0 0;padding-top:20px;border-top:1px solid #3b311d;color:#8f877b;font-size:12px">Mystic Essence · Santa Maria da Feira · +351 938 258 798</p></div></div></body></html>`;
}

function itemsHtml(items) {
  return `<table style="width:100%;border-collapse:collapse;margin-top:22px">${items.map((item) => `<tr><td style="padding:10px 0;border-bottom:1px solid #332a18">${html(item.qty)} × ${html(item.name?.pt || item.name)} <span style="color:#a99e8d">${html(item.volume)}</span></td><td style="padding:10px 0;border-bottom:1px solid #332a18;text-align:right">${currency.format(item.price * item.qty)}</td></tr>`).join("")}</table>`;
}

function billingHtml(order) {
  const billing = order.billing || {};
  return `<div style="margin-top:22px;padding:18px;border:1px solid #3b311d"><p style="margin:0 0 10px;color:#ddb64e;font-size:12px;letter-spacing:1.5px;text-transform:uppercase"><strong>Dados de faturação</strong></p><p style="margin:0;color:#c7beb0;line-height:1.7"><strong>Nome:</strong> ${html(billing.name || order.customer.name)}<br><strong>Morada:</strong> ${html(billing.address || `${order.customer.address}, ${order.customer.postal} ${order.customer.city}`)}<br><strong>NIF:</strong> ${html(billing.taxId || order.customer.taxId || "Não indicado")}</p></div>`;
}

function totalsHtml(order) {
  const discount = Number(order.discountAmount || 0);
  const couponDiscount = Number(order.couponDiscountAmount ?? (order.couponCode && !order.loyaltyRewardId ? discount : 0));
  const loyaltyDiscount = Number(order.loyaltyDiscountAmount || 0);
  const zone = normalizeShippingZone(order.shippingZone);
  const discountRows = [
    couponDiscount > 0 ? `<div><span>Desconto (${html(order.couponCode)})</span><strong style="float:right;color:#ddb64e">-${currency.format(couponDiscount)}</strong></div>` : "",
    loyaltyDiscount > 0 ? `<div><span>Recompensa (${html(order.loyaltyPointsSpent)} pontos)</span><strong style="float:right;color:#ddb64e">-${currency.format(loyaltyDiscount)}</strong></div>` : "",
  ].join("") || (discount > 0 ? `<div><span>Desconto</span><strong style="float:right;color:#ddb64e">-${currency.format(discount)}</strong></div>` : "");
  return `<div style="margin-top:20px;line-height:1.8;color:#c7beb0"><div><span>Subtotal</span><strong style="float:right;color:#f5efe3">${currency.format(order.subtotal)}</strong></div>${discountRows}<div><span>Zona de entrega</span><strong style="float:right;color:#f5efe3">${html(shippingZones[zone].label)}</strong></div>${order.shippingCarrierName ? `<div><span>Transportadora</span><strong style="float:right;color:#f5efe3">${html(order.shippingCarrierName)}</strong></div>${order.shippingDescription ? `<div>${html(order.shippingDescription)}</div>` : ""}` : ""}<div><span>Envio</span><strong style="float:right;color:#f5efe3">${order.shipping === 0 ? "Grátis" : currency.format(order.shipping)}</strong></div><div style="margin-top:8px;padding-top:8px;border-top:1px solid #3b311d;font-size:18px;color:#ddb64e"><span>Total</span><strong style="float:right">${currency.format(order.total)}</strong></div></div>`;
}

function loyaltyEmailHtml(order, audience) {
  const points = Math.max(0, Math.trunc(Number(order.loyaltyPointsSpent) || 0));
  if (!points) return "";
  const includesGift = order.loyaltyGift === true || points === 750;
  const title = audience === "owner" ? "Recompensa usada na encomenda" : "Recompensa de pontos confirmada";
  const giftMessage = audience === "owner"
    ? "INCLUIR 1 PERFUME SURPRESA DE OFERTA NA ENCOMENDA."
    : "A sua encomenda inclui 1 perfume surpresa de oferta.";
  return `<div style="margin-top:22px;padding:18px;border:${includesGift ? "2px" : "1px"} solid #ddb64e;background:${includesGift ? "#271d06" : "#15120b"};color:#f5efe3"><p style="margin:0 0 10px;color:#ddb64e;font-size:12px;letter-spacing:1.5px;text-transform:uppercase"><strong>${title}</strong></p><p style="margin:0;line-height:1.7"><strong>Pontos utilizados:</strong> ${html(points)}</p>${includesGift ? `<p style="margin:12px 0 0;color:#f8e8b2;line-height:1.6"><strong>${giftMessage}</strong></p>` : ""}</div>`;
}

function paymentInstructionsHtml(order) {
  const method = text(order.paymentMethod, 30).toLowerCase();
  if (method === "multibanco" && order.paymentEntity && order.paymentReference) {
    return `<div style="margin-top:22px;padding:18px;border:1px solid #8d691e"><p style="margin:0 0 12px;color:#ddb64e;font-size:12px;letter-spacing:1.5px;text-transform:uppercase"><strong>Pagamento por Multibanco</strong></p><p style="margin:0;color:#c7beb0;line-height:1.8"><strong>Entidade:</strong> ${html(order.paymentEntity)}<br><strong>Referência:</strong> ${html(order.paymentReference)}<br><strong>Montante:</strong> ${currency.format(order.total)}</p></div>`;
  }
  if (method === "payshop" && order.paymentReference) {
    return `<div style="margin-top:22px;padding:18px;border:1px solid #8d691e"><p style="margin:0 0 12px;color:#ddb64e;font-size:12px;letter-spacing:1.5px;text-transform:uppercase"><strong>Pagamento por Payshop</strong></p><p style="margin:0;color:#c7beb0;line-height:1.8"><strong>Referência:</strong> ${html(order.paymentReference)}<br><strong>Montante:</strong> ${currency.format(order.total)}</p></div>`;
  }
  if (method === "mbway") {
    return `<div style="margin-top:22px;padding:18px;border:1px solid #8d691e"><p style="margin:0 0 12px;color:#ddb64e;font-size:12px;letter-spacing:1.5px;text-transform:uppercase"><strong>Pagamento por MB WAY</strong></p><p style="margin:0;color:#c7beb0;line-height:1.7">Aprove o pedido de pagamento recebido no telemóvel associado ao número indicado na encomenda.</p></div>`;
  }
  if (method === "card") {
    return `<div style="margin-top:22px;padding:18px;border:1px solid #8d691e"><p style="margin:0 0 12px;color:#ddb64e;font-size:12px;letter-spacing:1.5px;text-transform:uppercase"><strong>Pagamento por cartão</strong></p><p style="margin:0;color:#c7beb0;line-height:1.7">O pagamento é concluído na página segura da IFTHENPAY.</p></div>`;
  }
  return "";
}

async function queueEmail(to, subject, htmlBody, id) {
  const message = { to: [to], message: { subject, html: htmlBody } };
  if (!id) {
    await db.collection("mail").add(message);
    return;
  }

  try {
    await db.collection("mail").doc(id).create(message);
  } catch (error) {
    if (error.code !== 6 && error.code !== "already-exists") throw error;
  }
}

function liveDiscount(product) {
  const discount = Number(product.discount || 0);
  if (!discount) return 0;
  if (product.promotionEndsAt && Date.parse(product.promotionEndsAt) <= Date.now()) return 0;
  return Math.min(95, Math.max(0, discount));
}

function couponPercentage(coupon) {
  const discount = Number(coupon?.discount);
  if (!Number.isInteger(discount) || discount < 1 || discount > 95) {
    throw new HttpsError("failed-precondition", "Este código promocional não está ativo.");
  }
  return discount;
}

async function createOrderRecord(request, paymentMode) {
  const { DEFAULT_SHIPPING_SETTINGS, normalizeShippingSettings, getShippingCarrier, getShippingCost } = await import("./shipping.mjs");
  const { loyaltyDiscountForSubtotal, loyaltyPointsForAmount, loyaltyRewardById, normalizeLoyaltyPoints } = await import("./loyalty.mjs");
  const input = request.data || {};
  const CHECKOUT_TERMS_VERSION = await validateTermsAcceptance(input);
  const customer = input.customer || {};
  const requestedBilling = input.billing || {};
  const requestedItems = Array.isArray(input.items) ? input.items : [];
  const shippingZone = normalizeShippingZone(input.shippingZone);
  if (!requestedItems.length) throw new HttpsError("invalid-argument", "O carrinho está vazio.");
  if (requestedItems.length > 50 || requestedItems.some((item) => !item || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
    throw new HttpsError("invalid-argument", "Quantidade inválida no carrinho.");
  }
  if (input.shippingZone !== undefined && !Object.prototype.hasOwnProperty.call(shippingZones, input.shippingZone)) {
    throw new HttpsError("invalid-argument", "Zona de entrega inválida.");
  }
  if (!text(customer.name) || !text(customer.email) || !text(customer.phone) || !text(customer.address) || !text(customer.postal) || !text(customer.city)) {
    throw new HttpsError("invalid-argument", "Preencha todos os dados de entrega.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(customer.email, 180))) throw new HttpsError("invalid-argument", "Indique um email válido.");
  validateDestination(shippingZone, customer.postal);
  const sameAsContact = requestedBilling.sameAsContact === true;
  if (!sameAsContact && (!text(requestedBilling.name) || !text(requestedBilling.address) || !text(requestedBilling.taxId))) {
    throw new HttpsError("invalid-argument", "Preencha todos os dados de faturação.");
  }

  const normalizedItems = requestedItems.map((requested) => ({
    productId: text(requested.productId, 120).replace(/^decant-/, "").split("--")[0],
    volume: text(requested.volume, 30),
    quantity: Math.min(99, Math.max(1, Math.trunc(Number(requested.quantity) || 1))),
  }));
  if (normalizedItems.some(item => !/^[A-Za-z0-9_-]{1,120}$/.test(item.productId))) throw new HttpsError("invalid-argument", "Produto inválido.");
  const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
  const couponCode = text(input.couponCode, 30).toUpperCase();
  const loyaltyRewardId = text(input.loyaltyRewardId, 30);
  const loyaltyReward = loyaltyRewardId ? loyaltyRewardById(loyaltyRewardId) : null;
  if (loyaltyRewardId && !loyaltyReward) throw new HttpsError("invalid-argument", "A recompensa selecionada não existe.");
  if (loyaltyReward && !request.auth) throw new HttpsError("unauthenticated", "Inicie sessão para usar os seus pontos.");
  const attemptId = text(input.attemptId, 80);
  if (!/^[a-f0-9-]{36}$/.test(attemptId)) throw new HttpsError("invalid-argument", "Atualize a página antes de iniciar o pagamento.");
  const attemptRef = db.collection("checkoutAttempts").doc(hash([request.auth?.uid || "guest", attemptId]));
  const fingerprint = hash({ ...input, attemptId: undefined });
  const orderId = `ME${randomUUID().replaceAll("-", "").slice(0, 13)}`.toUpperCase();
  const orderRef = db.collection("orders").doc(orderId);
  const order = await db.runTransaction(async (transaction) => {
    const attempt = await transaction.get(attemptRef);
    if (attempt.exists) {
      if (attempt.data().fingerprint !== fingerprint) throw new HttpsError("already-exists", "Este pedido já foi utilizado com outros dados.");
      const existing = await transaction.get(db.collection("orders").doc(attempt.data().orderId));
      return { ...existing.data(), existingOrderId: existing.id };
    }
    const availabilitySnapshot = await transaction.get(db.collection("settings").doc("decantAvailability"));
    const blockedSizes = normalizeBlockedDecantSizes(availabilitySnapshot.data()?.blockedSizes);
    const shippingSnapshot = await transaction.get(db.collection("settings").doc("shipping"));
    const shippingSettings = shippingSnapshot.exists ? normalizeShippingSettings(shippingSnapshot.data().zones) : DEFAULT_SHIPPING_SETTINGS;
    if (!shippingSettings) {
      throw new HttpsError("failed-precondition", "Os portes estão indisponíveis. Contacte a loja.");
    }
    const carrier = getShippingCarrier(shippingZone, shippingSettings, input.shippingCarrierId);
    if (!carrier) throw new HttpsError("failed-precondition", "A transportadora selecionada já não está disponível nesta zona. Reveja a entrega.");
    const productRefs = productIds.map((id) => db.collection("products").doc(id));
    const decantRefs = productIds.map((id) => db.collection("products").doc(`decant-${id}`));
    const couponRef = couponCode ? db.collection("coupons").doc(couponCode) : null;
    const loyaltyProfileRef = loyaltyReward ? db.collection("profiles").doc(request.auth.uid) : null;
    const loyaltyRedemptionRef = loyaltyReward ? loyaltyProfileRef.collection("loyaltyHistory").doc(`redeem-${orderId}`) : null;
    const reads = [...productRefs, ...decantRefs, ...(couponRef ? [couponRef] : []), ...(loyaltyProfileRef ? [loyaltyProfileRef] : [])];
    const snapshots = await Promise.all(reads.map((ref) => transaction.get(ref)));
    const productSnapshots = snapshots.slice(0, productRefs.length);
    const decantSnapshots = snapshots.slice(productRefs.length, productRefs.length + decantRefs.length);
    const couponSnapshot = couponRef ? snapshots[productRefs.length + decantRefs.length] : null;
    const loyaltyProfileSnapshot = loyaltyProfileRef ? snapshots[snapshots.length - 1] : null;
    const products = new Map();

    productSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) throw new HttpsError("failed-precondition", `Produto indisponível: ${productIds[index]}`);
      products.set(productIds[index], snapshot.data());
    });

    let couponDiscount = 0;
    if (couponCode) {
      if (!couponSnapshot?.exists) throw new HttpsError("invalid-argument", "O código promocional é inválido ou já não existe.");
      couponDiscount = couponPercentage(couponSnapshot.data());
    }

    const requestedByVariant = new Map();
    normalizedItems.forEach((item) => {
      const key = `${item.productId}::${item.volume}`;
      requestedByVariant.set(key, (requestedByVariant.get(key) || 0) + item.quantity);
    });

    const items = normalizedItems.map((requested) => {
      const product = products.get(requested.productId);
      const variant = (product.variants || []).find((entry) => entry.volume === requested.volume);
      const productName = product.name?.pt || product.name || requested.productId;
      if (!variant) throw new HttpsError("invalid-argument", `Tamanho inválido para ${productName}.`);
      if (variantUnavailable(product, variant, blockedSizes)) {
        throw new HttpsError("failed-precondition", `${productName} ${requested.volume} está esgotado.`);
      }
      const totalRequested = requestedByVariant.get(`${requested.productId}::${requested.volume}`) || requested.quantity;
      if (totalRequested > 99) throw new HttpsError("invalid-argument", "Limite de 99 unidades por tamanho.");
      if (typeof variant.stock === "number" && variant.stock < totalRequested) {
        throw new HttpsError("failed-precondition", `Restam apenas ${Math.max(0, variant.stock)} unidade(s) de ${productName} ${requested.volume}.`);
      }
      const discount = variant.isDecant ? 0 : liveDiscount(product);
      if (!Number.isFinite(variant.price) || variant.price <= 0) {
        throw new HttpsError("failed-precondition", "O preço deste produto é inválido. Contacte a loja.");
      }
      const unitPrice = Math.round(Number(variant.price) * (1 - discount / 100) * 100) / 100;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new HttpsError("failed-precondition", "O preço promocional é inválido.");
      return {
        id: `${requested.productId}--${requested.volume.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        productId: requested.productId,
        name: product.name,
        brand: product.brand,
        volume: requested.volume,
        qty: requested.quantity,
        price: unitPrice,
        lineTotal: Math.round(unitPrice * requested.quantity * 100) / 100,
        imageUrl: product.imageUrl || null,
      };
    });

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const shipping = getShippingCost(subtotal, shippingZone, shippingSettings, carrier.id);
    // Reject an outdated quote before reserving stock or starting a payment.
    if (input.expectedShipping !== undefined && input.expectedShipping !== shipping) {
      throw new HttpsError("failed-precondition", "Os portes foram atualizados. Reveja o total antes de confirmar a encomenda.");
    }

    let loyaltyPointsSpent = 0;
    let loyaltyDiscountAmount = 0;
    if (loyaltyReward) {
      if (!loyaltyProfileSnapshot?.exists) throw new HttpsError("failed-precondition", "O perfil da sua conta ainda não está disponível.");
      const loyaltyPoints = normalizeLoyaltyPoints(loyaltyProfileSnapshot.data().loyaltyPoints);
      if (loyaltyPoints < loyaltyReward.points) throw new HttpsError("failed-precondition", "Já não tem pontos suficientes para esta recompensa.");
      if (loyaltyReward.kind === "fixed" && subtotal < loyaltyReward.value) {
        throw new HttpsError("failed-precondition", "O valor dos produtos é inferior ao desconto desta recompensa.");
      }
      loyaltyPointsSpent = loyaltyReward.points;
      loyaltyDiscountAmount = loyaltyDiscountForSubtotal(loyaltyReward, subtotal);
    }

    productIds.forEach((productId, index) => {
      const product = products.get(productId);
      const variants = (product.variants || []).map((variant) => {
        const requestedQuantity = requestedByVariant.get(`${productId}::${variant.volume}`) || 0;
        if (!requestedQuantity || typeof variant.stock !== "number") return variant;
        const stock = Math.max(0, Math.trunc(variant.stock) - requestedQuantity);
        return { ...variant, stock };
      });
      transaction.update(productRefs[index], { variants, updatedAt: new Date().toISOString() });

      const decantSnapshot = decantSnapshots[index];
      if (decantSnapshot?.exists) {
        const decantVariants = variants.filter((variant) => variant.isDecant);
        const firstAvailable = decantVariants.find((variant) => !variant.soldout && variant.stock !== 0) || decantVariants[0];
        transaction.update(decantRefs[index], {
          variants: decantVariants,
          tag: decantVariants.length && decantVariants.every((variant) => variant.soldout || variant.stock === 0) ? "soldout" : "stock",
          ...(firstAvailable ? { price: firstAvailable.price, volume: firstAvailable.volume } : {}),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    const couponDiscountAmount = Math.round(subtotal * couponDiscount) / 100;
    const discountAmount = Math.round(Math.min(subtotal, couponDiscountAmount + loyaltyDiscountAmount) * 100) / 100;
    const total = Math.round((subtotal - discountAmount + shipping) * 100) / 100;
    const now = new Date().toISOString();
    const orderItems = loyaltyReward?.gift ? [...items, {
      id: "loyalty-surprise-perfume",
      productId: null,
      name: { pt: "Perfume surpresa — oferta", en: "Surprise perfume — gift" },
      brand: "Mystic Essence",
      volume: "Oferta",
      qty: 1,
      price: 0,
      lineTotal: 0,
      loyaltyGift: true,
    }] : items;
    const nextOrder = {
      customerUid: request.auth?.uid || null,
      customer: {
        name: text(customer.name, 120), email: text(customer.email, 180).toLowerCase(), phone: text(customer.phone, 40),
        address: text(customer.address, 220), postal: text(customer.postal, 20), city: text(customer.city, 100), taxId: text(customer.taxId, 9), notes: text(customer.notes, 1000),
      },
      billing: {
        sameAsContact,
        name: sameAsContact ? text(customer.name, 120) : text(requestedBilling.name, 120),
        address: sameAsContact
          ? `${text(customer.address, 220)}, ${text(customer.postal, 20)} ${text(customer.city, 100)}`
          : text(requestedBilling.address, 300),
        taxId: sameAsContact ? text(customer.taxId, 9) : text(requestedBilling.taxId, 9),
      },
      items: orderItems,
      subtotal,
      shipping,
      shippingZone,
      shippingCarrierId: carrier.id,
      shippingCarrierName: carrier.name,
      shippingDescription: carrier.description,
      couponCode: couponCode || null,
      influencerUid: couponSnapshot?.data()?.influencerUid || null,
      discount: couponDiscount,
      couponDiscountAmount,
      discountAmount,
      loyaltyRewardId: loyaltyReward?.id || null,
      loyaltyPointsSpent,
      loyaltyDiscountAmount,
      loyaltyGift: loyaltyReward?.gift === true,
      loyaltyPointsToEarn: request.auth ? loyaltyPointsForAmount(subtotal - discountAmount) : 0,
      termsAccepted: true,
      termsVersion: CHECKOUT_TERMS_VERSION,
      termsAcceptedAt: now,
      total,
      payment: paymentMode === "ifthenpay" ? "ifthenpay" : text(input.paymentMethod, 30) || "pending",
      paymentMethod: text(input.paymentMethod, 30) || "gateway",
      paymentStatus: "pending",
      inventoryReservationVersion: 2,
      nextReconcileAt: new Date(Date.now() + 5 * 60000).toISOString(),
      paymentInitiated: paymentMode !== "ifthenpay",
      checkoutMode: paymentMode,
      status: "received",
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    if (loyaltyReward && loyaltyProfileRef && loyaltyRedemptionRef) {
      const availablePoints = normalizeLoyaltyPoints(loyaltyProfileSnapshot.data().loyaltyPoints);
      transaction.set(loyaltyProfileRef, { loyaltyPoints: availablePoints - loyaltyReward.points, loyaltyUpdatedAt: now }, { merge: true });
      transaction.create(loyaltyRedemptionRef, {
        customerUid: request.auth.uid,
        orderId,
        kind: "redeem",
        status: "reserved",
        points: -loyaltyReward.points,
        rewardId: loyaltyReward.id,
        discountAmount: loyaltyDiscountAmount,
        gift: loyaltyReward.gift === true,
        createdAt: now,
      });
    }
    transaction.set(orderRef, nextOrder);
    transaction.create(attemptRef, { orderId, fingerprint, createdAt: now });
    return nextOrder;
  });
  const total = order.total;

  return { input, orderId: order.existingOrderId || orderId, order, total, replay: Boolean(order.existingOrderId) };
}

async function validateTermsAcceptance(input) {
  const { CHECKOUT_TERMS_VERSION } = await import("./legal.mjs");
  if (input.termsAccepted !== true) throw new HttpsError("invalid-argument", "Aceite os Termos e Condições antes de continuar.");
  if (text(input.termsVersion, 40) !== CHECKOUT_TERMS_VERSION) {
    throw new HttpsError("failed-precondition", "Os Termos e Condições foram atualizados. Recarregue a página, leia a nova versão e confirme novamente.");
  }
  return CHECKOUT_TERMS_VERSION;
}

async function restoreReservedInventory(orderId, order, evidence) {
  if (!evidence) throw new Error("Provider cancellation evidence required");
  const requestedByProduct = new Map();
  (order.items || []).forEach((item) => {
    if (item.loyaltyGift) return;
    const productId = text(item.productId || item.id, 120).replace(/^decant-/, "").split("--")[0];
    if (!productId) return;
    if (!requestedByProduct.has(productId)) requestedByProduct.set(productId, new Map());
    const variants = requestedByProduct.get(productId);
    variants.set(item.volume, (variants.get(item.volume) || 0) + Math.max(1, Math.trunc(Number(item.qty) || 1)));
  });

  await db.runTransaction(async (transaction) => {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists || orderSnapshot.data().inventoryRestoredAt || orderSnapshot.data().paymentStatus === "paid") return;
    const freshOrder = orderSnapshot.data();

    const productsToRestore = [...requestedByProduct.entries()].map(([productId, requestedVariants]) => ({
      productId,
      requestedVariants,
      productRef: db.collection("products").doc(productId),
      decantRef: db.collection("products").doc(`decant-${productId}`),
    }));
    const loyaltyPointsSpent = Math.max(0, Math.trunc(Number(freshOrder.loyaltyPointsSpent) || 0));
    const loyaltyProfileRef = loyaltyPointsSpent && freshOrder.customerUid ? db.collection("profiles").doc(freshOrder.customerUid) : null;
    const loyaltyRedemptionRef = loyaltyProfileRef ? loyaltyProfileRef.collection("loyaltyHistory").doc(`redeem-${orderId}`) : null;
    const loyaltyReleaseRef = loyaltyProfileRef ? loyaltyProfileRef.collection("loyaltyHistory").doc(`release-${orderId}`) : null;
    const inventoryRefs = productsToRestore.flatMap((entry) => [
      entry.productRef,
      entry.decantRef,
    ]);
    const allSnapshots = await Promise.all([...inventoryRefs, ...(
      loyaltyProfileRef && loyaltyRedemptionRef && loyaltyReleaseRef
        ? [loyaltyProfileRef, loyaltyRedemptionRef, loyaltyReleaseRef]
        : []
    )].map((ref) => transaction.get(ref)));
    const inventorySnapshots = allSnapshots.slice(0, inventoryRefs.length);
    const loyaltyProfileSnapshot = loyaltyProfileRef ? allSnapshots[inventoryRefs.length] : null;
    const loyaltyRedemptionSnapshot = loyaltyRedemptionRef ? allSnapshots[inventoryRefs.length + 1] : null;
    const loyaltyReleaseSnapshot = loyaltyReleaseRef ? allSnapshots[inventoryRefs.length + 2] : null;

    productsToRestore.forEach(({ requestedVariants, productRef, decantRef }, index) => {
      const productSnapshot = inventorySnapshots[index * 2];
      const decantSnapshot = inventorySnapshots[index * 2 + 1];
      if (!productSnapshot.exists) return;
      const product = productSnapshot.data();
      const variants = (product.variants || []).map((variant) => {
        const quantity = requestedVariants.get(variant.volume) || 0;
        if (!quantity || typeof variant.stock !== "number") return variant;
        const stock = Math.max(0, Math.trunc(variant.stock)) + quantity;
        return { ...variant, stock, soldout: order.inventoryReservationVersion === 2 ? Boolean(variant.soldout) : variant.stock === 0 ? false : Boolean(variant.soldout) };
      });
      transaction.update(productRef, { variants, updatedAt: new Date().toISOString() });

      if (decantSnapshot.exists) {
        const decantVariants = variants.filter((variant) => variant.isDecant);
        const firstAvailable = decantVariants.find((variant) => !variant.soldout && variant.stock !== 0) || decantVariants[0];
        transaction.update(decantRef, {
          variants: decantVariants,
          tag: decantVariants.every(variant => variant.soldout || variant.stock === 0) ? "soldout" : "stock",
          ...(firstAvailable ? { price: firstAvailable.price, volume: firstAvailable.volume } : {}),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    if (loyaltyProfileRef && loyaltyRedemptionRef && loyaltyReleaseRef && !loyaltyReleaseSnapshot?.exists) {
      const currentPoints = Math.max(0, Math.trunc(Number(loyaltyProfileSnapshot?.data()?.loyaltyPoints) || 0));
      const now = new Date().toISOString();
      transaction.set(loyaltyProfileRef, { loyaltyPoints: currentPoints + loyaltyPointsSpent, loyaltyUpdatedAt: now }, { merge: true });
      if (loyaltyRedemptionSnapshot?.exists) transaction.update(loyaltyRedemptionRef, { status: "released", releasedAt: now });
      transaction.create(loyaltyReleaseRef, {
        customerUid: freshOrder.customerUid,
        orderId,
        kind: "release",
        status: "completed",
        points: loyaltyPointsSpent,
        rewardId: freshOrder.loyaltyRewardId || null,
        createdAt: now,
      });
    }

    transaction.update(orderRef, { inventoryRestoredAt: new Date().toISOString(), paymentStatus: "failed", reconciliationEvidence: evidence, reconciliationRequired: false, nextReconcileAt: FieldValue.delete() });
  });
}

exports.createPendingOrder = onCall({ region }, async () => {
  throw new HttpsError("failed-precondition", "Os pagamentos não estão disponíveis. Nenhuma encomenda foi criada.");
});

async function reconcilePayment(orderId) {
  const ref = db.collection("orders").doc(orderId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Pagamento não encontrado.");
  const order = snapshot.data();
  if (order.paymentStatus !== "pending") return { status: order.paymentStatus };
  if (order.paymentMethod !== "mbway" || !order.paymentRequestId) {
    await ref.update({ reconciliationRequired: true, nextReconcileAt: new Date(Date.now() + 86400000).toISOString() });
    return { status: "manual-review" };
  }
  const url = new URL("https://api.ifthenpay.com/spg/payment/mbway/status");
  url.searchParams.set("mbWayKey", ifthenpayMbwayKey.value());
  url.searchParams.set("requestId", order.paymentRequestId);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new HttpsError("unavailable", "O prestador de pagamentos não respondeu. O stock continua reservado.");
  const data = await response.json();
  if (data.RequestId !== order.paymentRequestId) throw new HttpsError("unavailable", "Não foi possível confirmar a referência do pagamento.");
  const status = String(data.Status);
  if (["020", "101", "122"].includes(status)) {
    await restoreReservedInventory(orderId, order, { source: "ifthenpay-status", status, checkedAt: new Date().toISOString() });
  } else if (status === "000") {
    await db.runTransaction(async transaction => {
      const fresh = (await transaction.get(ref)).data();
      if (fresh.paymentStatus === "paid") return;
      if (fresh.inventoryRestoredAt || fresh.paymentStatus !== "pending") {
        transaction.update(ref, { reconciliationRequired: true, latePaymentReceivedAt: new Date().toISOString() });
        return;
      }
      const now = new Date().toISOString();
      transaction.update(ref, { paymentStatus: "paid", paidAt: now, updatedAt: now, reconciliationRequired: false, nextReconcileAt: FieldValue.delete(), transactionId: order.paymentRequestId });
    });
  } else {
    await ref.update({ nextReconcileAt: new Date(Date.now() + 3600000).toISOString(), reconciliationRequired: true });
  }
  return { status: (await ref.get()).data().paymentStatus };
}

exports.reconcilePayment = onCall({ ...callableOptions, secrets: [ifthenpayMbwayKey] }, async request => {
  requireAdmin(request);
  const orderId = text(request.data?.orderId, 15);
  if (!/^[A-Za-z0-9_-]{1,15}$/.test(orderId)) throw new HttpsError("invalid-argument", "Pagamento inválido.");
  await rateLimit(db, request, "reconcile");
  return reconcilePayment(orderId);
});

exports.releaseCancelledPayment = onCall(callableOptions, async request => {
  requireAdmin(request);
  const orderId = text(request.data?.orderId, 15);
  const evidence = text(request.data?.evidence, 500);
  if (!/^[A-Za-z0-9_-]{1,15}$/.test(orderId) || evidence.length < 15 || request.data?.providerCancellationConfirmed !== true) {
    throw new HttpsError("invalid-argument", "Confirme a anulação definitiva no prestador e indique a referência de comprovativo.");
  }
  const ref = db.collection("orders").doc(orderId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Pagamento não encontrado.");
  await restoreReservedInventory(orderId, snapshot.data(), { source: "admin-provider-cancellation", evidence, uid: request.auth.uid, checkedAt: new Date().toISOString() });
  return { status: (await ref.get()).data().paymentStatus };
});

exports.reconcilePendingPayments = onSchedule({ schedule: "every 5 minutes", region, secrets: [ifthenpayMbwayKey], timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const orders = await db.collection("orders").where("nextReconcileAt", "<=", new Date().toISOString()).orderBy("nextReconcileAt").limit(20).get();
  for (const snapshot of orders.docs) {
    try {
      if (snapshot.data().paymentStatus !== "pending") await snapshot.ref.update({ nextReconcileAt: FieldValue.delete() });
      else await reconcilePayment(snapshot.id);
    } catch {
      await snapshot.ref.update({ reconciliationRequired: true, nextReconcileAt: new Date(Date.now() + 3600000).toISOString() });
      console.error("Payment reconciliation postponed", { orderId: snapshot.id });
    }
  }
  const expiredLimits = await db.collection("requestLimits").where("expiresAt", "<", new Date()).limit(400).get();
  if (!expiredLimits.empty) {
    const batch = db.batch();
    expiredLimits.docs.forEach(snapshot => batch.delete(snapshot.ref));
    await batch.commit();
  }
});

exports.applyDecantPricing = onCall({ ...callableOptions, timeoutSeconds: 120 }, async request => {
  requireAdmin(request);
  const { isValidDecantPricing, applyDecantPricing } = require("./decant-pricing.mjs");
  const rules = request.data?.rules;
  if (!isValidDecantPricing(rules) || rules.some(rule => rule.price <= 0)) throw new HttpsError("invalid-argument", "Preços dos decants inválidos.");
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(db.collection("products"));
    // Refuse oversized catalogues before writing anything; never silently split a financial update.
    if (snapshot.size > 450) throw new HttpsError("failed-precondition", "O catálogo excede o limite de atualização atómica (450 produtos). Nenhum preço foi alterado.");
    let count = 0;
    for (const document of snapshot.docs) {
      const product = document.data();
      if (product.isDecant || document.id.startsWith("decant-")) continue;
      const updated = applyDecantPricing(product, rules);
      if (!Array.isArray(updated.variants)) continue;
      transaction.update(document.ref, { variants: updated.variants, updatedAt: new Date().toISOString() });
      const decants = updated.variants.filter(variant => variant.isDecant);
      const decantDoc = snapshot.docs.find(entry => entry.id === `decant-${document.id}`);
      if (decantDoc && decants.length) {
        const first = decants.find(variant => !variant.soldout && variant.stock !== 0) || decants[0];
        transaction.update(decantDoc.ref, { variants: decants, price: first.price, volume: first.volume, updatedAt: new Date().toISOString() });
      }
      count++;
    }
    transaction.set(db.collection("settings").doc("decants"), { rules, updatedAt: new Date().toISOString() });
    return { count };
  });
});

exports.validateCoupon = onCall(callableOptions, async (request) => {
  const code = text(request.data?.code, 30).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpsError("invalid-argument", "Código promocional inválido.");
  await rateLimit(db, request, "coupon");
  const snapshot = await db.collection("coupons").doc(code).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Cupão não encontrado.");
  const discount = couponPercentage(snapshot.data());
  return { code, discount };
});

exports.setInfluencerAccount = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const uid = text(request.data?.uid, 128);
  const isInfluencer = request.data?.isInfluencer === true;
  const couponCode = text(request.data?.couponCode, 30).toUpperCase();
  if (!uid) throw new HttpsError("invalid-argument", "Conta inválida.");
  if (isInfluencer && !/^[A-Z0-9_-]{3,30}$/.test(couponCode)) {
    throw new HttpsError("invalid-argument", "Associe um cupão válido à influencer.");
  }

  const profileRef = db.collection("profiles").doc(uid);
  const selectedCouponRef = isInfluencer ? db.collection("coupons").doc(couponCode) : null;
  await db.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    if (!profileSnapshot.exists) throw new HttpsError("not-found", "Esta conta já não existe.");
    const profile = profileSnapshot.data();
    const previousCouponCode = text(profile.influencerCouponCode, 30).toUpperCase();
    const previousCouponRef = previousCouponCode && previousCouponCode !== couponCode
      ? db.collection("coupons").doc(previousCouponCode)
      : null;
    const selectedCouponSnapshot = selectedCouponRef ? await transaction.get(selectedCouponRef) : null;
    const previousCouponSnapshot = previousCouponRef ? await transaction.get(previousCouponRef) : null;

    if (selectedCouponRef && !selectedCouponSnapshot?.exists) {
      throw new HttpsError("not-found", "O cupão selecionado já não existe.");
    }
    const assignedUid = text(selectedCouponSnapshot?.data()?.influencerUid, 128);
    if (assignedUid && assignedUid !== uid) {
      throw new HttpsError("already-exists", "Este cupão já está associado a outra influencer.");
    }

    const now = new Date().toISOString();
    transaction.set(profileRef, {
      isInfluencer,
      influencerCouponCode: isInfluencer ? couponCode : FieldValue.delete(),
      influencerUpdatedAt: now,
    }, { merge: true });

    if (previousCouponRef && previousCouponSnapshot?.exists && text(previousCouponSnapshot.data().influencerUid, 128) === uid) {
      transaction.set(previousCouponRef, {
        influencerUid: FieldValue.delete(),
        influencerEmail: FieldValue.delete(),
        influencerName: FieldValue.delete(),
        updatedAt: now,
      }, { merge: true });
    }
    if (selectedCouponRef) {
      transaction.set(selectedCouponRef, {
        influencerUid: uid,
        influencerEmail: text(profile.email, 180).toLowerCase(),
        influencerName: text(profile.name, 120),
        updatedAt: now,
      }, { merge: true });
    }
  });

  return { uid, isInfluencer, couponCode: isInfluencer ? couponCode : null };
});

exports.grantLoyaltyPoints = onCall(callableOptions, async (request) => {
  requireAdmin(request);
  const { normalizeLoyaltyPoints } = await import("./loyalty.mjs");
  const uid = text(request.data?.uid, 128);
  const points = Number(request.data?.points);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError("invalid-argument", "Conta inválida.");
  if (!Number.isInteger(points) || points < 1 || points > 1000000) {
    throw new HttpsError("invalid-argument", "Indique uma quantidade inteira entre 1 e 1 000 000 pontos.");
  }

  const profileRef = db.collection("profiles").doc(uid);
  const historyRef = profileRef.collection("loyaltyHistory").doc(`admin-${randomUUID()}`);
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    if (!profileSnapshot.exists) throw new HttpsError("not-found", "Esta conta já não existe.");
    const balance = normalizeLoyaltyPoints(profileSnapshot.data().loyaltyPoints) + points;
    transaction.set(profileRef, { loyaltyPoints: balance, loyaltyUpdatedAt: now }, { merge: true });
    transaction.create(historyRef, {
      customerUid: uid,
      kind: "admin_grant",
      status: "completed",
      points,
      note: "Adicionados manualmente pela Mystic Essence",
      adminUid: request.auth.uid,
      createdAt: now,
    });
    return { uid, points, balance };
  });
});

exports.submitReview = onCall(callableOptions, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicie sessão para avaliar este produto.");

  const productId = text(request.data?.productId, 120).replace(/^decant-/, "").split("--")[0];
  const rating = Number(request.data?.rating);
  const comment = text(request.data?.comment, 1000);
  if (!productId) throw new HttpsError("invalid-argument", "Produto inválido.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpsError("invalid-argument", "Escolha uma classificação entre 1 e 5 estrelas.");
  if (comment.length < 10) throw new HttpsError("invalid-argument", "O comentário deve ter pelo menos 10 caracteres.");

  const [productSnapshot, ordersSnapshot] = await Promise.all([
    db.collection("products").doc(productId).get(),
    db.collection("orders").where("customerUid", "==", request.auth.uid).get(),
  ]);
  if (!productSnapshot.exists) throw new HttpsError("not-found", "Este produto já não está disponível.");

  const deliveredOrder = ordersSnapshot.docs.find((orderDocument) => {
    const order = orderDocument.data();
    if (order.status !== "delivered" || order.paymentStatus !== "paid") return false;
    return Array.isArray(order.items) && order.items.some((item) => {
      const orderedProductId = text(item.productId || item.id, 120).replace(/^decant-/, "").split("--")[0];
      return orderedProductId === productId;
    });
  });
  if (!deliveredOrder) {
    throw new HttpsError("permission-denied", "Só pode avaliar um produto depois de a encomenda ter sido entregue.");
  }

  const reviewId = createHash("sha256").update(`${request.auth.uid}:${productId}`).digest("hex").slice(0, 40);
  const reviewRef = db.collection("reviews").doc(reviewId);
  const previousReview = await reviewRef.get();
  const now = new Date().toISOString();
  const customerName = text(request.auth.token.name || request.auth.token.email?.split("@")[0] || "Cliente verificado", 80);
  await reviewRef.set({
    productId,
    rating,
    comment,
    customerName,
    verifiedPurchase: true,
    createdAt: previousReview.exists ? previousReview.data().createdAt : now,
    updatedAt: now,
  });

  return { reviewId };
});

exports.subscribeToRestock = onCall(callableOptions, async (request) => {
  const productId = text(request.data?.productId, 120).replace(/^decant-/, "").split("--")[0];
  const volume = text(request.data?.volume, 30);
  const email = text(request.data?.email, 180).toLowerCase();
  const language = request.data?.lang === "en" ? "en" : "pt";
  if (!productId || !volume) throw new HttpsError("invalid-argument", "Produto ou tamanho inválido.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "Indique um email válido.");
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicie sessão para receber avisos de disponibilidade.");
  if (request.auth.token.email_verified !== true || email !== text(request.auth.token.email, 180).toLowerCase()) {
    throw new HttpsError("permission-denied", "Confirme o email da sua conta antes de pedir este aviso.");
  }
  await rateLimit(db, request, "restock", [`email:${email}`]);

  const productSnapshot = await db.collection("products").doc(productId).get();
  if (!productSnapshot.exists) throw new HttpsError("not-found", "Este produto já não existe.");
  const product = productSnapshot.data();
  const variant = Array.isArray(product.variants) ? product.variants.find((item) => text(item.volume, 30) === volume) : null;
  if (!variant) throw new HttpsError("not-found", "Este tamanho já não existe.");
  const availability = await db.collection("settings").doc("decantAvailability").get();
  const blockedSizes = normalizeBlockedDecantSizes(availability.data()?.blockedSizes);
  if (!variantUnavailable(product, variant, blockedSizes)) throw new HttpsError("failed-precondition", "Este tamanho já está disponível.");

  const subscriptionId = createHash("sha256").update(`${productId}:${volume}:${email}`).digest("hex").slice(0, 48);
  await db.collection("restockSubscriptions").doc(subscriptionId).set({
    productId,
    productName: text(product.name?.pt || product.name?.en || productId, 160),
    volume,
    email,
    language,
    active: true,
    verifiedEmail: true,
    customerUid: request.auth.uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return { subscriptionId };
});

exports.createCheckout = onCall({
  ...callableOptions,
  secrets: [ifthenpayMbKey, ifthenpayMbwayKey, ifthenpayPayshopKey, ifthenpayCardKey],
}, async (request) => {
  await validateTermsAcceptance(request.data || {});
  const paymentMethod = text(request.data?.paymentMethod, 30).toLowerCase();
  if (!['mbway', 'multibanco', 'payshop', 'card'].includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Escolha um método de pagamento válido.");
  }

  // Validate before creating the order or reserving inventory.
  const mbwayMobile = paymentMethod === "mbway"
    ? normalizePortugueseMobile(request.data?.customer?.phone)
    : null;
  await rateLimit(db, request, "checkout", [`email:${text(request.data?.customer?.email, 180).toLowerCase()}`, `phone:${text(request.data?.customer?.phone, 40).replace(/\D/g, "").slice(-9)}`]);
  const { input, orderId, order, total, replay } = await createOrderRecord(request, "ifthenpay");
  if (replay) {
    if (order.paymentStatus === "paid") throw new HttpsError("already-exists", "Este pagamento já foi confirmado. Consulte a sua conta.");
    if (order.checkoutResult && order.paymentStatus === "pending") return order.checkoutResult;
    throw new HttpsError("failed-precondition", "O pedido já existe e está a ser verificado. Não repita o pagamento; contacte a loja.");
  }
  const formattedAmount = amount(total);
  const language = input.lang === "en" ? "en" : "pt";
  const baseUrl = publicSiteUrl.value().replace(/\/$/, "");
  let payment;

  try {
    if (paymentMethod === "multibanco") {
      const data = await ifthenpayRequest("https://api.ifthenpay.com/multibanco/reference/init", {
        mbKey: ifthenpayMbKey.value(),
        orderId,
        amount: formattedAmount,
        description: `Mystic Essence ${orderId}`,
        expiryDays: 3,
      });
      assertIfthenpayStatus(data, "Status", "0");
      payment = {
        method: paymentMethod,
        entity: text(data.Entity, 20),
        reference: text(data.Reference, 30),
        requestId: text(data.RequestId, 200),
        expiresAt: expiryDate(3),
      };
    } else if (paymentMethod === "mbway") {
      const data = await ifthenpayRequest("https://api.ifthenpay.com/spg/payment/mbway", {
        mbWayKey: ifthenpayMbwayKey.value(),
        orderId,
        amount: formattedAmount,
        mobileNumber: mbwayMobile,
        email: order.customer.email,
        description: `Mystic Essence ${orderId}`,
      });
      assertIfthenpayStatus(data, "Status", "000");
      payment = {
        method: paymentMethod,
        requestId: text(data.RequestId, 200),
        message: language === "en"
          ? "Approve the MB WAY notification on your phone within four minutes."
          : "Aprove a notificação MB WAY no seu telemóvel nos próximos quatro minutos.",
      };
    } else if (paymentMethod === "payshop") {
      const data = await ifthenpayRequest("https://api.ifthenpay.com/payshop/reference", {
        payshopkey: ifthenpayPayshopKey.value(),
        id: orderId,
        valor: formattedAmount,
        validade: expiryDate(3),
      });
      assertIfthenpayStatus(data, "Code", "0");
      payment = {
        method: paymentMethod,
        reference: text(data.Reference, 30),
        requestId: text(data.RequestId, 200),
        expiresAt: expiryDate(3),
      };
    } else {
      const data = await ifthenpayRequest(`https://api.ifthenpay.com/creditcard/init/${ifthenpayCardKey.value()}`, {
        orderId,
        amount: formattedAmount,
        successUrl: `${baseUrl}/checkout?payment=success&order=${encodeURIComponent(orderId)}`,
        errorUrl: `${baseUrl}/checkout?payment=error&order=${encodeURIComponent(orderId)}`,
        cancelUrl: `${baseUrl}/checkout?payment=cancelled&order=${encodeURIComponent(orderId)}`,
        language,
      });
      assertIfthenpayStatus(data, "Status", "0");
      payment = {
        method: paymentMethod,
        paymentUrl: text(data.PaymentUrl, 2000),
        requestId: text(data.RequestId, 200),
      };
      if (!payment.paymentUrl) throw new Error("A IFTHENPAY não devolveu a página segura de pagamento.");
      const destination = new URL(payment.paymentUrl);
      if (destination.protocol !== "https:" || destination.username || destination.password || !["ifthenpay.com", "credorax.net"].some(host => destination.hostname === host || destination.hostname.endsWith(`.${host}`))) {
        throw new Error("Destino de pagamento inválido.");
      }
    }

    await db.collection("orders").doc(orderId).update({
      paymentMethod,
      paymentProvider: "ifthenpay",
      paymentInitiated: true,
      paymentInitiatedAt: new Date().toISOString(),
      paymentUrl: payment.paymentUrl || null,
      paymentEntity: payment.entity || null,
      paymentReference: payment.reference || null,
      paymentRequestId: payment.requestId || null,
      paymentExpiresAt: payment.expiresAt || null,
      checkoutResult: { orderId, amount: total, paymentStatus: "pending", ...payment },
      updatedAt: new Date().toISOString(),
    });
    return { orderId, amount: total, paymentStatus: "pending", ...payment };
  } catch (error) {
    // A timeout, invalid response or database failure does not prove that no payment exists.
    await db.runTransaction(async transaction => {
      const ref = db.collection("orders").doc(orderId);
      const snapshot = await transaction.get(ref);
      if (snapshot.data()?.paymentStatus === "paid") return;
      transaction.update(ref, {
        reconciliationRequired: true,
        paymentError: "Não foi possível confirmar a criação do pagamento com o prestador.",
        updatedAt: new Date().toISOString(),
      });
    });
    console.error("IFTHENPAY payment initiation requires reconciliation", { orderId, paymentMethod });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", `O pagamento ${orderId} está por verificar. Não volte a pagar; contacte a loja indicando este número.`);
  }
});

exports.ifthenpayCallback = onRequest({ region, secrets: [callbackKey] }, async (request, response) => {
  const input = { ...request.query, ...request.body };
  const suppliedKey = text(input.antiPhishingKey || input.anti_phishing_key || input.key, 200);
  const expectedKey = Buffer.from(callbackKey.value());
  const receivedKey = Buffer.from(suppliedKey);
  if (!suppliedKey || receivedKey.length !== expectedKey.length || !timingSafeEqual(receivedKey, expectedKey)) return response.status(403).send("forbidden");
  const orderId = text(input.orderId || input.order_id || input.id, 15);
  if (!/^[A-Za-z0-9_-]{1,15}$/.test(orderId)) return response.status(400).send("invalid order");
  const orderRef = db.collection("orders").doc(orderId);
  // A replay must not change the paid timestamp or race another confirmation.
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) return { status: 404, message: "unknown order" };
    const order = snapshot.data();
    const callbackAmount = Number(input.amount || input.valor);
    if (!Number.isFinite(callbackAmount) || Math.abs(callbackAmount - Number(order.total)) > 0.001) return { status: 400, message: "amount mismatch" };
    const callbackRequestId = text(input.transactionId || input.transaction_id || input.requestId || input.request_id, 200);
    if (order.paymentRequestId && ['mbway', 'multibanco'].includes(order.paymentMethod) && !callbackRequestId) {
      return { status: 400, message: "missing request" };
    }
    if (order.paymentRequestId && callbackRequestId && order.paymentRequestId !== callbackRequestId) {
      return { status: 400, message: "request mismatch" };
    }
    if (order.paymentStatus === "paid") return { status: 200, message: "ok" };
    // Late confirmations after stock release require manual reconciliation.
    if (order.inventoryRestoredAt || order.paymentStatus !== "pending") {
      transaction.update(orderRef, { reconciliationRequired: true, latePaymentReceivedAt: new Date().toISOString() });
      return { status: 409, message: "order requires reconciliation" };
    }
    const now = new Date().toISOString();
    transaction.update(orderRef, { paymentStatus: "paid", transactionId: callbackRequestId, paidAt: now, updatedAt: now, reconciliationRequired: false, nextReconcileAt: FieldValue.delete() });
    return { status: 200, message: "ok" };
  });
  return response.status(result.status).send(result.message);
});

async function queueCustomerPaymentInstructions(order, orderId) {
  const customerBody = emailFrame(`Pagamento da encomenda ${html(orderId)}`, `Olá ${html(order.customer.name)}, recebemos o seu pedido de pagamento.`, `${itemsHtml(order.items)}${totalsHtml(order)}${paymentInstructionsHtml(order)}${billingHtml(order)}<p style="color:#c7beb0;line-height:1.6">A encomenda só será confirmada e enviada depois de recebermos a confirmação do pagamento.</p>`);
  await queueEmail(order.customer.email, `Pagamento da encomenda ${orderId} · Mystic Essence`, customerBody, `order-${orderId}-payment-instructions`);
}

async function recordInfluencerCouponUse(order, orderId) {
  const couponCode = text(order.couponCode, 30).toUpperCase();
  const discountAmount = Math.round(Number(order.discountAmount || 0) * 100) / 100;
  if (!couponCode || discountAmount <= 0) return;
  // New orders snapshot attribution at checkout. Legacy orders retain their previous behavior.
  const coupon = Object.hasOwn(order, "influencerUid") ? order : (await db.collection("coupons").doc(couponCode).get()).data();
  const influencerUid = text(coupon?.influencerUid, 128);
  if (!influencerUid) return;
  const usedAt = order.paidAt || new Date().toISOString();
  await db.collection("influencerCouponUses").doc(orderId).set({
    influencerUid,
    couponCode,
    orderId,
    usedAt,
    month: text(usedAt, 7),
    discountAmount,
    orderTotal: Math.round(Number(order.total || 0) * 100) / 100,
    createdAt: new Date().toISOString(),
  }, { merge: true });
}

async function recordLoyaltyPayment(orderId) {
  const { loyaltyPointsForAmount, normalizeLoyaltyPoints } = await import("./loyalty.mjs");
  const orderRef = db.collection("orders").doc(orderId);
  await db.runTransaction(async transaction => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) return;
    const order = orderSnapshot.data();
    if (order.paymentStatus !== "paid" || !order.customerUid) return;

    const profileRef = db.collection("profiles").doc(order.customerUid);
    const history = profileRef.collection("loyaltyHistory");
    const earnRef = history.doc(`earn-${orderId}`);
    const redemptionRef = order.loyaltyPointsSpent ? history.doc(`redeem-${orderId}`) : null;
    const [profileSnapshot, earnSnapshot, redemptionSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(earnRef),
      ...(redemptionRef ? [transaction.get(redemptionRef)] : []),
    ]);
    const pointsEarned = loyaltyPointsForAmount(order.loyaltyPointsToEarn ?? (Number(order.subtotal || 0) - Number(order.discountAmount || 0)));
    const now = order.paidAt || new Date().toISOString();

    if (!earnSnapshot.exists && pointsEarned > 0) {
      const currentPoints = normalizeLoyaltyPoints(profileSnapshot.data()?.loyaltyPoints);
      transaction.set(profileRef, {
        loyaltyPoints: currentPoints + pointsEarned,
        loyaltyLifetimePoints: normalizeLoyaltyPoints(profileSnapshot.data()?.loyaltyLifetimePoints) + pointsEarned,
        loyaltyUpdatedAt: now,
      }, { merge: true });
      transaction.create(earnRef, {
        customerUid: order.customerUid,
        orderId,
        kind: "earn",
        status: "completed",
        points: pointsEarned,
        createdAt: now,
      });
    }
    if (redemptionRef && redemptionSnapshot?.exists && redemptionSnapshot.data().status === "reserved") {
      transaction.update(redemptionRef, { status: "completed", completedAt: now });
    }
    if (!order.loyaltyProcessedAt || Number(order.loyaltyPointsEarned || 0) !== pointsEarned) {
      transaction.update(orderRef, { loyaltyPointsEarned: pointsEarned, loyaltyProcessedAt: now });
    }
  });
}

async function queuePaidOrderEmails(order, orderId) {
  const address = `${html(order.customer.address)}, ${html(order.customer.postal)} ${html(order.customer.city)}`;
  const shippingZone = normalizeShippingZone(order.shippingZone);
  const couponDiscountAmount = Number(order.couponDiscountAmount ?? (!order.loyaltyRewardId ? order.discountAmount : 0));
  const ownerBody = emailFrame(`Nova encomenda paga ${html(orderId)}`, "O pagamento foi confirmado e a encomenda está pronta para ser preparada.", `${loyaltyEmailHtml(order, "owner")}${itemsHtml(order.items)}${totalsHtml(order)}<p style="line-height:1.7"><strong>Cliente:</strong> ${html(order.customer.name)}<br><strong>Email:</strong> ${html(order.customer.email)}<br><strong>Telefone:</strong> ${html(order.customer.phone)}<br><strong>NIF de contacto:</strong> ${html(order.customer.taxId || "Não indicado")}<br><strong>Morada de entrega:</strong> ${address}<br><strong>Zona de entrega:</strong> ${html(shippingZones[shippingZone].label)}<br><strong>Código promocional:</strong> ${html(order.couponCode || "Não utilizado")}<br><strong>Desconto do cupão:</strong> ${order.discount ? `${html(order.discount)}% (${currency.format(couponDiscountAmount)})` : "Sem desconto"}<br><strong>Notas:</strong> ${html(order.customer.notes || "Sem notas")}<br><strong>Pagamento confirmado:</strong> ${html(order.paymentMethod)}</p>${billingHtml(order)}`);
  const customerBody = emailFrame(`Encomenda ${html(orderId)} confirmada`, `Olá ${html(order.customer.name)}, recebemos o seu pagamento e a sua encomenda está confirmada.`, `${loyaltyEmailHtml(order, "customer")}${itemsHtml(order.items)}${totalsHtml(order)}${billingHtml(order)}<p style="color:#c7beb0;line-height:1.6">Enviaremos uma nova atualização quando a encomenda for enviada.</p>`);

  await Promise.all([
    queueEmail(ownerEmail.value(), `Nova encomenda paga ${orderId} · Mystic Essence`, ownerBody, `order-${orderId}-owner-paid`),
    queueEmail(order.customer.email, `Encomenda confirmada ${orderId} · Mystic Essence`, customerBody, `order-${orderId}-paid`),
  ]);
}

exports.notifyOwnerOfOrder = onDocumentCreated({ document: "orders/{orderId}", region, secrets: [ownerEmail] }, async (event) => {
  const order = event.data.data();
  const orderId = event.params.orderId;
  if (order.paymentStatus !== "paid") return;
  await recordInfluencerCouponUse(order, orderId);
  await recordLoyaltyPayment(orderId);
  await queuePaidOrderEmails(order, orderId);
  await event.data.ref.update({ ownerOrderEmailQueuedAt: FieldValue.serverTimestamp(), confirmationEmailSentAt: FieldValue.serverTimestamp() });
});

exports.notifyCustomerOfPayment = onDocumentUpdated({ document: "orders/{orderId}", region, secrets: [ownerEmail] }, async (event) => {
  const before = event.data.before.data();
  const order = event.data.after.data();
  if (!before.paymentInitiated && order.paymentInitiated && order.paymentStatus === "pending" && !order.paymentInstructionsEmailQueuedAt) {
    await queueCustomerPaymentInstructions(order, event.params.orderId);
    await event.data.after.ref.update({ paymentInstructionsEmailQueuedAt: FieldValue.serverTimestamp() });
  }
  if (before.paymentStatus !== "paid" && order.paymentStatus === "paid" && !order.confirmationEmailSentAt) {
    await recordInfluencerCouponUse(order, event.params.orderId);
    await recordLoyaltyPayment(event.params.orderId);
    await queuePaidOrderEmails(order, event.params.orderId);
    await event.data.after.ref.update({ confirmationEmailSentAt: FieldValue.serverTimestamp(), ownerOrderEmailQueuedAt: FieldValue.serverTimestamp() });
  }

  const newlyShipped = before.status !== "shipped" && order.status === "shipped";
  const trackingAdded = before.trackingNumber !== order.trackingNumber || before.trackingCarrier !== order.trackingCarrier;
  const tracking = trackingDetails(order);
  if (order.paymentStatus === "paid" && (newlyShipped || trackingAdded) && tracking && !order.trackingEmailSentAt) {
    const trackingPanel = `<div style="margin-top:24px;padding:18px;border:1px solid #8d691e"><span style="color:#a99e8d">Transportadora</span><p style="margin:6px 0 16px;color:#f4eee2"><strong>${html(tracking.carrierLabel)}</strong></p><span style="color:#a99e8d">Número de seguimento</span><p style="margin:8px 0 18px;font-size:24px;color:#ddb64e"><strong>${html(tracking.trackingNumber)}</strong></p><a href="${html(tracking.url)}" style="display:inline-block;padding:12px 18px;background:#c99522;color:#080706;text-decoration:none;font-weight:700">Seguir a encomenda</a></div>`;
    const body = emailFrame("A sua encomenda foi enviada", `A encomenda ${html(event.params.orderId)} já está a caminho.`, trackingPanel);
    await queueEmail(order.customer.email, `Encomenda enviada ${event.params.orderId} · Mystic Essence`, body, `order-${event.params.orderId}-shipped`);
    await event.data.after.ref.update({ trackingEmailSentAt: FieldValue.serverTimestamp() });
  }
});

exports.notifyRestockSubscribers = onDocumentUpdated({ document: "products/{productId}", region }, async (event) => {
  const productId = event.params.productId;
  if (productId.startsWith("decant-")) return;
  const before = event.data.before.data();
  const after = event.data.after.data();
  const availability = await db.collection("settings").doc("decantAvailability").get();
  const blockedSizes = normalizeBlockedDecantSizes(availability.data()?.blockedSizes);
  const beforeVariants = new Map((before.variants || []).map((variant) => [text(variant.volume, 30), variant]));
  const availableVolumes = (after.variants || [])
    .filter((variant) => variantUnavailable(before, beforeVariants.get(text(variant.volume, 30)), blockedSizes) && !variantUnavailable(after, variant, blockedSizes))
    .map((variant) => text(variant.volume, 30));
  if (!availableVolumes.length) return;
  const subscriptions = await db.collection("restockSubscriptions").where("productId", "==", productId).get();
  await sendRestockNotifications(productId, after, availableVolumes, subscriptions.docs);
});

exports.notifyGlobalDecantRestock = onDocumentUpdated({ document: "settings/decantAvailability", region }, async (event) => {
  const beforeSizes = normalizeBlockedDecantSizes(event.data.before.data()?.blockedSizes);
  const afterSizes = normalizeBlockedDecantSizes(event.data.after.data()?.blockedSizes);
  if (!beforeSizes.some((size) => !afterSizes.includes(size))) return;
  const subscriptions = await db.collection("restockSubscriptions").where("active", "==", true).get();
  const groups = new Map();
  for (const subscription of subscriptions.docs) {
    const productId = subscription.data().productId;
    if (!groups.has(productId)) groups.set(productId, []);
    groups.get(productId).push(subscription);
  }
  for (const [productId, documents] of groups) {
    const snapshot = await db.collection("products").doc(productId).get();
    if (!snapshot.exists) continue;
    const product = snapshot.data();
    const availableVolumes = (product.variants || [])
      .filter((variant) => variantUnavailable(product, variant, beforeSizes) && !variantUnavailable(product, variant, afterSizes))
      .map((variant) => text(variant.volume, 30));
    if (availableVolumes.length) await sendRestockNotifications(productId, product, availableVolumes, documents);
  }
});

async function sendRestockNotifications(productId, after, availableVolumes, subscriptions) {
  // Recheck current inventory so delayed events cannot announce a size blocked again meanwhile.
  const availability = await db.collection("settings").doc("decantAvailability").get();
  const currentProduct = await db.collection("products").doc(productId).get();
  if (!currentProduct.exists) return;
  const blockedSizes = normalizeBlockedDecantSizes(availability.data()?.blockedSizes);
  const current = currentProduct.data();
  availableVolumes = availableVolumes.filter((volume) => !variantUnavailable(current, (current.variants || []).find((variant) => text(variant.volume, 30) === volume), blockedSizes));
  if (!availableVolumes.length) return;
  const productName = text(after.name?.pt || after.name?.en || productId, 160);
  const baseUrl = publicSiteUrl.value().replace(/\/$/, "");
  await Promise.all(subscriptions.map(async (subscriptionDocument) => {
    const subscription = subscriptionDocument.data();
    if (!subscription.active || subscription.verifiedEmail !== true || !availableVolumes.includes(text(subscription.volume, 30))) return;
    const isEnglish = subscription.language === "en";
    const title = isEnglish ? `${productName} is available again` : `${productName} voltou a estar disponível`;
    const intro = isEnglish
      ? `The ${html(subscription.volume)} option you asked about is back in stock.`
      : `A opção de ${html(subscription.volume)} que pediu voltou a estar disponível.`;
    const body = emailFrame(title, intro, `<p style="margin:24px 0"><a href="${html(`${baseUrl}/produto/${productId}`)}" style="display:inline-block;padding:13px 20px;background:#d5a52e;color:#090806;text-decoration:none;font-weight:700">${isEnglish ? "View product" : "Ver produto"}</a></p><p style="color:#a99e8d;line-height:1.6">${isEnglish ? "Availability is not reserved and may change." : "A disponibilidade não fica reservada e pode voltar a alterar-se."}</p>`);
    // The subscription generation and mail record are committed together, including on trigger retries.
    await db.runTransaction(async transaction => {
      const fresh = await transaction.get(subscriptionDocument.ref);
      if (!fresh.data()?.active || fresh.data()?.updatedAt !== subscription.updatedAt) return;
      const mailId = `restock-${subscriptionDocument.id}-${hash(subscription.updatedAt).slice(0, 16)}`;
      transaction.set(db.collection("mail").doc(mailId), { to: [subscription.email], message: { subject: `${title} · Mystic Essence`, html: body } });
      transaction.update(subscriptionDocument.ref, { active: false, notifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
  }));
}
