import { useEffect, useState } from 'react';
import { errorMessage } from '../../../shared/error-message';

/** Catalog reads are keyed by their exact source, project and version. */
export function useCatalogRequest<T>(command: string, params: Record<string, string> | null) {
  const key = params ? JSON.stringify(params) : '';
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T | null;
    error: string;
    loading: boolean;
  }>({ key: '', error: '', loading: false });
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision explicitly retries the same catalog request.
  useEffect(() => {
    if (!key) return;
    let active = true;
    setState({ key, error: '', loading: true });
    window.nixel
      .invoke<T | null>(command, JSON.parse(key))
      .then((data) => {
        if (active) setState({ key, data, error: '', loading: false });
      })
      .catch((error) => {
        if (active) setState({ key, error: errorMessage(error), loading: false });
      });
    return () => {
      active = false;
    };
  }, [command, key, revision]);
  return {
    ...(state.key === key ? state : { data: undefined, error: '', loading: Boolean(key) }),
    retry: () => setRevision((value) => value + 1),
  };
}
