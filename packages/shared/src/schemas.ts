import { z } from "zod";
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, PALETTE_HEXES, TOTAL_CELLS } from "./constants";

export const displayNameSchema = z
  .string()
  .trim()
  .min(DISPLAY_NAME_MIN, `Name must be at least ${DISPLAY_NAME_MIN} characters`)
  .max(DISPLAY_NAME_MAX, `Name must be at most ${DISPLAY_NAME_MAX} characters`)
  // Letters, numbers, spaces and a few separators. No control chars / markup.
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u, "Use letters, numbers, spaces, . _ ' -");

export const colorSchema = z
  .string()
  .refine((value) => PALETTE_HEXES.includes(value.toUpperCase()), "Pick a colour from the palette")
  .transform((value) => value.toUpperCase());

export const joinRequestSchema = z.object({
  displayName: displayNameSchema,
  color: colorSchema,
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

export const cellIdParamSchema = z.object({
  id: z.coerce.number().int().min(1).max(TOTAL_CELLS),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
