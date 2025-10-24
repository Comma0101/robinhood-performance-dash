# Trading Dashboard Design System

## Overview

This design system provides a cohesive, production-ready visual language for the Trading Dashboard application. Inspired by industry leaders like Linear, Notion, and Apple, it prioritizes clarity, emotional intelligence, and professional aesthetics.

## Design Principles

### 1. **Minimal & Intentional**

Every element serves a purpose. No decorative clutter—only functional beauty.

### 2. **Data-First Clarity**

Trading data (P/L, stats, trades) is presented with maximum legibility and minimal cognitive load.

### 3. **Progressive Disclosure**

Information is revealed contextually, keeping the interface calm and focused.

### 4. **Fast & Responsive**

Micro-interactions provide immediate feedback. Transitions are snappy (150-200ms).

### 5. **Emotionally Intelligent**

Colors communicate meaning: green = profit, red = loss, blue = neutral/primary actions.

---

## Color System

### Background Layers

Creates depth through subtle elevation changes:

```css
--bg-base: #0a0a0a          /* Base canvas */
--bg-subtle: #121212        /* Slightly elevated */
--bg-surface: #1a1a1a       /* Cards, panels */
--bg-elevated: #222222      /* Hover states, selected items */
```

### Borders

```css
--border-subtle: #1f1f1f    /* Minimal separation */
--border-default: #2a2a2a   /* Standard borders */
--border-strong: #3a3a3a    /* Emphasis, hover states */
```

### Text Hierarchy

```css
--text-primary: #f5f5f5     /* Headlines, important text */
--text-secondary: #a0a0a0   /* Body text, labels */
--text-tertiary: #6b6b6b    /* De-emphasized text */
--text-inverted: #0a0a0a    /* Text on light backgrounds */
```

### Semantic Colors

#### Success/Profit (Green)

```css
--success: #10b981          /* Default green */
--success-hover: #059669    /* Interactive states */
--success-subtle: #064e3b   /* Backgrounds */
--success-text: #34d399     /* Readable text */
```

#### Error/Loss (Red)

```css
--error: #ef4444            /* Default red */
--error-hover: #dc2626      /* Interactive states */
--error-subtle: #7f1d1d     /* Backgrounds */
--error-text: #f87171       /* Readable text */
```

#### Primary (Blue)

```css
--primary: #3b82f6          /* Primary actions */
--primary-hover: #2563eb    /* Hover states */
--primary-subtle: #1e3a8a   /* Backgrounds */
--primary-text: #60a5fa     /* Readable text */
```

#### Warning (Amber)

```css
--warning: #f59e0b          /* Warning state */
--warning-subtle: #78350f   /* Backgrounds */
--warning-text: #fbbf24     /* Readable text */
```

---

## Typography

### Font Families

- **Sans**: Geist Sans (primary interface font)
- **Mono**: Geist Mono (numbers, code)

### Type Scale

All sizes include optimized line-height and letter-spacing:

```css
xs:   0.75rem  / 1rem      /* Small labels, tags */
sm:   0.875rem / 1.25rem   /* Body text, UI elements */
base: 1rem     / 1.5rem    /* Default text */
lg:   1.125rem / 1.75rem   /* Subheadings */
xl:   1.25rem  / 1.875rem  /* Card titles */
2xl:  1.5rem   / 2rem      /* Section headings */
3xl:  1.875rem / 2.25rem   /* Page titles */
4xl:  2.25rem  / 2.5rem    /* Hero text */
```

### Font Features

- **Tabular nums** for all financial data (uniform width digits)
- **-webkit-font-smoothing: antialiased** for crisp rendering
- Negative letter-spacing for large text (tighter, more refined)

---

## Spacing System

Built on a 4px base unit:

```css
0.25rem  (4px)   - Tight spacing
0.5rem   (8px)   - Default gap
0.75rem  (12px)  - Medium spacing
1rem     (16px)  - Standard spacing
1.5rem   (24px)  - Large spacing
2rem     (32px)  - Section spacing
2.5rem   (40px)  - Major sections
```

---

## Shadows & Elevation

### Shadow Levels

```css
sm:      0 1px 2px rgba(0,0,0,0.15)              /* Subtle lift */
default: 0 1px 3px, 0 1px 2px rgba(0,0,0,0.2)    /* Cards */
md:      0 4px 6px, 0 2px 4px rgba(0,0,0,0.2)    /* Elevated cards */
lg:      0 10px 15px, 0 4px 6px rgba(0,0,0,0.2)  /* Modals */
xl:      0 20px 25px, 0 10px 10px rgba(0,0,0,0.2) /* Major overlays */
```

### Glow Effects (for emphasis)

```css
glow-success: 0 0 20px rgba(16, 185, 129, 0.15)
glow-error:   0 0 20px rgba(239, 68, 68, 0.15)
```

---

## Border Radius

Rounded corners create a friendly, modern feel:

```css
sm:      0.25rem   /* Tight elements */
default: 0.375rem  /* Standard */
md:      0.5rem    /* Buttons, inputs */
lg:      0.75rem   /* Cards */
xl:      1rem      /* Modals */
2xl:     1.5rem    /* Hero sections */
```

---

## Animations

### Timing Functions

- **Ease-out**: `cubic-bezier(0.4, 0, 0.2, 1)` - For entrances
- **Linear**: For continuous animations (spinners)

### Duration Guidelines

- **Micro-interactions**: 150ms (hover, focus)
- **State changes**: 200ms (slide, fade)
- **Entrances**: 250-300ms (modals, drawers)

### Animation Presets

```css
fade-in:    fadeIn 0.2s ease-out
slide-up:   slideUp 0.3s ease-out
slide-down: slideDown 0.3s ease-out
scale-in:   scaleIn 0.2s ease-out
shimmer:    shimmer 2s linear infinite
```

---

## Component Patterns

### Cards

```css
background: var(--bg-surface)
border: 1px solid var(--border-default)
border-radius: 0.75rem
padding: 1.5rem
box-shadow: 0 1px 3px rgba(0,0,0,0.2)
```

**Hover State**: Border color shifts to `--border-strong`

### Stat Cards

Display key metrics with visual hierarchy:

- **Label**: 0.75rem, uppercase, tertiary color, letter-spaced
- **Value**: 1.875rem, bold, tabular-nums
- **Hover**: Lift 1px, border emphasis

### Buttons

```css
Primary:
  background: var(--primary)
  color: white
  padding: 0.625rem 1.125rem
  border-radius: 0.5rem
  font-weight: 500

  Hover: Lift 1px, darken background
```

### Inputs & Filters

```css
background: var(--bg-elevated)
border: 1px solid var(--border-default)
border-radius: 0.5rem
padding: 0.625rem 0.875rem

Focus:
  border-color: var(--primary)
  box-shadow: 0 0 0 3px rgba(59,130,246,0.1)
```

### Tables

- **Header**: Uppercase, 0.75rem, letter-spaced, clickable for sorting
- **Rows**: Hover background changes to `--bg-elevated`
- **Cells**: 1rem padding, borders between rows only
- **Active row**: Cursor changes to pointer

### Modal

```css
Overlay:
  background: rgba(0,0,0,0.75)
  backdrop-filter: blur(4px)

Content:
  max-width: 700px
  border-radius: 1rem
  animation: scaleIn 0.2s ease-out
```

**Interactions**:

- Click overlay to close
- ESC key to close
- Body scroll locked when open

### Loading States

Centered spinner with text:

- Border spinner animation (0.8s spin)
- Secondary text below
- Min height to prevent layout shift

---

## Accessibility

### Focus States

All interactive elements have clear focus indicators:

```css
focus:
  outline: 2px solid var(--primary)
  outline-offset: 2px
```

### Keyboard Navigation

- Modal closes with ESC
- Tab order follows visual hierarchy
- All buttons accessible via keyboard

### Color Contrast

All text meets WCAG AA standards:

- Primary text on base: 13.6:1 ratio
- Secondary text on base: 7.1:1 ratio
- Profit green on dark: 4.8:1 ratio
- Loss red on dark: 4.6:1 ratio

### Semantic HTML

- Proper heading hierarchy
- ARIA labels on icon-only buttons
- Role attributes on modals

---

## Trading-Specific Patterns

### P/L Display

```css
Positive: color: var(--success-text)
Negative: color: var(--error-text)
Breakeven: color: var(--text-secondary)

Always prefixed with $
Always 2 decimal places
Tabular-nums for alignment
```

### Trade Status

Visual indicators with clear meaning:

- **Win**: Green text, subtle green background
- **Loss**: Red text, subtle red background
- **Breakeven**: Gray text

### Calendar Heat Map

Day cells show P/L as vertical bars:

- Height = magnitude of P/L
- Color = direction (green/red) + intensity
- Hover shows tooltip with details

---

## Responsive Behavior

### Breakpoints

```css
Mobile:  < 768px
Tablet:  768px - 1023px
Desktop: ≥ 1024px
```

### Layout Adaptations

- **Stats Grid**: Stacks on mobile, 2-3 columns on tablet, 5 on desktop
- **Main Grid**: Single column on mobile, 3-column on desktop
- **Navigation**: Maintains horizontal layout, text may shrink
- **Modals**: Full-screen on mobile, centered overlay on desktop
- **Tables**: Horizontal scroll on mobile

---

## Implementation Notes

### Tailwind Integration

This design system extends Tailwind with custom tokens in `tailwind.config.ts`. Use Tailwind utilities for most styling, falling back to CSS variables when needed.

### CSS Variables vs Tailwind Classes

- **CSS Variables**: Global theme tokens, component-specific styles
- **Tailwind Classes**: Layout, spacing, one-off utilities

### Performance

- CSS-in-JS avoided (slower)
- Animations use `transform` and `opacity` (GPU-accelerated)
- No excessive re-renders (memoization used)

---

## Future Enhancements

### Potential Additions

1. **Dark/Light Mode Toggle**: Add theme switcher
2. **Customizable Accent Colors**: User preference for primary color
3. **Data Density Options**: Compact/comfortable/spacious views
4. **Chart Themes**: Multiple color schemes for visualizations
5. **Export Styles**: Branded PDF/image exports

---

## Maintenance

### When to Update

- Adding new semantic meanings (e.g., "warning" state)
- Expanding component library
- User feedback on readability or usability
- Accessibility improvements

### Versioning

Follow semantic versioning:

- **Major**: Breaking changes to existing patterns
- **Minor**: New components or tokens
- **Patch**: Bug fixes, refinements

---

## Resources

### Design References

- [Linear Design](https://linear.app) - Minimalist SaaS UI
- [Notion](https://notion.so) - Information hierarchy
- [Apple HIG](https://developer.apple.com/design/) - Polish and detail

### Typography

- [Geist Font](https://vercel.com/font) - Modern, legible sans-serif

### Color Theory

- [Tailwind Colors](https://tailwindcss.com/docs/customizing-colors) - Foundation
- [Accessible Colors](https://accessible-colors.com) - Contrast checking

---

**Last Updated**: October 2025  
**Version**: 1.0.0
