import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * `lib/data/assignments.ts` exists because Supabase's client does not throw on
 * failure — it resolves with `{ error }` — which made ignoring the result the
 * shortest thing to write, and left six call sites reporting success for writes
 * that never landed (audit H2).
 *
 * So the suite has two jobs: prove the right row is written on the happy path,
 * and prove that *every* write throws when the database says no, with a message
 * a user can act on and without leaking Postgrest's own wording.
 *
 * The Supabase client is replaced rather than the module under test, so these
 * assertions run against the shipped source.
 */

interface PostgrestErrorLike {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

interface RecordedCall {
  op: "insert" | "update" | "delete";
  payload?: unknown;
  eq?: [string, string];
}

let calls: RecordedCall[] = [];
let queued: { error: PostgrestErrorLike | null }[] = [];
let sessionUser: { id: string } | null = null;
let logged: unknown[][] = [];

/**
 * Stands in for a Postgrest query builder: records what it was asked to do and
 * resolves to the next queued result. It is a thenable rather than a promise so
 * that `.eq(...)` can still be chained onto it, exactly as the real one allows.
 */
function makeQuery(op: RecordedCall["op"], payload?: unknown) {
  const call: RecordedCall = { op, payload };
  calls.push(call);
  const result = queued.shift() ?? { error: null };

  const query = {
    eq(column: string, value: string) {
      call.eq = [column, value];
      return query;
    },
    // biome-ignore lint/suspicious/noThenProperty: a thenable is exactly what a Postgrest query builder is
    then(resolve: (value: { error: PostgrestErrorLike | null }) => unknown) {
      return Promise.resolve(result).then(resolve);
    },
  };
  return query;
}

mock.module("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser }, error: null }) },
    from: () => ({
      insert: (payload: unknown) => makeQuery("insert", payload),
      update: (payload: unknown) => makeQuery("update", payload),
      delete: () => makeQuery("delete"),
    }),
  }),
}));

/**
 * Imported dynamically, because `mock.module` has to run before the module
 * under test is evaluated and static imports are hoisted above it. In a
 * `beforeAll` rather than at the top level, because tsconfig targets ES6.
 */
let data: typeof import("@/lib/data/assignments");

beforeAll(async () => {
  data = await import("@/lib/data/assignments");
});

const DRAFT = {
  title: "Essay on the Corn Laws",
  subject: "History",
  description: null,
  due_date: "2026-10-01T23:59:00.000Z",
  priority: "high",
} as const;

const REJECTED: PostgrestErrorLike = { code: "23514", message: 'violates check constraint "title_length"' };

/** Every write, so the failure behaviour can be asserted for all of them at once. */
const WRITES: [string, () => Promise<void>][] = [
  ["createAssignment", () => data.createAssignment({ ...DRAFT })],
  ["updateAssignment", () => data.updateAssignment("a-1", { title: "Renamed" })],
  ["setAssignmentStatus", () => data.setAssignmentStatus("a-1", "completed")],
  ["deleteAssignment", () => data.deleteAssignment("a-1")],
];

const realConsoleError = console.error;
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

beforeEach(() => {
  calls = [];
  queued = [];
  logged = [];
  sessionUser = { id: "user-1" };
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
});

afterEach(() => {
  console.error = realConsoleError;
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
});

/** Runs `write` expecting it to reject, and hands back the error it threw. */
async function rejection(write: () => Promise<void>): Promise<Error> {
  try {
    await write();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the write to throw, but it resolved");
}

describe("createAssignment", () => {
  test("inserts the draft, stamped with the session user and a pending status", async () => {
    await data.createAssignment({ ...DRAFT });

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe("insert");
    expect(calls[0].payload).toEqual({ ...DRAFT, user_id: "user-1", status: "pending" });
  });

  // The id is read from the session rather than taken from a prop: RLS checks it
  // server-side anyway, and a missing user means the session went away between
  // opening the form and saving it.
  test("does not insert at all when the session has gone", async () => {
    sessionUser = null;

    const error = await rejection(() => data.createAssignment({ ...DRAFT }));

    expect(error).toBeInstanceOf(data.AssignmentWriteError);
    expect(error.message).toMatch(/sign in again/i);
    expect(calls).toHaveLength(0);
  });
});

describe("updateAssignment", () => {
  test("patches only the given fields, on the given row", async () => {
    await data.updateAssignment("a-1", { title: "Renamed", priority: "low" });

    expect(calls[0].op).toBe("update");
    expect(calls[0].eq).toEqual(["id", "a-1"]);
    expect(calls[0].payload).toMatchObject({ title: "Renamed", priority: "low" });
    expect(calls[0].payload).not.toHaveProperty("subject");
  });

  // Audit M3 wants this moved to a database trigger. Until it is, the client is
  // the only thing maintaining it, so it has to be here on every update.
  test("refreshes updated_at", async () => {
    const before = Date.now();
    await data.updateAssignment("a-1", { title: "Renamed" });
    const { updated_at } = calls[0].payload as { updated_at: string };

    expect(Date.parse(updated_at)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(updated_at)).toBeLessThanOrEqual(Date.now());
  });
});

describe("setAssignmentStatus", () => {
  test("writes the status against the row, and refreshes updated_at", async () => {
    await data.setAssignmentStatus("a-2", "completed");

    expect(calls[0].op).toBe("update");
    expect(calls[0].eq).toEqual(["id", "a-2"]);
    expect(calls[0].payload).toMatchObject({ status: "completed" });
    expect(calls[0].payload).toHaveProperty("updated_at");
  });

  test("reopening writes pending", async () => {
    await data.setAssignmentStatus("a-2", "pending");

    expect(calls[0].payload).toMatchObject({ status: "pending" });
  });

  // The two share a code path but not a sentence: "we could not mark this
  // complete" is wrong when the user pressed Reopen.
  test("names the action the user actually took when it fails", async () => {
    queued = [{ error: REJECTED }];
    const completing = await rejection(() => data.setAssignmentStatus("a", "completed"));

    queued = [{ error: REJECTED }];
    const reopening = await rejection(() => data.setAssignmentStatus("a", "pending"));

    expect(completing.message).toMatch(/mark this complete/);
    expect(reopening.message).toMatch(/reopen this assignment/);
  });
});

describe("deleteAssignment", () => {
  test("deletes the given row", async () => {
    await data.deleteAssignment("a-3");

    expect(calls[0].op).toBe("delete");
    expect(calls[0].eq).toEqual(["id", "a-3"]);
  });
});

describe("a rejected write", () => {
  test.each(WRITES)("%s throws an AssignmentWriteError", async (_name, write) => {
    queued = [{ error: REJECTED }];

    const error = await rejection(write);

    expect(error).toBeInstanceOf(data.AssignmentWriteError);
    expect(error.name).toBe("AssignmentWriteError");
  });

  test.each(WRITES)("%s says what did not happen, in a sentence", async (_name, write) => {
    queued = [{ error: REJECTED }];

    const { message } = await rejection(write);

    expect(message).toMatch(/^We could not .+\.$/);
    expect(message).toMatch(/not been saved/);
  });

  // Postgrest's wording names constraints and columns. It is no use to a student
  // and tells an attacker about the schema, so it goes to the console only.
  test.each(WRITES)("%s does not leak the database's own message", async (_name, write) => {
    queued = [{ error: REJECTED }];

    const { message } = await rejection(write);

    expect(message).not.toContain(REJECTED.message);
    expect(message).not.toContain(REJECTED.code);
  });

  test.each(WRITES)("%s keeps the original error as its cause, and logs it", async (_name, write) => {
    queued = [{ error: REJECTED }];

    const error = await rejection(write);

    expect((error as { cause?: unknown }).cause).toBe(REJECTED);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(REJECTED);
  });
});

describe("the message a user is shown", () => {
  test("blames the connection when the browser reports being offline", async () => {
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    queued = [{ error: { code: "", message: "Failed to fetch" } }];

    const { message } = await rejection(() => data.deleteAssignment("a"));

    expect(message).toMatch(/offline/i);
  });

  // supabase-js reports a failed fetch with an empty code rather than an HTTP
  // status, so an unreachable server is distinguishable from a rejected query.
  test("blames the server, not the user, when the fetch fails while online", async () => {
    queued = [{ error: { code: "", message: "Failed to fetch" } }];

    const { message } = await rejection(() => data.deleteAssignment("a"));

    expect(message).toMatch(/could not reach the server/i);
    expect(message).not.toMatch(/offline/i);
  });

  // PGRST301 is an expired or rejected JWT; 42501 is row-level security saying
  // no, which for a stale session looks the same to the user.
  test.each(["PGRST301", "42501"])("tells the user to sign in again after %s", async (code) => {
    queued = [{ error: { code, message: "permission denied" } }];

    const { message } = await rejection(() => data.updateAssignment("a", { title: "x" }));

    expect(message).toMatch(/session has expired/i);
    expect(message).toMatch(/sign in again/i);
  });

  test("still says the change was not saved for a code it does not recognise", async () => {
    queued = [{ error: REJECTED }];

    const { message } = await rejection(() => data.updateAssignment("a", { title: "x" }));

    expect(message).toBe("We could not save your changes. It has not been saved.");
  });
});

describe("a successful write", () => {
  test.each(WRITES)("%s resolves silently and logs nothing", async (_name, write) => {
    await write();

    expect(logged).toHaveLength(0);
  });
});
