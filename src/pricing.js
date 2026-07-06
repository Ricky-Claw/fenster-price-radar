function isFinitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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
