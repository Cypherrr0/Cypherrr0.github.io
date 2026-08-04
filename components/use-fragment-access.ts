"use client";

import { useSyncExternalStore } from "react";
import {
  FRAGMENT_UNLOCK_EVENT,
  FRAGMENT_UNLOCK_KEY,
  FRAGMENT_UNLOCK_TTL_MS,
} from "@/lib/fragment-access";

export function useFragmentAccess(): boolean {
  return useSyncExternalStore(
    subscribe,
    hasValidFragmentAccess,
    () => false,
  );
}

export function unlockFragmentAccess(): void {
  const unlockedAt = Date.now();
  sessionStorage.setItem(
    FRAGMENT_UNLOCK_KEY,
    JSON.stringify({
      expiresAt: unlockedAt + FRAGMENT_UNLOCK_TTL_MS,
      unlockedAt,
      version: 1,
    }),
  );
  window.dispatchEvent(new Event(FRAGMENT_UNLOCK_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  let timeout: number | null = null;
  const scheduleExpiry = () => {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
    const delay = timeUntilExpiry();
    timeout =
      delay === null
        ? null
        : window.setTimeout(() => {
            hasValidFragmentAccess();
            onStoreChange();
            scheduleExpiry();
          }, delay);
  };
  const notify = () => {
    onStoreChange();
    scheduleExpiry();
  };

  window.addEventListener(FRAGMENT_UNLOCK_EVENT, notify);
  scheduleExpiry();
  return () => {
    window.removeEventListener(FRAGMENT_UNLOCK_EVENT, notify);
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
  };
}

function hasValidFragmentAccess(): boolean {
  const rawTicket = sessionStorage.getItem(FRAGMENT_UNLOCK_KEY);
  if (!rawTicket) {
    return false;
  }

  try {
    const ticket = JSON.parse(rawTicket) as {
      expiresAt?: unknown;
      version?: unknown;
    };
    const expiresAt =
      typeof ticket.expiresAt === "number" ? ticket.expiresAt : 0;
    const isValid = ticket.version === 1 && Date.now() < expiresAt;

    if (!isValid) {
      sessionStorage.removeItem(FRAGMENT_UNLOCK_KEY);
    }
    return isValid;
  } catch {
    sessionStorage.removeItem(FRAGMENT_UNLOCK_KEY);
    return false;
  }
}

function timeUntilExpiry(): number | null {
  const rawTicket = sessionStorage.getItem(FRAGMENT_UNLOCK_KEY);
  if (!rawTicket) {
    return null;
  }

  try {
    const ticket = JSON.parse(rawTicket) as { expiresAt?: unknown };
    const expiresAt =
      typeof ticket.expiresAt === "number" ? ticket.expiresAt : 0;
    return Math.max(0, Math.min(expiresAt - Date.now(), FRAGMENT_UNLOCK_TTL_MS));
  } catch {
    return 0;
  }
}
