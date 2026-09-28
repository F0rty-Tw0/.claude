// Shared persistence for wallets. Used by checkout, refunds, admin tools.
const wallets = new Map();
export const store = {
  async get(userId) { await tick(); return wallets.get(userId) ?? { userId, balance: 0 }; },
  async save(wallet) { await tick(); wallets.set(wallet.userId, { ...wallet }); },
};
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));
