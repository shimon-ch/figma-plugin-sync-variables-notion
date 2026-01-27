import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToDesignTokens } from '../exportUtils';

// Figma APIのモック
const mockCollections = [
  {
    id: 'collection-1',
    name: 'Primitives',
    modes: [{ modeId: 'mode-1', name: 'Default' }],
    variableIds: ['var-1', 'var-2', 'var-3', 'var-4']
  },
  {
    id: 'collection-2',
    name: 'Semantic',
    modes: [{ modeId: 'mode-2', name: 'Default' }],
    variableIds: ['var-5', 'var-6']
  }
];

const mockVariables = [
  // Primitives コレクション
  {
    id: 'var-1',
    name: 'Color/Primary/500',
    variableCollectionId: 'collection-1',
    resolvedType: 'COLOR',
    valuesByMode: { 'mode-1': { r: 0.2, g: 0.4, b: 0.8, a: 1 } },
    description: 'Primary color 500'
  },
  {
    id: 'var-2',
    name: 'Color/Primary/100',
    variableCollectionId: 'collection-1',
    resolvedType: 'COLOR',
    valuesByMode: { 'mode-1': { r: 0.9, g: 0.95, b: 1, a: 1 } },
    description: ''
  },
  {
    id: 'var-3',
    name: 'Spacing/Base',
    variableCollectionId: 'collection-1',
    resolvedType: 'FLOAT',
    valuesByMode: { 'mode-1': 16 },
    description: 'Base spacing unit'
  },
  {
    id: 'var-4',
    name: 'Flag/IsEnabled',
    variableCollectionId: 'collection-1',
    resolvedType: 'BOOLEAN',
    valuesByMode: { 'mode-1': true },
    description: ''
  },
  // Semantic コレクション（エイリアス参照を含む）
  {
    id: 'var-5',
    name: 'Color/Brand',
    variableCollectionId: 'collection-2',
    resolvedType: 'COLOR',
    valuesByMode: { 'mode-2': { type: 'VARIABLE_ALIAS', id: 'var-1' } },
    description: 'Brand color (alias)'
  },
  {
    id: 'var-6',
    name: 'Text/Default',
    variableCollectionId: 'collection-2',
    resolvedType: 'STRING',
    valuesByMode: { 'mode-2': 'Hello World' },
    description: ''
  }
];

describe('exportToDesignTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Figma APIのモックを設定
    (globalThis.figma.variables.getLocalVariableCollectionsAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValue(mockCollections);
    (globalThis.figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValue(mockVariables);
  });

  it('単一コレクションをW3C形式でエクスポートできる', async () => {
    const result = await exportToDesignTokens(['collection-1']);
    
    expect(result.tokenCount).toBe(4);
    
    const json = JSON.parse(result.json);
    
    // コレクション名がルートグループになっていることを確認
    expect(json).toHaveProperty('Primitives');
    
    // 色トークンの確認
    expect(json.Primitives.Color.Primary['500']).toEqual({
      $type: 'color',
      $value: '#3366cc',
      $description: 'Primary color 500'
    });
    
    // 数値トークンの確認
    expect(json.Primitives.Spacing.Base).toEqual({
      $type: 'number',
      $value: 16,
      $description: 'Base spacing unit'
    });
    
    // 真偽値トークンの確認
    expect(json.Primitives.Flag.IsEnabled).toEqual({
      $type: 'boolean',
      $value: true
    });
  });

  it('複数コレクションをマージしてエクスポートできる', async () => {
    const result = await exportToDesignTokens(['collection-1', 'collection-2']);
    
    expect(result.tokenCount).toBe(6);
    
    const json = JSON.parse(result.json);
    
    // 両方のコレクションが含まれていることを確認
    expect(json).toHaveProperty('Primitives');
    expect(json).toHaveProperty('Semantic');
    
    // Semanticコレクションのトークン確認
    expect(json.Semantic.Color.Brand.$type).toBe('color');
    expect(json.Semantic.Text.Default.$type).toBe('string');
  });

  it('エイリアス参照を{path}形式で出力する', async () => {
    const result = await exportToDesignTokens(['collection-1', 'collection-2']);
    
    const json = JSON.parse(result.json);
    
    // エイリアス参照が正しいパス形式になっていることを確認
    expect(json.Semantic.Color.Brand.$value).toBe('{Primitives.Color.Primary.500}');
  });

  it('色の値をHEX形式で出力する', async () => {
    const result = await exportToDesignTokens(['collection-1']);
    
    const json = JSON.parse(result.json);
    
    // RGB(0.2, 0.4, 0.8) → #3366cc
    expect(json.Primitives.Color.Primary['500'].$value).toBe('#3366cc');
    
    // RGB(0.9, 0.95, 1) → #e6f2ff (0.95 * 255 = 242.25 → 242 = 0xf2)
    expect(json.Primitives.Color.Primary['100'].$value).toBe('#e6f2ff');
  });

  it('空のコレクションリストの場合は0トークンを返す', async () => {
    const result = await exportToDesignTokens([]);
    
    expect(result.tokenCount).toBe(0);
    expect(result.json).toBe('{}');
  });

  it('存在しないコレクションIDは無視される', async () => {
    const result = await exportToDesignTokens(['non-existent-collection']);
    
    expect(result.tokenCount).toBe(0);
  });

  it('descriptionが空の場合は$descriptionプロパティを含めない', async () => {
    const result = await exportToDesignTokens(['collection-1']);
    
    const json = JSON.parse(result.json);
    
    // descriptionがあるトークン
    expect(json.Primitives.Color.Primary['500']).toHaveProperty('$description');
    
    // descriptionがないトークン
    expect(json.Primitives.Color.Primary['100']).not.toHaveProperty('$description');
    expect(json.Primitives.Flag.IsEnabled).not.toHaveProperty('$description');
  });
});

describe('パス変換', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // スペースを含むコレクション名のモック
    const collectionsWithSpaces = [
      {
        id: 'collection-space',
        name: 'My Design System',
        modes: [{ modeId: 'mode-s', name: 'Default' }],
        variableIds: ['var-s1']
      }
    ];
    
    const variablesWithSpaces = [
      {
        id: 'var-s1',
        name: 'Brand Colors/Primary Blue',
        variableCollectionId: 'collection-space',
        resolvedType: 'COLOR',
        valuesByMode: { 'mode-s': { r: 0, g: 0.5, b: 1, a: 1 } },
        description: ''
      }
    ];
    
    (globalThis.figma.variables.getLocalVariableCollectionsAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValue(collectionsWithSpaces);
    (globalThis.figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValue(variablesWithSpaces);
  });

  it('スペースを含む名前はアンダースコアに変換される', async () => {
    const result = await exportToDesignTokens(['collection-space']);
    
    const json = JSON.parse(result.json);
    
    // スペースがアンダースコアに変換されていることを確認
    expect(json).toHaveProperty('My_Design_System');
    expect(json.My_Design_System).toHaveProperty('Brand_Colors');
    expect(json.My_Design_System.Brand_Colors).toHaveProperty('Primary_Blue');
  });
});

describe('アルファチャンネル付き色', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    const collectionsWithAlpha = [
      {
        id: 'collection-alpha',
        name: 'Colors',
        modes: [{ modeId: 'mode-a', name: 'Default' }],
        variableIds: ['var-a1', 'var-a2']
      }
    ];
    
    const variablesWithAlpha = [
      {
        id: 'var-a1',
        name: 'Overlay/Light',
        variableCollectionId: 'collection-alpha',
        resolvedType: 'COLOR',
        valuesByMode: { 'mode-a': { r: 1, g: 1, b: 1, a: 0.5 } },
        description: ''
      },
      {
        id: 'var-a2',
        name: 'Solid/Black',
        variableCollectionId: 'collection-alpha',
        resolvedType: 'COLOR',
        valuesByMode: { 'mode-a': { r: 0, g: 0, b: 0, a: 1 } },
        description: ''
      }
    ];
    
    (globalThis.figma.variables.getLocalVariableCollectionsAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValue(collectionsWithAlpha);
    (globalThis.figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>)
      .mockResolvedValue(variablesWithAlpha);
  });

  it('アルファ値が1未満の場合は8桁HEXで出力する', async () => {
    const result = await exportToDesignTokens(['collection-alpha']);
    
    const json = JSON.parse(result.json);
    
    // アルファ0.5 → 80 (約128/255)
    expect(json.Colors.Overlay.Light.$value).toBe('#ffffff80');
    
    // アルファ1.0 → 6桁HEX
    expect(json.Colors.Solid.Black.$value).toBe('#000000');
  });
});
