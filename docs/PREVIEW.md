# GitHub Pages Preview

## Purpose

The public preview demonstrates implemented interfaces with synthetic browser-local data.
It does not host the API, database, document storage, Twilio, or email services.
It does not prove the entire application is complete.
Do not enter personal data or real documents.

Expected URL after GitHub enables Pages:

https://yehiashouman.github.io/leaseflow/

## Features

- Select the manager, administrator, or tenant preview account.
- Inspect role-specific dashboards and navigation.
- Create and edit synthetic landlords.
- Create and edit draft units.
- Inspect unit details and add Room or Master Room spaces.
- Inspect synthetic contracts and requests.
- Reset synthetic data through the preview banner.

Unsupported workflows return errors instead of simulated success.
Browser-local changes do not reach a server.
Reset affects only preview data, not real application sessions.

## Deployment

The repository owner must enable Pages once:

1. Open repository Settings, then Pages.
2. Under Build and deployment, select GitHub Actions.
3. Open Actions, then GitHub Pages Preview.
4. Run the workflow against main.
5. Verify the deployment reports success before use of the public URL.

The workflow builds only the web preview and deploys `web/dist-preview`.
It runs component and desktop/mobile browser tests before deployment.
It uses the `github-pages` environment and scoped Pages/OIDC permissions.
Subsequent web changes on main trigger another deployment.

## Local Build

```bash
npm ci
```

```bash
npm run build:preview -w web
```

The explicit `github-preview` mode loads `web/.env.github-preview`.
Hash routes avoid GitHub Pages refresh errors.
Vite uses `/leaseflow/` as the preview asset base.
Normal builds retain `/`, real API access, and BrowserRouter.
Production builds exclude preview fixtures and the preview adapter.
Never enable preview mode for real tenant or manager sessions.

## Verification Limits

Automated adapter tests verify synthetic CRUD, reset behavior, restrictions, and unsupported-operation errors.
Component tests verify forms, role navigation, and API-call contracts.
Playwright suites cover normal API-fixture screens and the isolated preview on desktop and mobile.
API tests verify real route validation and ownership with database mocks.
Real MySQL, complete browser, provider, and production deployment acceptance remain separate release gates.
