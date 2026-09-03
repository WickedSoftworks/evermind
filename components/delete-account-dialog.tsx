"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

// Settings the app keeps outside the database.
const LOCAL_KEYS = ["evermind-compact-mode", "evermind-color-theme", "evermind-custom-themes"]

export function DeleteAccountDialog({ email }: { email: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canDelete = confirmation.trim().toLowerCase() === email.toLowerCase()

  const handleDelete = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch("/api/account/delete", { method: "POST" })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setError(body.error || "Could not delete the account. Please try again.")
        setIsDeleting(false)
        return
      }
    } catch {
      setError("Could not reach the server. Please try again.")
      setIsDeleting(false)
      return
    }

    LOCAL_KEYS.forEach((key) => {
      localStorage.removeItem(key)
    })
    router.replace("/auth/login")
  }

  const handleOpenChange = (next: boolean) => {
    if (isDeleting) return
    setOpen(next)
    setConfirmation("")
    setError(null)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your account and every assignment attached to it. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="delete-confirmation">
            Type <span className="font-medium text-foreground">{email}</span> to confirm
          </Label>
          <Input
            id="delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={isDeleting}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={!canDelete || isDeleting} onClick={handleDelete}>
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
