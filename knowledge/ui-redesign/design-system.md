# Design System — Phantom Trading Co. Dashboard

> **Date:** 2026-03-08
> **Author:** UI Design Division
> **Inspiration:** Claude Cowork design principles — NOT a clone
> **Target:** Paperclip dashboard at `paperclip/ui/`

---

## 1. Color System

All colors specified in OKLch (perceptually uniform) with hex fallbacks.

### Base Colors

| Token | OKLch | Hex | Usage |
|-------|-------|-----|-------|
| `--background` | `oklch(0.98 0.005 80)` | `#FAF9F6` | Page background, warm cream |
| `--foreground` | `oklch(0.22 0.02 60)` | `#2D2A26` | Primary text, warm near-black |
| `--card` | `oklch(0.99 0.003 80)` | `#FDFCFA` | Card surfaces, slightly elevated |
| `--card-foreground` | `oklch(0.22 0.02 60)` | `#2D2A26` | Card text |
| `--popover` | `oklch(0.99 0.003 80)` | `#FDFCFA` | Popover surfaces |
| `--popover-foreground` | `oklch(0.22 0.02 60)` | `#2D2A26` | Popover text |

### Semantic Colors

| Token | OKLch | Hex | Usage |
|-------|-------|-----|-------|
| `--primary` | `oklch(0.55 0.15 40)` | `#C2572A` | Terracotta — primary accent, CTAs |
| `--primary-foreground` | `oklch(0.98 0.005 80)` | `#FAF9F6` | Text on primary |
| `--secondary` | `oklch(0.94 0.008 80)` | `#F0EDE8` | Warm gray — secondary surfaces |
| `--secondary-foreground` | `oklch(0.35 0.02 60)` | `#5C5752` | Text on secondary |
| `--muted` | `oklch(0.95 0.006 80)` | `#F3F1ED` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.55 0.015 60)` | `#8A857F` | Muted text, placeholders |
| `--accent` | `oklch(0.94 0.008 80)` | `#F0EDE8` | Accent surfaces (hover states) |
| `--accent-foreground` | `oklch(0.22 0.02 60)` | `#2D2A26` | Text on accent |
| `--destructive` | `oklch(0.50 0.18 30)` | `#B33A2A` | Danger — warm red, not neon |
| `--destructive-foreground` | `oklch(0.98 0.005 80)` | `#FAF9F6` | Text on destructive |

### Border & Ring

| Token | OKLch | Hex | Usage |
|-------|-------|-----|-------|
| `--border` | `oklch(0.92 0.005 80)` | `#E8E5E0` | Nearly invisible borders |
| `--input` | `oklch(0.92 0.005 80)` | `#E8E5E0` | Input borders |
| `--ring` | `oklch(0.55 0.15 40)` | `#C2572A` | Focus rings — terracotta |

### Status Colors

| Token | OKLch | Hex | Usage |
|-------|-------|-----|-------|
| `--success` | `oklch(0.60 0.12 145)` | `#5A8A5C` | Muted sage green |
| `--success-bg` | `oklch(0.95 0.03 145)` | `#EDF5ED` | Success background |
| `--warning` | `oklch(0.65 0.14 75)` | `#B8862A` | Warm amber |
| `--warning-bg` | `oklch(0.95 0.03 75)` | `#F5F0E5` | Warning background |
| `--error` | `oklch(0.50 0.18 30)` | `#B33A2A` | Same as destructive |
| `--error-bg` | `oklch(0.95 0.03 30)` | `#F5EDEB` | Error background |
| `--info` | `oklch(0.55 0.10 250)` | `#4A7A9A` | Cool blue (sparingly) |
| `--info-bg` | `oklch(0.95 0.02 250)` | `#ECF1F5` | Info background |

### Chart Colors

| Token | OKLch | Hex | Usage |
|-------|-------|-----|-------|
| `--chart-1` | `oklch(0.55 0.15 40)` | `#C2572A` | Terracotta (primary series) |
| `--chart-2` | `oklch(0.60 0.12 145)` | `#5A8A5C` | Sage green |
| `--chart-3` | `oklch(0.65 0.14 75)` | `#B8862A` | Warm amber |
| `--chart-4` | `oklch(0.55 0.10 250)` | `#4A7A9A` | Cool blue |
| `--chart-5` | `oklch(0.50 0.12 340)` | `#8A5A7A` | Muted mauve |

### Sidebar Colors

| Token | OKLch | Hex | Usage |
|-------|-------|-----|-------|
| `--sidebar-background` | `oklch(0.96 0.006 80)` | `#F5F2ED` | Slightly warmer than content |
| `--sidebar-foreground` | `oklch(0.35 0.02 60)` | `#5C5752` | Sidebar text |
| `--sidebar-primary` | `oklch(0.55 0.15 40)` | `#C2572A` | Active item accent |
| `--sidebar-accent` | `oklch(0.94 0.008 80)` | `#F0EDE8` | Hover state |
| `--sidebar-border` | `oklch(0.93 0.004 80)` | `#EBE8E3` | Sidebar border |

---

## 2. Typography

### Font Stack
```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

### Scale

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `heading-xl` | 28px | 600 (semibold) | 1.3 | -0.02em | Page titles |
| `heading-lg` | 22px | 600 (semibold) | 1.35 | -0.015em | Section headers |
| `heading-md` | 18px | 600 (semibold) | 1.4 | -0.01em | Card headers |
| `heading-sm` | 15px | 500 (medium) | 1.4 | 0 | Sub-headers |
| `body-lg` | 15px | 400 (regular) | 1.6 | 0 | Primary body text |
| `body-md` | 14px | 400 (regular) | 1.6 | 0 | Default body text |
| `body-sm` | 13px | 400 (regular) | 1.5 | 0 | Secondary text |
| `caption` | 12px | 400 (regular) | 1.5 | 0.01em | Timestamps, metadata |
| `label` | 13px | 500 (medium) | 1.4 | 0.01em | Form labels, nav items |
| `mono` | 13px | 400 (regular) | 1.5 | 0 | Code, IDs, technical data |

---

## 3. Spacing

8px grid. All spacing is multiples of 4px, with 8px as the base unit.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | — |
| `--space-1` | 4px | Tight gaps (icon to text) |
| `--space-2` | 8px | Default gap, inline spacing |
| `--space-3` | 12px | Card internal padding-y |
| `--space-4` | 16px | Card internal padding-x, section gaps |
| `--space-5` | 20px | Section padding |
| `--space-6` | 24px | Content area padding |
| `--space-8` | 32px | Section separators |
| `--space-10` | 40px | Page top padding |
| `--space-12` | 48px | Major section spacing |
| `--space-16` | 64px | Page margin (wide screens) |

---

## 4. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements (badges, chips) |
| `--radius-md` | 8px | Default (inputs, buttons) |
| `--radius-lg` | 12px | Cards, panels |
| `--radius-xl` | 16px | Modals, large containers |
| `--radius-full` | 9999px | Pills, avatars |

---

## 5. Shadows

Minimal, warm-toned shadows. No harsh drop shadows.

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-xs` | `0 1px 2px oklch(0.22 0.02 60 / 0.04)` | Subtle lift (buttons) |
| `--shadow-sm` | `0 1px 3px oklch(0.22 0.02 60 / 0.06), 0 1px 2px oklch(0.22 0.02 60 / 0.04)` | Cards at rest |
| `--shadow-md` | `0 4px 6px oklch(0.22 0.02 60 / 0.06), 0 2px 4px oklch(0.22 0.02 60 / 0.04)` | Cards on hover, popovers |
| `--shadow-lg` | `0 10px 15px oklch(0.22 0.02 60 / 0.08), 0 4px 6px oklch(0.22 0.02 60 / 0.04)` | Modals, dropdowns |

---

## 6. Component Specifications

### 6.1 Buttons

**Primary:**
- Background: `--primary` (terracotta)
- Text: `--primary-foreground` (cream)
- Border: none
- Radius: `--radius-md` (8px)
- Padding: 8px 16px
- Font: `label` (13px, medium)
- Hover: `oklch(0.50 0.15 40)` (slightly darker)
- Active: `oklch(0.48 0.15 40)`
- Shadow: `--shadow-xs`

**Secondary:**
- Background: `--secondary` (warm gray)
- Text: `--secondary-foreground`
- Border: none
- Hover: `oklch(0.91 0.008 80)` (slightly darker)

**Ghost:**
- Background: transparent
- Text: `--foreground`
- Hover: `--accent` background

**Outline:**
- Background: transparent
- Border: 1px solid `--border`
- Text: `--foreground`
- Hover: `--accent` background

**Destructive:**
- Background: `--destructive`
- Text: `--destructive-foreground`

### 6.2 Cards

- Background: `--card`
- Border: 1px solid `--border` (nearly invisible)
- Radius: `--radius-lg` (12px)
- Shadow: `--shadow-sm` at rest
- Shadow on hover: `--shadow-md` (subtle lift)
- Padding: 16px 20px
- No harsh lines between card sections — use spacing or ultra-subtle dividers

### 6.3 Inputs

- Background: `--background`
- Border: 1px solid `--border` (barely visible)
- Radius: `--radius-md` (8px)
- Padding: 8px 12px
- Font: `body-md` (14px)
- Focus: Remove border, add `0 0 0 2px var(--ring)` (terracotta ring)
- Placeholder: `--muted-foreground`

### 6.4 Badges / Status Pills

- Radius: `--radius-full` (pill-shaped)
- Padding: 2px 10px
- Font: `caption` (12px)
- Font weight: 500
- Variants:
  - **Running/Active:** `--success-bg` background, `--success` text
  - **Paused:** `--warning-bg` background, `--warning` text
  - **Error/Failed:** `--error-bg` background, `--error` text
  - **Idle:** `--muted` background, `--muted-foreground` text
  - **Default:** `--secondary` background, `--secondary-foreground` text

### 6.5 Tables (Lists)

- **NO traditional table borders.** Use:
  - Alternating subtle row backgrounds (`--background` / `--muted`)
  - OR clean spacing with consistent padding
- Row height: 48px minimum
- Row hover: `--accent` background
- Header: `label` typography, `--muted-foreground` color, bottom divider only
- Cell padding: 12px 16px

### 6.6 Sidebar Navigation

- Background: `--sidebar-background`
- Width: 240px (desktop), collapsible on mobile
- Nav item height: 36px
- Nav item padding: 8px 12px
- Active item: `--sidebar-primary` left border (3px), `--sidebar-accent` background
- Hover: `--sidebar-accent` background
- Icon size: 18px
- Icon + label gap: 10px
- Section label: `caption` typography, `--muted-foreground`, uppercase

### 6.7 Modals / Dialogs

- Background: `--card`
- Radius: `--radius-xl` (16px)
- Shadow: `--shadow-lg`
- Overlay: `oklch(0.22 0.02 60 / 0.4)` (warm semi-transparent)
- Padding: 24px
- Max width: 560px (default), 800px (wide)
- Close button: top-right, ghost style

### 6.8 Metric Cards (Dashboard)

- Same as card base but with:
  - Left-aligned icon (24px, `--muted-foreground`)
  - Value: `heading-lg` typography
  - Label: `caption` typography, `--muted-foreground`
  - Optional trend indicator: up arrow + green or down arrow + red

### 6.9 Agent Cards (Grid)

- Card base with:
  - Top: agent icon (32px) + name (`heading-sm`) + role badge
  - Middle: status pill + last heartbeat time
  - Bottom: budget usage bar (thin, terracotta fill)
  - Hover: shadow lift + subtle border color change

---

## 7. Layout Constants

| Property | Value |
|----------|-------|
| Sidebar width | 240px |
| Content max-width | none (full width) |
| Content padding | 24px (desktop), 16px (mobile) |
| Grid gap | 16px |
| Card grid | 4 columns (desktop), 2 (tablet), 1 (mobile) |
| Properties panel width | 360px |
| Top bar height | 56px |

---

## 8. Motion & Animation

- **Duration:** 150ms (micro-interactions), 250ms (panel transitions), 350ms (page transitions)
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` (standard)
- **Enter:** `cubic-bezier(0, 0, 0.2, 1)` (decelerate)
- **Exit:** `cubic-bezier(0.4, 0, 1, 1)` (accelerate)
- **Hover lifts:** 150ms shadow transition
- **Panel slides:** 250ms transform + opacity
- **No bouncy/springy animations.** Everything is smooth, professional, understated.

---

## 9. Icon System

- **Library:** Lucide React (already in use)
- **Size:** 18px default, 16px in compact contexts, 24px in feature icons
- **Weight:** 1.5px stroke (Lucide default)
- **Color:** Inherits `currentColor`
- **Style:** Consistent with clean, geometric line icons. No filled icons.
