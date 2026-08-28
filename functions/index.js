const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const region = "europe-west1";
const ifthenpayMbKey = defineSecret("IFTHENPAY_MB_KEY");
const ifthenpayMbwayKey = defineSecret("IFTHENPAY_MBWAY_KEY");
const ifthenpayPayshopKey = defineSecret("IFTHENPAY_PAYSHOP_KEY");
const ifthenpayCardKey = defineSecret("IFTHENPAY_CARD_KEY");
const callbackKey = defineSecret("IFTHENPAY_CALLBACK_KEY");
const ownerEmail = defineSecret("OWNER_EMAIL");
const publicSiteUrl = defineString("PUBLIC_SITE_URL", { default: "http://localhost:3000" });

const currency = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const shippingZones = {
  continental: { label: "Portugal Continental", fee: 4.9, freeFrom: 85 },
  islands: { label: "Madeira / Açores", fee: 12, freeFrom: 100 },
  spain: { label: "Espanha", fee: 10, freeFrom: 100 },
};

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
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
    const apiMessage = text(data?.Message || data?.message || data?.raw, 300);
    throw new Error(apiMessage || `IFTHENPAY HTTP ${apiResponse.status}`);
  }
  return data;
}

function assertIfthenpayStatus(data, expectedField, expectedValue) {
  if (String(data?.[expectedField] ?? "") !== expectedValue) {
    throw new Error(text(data?.Message || data?.message || `Resposta IFTHENPAY inválida (${expectedField}).`, 300));
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
  const zone = normalizeShippingZone(order.shippingZone);
  return `<div style="margin-top:20px;line-height:1.8;color:#c7beb0"><div><span>Subtotal</span><strong style="float:right;color:#f5efe3">${currency.format(order.subtotal)}</strong></div>${discount > 0 ? `<div><span>Desconto (${html(order.couponCode)})</span><strong style="float:right;color:#ddb64e">-${currency.format(discount)}</strong></div>` : ""}<div><span>Zona de entrega</span><strong style="float:right;color:#f5efe3">${html(shippingZones[zone].label)}</strong></div>${order.shippingCarrierName ? `<div><span>Transportadora</span><strong style="float:right;color:#f5efe3">${html(order.shippingCarrierName)}</strong></div>${order.shippingDescription ? `<div>${html(order.shippingDescription)}</div>` : ""}` : ""}<div><span>Envio</span><strong style="float:right;color:#f5efe3">${order.shipping === 0 ? "Grátis" : currency.format(order.shipping)}</strong></div><div style="margin-top:8px;padding-top:8px;border-top:1px solid #3b311d;font-size:18px;color:#ddb64e"><span>Total</span><strong style="float:right">${currency.format(order.total)}</strong></div></div>`;
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

async function createOrderRecord(request, paymentMode) {
  const { DEFAULT_SHIPPING_SETTINGS, normalizeShippingSettings, getShippingCarrier, getShippingCost } = await import("./shipping.mjs");
  const input = request.data || {};
  const customer = input.customer || {};
  const requestedBilling = input.billing || {};
  const requestedItems = Array.isArray(input.items) ? input.items.slice(0, 50) : [];
  const shippingZone = normalizeShippingZone(input.shippingZone);
  if (!requestedItems.length) throw new HttpsError("invalid-argument", "O carrinho está vazio.");
  if (!text(customer.name) || !text(customer.email) || !text(customer.phone) || !text(customer.address) || !text(customer.postal) || !text(customer.city)) {
    throw new HttpsError("invalid-argument", "Preencha todos os dados de entrega.");
  }
  const sameAsContact = requestedBilling.sameAsContact === true;
  if (!sameAsContact && (!text(requestedBilling.name) || !text(requestedBilling.address) || !text(requestedBilling.taxId))) {
    throw new HttpsError("invalid-argument", "Preencha todos os dados de faturação.");
  }

  const normalizedItems = requestedItems.map((requested) => ({
    productId: text(requested.productId, 120).replace(/^decant-/, "").split("--")[0],
    volume: text(requested.volume, 30),
    quantity: Math.min(99, Math.max(1, Math.trunc(Number(requested.quantity) || 1))),
  }));
  const productIds = [...new Set(normalizedItems.map((item) => item.productId))];
  const couponCode = text(input.couponCode, 30).toUpperCase();
  const orderId = `ME${Date.now().toString(36).slice(-8)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase().slice(0, 15);
  const orderRef = db.collection("orders").doc(orderId);
  const order = await db.runTransaction(async (transaction) => {
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
    const reads = [...productRefs, ...decantRefs, ...(couponRef ? [couponRef] : [])];
    const snapshots = await Promise.all(reads.map((ref) => transaction.get(ref)));
    const productSnapshots = snapshots.slice(0, productRefs.length);
    const decantSnapshots = snapshots.slice(productRefs.length, productRefs.length + decantRefs.length);
    const couponSnapshot = couponRef ? snapshots[snapshots.length - 1] : null;
    const products = new Map();

    productSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) throw new HttpsError("failed-precondition", `Produto indisponível: ${productIds[index]}`);
      products.set(productIds[index], snapshot.data());
    });

    let couponDiscount = 0;
    if (couponCode) {
      if (!couponSnapshot?.exists) throw new HttpsError("invalid-argument", "O código promocional é inválido ou já não existe.");
      couponDiscount = Math.min(95, Math.max(1, Math.trunc(Number(couponSnapshot.data().discount) || 0)));
      if (!couponDiscount) throw new HttpsError("failed-precondition", "Este código promocional não está ativo.");
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
      if (variant.soldout || variant.stock === 0 || (!variant.isDecant && product.tag === "soldout")) {
        throw new HttpsError("failed-precondition", `${productName} ${requested.volume} está esgotado.`);
      }
      const totalRequested = requestedByVariant.get(`${requested.productId}::${requested.volume}`) || requested.quantity;
      if (typeof variant.stock === "number" && variant.stock < totalRequested) {
        throw new HttpsError("failed-precondition", `Restam apenas ${Math.max(0, variant.stock)} unidade(s) de ${productName} ${requested.volume}.`);
      }
      const discount = variant.isDecant ? 0 : liveDiscount(product);
      const unitPrice = Math.round(Number(variant.price) * (1 - discount / 100) * 100) / 100;
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

    productIds.forEach((productId, index) => {
      const product = products.get(productId);
      const variants = (product.variants || []).map((variant) => {
        const requestedQuantity = requestedByVariant.get(`${productId}::${variant.volume}`) || 0;
        if (!requestedQuantity || typeof variant.stock !== "number") return variant;
        const stock = Math.max(0, Math.trunc(variant.stock) - requestedQuantity);
        return { ...variant, stock, soldout: stock === 0 ? true : Boolean(variant.soldout) };
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

    const discountAmount = Math.round(subtotal * couponDiscount) / 100;
    const total = Math.round((subtotal - discountAmount + shipping) * 100) / 100;
    const now = new Date().toISOString();
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
      items,
      subtotal,
      shipping,
      shippingZone,
      shippingCarrierId: carrier.id,
      shippingCarrierName: carrier.name,
      shippingDescription: carrier.description,
      couponCode: couponCode || null,
      discount: couponDiscount,
      discountAmount,
      total,
      payment: paymentMode === "ifthenpay" ? "ifthenpay" : text(input.paymentMethod, 30) || "pending",
      paymentMethod: text(input.paymentMethod, 30) || "gateway",
      paymentStatus: "pending",
      paymentInitiated: paymentMode !== "ifthenpay",
      checkoutMode: paymentMode,
      status: "received",
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(orderRef, nextOrder);
    return nextOrder;
  });
  const total = order.total;

  return { input, orderId, order, total };
}

async function restoreReservedInventory(orderId, order) {
  const requestedByProduct = new Map();
  (order.items || []).forEach((item) => {
    const productId = text(item.productId || item.id, 120).replace(/^decant-/, "").split("--")[0];
    if (!productId) return;
    if (!requestedByProduct.has(productId)) requestedByProduct.set(productId, new Map());
    const variants = requestedByProduct.get(productId);
    variants.set(item.volume, (variants.get(item.volume) || 0) + Math.max(1, Math.trunc(Number(item.qty) || 1)));
  });

  await db.runTransaction(async (transaction) => {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists || orderSnapshot.data().inventoryRestoredAt) return;

    const productsToRestore = [...requestedByProduct.entries()].map(([productId, requestedVariants]) => ({
      productId,
      requestedVariants,
      productRef: db.collection("products").doc(productId),
      decantRef: db.collection("products").doc(`decant-${productId}`),
    }));
    const inventorySnapshots = await Promise.all(productsToRestore.flatMap((entry) => [
      transaction.get(entry.productRef),
      transaction.get(entry.decantRef),
    ]));

    productsToRestore.forEach(({ requestedVariants, productRef, decantRef }, index) => {
      const productSnapshot = inventorySnapshots[index * 2];
      const decantSnapshot = inventorySnapshots[index * 2 + 1];
      if (!productSnapshot.exists) return;
      const product = productSnapshot.data();
      const variants = (product.variants || []).map((variant) => {
        const quantity = requestedVariants.get(variant.volume) || 0;
        if (!quantity || typeof variant.stock !== "number") return variant;
        const stock = Math.max(0, Math.trunc(variant.stock)) + quantity;
        return { ...variant, stock, soldout: false };
      });
      transaction.update(productRef, { variants, updatedAt: new Date().toISOString() });

      if (decantSnapshot.exists) {
        const decantVariants = variants.filter((variant) => variant.isDecant);
        const firstAvailable = decantVariants.find((variant) => !variant.soldout && variant.stock !== 0) || decantVariants[0];
        transaction.update(decantRef, {
          variants: decantVariants,
          tag: "stock",
          ...(firstAvailable ? { price: firstAvailable.price, volume: firstAvailable.volume } : {}),
          updatedAt: new Date().toISOString(),
        });
      }
    });

    transaction.update(orderRef, { inventoryRestoredAt: new Date().toISOString() });
  });
}

exports.createPendingOrder = onCall({ region }, async (request) => {
  const { orderId } = await createOrderRecord(request, "pending-payment");
  return { orderId };
});

exports.validateCoupon = onCall({ region }, async (request) => {
  const code = text(request.data?.code, 30).toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new HttpsError("invalid-argument", "Código promocional inválido.");
  const snapshot = await db.collection("coupons").doc(code).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "Cupão não encontrado.");
  const discount = Math.min(95, Math.max(1, Math.trunc(Number(snapshot.data().discount) || 0)));
  if (!discount) throw new HttpsError("failed-precondition", "Cupão inativo.");
  return { code, discount };
});

exports.submitReview = onCall({ region }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicie sessão para avaliar este produto.");

  const productId = text(request.data?.productId, 120).replace(/^decant-/, "").split("--")[0];
  const rating = Math.trunc(Number(request.data?.rating));
  const comment = text(request.data?.comment, 1000);
  if (!productId) throw new HttpsError("invalid-argument", "Produto inválido.");
  if (rating < 1 || rating > 5) throw new HttpsError("invalid-argument", "Escolha uma classificação entre 1 e 5 estrelas.");
  if (comment.length < 10) throw new HttpsError("invalid-argument", "O comentário deve ter pelo menos 10 caracteres.");

  const [productSnapshot, ordersSnapshot] = await Promise.all([
    db.collection("products").doc(productId).get(),
    db.collection("orders").where("customerUid", "==", request.auth.uid).get(),
  ]);
  if (!productSnapshot.exists) throw new HttpsError("not-found", "Este produto já não está disponível.");

  const deliveredOrder = ordersSnapshot.docs.find((orderDocument) => {
    const order = orderDocument.data();
    if (order.status !== "delivered") return false;
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

exports.createCheckout = onCall({
  region,
  secrets: [ifthenpayMbKey, ifthenpayMbwayKey, ifthenpayPayshopKey, ifthenpayCardKey],
}, async (request) => {
  const paymentMethod = text(request.data?.paymentMethod, 30).toLowerCase();
  if (!['mbway', 'multibanco', 'payshop', 'card'].includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Escolha um método de pagamento válido.");
  }

  // Validate before creating the order or reserving inventory.
  const mbwayMobile = paymentMethod === "mbway"
    ? normalizePortugueseMobile(request.data?.customer?.phone)
    : null;
  const { input, orderId, order, total } = await createOrderRecord(request, "ifthenpay");
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
      updatedAt: new Date().toISOString(),
    });
    return { orderId, amount: total, paymentStatus: "pending", ...payment };
  } catch (error) {
    try {
      await restoreReservedInventory(orderId, order);
    } catch (restoreError) {
      console.error("Could not restore inventory after IFTHENPAY failure", { orderId, error: restoreError.message });
    }
    await db.collection("orders").doc(orderId).update({
      paymentStatus: "failed",
      paymentError: text(error.message, 500),
      updatedAt: new Date().toISOString(),
    });
    console.error("IFTHENPAY payment initiation failed", { orderId, paymentMethod, error: error.message });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("unavailable", "Não foi possível iniciar o pagamento na IFTHENPAY. Confirme os dados e tente novamente.");
  }
});

exports.ifthenpayCallback = onRequest({ region, secrets: [callbackKey] }, async (request, response) => {
  const input = { ...request.query, ...request.body };
  const suppliedKey = text(input.antiPhishingKey || input.anti_phishing_key || input.key, 200);
  if (!suppliedKey || suppliedKey !== callbackKey.value()) return response.status(403).send("forbidden");
  const orderId = text(input.orderId || input.order_id || input.id, 15);
  const orderRef = db.collection("orders").doc(orderId);
  const snapshot = await orderRef.get();
  if (!snapshot.exists) return response.status(404).send("unknown order");
  const order = snapshot.data();
  const callbackAmount = Number(input.amount || input.valor);
  if (!Number.isFinite(callbackAmount) || Math.abs(callbackAmount - Number(order.total)) > 0.001) return response.status(400).send("amount mismatch");
  const callbackRequestId = text(input.transactionId || input.transaction_id || input.requestId || input.request_id, 200);
  if (order.paymentRequestId && callbackRequestId && order.paymentRequestId !== callbackRequestId) {
    return response.status(400).send("request mismatch");
  }
  await orderRef.update({
    paymentStatus: "paid",
    transactionId: callbackRequestId,
    paidAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return response.status(200).send("ok");
});

async function queueOrderReceivedEmails(order, orderId) {
  const address = `${html(order.customer.address)}, ${html(order.customer.postal)} ${html(order.customer.city)}`;
  const shippingZone = normalizeShippingZone(order.shippingZone);
  const ownerBody = emailFrame(`Nova encomenda ${html(orderId)}`, "Foi recebida uma nova encomenda na loja.", `${itemsHtml(order.items)}${totalsHtml(order)}${paymentInstructionsHtml(order)}<p style="line-height:1.7"><strong>Cliente:</strong> ${html(order.customer.name)}<br><strong>Email:</strong> ${html(order.customer.email)}<br><strong>Telefone:</strong> ${html(order.customer.phone)}<br><strong>NIF de contacto:</strong> ${html(order.customer.taxId || "Não indicado")}<br><strong>Morada de entrega:</strong> ${address}<br><strong>Zona de entrega:</strong> ${html(shippingZones[shippingZone].label)}<br><strong>Código promocional:</strong> ${html(order.couponCode || "Não utilizado")}<br><strong>Desconto do cupão:</strong> ${order.discount ? `${html(order.discount)}% (${currency.format(order.discountAmount || 0)})` : "Sem desconto"}<br><strong>Notas:</strong> ${html(order.customer.notes || "Sem notas")}<br><strong>Pagamento:</strong> ${html(order.paymentMethod)}</p>${billingHtml(order)}`);
  const customerBody = emailFrame(`Recebemos a sua encomenda ${html(orderId)}`, `Olá ${html(order.customer.name)}, a sua encomenda foi recebida e já aparece no nosso sistema.`, `${itemsHtml(order.items)}${totalsHtml(order)}${paymentInstructionsHtml(order)}${billingHtml(order)}<p style="color:#c7beb0;line-height:1.6">Enviaremos uma nova atualização quando o pagamento for confirmado e quando a encomenda for enviada.</p>`);

  await Promise.all([
    queueEmail(ownerEmail.value(), `Nova encomenda ${orderId} · Mystic Essence`, ownerBody, `order-${orderId}-owner`),
    queueEmail(order.customer.email, `Recebemos a sua encomenda ${orderId} · Mystic Essence`, customerBody, `order-${orderId}-received`),
  ]);
}

exports.notifyOwnerOfOrder = onDocumentCreated({ document: "orders/{orderId}", region, secrets: [ownerEmail] }, async (event) => {
  const order = event.data.data();
  const orderId = event.params.orderId;
  if (order.checkoutMode === "ifthenpay" && !order.paymentInitiated) return;
  await queueOrderReceivedEmails(order, orderId);
  await event.data.ref.update({ orderReceivedEmailQueuedAt: FieldValue.serverTimestamp() });
});

exports.notifyCustomerOfPayment = onDocumentUpdated({ document: "orders/{orderId}", region, secrets: [ownerEmail] }, async (event) => {
  const before = event.data.before.data();
  const order = event.data.after.data();
  if (!before.paymentInitiated && order.paymentInitiated && !order.orderReceivedEmailQueuedAt) {
    await queueOrderReceivedEmails(order, event.params.orderId);
    await event.data.after.ref.update({ orderReceivedEmailQueuedAt: FieldValue.serverTimestamp() });
  }
  if (before.paymentStatus !== "paid" && order.paymentStatus === "paid" && !order.confirmationEmailSentAt) {
    const body = emailFrame(`Encomenda ${html(event.params.orderId)} confirmada`, `Olá ${html(order.customer.name)}, recebemos o seu pagamento e a sua encomenda está confirmada.`, `${itemsHtml(order.items)}${totalsHtml(order)}${billingHtml(order)}`);
    await queueEmail(order.customer.email, `Encomenda confirmada ${event.params.orderId} · Mystic Essence`, body, `order-${event.params.orderId}-paid`);
    await event.data.after.ref.update({ confirmationEmailSentAt: FieldValue.serverTimestamp() });
  }

  const newlyShipped = before.status !== "shipped" && order.status === "shipped";
  const trackingAdded = before.trackingNumber !== order.trackingNumber && Boolean(order.trackingNumber);
  if ((newlyShipped || trackingAdded) && order.trackingNumber && !order.trackingEmailSentAt) {
    const body = emailFrame("A sua encomenda foi enviada", `A encomenda ${html(event.params.orderId)} já está a caminho.`, `<div style="margin-top:24px;padding:18px;border:1px solid #8d691e"><span style="color:#a99e8d">Número de seguimento</span><p style="margin:8px 0 0;font-size:24px;color:#ddb64e"><strong>${html(order.trackingNumber)}</strong></p></div>`);
    await queueEmail(order.customer.email, `Encomenda enviada ${event.params.orderId} · Mystic Essence`, body, `order-${event.params.orderId}-shipped`);
    await event.data.after.ref.update({ trackingEmailSentAt: FieldValue.serverTimestamp() });
  }
});
