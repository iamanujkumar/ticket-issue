export function toMoney(amountMinor, currency = 'INR') {
  if (amountMinor === null || amountMinor === undefined) {
    return null;
  }
  return { amountMinor, currency };
}
