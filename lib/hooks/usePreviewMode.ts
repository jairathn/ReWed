'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'rewed_preview';
const UNLOCK_CODE = 'Shriya';

export function usePreviewMode() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setUnlocked(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  const tryUnlock = useCallback((password: string): boolean => {
    if (password === UNLOCK_CODE) {
      localStorage.setItem(STORAGE_KEY, '1');
      setUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const lock = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUnlocked(false);
  }, []);

  return { unlocked, tryUnlock, lock };
}
