# UI Stack

Decision date: 7 November 2026.
The owner selected shadcn/ui and explicitly approved Tailwind CSS.
This replaces the previous Bootstrap/SCSS baseline and Tailwind exclusion.
The backend and product workflows remain unchanged.

## Components

| Concern               | Baseline                                             |
| --------------------- | ---------------------------------------------------- |
| Application           | React and TypeScript                                 |
| Build                 | Vite with `@tailwindcss/vite`                        |
| Components            | Editable shadcn/ui source in `web/src/components/ui` |
| Accessible primitives | Radix                                                |
| Styles                | Tailwind CSS 4 and semantic CSS variables            |
| Icons                 | Lucide React                                         |
| Variants              | `class-variance-authority`                           |
| Class composition     | `clsx` and `tailwind-merge` through `cn`             |
| Routes                | React Router                                         |
| Server state          | TanStack React Query                                 |
| HTTP                  | Axios                                                |
| Component tests       | Vitest, jsdom, React Testing Library                 |
| Browser tests         | Playwright, desktop Chromium and mobile Chromium     |

The root workspace provides jsdom 26 for the shared Vitest installation and Node.js 22.19 compatibility.

## Source Layout

- Keep generated primitives in `web/src/components/ui`.
- Keep domain components outside the primitive directory.
- Use `@/` aliases for files under `web/src`.
- Keep the `cn` utility in `web/src/lib/utils.ts`.
- Keep theme tokens and Tailwind imports in `web/src/styles.css`.
- Keep CLI aliases and component style in `web/components.json`.
- Preserve component licenses and local modifications when the CLI proposes an overwrite.
- Do not add Bootstrap, Bootstrap Icons, Sass, or duplicate global resets.

## Add Components

From the repository root, run:

```bash
npx shadcn@latest add button -c web
```

Review the component source and dependency changes before commit.
Commit component source, configuration, package manifests, and the root lockfile together.
shadcn/ui components are local source, not a runtime `shadcn/ui` package.
The initial primitives come from the official `shadcn-ui/ui` repository, under `apps/v4/registry/new-york-v4/ui`.
The local MIT notice is `web/src/components/ui/LICENSE`.
Local changes set an 8px card radius, remove negative letter spacing, and add the sheet-close tooltip.

## Interface Rules

- Prefer shared components over repeated control markup.
- Use semantic tokens instead of hardcoded page colors.
- Use Lucide icons instead of icon fonts.
- Give icon-only controls accessible names and tooltips.
- Associate every input with a label.
- Preserve validation errors and unsaved form data.
- Use accessible dialogs with focus return and keyboard dismissal.
- Keep mobile navigation accessible without hover.
- Keep wide tables inside scroll containers.
- Provide explicit load, empty, error, disabled, and success states.
- Do not show failed data requests as empty business records.
- Keep unavailable business commands disabled until their workflows exist.
- Do not claim a theme migration implements absent business modules.

## Verification

```bash
npm run build -w web
```

```bash
npm run lint -w web
```

```bash
npm run test -w web
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e -w web
```

Playwright starts a test-only Vite server on port 5174.
Browser fixtures verify UI and API-call contracts, not real database authorization or provider delivery.
If a managed Chromium executable is required, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its path.

Verify login, desktop navigation, mobile menu, tables, and keyboard focus in the browser.
Verify the login request and existing list endpoints retain their API contracts.
Use deterministic fixtures for UI tests; do not treat fixture data as production verification.

## Dubai interface revision — 10 November 2026

The owner selected Dubai-only operation for this interface revision.
The interface retains React, shadcn/ui, Radix, and Tailwind.
The shell now uses grouped dark navigation, a permanent account footer, and a scrollable navigation body.
The mobile drawer uses the dynamic viewport height and safe-area padding.
The desktop footer accounts for the public preview banner.
Dashboard cards, request panels, property summaries, tables, and forms share a teal/slate theme.
Form editors use two columns on wider screens and one column on phones.
The save footer remains accessible during long forms.

Searchable choices now cover Dubai areas, buildings, country-based nationality, language, and Dubai timezone.
The country catalogue contains 249 ISO 3166-1 codes; language labels use browser Intl display names.
The language catalogue contains ISO 639-1 codes, including Arabic and English.
Dubai area/community choices combine a dated public DLD-derived snapshot and common neighbourhood labels.
Sources: https://datadubai.ae/areas.json, https://datadubai.ae/communities.json, and https://www.visitdubai.com/en/explore-dubai/dubai-neighbourhoods.
Building choices combine developer-sourced starter entries and the manager's saved property records.
This catalogue does not represent every Dubai building.
An explicit unlisted-building action preserves access for absent entries.
Saved historical values remain available; the interface does not silently rewrite existing records.
Search supports keyboard selection, screen-reader labels, native required validation, and server field errors.

Recoverable refresh errors preserve form drafts and captured versions.
Access denial or missing private records clears cached data before another refresh.
Safe API messages include validated request references.
