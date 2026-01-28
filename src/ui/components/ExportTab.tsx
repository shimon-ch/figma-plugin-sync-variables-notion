import { useState, useEffect, useCallback, useMemo } from 'react';
import { ExportResult } from '../../shared/types';

interface Collection {
  id: string;
  name: string;
  variableIds?: string[];
}

interface CollectionSelection {
  id: string;
  name: string;
  selected: boolean;
  variableCount: number;
}

interface ExportTabProps {
  collections: Collection[];
}

const ExportTab = ({ collections: propCollections }: ExportTabProps) => {
  // 選択状態をIDでマップ管理（propsが変わっても選択状態を維持）
  const [selectionMap, setSelectionMap] = useState<Map<string, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // propsのコレクションと選択状態をマージ
  const collections: CollectionSelection[] = useMemo(() => {
    return propCollections.map(c => ({
      id: c.id,
      name: c.name,
      // 未登録の場合はデフォルトでfalse（未選択）
      selected: selectionMap.has(c.id) ? selectionMap.get(c.id)! : false,
      variableCount: c.variableIds?.length || 0
    }));
  }, [propCollections, selectionMap]);

  // メッセージハンドラ（エクスポート結果のみ処理）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      // エクスポート結果
      if (msg.type === 'EXPORT_RESULT') {
        setIsLoading(false);
        const result = msg.data as ExportResult;
        
        if (result.success && result.json) {
          // JSONファイルをダウンロード
          downloadJson(result.json, 'design-token.json');
          setStatus({ 
            type: 'success', 
            text: `${result.tokenCount || 0} 個のトークンをエクスポートしました。` 
          });
        } else {
          setStatus({ 
            type: 'error', 
            text: result.error || 'エクスポートに失敗しました。' 
          });
        }
        
        setTimeout(() => setStatus(null), 5000);
      }

      // エラー
      if (msg.type === 'ERROR' && msg.data) {
        setIsLoading(false);
        setStatus({ 
          type: 'error', 
          text: msg.data.message || 'エラーが発生しました。' 
        });
        setTimeout(() => setStatus(null), 5000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // JSONファイルをダウンロード
  const downloadJson = (jsonString: string, filename: string) => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // コレクション選択を切り替え
  const toggleCollection = useCallback((id: string) => {
    setSelectionMap(prev => {
      const newMap = new Map(prev);
      const currentValue = newMap.has(id) ? newMap.get(id)! : false;
      newMap.set(id, !currentValue);
      return newMap;
    });
  }, []);

  // 全選択/全解除
  const toggleAll = useCallback((selected: boolean) => {
    setSelectionMap(prev => {
      const newMap = new Map(prev);
      propCollections.forEach(c => newMap.set(c.id, selected));
      return newMap;
    });
  }, [propCollections]);

  // エクスポート実行
  const handleExport = useCallback(() => {
    const selectedCollections = collections.filter(c => c.selected);
    
    if (selectedCollections.length === 0) {
      setStatus({ type: 'error', text: 'エクスポートするコレクションを選択してください。' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', text: 'エクスポート中...' });

    parent.postMessage({
      pluginMessage: {
        type: 'EXPORT_VARIABLES',
        data: {
          collectionIds: selectedCollections.map(c => c.id)
        }
      }
    }, '*');
  }, [collections]);

  // 選択中のコレクション数と変数数を計算
  const selectedCount = collections.filter(c => c.selected).length;
  const totalVariableCount = collections
    .filter(c => c.selected)
    .reduce((sum, c) => sum + c.variableCount, 0);

  return (
    <div className="p-4 space-y-4">
      <header>
        <h1 className="font-semibold">Export Figma Variables to Design Tokens</h1>
        <p className="text-xs text-base-content/70 mt-1">
          W3C Design Tokens形式でエクスポートします
        </p>
      </header>

      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold">コレクション選択</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => toggleAll(true)}
            >
              全選択
            </button>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => toggleAll(false)}
            >
              全解除
            </button>
          </div>
        </div>

        {collections.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <p>コレクションがありません</p>
            <p className="text-xs mt-1">Figma Variablesを作成してください</p>
          </div>
        ) : (
          {/* コレクションリストの最大高さ（Figmaプラグインの限られたUI領域を考慮） */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {collections.map(collection => (
              <label
                key={collection.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={collection.selected}
                  onChange={() => toggleCollection(collection.id)}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">
                    {collection.name}
                  </span>
                  <span className="text-xs text-base-content/60">
                    {collection.variableCount} 変数
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="bg-base-200 rounded-lg p-3">
        <h3 className="text-xs font-semibold mb-2">エクスポート設定</h3>
        <ul className="text-xs text-base-content/70 space-y-1">
          <li>・形式: W3C Design Tokens (JSON)</li>
          <li>・コレクション名がパスのプレフィックスになります</li>
          <li>・エイリアス参照は維持されます</li>
        </ul>
      </section>

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={handleExport}
        disabled={isLoading || selectedCount === 0}
      >
        {isLoading ? (
          <>
            <span className="loading loading-spinner"></span>
            エクスポート中...
          </>
        ) : (
          `エクスポート${selectedCount > 0 ? ` (${selectedCount} コレクション / ${totalVariableCount} 変数)` : ''}`
        )}
      </button>

      {selectedCount === 0 && !isLoading && collections.length > 0 && (
        <p className="text-xs text-warning text-center">
          エクスポートするコレクションを選択してください
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
    </div>
  );
};

export default ExportTab;
