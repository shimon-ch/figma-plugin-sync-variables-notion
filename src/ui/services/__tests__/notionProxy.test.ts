import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNotionData, fetchNotionPage } from '../notionProxy';

describe('notionProxy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchNotionData', () => {
    it('should throw error when proxyUrl is empty', async () => {
      await expect(
        fetchNotionData('api-key', 'db-id', '', {})
      ).rejects.toThrow('プロキシURLが未設定です');
    });

    it('should throw error when proxyUrl is not https', async () => {
      await expect(
        fetchNotionData('api-key', 'db-id', 'http://proxy.test', {})
      ).rejects.toThrow('不正なプロキシURL');
    });

    it('should throw error for invalid URL format', async () => {
      await expect(
        fetchNotionData('api-key', 'db-id', 'not-a-url', {})
      ).rejects.toThrow('不正なプロキシURL');
    });

    it('should include X-Proxy-Token header when proxyToken is provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [], has_more: false, next_cursor: null }),
      });
      globalThis.fetch = mockFetch;

      await fetchNotionData('api-key', 'db-id', 'https://proxy.test', {}, 'my-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://proxy.test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Proxy-Token': 'my-token',
          }),
        })
      );
    });

    it('should not include X-Proxy-Token header when proxyToken is not provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [], has_more: false, next_cursor: null }),
      });
      globalThis.fetch = mockFetch;

      await fetchNotionData('api-key', 'db-id', 'https://proxy.test', {});

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Proxy-Token']).toBeUndefined();
    });

    it('should handle pagination and aggregate all results', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: '1' }, { id: '2' }],
              has_more: true,
              next_cursor: 'cursor-1',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: '3' }],
              has_more: false,
              next_cursor: null,
            }),
        });
      globalThis.fetch = mockFetch;

      const result = await fetchNotionData('api-key', 'db-id', 'https://proxy.test', {});

      expect(result.results).toHaveLength(3);
      expect(result.results).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should pass start_cursor for subsequent requests', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: '1' }],
              has_more: true,
              next_cursor: 'cursor-123',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: '2' }],
              has_more: false,
              next_cursor: null,
            }),
        });
      globalThis.fetch = mockFetch;

      await fetchNotionData('api-key', 'db-id', 'https://proxy.test', {});

      // Check second call includes start_cursor
      const secondCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCallBody.query.start_cursor).toBe('cursor-123');
    });

    it('should throw error on non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });
      globalThis.fetch = mockFetch;

      await expect(
        fetchNotionData('api-key', 'db-id', 'https://proxy.test', {})
      ).rejects.toThrow('Notion API error: 401');
    });

    it('should send correct body structure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [], has_more: false, next_cursor: null }),
      });
      globalThis.fetch = mockFetch;

      await fetchNotionData('api-key', 'db-id', 'https://proxy.test', {
        sorts: [{ property: 'Name', direction: 'ascending' }],
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toMatchObject({
        apiKey: 'api-key',
        databaseId: 'db-id',
        action: 'query',
        notionVersion: '2022-06-28',
        query: {
          sorts: [{ property: 'Name', direction: 'ascending' }],
        },
      });
    });
  });

  describe('fetchNotionPage', () => {
    it('should throw error when proxyUrl is empty', async () => {
      await expect(fetchNotionPage('api-key', 'page-id', '')).rejects.toThrow(
        'プロキシURLが未設定です'
      );
    });

    it('should throw error when proxyUrl is not https', async () => {
      await expect(
        fetchNotionPage('api-key', 'page-id', 'http://proxy.test')
      ).rejects.toThrow('不正なプロキシURL');
    });

    it('should include X-Proxy-Token header when proxyToken is provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'page-id' }),
      });
      globalThis.fetch = mockFetch;

      await fetchNotionPage('api-key', 'page-id', 'https://proxy.test', 'my-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://proxy.test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Proxy-Token': 'my-token',
          }),
        })
      );
    });

    it('should send correct body structure for retrievePage action', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'page-id' }),
      });
      globalThis.fetch = mockFetch;

      await fetchNotionPage('api-key', 'page-id', 'https://proxy.test');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody).toMatchObject({
        apiKey: 'api-key',
        pageId: 'page-id',
        action: 'retrievePage',
        notionVersion: '2022-06-28',
      });
    });

    it('should throw error on non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });
      globalThis.fetch = mockFetch;

      await expect(
        fetchNotionPage('api-key', 'page-id', 'https://proxy.test')
      ).rejects.toThrow('Notion get page error: 404');
    });
  });
});
