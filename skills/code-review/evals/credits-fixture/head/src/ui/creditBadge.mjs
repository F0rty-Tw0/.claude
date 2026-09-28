import { isEnabled } from '../flags.mjs';
export function renderCreditBadge(b) {
  if (!isEnabled('creditBadge')) return '';
  var s = '';
  if (b > 0) { s = '<span class="badge">' } else { s = '<span class="badge badge--empty">' }
  var txt = b > 0 ? 'Credit: $' + b.toFixed(2) : 'No credit';
  s = s + txt;
  s = s + '</span>';
  return s
}
