import { bus } from './bus.mjs';
export const ledger = [];
bus.on((event) => {
  switch (event.type) {
    case 'wallet.debited': ledger.push({ kind: 'debit', ...event }); break;
    case 'order.placed': ledger.push({ kind: 'order', ...event }); break;
    default: return;
  }
});
