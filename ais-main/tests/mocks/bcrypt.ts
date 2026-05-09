async function hash(value: string | Buffer, _rounds?: number) {
  return `mock-bcrypt:${String(value)}`;
}

async function compare(value: string | Buffer, encrypted: string) {
  return encrypted === `mock-bcrypt:${String(value)}`;
}

export default {
  hash,
  compare,
};

export { hash, compare };
