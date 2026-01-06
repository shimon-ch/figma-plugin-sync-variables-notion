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
    
    // 数値文字列の判定（純粋な数値）
    if (!isNaN(Number(value)) && value.trim() !== '') {
      return VariableType.NUMBER;
    }
    
    // 単位付き数値の判定（例: 16px, 1.5rem, 24pt, 10%, 2em など）
    const numberWithUnitPattern = /^-?[\d.]+\s*(px|rem|em|%|pt|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pc|deg|rad|turn|s|ms)$/i;
    if (numberWithUnitPattern.test(value.trim())) {
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
  
  logger.log(`\n[createVariableCollection] Searching for collection: "${name}"`);
  logger.log(`  - Create new mode: ${createNew}`);
  logger.log(`  - Total collections: ${collections.length}`);
  
  // 既存コレクションを表示
  if (collections.length > 0) {
    logger.log(`  - Existing collections:`);
    collections.forEach((c, index) => {
      logger.log(`    ${index + 1}. "${c.name}" (ID: ${c.id}, variables: ${c.variableIds.length})`);
    });
  }
  
  // 完全一致で検索（大文字小文字を区別）
  let existing = collections.find(c => c.name === name);
  
  // 見つからない場合は、トリムして再検索
  if (!existing) {
    const trimmedName = name.trim();
    existing = collections.find(c => c.name.trim() === trimmedName);
    if (existing) {
      logger.log(`  - Found collection with trimmed name: "${existing.name}"`);
    }
  }
  
  // 見つからない場合は、大文字小文字を無視して再検索
  if (!existing) {
    existing = collections.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      logger.log(`  - Found collection with case-insensitive match: "${existing.name}"`);
    }
  }
  
  // 同名のコレクションが複数存在するかチェック
  const matchingCollections = collections.filter(c => 
    c.name === name || 
    c.name.trim() === name.trim() || 
    c.name.toLowerCase() === name.toLowerCase()
  );
  
  if (matchingCollections.length > 1) {
    logger.warn(`  - WARNING: Found ${matchingCollections.length} collections with similar names!`);
    matchingCollections.forEach((c, index) => {
      logger.warn(`    ${index + 1}. "${c.name}" (ID: ${c.id})`);
    });
    logger.warn(`  - Using first match: "${matchingCollections[0].name}"`);
    existing = matchingCollections[0];
  }
  
  if (!createNew && existing) {
    logger.log(`  ✅ Using existing collection: "${existing.name}" (ID: ${existing.id})`);
    return existing;
  }
  
  if (!createNew && !existing) {
    // 既存のコレクションを使用するモードだが、見つからない場合
    logger.error(`  ❌ ERROR: createNew is false, but collection "${name}" not found!`);
    logger.error(`  - Available collections: ${collections.map(c => `"${c.name}"`).join(', ')}`);
    throw new Error(`Collection "${name}" not found. Please select an existing collection or create a new one.`);
  }
  
  // 新しいコレクションを作成
  logger.log(`  - Creating new collection: "${name}"`);
  const collection = figma.variables.createVariableCollection(name);
  
  // デフォルトモードの名前を設定
  const modeId = collection.modes[0].modeId;
  collection.renameMode(modeId, "Default");
  
  logger.log(`  ✅ Created new collection: "${collection.name}" (ID: ${collection.id})`);
  
  return collection;
}

// Variableを作成または更新
// existingVariablesを渡すことで、毎回getLocalVariablesAsync()を呼ばずに済む
export async function updateVariable(
  collection: VariableCollection,
  variable: NotionVariable,
  existingVariables?: Variable[]
): Promise<Variable> {
  const figmaType = convertToFigmaVariableType(variable.type);
  const variableName = variable.group 
    ? `${variable.group}/${variable.name}`
    : variable.name;
  
  logger.log(`[updateVariable] Processing: ${variableName}`);
  logger.log(`  - Type: ${variable.type} -> ${figmaType}`);
  logger.log(`  - Value: ${JSON.stringify(variable.value)}`);
  
  // 既存のVariableを検索（渡されていない場合のみ取得）
  const allVariables = existingVariables ?? await figma.variables.getLocalVariablesAsync();
  logger.log(`  - Total variables in Figma: ${allVariables.length}`);
  
  // コレクション内の変数のみをフィルタ
  const collectionVariables = allVariables.filter(
    v => v.variableCollectionId === collection.id
  );
  logger.log(`  - Variables in this collection: ${collectionVariables.length}`);
  
  // 同名の変数が複数存在するかチェック
  const matchingVariables = collectionVariables.filter(v => v.name === variableName);
  if (matchingVariables.length > 1) {
    logger.warn(`  - Found ${matchingVariables.length} variables with the same name "${variableName}" in this collection!`);
    matchingVariables.forEach((v, index) => {
      logger.warn(`    ${index + 1}. ID: ${v.id}, Type: ${v.resolvedType}`);
    });
  }
  
  let figmaVariable = matchingVariables[0]; // 最初の一致を使用
  
  if (!figmaVariable) {
    // より広範囲に検索（コレクションIDを無視）
    const anyVariable = allVariables.find(v => v.name === variableName);
    if (anyVariable && anyVariable.variableCollectionId !== collection.id) {
      logger.warn(`  - Found variable "${variableName}" in different collection: ${anyVariable.variableCollectionId}`);
    }
  }
  
  // 既存変数の情報をログ
  if (figmaVariable) {
    const modeId = collection.modes[0].modeId;
    const currentValue = figmaVariable.valuesByMode[modeId];
    logger.log(`  - Existing variable found (ID: ${figmaVariable.id})`);
    logger.log(`    - Current type: ${figmaVariable.resolvedType}`);
    logger.log(`    - Current value: ${JSON.stringify(currentValue)}`);
    logger.log(`    - Variable collection: ${figmaVariable.variableCollectionId}`);
    logger.log(`    - Target collection: ${collection.id}`);
    
    // コレクションIDが一致しているか確認
    if (figmaVariable.variableCollectionId !== collection.id) {
      logger.error(`  - ERROR: Variable collection ID mismatch!`);
      logger.error(`    - Variable is in: ${figmaVariable.variableCollectionId}`);
      logger.error(`    - Should be in: ${collection.id}`);
    }
  } else {
    logger.log(`  - No existing variable found, will create new`);
  }
  
  // 既存のVariableがない場合は作成
  if (!figmaVariable) {
    figmaVariable = figma.variables.createVariable(
      variableName,
      collection,
      figmaType
    );
    logger.log(`  - Created new variable with type: ${figmaType}`);
  }
  
  // 型が異なる場合は再作成が必要
  if (figmaVariable.resolvedType !== figmaType) {
    logger.log(`  - Type mismatch! ${figmaVariable.resolvedType} !== ${figmaType}`);
    logger.log(`  - Removing old variable and creating new one`);
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
    const referenceVariable = await findVariableByName(referenceName, allVariables);
    
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
  
  logger.log(`  - Setting value: ${JSON.stringify(valueToSet)}`);
  
  // 値を設定（既存変数の場合は明示的に上書き）
  try {
    figmaVariable.setValueForMode(modeId, valueToSet);
    
    // 値が実際に設定されたか確認
    const newValue = figmaVariable.valuesByMode[modeId];
    logger.log(`  - Value set successfully`);
    logger.log(`  - Verified new value: ${JSON.stringify(newValue)}`);
    
    // 値が意図した通りに設定されたか検証
    const isValueCorrect = JSON.stringify(newValue) === JSON.stringify(valueToSet);
    if (!isValueCorrect) {
      logger.warn(`  - Warning: Set value doesn't match expected value!`);
      logger.warn(`    - Expected: ${JSON.stringify(valueToSet)}`);
      logger.warn(`    - Actual: ${JSON.stringify(newValue)}`);
      
      // 再試行
      logger.log(`  - Retrying to set value...`);
      figmaVariable.setValueForMode(modeId, valueToSet);
      const retryValue = figmaVariable.valuesByMode[modeId];
      logger.log(`  - Retry result: ${JSON.stringify(retryValue)}`);
    }
  } catch (error) {
    logger.error(`  - Error setting value:`, error);
    throw new Error(`Failed to set value for ${variableName}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
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
  logger.log(`  - [parseVariableValue] Type: ${variable.type}, Raw value: ${JSON.stringify(variable.value)}`);
  
  let result: VariableValue;
  switch (variable.type) {
    case VariableType.COLOR:
      result = parseColor(variable.value);
      break;
    case VariableType.NUMBER:
      result = typeof variable.value === 'number' 
        ? variable.value 
        : parseFloat(String(variable.value));
      logger.log(`  - [parseVariableValue] NUMBER: "${variable.value}" -> ${result}`);
      break;
    case VariableType.BOOLEAN:
      result = typeof variable.value === 'boolean'
        ? variable.value
        : String(variable.value).toLowerCase() === 'true';
      break;
    case VariableType.STRING:
    default:
      result = String(variable.value);
      logger.log(`  - [parseVariableValue] STRING: "${variable.value}" -> "${result}"`);
      break;
  }
  
  return result;
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
    let value = variable.valuesByMode[modeId];
    
    // Variable Aliasの場合は、その参照先の値ではなく、Aliasとして記録
    // （ただし、比較用には実際の値を保持する必要がある）
    if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'VARIABLE_ALIAS') {
      // Aliasの場合は、そのまま保持（updateVariableでも同じ形式で扱う）
      logger.log(`  - Variable ${variable.name} is an alias`);
    }
    
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
