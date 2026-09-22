import { describe, expect, it } from "vitest";
import { KernelEventBus } from "../src/event-bus.js";

describe("KernelEventBus", () => {
  it("delivers payloads to subscribers", async () => {
    const bus = new KernelEventBus();
    const seen: string[] = [];
    bus.on("workspace/ready", (p) => seen.push(p.workspaceId));
    await bus.emit("workspace/ready", { workspaceId: "ws_1" });
    expect(seen).toEqual(["ws_1"]);
  });

  it("runs handlers in registration order and awaits them", async () => {
    const bus = new KernelEventBus();
    const order: string[] = [];
    bus.on("tool/before", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("slow-first");
    });
    bus.on("tool/before", () => order.push("fast-second"));
    await bus.emit("tool/before", { tool: "shell", operation: "exec" });
    expect(order).toEqual(["slow-first", "fast-second"]);
  });

  it("propagates handler throws so before-execution subscribers can veto", async () => {
    const bus = new KernelEventBus();
    bus.on("command/before", () => {
      throw new Error("blocked by policy");
    });
    await expect(
      bus.emit("command/before", { command: "git push --force", args: [] })
    ).rejects.toThrow("blocked by policy");
  });

  it("supports once subscriptions", async () => {
    const bus = new KernelEventBus();
    let count = 0;
    bus.on("filesystem/after-write", () => count++, { once: true });
    await bus.emit("filesystem/after-write", { path: "/a", size: 1 });
    await bus.emit("filesystem/after-write", { path: "/b", size: 2 });
    expect(count).toBe(1);
  });

  it("unsubscribe removes the handler", async () => {
    const bus = new KernelEventBus();
    let count = 0;
    const sub = bus.on("runtime/health", () => count++);
    sub.unsubscribe();
    await bus.emit("runtime/health", { provider: "local", healthy: true });
    expect(count).toBe(0);
  });
});
