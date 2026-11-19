// @ts-check
// Texts for the "background upload" status in إعدادات → الخلفية: what is still queued on the phone, and what to
// switch on for the phone's brand (Oppo/Realme, Infinix, Samsung, … stop apps in the background on their own).

/**
 * One-line tip for the phone's brand, or '' when the brand has no known extra switch.
 * @param {string|undefined} maker lowercase `Build.MANUFACTURER` from the native plugin
 * @returns {string}
 */
export function brandTip(maker) {
  var m = String(maker || '').toLowerCase();
  if (/oppo|realme|oneplus/.test(m)) return 'أوبو/ريلمي: من إعدادات التطبيق فعّل "التشغيل التلقائي" و"النشاط في الخلفية"، ومن الـ Recents اقفل التطبيق بالقفل.';
  if (/infinix|tecno|itel/.test(m)) return 'إنفينكس: فعّل التشغيل التلقائي للتطبيق، وخلّي البطارية "بدون قيود".';
  if (/samsung/.test(m)) return 'سامسونج: البطارية ← حدود استخدام الخلفية، شيل دفتر من "التطبيقات النائمة" وضيفه في "لا تنام أبدًا".';
  if (/xiaomi|redmi|poco/.test(m)) return 'شاومي: فعّل "التشغيل التلقائي"، وخلّي توفير البطارية للتطبيق "بدون قيود".';
  if (/vivo|iqoo/.test(m)) return 'فيفو: فعّل التشغيل التلقائي، وخلّي استهلاك البطارية في الخلفية "مسموح".';
  if (/huawei|honor/.test(m)) return 'هواوي/هونر: فعّل "التشغيل التلقائي" و"التشغيل في الخلفية" من إدارة التطبيق.';
  return '';
}

/**
 * What is waiting on the phone and when the last SMS reached it, for the status line ('' when there is nothing to add).
 * @param {{queued?: number, waitInbox?: number, lastRecv?: number}|null|undefined} st native status
 * @param {(ms: number) => string} fmtTime formats a time for display
 * @returns {string}
 */
export function smsQueueNote(st, fmtTime) {
  if (!st) return '';
  var parts = [];
  if (st.queued && st.queued > 0) parts.push(st.queued + ' رسالة مستنية الرفع (هتتعاد تلقائي)');
  if (st.waitInbox && st.waitInbox > 0) parts.push(st.waitInbox + ' رسالة شحن مستنية ظهورها في رسايل الموبايل');
  if (st.lastRecv && st.lastRecv > 0) parts.push('آخر رسالة وصلت للتطبيق: ' + fmtTime(st.lastRecv));
  return parts.join(' — ');
}
