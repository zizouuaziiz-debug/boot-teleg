import { useCallback, useEffect, useRef } from 'react';

export function useAdsgram({ blockId, onReward, onError }: {
  blockId: number;
  onReward: () => void;
  onError?: (result: any) => void;
}) {
  const AdControllerRef = useRef<any>(undefined);

  useEffect(() => {
    AdControllerRef.current = (window as any).Adsgram?.init({ blockId });
  }, [blockId]);

  return useCallback(async () => {
    if (AdControllerRef.current) {
      AdControllerRef.current
        .show()
        .then(() => {
          onReward();
        })
        .catch((result: any) => {
          onError?.(result);
        });
    } else {
      onError?.({
        error: true,
        done: false,
        state: 'load',
        description: 'Adsgram script not loaded',
      });
    }
  }, [onError, onReward]);
}
