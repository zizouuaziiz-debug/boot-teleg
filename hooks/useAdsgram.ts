import { useCallback, useEffect, useRef } from 'react';

export function useAdsgram({ blockId, onReward, onError }: {
  blockId: number;
  onReward: () => void;
  onError?: (result: any) => void;
}) {
  const AdControllerRef = useRef<any>(undefined);
  const loadedRef = useRef(false);

  useEffect(() => {
    const initAdsgram = () => {
      const Adsgram = (window as any).Adsgram;
      if (Adsgram && !loadedRef.current) {
        AdControllerRef.current = Adsgram.init({ blockId });
        loadedRef.current = true;
        console.log("Adsgram initialized successfully");
      }
    };

    // إذا Adsgram موجود
    if ((window as any).Adsgram) {
      initAdsgram();
    } else {
      // إذا مو موجود، حمّل الـ script
      const script = document.createElement('script');
      script.src = 'https://adsgram.ai/sdk.js';
      script.onload = () => {
        console.log("Adsgram script loaded");
        setTimeout(initAdsgram, 500);
      };
      document.head.appendChild(script);
    }

    // تأكد كل 2 ثانية
    const interval = setInterval(() => {
      if (!loadedRef.current && (window as any).Adsgram) {
        initAdsgram();
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [blockId]);

  return useCallback(async () => {
    if (AdControllerRef.current) {
      AdControllerRef.current
        .show()
        .then(() => onReward())
        .catch((result: any) => onError?.(result));
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
