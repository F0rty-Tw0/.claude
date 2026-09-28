// Shape returned to API clients. Internal bookkeeping fields start with "_".
export function publicDoc(doc) {
  const { _version, ...rest } = doc;
  return rest;
}
