'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import ScanWorkspace from '@/components/v2/ScanWorkspace';
import LibrariesView from '@/components/v2/LibrariesView';
import StrategyWorkspace from '@/components/v2/StrategyWorkspace';

type Tab = 'libraries' | 'scans' | 'strategies';

export default function ScansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'libraries';

  const setTab = (t: Tab) => {
    router.push(`/v2/scans?tab=${t}`);
  };

  return (
    <>
      <div className="tab-bar">
        <button
          className={`tab-btn${tab === 'libraries' ? ' active' : ''}`}
          onClick={() => setTab('libraries')}
        >
          Libraries
        </button>
        <button
          className={`tab-btn${tab === 'scans' ? ' active' : ''}`}
          onClick={() => setTab('scans')}
        >
          Scans
        </button>
        <button
          className={`tab-btn${tab === 'strategies' ? ' active' : ''}`}
          onClick={() => setTab('strategies')}
        >
          Strategies
        </button>
      </div>

      {tab === 'libraries' && <LibrariesView />}
      {tab === 'scans' && <ScanWorkspace />}
      {tab === 'strategies' && <StrategyWorkspace />}
    </>
  );
}
