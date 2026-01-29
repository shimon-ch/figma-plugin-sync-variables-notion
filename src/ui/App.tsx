import { useState, useEffect } from 'react';
import './styles/globals.css';
import ImportTab from './components/ImportTab';
import ExportTab from './components/ExportTab';

type TabId = 'import' | 'export';

interface Collection {
  id: string;
  name: string;
  modes?: { modeId: string; name: string }[];
  variableIds?: string[];
}

const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('import');
  const [collections, setCollections] = useState<Collection[]>([]);

  // コレクションデータを一元管理
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      // 初期化データ
      if (msg.type === 'INIT_DATA' && msg.collections) {
        setCollections(msg.collections);
      }

      // コレクションデータ更新
      if (msg.type === 'COLLECTIONS_DATA' && msg.data?.collections) {
        setCollections(msg.data.collections);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      {/* タブナビゲーション */}
      <div role="tablist" className="flex px-4 pt-4">
        <button
          role="tab"
          className={`flex-1 py-3 text-sm text-center border-b-2 transition-colors ${
            activeTab === 'import'
              ? 'border-primary font-medium text-base-content'
              : 'border-base-300 text-base-content/70 hover:text-base-content'
          }`}
          onClick={() => setActiveTab('import')}
        >
          Import
        </button>
        <button
          role="tab"
          className={`flex-1 py-3 text-sm text-center border-b-2 transition-colors ${
            activeTab === 'export'
              ? 'border-primary font-medium text-base-content'
              : 'border-base-300 text-base-content/70 hover:text-base-content'
          }`}
          onClick={() => setActiveTab('export')}
        >
          Export
        </button>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'import' && <ImportTab collections={collections} />}
      {activeTab === 'export' && <ExportTab collections={collections} />}
    </div>
  );
};

export default App;
