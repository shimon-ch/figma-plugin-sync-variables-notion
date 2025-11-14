import { logger } from '@/shared/logger';

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

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('❌ Notion API error:', errorText);
      throw new Error(`Notion API error: ${response.status} - ${errorText}`);
    }

    const data: NotionQueryResponse = await response.json();
    
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

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ Notion get page error:', errorText);
    throw new Error(`Notion get page error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  logger.log('✅ Notion page received:', data?.id);
  return data;
}
