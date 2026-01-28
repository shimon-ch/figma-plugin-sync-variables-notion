// W3C Design Tokens形式へのエクスポートユーティリティ
import { logger } from '../../shared/logger';

// W3C Design Tokens形式の型定義
interface DesignToken {
  $type?: string;
  $value: string | number | boolean | object;
  $description?: string;
}

interface DesignTokenGroup {
  [key: string]: DesignToken | DesignTokenGroup;
}

// Figma Variable型からW3C型へのマッピング
function mapFigmaTypeToW3C(figmaType: string): string {
  switch (figmaType) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'number';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'string';
  }
}

// RGBAをHEX文字列に変換
function rgbaToHex(color: RGBA): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  const r = toHex(color.r);
  const g = toHex(color.g);
  const b = toHex(color.b);
  
  // アルファ値が1未満の場合のみアルファを含める
  if (color.a !== undefined && color.a < 1) {
    const a = toHex(color.a);
    return `#${r}${g}${b}${a}`;
  }
  
  return `#${r}${g}${b}`;
}

// 変数IDからトークンパスを生成するマップを作成
async function buildVariablePathMap(
  collectionIds: string[]
): Promise<Map<string, string>> {
  const pathMap = new Map<string, string>();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  
  // 対象コレクションのIDセット
  const targetCollectionIds = new Set(collectionIds);
  
  for (const variable of variables) {
    if (!targetCollectionIds.has(variable.variableCollectionId)) {
      continue;
    }
    
    const collection = collections.find(c => c.id === variable.variableCollectionId);
    if (!collection) continue;
    
    // コレクション名/変数名 → ドット区切りのパスに変換
    // 例: "Primitives" + "Color/Primary/500" → "Primitives.Color.Primary.500"
    const collectionPrefix = sanitizePathSegment(collection.name);
    const variablePath = variable.name.split('/').map(sanitizePathSegment).join('.');
    const fullPath = `${collectionPrefix}.${variablePath}`;
    
    pathMap.set(variable.id, fullPath);
  }
  
  return pathMap;
}

// パスセグメントを安全な形式に変換（スペースはアンダースコアに、特殊文字は削除）
// W3C Design Tokens仕様（Draft）では、トークンは階層的な「パス」で識別され、
// 一般にドット区切り（例: "color.background.default"）で表現されます。
// ref: https://design-tokens.github.io/community-group/format/#tokens
// - '.' はパスのセグメント区切りとして使用するため、1セグメント内では利用しない前提とし削除
// - '$' は $value, $type など仕様で定義されるメタプロパティ名の接頭辞として予約されるため除外
// - '{', '}' は JSON オブジェクトの構文文字であり、パースの曖昧さを避けるため除去
function sanitizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[{}.$]/g, '');
}

// 値をW3C形式に変換
function convertValueToW3C(
  value: VariableValue,
  figmaType: string,
  variablePathMap: Map<string, string>
): string | number | boolean | object {
  // Variable Aliasの場合
  if (typeof value === 'object' && value !== null && 'type' in value) {
    const aliasValue = value as { type: string; id: string };
    if (aliasValue.type === 'VARIABLE_ALIAS') {
      const referencePath = variablePathMap.get(aliasValue.id);
      if (referencePath) {
        return `{${referencePath}}`;
      }
      // 参照先が見つからない場合は警告を出し、元のID文字列をそのまま返却する
      logger.warn(`Alias reference not found: ${aliasValue.id}`);
      return aliasValue.id;
    }
  }
  
  // 色の場合
  if (figmaType === 'COLOR' && typeof value === 'object' && value !== null) {
    const colorValue = value as RGBA;
    return rgbaToHex(colorValue);
  }
  
  // 数値の場合
  if (figmaType === 'FLOAT' && typeof value === 'number') {
    return value;
  }
  
  // 真偽値の場合
  if (figmaType === 'BOOLEAN' && typeof value === 'boolean') {
    return value;
  }
  
  // 文字列の場合
  if (typeof value === 'string') {
    return value;
  }
  
  // その他（文字列に変換）
  return String(value);
}

// パスに沿ってオブジェクトにトークンを設定
function setTokenAtPath(
  root: DesignTokenGroup,
  pathSegments: string[],
  token: DesignToken
): void {
  let current: DesignTokenGroup = root;
  
  // 最後の要素以外のパスを辿ってグループを作成
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i];
    if (!(segment in current)) {
      current[segment] = {};
    }
    current = current[segment] as DesignTokenGroup;
  }
  
  // 最後のセグメントにトークンを設定
  const tokenName = pathSegments[pathSegments.length - 1];
  current[tokenName] = token;
}

/**
 * Figma VariablesをW3C Design Tokens形式のJSONに変換
 * @param collectionIds エクスポート対象のコレクションID配列
 * @returns { json: string, tokenCount: number }
 */
export async function exportToDesignTokens(
  collectionIds: string[]
): Promise<{ json: string; tokenCount: number }> {
  logger.log(`[exportToDesignTokens] Starting export for ${collectionIds.length} collections`);
  
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  
  // 変数ID→パスのマップを構築
  const variablePathMap = await buildVariablePathMap(collectionIds);
  
  // 対象コレクションのIDセット
  const targetCollectionIds = new Set(collectionIds);
  
  // ルートオブジェクト
  const root: DesignTokenGroup = {};
  let tokenCount = 0;
  
  for (const variable of variables) {
    if (!targetCollectionIds.has(variable.variableCollectionId)) {
      continue;
    }
    
    const collection = collections.find(c => c.id === variable.variableCollectionId);
    if (!collection) {
      logger.warn(`Collection not found for variable: ${variable.name}`);
      continue;
    }
    
    // デフォルトモードの値を取得
    const modeId = collection.modes[0].modeId;
    const value = variable.valuesByMode[modeId];
    
    if (value === undefined) {
      logger.warn(`No value for variable: ${variable.name}`);
      continue;
    }
    
    // パスセグメントを構築
    // コレクション名 + 変数名（スラッシュ区切りをドット区切りに）
    const collectionSegment = sanitizePathSegment(collection.name);
    const variableSegments = variable.name.split('/').map(sanitizePathSegment);
    const pathSegments = [collectionSegment, ...variableSegments];
    
    // W3C形式の値に変換
    const w3cValue = convertValueToW3C(value, variable.resolvedType, variablePathMap);
    const w3cType = mapFigmaTypeToW3C(variable.resolvedType);
    
    // トークンオブジェクトを作成
    const token: DesignToken = {
      $type: w3cType,
      $value: w3cValue
    };
    
    // 説明があれば追加
    if (variable.description) {
      token.$description = variable.description;
    }
    
    // ツリーに追加
    setTokenAtPath(root, pathSegments, token);
    tokenCount++;
    
    // パフォーマンス対策として、トークンごとのログ出力は上限を設ける
    if (tokenCount <= 100) {
      logger.log(`  Exported: ${pathSegments.join('.')} (${w3cType})`);
    } else if (tokenCount === 101) {
      logger.log('  ...他のトークンの詳細ログ出力は省略されました（件数が多いため）');
    }
  }
  
  logger.log(`[exportToDesignTokens] Completed: ${tokenCount} tokens exported`);
  
  // JSON文字列に変換（整形付き）
  const json = JSON.stringify(root, null, 2);
  
  return { json, tokenCount };
}
