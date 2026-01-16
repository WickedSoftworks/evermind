import { Header } from "@/components/header"
import { PreviewAssignmentsList } from "@/components/preview-assignments-list"

export default function PreviewPage() {
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
        <PreviewAssignmentsList />
      </main>
    </div>
  )
}
