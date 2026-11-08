# Repeatable Local Startup

Use Node 22, Docker Engine, and Docker Compose v2 with --wait support.

Initialize missing environment files without overwrite:

```bash
make init
```

Start without demo accounts:

```bash
make up
```

Start the explicit non-production demo:

```bash
make demo
```

Each startup validates Compose, starts private data services, applies migrations, runs the guarded seed, waits for API readiness, and verifies the web/API proxy.
Failed migrations or health probes stop startup without a success message.
Existing credentials, account roles, passwords, and data volumes remain intact.
The demo administrator retains any password changed after its first creation.
The API requires every checked-in migration before readiness succeeds.

## Destructive Reset

This command deletes only the selected local Compose project's data volumes.
The helper refuses production configuration and requires a leaseflow development project name.
Without the exact confirmation argument, the helper executes no Docker reset.

```bash
make demo-reset CONFIRM=--confirm=DELETE_LEASEFLOW_DEMO_DATA
```

## Codespaces

The devcontainer explicitly starts demo mode through the same helper.
Only port 8080 forwards automatically; its backend protocol is HTTP.
The helper prints the HTTPS forwarded URL for the actual configured web port.
The API, MySQL, Redis, and MinIO administration ports remain private.
An exact public Codespaces login/upload/PDF journey remains a separate unverified requirement.

## Scope

Local MinIO builds from official source commit 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a because its community container is no longer public.
The first build requires Go dependency downloads and additional time.
The archived upstream and its dependencies require a separate security and license review before any production use.
This development image does not approve a production storage provider or satisfy production storage acceptance.
The demo is not a production administrator bootstrap.
Full application workflows, MFA, identity verification, providers, uploads, finance, and release acceptance remain incomplete.
Configuration inventory: [CONFIGURATION.md](CONFIGURATION.md).
Fresh-stack startup, proxy login, password-preserving restart, and persistent volumes pass in [CI](https://github.com/yehiashouman/leaseflow/actions/runs/42489354506).
Task evidence: [PLATFORM-BATCH.md](PLATFORM-BATCH.md).
