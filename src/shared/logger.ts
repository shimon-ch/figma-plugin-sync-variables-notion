// シンプルなロガー実装
const isDevelopment = typeof process !== 'undefined' 
  ? process.env.NODE_ENV === 'development'
  : import.meta.env?.MODE === 'development';

/**
 * 機密情報をマスクする
 */
function maskSensitiveData(args: any[]): any[] {
  return args.map(arg => {
    if (typeof arg === 'string') {
      // Notion APIキーをマスク (ntn_で始まる43文字)
      let masked = arg.replace(/ntn_[a-zA-Z0-9]{43}/g, 'ntn_***[MASKED]***');
      // UUIDをマスク
      masked = masked.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '***[UUID-MASKED]***');
      // 32文字のハッシュをマスク
      masked = masked.replace(/\b[a-f0-9]{32}\b/gi, '***[HASH-MASKED]***');
      return masked;
    }
    if (typeof arg === 'object' && arg !== null) {
      const masked = { ...arg };
      // オブジェクト内の機密情報フィールドをマスク
      const sensitiveKeys = ['apiKey', 'notion_api_key', 'notionApiKey', 'token', 'proxyToken', 'notion_proxy_token', 'password', 'secret'];
      for (const key of sensitiveKeys) {
        if (key in masked && typeof masked[key] === 'string') {
          masked[key] = '***[MASKED]***';
        }
      }
      return masked;
    }
    return arg;
  });
}

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...maskSensitiveData(args));
    }
  },
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...maskSensitiveData(args));
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...maskSensitiveData(args));
    }
  },
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...maskSensitiveData(args));
    }
  }
};
