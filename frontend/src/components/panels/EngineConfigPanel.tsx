import { useState } from 'react';
import { useStorageStore } from '@/stores/storage';
import type { EngineConfig } from '@/wasm/storage-types';

const PAGE_PRESETS = [64, 128, 256, 512, 1024, 4096];

export default function EngineConfigPanel() {
  const initEngine = useStorageStore((s) => s.initEngine);
  const [pageSize, setPageSize] = useState(128);
  const [poolSize, setPoolSize] = useState(8);
  const [diskCapacity, setDiskCapacity] = useState(64);
  const [overflowThreshold, setOverflowThreshold] = useState(64);

  function handleInit() {
    const config: EngineConfig = {
      page_size: pageSize,
      pool_size: poolSize,
      disk_capacity: diskCapacity,
      overflow_threshold: overflowThreshold,
    };
    initEngine(config);
  }

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-white/[0.03] border border-white/[0.06] rounded-md">
      <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
        Engine Configuration
      </h3>
      <p className="m-0 text-[10px] italic text-white/35 leading-snug">
        Configure the storage engine's page size, buffer pool capacity, and disk size
      </p>

      <span className="text-[10px] text-white/50 mt-0.5">Page Size</span>
      <div className="flex gap-1 flex-wrap">
        {PAGE_PRESETS.map((preset) => (
          <button
            key={preset}
            className={`px-2 py-0.5 border rounded text-[11px] font-mono cursor-pointer ${
              pageSize === preset
                ? 'bg-[#007acc] text-white border-[#007acc]'
                : 'bg-transparent text-white/60 border-white/15 hover:bg-white/[0.08]'
            }`}
            onClick={() => setPageSize(preset)}
          >
            {preset >= 1024 ? `${preset / 1024}K` : preset}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] text-white/50">Pool Size</span>
          <input
            type="number"
            value={poolSize}
            onChange={(e) => setPoolSize(Number(e.target.value))}
            min={4}
            max={32}
            className="bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
          />
          <span className="text-[10px] text-white/35">{poolSize} frames</span>
        </label>
        <label className="flex-1 flex flex-col gap-0.5">
          <span className="text-[10px] text-white/50">Disk Capacity</span>
          <input
            type="number"
            value={diskCapacity}
            onChange={(e) => setDiskCapacity(Number(e.target.value))}
            min={16}
            max={256}
            className="bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
          />
          <span className="text-[10px] text-white/35">{diskCapacity} pages</span>
        </label>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-white/50">Overflow Threshold</span>
        <input
          type="number"
          value={overflowThreshold}
          onChange={(e) => setOverflowThreshold(Number(e.target.value))}
          min={32}
          max={pageSize}
          className="bg-white/[0.06] border border-white/12 rounded px-1.5 py-1 text-white font-mono text-[11px] outline-none focus:border-[#007acc]"
        />
        <span className="text-[10px] text-white/35">{overflowThreshold}B</span>
      </label>

      <button
        className="px-2.5 py-1.5 border rounded bg-[#007acc] text-white border-[#007acc] cursor-pointer font-mono text-[11px] hover:bg-[#005f99]"
        onClick={handleInit}
      >
        Initialize Engine
      </button>
    </div>
  );
}
