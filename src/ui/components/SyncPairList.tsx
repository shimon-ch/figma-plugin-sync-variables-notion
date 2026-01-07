import { useCallback } from 'react';
import {
  GridList,
  GridListItem,
  useDragAndDrop,
  Button,
  DropIndicator,
} from 'react-aria-components';
import type { CollectionDbPair } from '../../shared/types';
import { generateUUID } from '../../shared/uuid';

interface Collection {
  id: string;
  name: string;
  variableIds?: string[];
}

interface SyncPairListProps {
  pairs: CollectionDbPair[];
  collections: Collection[];
  onPairsChange: (pairs: CollectionDbPair[]) => void;
  onSave: () => void;
}

// ドラッグハンドルアイコン
const DragHandle = () => (
  <svg
    className="w-4 h-4 text-base-content/40 cursor-grab active:cursor-grabbing"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="5" cy="3" r="1.5" />
    <circle cx="11" cy="3" r="1.5" />
    <circle cx="5" cy="8" r="1.5" />
    <circle cx="11" cy="8" r="1.5" />
    <circle cx="5" cy="13" r="1.5" />
    <circle cx="11" cy="13" r="1.5" />
  </svg>
);

const SyncPairList = ({
  pairs,
  collections,
  onPairsChange,
  onSave,
}: SyncPairListProps) => {
  // ペアを更新
  const updatePair = useCallback(
    (id: string, updates: Partial<CollectionDbPair>) => {
      const newPairs = pairs.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      onPairsChange(newPairs);
    },
    [pairs, onPairsChange]
  );

  // ペアを削除
  const removePair = useCallback(
    (id: string) => {
      const newPairs = pairs.filter((p) => p.id !== id);
      // 最低1つは残す（空のペアを作成）
      if (newPairs.length === 0) {
        onPairsChange([createEmptyPair()]);
      } else {
        onPairsChange(newPairs);
      }
    },
    [pairs, onPairsChange]
  );

  // ドラッグ＆ドロップ設定
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({
        'text/plain': String(key),
        'application/x-sync-pair': String(key),
      })),
    onReorder(e) {
      const targetKey = e.target.key as string;
      const draggedKeys = [...e.keys] as string[];

      // ドラッグされたアイテムを収集
      const draggedItems: CollectionDbPair[] = [];
      for (const key of draggedKeys) {
        const item = pairs.find((p) => p.id === key);
        if (item) {
          draggedItems.push(item);
        }
      }

      // ドラッグされたアイテムがない場合は何もしない
      if (draggedItems.length === 0) {
        return;
      }

      // ドラッグされたアイテムを除外
      const filteredPairs = pairs.filter(
        (p) => !draggedKeys.includes(p.id)
      );

      // ターゲットの挿入位置を計算
      let insertIndex: number;
      const targetIndex = filteredPairs.findIndex((p) => p.id === targetKey);

      if (targetIndex !== -1) {
        // ターゲットが存在する場合
        insertIndex = targetIndex;
        if (e.target.dropPosition === 'after') {
          insertIndex += 1;
        }
      } else {
        // ターゲットがドラッグされたアイテムの場合、または存在しない場合
        // 元の位置を基準にする
        const originalTargetIndex = pairs.findIndex((p) => p.id === targetKey);
        if (originalTargetIndex !== -1) {
          // ターゲットがドラッグされたアイテムの1つ
          insertIndex = Math.min(originalTargetIndex, filteredPairs.length);
        } else {
          // ターゲットが見つからない（削除された可能性）
          // 配列の末尾に追加
          insertIndex = filteredPairs.length;
        }
      }

      // 新しい位置に挿入
      const reorderedPairs = [...filteredPairs];
      reorderedPairs.splice(insertIndex, 0, ...draggedItems);

      onPairsChange(reorderedPairs);
    },
    renderDropIndicator(target) {
      return (
        <DropIndicator
          target={target}
          className="drop-indicator"
        />
      );
    },
  });

  // GridListItem用のレンダリング関数
  const renderPairItem = useCallback(
    (pair: CollectionDbPair) => (
      <GridListItem
        key={pair.id}
        id={pair.id}
        textValue={pair.collectionName || 'Unnamed pair'}
        className="sync-pair-item group outline-none"
      >
        <div className="flex items-start gap-2 p-3 bg-base-200 rounded-lg transition-all">
          {/* ドラッグハンドル */}
          <Button
            slot="drag"
            className="mt-2 p-1 rounded hover:bg-base-300 transition-colors outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="ドラッグして並べ替え"
          >
            <DragHandle />
          </Button>

          {/* チェックボックス */}
          <input
            type="checkbox"
            className="checkbox checkbox-primary checkbox-sm mt-2"
            checked={pair.enabled}
            onChange={(e) => updatePair(pair.id, { enabled: e.target.checked })}
          />

          <div className="flex-1 space-y-2 min-w-0">
            {/* コレクション名 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/60 w-24 shrink-0">
                コレクション:
              </span>
              {pair.isManualInput ? (
                <input
                  type="text"
                  className="input input-sm input-bordered flex-1 min-w-0"
                  placeholder="コレクション名を入力"
                  value={pair.collectionName}
                  onChange={(e) =>
                    updatePair(pair.id, { collectionName: e.target.value })
                  }
                  onBlur={onSave}
                />
              ) : (
                <select
                  className="select select-sm flex-1 min-w-0"
                  value={pair.collectionName}
                  onChange={(e) =>
                    updatePair(pair.id, { collectionName: e.target.value })
                  }
                >
                  <option value="">コレクションを選択</option>
                  {collections.map((col) => (
                    <option key={col.id} value={col.name}>
                      {col.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() =>
                  updatePair(pair.id, {
                    isManualInput: !pair.isManualInput,
                    collectionName: '',
                  })
                }
                title={pair.isManualInput ? 'ドロップダウンに切替' : '手入力に切替'}
              >
                {pair.isManualInput ? '📋' : '✏️'}
              </button>
            </div>

            {/* データベースID */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-base-content/60 w-24 shrink-0">
                DB ID:
              </span>
              <input
                type="text"
                className="input input-sm input-bordered flex-1 font-mono text-xs min-w-0"
                placeholder="NotionデータベースID"
                value={pair.databaseId}
                onChange={(e) =>
                  updatePair(pair.id, { databaseId: e.target.value })
                }
                onBlur={onSave}
              />
            </div>
          </div>

          {/* 削除ボタン */}
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square text-error opacity-60 hover:opacity-100"
            onClick={() => removePair(pair.id)}
            title="ペアを削除"
          >
            ×
          </button>
        </div>
      </GridListItem>
    ),
    [collections, updatePair, removePair, onSave]
  );

  return (
    <GridList
      aria-label="同期ペアリスト（ドラッグで並べ替え可能）"
      items={pairs}
      dragAndDropHooks={dragAndDropHooks}
      selectionMode="none"
      className="sync-pair-list space-y-2"
    >
      {renderPairItem}
    </GridList>
  );
};

// 空のペアを作成するヘルパー関数
const createEmptyPair = (): CollectionDbPair => ({
  id: generateUUID(),
  collectionName: '',
  databaseId: '',
  enabled: true,
  isManualInput: false,
});

export default SyncPairList;
export { createEmptyPair };
// generateUUID は src/shared/uuid.ts から直接インポートしてください
