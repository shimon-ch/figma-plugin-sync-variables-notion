import { useState, useEffect, FormEvent, useRef } from 'react';
import { fetchNotionData, fetchNotionPage } from '../services/notionProxy';
import { transformNotionResponse } from '../services/notionTransform';
import { ImportSettings, FieldMapping, NotionVariable } from '../../shared/types';
import FieldMappingEditor from './FieldMappingEditor';

interface Collection {
  id: string;
  name: string;
  variableIds?: string[];
}

const ImportTab = () => {
  const [apiKey, setApiKey] = useState('');
  const [databaseId, setDatabaseId] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [collectionName, setCollectionName] = useState('Design Tokens');
  const [collectionMode, setCollectionMode] = useState<'new' | 'existing'>('existing');
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [deleteRemovedVariables, setDeleteRemovedVariables] = useState(false);
  const [proxyToken, setProxyToken] = useState('');
  const [mappings, setMappings] = useState<FieldMapping[]>([
    { notionField: 'Name', variableProperty: 'name' },
    { notionField: 'Value', variableProperty: 'value' },
    { notionField: 'Type', variableProperty: 'type' },
    { notionField: 'Group', variableProperty: 'group' },
    { notionField: 'Description', variableProperty: 'description' }
  ]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const importTimeoutRef = useRef<number | null>(null);
  const hasLoadedDataRef = useRef(false);

  // 初期データを受信
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      
      if (msg.type === 'INIT_DATA') {
        if (msg.collections) {
          setCollections(msg.collections || []);
        }
        
        if (msg.savedData) {
          if (msg.savedData.notion_api_key) setApiKey(msg.savedData.notion_api_key);
          if (msg.savedData.notion_database_id) setDatabaseId(msg.savedData.notion_database_id);
          if (msg.savedData.collection_name) setCollectionName(msg.savedData.collection_name);
          if (msg.savedData.collection_mode) setCollectionMode(msg.savedData.collection_mode);
          if (msg.savedData.overwrite_existing !== undefined) setOverwriteExisting(msg.savedData.overwrite_existing);
          if ((msg.savedData as any).delete_removed_variables !== undefined) setDeleteRemovedVariables((msg.savedData as any).delete_removed_variables);
          if ((msg.savedData as any).notion_proxy_url) setProxyUrl((msg.savedData as any).notion_proxy_url);
          if ((msg.savedData as any).notion_proxy_token) setProxyToken((msg.savedData as any).notion_proxy_token);
        }
        
        // データ読み込み完了フラグを立てる
        hasLoadedDataRef.current = true;
      }
      
      if (msg.type === 'COLLECTIONS_DATA' && msg.data) {
        setCollections(msg.data.collections || []);
      }
      
      if (msg.type === 'OPERATION_STATUS' && msg.data) {
        setIsLoading(false);
        if (importTimeoutRef.current) {
          clearTimeout(importTimeoutRef.current);
          importTimeoutRef.current = null;
        }
        const ok = (typeof msg.data.success === 'boolean') ? msg.data.success : (msg.data.status === 'success');
        const message = msg.data.message || (ok ? 'インポートが完了しました。' : 'インポートに失敗しました。');
        setStatus({ type: ok ? 'success' : 'error', text: message });
        window.setTimeout(() => setStatus(null), 4000);
      }

      if (msg.type === 'LOADING' && msg.data) {
        setStatus({ type: 'info', text: String((msg.data as any).message || '処理中...') });
      }

      if (msg.type === 'SUCCESS' && msg.data) {
        setIsLoading(false);
        if (importTimeoutRef.current) {
          clearTimeout(importTimeoutRef.current);
          importTimeoutRef.current = null;
        }
        const message = (msg.data as any).message || 'インポートが完了しました。';
        setStatus({ type: 'success', text: message });
        window.setTimeout(() => setStatus(null), 4000);
      }

      if (msg.type === 'ERROR' && msg.data) {
        setIsLoading(false);
        if (importTimeoutRef.current) {
          clearTimeout(importTimeoutRef.current);
          importTimeoutRef.current = null;
        }
        const message = (msg.data as any).message || 'インポートに失敗しました。';
        setStatus({ type: 'error', text: message });
        window.setTimeout(() => setStatus(null), 6000);
      }
      
      if (msg.type === 'LOAD_DATA_RESPONSE' && msg.data) {
        if (msg.data.notion_api_key) setApiKey(msg.data.notion_api_key);
        if (msg.data.notion_database_id) setDatabaseId(msg.data.notion_database_id);
        if (msg.data.collection_name) setCollectionName(msg.data.collection_name);
        if (msg.data.collection_mode) setCollectionMode(msg.data.collection_mode);
        if (msg.data.overwrite_existing !== undefined) setOverwriteExisting(msg.data.overwrite_existing);
        if ((msg.data as any).delete_removed_variables !== undefined) setDeleteRemovedVariables((msg.data as any).delete_removed_variables);
        if ((msg.data as any).notion_proxy_url) setProxyUrl((msg.data as any).notion_proxy_url);
        if ((msg.data as any).notion_proxy_token) setProxyToken((msg.data as any).notion_proxy_token);
        
        // データ読み込み完了フラグを立てる
        hasLoadedDataRef.current = true;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 入力値を保存する関数
  const saveFormData = () => {
    // 空の値は送信しない（空文字列で既存の値を上書きしないため）
    const dataToSave: any = {
      collection_name: collectionName,
      collection_mode: collectionMode,
      overwrite_existing: overwriteExisting,
      delete_removed_variables: deleteRemovedVariables,
    };
    
    // 空でない値のみ追加
    if (apiKey && apiKey.trim()) dataToSave.notion_api_key = apiKey;
    if (databaseId && databaseId.trim()) dataToSave.notion_database_id = databaseId;
    if (proxyUrl && proxyUrl.trim()) dataToSave.notion_proxy_url = proxyUrl;
    if (proxyToken && proxyToken.trim()) dataToSave.notion_proxy_token = proxyToken;
    
    parent.postMessage({
      pluginMessage: {
        type: 'SAVE_DATA',
        data: dataToSave
      }
    }, '*');
  };

  // 各入力フィールドの変更時に自動保存
  useEffect(() => {
    // 初期データ読み込み完了後のみ保存
    if (!hasLoadedDataRef.current) {
      return;
    }
    saveFormData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, databaseId, collectionName, collectionMode, overwriteExisting, deleteRemovedVariables, proxyUrl, proxyToken]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!apiKey || !databaseId) {
      alert('必須項目を入力してください');
      return;
    }
    
    if (collectionMode === 'existing' && !collectionName) {
      alert('既存のコレクションを選択してください');
      return;
    }

    // 送信前に最新のデータを保存
    saveFormData();

    try {
      // 先にローディングを表示
      if (importTimeoutRef.current) {
        clearTimeout(importTimeoutRef.current);
      }
      setIsLoading(true);
      setStatus({ type: 'info', text: 'インポートを開始しました...' });
      importTimeoutRef.current = window.setTimeout(() => {
        setIsLoading(false);
        setStatus({ type: 'error', text: 'インポートがタイムアウトしました。通信状況を確認してください。' });
        importTimeoutRef.current = null;
      }, 30000);

      // 次フレームで表示更新
      await new Promise(requestAnimationFrame);

      // UI側でNotionデータを取得
      // Notionは明示的にsortしないと順序が保証されないため、created_time昇順でソート
      const notionResponse = await fetchNotionData(apiKey, databaseId, proxyUrl, {
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }]
      }, proxyToken);
      
      // Notion query の標準レスポンスは { results: [...] }
      const raw = notionResponse?.results || [];

      // 変換ロジックを専用モジュールで実行
      const variables = await transformNotionResponse(raw, apiKey, proxyUrl, proxyToken, fetchNotionPage);
      if (!Array.isArray(variables) || variables.length === 0) {
        setStatus({ type: 'error', text: 'Notionから有効なデータを取得できませんでした。' });
        return;
      }

      const settings: ImportSettings & { variables: NotionVariable[] } = {
        apiKey: apiKey,
        notionApiKey: apiKey,
        databaseId,
        collectionName,
        createNewCollection: collectionMode === 'new',
        overwriteExisting,
        deleteRemovedVariables,
        mappings,
        variables
      };

    // フォームデータを含めて送信
    parent.postMessage({
      pluginMessage: {
        type: 'IMPORT_FROM_NOTION',
        data: settings,
        formData: {
          notion_api_key: apiKey,
          notion_database_id: databaseId,
          collection_name: collectionName,
          collection_mode: collectionMode,
            overwrite_existing: overwriteExisting,
            delete_removed_variables: deleteRemovedVariables,
            notion_proxy_url: proxyUrl,
            notion_proxy_token: proxyToken
          }
      }
    }, '*');

      // ローディング状態を設定（必ず最後に設定してUI反映を確実に）
      if (importTimeoutRef.current) {
        clearTimeout(importTimeoutRef.current);
      }
      setIsLoading(true);
      setStatus({ type: 'info', text: 'インポートを開始しました...' });
      importTimeoutRef.current = window.setTimeout(() => {
        setIsLoading(false);
        setStatus({ type: 'error', text: 'インポートがタイムアウトしました。通信状況を確認してください。' });
        importTimeoutRef.current = null;
      }, 30000);
    } catch (err) {
      setIsLoading(false);
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'Notionデータ取得に失敗しました。' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <header>
        <h1 className="font-semibold">Sync Figma Variables from Notion</h1>
      </header>

      <section>
        <h2 className="text-sm font-semibold mb-4">Notion設定</h2>
        <div className="grid gap-6">
          <div>
            <label className="floating-label">
              <span>Notion APIキー *</span>
          </label>
          <input
            type="text"
            autoComplete="off"
              className="input input-sm input-bordered w-full"
              placeholder="ntn_xxxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={saveFormData}
            required
          />
            <small className="text-xs mt-1 block">※Notion IntegrationsからAPIキーを取得してください</small>
        </div>

          <div>
            <label className="floating-label">
              <span>データベースID *</span>
          </label>
          <input
            type="text"
              className="input input-sm input-bordered w-full"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            onBlur={saveFormData}
              required
            />
            <small className="text-xs mt-1 block">※NotionデータベースのURLからIDをコピーしてください</small>
          </div>

          <div>
            <label className="floating-label">
              <span>プロキシURL（Cloudflare Workers / https必須）</span>
            </label>
            <input
              type="url"
              inputMode="url"
              className="input input-sm input-bordered w-full"
              placeholder="https://your-worker.your-subdomain.workers.dev"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              onBlur={saveFormData}
            required
          />
            <small className="text-xs mt-1 block">※httpsのみ許可。URLはローカル保存され公開ビルドへは埋め込まれません。</small>
          </div>
          <div>
            <label className="floating-label">
              <span>プロキシトークン（X-Proxy-Token）</span>
            </label>
            <input
              type="text"
              autoComplete="off"
              className="input input-sm input-bordered w-full"
              placeholder="任意の共有シークレット"
              value={proxyToken}
              onChange={(e) => setProxyToken(e.target.value)}
              onBlur={saveFormData}
              required
            />
            <small className="text-xs mt-1 block">※Cloudflare Worker の環境変数 PROXY_TOKEN と一致させてください。</small>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Figma設定</h2>
        <div className="space-y-4">
          {collectionMode === 'new' ? (
            <div>
              <label className="label text-xs mb-2">
                <span>コレクション名</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder="Design Tokens"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                onBlur={saveFormData}
              />
            </div>
          ) : (
            <div>
              <label className="label text-xs mb-2">
                <span>コレクションを選択</span>
              </label>
              <select
                className="select select-sm w-full"
                value={collectionName}
                onChange={(e) => { setCollectionName(e.target.value); saveFormData(); }}
              >
                <option value="">コレクションを選択</option>
                {collections.map((col) => (
                  <option key={col.name} value={col.name}>{col.name}</option>
                ))}
              </select>
      </div>
          )}

          <div className="grid gap-2 grid-cols-2">
            <label className="label text-xs">
              <input
                type="radio"
                name="collectionMode"
                value="new"
                className="radio radio-primary radio-xs"
                checked={collectionMode === 'new'}
                onChange={(e) => { if (e.target.checked) { setCollectionMode('new'); saveFormData(); } }}
              />
              <span>新規コレクションを作成</span>
            </label>
            <label className="label text-xs">
              <input
                type="radio"
                name="collectionMode"
                value="existing"
                className="radio radio-primary radio-xs"
                checked={collectionMode === 'existing'}
                onChange={(e) => { if (e.target.checked) { setCollectionMode('existing'); saveFormData(); } }}
              />
              <span>既存のコレクションを使用</span>
            </label>
          </div>

          {collectionMode === 'existing' && (
            <>
              <div className="form-control">
                <label className="label">
                <input
                  type="checkbox"
                    className="checkbox checkbox-primary checkbox-xs"
                  checked={overwriteExisting}
                    onChange={(e) => { setOverwriteExisting(e.target.checked); saveFormData(); }}
                />
                  <span className="text-xs">既存のVariableを上書き</span>
              </label>
            </div>
            
              <div className="form-control">
                <label className="label">
                <input
                  type="checkbox"
                    className="checkbox checkbox-primary checkbox-xs"
                  checked={deleteRemovedVariables}
                    onChange={(e) => { setDeleteRemovedVariables(e.target.checked); saveFormData(); }}
                />
                  <span className="text-xs">Notionから削除された変数をFigmaからも削除</span>
              </label>
                <small className="text-xs text-warning ml-6">⚠️ この変数を参照しているコンポーネントの参照も解除されます</small>
            </div>
            </>
          )}
      </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">フィールドマッピング</h2>
        <FieldMappingEditor
          mappings={mappings}
          onChange={setMappings}
        />
      </section>

      <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="loading loading-spinner"></span>
            インポート中...
          </>
        ) : (
          'Notionからインポート'
        )}
        </button>
      {/* toast notifications */}
      {status && (
        <div className="toast toast-end">
          <div className={`alert ${status.type === 'success' ? 'alert-success' : status.type === 'error' ? 'alert-error' : 'alert-info'}`}>
            <span>{status.text}</span>
          </div>
      </div>
      )}
    </form>
  );
};

export default ImportTab;
