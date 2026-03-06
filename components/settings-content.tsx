"use client"

import { useState, useEffect } from "react"
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
import { Trash2, Plus } from "lucide-react"
import type { User as SupabaseUser } from "@supabase/supabase-js"

interface SettingsContentProps {
  user: SupabaseUser
}

interface CustomTheme {
  id: string
  name: string
  colors: {
    primary: string
    background: string
    foreground: string
    card: string
    accent: string
  }
}

const PRESET_THEMES = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
]

const DEFAULT_CUSTOM_THEMES: CustomTheme[] = [
  {
    id: "ocean",
    name: "Ocean",
    colors: {
      primary: "oklch(0.55 0.2 220)",
      background: "oklch(0.98 0.01 220)",
      foreground: "oklch(0.2 0.02 220)",
      card: "oklch(1 0 0)",
      accent: "oklch(0.9 0.05 220)",
    },
  },
  {
    id: "forest",
    name: "Forest",
    colors: {
      primary: "oklch(0.5 0.15 145)",
      background: "oklch(0.98 0.01 145)",
      foreground: "oklch(0.2 0.02 145)",
      card: "oklch(1 0 0)",
      accent: "oklch(0.9 0.05 145)",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: {
      primary: "oklch(0.6 0.2 25)",
      background: "oklch(0.98 0.01 25)",
      foreground: "oklch(0.2 0.02 25)",
      card: "oklch(1 0 0)",
      accent: "oklch(0.9 0.05 25)",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    colors: {
      primary: "oklch(0.55 0.2 280)",
      background: "oklch(0.98 0.01 280)",
      foreground: "oklch(0.2 0.02 280)",
      card: "oklch(1 0 0)",
      accent: "oklch(0.9 0.05 280)",
    },
  },
]

export function SettingsContent({ user }: SettingsContentProps) {
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get("tab")
  const defaultTab = tabFromUrl === "appearance" ? "appearance" : "general"
  
  const { theme, setTheme } = useTheme()
  const { isCompact, setIsCompact } = useCompactMode()
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([])
  const [selectedColorTheme, setSelectedColorTheme] = useState<string>("default")
  const [isAddingTheme, setIsAddingTheme] = useState(false)
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

  // Load custom themes from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("evermind-custom-themes")
    if (stored) {
      setCustomThemes(JSON.parse(stored))
    } else {
      setCustomThemes(DEFAULT_CUSTOM_THEMES)
      localStorage.setItem("evermind-custom-themes", JSON.stringify(DEFAULT_CUSTOM_THEMES))
    }

    const storedColorTheme = localStorage.getItem("evermind-color-theme")
    if (storedColorTheme) {
      setSelectedColorTheme(storedColorTheme)
      if (storedColorTheme !== "default") {
        applyColorTheme(storedColorTheme)
      }
    }
  }, [])

  const applyColorTheme = (themeId: string) => {
    if (themeId === "default") {
      // Remove custom CSS variables
      document.documentElement.style.removeProperty("--primary")
      document.documentElement.style.removeProperty("--background")
      document.documentElement.style.removeProperty("--foreground")
      document.documentElement.style.removeProperty("--card")
      document.documentElement.style.removeProperty("--accent")
      document.documentElement.style.removeProperty("--ring")
      return
    }

    const allThemes = [...DEFAULT_CUSTOM_THEMES, ...customThemes]
    const selectedTheme = allThemes.find((t) => t.id === themeId)
    if (selectedTheme) {
      document.documentElement.style.setProperty("--primary", selectedTheme.colors.primary)
      document.documentElement.style.setProperty("--ring", selectedTheme.colors.primary)
    }
  }

  const handleColorThemeChange = (value: string) => {
    setSelectedColorTheme(value)
    localStorage.setItem("evermind-color-theme", value)
    applyColorTheme(value)
  }

  const handleAddTheme = () => {
    if (!newTheme.name.trim()) return

    const theme: CustomTheme = {
      ...newTheme,
      id: newTheme.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
    }

    const updatedThemes = [...customThemes, theme]
    setCustomThemes(updatedThemes)
    localStorage.setItem("evermind-custom-themes", JSON.stringify(updatedThemes))
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
    localStorage.setItem("evermind-custom-themes", JSON.stringify(updatedThemes))
    if (selectedColorTheme === themeId) {
      handleColorThemeChange("default")
    }
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTheme(t.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new theme form */}
            {isAddingTheme ? (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="grid gap-2">
                  <Label htmlFor="theme-name">Theme Name</Label>
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
                  <Button onClick={handleAddTheme} disabled={!newTheme.name.trim()}>
                    Save Theme
                  </Button>
                  <Button variant="outline" onClick={() => setIsAddingTheme(false)}>
                    Cancel
                  </Button>
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
    </Tabs>
  )
}
