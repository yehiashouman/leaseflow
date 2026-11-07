# UI Stack

Decision date: 7 November 2026.
The owner selected shadcn/ui and explicitly approved Tailwind CSS.
This replaces the previous Bootstrap/SCSS baseline and Tailwind exclusion.
The backend and product workflows remain unchanged.

## Components

| Concern | Baseline |
|---|---|
| Application | React and TypeScript |
| Build | Vite with `@tailwindcss/vite` |
| Components | Editable shadcn/ui source in `web/src/components/ui` |
| Accessible primitives | Radix |
| Styles | Tailwind CSS 4 and semantic CSS variables |
| Icons | Lucide React |
| Variants | `class-variance-authority` |
| Class composition | `clsx` and `tailwind-merge` through `cn` |
| Routes | React Router |
| Server state | TanStack React Query |
| HTTP | Axios |
| Component tests | Vitest, jsdom, React Testing Library |
| Browser tests | Playwright, desktop Chromium and mobile Chromium |

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
