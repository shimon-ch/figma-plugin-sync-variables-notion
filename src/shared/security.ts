/**
 * セキュリティ関連のユーティリティ
 */

import { logger } from './logger';

/**
 * APIキーを難読化（基本的な保護）
 * 注意: これは完全なセキュリティではなく、基本的な保護のみ
 * Figmaプラグイン環境ではbtoaが使えないため、シンプルなXOR暗号化のみ
 */
export function obfuscateApiKey(apiKey: string): string {
  if (!apiKey) return '';
  
  try {
    const key = 'FigmaNotionSync2024';
    let result = '';
    
    for (let i = 0; i < apiKey.length; i++) {
      // XOR暗号化して16進数に変換
      const charCode = apiKey.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += charCode.toString(16).padStart(2, '0');
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to obfuscate API key:', error);
    return apiKey; // フォールバック：そのまま返す
  }
}

/**
 * 難読化されたAPIキーを復元
 */
export function deobfuscateApiKey(obfuscatedKey: string): string {
  if (!obfuscatedKey) return '';
  
  try {
    const key = 'FigmaNotionSync2024';
    let result = '';
    
    // 16進数をデコード
    for (let i = 0; i < obfuscatedKey.length; i += 2) {
      const hexChar = obfuscatedKey.substring(i, i + 2);
      const charCode = parseInt(hexChar, 16);
      const originalChar = charCode ^ key.charCodeAt((i / 2) % key.length);
      result += String.fromCharCode(originalChar);
    }
    
    return result;
  } catch (error) {
    logger.error('Failed to deobfuscate API key:', error);
    return obfuscatedKey; // フォールバック：そのまま返す
  }
}

/**
 * APIキーの形式を検証
 */
export function validateApiKey(apiKey: string): boolean {
  if (!apiKey) return false;
  
  // Notion APIキーの基本的な形式チェック
  const notionKeyPattern = /^ntn_[a-zA-Z0-9]{43}$/;
  return notionKeyPattern.test(apiKey);
}

/**
 * データベースIDの形式を検証
 */
export function validateDatabaseId(databaseId: string): boolean {
  if (!databaseId) return false;
  
  // UUID形式またはハイフンなしの32文字
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const shortPattern = /^[a-f0-9]{32}$/i;
  
  return uuidPattern.test(databaseId) || shortPattern.test(databaseId);
}

/**
 * 安全なデータ保存のためのキー生成
 */
export function generateSecureKey(prefix: string): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  return `${prefix}_${timestamp}_${random}`;
}
