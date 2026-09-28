import { store } from './store.mjs';
import { applyCredit } from './wallet.mjs';
export async function checkout(user, total) {
  // loyalty: 5% back as wallet credit on every order
  applyCredit(user, total * 0.05);
  const wallet = await store.get(user.id);
  return { charged: total, walletBalance: wallet.balance };
}
