import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useToast } from "@/hooks/use-toast";
import { AssignmentWriteError } from "@/lib/data/assignments";

/**
 * `useAssignmentMutation` owns the three things every call site used to get
 * wrong: a pending flag, revalidation *only* on success, and telling the user
 * when a write did not land (audit H2).
 *
 * The hook is exercised through `renderToStaticMarkup`, which needs no DOM: the
 * harness renders it once, keeps the returned `runMutation`, and the assertions
 * call that. Toasts are then read back out of the shared store rather than out
 * of the markup, because Radix renders the viewport through a portal that is
 * inert during a server render.
 */

const mutated: unknown[] = [];

mock.module("swr", () => ({
  useSWRConfig: () => ({
    mutate: (key: unknown) => {
      mutated.push(key);
      return Promise.resolve(undefined);
    },
  }),
}));

/**
 * Imported dynamically, because `mock.module` has to run before the hook is
 * evaluated and static imports are hoisted above it. In a `beforeAll` rather
 * than at the top level, because tsconfig targets ES6.
 */
let hook: typeof import("@/hooks/use-assignment-mutation");

beforeAll(async () => {
  hook = await import("@/hooks/use-assignment-mutation");
});

type Mutation = ReturnType<typeof hook.useAssignmentMutation>;

/** Renders the hook once and hands back what it returned. */
function mount(): Mutation {
  let captured: Mutation | undefined;

  function Harness() {
    captured = hook.useAssignmentMutation();
    return null;
  }

  renderToStaticMarkup(<Harness />);

  if (!captured) throw new Error("the harness did not render");
  return captured;
}

/** The current contents of the shared toast store. `TOAST_LIMIT` is 1, so the newest is index 0. */
function toasts() {
  let captured: ReturnType<typeof useToast>["toasts"] = [];

  function Probe() {
    captured = useToast().toasts;
    return null;
  }

  renderToStaticMarkup(<Probe />);
  return captured;
}

const succeed = async () => {};
const fail = (error: unknown) => async () => {
  throw error;
};

beforeEach(() => {
  mutated.length = 0;
});

describe("a write that lands", () => {
  test("reports success", async () => {
    expect(await mount().runMutation(succeed, "Could not add this assignment")).toBe(true);
  });

  test("revalidates the assignment list", async () => {
    await mount().runMutation(succeed, "Could not add this assignment");

    expect(mutated).toEqual(["assignments"]);
  });

  test("says nothing to the user", async () => {
    const before = toasts()[0]?.id;

    await mount().runMutation(succeed, "Could not add this assignment");

    expect(toasts()[0]?.id).toBe(before);
  });
});

describe("a write that does not land", () => {
  test("reports failure, so the caller can keep its dialog open", async () => {
    const result = await mount().runMutation(fail(new AssignmentWriteError("It has not been saved.")), "Nope");

    expect(result).toBe(false);
  });

  // Revalidating after a failed write is what let the list quietly snap back to
  // the old row while the dialog reported success.
  test("does not revalidate", async () => {
    await mount().runMutation(fail(new AssignmentWriteError("It has not been saved.")), "Nope");

    expect(mutated).toEqual([]);
  });

  test("shows a destructive toast carrying the caller's title and the error's message", async () => {
    const error = new AssignmentWriteError("You appear to be offline, so we could not delete this assignment.");

    await mount().runMutation(fail(error), "Could not delete this assignment");
    const [toast] = toasts();

    expect(toast.variant).toBe("destructive");
    expect(toast.title).toBe("Could not delete this assignment");
    expect(toast.description).toBe(error.message);
  });

  test("only one toast is raised per failure", async () => {
    await mount().runMutation(fail(new AssignmentWriteError("first")), "First");
    await mount().runMutation(fail(new AssignmentWriteError("second")), "Second");

    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].title).toBe("Second");
  });
});

// Anything that is not an AssignmentWriteError got past the data layer, so its
// message was never written for a user and may carry internals.
describe("an unexpected error", () => {
  const raw = new TypeError("Cannot read properties of undefined (reading 'from')");

  // The hook logs it on the way past; that is wanted behaviour, just not wanted output.
  const realConsoleError = console.error;
  beforeEach(() => {
    console.error = () => {};
  });
  afterEach(() => {
    console.error = realConsoleError;
  });

  test("still fails closed", async () => {
    expect(await mount().runMutation(fail(raw), "Could not save your changes")).toBe(false);
    expect(mutated).toEqual([]);
  });

  test("is reported generically, without leaking its text", async () => {
    await mount().runMutation(fail(raw), "Could not save your changes");
    const [toast] = toasts();

    expect(toast.title).toBe("Could not save your changes");
    expect(toast.description).toBe("Something went wrong and your change was not saved. Please try again.");
    expect(String(toast.description)).not.toContain("undefined");
  });
});
