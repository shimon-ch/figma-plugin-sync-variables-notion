import { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import { fetchNotionData, fetchNotionPage } from '../services/notionProxy';
import { transformNotionResponse } from '../services/notionTransform';
import { ImportSettings, FieldMapping, NotionVariable, SavedFormData, ProgressData, CollectionDbPair } from '../../shared/types';
import FieldMappingEditor from './FieldMappingEditor';

interface Collection {
  id: string;
  name: string;
  variableIds?: string[];
}

// デフォルトのタイムアウト（変数数不明時）
const DEFAULT_TIMEOUT_MS = 60000; // 1分

// UUID生成関数
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// 空のペアを作成
const createEmptyPair = (): CollectionDbPair => ({
  id: generateUUID(),
  collectionName: '',
  databaseId: '',
  enabled: true,
  isManualInput: false
});

const ImportTab = () => {
  const [apiKey, setApiKey] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyToken, setProxyToken] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [deleteRemovedVariables, setDeleteRemovedVariables] = useState(false);
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
  
  // 連続インポート中のセッションID（グローバルメッセージハンドラの誤動作防止用）
  const importRunIdRef = useRef<string | null>(null);

  // コレクション+DBIDペアの状態
  const [collectionDbPairs, setCollectionDbPairs] = useState<CollectionDbPair[]>([createEmptyPair()]);

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
    if (data.overwrite_existing !== undefined) setOverwriteExisting(data.overwrite_existing);
    if (data.delete_removed_variables !== undefined) setDeleteRemovedVariables(data.delete_removed_variables);
    if (data.notion_proxy_url) setProxyUrl(data.notion_proxy_url);
    if (data.notion_proxy_token) setProxyToken(data.notion_proxy_token);
    // コレクション+DBIDペアの復元
    if (data.collection_db_pairs && data.collection_db_pairs.length > 0) {
      setCollectionDbPairs(data.collection_db_pairs);
    }
  }, []);

  // 完了処理の共通ハンドラー（SUCCESS, ERROR, OPERATION_STATUS用）
  // 注意: 連続インポート中（importRunIdRef.current !== null）はこのハンドラを呼ばない
  const handleOperationComplete = useCallback((success: boolean, message: string) => {
    // 連続インポート中はグローバルハンドラからの呼び出しを無視
    // （importSinglePair内のローカルリスナーが個別に処理する）
    if (importRunIdRef.current !== null) {
      return;
    }
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
      overwrite_existing: overwriteExisting,
      delete_removed_variables: deleteRemovedVariables,
      collection_db_pairs: collectionDbPairs,
    };
    
    // 空でない値のみ追加
    if (apiKey && apiKey.trim()) dataToSave.notion_api_key = apiKey;
    if (proxyUrl && proxyUrl.trim()) dataToSave.notion_proxy_url = proxyUrl;
    if (proxyToken && proxyToken.trim()) dataToSave.notion_proxy_token = proxyToken;
    
    parent.postMessage({
      pluginMessage: {
        type: 'SAVE_DATA',
        data: dataToSave
      }
    }, '*');
  }, [apiKey, overwriteExisting, deleteRemovedVariables, proxyUrl, proxyToken, collectionDbPairs]);

  // 各入力フィールドの変更時に自動保存
  useEffect(() => {
    // 初期データ読み込み完了後のみ保存
    if (!hasLoadedDataRef.current) {
      return;
    }
    saveFormData();
  }, [saveFormData]);

  // ペアを追加
  const addPair = useCallback(() => {
    setCollectionDbPairs(prev => [...prev, createEmptyPair()]);
  }, []);

  // ペアを削除
  const removePair = useCallback((id: string) => {
    setCollectionDbPairs(prev => {
      const newPairs = prev.filter(p => p.id !== id);
      // 最低1つは残す
      return newPairs.length > 0 ? newPairs : [createEmptyPair()];
    });
  }, []);

  // ペアを更新
  const updatePair = useCallback((id: string, updates: Partial<CollectionDbPair>) => {
    setCollectionDbPairs(prev => prev.map(p => 
      p.id === id ? { ...p, ...updates } : p
    ));
  }, []);

  // 全選択/全解除
  const toggleAllPairs = useCallback((enabled: boolean) => {
    setCollectionDbPairs(prev => prev.map(p => ({ ...p, enabled })));
  }, []);

  // 単一ペアのインポート処理結果の型
  type ImportResult = {
    success: boolean;
    message: string;
    collectionName: string;
    shouldAbort: boolean; // trueの場合、後続のペア処理を中断
  };

  // 単一ペアのインポート処理
  const importSinglePair = async (
    pair: CollectionDbPair,
    currentIndex: number,
    totalCount: number
  ): Promise<ImportResult> => {
    const { collectionName, databaseId, isManualInput } = pair;
    
    try {
      setStatus({ type: 'info', text: `[${currentIndex + 1}/${totalCount}] ${collectionName}: Notionからデータを取得中...` });
      
      // Notionデータを取得
      const notionResponse = await fetchNotionData(apiKey, databaseId, proxyUrl, {
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }]
      }, proxyToken);
      
      const raw = notionResponse?.results || [];
      const variables = await transformNotionResponse(raw, apiKey, proxyUrl, proxyToken, fetchNotionPage);
      
      if (!Array.isArray(variables) || variables.length === 0) {
        // データが空の場合は中断せず続行（データがないだけなので）
        return { 
          success: false, 
          message: `${collectionName}: 有効なデータがありません`,
          collectionName,
          shouldAbort: false
        };
      }

      setStatus({ type: 'info', text: `[${currentIndex + 1}/${totalCount}] ${collectionName}: ${variables.length} 件の変数をインポート中...` });

      // コレクションの存在チェック（手入力モードの場合）
      // 存在しない場合は新規作成フラグを立てる
      const collectionExists = collections.some(c => c.name === collectionName);
      const shouldCreateNew = (isManualInput === true) && !collectionExists;

      const settings: ImportSettings & { variables: NotionVariable[] } = {
        apiKey: apiKey,
        notionApiKey: apiKey,
        databaseId,
        collectionName,
        createNewCollection: shouldCreateNew,
        overwriteExisting,
        deleteRemovedVariables,
        mappings,
        variables
      };

      // 同期的にインポートを実行するためのPromise（タイムアウト付き）
      const SINGLE_PAIR_TIMEOUT = 120000; // 2分
      
      return new Promise((resolve) => {
        let resolved = false;
        let timeoutId: number | null = null;
        
        const handleImportResult = (event: MessageEvent) => {
          const msg = event.data.pluginMessage;
          if (!msg) return;
          
          if (msg.type === 'SUCCESS' || msg.type === 'OPERATION_STATUS') {
            if (resolved) return;
            resolved = true;
            
            const data = msg.data as { success?: boolean; status?: string; message?: string };
            const ok = msg.type === 'SUCCESS' || 
              (typeof data.success === 'boolean' ? data.success : data.status === 'success');
            
            cleanup();
            resolve({
              success: ok,
              message: ok ? `${collectionName}: ${variables.length} 件インポート成功` : `${collectionName}: インポート失敗`,
              collectionName,
              shouldAbort: !ok // インポート処理自体が失敗した場合は中断
            });
          }
          
          if (msg.type === 'ERROR') {
            if (resolved) return;
            resolved = true;
            
            cleanup();
            const data = msg.data as { message?: string };
            resolve({
              success: false,
              message: `${collectionName}: ${data.message || 'エラーが発生しました'}`,
              collectionName,
              shouldAbort: true // エラーの場合は中断
            });
          }
        };
        
        // クリーンアップ関数（リスナーとタイムアウトの両方を削除）
        const cleanup = () => {
          window.removeEventListener('message', handleImportResult);
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        };
        
        // タイムアウト設定
        timeoutId = window.setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve({
            success: false,
            message: `${collectionName}: インポートがタイムアウトしました`,
            collectionName,
            shouldAbort: true
          });
        }, SINGLE_PAIR_TIMEOUT);
        
        window.addEventListener('message', handleImportResult);
        
        parent.postMessage({
          pluginMessage: {
            type: 'IMPORT_FROM_NOTION',
            data: settings
          }
        }, '*');
      });
    } catch (err) {
      // Notionデータ取得やその他の例外は中断
      return {
        success: false,
        message: `${collectionName}: ${err instanceof Error ? err.message : 'エラーが発生しました'}`,
        collectionName,
        shouldAbort: true
      };
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!apiKey) {
      alert('Notion APIキーを入力してください');
      return;
    }
    
    // 有効なペアをフィルタリング
    const enabledPairs = collectionDbPairs.filter(p => 
      p.enabled && p.collectionName.trim() && p.databaseId.trim()
    );
    
    if (enabledPairs.length === 0) {
      alert('インポート対象のペアを選択してください。コレクション名とデータベースIDの両方が必要です。');
      return;
    }

    // 送信前に最新のデータを保存
    saveFormData();

    // 連続インポートセッション開始（グローバルハンドラの誤動作防止）
    const runId = generateUUID();
    importRunIdRef.current = runId;

    try {
      clearImportTimeout();
      setIsLoading(true);
      
      // タイムアウト設定（ペア数に応じて延長）
      currentTimeoutMsRef.current = DEFAULT_TIMEOUT_MS * enabledPairs.length;
      importTimeoutRef.current = window.setTimeout(handleTimeout, currentTimeoutMsRef.current);

      const results: ImportResult[] = [];
      let aborted = false;
      
      // 順番にインポート実行
      for (let i = 0; i < enabledPairs.length; i++) {
        const pair = enabledPairs[i];
        resetTimeout(); // 各ペア処理前にタイムアウトリセット
        
        const result = await importSinglePair(pair, i, enabledPairs.length);
        results.push(result);
        
        // インポート処理自体が失敗した場合は後続を中断
        if (result.shouldAbort) {
          aborted = true;
          break;
        }
      }

      // 結果サマリー
      clearImportTimeout();
      setIsLoading(false);
      
      // 連続インポートセッション終了
      importRunIdRef.current = null;
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const skippedCount = enabledPairs.length - results.length; // 中断により未処理のペア数
      
      if (aborted) {
        // 中断が発生した場合
        const failedPair = results[results.length - 1]; // 最後に処理したペアが失敗原因
        let statusText = `「${failedPair.collectionName}」でエラーが発生したため処理を中断しました。`;
        const details: string[] = [];
        if (successCount > 0) details.push(`${successCount}件成功`);
        details.push(`${failCount}件失敗`);
        if (skippedCount > 0) details.push(`${skippedCount}件未処理`);
        statusText += `（${details.join('、')}）`;
        
        setStatus({ 
          type: 'error', 
          text: statusText
        });
      } else if (failCount === 0) {
        setStatus({ 
          type: 'success', 
          text: `全 ${successCount} 件のコレクションをインポートしました。` 
        });
      } else if (successCount === 0) {
        setStatus({ 
          type: 'error', 
          text: `全 ${failCount} 件のインポートに失敗しました。` 
        });
      } else {
        setStatus({ 
          type: 'info', 
          text: `${successCount} 件成功、${failCount} 件失敗しました。` 
        });
      }
      
      window.setTimeout(() => setStatus(null), 6000);
      
    } catch (err) {
      clearImportTimeout();
      setIsLoading(false);
      importRunIdRef.current = null; // セッション終了
      setStatus({ type: 'error', text: err instanceof Error ? err.message : 'インポートに失敗しました。' });
    }
  };

  // 有効なペアの数を計算
  const enabledPairsCount = collectionDbPairs.filter(p => 
    p.enabled && p.collectionName.trim() && p.databaseId.trim()
  ).length;

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
        <h2 className="mb-2 text-sm font-semibold">同期ペア設定</h2>
        <small className="text-xs text-base-content/70 block mb-3">
          FigmaコレクションとNotionデータベースIDのペアを登録してください。
        </small>
        
        {/* ペアリスト */}
        <div className="space-y-3">
          {collectionDbPairs.map((pair) => (
            <div key={pair.id} className="flex items-start gap-2 p-3 bg-base-200 rounded-lg">
              {/* チェックボックス */}
              <input
                type="checkbox"
                className="checkbox checkbox-primary checkbox-sm mt-2"
                checked={pair.enabled}
                onChange={(e) => updatePair(pair.id, { enabled: e.target.checked })}
              />
              
              <div className="flex-1 space-y-2">
                {/* コレクション名 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/60 w-24 shrink-0">コレクション:</span>
                  {pair.isManualInput ? (
                    <input
                      type="text"
                      className="input input-sm input-bordered flex-1"
                      placeholder="コレクション名を入力"
                      value={pair.collectionName}
                      onChange={(e) => updatePair(pair.id, { collectionName: e.target.value })}
                      onBlur={saveFormData}
                    />
                  ) : (
                    <select
                      className="select select-sm flex-1"
                      value={pair.collectionName}
                      onChange={(e) => updatePair(pair.id, { collectionName: e.target.value })}
                    >
                      <option value="">コレクションを選択</option>
                      {collections.map((col) => (
                        <option key={col.id} value={col.name}>{col.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => updatePair(pair.id, { isManualInput: !pair.isManualInput, collectionName: '' })}
                    title={pair.isManualInput ? "ドロップダウンに切替" : "手入力に切替"}
                  >
                    {pair.isManualInput ? '📋' : '✏️'}
                  </button>
                </div>
                
                {/* データベースID */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-base-content/60 w-24 shrink-0">DB ID:</span>
                  <input
                    type="text"
                    className="input input-sm input-bordered flex-1 font-mono text-xs"
                    placeholder="NotionデータベースID"
                    value={pair.databaseId}
                    onChange={(e) => updatePair(pair.id, { databaseId: e.target.value })}
                    onBlur={saveFormData}
                  />
                </div>
              </div>
              
              {/* 削除ボタン */}
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square text-error"
                onClick={() => removePair(pair.id)}
                title="ペアを削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        
        {/* 追加ボタンと全選択 */}
        <div className="flex justify-between items-center mt-3">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={addPair}
          >
            + ペアを追加
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => toggleAllPairs(true)}
            >
              全選択
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => toggleAllPairs(false)}
            >
              全解除
            </button>
          </div>
        </div>
        
        {/* オプション */}
        <div className="mt-4 space-y-2">
          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-2">
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
            <label className="label cursor-pointer justify-start gap-2">
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
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">フィールドマッピング</h2>
        <FieldMappingEditor
          mappings={mappings}
          onChange={setMappings}
        />
      </section>

      <button type="submit" className="btn btn-primary w-full" disabled={isLoading || enabledPairsCount === 0}>
        {isLoading ? (
          <>
            <span className="loading loading-spinner"></span>
            インポート中...
          </>
        ) : (
          `Notionからインポート${enabledPairsCount > 0 ? ` (${enabledPairsCount}件)` : ''}`
        )}
      </button>
      
      {enabledPairsCount === 0 && !isLoading && (
        <p className="text-xs text-warning text-center">
          インポート対象のペアを選択してください
        </p>
      )}
      
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
