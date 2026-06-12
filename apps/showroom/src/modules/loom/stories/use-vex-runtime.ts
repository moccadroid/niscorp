import { useEffect, useState } from 'react';
import { getVexRuntime, type VexRuntime } from '@showroom/modules/vex/runtime/boot';

// Boots the in-browser Vex engine (Postgres via PGlite, with the demo schema and
// seed data) from modules/vex/runtime/boot.ts. The boot is memoized, so all
// stories share one instance. Returns undefined until it is ready.
export const useVexRuntime = (): VexRuntime | undefined => {
  const [runtime, setRuntime] = useState<VexRuntime>();
  useEffect(() => {
    let alive = true;
    void getVexRuntime().then((rt) => {
      if (alive) setRuntime(rt);
    });
    return () => {
      alive = false;
    };
  }, []);
  return runtime;
};
