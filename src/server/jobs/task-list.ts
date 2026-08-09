import type { TaskList } from "graphile-worker";
import { JOB_NAMES, jobPayloadSchemas, type JobHandlers, type JobName } from "./contracts";

export function createTaskList(handlers: JobHandlers): TaskList {
  return Object.fromEntries(
    JOB_NAMES.map((name) => [
      name,
      async (rawPayload: unknown) => {
        const payload = jobPayloadSchemas[name].parse(rawPayload);
        await invokeHandler(handlers, name, payload);
      }
    ])
  );
}

function invokeHandler<Name extends JobName>(
  handlers: JobHandlers,
  name: Name,
  payload: Parameters<JobHandlers[Name]>[0]
): Promise<void> {
  // Indexed mapped functions cannot be correlated by TypeScript after a runtime
  // property lookup; this helper keeps the single assertion at that boundary.
  return (handlers[name] as (value: typeof payload) => Promise<void>)(payload);
}
