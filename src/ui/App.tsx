import { useState } from 'react';
import './styles/globals.css';
import ImportTab from './components/ImportTab';
import ExportTab from './components/ExportTab';

type TabId = 'import' | 'export';

const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('import');

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      {/* タブナビゲーション */}
      <div role="tablist" className="tabs tabs-bordered px-4 pt-2">
        <button
          role="tab"
          className={`tab ${activeTab === 'import' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          Import
        </button>
        <button
          role="tab"
          className={`tab ${activeTab === 'export' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          Export
        </button>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'import' && <ImportTab />}
      {activeTab === 'export' && <ExportTab />}
    </div>
  );
};

export default App;
