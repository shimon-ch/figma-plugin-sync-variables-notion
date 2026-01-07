import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Figma APIのグローバルモック
const mockFigma = {
  variables: {
    getLocalVariablesAsync: vi.fn().mockResolvedValue([]),
    getLocalVariableCollectionsAsync: vi.fn().mockResolvedValue([]),
    getVariableByIdAsync: vi.fn().mockResolvedValue(null),
    getVariableCollectionByIdAsync: vi.fn().mockResolvedValue(null),
    createVariable: vi.fn().mockReturnValue({
      id: 'mock-var-id',
      name: 'MockVariable',
      resolvedType: 'STRING',
      valuesByMode: {},
      setValueForMode: vi.fn(),
      remove: vi.fn(),
      description: '',
    }),
    createVariableCollection: vi.fn().mockReturnValue({
      id: 'mock-collection-id',
      name: 'MockCollection',
      modes: [{ modeId: 'mode-1', name: 'Default' }],
      variableIds: [],
      renameMode: vi.fn(),
    }),
  },
  ui: {
    postMessage: vi.fn(),
  },
  clientStorage: {
    getAsync: vi.fn().mockResolvedValue(null),
    setAsync: vi.fn().mockResolvedValue(undefined),
  },
  showUI: vi.fn(),
  closePlugin: vi.fn(),
};

// @ts-expect-error - グローバルモック
globalThis.figma = mockFigma;

// import.meta.env のモック
vi.stubGlobal('import', {
  meta: {
    env: {
      MODE: 'test',
    },
  },
});

// crypto.randomUUID のモック（Node.js環境用）
// 既存のcryptoメソッドを保持しつつ、randomUUIDが無い場合のみ追加
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  const existingCrypto = (globalThis.crypto ?? {}) as Partial<Crypto> & Record<string, unknown>;
  vi.stubGlobal('crypto', {
    ...existingCrypto,
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }),
  });
}

// fetch のモック
globalThis.fetch = vi.fn();

// console.log/warn/errorのモック（テスト中のノイズ軽減）
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
// エラーは表示を維持
// vi.spyOn(console, 'error').mockImplementation(() => {});
