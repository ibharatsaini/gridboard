/** Domain constants shared by the API and the web app. */

export const BOARD_ROWS = 50;
export const BOARD_COLUMNS = 50;
export const TOTAL_CELLS = BOARD_ROWS * BOARD_COLUMNS;

/** Minimum time between two successful claims by one user. */
export const CLAIM_COOLDOWN_MS = 5_000;
/** How long a freshly claimed cell is protected from takeover. */
export const CELL_LOCK_MS = 10_000;

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;

/** Number of entries kept in the live activity feed (server page size and client cap). */
export const ACTIVITY_LIMIT = 40;
export const LEADERBOARD_SIZE = 10;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Controlled palette. Every swatch has >= 4.5:1 contrast against white text,
 * so owner names / labels rendered on a cell colour stay legible.
 */
export const COLOR_PALETTE = [
  { name: "Red", hex: "#DC2626" },
  { name: "Orange", hex: "#C2410C" },
  { name: "Amber", hex: "#B45309" },
  { name: "Lime", hex: "#4D7C0F" },
  { name: "Green", hex: "#15803D" },
  { name: "Teal", hex: "#0F766E" },
  { name: "Sky", hex: "#0369A1" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Indigo", hex: "#4F46E5" },
  { name: "Violet", hex: "#7C3AED" },
  { name: "Pink", hex: "#DB2777" },
  { name: "Fuchsia", hex: "#A21CAF" },
] as const;

export const PALETTE_HEXES = COLOR_PALETTE.map((c) => c.hex) as readonly string[];

/** Territory scoring (see docs/ARCHITECTURE.md): 1 point per cell + (size - 1) per connected group. */
export const TERRITORY_RULE = {
  perCell: 1,
  perGroupBonus: (groupSize: number) => Math.max(0, groupSize - 1),
} as const;
