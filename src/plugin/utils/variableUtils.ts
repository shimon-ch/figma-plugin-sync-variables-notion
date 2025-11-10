// Figma Variables操作のユーティリティ関数
import { VariableType, VariableHierarchy, NotionVariable } from '../../shared/types';
import { logger } from '../../shared/logger';

// Variable型をFigma型に変換
export function convertToFigmaVariableType(type: VariableType): VariableResolvedDataType {
  switch (type) {
    case VariableType.COLOR:
      return 'COLOR';
    case VariableType.NUMBER:
      return 'FLOAT';
    case VariableType.STRING:
      return 'STRING';
    case VariableType.BOOLEAN:
      return 'BOOLEAN';
    default:
      return 'STRING';
  }
}

// 値の型を自動判定
export function detectVariableType(value: any): VariableType {
  if (typeof value === 'boolean') {
    return VariableType.BOOLEAN;
  }
  
  if (typeof value === 'number') {
    return VariableType.NUMBER;
  }
  
  if (typeof value === 'string') {
    // カラーコードの判定（HEX, RGB, RGBA）
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
    const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/;
    
    if (hexPattern.test(value) || rgbPattern.test(value)) {
      return VariableType.COLOR;
    }
    
    // 数値文字列の判定
    if (!isNaN(Number(value)) && value.trim() !== '') {
      return VariableType.NUMBER;
    }
    
    // true/falseの文字列判定
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      return VariableType.BOOLEAN;
    }
  }
  
  return VariableType.STRING;
}

// 色の値をRGBAに変換
export function parseColor(value: any): RGBA {
  if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
    return {
      r: value.r,
      g: value.g,
      b: value.b,
      a: value.a || 1
    };
  }
  
  if (typeof value === 'string') {
    // HEXカラーの処理 (#RRGGBB[AA])
    const hexMatch = value.match(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.substr(6, 2), 16) / 255 : 1;
      return { r, g, b, a };
    }
    // short HEX #RGB or #RGBA
    const short = value.match(/^#([A-Fa-f0-9]{3,4})$/);
    if (short) {
      const h = short[1];
      const r = parseInt(h[0] + h[0], 16) / 255;
      const g = parseInt(h[1] + h[1], 16) / 255;
      const b = parseInt(h[2] + h[2], 16) / 255;
      const a = h[3] ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    
    // RGB/RGBAの処理（空白/カンマ混在、百分率、alphaに/も許容）
    const rgbMatch = value.match(/^rgba?\(\s*([^\)]+)\)$/i);
    if (rgbMatch) {
      const raw = rgbMatch[1].trim();
      let rStr: string, gStr: string, bStr: string, aStr: string | undefined;
      if (raw.includes('/')) {
        const [left, aPart] = raw.split('/').map(p => p.trim());
        aStr = aPart;
        const parts = left.split(/[ ,]+/).map(p => p.trim());
        [rStr, gStr, bStr] = parts as any;
      } else {
        const parts = raw.split(/[ ,]+/).map(p => p.trim());
        [rStr, gStr, bStr, aStr] = parts as any;
      }
      const chan = (x?: string) => x?.endsWith('%') ? Math.max(0, Math.min(1, parseFloat(x) / 100)) : (Number(x) / 255);
      const r = chan(rStr) || 0;
      const g = chan(gStr) || 0;
      const b = chan(bStr) || 0;
      const a = aStr ? (aStr.endsWith('%') ? Math.max(0, Math.min(1, parseFloat(aStr) / 100)) : Math.max(0, Math.min(1, parseFloat(aStr)))) : 1;
      return { r, g, b, a };
    }
  }
  
  // デフォルト値
  return { r: 0, g: 0, b: 0, a: 1 };
}

// 階層パスからVariable名を生成（スラッシュ区切り）
export function createVariableName(hierarchy: VariableHierarchy): string {
  if (hierarchy.path.length > 0) {
    return [...hierarchy.path, hierarchy.name].join('/');
  }
  return hierarchy.name;
}

// Variable名から階層構造を解析
export function parseVariableName(fullName: string): VariableHierarchy {
  const parts = fullName.split('/');
  const name = parts[parts.length - 1];
  const path = parts.slice(0, -1);
  
  return {
    path,
    name,
    value: null,
    type: VariableType.STRING
  };
}

// Variableコレクションを作成または取得
export async function createVariableCollection(
  name: string, 
  createNew: boolean = false
): Promise<VariableCollection> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  
  if (!createNew) {
    const existing = collections.find(c => c.name === name);
    if (existing) {
      return existing;
    }
  }
  
  // 新しいコレクションを作成
  const collection = figma.variables.createVariableCollection(name);
  
  // デフォルトモードの名前を設定
  const modeId = collection.modes[0].modeId;
  collection.renameMode(modeId, "Default");
  
  return collection;
}

// Variableを作成または更新
export async function updateVariable(
  collection: VariableCollection,
  variable: NotionVariable
): Promise<Variable> {
  const figmaType = convertToFigmaVariableType(variable.type);
  const variableName = variable.group 
    ? `${variable.group}/${variable.name}`
    : variable.name;
  
  // 既存のVariableを検索
  const existingVariables = await figma.variables.getLocalVariablesAsync();
  let figmaVariable = existingVariables.find(
    v => v.name === variableName && v.variableCollectionId === collection.id
  );
  
  // 既存のVariableがない場合は作成
  if (!figmaVariable) {
    figmaVariable = figma.variables.createVariable(
      variableName,
      collection,
      figmaType
    );
  }
  
  // 型が異なる場合は再作成が必要
  if (figmaVariable.resolvedType !== figmaType) {
    // 古いVariableを削除
    figmaVariable.remove();
    // 新しい型で作成
    figmaVariable = figma.variables.createVariable(
      variableName,
      collection,
      figmaType
    );
  }
  
  // 値を設定
  const modeId = collection.modes[0].modeId;
  let valueToSet: VariableValue;
  
  // Variable参照のチェック（{変数名}形式）
  const isAliasWithFallback = typeof variable.value === 'string' && variable.value.includes('||');
  const isVariableReference = typeof variable.value === 'string' && 
                              variable.value.startsWith('{') && 
                              variable.value.endsWith('}') && !isAliasWithFallback;
  
  if (isVariableReference || isAliasWithFallback) {
    // Variable参照の場合
    const raw = String(variable.value);
    const [refPart, fbPart] = isAliasWithFallback ? raw.split('||') : [raw, undefined];
    const referenceName = refPart.startsWith('{') && refPart.endsWith('}') ? refPart.slice(1, -1) : refPart;
    logger.log(`Setting variable reference: ${variableName} -> ${referenceName}`);
    
    // 参照先のVariableを探す
    const referenceVariable = await findVariableByName(referenceName, existingVariables);
    
    if (referenceVariable) {
      // Variable Aliasとして設定
      valueToSet = {
        type: 'VARIABLE_ALIAS',
        id: referenceVariable.id
      } as VariableAlias;
      logger.log(`Found reference variable: ${referenceName} (ID: ${referenceVariable.id})`);
    } else {
      if (fbPart) {
        logger.warn(`Reference not found: ${referenceName}, using fallback value`);
        // フォールバック値を型に応じて適切にパース
        valueToSet = parseFallbackValue(fbPart, variable.type);
      } else {
        logger.warn(`Reference variable not found: ${referenceName}, using direct value instead`);
        valueToSet = parseVariableValue(variable);
      }
    }
  } else {
    // 通常の値の場合
    valueToSet = parseVariableValue(variable);
  }
  
  figmaVariable.setValueForMode(modeId, valueToSet);
  
  // 説明を設定
  if (variable.description) {
    figmaVariable.description = variable.description;
  }
  
  return figmaVariable;
}

// Variable名から既存のVariableを検索
export async function findVariableByName(
  name: string, 
  existingVariables?: Variable[]
): Promise<Variable | null> {
  const variables = existingVariables || await figma.variables.getLocalVariablesAsync();
  
  // 完全一致を試す
  let found = variables.find(v => v.name === name);
  if (found) return found;
  
  // グループ付きの名前を試す（例: "Primitive/color-yellow-700"）
  found = variables.find(v => v.name.endsWith(`/${name}`));
  if (found) return found;
  
  // グループなしの名前を試す（グループが含まれている場合）
  const nameParts = name.split('/');
  if (nameParts.length > 1) {
    const simpleName = nameParts[nameParts.length - 1];
    found = variables.find(v => {
      const vParts = v.name.split('/');
      return vParts[vParts.length - 1] === simpleName;
    });
  }
  // よくあるパターンの補正: Color/Neutral vs Color\Neutral vs Color>Neutral
  if (!found) {
    const normalized = name.split(/[\/:>]+/).filter(Boolean).join('/');
    found = variables.find(v => {
      const vn = v.name.split(/[\/:>]+/).filter(Boolean).join('/');
      return vn === normalized || vn.endsWith(`/${normalized}`) || normalized.endsWith(`/${vn}`);
    });
  }
  
  return found || null;
}

// Variable値をパース
function parseVariableValue(variable: NotionVariable): VariableValue {
  switch (variable.type) {
    case VariableType.COLOR:
      return parseColor(variable.value);
    case VariableType.NUMBER:
      return typeof variable.value === 'number' 
        ? variable.value 
        : parseFloat(String(variable.value));
    case VariableType.BOOLEAN:
      return typeof variable.value === 'boolean'
        ? variable.value
        : String(variable.value).toLowerCase() === 'true';
    case VariableType.STRING:
    default:
      return String(variable.value);
  }
}

// フォールバック値を型に応じてパース
function parseFallbackValue(fallbackValue: string, type: VariableType): VariableValue {
  switch (type) {
    case VariableType.COLOR:
      return parseColor(fallbackValue);
    case VariableType.NUMBER:
      const num = parseFloat(fallbackValue);
      return isNaN(num) ? 0 : num;
    case VariableType.BOOLEAN:
      return fallbackValue.toLowerCase() === 'true';
    case VariableType.STRING:
    default:
      return fallbackValue;
  }
}

// 既存のVariablesを取得
export async function getExistingVariables(
  collectionId?: string
): Promise<NotionVariable[]> {
  const variables = await figma.variables.getLocalVariablesAsync();
  const result: NotionVariable[] = [];
  
  for (const variable of variables) {
    if (collectionId && variable.variableCollectionId !== collectionId) {
      continue;
    }
    
    const collection = await figma.variables.getVariableCollectionByIdAsync(
      variable.variableCollectionId
    );
    
    if (!collection) continue;
    
    const modeId = collection.modes[0].modeId;
    const value = variable.valuesByMode[modeId];
    
    // 階層構造を解析
    const hierarchy = parseVariableName(variable.name);
    
    let type: VariableType;
    switch (variable.resolvedType) {
      case 'COLOR':
        type = VariableType.COLOR;
        break;
      case 'FLOAT':
        type = VariableType.NUMBER;
        break;
      case 'BOOLEAN':
        type = VariableType.BOOLEAN;
        break;
      case 'STRING':
      default:
        type = VariableType.STRING;
        break;
    }
    
    result.push({
      id: variable.id,
      name: hierarchy.name,
      value: value as string | number | boolean | { r: number; g: number; b: number; a: number; },
      type: type,
      description: variable.description,
      group: hierarchy.path.join('/'),
      collection: collection.name
    });
  }
  
  return result;
}

// Variableを削除
export async function deleteVariable(variableId: string): Promise<void> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(variableId);
    if (variable) {
      variable.remove();
    }
  } catch (error) {
    logger.error('Error deleting variable:', error);
  }
}
