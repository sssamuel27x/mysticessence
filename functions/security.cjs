const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

async function rateLimit(db, request, action, identities = []) {
  // rawRequest.ip is supplied by the Cloud Functions HTTP adapter, not the payload.
  const ip = request.rawRequest?.ip;
  if (!ip) throw new HttpsError('failed-precondition', 'Não foi possível validar o pedido.');
  const subjects = [[`ip:${ip}`, 40], ...identities.filter(Boolean).map(value => [value, 8])];
  if (request.auth) subjects.push([`uid:${request.auth.uid}`, 20]);
  const now = Date.now();
  const bucket = Math.floor(now / 900000);
  await db.runTransaction(async tx => {
    const refs = subjects.map(([subject]) => db.collection('requestLimits').doc(hash([action, subject, bucket])));
    const snapshots = await tx.getAll(...refs);
    if (snapshots.some((doc, i) => (doc.data()?.count || 0) >= subjects[i][1])) {
      throw new HttpsError('resource-exhausted', 'Demasiados pedidos. Aguarde alguns minutos antes de tentar novamente.');
    }
    snapshots.forEach((doc, i) => tx.set(refs[i], { count: (doc.data()?.count || 0) + 1, expiresAt: new Date(now + 86400000) }));
  });
}

function validateDestination(zone, postal) {
  const value = String(postal || '').trim();
  const derived = /^\d{5}$/.test(value) ? 'spain'
    : /^[1-9]\d{3}-\d{3}$/.test(value) ? (/^9/.test(value) ? 'islands' : 'continental') : null;
  if (!derived || derived !== zone) throw new HttpsError('invalid-argument', 'O código postal não corresponde à zona de entrega.');
}

module.exports = { hash, rateLimit, validateDestination };
