const handlers = [];
export const bus = { on: (h) => handlers.push(h), emit: (e) => handlers.forEach((h) => h(e)) };
