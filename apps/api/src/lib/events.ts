import { randomUUID } from "node:crypto";
import type { RealtimeEvent } from "@gridboard/shared";

/** Wraps a payload in the shared event envelope. */
export function createEvent<E extends RealtimeEvent>(type: E["type"], payload: E["payload"]): E {
  return { eventId: randomUUID(), type, timestamp: new Date().toISOString(), payload } as E;
}
