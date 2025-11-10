/**
 * セキュリティ関連のユーティリティ
 */

import { logger } from './logger';

/**
 * APIキーを難読化（基本的な保護）
 * 注意: これは完全なセキュリティではなく、基本的な保護のみ
 */
export function obfuscateApiKey(apiKey: string): string {
  if (!apiKey) return '';
  
  // Base64エンコード + 簡単なXOR暗号化
  const encoded = btoa(apiKey);
  const key = 'FigmaNotionSync2024';
  let result = '';
  
  for (let i = 0; i < encoded.length; i++) {
    result += String.fromCharCode(
      encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  
  return btoa(result);
}

/**
 * 難読化されたAPIキーを復元
 */
export function deobfuscateApiKey(obfuscatedKey: string): string {
  if (!obfuscatedKey) return '';
  
  try {
    const decoded = atob(obfuscatedKey);
    const key = 'FigmaNotionSync2024';
    let result = '';
    
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    
    return atob(result);
  } catch (error) {
    logger.error('Failed to deobfuscate API key:', error);
    return '';
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
