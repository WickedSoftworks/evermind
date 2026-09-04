"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

/**
 * A theme authors one palette per mode. The app's light/dark toggle still decides
 * which one is live — a theme carries a hue identity, not a mode.
 *
 * These eight fields are the ones a theme actually has to state. Every other token in
 * globals.css is an alias of one of them (see TOKEN_MAP), so nothing has to be
 * computed and no pairing can drift out of contrast by accident.
 */
interface Palette {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  border: string;
  muted: string;
  mutedForeground: string;
}

interface CustomTheme {
  id: string;
  name: string;
  light: Palette;
  dark: Palette;
}

const PALETTE_KEYS = [
  "primary",
  "primaryForeground",
  "background",
  "foreground",
  "card",
  "border",
  "muted",
  "mutedForeground",
] as const;

/** Human labels for the theme editor, in the order they should be presented. */
const PALETTE_FIELDS: { key: keyof Palette; label: string; hint: string }[] = [
  { key: "primary", label: "Primary", hint: "Buttons, links, focus rings" },
  { key: "primaryForeground", label: "On primary", hint: "Text drawn on top of primary" },
  { key: "background", label: "Background", hint: "The page behind everything" },
  { key: "foreground", label: "Text", hint: "Body text on the background" },
  { key: "card", label: "Card", hint: "Cards, popovers, the sidebar" },
  { key: "border", label: "Border", hint: "Separators and input outlines" },
  { key: "muted", label: "Muted surface", hint: "Hover states and subtle fills" },
  { key: "mutedForeground", label: "Muted text", hint: "Secondary and helper text" },
];

/**
 * Every themeable custom property in globals.css, mapped to the palette field it
 * takes its value from. `--destructive` and the chart ramps stay global: they are
 * semantic, not decorative, and a theme should not be able to make "delete" look safe.
 */
const TOKEN_MAP: Record<string, keyof Palette> = {
  "--background": "background",
  "--foreground": "foreground",
  "--card": "card",
  "--card-foreground": "foreground",
  "--popover": "card",
  "--popover-foreground": "foreground",
  "--primary": "primary",
  "--primary-foreground": "primaryForeground",
  "--secondary": "muted",
  "--secondary-foreground": "foreground",
  "--muted": "muted",
  "--muted-foreground": "mutedForeground",
  "--accent": "muted",
  "--accent-foreground": "foreground",
  "--border": "border",
  "--input": "border",
  "--ring": "primary",
  "--sidebar": "card",
  "--sidebar-foreground": "foreground",
  "--sidebar-primary": "primary",
  "--sidebar-primary-foreground": "primaryForeground",
  "--sidebar-accent": "muted",
  "--sidebar-accent-foreground": "foreground",
  "--sidebar-border": "border",
  "--sidebar-ring": "primary",
};

/**
 * Palette values are written into a stylesheet, so they must not be able to carry
 * `;` or `}` and escape their declaration. This allows hex, rgb()/hsl()/oklch() and
 * bare colour keywords, and nothing else.
 */
const SAFE_COLOR = /^[a-zA-Z0-9#(),.%/\s-]{1,64}$/;

/** The palettes in globals.css, used to fill in the gaps when migrating old themes. */
const BASE_LIGHT: Palette = {
  primary: "oklch(0.55 0.15 180)",
  primaryForeground: "oklch(0.99 0 0)",
  background: "oklch(0.985 0.002 247)",
  foreground: "oklch(0.145 0.02 250)",
  card: "oklch(1 0 0)",
  border: "oklch(0.9 0.01 250)",
  muted: "oklch(0.96 0.01 250)",
  mutedForeground: "oklch(0.5 0.02 250)",
};

const BASE_DARK: Palette = {
  primary: "oklch(0.65 0.15 180)",
  primaryForeground: "oklch(0.15 0.02 180)",
  background: "oklch(0.145 0.02 250)",
  foreground: "oklch(0.985 0.002 247)",
  card: "oklch(0.18 0.02 250)",
  border: "oklch(0.28 0.02 250)",
  muted: "oklch(0.25 0.02 250)",
  mutedForeground: "oklch(0.65 0.02 250)",
};

/**
 * Builds the two surface palettes for a theme from a single hue, so the eight
 * built-ins stay consistent with each other and with globals.css. The result is
 * stored expanded — a user editing one of these gets all sixteen values, not a hue.
 */
function makeTheme(
  id: string,
  name: string,
  hue: number,
  primary: { light: string; dark: string },
  primaryForeground: { light: string; dark: string },
): CustomTheme {
  return {
    id,
    name,
    light: {
      primary: primary.light,
      primaryForeground: primaryForeground.light,
      background: `oklch(0.985 0.008 ${hue})`,
      foreground: `oklch(0.16 0.025 ${hue})`,
      card: `oklch(1 0.004 ${hue})`,
      border: `oklch(0.9 0.018 ${hue})`,
      muted: `oklch(0.96 0.014 ${hue})`,
      mutedForeground: `oklch(0.5 0.03 ${hue})`,
    },
    dark: {
      primary: primary.dark,
      primaryForeground: primaryForeground.dark,
      background: `oklch(0.15 0.022 ${hue})`,
      foreground: `oklch(0.97 0.006 ${hue})`,
      card: `oklch(0.19 0.028 ${hue})`,
      border: `oklch(0.29 0.032 ${hue})`,
      muted: `oklch(0.26 0.028 ${hue})`,
      mutedForeground: `oklch(0.68 0.035 ${hue})`,
    },
  };
}

const ON_LIGHT = "oklch(0.99 0 0)";

// Default themes that come with the app
const DEFAULT_CUSTOM_THEMES: CustomTheme[] = [
  makeTheme(
    "ocean",
    "Ocean",
    220,
    { light: "oklch(0.55 0.2 220)", dark: "oklch(0.7 0.15 220)" },
    { light: ON_LIGHT, dark: "oklch(0.15 0.03 220)" },
  ),
  makeTheme(
    "forest",
    "Forest",
    145,
    { light: "oklch(0.5 0.15 145)", dark: "oklch(0.7 0.15 145)" },
    { light: ON_LIGHT, dark: "oklch(0.15 0.03 145)" },
  ),
  makeTheme(
    "sunset",
    "Sunset",
    25,
    { light: "oklch(0.6 0.2 25)", dark: "oklch(0.72 0.18 25)" },
    { light: ON_LIGHT, dark: "oklch(0.16 0.03 25)" },
  ),
  makeTheme(
    "lavender",
    "Lavender",
    280,
    { light: "oklch(0.55 0.2 280)", dark: "oklch(0.72 0.16 280)" },
    { light: ON_LIGHT, dark: "oklch(0.16 0.03 280)" },
  ),
  makeTheme(
    "plasma",
    "Plasma",
    355,
    { light: "oklch(0.58 0.26 355)", dark: "oklch(0.7 0.24 355)" },
    { light: ON_LIGHT, dark: "oklch(0.15 0.04 355)" },
  ),
  makeTheme(
    "nightswim",
    "Night Swim",
    265,
    { light: "oklch(0.45 0.16 265)", dark: "oklch(0.65 0.16 265)" },
    { light: ON_LIGHT, dark: "oklch(0.15 0.03 265)" },
  ),
  // Mint and Candy are light primaries, so their text sits dark on top rather than white.
  makeTheme(
    "mint",
    "Mint",
    155,
    { light: "oklch(0.78 0.16 155)", dark: "oklch(0.84 0.16 155)" },
    { light: "oklch(0.2 0.05 155)", dark: "oklch(0.18 0.05 155)" },
  ),
  makeTheme(
    "candy",
    "Candy",
    330,
    { light: "oklch(0.72 0.19 330)", dark: "oklch(0.8 0.16 330)" },
    { light: "oklch(0.18 0.05 330)", dark: "oklch(0.18 0.05 330)" },
  ),
];

interface ColorThemeContextType {
  colorTheme: string;
  setColorTheme: (themeId: string) => void;
  customThemes: CustomTheme[];
  setCustomThemes: (themes: CustomTheme[]) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(undefined);

const CUSTOM_THEMES_STORAGE_KEY = "evermind-custom-themes";
const COLOR_THEME_STORAGE_KEY = "evermind-color-theme";
const STYLE_ELEMENT_ID = "evermind-color-theme";

function isPalette(value: unknown): value is Palette {
  if (typeof value !== "object" || value === null) return false;
  const palette = value as Record<string, unknown>;
  return PALETTE_KEYS.every((key) => typeof palette[key] === "string" && SAFE_COLOR.test(palette[key] as string));
}

function isCustomTheme(value: unknown): value is CustomTheme {
  if (typeof value !== "object" || value === null) return false;
  const theme = value as Record<string, unknown>;
  if (typeof theme.id !== "string" || typeof theme.name !== "string") return false;
  return isPalette(theme.light) && isPalette(theme.dark);
}

/**
 * Picks readable text for a primary colour, used when migrating a theme that only
 * ever stored one. Reads lightness straight out of `oklch(L ...)` or a hex triple;
 * anything else it cannot parse falls back to white, which is the old behaviour.
 */
function pickForeground(color: string, mode: "light" | "dark"): string {
  let lightness: number | null = null;

  const oklch = /^oklch\(\s*([\d.]+)(%?)/i.exec(color);
  if (oklch) {
    lightness = Number(oklch[1]) / (oklch[2] === "%" ? 100 : 1);
  } else {
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
    if (hex) {
      const digits =
        hex[1].length === 3
          ? [...hex[1]].map((d) => d + d)
          : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)];
      const [r, g, b] = digits.map((d) => Number.parseInt(d, 16) / 255);
      // Rec. 709 luma is close enough to OKLCH lightness for a light/dark decision.
      lightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  }

  if (lightness === null) return mode === "light" ? BASE_LIGHT.primaryForeground : BASE_DARK.primaryForeground;
  return lightness > 0.6 ? "oklch(0.18 0.02 250)" : ON_LIGHT;
}

/**
 * Themes written before this file stored a single `colors` object whose only applied
 * field was `primary`. The other four were never read, so carrying them over would
 * be inventing a design the user never saw; only the primary survives.
 */
function migrateLegacyTheme(value: unknown): CustomTheme | null {
  if (typeof value !== "object" || value === null) return null;
  const theme = value as Record<string, unknown>;
  if (typeof theme.id !== "string" || typeof theme.name !== "string") return null;
  if (typeof theme.colors !== "object" || theme.colors === null) return null;

  const primary = (theme.colors as Record<string, unknown>).primary;
  if (typeof primary !== "string" || !SAFE_COLOR.test(primary)) return null;

  return {
    id: theme.id,
    name: theme.name,
    light: { ...BASE_LIGHT, primary, primaryForeground: pickForeground(primary, "light") },
    dark: { ...BASE_DARK, primary, primaryForeground: pickForeground(primary, "dark") },
  };
}

/**
 * Reads the stored custom themes, tolerating a missing, unreadable, malformed or
 * partially corrupt value. Entries that do not match the CustomTheme shape are
 * migrated where possible and dropped otherwise; `null` means nothing usable is
 * stored, so the caller seeds the defaults.
 */
function readStoredCustomThemes(): CustomTheme[] | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
  } catch {
    // Storage can be unavailable entirely (private mode, blocked site data).
    return null;
  }
  if (!stored) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const themes: CustomTheme[] = [];
  for (const entry of parsed) {
    if (isCustomTheme(entry)) {
      themes.push(entry);
      continue;
    }
    const migrated = migrateLegacyTheme(entry);
    if (migrated) themes.push(migrated);
  }
  return themes;
}

function writeCustomThemes(themes: CustomTheme[]) {
  try {
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // Persisting is best-effort; the themes still apply for this session.
  }
}

function readStoredColorTheme(): string {
  try {
    return localStorage.getItem(COLOR_THEME_STORAGE_KEY) ?? "default";
  } catch {
    return "default";
  }
}

/**
 * Both values live in localStorage, which React cannot observe on its own, so the
 * provider reads them through `useSyncExternalStore`. That gives the correct value on
 * the first client render without a lazy `useState` initialiser, which would read
 * localStorage during hydration and disagree with the server-rendered markup.
 *
 * The snapshots are cached because `getSnapshot` must return a referentially stable
 * value between renders, and so a selection still applies for the session when
 * localStorage is unavailable and cannot be written.
 */
const listeners = new Set<() => void>();

let cachedColorTheme: string | null = null;
let cachedCustomThemes: CustomTheme[] | null = null;

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    // `key` is null when storage is cleared wholesale.
    if (event.key !== null && event.key !== COLOR_THEME_STORAGE_KEY && event.key !== CUSTOM_THEMES_STORAGE_KEY) {
      return;
    }
    cachedColorTheme = null;
    cachedCustomThemes = null;
    onStoreChange();
  };

  listeners.add(onStoreChange);
  // Keep other tabs in sync too.
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function getColorThemeSnapshot(): string {
  if (cachedColorTheme === null) {
    cachedColorTheme = readStoredColorTheme();
  }
  return cachedColorTheme;
}

function getColorThemeServerSnapshot(): string {
  return "default";
}

function getCustomThemesSnapshot(): CustomTheme[] {
  if (cachedCustomThemes === null) {
    cachedCustomThemes = readStoredCustomThemes() ?? DEFAULT_CUSTOM_THEMES;
  }
  return cachedCustomThemes;
}

function getCustomThemesServerSnapshot(): CustomTheme[] {
  return DEFAULT_CUSTOM_THEMES;
}

/** A stored theme shadows a built-in with the same id, so editing one takes effect. */
function findTheme(themeId: string, customThemes: CustomTheme[]): CustomTheme | null {
  return customThemes.find((t) => t.id === themeId) ?? DEFAULT_CUSTOM_THEMES.find((t) => t.id === themeId) ?? null;
}

/**
 * Emits both palettes as CSS rather than setting inline styles, so the light/dark
 * toggle keeps working through the cascade instead of needing JS on every switch.
 * `:root:root` outranks the `:root` and `.dark` blocks in globals.css whatever the
 * source order, and `:root:root.dark` outranks the light rule in turn.
 */
function buildThemeCss(theme: CustomTheme): string {
  const rule = (selector: string, palette: Palette) => {
    const declarations = Object.entries(TOKEN_MAP)
      .map(([property, key]) => `${property}:${palette[key]};`)
      .join("");
    return `${selector}{${declarations}}`;
  };
  return `${rule(":root:root", theme.light)}${rule(":root:root.dark", theme.dark)}`;
}

function applyColorTheme(themeId: string, customThemes: CustomTheme[]) {
  let element = document.getElementById(STYLE_ELEMENT_ID);
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ELEMENT_ID;
    document.head.appendChild(element);
  }

  const theme = themeId === "default" ? null : findTheme(themeId, customThemes);
  // Validation happens on read, but a theme can also arrive straight from the editor.
  element.textContent = theme && isCustomTheme(theme) ? buildThemeCss(theme) : "";
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const colorTheme = useSyncExternalStore(subscribe, getColorThemeSnapshot, getColorThemeServerSnapshot);
  const customThemes = useSyncExternalStore(subscribe, getCustomThemesSnapshot, getCustomThemesServerSnapshot);

  // Seed the defaults on first visit, so the settings editor has something to list.
  useEffect(() => {
    if (readStoredCustomThemes() === null) {
      writeCustomThemes(DEFAULT_CUSTOM_THEMES);
    }
  }, []);

  // The inline head script writes the same stylesheet before paint; this keeps it
  // correct afterwards, including when another tab changes the selection.
  useEffect(() => {
    applyColorTheme(colorTheme, customThemes);
  }, [colorTheme, customThemes]);

  const setColorTheme = useCallback((themeId: string) => {
    cachedColorTheme = themeId;
    try {
      localStorage.setItem(COLOR_THEME_STORAGE_KEY, themeId);
    } catch {
      // Persisting is best-effort; the selection still applies for this session.
    }
    notifyListeners();
  }, []);

  const setCustomThemes = useCallback((themes: CustomTheme[]) => {
    cachedCustomThemes = themes;
    writeCustomThemes(themes);
    notifyListeners();
  }, []);

  const value = useMemo(
    () => ({ colorTheme, setColorTheme, customThemes, setCustomThemes }),
    [colorTheme, setColorTheme, customThemes, setCustomThemes],
  );

  return <ColorThemeContext.Provider value={value}>{children}</ColorThemeContext.Provider>;
}

export function useColorTheme() {
  const context = useContext(ColorThemeContext);
  if (context === undefined) {
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  }
  return context;
}

export type { CustomTheme, Palette };
export { BASE_DARK, BASE_LIGHT, DEFAULT_CUSTOM_THEMES, PALETTE_FIELDS, pickForeground };

/**
 * Script to inject into the page head to prevent FOUC for color themes.
 * This runs before React hydrates, and builds the same stylesheet from the same
 * token map, so the pre-paint result matches what the provider would produce.
 */
export const colorThemeScript = `
  (function() {
    try {
      var colorTheme = localStorage.getItem('${COLOR_THEME_STORAGE_KEY}');
      if (!colorTheme || colorTheme === 'default') return;

      var TOKENS = ${JSON.stringify(TOKEN_MAP)};
      var SAFE = new RegExp(${JSON.stringify(SAFE_COLOR.source)});
      var themes = ${JSON.stringify(DEFAULT_CUSTOM_THEMES).replace(/</g, "\\u003c")};

      try {
        var stored = JSON.parse(localStorage.getItem('${CUSTOM_THEMES_STORAGE_KEY}') || '[]');
        if (Array.isArray(stored)) themes = themes.concat(stored);
      } catch (e) {}

      // Later entries win, so a stored theme shadows the built-in of the same id.
      var theme = null;
      for (var i = themes.length - 1; i >= 0; i--) {
        if (themes[i] && themes[i].id === colorTheme) { theme = themes[i]; break; }
      }
      if (!theme || !theme.light || !theme.dark) return;

      function rule(selector, palette) {
        var out = selector + '{';
        for (var property in TOKENS) {
          var value = palette[TOKENS[property]];
          if (typeof value !== 'string' || !SAFE.test(value)) return '';
          out += property + ':' + value + ';';
        }
        return out + '}';
      }

      // Both palettes have to be sound, or the half that applied would be a mismatch.
      var light = rule(':root:root', theme.light);
      var dark = rule(':root:root.dark', theme.dark);
      if (!light || !dark) return;
      var css = light + dark;

      var el = document.createElement('style');
      el.id = '${STYLE_ELEMENT_ID}';
      el.textContent = css;
      document.head.appendChild(el);
    } catch (e) {}
  })();
`;
