import { logger } from '@/shared/logger';
import { RateLimitInfo } from '@/shared/types';

interface NotionDatabaseQueryParams {
  sorts?: Array<{ timestamp?: string; property?: string; direction: 'ascending' | 'descending' }>;
  filter?: Record<string, unknown>;
  start_cursor?: string;
  page_size?: number;
}

interface NotionQueryResponse {
  results: unknown[];
  has_more: boolean;
  next_cursor: string | null;
}

// 最新のレート制限情報（モジュールレベルで保持）
let _latestRateLimitInfo: RateLimitInfo | null = null;

/**
 * 最新のレート制限情報を取得する
 * プロキシからレスポンスを受け取るたびに更新される
 */
export function getLatestRateLimitInfo(): RateLimitInfo | null {
  return _latestRateLimitInfo;
}

/**
 * レスポンスヘッダーからレート制限情報を抽出・更新する
 */
function updateRateLimitInfo(response: Response): RateLimitInfo | null {
  const plan = response.headers.get('X-Proxy-Plan');
  const dailyLimitStr = response.headers.get('X-Proxy-Daily-Limit');
  const requestsTodayStr = response.headers.get('X-Proxy-Requests-Today');

  if (!plan && !dailyLimitStr) return _latestRateLimitInfo;

  const info: RateLimitInfo = {
    plan: plan || 'unknown',
    dailyLimit: dailyLimitStr ? parseInt(dailyLimitStr, 10) : 100000,
    requestsToday: requestsTodayStr ? parseInt(requestsTodayStr, 10) : -1,
  };

  _latestRateLimitInfo = info;
  logger.log(`📊 Proxy rate limit: ${info.requestsToday}/${info.dailyLimit} (${info.plan})`);
  return info;
}

/**
 * Cloudflare のレート制限エラー (1015/1027) や非JSONレスポンスを検出し、
 * ユーザーにわかりやすいエラーメッセージを生成する
 */
function detectCloudflareRateLimitError(status: number, body: string): string | null {
  if (status === 429) {
    return 'プロキシの無料枠リクエスト上限に達しました。明日（UTC 0:00）にリセットされます。';
  }

  // Cloudflare エラーコード 1015 (バースト上限) / 1027 (日次上限)
  if (body.includes('error code: 1015')) {
    return 'プロキシへのリクエストが集中しています（1,000リクエスト/分の上限）。少し待ってから再試行してください。';
  }
  if (body.includes('error code: 1027')) {
    return 'プロキシの無料枠（100,000リクエスト/日）の上限に達しました。明日（UTC 0:00）にリセットされます。';
  }

  // 非JSONレスポンス（Cloudflare エラーページ）の検出
  const contentIsHtml = body.trimStart().startsWith('<!') || body.trimStart().startsWith('<html');
  if (contentIsHtml) {
    return 'プロキシから予期しないレスポンスを受信しました。無料枠の上限に達した可能性があります。';
  }

  return null;
}

function assertHttps(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('プロキシURLはhttpsを使用してください。');
    } catch {
    throw new Error('不正なプロキシURLです。https:// から始まる完全なURLを入力してください。');
  }
}

export async function fetchNotionData(
  apiKey: string, 
  databaseId: string, 
  proxyUrl: string, 
  query?: NotionDatabaseQueryParams, 
  proxyToken?: string
): Promise<NotionQueryResponse> {
  logger.log('📡 Fetching Notion data (via proxy)...');
  const PROXY_URL = (proxyUrl || '').trim();
  if (!PROXY_URL) {
    throw new Error('プロキシURLが未設定です。フォームにWorkersのURLを入力してください。');
  }
  assertHttps(PROXY_URL);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (proxyToken) headers['X-Proxy-Token'] = proxyToken;
  
  // ページネーション対応：全てのデータを取得
  let allResults: unknown[] = [];
  let hasMore = true;
  let startCursor: string | null | undefined = undefined;
  let pageCount = 0;
  
  while (hasMore) {
    pageCount++;
    logger.log(`📄 Fetching page ${pageCount}...${startCursor ? ` (cursor: ${startCursor.substring(0, 8)}...)` : ''}`);
    
    const queryWithCursor: NotionDatabaseQueryParams = {
      ...query,
      ...(startCursor ? { start_cursor: startCursor } : {})
    };
    
    const response: Response = await fetch(PROXY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        apiKey,
        databaseId,
        action: 'query',
        notionVersion: '2022-06-28',
        query: queryWithCursor
      })
    });

    // レート制限情報を更新
    updateRateLimitInfo(response);

    if (!response.ok) {
      const errorText = await response.text();

      // Cloudflare レート制限エラーの検出
      const rateLimitMsg = detectCloudflareRateLimitError(response.status, errorText);
      if (rateLimitMsg) {
        logger.error('⚠️ Rate limit error:', rateLimitMsg);
        throw new Error(rateLimitMsg);
      }

      logger.error('❌ Notion API error:', errorText);
      throw new Error(`Notion API error: ${response.status} - ${errorText}`);
    }

    // JSONパースの安全な処理
    let data: NotionQueryResponse;
    try {
      data = await response.json();
    } catch {
      const text = await response.clone().text();
      const rateLimitMsg = detectCloudflareRateLimitError(response.status, text);
      throw new Error(rateLimitMsg || 'プロキシから不正なレスポンスを受信しました。');
    }
    
    if (data.results && Array.isArray(data.results)) {
      allResults = allResults.concat(data.results);
      logger.log(`✅ Page ${pageCount} received: ${data.results.length} items (total: ${allResults.length})`);
    }
    
    hasMore = data.has_more === true;
    startCursor = data.next_cursor;
    
    // 無限ループ防止（最大1000ページ = 100,000件まで）
    if (pageCount >= 1000) {
      logger.warn('⚠️ Reached maximum page limit (1000 pages)');
      break;
    }
  }
  
  logger.log(`✅ All Notion data received: ${allResults.length} total items from ${pageCount} pages`);
  
  return {
    results: allResults,
    has_more: false,
    next_cursor: null
  };
}

export async function fetchNotionPage(apiKey: string, pageId: string, proxyUrl: string, proxyToken?: string) {
  logger.log('📄 Fetch Notion page (via proxy)...', pageId);
  const PROXY_URL = (proxyUrl || '').trim();
  if (!PROXY_URL) {
    throw new Error('プロキシURLが未設定です。フォームにWorkersのURLを入力してください。');
  }
  assertHttps(PROXY_URL);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (proxyToken) headers['X-Proxy-Token'] = proxyToken;

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      apiKey,
      pageId,
      action: 'retrievePage',
      notionVersion: '2022-06-28'
    })
  });

  // レート制限情報を更新
  updateRateLimitInfo(response);

  if (!response.ok) {
    const errorText = await response.text();

    // Cloudflare レート制限エラーの検出
    const rateLimitMsg = detectCloudflareRateLimitError(response.status, errorText);
    if (rateLimitMsg) {
      logger.error('⚠️ Rate limit error:', rateLimitMsg);
      throw new Error(rateLimitMsg);
    }

    logger.error('❌ Notion get page error:', errorText);
    throw new Error(`Notion get page error: ${response.status} - ${errorText}`);
  }

  // JSONパースの安全な処理
  let data;
  try {
    data = await response.json();
  } catch {
    const text = await response.clone().text();
    const rateLimitMsg = detectCloudflareRateLimitError(response.status, text);
    throw new Error(rateLimitMsg || 'プロキシから不正なレスポンスを受信しました。');
  }

  logger.log('✅ Notion page received:', data?.id);
  return data;
}
