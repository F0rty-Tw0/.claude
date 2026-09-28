// Feature flags. Every new user-facing behavior ships dark behind one.
const FLAGS = { newCheckoutCopy: false, creditBadge: false };
export const isEnabled = (name) => FLAGS[name] === true;
