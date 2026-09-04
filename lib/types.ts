export type Priority = "low" | "medium" | "high";
export type Status = "pending" | "completed";

export interface Assignment {
  id: string;
  user_id: string;
  title: string;
  subject: string;
  description: string | null;
  due_date: string;
  priority: Priority;
  status: Status;
  created_at: string;
  updated_at?: string;
}

/**
 * A class the student has saved to pick from when filing an assignment.
 *
 * Assignments store their subject as free text and do not reference this row,
 * so renaming or deleting a class leaves existing assignments alone.
 */
export interface Class {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}
