// expo-secure-store in memory: what a screen keeps between launches is what a property reads back.
export const kept = new Map<string, string>()

export const secureStore = {
  getItemAsync: jest.fn(async (key: string) => kept.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void kept.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void kept.delete(key)),
}
