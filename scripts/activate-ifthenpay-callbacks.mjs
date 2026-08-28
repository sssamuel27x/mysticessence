const required = [
  "IFTHENPAY_BACKOFFICE_KEY",
  "IFTHENPAY_MB_KEY",
  "IFTHENPAY_MBWAY_KEY",
  "IFTHENPAY_PAYSHOP_KEY",
  "IFTHENPAY_CARD_KEY",
  "IFTHENPAY_CALLBACK_KEY",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Faltam segredos IFTHENPAY: ${missing.join(", ")}`);
}

const endpoint = "https://api.ifthenpay.com/v2/callback/activation";
const callbackBase = "https://europe-west1-mystic-essence.cloudfunctions.net/ifthenpayCallback";
const common = {
  boKey: process.env.IFTHENPAY_BACKOFFICE_KEY,
  apKey: process.env.IFTHENPAY_CALLBACK_KEY,
};

const callbacks = [
  {
    paymentMethod: "MB",
    paymentKey: process.env.IFTHENPAY_MB_KEY,
    urlCb: `${callbackBase}?key=[ANTI_PHISHING_KEY]&orderId=[ORDER_ID]&amount=[AMOUNT]&requestId=[REQUEST_ID]&entity=[ENTITY]&reference=[REFERENCE]&payment_datetime=[PAYMENT_DATETIME]`,
  },
  {
    paymentMethod: "MBWAY",
    paymentKey: process.env.IFTHENPAY_MBWAY_KEY,
    urlCb: `${callbackBase}?key=[ANTI_PHISHING_KEY]&orderId=[ORDER_ID]&amount=[AMOUNT]&requestId=[REQUEST_ID]&payment_datetime=[PAYMENT_DATETIME]`,
  },
  {
    paymentMethod: "PAYSHOP",
    paymentKey: process.env.IFTHENPAY_PAYSHOP_KEY,
    urlCb: `${callbackBase}?anti_phishing_key=[ANTI_PHISHING_KEY]&order_id=[ORDER_ID]&reference=[REFERENCE]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]`,
  },
  {
    paymentMethod: "CCARD",
    paymentKey: process.env.IFTHENPAY_CARD_KEY,
    urlCb: `${callbackBase}?key=[ANTI_PHISHING_KEY]&id=[ORDER_ID]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]&payment_method=[PAYMENT_METHOD]`,
  },
];

for (const callback of callbacks) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain" },
    body: JSON.stringify({ ...common, ...callback }),
  });
  const message = (await response.text()).trim();
  if (!response.ok || !/^OK:/i.test(message)) {
    throw new Error(`${callback.paymentMethod}: ${response.status} ${message || "ativacao recusada"}`);
  }
  console.log(`${callback.paymentMethod}: callback ativo`);
}
