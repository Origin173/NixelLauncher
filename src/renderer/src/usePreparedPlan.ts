import { useEffect, useState } from 'react';
import { errorMessage } from '../../shared/error-message';

export function usePreparedPlan<T>(command: string, planId: string | undefined) {
  const [result, setResult] = useState<{ id: string; plan?: T; error?: string }>();
  useEffect(() => {
    if (!planId) return;
    let active = true;
    window.nixel
      .invoke<T>(command, { planId })
      .then((plan) => {
        if (active) setResult({ id: planId, plan });
      })
      .catch((error) => {
        if (active) setResult({ id: planId, error: errorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [command, planId]);
  const current = planId && result?.id === planId ? result : undefined;
  return { plan: current?.plan, error: current?.error, loading: Boolean(planId && !current) };
}
