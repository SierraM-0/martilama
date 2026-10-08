// In-memory stand-in for the parts of the R2 bucket API the Worker uses.
export function fakeBucket() {
  const store = new Map();
  const toBytes = async (v) => new Uint8Array(await new Response(v).arrayBuffer());
  return {
    async put(key, value) { store.set(key, await toBytes(value)); },
    async get(key) {
      const bytes = store.get(key);
      if (!bytes) return null;
      return {
        body: new Blob([bytes]).stream(),
        text: async () => new TextDecoder().decode(bytes),
        json: async () => JSON.parse(new TextDecoder().decode(bytes)),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit);
      return { objects: keys.map((key) => ({ key })) };
    },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
    keys: () => [...store.keys()].sort(),
  };
}

export async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
