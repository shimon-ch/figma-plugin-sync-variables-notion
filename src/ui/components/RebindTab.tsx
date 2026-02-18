import { useState, useEffect, useCallback } from 'react';
import {
  ScanResult,
  BrokenReferenceGroup,
  CandidateVariable,
  RebindResult,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = { type: 'success' | 'error' | 'info'; text: string } | null;

// ユーザーが各グループに対して選択した置換先 Variable ID
type MappingState = Map<string, string>; // brokenVariableId → replacementVariableId

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RebindTab = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isRebinding, setIsRebinding] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [mappings, setMappings] = useState<MappingState>(new Map());
  const [status, setStatus] = useState<Status>(null);
  const [filterText, setFilterText] = useState('');

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

        if (result.brokenGroups.length === 0) {
          setStatus({ type: 'success', text: '壊れた参照は見つかりませんでした。' });
        } else {
          setStatus({
            type: 'info',
            text: `${result.brokenGroups.length} 件の壊れた Variable ID が見つかりました（計 ${result.brokenGroups.reduce((s, g) => s + g.affectedCount, 0)} 箇所）`,
          });
        }
        setTimeout(() => setStatus(null), 5000);
      }

      if (msg.type === 'REBIND_RESULT') {
        setIsRebinding(false);
        const result = msg.data as RebindResult;

        if (result.success) {
          setStatus({
            type: 'success',
            text: `${result.totalRebound} 箇所の参照を再バインドしました。`,
          });
          setScanResult(null);
          setMappings(new Map());
        } else {
          setStatus({
            type: 'error',
            text: `${result.totalRebound} 箇所を再バインド（${result.errors.length} 件のエラー）`,
          });
        }
        setTimeout(() => setStatus(null), 6000);
      }

      if (msg.type === 'PROGRESS' && msg.data) {
        const data = msg.data as { message?: string };
        if (data.message) {
          setStatus({ type: 'info', text: data.message });
        }
      }

      if (msg.type === 'ERROR' && msg.data) {
        setIsScanning(false);
        setIsRebinding(false);
        const data = msg.data as { message?: string };
        setStatus({ type: 'error', text: data.message || 'エラーが発生しました' });
        setTimeout(() => setStatus(null), 6000);
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

  const handleRebind = useCallback(() => {
    if (mappings.size === 0) return;

    setIsRebinding(true);
    setStatus({ type: 'info', text: '再バインド中...' });

    const payload = Array.from(mappings.entries()).map(
      ([brokenVariableId, replacementVariableId]) => ({
        brokenVariableId,
        replacementVariableId,
      }),
    );

    parent.postMessage(
      { pluginMessage: { type: 'REBIND_VARIABLES', data: payload } },
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
      // 壊れた Variable ID で検索
      if (g.brokenVariableId.toLowerCase().includes(lower)) return true;
      // 影響ノード名で検索
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
        <h1 className="font-semibold">Rebind Broken Variable References</h1>
        <p className="text-xs text-base-content/70 mt-1">
          壊れた Variable 参照を検出し、新しい Variable に一括で再バインドします
        </p>
      </header>

      {/* スキャンセクション */}
      <section>
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={handleScan}
          disabled={isScanning || isRebinding}
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
                placeholder="ノード名や Variable ID で絞り込み..."
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
              onClick={handleRebind}
              disabled={isRebinding || mappedCount === 0}
            >
              {isRebinding ? (
                <>
                  <span className="loading loading-spinner" />
                  再バインド中...
                </>
              ) : (
                `一括再バインド (${mappedCount}/${totalGroups} 件選択済み)`
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

  // 候補をコレクション名でグルーピングして表示
  const groupedCandidates = groupCandidatesByCollection(group.candidates);

  return (
    <div className="bg-base-200 rounded-lg p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-error truncate">
            {group.brokenVariableId}
          </p>
          <p className="text-xs text-base-content/70 mt-0.5">
            {group.affectedCount} 箇所で使用
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
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

      {/* 置換先セレクター */}
      <select
        className="select select-sm select-bordered w-full"
        value={selectedReplacement}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">-- 置換先を選択 --</option>
        {groupedCandidates.map(([collectionName, candidates]) => (
          <optgroup key={collectionName} label={collectionName}>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.resolvedType})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupCandidatesByCollection(
  candidates: CandidateVariable[],
): [string, CandidateVariable[]][] {
  const map = new Map<string, CandidateVariable[]>();
  for (const c of candidates) {
    const list = map.get(c.collectionName) ?? [];
    list.push(c);
    map.set(c.collectionName, list);
  }
  return Array.from(map.entries());
}

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

export default RebindTab;
