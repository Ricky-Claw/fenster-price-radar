function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

// DFS liefert Brutto-Endpreise, Einkaufspreise werden dagegen netto geliefert und verglichen.
export const VAT_RATE = 0.19;

export function grossToNet(grossAmount) {
  if (typeof grossAmount !== 'number' || !Number.isFinite(grossAmount)) return null;
  return Number((grossAmount / (1 + VAT_RATE)).toFixed(2));
}

export function netToGross(netAmount) {
  if (typeof netAmount !== 'number' || !Number.isFinite(netAmount)) return null;
  return netAmount * (1 + VAT_RATE);
}

export function deriveDiscountFromTotals(listTotal, customerTotal) {
  if (!isFinitePositiveNumber(listTotal) || !isFinitePositiveNumber(customerTotal) || customerTotal >= listTotal) {
    return { observed: false, observedDiscountPercent: 0, observedDiscount: 0 };
  }
  const observedDiscount = Number(((1 - customerTotal / listTotal) * 100).toFixed(2));
  return { observed: true, observedDiscountPercent: observedDiscount / 100, observedDiscount };
}

export function deriveCustomerTotal(data) {
  const listTotal = data?.comparePrice?.listTotal ?? data?.listTotal ?? data?.price?.listTotal ?? null;
  const discountMeta = data?.discountMetadata || data?.discount || {};
  const explicitCustomerTotal = data?.customerPrice?.total ?? data?.customerTotal ?? null;
  const discountedTotal = discountMeta.discountedTotalObserved ?? null;

  if (isFinitePositiveNumber(explicitCustomerTotal)) return explicitCustomerTotal;
  if (isFinitePositiveNumber(discountedTotal)) return discountedTotal;
  return listTotal;
}

export function buildRowKey(row) {
  return [
    row?.brand || '',
    row?.profile || '',
    row?.size || '',
    row?.glazing || '',
    row?.opening || 'Dreh-Kipp',
    row?.color || 'Weiß/Weiß',
    row?.layout || '1flg'
  ].join('|');
}
