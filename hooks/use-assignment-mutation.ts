"use client";

import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";
import { useToast } from "@/hooks/use-toast";
import { AssignmentWriteError } from "@/lib/data/assignments";

/** The SWR key every assignment list is cached under. */
const ASSIGNMENTS_KEY = "assignments";

function messageFor(error: unknown): string {
  if (error instanceof AssignmentWriteError) return error.message;
  console.error("Unexpected failure while writing an assignment:", error);
  return "Something went wrong and your change was not saved. Please try again.";
}

/**
 * Runs one write from `lib/data/assignments`, and owns the three things every call
 * site was previously getting wrong: a pending flag, revalidation only on success,
 * and telling the user when the write did not land.
 *
 * `runMutation` resolves to `true` if the write landed, so a caller can decide whether
 * to close its dialog — the old code closed unconditionally, which is what made a
 * failed save look like a successful one.
 */
export function useAssignmentMutation() {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  const runMutation = useCallback(
    async (write: () => Promise<void>, failureTitle: string): Promise<boolean> => {
      setIsPending(true);
      try {
        await write();
        mutate(ASSIGNMENTS_KEY);
        return true;
      } catch (error) {
        toast({
          variant: "destructive",
          title: failureTitle,
          description: messageFor(error),
        });
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [mutate, toast],
  );

  return { runMutation, isPending };
}
