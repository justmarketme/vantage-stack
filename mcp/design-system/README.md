# design-system (MCP)

Design-system guardrails for VantageStack UI work.

## Web viewer (local)

With `npm run dev` (port **3005**), open **http://localhost:3005/design-system** to preview tokens, primitives, and `components/ui` files. In production, set `NEXT_PUBLIC_DESIGN_SYSTEM_VIEWER=1` to enable the same route.

## Tools

- `validate-brand-consistency`
- `apply-color-palette`
- `ensure-typography-standards`
- `access-component-library`
- `check-responsive-design`
- `validate-accessibility-standards`
- `ensure-dark-mode-compatibility`

## Run locally

```bash
npm run mcp:design-system
```

# Design System MCP

This MCP server enforces the **VantageStack (“van-tij-stack”) design system** across all UI work in this repo.

It provides validators and small transformers that agents should run against every new/modified UI component before shipping.

## Tools

- `validate-brand-consistency`
  - Checks palette token usage, typography tokens, and encourages reuse of `.vs-*` primitives.
- `apply-color-palette`
  - Best-effort mapping from common raw Tailwind colors to VantageStack token colors.
- `ensure-typography-standards`
  - Ensures `font-heading` / `font-body` usage and basic type scale hygiene.
- `access-component-library`
  - Lists/searches `components/` and can return component source for reuse.
- `check-responsive-design`
  - Heuristic breakpoint and layout checks.
- `validate-accessibility-standards`
  - Heuristic checks for `alt`, aria labels, and focus styles.
- `ensure-dark-mode-compatibility`
  - Ensures components use token-based theming or `dark:` variants (repo is dark-first).

## Running

```bash
npx tsx mcp/design-system/server-impl.ts
```

## Design tokens (source of truth)

- `tailwind.config.ts` (colors + font families)
- `app/globals.css` (`.vs-*` primitives)

# design-system (MCP)

Premium design-system guardrails for `van-tij-stack`.

This MCP is intended to be run *before* shipping any UI component changes. It provides lightweight, production-focused validation checks and token-based guidance.

## Tools

- `validate-brand-consistency`
- `apply-color-palette`
- `ensure-typography-standards`
- `access-component-library`
- `check-responsive-design`
- `validate-accessibility-standards`
- `ensure-dark-mode-compatibility`

## Tokens

Design tokens live in `mcp/design-system/tokens.json` and currently mirror the Tailwind token palette/font families in `tailwind.config.ts`.

## Run locally

```bash
npm run mcp:design-system
```

## Component library

Preferred reusable components folder:

- `components/ui/`

The tool `access-component-library` will ensure this folder exists and will list available `.ts/.tsx` components inside it.

