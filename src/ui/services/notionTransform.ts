/**
 * Notionデータの変換ユーティリティ
 */

import { NotionVariable, FieldMapping } from '@/shared/types';
import { logger } from '@/shared/logger';

/**
 * マッピング設定からNotionフィールド名を取得するヘルパー
 */
export const getNotionFieldName = (
  mappings: FieldMapping[] | undefined,
  variableProperty: FieldMapping['variableProperty'],
  defaultValue: string
): string => {
  if (!mappings || mappings.length === 0) return defaultValue;
  const mapping = mappings.find(m => m.variableProperty === variableProperty);
  return mapping?.notionField || defaultValue;
};

/**
 * HEX変換用ヘルパー
 */
export const toHex = (n: number): string => 
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * パーセント値をバイト値に変換
 */
export const pctToByte = (s: string): number => {
  const p = parseFloat(s);
  return Math.round(Math.max(0, Math.min(100, p)) * 2.55);
};

/**
 * HSLをRGBに変換
 */
export const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  
  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

/**
 * 色値を正規化してHEX形式に変換
 */
export const normalizeColor = (val: any): string => {
  if (val == null) return '';
  
  if (typeof val === 'string') {
    const s = val.trim();
    
    // HEX #RRGGBB[AA]
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) return s;
    
    // HEX RRGGBB[AA] (# なし)
    if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) return `#${s}`;
    
    // short HEX #RGB or #RGBA
    const short = s.match(/^#([0-9a-fA-F]{3,4})$/);
    if (short) {
      const h = short[1];
      const r = h[0] + h[0];
      const g = h[1] + h[1];
      const b = h[2] + h[2];
      const a = h[3] ? h[3] + h[3] : '';
      return `#${r}${g}${b}${a}`;
    }
    
    // rgb/rgba (カンマ区切り、スペース区切り、% 対応、alpha は / または , 対応)
    const rgb = s.match(/^rgba?\(\s*([^\)]+)\)$/i);
    if (rgb) {
      const raw = rgb[1].trim();
      let rStr: string, gStr: string, bStr: string, aStr: string | undefined;
      
      if (raw.includes('/')) {
        const [left, aPart] = raw.split('/').map(p => p.trim());
        aStr = aPart;
        const parts = left.split(/[ ,]+/).map(p => p.trim());
        [rStr, gStr, bStr] = parts;
      } else {
        const parts = raw.split(/[ ,]+/).map(p => p.trim());
        [rStr, gStr, bStr, aStr] = parts;
      }
      
      const parseChan = (x?: string) => x?.endsWith('%') ? pctToByte(x) : Number(x);
      const r = parseChan(rStr) ?? 0;
      const g = parseChan(gStr) ?? 0;
      const b = parseChan(bStr) ?? 0;
      let a = 1;
      if (aStr != null) {
        a = aStr.endsWith('%') 
          ? Math.max(0, Math.min(1, parseFloat(aStr) / 100)) 
          : Number(aStr);
      }
      return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a * 255) : ''}`;
    }
    
    // hsl/hsla
    const hsl = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/i);
    if (hsl) {
      const h = parseFloat(hsl[1]);
      const S = parseFloat(hsl[2]) / 100;
      const L = parseFloat(hsl[3]) / 100;
      const a = hsl[4] != null ? Math.max(0, Math.min(1, parseFloat(hsl[4]))) : 1;
      const { r, g, b } = hslToRgb(h, S, L);
      return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a * 255) : ''}`;
    }
    
    // plain "r,g,b" numbers
    const csv = s.match(/^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*$/);
    if (csv) {
      const r = Number(csv[1]);
      const g = Number(csv[2]);
      const b = Number(csv[3]);
      const a = csv[4] != null ? Number(csv[4]) : 1;
      return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a * 255) : ''}`;
    }
    
    // 文字列はそのまま返す（プラグイン側で型判定）
    return s;
  }
  
  // {r,g,b,a} 0..1 形式をHEXへ
  if (typeof val === 'object' && 'r' in val && 'g' in val && 'b' in val) {
    const r = toHex((val as any).r * 255);
    const g = toHex((val as any).g * 255);
    const b = toHex((val as any).b * 255);
    const a = (val as any).a != null && (val as any).a < 1 
      ? toHex((val as any).a * 255) 
      : '';
    return `#${r}${g}${b}${a}`;
  }
  
  return val;
};

/**
 * Notionプロパティから値を抽出
 */
export const extractFromProperty = (props: any, key?: string): any => {
  if (!props || !key) return '';
  const p = props[key];
  if (!p || !p.type) return '';
  
  const extractPlain = (arr: any) => (Array.isArray(arr) && arr[0]?.plain_text) || '';
  
  switch (p.type) {
    case 'title':
      return extractPlain(p.title);
    case 'rich_text':
      return extractPlain(p.rich_text);
    case 'formula': {
      const f = p.formula;
      if (!f) return '';
      switch (f.type) {
        case 'string':
          return f.string || '';
        case 'number':
          return f.number ?? '';
        case 'boolean':
          return f.boolean ? 'true' : 'false';
        case 'date':
          return f.date?.start || '';
        default:
          return '';
      }
    }
    case 'number':
      return p.number ?? '';
    case 'select':
      return p.select?.name ?? '';
    case 'multi_select':
      return Array.isArray(p.multi_select) 
        ? p.multi_select.map((s: any) => s?.name).filter(Boolean).join(', ') 
        : '';
    case 'date':
      return p.date?.start || '';
    case 'rollup': {
      const roll = p.rollup;
      if (!roll) return '';
      switch (roll.type) {
        case 'number':
          return roll.number ?? '';
        case 'date':
          return roll.date?.start || '';
        case 'array': {
          const first = Array.isArray(roll.array) ? roll.array[0] : undefined;
          if (!first) return '';
          return first?.plain_text || 
                 extractPlain(first?.rich_text) || 
                 extractPlain(first?.title) || 
                 first?.name || 
                 JSON.stringify(first);
        }
        case 'rich_text':
          return extractPlain(roll.rich_text);
        case 'title':
          return extractPlain(roll.title);
        default:
          return '';
      }
    }
    default:
      return '';
  }
};

/**
 * パスを正規化（スラッシュ区切りに統一）
 */
export const sanitizePath = (p: string): string => 
  p.split(/[\/:>]+/).map(s => s.trim()).filter(Boolean).join('/');

/**
 * 名前を正規化（トリム）
 */
export const sanitizeName = (n: string): string => n.trim();

/**
 * Notionページから値を読み取る
 */
export const readValueFromPage = (pageObj: any): any => {
  const p = pageObj?.properties || {};
  // Value列、ValueRollup列、Hex、Color、Nameの順にチェック
  let v = extractFromProperty(p, 'Value');
  if (!v) v = extractFromProperty(p, 'ValueRollup');
  if (!v) v = extractFromProperty(p, 'Hex');
  if (!v) v = extractFromProperty(p, 'Color');
  if (!v) v = extractFromProperty(p, 'Name');
  return v;
};

/**
 * NotionレスポンスをNotionVariable配列に変換
 */
export async function transformNotionResponse(
  raw: any[],
  apiKey: string,
  proxyUrl: string,
  proxyToken: string | undefined,
  fetchNotionPage: (apiKey: string, pageId: string, proxyUrl: string, proxyToken?: string) => Promise<any>,
  mappings?: FieldMapping[]
): Promise<NotionVariable[]> {
  // マッピングからNotionフィールド名を取得（デフォルト値付き）
  const nameKey = getNotionFieldName(mappings, 'name', 'Name');
  const valuePrimaryKey = 'ValueRollup'; // ロールアップは固定
  const valueFallbackKey = getNotionFieldName(mappings, 'value', 'Value');
  const typeKey = getNotionFieldName(mappings, 'type', 'Type');
  const groupKey = getNotionFieldName(mappings, 'group', 'Group');
  const descKey = getNotionFieldName(mappings, 'description', 'Description');
  const unitKey = getNotionFieldName(mappings, 'unit', ''); // unitは空文字がデフォルト（使用しない）

  // relationページのキャッシュ
  const pageCache = new Map<string, any>();
  
  // 事前に各ページの最終的なVariable名を推定
  const pageIdToVarName = new Map<string, string>();
  if (Array.isArray(raw)) {
    for (const p of raw) {
      const props0 = p?.properties || {};
      const g0 = sanitizePath(extractFromProperty(props0, groupKey) || p?.group || '');
      const n0 = sanitizeName(extractFromProperty(props0, nameKey) || p?.name || 'Untitled');
      const vn0 = g0 ? `${g0}/${n0}` : n0;
      if (p?.id) pageIdToVarName.set(p.id, vn0);
    }
  }

  const variables: NotionVariable[] = [];
  
  if (Array.isArray(raw)) {
    for (const page of raw) {
      const props = page?.properties || {};
      const rawName = extractFromProperty(props, nameKey) || page?.name || 'Untitled';
      const name = sanitizeName(rawName);
      let value: any = extractFromProperty(props, valuePrimaryKey);
      if (!value) value = extractFromProperty(props, valueFallbackKey);

      // relation解決（Value列がrelationのとき）
      let isAlias = false;
      
      // まずロールアップ由来の {alias} を検出
      if (typeof value === 'string' && /^\{[^}]+\}$/.test(value)) {
        isAlias = true;
        const valueProp = props[valueFallbackKey];
        const firstRelId = valueProp?.type === 'relation' && 
                          Array.isArray(valueProp.relation) && 
                          valueProp.relation[0]?.id;
        let aliasTarget = value.slice(1, -1);
        let fallbackHex = '';
        
        try {
          if (firstRelId) {
            let related: any = pageCache.get(firstRelId);
            if (!related) {
              related = await fetchNotionPage(apiKey, firstRelId, proxyUrl, proxyToken);
              pageCache.set(firstRelId, related);
            }
            const relatedProps = related?.properties || {};
            const relatedName = sanitizeName(extractFromProperty(relatedProps, nameKey) || related?.name || '');
            const relatedGroup = sanitizePath(extractFromProperty(relatedProps, groupKey) || related?.group || '');
            if (relatedName) {
              aliasTarget = relatedGroup ? `${relatedGroup}/${relatedName}` : relatedName;
            }
            const direct = readValueFromPage(related);
            fallbackHex = normalizeColor(direct);
          }
        } catch (e) {
          logger.error('[notionTransform] rollup alias解決に失敗:', e);
        }
        value = fallbackHex ? `{${aliasTarget}}||${fallbackHex}` : `{${aliasTarget}}`;
      }
      
      if (!value) {
        const valueProp = props[valueFallbackKey];
        if (valueProp && valueProp.type === 'relation') {
          const firstRelId = Array.isArray(valueProp.relation) && valueProp.relation[0]?.id;
          if (firstRelId) {
            try {
              // まず同一クエリ内のページから名前解決
              let aliasTarget = pageIdToVarName.get(firstRelId) || '';
              if (!aliasTarget) {
                let related: any = pageCache.get(firstRelId);
                if (!related) {
                  related = await fetchNotionPage(apiKey, firstRelId, proxyUrl, proxyToken);
                  pageCache.set(firstRelId, related);
                }
                const relatedProps = related?.properties || {};
                const relatedName = sanitizeName(extractFromProperty(relatedProps, nameKey) || related?.name || '');
                const relatedGroup = sanitizePath(extractFromProperty(relatedProps, groupKey) || related?.group || '');
                aliasTarget = relatedGroup ? `${relatedGroup}/${relatedName}` : relatedName;
              }
              if (aliasTarget) {
                value = `{${aliasTarget}}`;
                isAlias = true;
              } else {
                // フォールバックで直接値
                let relatedPage = pageCache.get(firstRelId);
                if (!relatedPage) {
                  relatedPage = await fetchNotionPage(apiKey, firstRelId, proxyUrl, proxyToken);
                  pageCache.set(firstRelId, relatedPage);
                }
                value = readValueFromPage(relatedPage);
              }
            } catch (e) {
              logger.error('[notionTransform] relation解決に失敗:', e);
            }
          }
        }
      }

      if (!isAlias) {
        value = normalizeColor(value);
      }
      
      const type = String(extractFromProperty(props, typeKey) || '').toUpperCase();
      const group = sanitizePath(extractFromProperty(props, groupKey) || page?.group || '');
      
      // descriptionとunitの結合処理
      let description = extractFromProperty(props, descKey) || page?.description || '';
      if (unitKey) {
        const unit = extractFromProperty(props, unitKey) || '';
        if (unit) {
          // unitがある場合、descriptionに結合
          description = description 
            ? `${description} [${unit}]` 
            : `[${unit}]`;
        }
      }
      
      logger.log('[notionTransform] resolved token', { name, group, type, isAlias, value, description });
      
      const item: NotionVariable = {
        id: page?.id || crypto.randomUUID(),
        name,
        value,
        type: type as any,
        group,
        description
      };
      variables.push(item);
    }
  }
  
  return variables;
}

