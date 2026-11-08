# GitHub Pages Preview

## Purpose

The public preview demonstrates implemented interfaces with synthetic browser-local data.
It does not host the API, database, document storage, Twilio, or email services.
It does not prove the entire application is complete.
Do not enter personal data or real documents.

Live URL; deployment verified on 7 November 2026:

https://yehiashouman.github.io/leaseflow/

## Features

- Select the manager, administrator, or tenant preview account.
- Inspect role-specific dashboards and navigation.
- Create and edit synthetic landlords.
- Inspect landlord details and linked units; search and filter active or archived records.
- Archive unlinked landlords, restore them, and preserve contact preferences and notes.
- Create and edit draft units.
- Capture twelve standard amenities, additional amenity labels, and owner payment schedules.
- Archive units without open contracts; restore them as drafts without automatic activation.
- Filter current, archived, or all unit records.
- Inspect administrator account queues, masked identity details, and safe audit summaries.
- Capture address notes, GPS, and default deposits in unit forms.
- Inspect unit details; add and edit Room or Master Room spaces.
- Set vacant rooms to maintenance or inactive; restore them without deletion.
- Verify occupied-room restrictions and preserved contract rent after base-price edits.
- Inspect synthetic contract terms, payment pages, deposit empty states, and linked case records.
- Submit synthetic operational cases and inspect private role-specific histories.
- Save private tenant drafts and explicitly submit them before manager access.
- Edit a synthetic tenant profile, optional preferences, and an unverified phone candidate.
- Inspect the manager's synthetic tenant directory and contract references.
- Filter case notices and preserve read state per preview role.
- Exchange case messages, report resolution, accept completion, and reopen cases.
- Preserve case history and decisions after reload without backend requests.
- Record synthetic maintenance responsibility, propose costs, dispute proposals, revise amounts, and explicitly accept responsibility without ledger entries.
- Inspect the disabled PDF export control; actual exports require the live API and report worker.
- Open Security, inspect synthetic sessions, and revoke the synthetic second device.
- Verify persisted synthetic session revocation after reload.
- Reset synthetic data through the preview banner.

Unsupported workflows return errors instead of simulated success.
Browser-local changes do not reach a server.
The preview does not support real password changes or real session revocation.
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
