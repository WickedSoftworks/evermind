"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

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

// Default themes that come with the app
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
  {
    id: "plasma",
    name: "Plasma",
    colors: {
      primary: "#f70088",
      background: "#1a1a1a",
      foreground: "#e0e0e0",
      card: "#2a2a2a",
      accent: "#00fff7",
    },
  },
  {
    id: "nightswim",
    name: "Night Swim",
    colors: {
      primary: "#123678",
      background: "#0a1a2b",
      foreground: "#d0e0f0",
      card: "#1a2a4a",
      accent: "#ff6f91",
    }
  },
  {
    id: "mint",
    name: "Mint",
    colors: {
      primary: "#9cfea4",
      background: "#f0fff4",
      foreground: "#004d40",
      card: "#e0f7fa",
      accent: "#ff4081",
    }
  },
  {
    id: "candy",
    name: "Candy",
    colors: {
      primary: "#fe94e1",
      background: "#fff0f5",
      foreground: "#4a148c",
      card: "#fce4ec",
      accent: "#00bcd4",
    }
  },
]

interface ColorThemeContextType {
  colorTheme: string
  setColorTheme: (themeId: string) => void
  customThemes: CustomTheme[]
  setCustomThemes: (themes: CustomTheme[]) => void
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined)

function applyColorTheme(themeId: string, customThemes: CustomTheme[]) {
  if (themeId === "default") {
    document.documentElement.style.removeProperty("--primary")
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

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState("default")
  const [customThemes, setCustomThemesState] = useState<CustomTheme[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Load custom themes from localStorage
    const storedThemes = localStorage.getItem("evermind-custom-themes")
    let themes: CustomTheme[] = []
    if (storedThemes) {
      themes = JSON.parse(storedThemes)
      setCustomThemesState(themes)
    } else {
      themes = DEFAULT_CUSTOM_THEMES
      setCustomThemesState(DEFAULT_CUSTOM_THEMES)
      localStorage.setItem("evermind-custom-themes", JSON.stringify(DEFAULT_CUSTOM_THEMES))
    }

    // Load and apply selected color theme
    const storedColorTheme = localStorage.getItem("evermind-color-theme")
    if (storedColorTheme && storedColorTheme !== "default") {
      setColorThemeState(storedColorTheme)
      applyColorTheme(storedColorTheme, themes)
    }

    setMounted(true)
  }, [])

  const setColorTheme = (themeId: string) => {
    setColorThemeState(themeId)
    localStorage.setItem("evermind-color-theme", themeId)
    applyColorTheme(themeId, customThemes)
  }

  const setCustomThemes = (themes: CustomTheme[]) => {
    setCustomThemesState(themes)
    localStorage.setItem("evermind-custom-themes", JSON.stringify(themes))
  }

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme, customThemes, setCustomThemes }}>
      {children}
    </ColorThemeContext.Provider>
  )
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext)
  if (context === undefined) {
    return {
      colorTheme: "default",
      setColorTheme: () => {},
      customThemes: [],
      setCustomThemes: () => {},
    }
  }
  return context
}

export { DEFAULT_CUSTOM_THEMES }
export type { CustomTheme }

/**
 * Script to inject into the page head to prevent FOUC for color themes.
 * This runs before React hydrates.
 */
export const colorThemeScript = `
  (function() {
    try {
      var defaultThemes = [
        { id: "ocean", primary: "oklch(0.55 0.2 220)" },
        { id: "forest", primary: "oklch(0.5 0.15 145)" },
        { id: "sunset", primary: "oklch(0.6 0.2 25)" },
        { id: "lavender", primary: "oklch(0.55 0.2 280)" },
        { id: "plasma", primary: "#f70088" },
        { id: "nightswim", primary: "#123678"  },
        { id: "mint", primary: "#9cfea4"   },
        { id: "candy", primary: "#fe94e1"  }
      ];
      
      var colorTheme = localStorage.getItem('evermind-color-theme');
      if (colorTheme && colorTheme !== 'default') {
        var customThemes = [];
        try {
          customThemes = JSON.parse(localStorage.getItem('evermind-custom-themes') || '[]');
        } catch(e) {}
        
        var allThemes = defaultThemes.concat(customThemes);
        var theme = allThemes.find(function(t) { return t.id === colorTheme; });
        
        if (theme) {
          var primary = theme.primary || (theme.colors && theme.colors.primary);
          if (primary) {
            document.documentElement.style.setProperty('--primary', primary);
            document.documentElement.style.setProperty('--ring', primary);
          }
        }
      }
    } catch (e) {}
  })();
`
