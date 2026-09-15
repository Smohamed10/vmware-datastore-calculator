/**
 * Session-scoped RVTools inventory store.
 *
 * Why this exists: tabs unmount when you switch away (AnimatePresence), so
 * any inventory held in a tab's useState was lost the moment you navigated
 * elsewhere and came back. A parsed workbook is expensive to re-import and
 * is shared conceptually by Capacity / Bulk / Planner, so it lives here —
 * one module-level store, subscribed via useSyncExternalStore.
 *
 * Deliberately in-memory (not localStorage): a full RVTools inventory can be
 * megabytes and would blow the ~5 MB storage quota. It therefore survives
 * tab switches for the whole session, but a hard page refresh asks for the
 * file again. The lightweight bits — file name, selected datastore — are
 * persisted separately by the tabs so the UI can restate context instantly.
 */
import { useSyncExternalStore } from "react";
import type { RVInventory } from "./bulk";

export interface InventorySlot {
  inventory: RVInventory;
  fileName: string;
  source: "rvtools" | "template";
  loadedAt: number;
}

type Slot = InventorySlot | null;

/** Independent slots so the Planner and the Capacity tab can hold
 *  different workbooks without fighting over one global. */
export type SlotKey = "planner" | "capacity" | "bulk";

const slots: Record<SlotKey, Slot> = { planner: null, capacity: null, bulk: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setInventory(key: SlotKey, slot: Slot) {
  slots[key] = slot;
  emit();
}

export function clearInventory(key: SlotKey) {
  slots[key] = null;
  emit();
}

/** Reactive read — components re-render when their slot changes. */
export function useInventorySlot(key: SlotKey): Slot {
  return useSyncExternalStore(
    subscribe,
    () => slots[key],
    () => null
  );
}
