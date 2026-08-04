"use client";

import { useSyncExternalStore } from "react";
import {
  FRAGMENT_UNLOCK_EVENT,
  FRAGMENT_UNLOCK_KEY,
} from "@/lib/fragment-access";

export function useFragmentAccess(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(FRAGMENT_UNLOCK_KEY) === "1",
    () => false,
  );
}

export function unlockFragmentAccess(): void {
  sessionStorage.setItem(FRAGMENT_UNLOCK_KEY, "1");
  window.dispatchEvent(new Event(FRAGMENT_UNLOCK_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(FRAGMENT_UNLOCK_EVENT, onStoreChange);
  return () => window.removeEventListener(FRAGMENT_UNLOCK_EVENT, onStoreChange);
}
