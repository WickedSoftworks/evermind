import { getTimeZone } from "@/lib/timezone-server"
import { Header } from "@/components/header"
import { PreviewAssignmentsList } from "@/components/preview-assignments-list"
import { TimeZoneProvider } from "@/components/timezone-provider"
import type { Assignment } from "@/lib/types"
import { addDays, subDays } from "date-fns"

// Reading the visitor's timezone renders this page per request, which also keeps
// the mock due dates below relative to "now" instead of freezing them at build time.

function createMockAssignments(): Assignment[] {
  const now = new Date()

  return [
    {
      id: "1",
      user_id: "preview-user",
      title: "Math Homework Chapter 5",
      subject: "Mathematics",
      description: "Complete exercises 1-20 on quadratic equations",
      due_date: addDays(now, 2).toISOString(),
      priority: "high",
      status: "pending",
      created_at: now.toISOString(),
    },
    {
      id: "2",
      user_id: "preview-user",
      title: "History Essay",
      subject: "History",
      description: "Write 1000 words on the Industrial Revolution",
      due_date: addDays(now, 5).toISOString(),
      priority: "medium",
      status: "pending",
      created_at: now.toISOString(),
    },
    {
      id: "3",
      user_id: "preview-user",
      title: "Physics Lab Report",
      subject: "Physics",
      description: "Document findings from the pendulum experiment",
      due_date: subDays(now, 1).toISOString(),
      priority: "high",
      status: "pending",
      created_at: now.toISOString(),
    },
    {
      id: "4",
      user_id: "preview-user",
      title: "English Reading",
      subject: "English",
      description: "Read chapters 10-15 of To Kill a Mockingbird",
      due_date: addDays(now, 1).toISOString(),
      priority: "low",
      status: "completed",
      created_at: now.toISOString(),
    },
    {
      id: "5",
      user_id: "preview-user",
      title: "Chemistry Quiz Prep",
      subject: "Chemistry",
      description: "Study periodic table and chemical bonding",
      due_date: addDays(now, 3).toISOString(),
      priority: "medium",
      status: "pending",
      created_at: now.toISOString(),
    },
    {
      id: "6",
      user_id: "preview-user",
      title: "Art Project Sketch",
      subject: "Art",
      description: "Complete preliminary sketches for final project",
      due_date: addDays(now, 6).toISOString(),
      priority: "low",
      status: "pending",
      created_at: now.toISOString(),
    },
  ]
}

export default async function PreviewPage() {
  const mockUser = {
    id: "preview-user",
    email: "student@example.com",
    user_metadata: {
      avatar_url: null,
    },
  } as any

  return (
    <div className="min-h-screen bg-background">
      <Header user={mockUser} isPreview />
      <main className="w-full py-6 px-6 md:px-10 lg:px-16">
        <TimeZoneProvider initialTimeZone={await getTimeZone()}>
          <PreviewAssignmentsList initialAssignments={createMockAssignments()} />
        </TimeZoneProvider>
      </main>
    </div>
  )
}
