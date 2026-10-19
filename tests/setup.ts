// Test setup file for Vitest
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string): string | null {
    return key in this.store ? this.store[key] : null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] || null;
  }
}

// Ensure localStorage is available in Node test environment
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.getItem) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true
  });
}
