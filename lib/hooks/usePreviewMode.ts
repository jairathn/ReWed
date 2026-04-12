'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'rewed_preview';
const UNLOCK_CODE = 'Shriya';

// Subscribers notified when we change the value from within this tab.
const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Also listen for cross-tab changes.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

function getServerSnapshot() {
  return false;
}

export function usePreviewMode() {
  const unlocked = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const tryUnlock = useCallback((password: string): boolean => {
    if (password === UNLOCK_CODE) {
      localStorage.setItem(STORAGE_KEY, '1');
      emitChange();
      return true;
    }
    return false;
  }, []);

  const lock = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    emitChange();
  }, []);

  return { unlocked, tryUnlock, lock };
}
