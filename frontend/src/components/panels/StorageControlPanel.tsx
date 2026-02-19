import { useState, useEffect } from 'react';
import { useStorageStore } from '@/stores/storage';
import EngineConfigPanel from './EngineConfigPanel';
import QuickFillPanel from './QuickFillPanel';
import LoadDataPanel from './LoadDataPanel';
import CreateTablePanel from './CreateTablePanel';
import TableOperationsPanel from './TableOperationsPanel';
import ScanResultsPanel from './ScanResultsPanel';

export default function StorageControlPanel() {
  const engineReady = useStorageStore((s) => s.engineReady);
  const engineConfig = useStorageStore((s) => s.engineConfig);
  const resetEngine = useStorageStore((s) => s.resetEngine);
  const tables = useStorageStore((s) => s.tables);
  const statusMsg = useStorageStore((s) => s.statusMsg);
  const statusType = useStorageStore((s) => s.statusType);

  const [quickFillOpen, setQuickFillOpen] = useState(true);
  const [loadDataOpen, setLoadDataOpen] = useState(true);
  const [createTableOpen, setCreateTableOpen] = useState(true);
  const [tableOpsOpen, setTableOpsOpen] = useState(true);
  const [scanResultsOpen, setScanResultsOpen] = useState(true);

  // Auto-collapse creation sections once a table exists
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  useEffect(() => {
    if (tables.length > 0 && !hasAutoCollapsed) {
      setQuickFillOpen(false);
      setCreateTableOpen(false);
      setLoadDataOpen(false);
      setHasAutoCollapsed(true);
    }
  }, [tables, hasAutoCollapsed]);

  return (
    <div className="flex flex-col gap-2 p-2 font-mono text-[11px]">
      {!engineReady ? (
        <EngineConfigPanel />
      ) : (
        <>
          {/* Engine summary bar */}
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[#007acc]/10 border border-[#007acc]/20 rounded-md text-[10px] text-white/70">
            <span>Page: {engineConfig?.page_size}B</span>
            <span>Pool: {engineConfig?.pool_size} frames</span>
            <span>Disk: {engineConfig?.disk_capacity} pages</span>
            <button
              className="ml-auto px-2 py-0.5 border border-red-400/30 rounded bg-red-400/20 text-red-400 cursor-pointer font-mono text-[10px] hover:bg-red-400/30"
              onClick={resetEngine}
            >
              Reset
            </button>
          </div>

          <QuickFillPanel open={quickFillOpen} onToggle={() => setQuickFillOpen((v) => !v)} />
          <LoadDataPanel open={loadDataOpen} onToggle={() => setLoadDataOpen((v) => !v)} />
          <CreateTablePanel open={createTableOpen} onToggle={() => setCreateTableOpen((v) => !v)} />
          <TableOperationsPanel open={tableOpsOpen} onToggle={() => setTableOpsOpen((v) => !v)} />
          <ScanResultsPanel open={scanResultsOpen} onToggle={() => setScanResultsOpen((v) => !v)} />
        </>
      )}

      {/* Status */}
      {statusMsg && (
        <div
          className={`px-2 py-1 rounded text-[10px] ${
            statusType === 'success'
              ? 'text-green-400 bg-green-400/[0.08]'
              : statusType === 'error'
                ? 'text-red-400 bg-red-400/[0.08]'
                : 'text-white/60 bg-white/[0.04]'
          }`}
        >
          {statusMsg}
        </div>
      )}
    </div>
  );
}
