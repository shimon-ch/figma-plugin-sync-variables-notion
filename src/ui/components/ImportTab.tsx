import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { fetchNotionData, fetchNotionPage } from '../services/notionProxy';
import { transformNotionResponse } from '../services/notionTransform';
import { ImportSettings, FieldMapping, NotionVariable, SavedFormData, ProgressData } from '../../shared/types';
import FieldMappingEditor from './FieldMappingEditor';

interface Collection {
  id: string;
  name: string;
  variableIds?: string[];
}

// タイムアウト時間を計算する関数
const calculateTimeout = (variableCount: number): number => {
  // 基本30秒 + 変数数 x 0.5秒、最大5分
  return Math.min(30000 + (variableCount * 500), 300000);
};

// デフォルトのタイムアウト（変数数不明時）
const DEFAULT_TIMEOUT_MS = 60000; // 1分

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
  const currentTimeoutMsRef = useRef<number>(DEFAULT_TIMEOUT_MS);
  const hasLoadedDataRef = useRef(false);

  // タイムアウトをクリアするヘルパー関数
  const clearImportTimeout = useCallback(() => {
    if (importTimeoutRef.current) {
      clearTimeout(importTimeoutRef.current);
      importTimeoutRef.current = null;
    }
  }, []);

  // タイムアウト処理のハンドラー
  const handleTimeout = useCallback(() => {
    setIsLoading(false);
    setStatus({ type: 'error', text: 'インポートがタイムアウトしました。通信状況を確認してください。' });
    importTimeoutRef.current = null;
  }, []);

  // タイムアウトタイマーをリセットする関数
  const resetTimeout = useCallback(() => {
    clearImportTimeout();
    importTimeoutRef.current = window.setTimeout(handleTimeout, currentTimeoutMsRef.current);
  }, [clearImportTimeout, handleTimeout]);

  // 保存データを適用するヘルパー関数
  const applySavedData = useCallback((data: SavedFormData) => {
    if (data.notion_api_key) setApiKey(data.notion_api_key);
    if (data.notion_database_id) setDatabaseId(data.notion_database_id);
    if (data.collection_name) setCollectionName(data.collection_name);
    if (data.collection_mode) setCollectionMode(data.collection_mode);
    if (data.overwrite_existing !== undefined) setOverwriteExisting(data.overwrite_existing);
    if (data.delete_removed_variables !== undefined) setDeleteRemovedVariables(data.delete_removed_variables);
    if (data.notion_proxy_url) setProxyUrl(data.notion_proxy_url);
    if (data.notion_proxy_token) setProxyToken(data.notion_proxy_token);
  }, []);

  // 完了処理の共通ハンドラー（SUCCESS, ERROR, OPERATION_STATUS用）
  const handleOperationComplete = useCallback((success: boolean, message: string) => {
    setIsLoading(false);
    clearImportTimeout();
    setStatus({ type: success ? 'success' : 'error', text: message });
    window.setTimeout(() => setStatus(null), success ? 4000 : 6000);
  }, [clearImportTimeout]);

  // 初期データを受信
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      
      // 初期化データ
      if (msg.type === 'INIT_DATA') {
        if (msg.collections) {
          setCollections(msg.collections || []);
        }
        if (msg.savedData) {
          applySavedData(msg.savedData as SavedFormData);
        }
        hasLoadedDataRef.current = true;
      }
      
      // コレクションデータ
      if (msg.type === 'COLLECTIONS_DATA' && msg.data) {
        setCollections(msg.data.collections || []);
      }
      
      // 進捗通知（タイムアウトタイマーをリセット）
      if (msg.type === 'PROGRESS' && msg.data) {
        const progressData = msg.data as ProgressData;
        resetTimeout();
        setStatus({ type: 'info', text: progressData.message });
      }

      // ローディング状態
      if (msg.type === 'LOADING' && msg.data) {
        const loadingData = msg.data as { message?: string };
        setStatus({ type: 'info', text: loadingData.message || '処理中...' });
      }

      // 操作完了（統合ハンドラー）
      if (msg.type === 'OPERATION_STATUS' && msg.data) {
        const data = msg.data as { success?: boolean; status?: string; message?: string };
        const ok = (typeof data.success === 'boolean') ? data.success : (data.status === 'success');
        const message = data.message || (ok ? 'インポートが完了しました。' : 'インポートに失敗しました。');
        handleOperationComplete(ok, message);
      }

      // 成功
      if (msg.type === 'SUCCESS' && msg.data) {
        const data = msg.data as { message?: string };
        handleOperationComplete(true, data.message || 'インポートが完了しました。');
      }

      // エラー
      if (msg.type === 'ERROR' && msg.data) {
        const data = msg.data as { message?: string };
        handleOperationComplete(false, data.message || 'インポートに失敗しました。');
      }
      
      // データ読み込みレスポンス
      if (msg.type === 'LOAD_DATA_RESPONSE' && msg.data) {
        applySavedData(msg.data as SavedFormData);
        hasLoadedDataRef.current = true;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applySavedData, handleOperationComplete, resetTimeout]);

  // 入力値を保存する関数
  const saveFormData = useCallback(() => {
    // 空の値は送信しない（空文字列で既存の値を上書きしないため）
    const dataToSave: Partial<SavedFormData> = {
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
  }, [apiKey, databaseId, collectionName, collectionMode, overwriteExisting, deleteRemovedVariables, proxyUrl, proxyToken]);

  // 各入力フィールドの変更時に自動保存
  useEffect(() => {
    // 初期データ読み込み完了後のみ保存
    if (!hasLoadedDataRef.current) {
      return;
    }
    saveFormData();
  }, [saveFormData]);

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
      clearImportTimeout();
      setIsLoading(true);
      setStatus({ type: 'info', text: 'Notionからデータを取得中...' });
      
      // 初期タイムアウト（Notionデータ取得用）
      currentTimeoutMsRef.current = DEFAULT_TIMEOUT_MS;
      importTimeoutRef.current = window.setTimeout(handleTimeout, currentTimeoutMsRef.current);

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
        clearImportTimeout();
        setIsLoading(false);
        setStatus({ type: 'error', text: 'Notionから有効なデータを取得できませんでした。' });
        return;
      }

      // 変数数に基づいて動的にタイムアウト時間を計算・更新
      currentTimeoutMsRef.current = calculateTimeout(variables.length);
      clearImportTimeout();
      importTimeoutRef.current = window.setTimeout(handleTimeout, currentTimeoutMsRef.current);
      
      setStatus({ type: 'info', text: `${variables.length} 件の変数をインポート中...` });

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
      const formData: SavedFormData = {
        notion_api_key: apiKey,
        notion_database_id: databaseId,
        collection_name: collectionName,
        collection_mode: collectionMode,
        overwrite_existing: overwriteExisting,
        delete_removed_variables: deleteRemovedVariables,
        notion_proxy_url: proxyUrl,
        notion_proxy_token: proxyToken
      };

      parent.postMessage({
        pluginMessage: {
          type: 'IMPORT_FROM_NOTION',
          data: settings,
          formData
        }
      }, '*');
    } catch (err) {
      // エラー時は必ずタイムアウトをクリア
      clearImportTimeout();
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
