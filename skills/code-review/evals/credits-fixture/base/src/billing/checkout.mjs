import { store } from './store.mjs';
export async function checkout(user, total) {
  const wallet = await store.get(user.id);
  return { charged: total, walletBalance: wallet.balance };
}
