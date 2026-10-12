import { useEffect, useState } from 'react';
import { getVexRuntime, type VexRuntime } from '@showroom/modules/vex/runtime/boot';

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
