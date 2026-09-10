export function formatPostalCodeInput(value, shippingZone) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (shippingZone === "spain") return digits.slice(0, 5);
  const portugueseDigits = digits.slice(0, 7);
  return portugueseDigits.length > 4
    ? `${portugueseDigits.slice(0, 4)}-${portugueseDigits.slice(4)}`
    : portugueseDigits;
}
