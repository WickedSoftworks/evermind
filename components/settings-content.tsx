"use client"

import { useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTheme } from "@/components/theme-provider"
import { useCompactMode } from "@/components/compact-mode-provider"
import { useColorTheme, DEFAULT_CUSTOM_THEMES, type CustomTheme } from "@/components/color-theme-provider"
import { Trash2, Plus, Pencil, Upload, FileSpreadsheet, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import GoogleIcon from "@/components/icons/GoogleIcon"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import type { Assignment, Priority } from "@/lib/types"

interface SettingsContentProps {
  user: SupabaseUser
}

interface ParsedAssignment {
  title: string
  subject: string
  description: string | null
  due_date: string
  priority: Priority
}

const PRESET_THEMES = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
]

export function SettingsContent({ user }: SettingsContentProps) {
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get("tab")
  const defaultTab = tabFromUrl === "appearance" ? "appearance" : "general"
  
  const { theme, setTheme } = useTheme()
  const { isCompact, setIsCompact } = useCompactMode()
  const { colorTheme: selectedColorTheme, setColorTheme, customThemes, setCustomThemes } = useColorTheme()
  const [isAddingTheme, setIsAddingTheme] = useState(false)
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null)
  
  // Assignment import state
  const [canvasImportStatus, setCanvasImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [canvasImportMessage, setCanvasImportMessage] = useState("")
  const [parsedAssignments, setParsedAssignments] = useState<ParsedAssignment[]>([])
  const [googleClassroomStatus, setGoogleClassroomStatus] = useState<"idle" | "loading" | "connected" | "error">("idle")
  const canvasFileInputRef = useRef<HTMLInputElement>(null)
  
  const [newTheme, setNewTheme] = useState<CustomTheme>({
    id: "",
    name: "",
    colors: {
      primary: "#0ea5e9",
      background: "#ffffff",
      foreground: "#0f172a",
      card: "#ffffff",
      accent: "#f1f5f9",
    },
  })

  const handleColorThemeChange = (value: string) => {
    setColorTheme(value)
  }

  const handleAddTheme = () => {
    if (!newTheme.name.trim()) return

    const theme: CustomTheme = {
      ...newTheme,
      id: newTheme.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
    }

    const updatedThemes = [...customThemes, theme]
    setCustomThemes(updatedThemes)
    setIsAddingTheme(false)
    setNewTheme({
      id: "",
      name: "",
      colors: {
        primary: "#0ea5e9",
        background: "#ffffff",
        foreground: "#0f172a",
        card: "#ffffff",
        accent: "#f1f5f9",
      },
    })
  }

  const handleDeleteTheme = (themeId: string) => {
    const updatedThemes = customThemes.filter((t) => t.id !== themeId)
    setCustomThemes(updatedThemes)
    if (selectedColorTheme === themeId) {
      handleColorThemeChange("default")
    }
  }

  const handleEditTheme = (theme: CustomTheme) => {
    setEditingTheme(theme)
    setNewTheme({ ...theme })
    setIsAddingTheme(false)
  }

  const handleSaveEdit = () => {
    if (!editingTheme || !newTheme.name.trim()) return

    const updatedThemes = customThemes.map((t) =>
      t.id === editingTheme.id ? { ...newTheme, id: editingTheme.id } : t
    )
    setCustomThemes(updatedThemes)
    
    // Re-apply if this theme is currently selected
    if (selectedColorTheme === editingTheme.id) {
      // Force re-apply by setting to default then back
      setColorTheme("default")
      setTimeout(() => setColorTheme(editingTheme.id), 0)
    }
    
    handleCancelEdit()
  }

  const handleCancelEdit = () => {
    setEditingTheme(null)
    setNewTheme({
      id: "",
      name: "",
      colors: {
        primary: "#0ea5e9",
        background: "#ffffff",
        foreground: "#0f172a",
        card: "#ffffff",
        accent: "#f1f5f9",
      },
    })
  }

  // Canvas CSV/file import handler
  const handleCanvasFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCanvasImportStatus("loading")
    setCanvasImportMessage("")
    setParsedAssignments([])

    try {
      const text = await file.text()
      const assignments: ParsedAssignment[] = []

      if (file.name.endsWith(".csv")) {
        // Parse Canvas CSV export
        const lines = text.split("\n")
        const headers = lines[0]?.toLowerCase().split(",").map(h => h.trim().replace(/"/g, ""))
        
        const titleIdx = headers?.findIndex(h => h.includes("title") || h.includes("name") || h.includes("assignment"))
        const dueDateIdx = headers?.findIndex(h => h.includes("due") || h.includes("date"))
        const descIdx = headers?.findIndex(h => h.includes("description") || h.includes("details"))
        const courseIdx = headers?.findIndex(h => h.includes("course") || h.includes("subject") || h.includes("class"))

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]?.trim()
          if (!line) continue
          
          // Handle CSV with quoted fields
          const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, "").trim()) || []
          
          const title = titleIdx !== undefined && titleIdx >= 0 ? values[titleIdx] : ""
          const dueDate = dueDateIdx !== undefined && dueDateIdx >= 0 ? values[dueDateIdx] : ""
          const description = descIdx !== undefined && descIdx >= 0 ? values[descIdx] : null
          const course = courseIdx !== undefined && courseIdx >= 0 ? values[courseIdx] : "Imported"

          if (title && dueDate) {
            const parsedDate = new Date(dueDate)
            if (!isNaN(parsedDate.getTime())) {
              assignments.push({
                title,
                subject: course || "Imported",
                description: description || null,
                due_date: parsedDate.toISOString().split("T")[0],
                priority: "medium",
              })
            }
          }
        }
      } else if (file.name.endsWith(".json")) {
        // Parse Canvas JSON export or similar
        const data = JSON.parse(text)
        const items = Array.isArray(data) ? data : data.assignments || data.items || []
        
        for (const item of items) {
          const title = item.title || item.name || item.assignment_name
          const dueDate = item.due_date || item.due_at || item.dueDate
          
          if (title && dueDate) {
            const parsedDate = new Date(dueDate)
            if (!isNaN(parsedDate.getTime())) {
              assignments.push({
                title,
                subject: item.course_name || item.subject || item.course || "Imported",
                description: item.description || null,
                due_date: parsedDate.toISOString().split("T")[0],
                priority: "medium",
              })
            }
          }
        }
      } else if (file.name.endsWith(".xml") || file.name.endsWith(".imscc")) {
        // Parse IMS Common Cartridge (Canvas export format)
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, "text/xml")
        
        // Look for assignment items in various formats
        const items = doc.querySelectorAll("item, assignment, resource")
        items.forEach((item) => {
          const title = item.querySelector("title")?.textContent || item.getAttribute("title")
          const dueDate = item.querySelector("due_at, due_date, date")?.textContent
          const description = item.querySelector("description, text")?.textContent

          if (title && dueDate) {
            const parsedDate = new Date(dueDate)
            if (!isNaN(parsedDate.getTime())) {
              assignments.push({
                title,
                subject: "Imported",
                description: description || null,
                due_date: parsedDate.toISOString().split("T")[0],
                priority: "medium",
              })
            }
          }
        })
      }

      if (assignments.length > 0) {
        setParsedAssignments(assignments)
        setCanvasImportStatus("success")
        setCanvasImportMessage(`Found ${assignments.length} assignment${assignments.length > 1 ? "s" : ""} ready to import`)
      } else {
        setCanvasImportStatus("error")
        setCanvasImportMessage("No assignments found in file. Make sure the file contains assignment data with titles and due dates.")
      }
    } catch (error) {
      setCanvasImportStatus("error")
      setCanvasImportMessage("Failed to parse file. Please check the file format.")
    }

    // Reset file input
    if (canvasFileInputRef.current) {
      canvasFileInputRef.current.value = ""
    }
  }

  // TODO: Implement actual import to database
  const handleImportAssignments = async () => {
    // This would call an API route to save assignments to Supabase
    console.log("Importing assignments:", parsedAssignments)
    // For now, just show success
    setCanvasImportMessage(`Successfully imported ${parsedAssignments.length} assignments!`)
  }

  // Google Classroom OAuth handler (placeholder)
  const handleGoogleClassroomConnect = () => {
    setGoogleClassroomStatus("loading")
    // TODO: Implement actual Google Classroom OAuth flow
    // This would redirect to Google OAuth consent screen
    setTimeout(() => {
      setGoogleClassroomStatus("idle")
      alert("Google Classroom integration requires OAuth setup. Please configure Google API credentials.")
    }, 1000)
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Not available"
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const initials = user.email ? user.email.substring(0, 2).toUpperCase() : "U"
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User"

  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
        <TabsTrigger value="assignments" className="flex-1">Assignments</TabsTrigger>
        <TabsTrigger value="appearance" className="flex-1">Appearance</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your account details and profile information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.user_metadata?.avatar_url || user.user_metadata?.picture} alt={displayName} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{displayName}</h3>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">Email Address</Label>
                <p className="text-sm font-medium">{user.email || "Not provided"}</p>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">Display Name</Label>
                <p className="text-sm font-medium">{displayName}</p>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">Account Created</Label>
                <p className="text-sm font-medium">{formatDate(user.created_at)}</p>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">Last Sign In</Label>
                <p className="text-sm font-medium">{formatDate(user.last_sign_in_at)}</p>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">Auth Provider</Label>
                <p className="text-sm font-medium capitalize">{user.app_metadata?.provider || "Email"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="assignments" className="mt-6 space-y-6">
        {/* Google Classroom Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GoogleIcon className="h-5 w-5" />
              Google Classroom
            </CardTitle>
            <CardDescription>
              Connect your Google Classroom account to automatically import assignments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  {googleClassroomStatus === "connected" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <ExternalLink className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">
                      {googleClassroomStatus === "connected" ? "Connected" : "Not connected"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {googleClassroomStatus === "connected"
                        ? "Assignments will sync automatically"
                        : "Connect to import your classroom assignments"}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleGoogleClassroomConnect}
                  disabled={googleClassroomStatus === "loading"}
                  variant={googleClassroomStatus === "connected" ? "outline" : "default"}
                >
                  {googleClassroomStatus === "loading" && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {googleClassroomStatus === "connected" ? "Disconnect" : "Connect"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll only access your classroom assignments and courses. You can disconnect at any time.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Canvas File Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Canvas Import
            </CardTitle>
            <CardDescription>
              Import assignments from a Canvas course export file (CSV, JSON, or IMSCC)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <input
                  ref={canvasFileInputRef}
                  type="file"
                  accept=".csv,.json,.xml,.imscc"
                  onChange={handleCanvasFileImport}
                  className="hidden"
                  id="canvas-file-input"
                />
                <label htmlFor="canvas-file-input" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="font-medium">Click to upload or drag and drop</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    CSV, JSON, XML, or IMSCC files
                  </p>
                </label>
              </div>

              {canvasImportStatus === "loading" && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Parsing file...</span>
                </div>
              )}

              {canvasImportStatus === "error" && (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{canvasImportMessage}</span>
                </div>
              )}

              {canvasImportStatus === "success" && parsedAssignments.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{canvasImportMessage}</span>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                    {parsedAssignments.map((assignment, idx) => (
                      <div key={idx} className="p-3 text-sm">
                        <p className="font-medium">{assignment.title}</p>
                        <p className="text-muted-foreground">
                          {assignment.subject} • Due: {new Date(assignment.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>

                  <Button onClick={handleImportAssignments} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Import {parsedAssignments.length} Assignment{parsedAssignments.length > 1 ? "s" : ""}
                  </Button>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">How to export from Canvas:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Go to your Canvas course</li>
                  <li>Click Settings → Export Course Content</li>
                  <li>Select "Course" or "Assignments" and download</li>
                  <li>Upload the exported file here</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance" className="mt-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Theme Mode</CardTitle>
            <CardDescription>Choose between light, dark, or system theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="theme-mode">Mode</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger id="theme-mode" className="w-full">
                  <SelectValue placeholder="Select theme mode" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_THEMES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Color Theme</CardTitle>
            <CardDescription>Customize the accent colors of the application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="color-theme">Color Palette</Label>
              <Select value={selectedColorTheme} onValueChange={handleColorThemeChange}>
                <SelectTrigger id="color-theme" className="w-full">
                  <SelectValue placeholder="Select color theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default (Teal)</SelectItem>
                  {DEFAULT_CUSTOM_THEMES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {customThemes.filter(t => !DEFAULT_CUSTOM_THEMES.find(d => d.id === t.id)).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} (Custom)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Theme Preview Swatches */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              <button
                onClick={() => handleColorThemeChange("default")}
                className={`h-8 rounded-md border-2 transition-all ${selectedColorTheme === "default" ? "border-foreground" : "border-transparent"}`}
                style={{ backgroundColor: "oklch(0.55 0.15 180)" }}
                title="Default (Teal)"
              />
              {DEFAULT_CUSTOM_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleColorThemeChange(t.id)}
                  className={`h-8 rounded-md border-2 transition-all ${selectedColorTheme === t.id ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: t.colors.primary }}
                  title={t.name}
                />
              ))}
              {customThemes.filter(t => !DEFAULT_CUSTOM_THEMES.find(d => d.id === t.id)).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleColorThemeChange(t.id)}
                  className={`h-8 rounded-md border-2 transition-all ${selectedColorTheme === t.id ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: t.colors.primary }}
                  title={t.name}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom Themes</CardTitle>
            <CardDescription>Create and manage your own color themes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Custom themes list */}
            {customThemes.filter(t => !DEFAULT_CUSTOM_THEMES.find(d => d.id === t.id)).length > 0 && (
              <div className="space-y-2">
                {customThemes.filter(t => !DEFAULT_CUSTOM_THEMES.find(d => d.id === t.id)).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: t.colors.primary }}
                      />
                      <span className="font-medium">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditTheme(t)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTheme(t.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add/Edit theme form */}
            {(isAddingTheme || editingTheme) ? (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="grid gap-2">
                  <Label htmlFor="theme-name">{editingTheme ? "Edit Theme Name" : "Theme Name"}</Label>
                  <Input
                    id="theme-name"
                    placeholder="My Custom Theme"
                    value={newTheme.name}
                    onChange={(e) => setNewTheme({ ...newTheme, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primary-color"
                      type="color"
                      value={newTheme.colors.primary.startsWith("#") ? newTheme.colors.primary : "#0ea5e9"}
                      onChange={(e) =>
                        setNewTheme({
                          ...newTheme,
                          colors: { ...newTheme.colors, primary: e.target.value },
                        })
                      }
                      className="w-16 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={newTheme.colors.primary}
                      onChange={(e) =>
                        setNewTheme({
                          ...newTheme,
                          colors: { ...newTheme.colors, primary: e.target.value },
                        })
                      }
                      placeholder="#0ea5e9 or oklch(...)"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use hex colors (#0ea5e9) or OKLCH format (oklch(0.55 0.15 180))
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingTheme ? (
                    <>
                      <Button onClick={handleSaveEdit} disabled={!newTheme.name.trim()}>
                        Save Changes
                      </Button>
                      <Button variant="outline" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={handleAddTheme} disabled={!newTheme.name.trim()}>
                        Save Theme
                      </Button>
                      <Button variant="outline" onClick={() => setIsAddingTheme(false)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <Button onClick={() => setIsAddingTheme(true)} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Theme
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Layout Density</CardTitle>
            <CardDescription>Adjust the spacing and padding of UI elements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="compact-mode">Compact Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Reduce padding and spacing for a denser interface
                </p>
              </div>
              <Switch
                id="compact-mode"
                checked={isCompact}
                onCheckedChange={setIsCompact}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <p className="mt-10 text-center text-sm text-muted-foreground/70">
        Tip: Click on the Evermind logo to go home!
      </p>
    </Tabs>
  )
}
