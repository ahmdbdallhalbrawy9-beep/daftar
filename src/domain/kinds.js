// @ts-check
// Operation-kind vocabulary: vf <-> insta mapping and Arabic labels. Extracted
// from index.html unchanged.

/** @param {string} k @returns {string} the vf-equivalent of an insta kind (others pass through) */
export function baseK(k) {
  return k === 'iin' ? 'in' : k === 'iout' ? 'out' : k === 'itopup' ? 'topup' : k === 'icashout' ? 'cashout' : k;
}

/** @param {string} k @returns {boolean} */
export function isInsta(k) { return k === 'iin' || k === 'iout' || k === 'itopup' || k === 'icashout'; }

/** @param {{k:string, ins?:number}} t @returns {boolean} */
export function isInsT(t) { return t.k === 'xfer' ? !!t.ins : isInsta(t.k); }

export const MSG = 'لا يمكن إتمام العملية: الرصيد غير كافي';

export const KIND = {
  xfer: 'تحويل بين محافظي', in: 'سحب', out: 'تحويل', iin: 'سحب إنستاباي', iout: 'تحويل إنستاباي',
  topup: 'تعبئة محفظة', cashout: 'سحب كاش من محفظة', itopup: 'إيداع إنستاباي', icashout: 'سحب كاش من إنستاباي',
};

export const PKIND = {
  in: 'استلام (سحب زبون)', out: 'تحويل صادر', cashout: 'سحب كاش من المحفظة', dep: 'إيداع في المحفظة', pay: 'دفع / شحن من المحفظة',
};
