import { describe, expect, it, vi } from "vitest";
import type { JobHandlers } from "../../../src/server/jobs/contracts";
import { createTaskList } from "../../../src/server/jobs/task-list";

const NOTIFICATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function handlers(): JobHandlers {
  return {
    notify_inquiry: vi.fn(async () => undefined)
  };
}

describe("Graphile task list", () => {
  it("validates opaque payloads before invoking a handler", async () => {
    const jobHandlers = handlers();
    const tasks = createTaskList(jobHandlers);
    await tasks.notify_inquiry?.({ notificationId: NOTIFICATION_ID }, {} as never);
    expect(jobHandlers.notify_inquiry).toHaveBeenCalledWith({ notificationId: NOTIFICATION_ID });
  });

  it("rejects PII or unexpected fields in a payload", async () => {
    const tasks = createTaskList(handlers());
    await expect(
      tasks.notify_inquiry?.(
        { notificationId: NOTIFICATION_ID, customerEmail: "no@example.test" },
        {} as never
      )
    ).rejects.toThrow();
  });
});
