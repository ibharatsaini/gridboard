import { create } from "zustand";

/** Coarse shared clock so lock rings expire on screen without a timer per cell. */
export const useClockStore = create<{ now: number }>(() => ({ now: Date.now() }));
