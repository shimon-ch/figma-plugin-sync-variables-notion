// UUID生成ユーティリティ（共通化）

/**
 * UUID v4を生成する
 * - ブラウザ環境: crypto.randomUUID() を使用（暗号学的に安全）
 * - フォールバック: カスタム実装（crypto.randomUUID()が利用できない環境用）
 */
export const generateUUID = (): string => {
  // ブラウザ環境ではcrypto.randomUUID()を使用
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // フォールバック: カスタムUUID v4実装
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
