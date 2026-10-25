import { vi } from "vitest";
import type { MessagesClient } from "../src/analyzer/claude.js";

/** A stand-in for the Anthropic client: each call returns (or throws) the next queued item. */
export function fakeClient(responses: Array<object | Error>): MessagesClient & { calls: number } {
  const queue = [...responses];
  const client = {
    calls: 0,
    messages: {
      parse: vi.fn(async () => {
        client.calls++;
        const next = queue.shift();
        if (!next || next instanceof Error) throw next ?? new Error("no more fake responses");
        return next;
      }),
    },
  };
  return client as unknown as MessagesClient & { calls: number };
}
