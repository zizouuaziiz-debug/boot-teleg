import { useCallback, useEffect, useRef } from 'react';

export interface ShowPromiseResult {
  error?: boolean;
  done: boolean;
  state: string;
  description?: string;
}

export interface useAdsgramParams {
  blockId: string;
  onReward?: () => void;
  onError?: (result: ShowPromiseResult) => void;
}

export function useAdsgram({ blockId, onReward, onError }: useAdsgramParams): () => Promise<void> {
  const AdControllerRef = useRef<any>(undefined);

  useEffect(() => {
    const Adsgram = (window as any).Adsgram;
    if (Adsgram) {
      AdControllerRef.current = Adsgram.init({ blockId, debug: false });
    }
  }, [blockId]);

  return useCallback(async () => {
    if (AdControllerRef.current) {
      AdControllerRef.current
        .show()
        .then(() => {
          onReward?.();
        })
        .catch((result: ShowPromiseResult) => {
          onError?.(result);
        });
    } else {
      onError?.({
        done: false,
        state: 'load',
        description: 'Adsgram script not loaded',
      });
    }
  }, [onError, onReward]);
}
