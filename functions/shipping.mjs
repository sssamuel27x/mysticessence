export const SHIPPING_ZONE_IDS = Object.freeze(['continental', 'islands', 'spain']);
export const MAX_CARRIERS = 10;
export const DEFAULT_SHIPPING_SETTINGS = Object.freeze(Object.fromEntries(
  [['continental', 4.9, 85], ['islands', 12, 100], ['spain', 10, 100]].map(([zone, price, freeFrom]) => [zone, {
    freeFrom, carriers: [{ id: 'standard', name: 'Envio standard', price, description: '' }],
  }]),
));

function validMoney(value, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

export function isValidShippingSettings(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === SHIPPING_ZONE_IDS.length
    && SHIPPING_ZONE_IDS.every((zone) => {
      const rate = value[zone];
      return rate && Object.keys(rate).length === 2 && validMoney(rate.freeFrom, 99999.99)
        && Array.isArray(rate.carriers) && rate.carriers.length <= MAX_CARRIERS
        && new Set(rate.carriers.map((carrier) => carrier?.id)).size === rate.carriers.length
        && rate.carriers.every((carrier) => carrier && Object.keys(carrier).length === 4
          && typeof carrier.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(carrier.id)
          && typeof carrier.name === 'string' && carrier.name.trim().length > 0 && carrier.name.length <= 80
          && typeof carrier.description === 'string' && carrier.description.length <= 160
          && validMoney(carrier.price, 999.99));
    }));
}

// Read the earlier one-rate-per-zone format without changing stored orders.
export function normalizeShippingSettings(value) {
  if (isValidShippingSettings(value)) return value;
  if (value && SHIPPING_ZONE_IDS.every((zone) => validMoney(value[zone]?.fee, 999.99) && validMoney(value[zone]?.freeFrom, 99999.99))) {
    return Object.fromEntries(SHIPPING_ZONE_IDS.map((zone) => [zone, {
      freeFrom: value[zone].freeFrom,
      carriers: [{ id: 'standard', name: 'Envio standard', price: value[zone].fee, description: '' }],
    }]));
  }
  return null;
}

export function getShippingCarrier(zone, settings = DEFAULT_SHIPPING_SETTINGS, carrierId) {
  if (!isValidShippingSettings(settings) || !SHIPPING_ZONE_IDS.includes(zone)) throw new Error('Invalid shipping settings');
  const carriers = settings[zone].carriers;
  return (carrierId === undefined ? carriers[0] : carriers.find((carrier) => carrier.id === carrierId)) ?? null;
}

export function getShippingCost(subtotal, zone, settings = DEFAULT_SHIPPING_SETTINGS, carrierId) {
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('Invalid subtotal');
  const carrier = getShippingCarrier(zone, settings, carrierId);
  if (!carrier) throw new Error('Shipping unavailable');
  return Math.round(subtotal * 100) >= Math.round(settings[zone].freeFrom * 100) ? 0 : carrier.price;
}

export function shippingSettingsEqual(first, second) {
  return SHIPPING_ZONE_IDS.every((zone) => first[zone].freeFrom === second[zone].freeFrom
    && first[zone].carriers.length === second[zone].carriers.length
    && first[zone].carriers.every((carrier, index) => ['id', 'name', 'price', 'description'].every((key) => carrier[key] === second[zone].carriers[index][key])));
}
