export type Priority = "low" | "medium" | "high"
export type Status = "pending" | "completed" | "overdue"

export interface Assignment {
  id: string
  user_id: string
  title: string
  subject: string
  description: string | null
  due_date: string
  priority: Priority
  status: Status
  created_at: string
  updated_at?: string
}
