import { logger } from '@/shared/logger';

function assertHttps(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error('プロキシURLはhttpsを使用してください。');
    } catch {
    throw new Error('不正なプロキシURLです。https:// から始まる完全なURLを入力してください。');
  }
}

export async function fetchNotionData(apiKey: string, databaseId: string, proxyUrl: string, query?: any, proxyToken?: string) {
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
  
  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      apiKey,
      databaseId,
      action: 'query',
      notionVersion: '2022-06-28',
      query
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ Notion API error:', errorText);
    throw new Error(`Notion API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  logger.log('✅ Notion data received:', data);
  return data;
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
