/**
 * Cloudflare Worker for Notion API Proxy
 * This worker acts as a proxy to bypass CORS restrictions when accessing Notion API from Figma plugins.
 *
 * Security: This template enforces a shared secret header `X-Proxy-Token`.
 * - Set an environment variable `PROXY_TOKEN` on the Worker (Dashboard → Settings → Variables → Add)
 * - The plugin UI must send the same token via `X-Proxy-Token` header
 *
 * Setup Instructions:
 * 1. Create a new Cloudflare Worker
 * 2. Replace the worker code with this template
 * 3. Add environment variable: PROXY_TOKEN (random string)
 * 4. Deploy the worker
 * 5. In the plugin UI, set the Worker URL and Proxy Token (do NOT bake into build)
 */

export default {
  async fetch(request, env, ctx) {
    // CORS - すべてのレスポンスに含める
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Notion-Version, Accept, X-Proxy-Token',
      'Access-Control-Max-Age': '86400',
    };

    // プリフライトリクエスト（OPTIONS）を最優先で処理
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 204, 
        headers: corsHeaders 
      });
    }

    try {
      // Require token for non-OPTIONS requests
      const providedToken = request.headers.get('X-Proxy-Token');
      if (!env || !env.PROXY_TOKEN) {
        return new Response(JSON.stringify({ error: 'Server Misconfiguration: PROXY_TOKEN is not set' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      if (!providedToken || providedToken !== env.PROXY_TOKEN) {
        return new Response(JSON.stringify({ error: 'Unauthorized: invalid or missing X-Proxy-Token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.includes('application/json')) {
        return new Response(JSON.stringify({ error: 'Unsupported Media Type' }), {
          status: 415,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const body = await request.json();
      const action = body.action;
      const apiKey = body.apiKey;
      const databaseId = body.databaseId;
      const pageId = body.pageId;
      const notionVersion = body.notionVersion || '2022-06-28';

      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Missing apiKey' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (!action) {
        return new Response(JSON.stringify({ error: 'Missing action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      let notionReq;
      if (action === 'query') {
        if (!databaseId) {
          return new Response(JSON.stringify({ error: 'Missing databaseId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
        notionReq = new Request(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': notionVersion,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body.query || { sorts: [{ timestamp: 'created_time', direction: 'ascending' }] })
        });
      } else if (action === 'retrievePage') {
        if (!pageId) {
          return new Response(JSON.stringify({ error: 'Missing pageId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        const url = `https://api.notion.com/v1/pages/${pageId}`;
        notionReq = new Request(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': notionVersion
          }
        });
      } else {
        return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const notionRes = await fetch(notionReq);
      const text = await notionRes.text();

      // 透過レスポンス
      return new Response(text, {
        status: notionRes.status,
        headers: { 'Content-Type': notionRes.headers.get('Content-Type') || 'application/json', ...corsHeaders }
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Proxy Error', message: error.message || 'Unknown error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }
};
