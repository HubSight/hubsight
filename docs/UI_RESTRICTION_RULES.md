# UI Design Restrictions

## Purpose

When generating or modifying any UI (landing pages, web apps, components, demos), you MUST NOT include any of the 20 patterns below. These rules override default styling habits and template conventions.

## Banned Patterns

### Color & Gradients

1. Purple-to-blue gradients
2. Gradients applied to hero text
3. Grain/noise overlay on top of gradients
4. Low-contrast dark mode (text/background pairs must meet WCAG AA contrast)

### Typography

5. Inter font used everywhere as the only typeface
6. Emoji in headings
7. Serif italic accents
8. Space Grotesk + Instrument Serif pairing
9. Em dashes everywhere in copy

### Components & Layout

10. Colored-border cards
11. Glassmorphism cards (frosted/blur backgrounds)
12. Three icon boxes arranged in a single row
13. Badge placed above the headline
14. Lucide icons used everywhere as the default icon set
15. Unmodified, stock shadcn UI components (always customize tokens/styling)
16. Inconsistent spacing (use a single spacing scale throughout)

### Motion & Interaction

17. Fade-in on scroll animations
18. Cursor-following beam/spotlight effects
19. Buttons that fade on hover

### Copywriting

20. Generic buzzword copy (e.g., "seamless", "elevate", "unlock", "next-gen", "empower")

## Enforcement

- Before finishing any UI task, self-review the output against all 20 items above.
- If a user request directly conflicts with these rules, implement the closest compliant alternative and note the substitution.
- When in doubt, prefer: solid colors, high contrast, consistent spacing scales, plain semantic copy, and restrained motion.
