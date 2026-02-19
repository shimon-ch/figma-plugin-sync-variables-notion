import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScanResult,
  BrokenReferenceGroup,
  RemapResult,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = { type: 'success' | 'error' | 'info'; text: string } | null;

// brokenVariableId → replacementVariableId
type MappingState = Map<string, string>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RemapTab = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isRemapping, setIsRemapping] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [mappings, setMappings] = useState<MappingState>(new Map());
  const [status, setStatus] = useState<Status>(null);
  const [filterText, setFilterText] = useState('');
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アンマウント後の state 更新を防ぐため、タイマーを ref で管理
  const setStatusWithTimer = useCallback((s: Status, ms = 6000) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(s);
    if (s !== null) {
      statusTimerRef.current = setTimeout(() => setStatus(null), ms);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  // ------------------------------------------------------------------
  // プラグインからのメッセージ受信
  // ------------------------------------------------------------------
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'BROKEN_REFS_RESULT') {
        setIsScanning(false);
        const result = msg.data as ScanResult;
        setScanResult(result);

        // 同名候補が見つかったグループは自動でマッピングに追加
        const autoMappings = new Map<string, string>();
        for (const g of result.brokenGroups) {
          if (g.suggestedReplacementId) {
            autoMappings.set(g.brokenVariableId, g.suggestedReplacementId);
          }
        }
        if (autoMappings.size > 0) {
          setMappings(autoMappings);
        }

        if (result.brokenGroups.length === 0) {
          setStatusWithTimer({ type: 'success', text: '壊れた参照は見つかりませんでした。' });
        } else {
          const totalAffected = result.brokenGroups.reduce((s, g) => s + g.affectedCount, 0);
          const autoCount = autoMappings.size;
          setStatusWithTimer({
            type: 'info',
            text: `${result.brokenGroups.length} 件の壊れた参照が見つかりました（計 ${totalAffected} 箇所）${autoCount > 0 ? `。${autoCount} 件は同名候補に自動マッチ済み` : ''}`,
          });
        }
      }

      if (msg.type === 'REMAP_RESULT') {
        setIsRemapping(false);
        const result = msg.data as RemapResult;

        if (result.success) {
          setStatusWithTimer({
            type: 'success',
            text: `${result.totalRemapped} 箇所の参照をリマップしました。`,
          });
          setScanResult(null);
          setMappings(new Map());
        } else {
          setStatusWithTimer({
            type: 'error',
            text: `${result.totalRemapped} 箇所をリマップ（${result.errors.length} 件のエラー）`,
          });
        }
      }

      if (msg.type === 'PROGRESS' && msg.data) {
        const data = msg.data as { message?: string };
        if (data.message) {
          setStatus({ type: 'info', text: data.message });
        }
      }

      if (msg.type === 'ERROR' && msg.data) {
        setIsScanning(false);
        setIsRemapping(false);
        const data = msg.data as { message?: string };
        setStatusWithTimer({ type: 'error', text: data.message || 'エラーが発生しました' });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const handleScan = useCallback(() => {
    setIsScanning(true);
    setScanResult(null);
    setMappings(new Map());
    setStatus({ type: 'info', text: 'スキャン中...' });

    parent.postMessage(
      { pluginMessage: { type: 'SCAN_BROKEN_REFS' } },
      '*',
    );
  }, []);

  const handleSetMapping = useCallback(
    (brokenId: string, replacementId: string) => {
      setMappings((prev) => {
        const next = new Map(prev);
        if (replacementId) {
          next.set(brokenId, replacementId);
        } else {
          next.delete(brokenId);
        }
        return next;
      });
    },
    [],
  );

  const handleRemap = useCallback(() => {
    if (mappings.size === 0) return;

    setIsRemapping(true);
    setStatus({ type: 'info', text: 'リマップ中...' });

    const payload = Array.from(mappings.entries()).map(
      ([brokenVariableId, replacementVariableId]) => ({
        brokenVariableId,
        replacementVariableId,
      }),
    );

    parent.postMessage(
      { pluginMessage: { type: 'REMAP_VARIABLES', data: payload } },
      '*',
    );
  }, [mappings]);

  // ------------------------------------------------------------------
  // Derived
  // ------------------------------------------------------------------
  const filteredGroups: BrokenReferenceGroup[] =
    scanResult?.brokenGroups.filter((g) => {
      if (!filterText) return true;
      const lower = filterText.toLowerCase();
      if (g.brokenVariableName.toLowerCase().includes(lower)) return true;
      return g.references.some((r) => r.nodeName.toLowerCase().includes(lower));
    }) ?? [];

  const mappedCount = mappings.size;
  const totalGroups = scanResult?.brokenGroups.length ?? 0;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="p-4 space-y-4">
      <header>
        <h1 className="font-semibold">Remap Broken Variable References</h1>
        <p className="text-xs text-base-content/70 mt-1">
          壊れた Variable 参照を検出し、新しい Variable に一括でリマップします
        </p>
      </header>

      {/* スキャンセクション */}
      <section>
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={handleScan}
          disabled={isScanning || isRemapping}
        >
          {isScanning ? (
            <>
              <span className="loading loading-spinner" />
              スキャン中...
            </>
          ) : (
            '現在のページをスキャン'
          )}
        </button>
      </section>

      {/* 結果セクション */}
      {scanResult && scanResult.brokenGroups.length > 0 && (
        <>
          <section>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold">
                壊れた参照 ({totalGroups} 件)
              </h2>
              <span className="text-xs text-base-content/60">
                スキャンノード数: {scanResult.totalNodesScanned}
              </span>
            </div>

            {/* フィルター */}
            {totalGroups > 3 && (
              <input
                type="text"
                className="input input-sm input-bordered w-full mb-3"
                placeholder="Variable 名やノード名で絞り込み..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            )}

            {/* グループリスト */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {filteredGroups.map((group) => (
                <BrokenGroupCard
                  key={group.brokenVariableId}
                  group={group}
                  selectedReplacement={mappings.get(group.brokenVariableId) ?? ''}
                  onSelect={(replacementId) =>
                    handleSetMapping(group.brokenVariableId, replacementId)
                  }
                />
              ))}
            </div>
          </section>

          {/* 適用セクション */}
          <section className="border-t border-base-300 pt-4">
            <button
              type="button"
              className="btn btn-accent w-full"
              onClick={handleRemap}
              disabled={isRemapping || mappedCount === 0}
            >
              {isRemapping ? (
                <>
                  <span className="loading loading-spinner" />
                  リマップ中...
                </>
              ) : (
                `一括リマップ (${mappedCount}/${totalGroups} 件選択済み)`
              )}
            </button>
            {mappedCount === 0 && (
              <p className="text-xs text-warning text-center mt-2">
                各グループで置換先の Variable を選択してください
              </p>
            )}
          </section>
        </>
      )}

      {/* スキャン済み・結果なし */}
      {scanResult && scanResult.brokenGroups.length === 0 && (
        <section className="text-center py-6 text-base-content/50">
          <p className="text-lg mb-1">問題なし</p>
          <p className="text-xs">
            現在のページに壊れた Variable 参照はありません
          </p>
        </section>
      )}

      {/* toast notifications */}
      {status && (
        <div className="toast toast-end">
          <div
            className={`alert ${
              status.type === 'success'
                ? 'alert-success'
                : status.type === 'error'
                  ? 'alert-error'
                  : 'alert-info'
            }`}
          >
            <span>{status.text}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: 1つの壊れた Variable グループ
// ---------------------------------------------------------------------------

interface BrokenGroupCardProps {
  group: BrokenReferenceGroup;
  selectedReplacement: string;
  onSelect: (replacementId: string) => void;
}

const BrokenGroupCard = ({
  group,
  selectedReplacement,
  onSelect,
}: BrokenGroupCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 選択中の候補の表示名
  const selectedCandidate = group.candidates.find(c => c.id === selectedReplacement);

  // ファジー検索（部分一致）でフィルタリング
  const filteredCandidates = searchText
    ? group.candidates.filter(c =>
        c.name.toLowerCase().includes(searchText.toLowerCase()) ||
        c.collectionName.toLowerCase().includes(searchText.toLowerCase())
      )
    : group.candidates;

  // 外側クリックで閉じる（検索テキストは維持）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (candidateId: string) => {
    onSelect(candidateId);
    setIsOpen(false);
    setSearchText(''); // 選択確定時のみリセット
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect('');
    setSearchText('');
  };

  return (
    <div className="bg-base-200 rounded-lg p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate text-error">
            {group.brokenVariableName}
          </p>
          <p className="text-xs text-base-content/70 mt-0.5">
            {group.affectedCount} 箇所で参照が壊れています
            {group.suggestedReplacementId && (
              <span className="ml-1 text-success">・同名候補に自動マッチ済み</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '閉じる' : '詳細'}
        </button>
      </div>

      {/* 影響ノード一覧（展開時） */}
      {expanded && (
        <div className="mb-2 max-h-32 overflow-y-auto text-xs space-y-1">
          {group.references.map((ref, idx) => (
            <div key={idx} className="flex gap-1 text-base-content/70">
              <span className="badge badge-ghost badge-xs">{ref.nodeType}</span>
              <span className="truncate">{ref.nodeName}</span>
              <span className="text-base-content/40 ml-auto whitespace-nowrap">
                {locationLabel(ref.location)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ファジー検索付き置換先セレクター */}
      <div ref={containerRef} className="relative">
        {/* トリガーボタン */}
        <div
          className="input input-sm input-bordered w-full flex items-center justify-between cursor-pointer gap-1"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) setSearchText('');
          }}
        >
          {selectedCandidate ? (
            <>
              <span className="truncate text-xs flex-1">{selectedCandidate.name}</span>
              <span className="text-base-content/40 text-xs shrink-0">{selectedCandidate.collectionName}</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs p-0 h-auto min-h-0 shrink-0"
                onClick={handleClear}
              >
                ✕
              </button>
            </>
          ) : (
            <span className="text-base-content/40 text-xs">-- 置換先を選択 --</span>
          )}
        </div>

        {/* ドロップダウン */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg">
            {/* 検索入力 */}
            <div className="p-2 border-b border-base-300">
              <input
                type="text"
                className="input input-xs input-bordered w-full"
                placeholder="Variable 名で絞り込み..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>

            {/* 候補リスト */}
            <div className="max-h-48 overflow-y-auto">
              {filteredCandidates.length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-3">
                  候補が見つかりません
                </p>
              ) : (
                filteredCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 hover:bg-base-200 flex items-center justify-between gap-2 ${
                      c.id === selectedReplacement ? 'bg-primary/10' : ''
                    }`}
                    onClick={() => handleSelect(c.id)}
                  >
                    <span className="text-xs truncate flex-1">{c.name}</span>
                    <span className="text-xs text-base-content/40 shrink-0">{c.collectionName}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function locationLabel(loc: { kind: string; field?: string; paintIndex?: number }): string {
  switch (loc.kind) {
    case 'node':
      return loc.field ?? '';
    case 'fill':
      return `fills[${loc.paintIndex}]`;
    case 'stroke':
      return `strokes[${loc.paintIndex}]`;
    default:
      return '';
  }
}

export default RemapTab;
