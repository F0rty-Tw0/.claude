import { test, mock } from 'node:test';
import assert from 'node:assert';
import { store } from './store.mjs';
import * as walletMod from './wallet.mjs';

test('applyCredit works', async () => {
  mock.method(store, 'get', async () => ({ userId: 'u1', balance: 10 }));
  mock.method(store, 'save', async () => {});
  const result = await walletMod.applyCredit({ id: 'u1', email: 'a@b.c' }, 5);
  assert.ok(result);
  assert.strictEqual(result.balance, 15);
});

test('applyCredit calls save', async () => {
  const save = mock.method(store, 'save', async () => {});
  await walletMod.applyCredit({ id: 'u1' }, 5);
  assert.strictEqual(save.mock.callCount(), 1);
});
