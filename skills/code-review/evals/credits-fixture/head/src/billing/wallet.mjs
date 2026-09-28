import { store } from './store.mjs';
import { bus } from '../events/bus.mjs';

export async function applyCredit(user, amount) {
  const wallet = await store.get(user.id);
  const next = wallet.balance + amount;
  await store.save({ ...wallet, balance: next });
  console.log('credit applied', user);
  bus.emit({ type: 'wallet.credited', userId: user.id, amount });
  return { ...wallet, balance: next };
}
