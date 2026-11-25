// expo-secure-store in memory: what a screen keeps between launches is what a property reads back.
export const kept = new Map<string, string>()

// A keychain that refuses every read and write, as a locked phone's does; each property resets it.
export const locked = { current: false }

function open() {
  if (locked.current) throw new Error('The keychain is locked')
}

export const secureStore = {
  getItemAsync: jest.fn(async (key: string) => (open(), kept.get(key) ?? null)),
  setItemAsync: jest.fn(async (key: string, value: string) => (open(), void kept.set(key, value))),
  deleteItemAsync: jest.fn(async (key: string) => void kept.delete(key)),
}
