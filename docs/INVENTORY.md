# Inventory Lifecycle

Date: 8 November 2026, Asia/Dubai.
This record covers landlord lifecycle and property metadata, not the complete inventory module.

## Landlords

- Managers create and edit their own landlord contact records.
- Names and optional company names persist as separate fields.
- Email, phone, WhatsApp, preferred contact method, address, and multiline notes remain optional.
- Preferred contact records metadata; it does not send notifications or verify ownership.
- Detail pages show contact fields and linked manager-owned units.
- One landlord record can serve multiple units in the same manager portfolio.
- Name, company, and email search use a debounced interface and scoped API filters.
- Active, Archived, and All filters preserve existing array response contracts.
- New unit forms select active landlords only.
- Archived records remain available through detail and archive filters.
- Archive and restore require explicit interface confirmation.
- Linked units prevent archive, regardless of active or draft state.
- Archive never deletes contact records, units, or audit history.
- Restore re-enables contact edits and new unit links.
- Repeated archive/restore commands do not duplicate status-change audit events.
- Archived contact edits and new unit links fail until restore.

Archive checks all unit references to preserve database integrity.
Detail pages and list counts expose only manager-owned linked units.
Unit lists and detail also hide landlord contacts from a different manager under legacy cross-links.
A foreign legacy reference therefore stays hidden and still blocks archive until authorized repair.
The application does not silently unlink or delete inconsistent legacy records.

## Unit Metadata

Unit forms capture name, building, street, area, emirate, address notes, GPS coordinates, and default deposit.
Address notes support multiple lines and a 1,000-character limit.
The interface preserves zero-valued coordinates.
Unit detail pages show these fields and link back to the landlord record.
New units remain drafts; this change does not bypass document or activation gates.
Capture of default deposits does not certify financial calculations or approved round rules.

## Atomicity and Authorization

Landlord edit, archive, restore, and unit assignment share the landlord database row lock.
The lock returns current archive state, rather than an older transaction snapshot.
Concurrent archive and unit creation/reassignment cannot produce a new link to an archived landlord.
All writes preserve manager ownership and transactional old/new audit values.
Direct API requests cannot inject manager ownership or archive timestamps.
Administrator and tenant roles cannot access manager inventory routes.

## API

| Method | Route                                   | Behavior                                        |
| ------ | --------------------------------------- | ----------------------------------------------- |
| GET    | /api/v1/inventory/landlords             | Manager-owned records; ACTIVE status by default |
| GET    | /api/v1/inventory/landlords/:id         | Scoped contact detail and linked owned units    |
| POST   | /api/v1/inventory/landlords             | Create an active contact record                 |
| PATCH  | /api/v1/inventory/landlords/:id         | Edit an active contact record                   |
| POST   | /api/v1/inventory/landlords/:id/archive | Archive only after all units unlink             |
| POST   | /api/v1/inventory/landlords/:id/restore | Restore without deletion or replacement         |

List queries support `status=ACTIVE`, `status=ARCHIVED`, or `status=ALL` and optional `q` up to 150 characters.
Search covers name, company name, and email.
List pagination remains incomplete under the shared-interface checklist.
Email uses the existing 191-character storage limit.
Unknown or foreign records return 404; archive conflicts return 409; invalid fields return 422.
Archive and restore accept no writable status or ownership fields.

## Migration

Apply migrations before deployment of the new API:

```bash
npm run prisma:migrate -w api
```

The migration adds landlord archive state, contact preference, and unit address notes.
It aligns company, address, and street storage with existing API limits and expands audit user-agent storage.
Existing records remain active; existing unit links stay unchanged.

## Verification

- Six new API unit cases verify filters, ownership, archive guards, audit values, and invalid input.
- Eight new web cases verify forms, detail, confirmation, conflicts, search, pending-save controls, and synthetic archive behavior.
- Eleven MySQL cases verify persistence, reuse, metadata, storage boundaries, isolation, idempotency, audit, and concurrent unit links.
- Real desktop/mobile journeys create, link, unlink, archive, restore, and edit records through the interface.
- Preview desktop/mobile cases verify equivalent synthetic controls without backend requests.

Verification passes in [CI](https://github.com/yehiashouman/leaseflow/actions/runs/42436239708) at commit `a208bdebdbbf251fe85aa33e4b40334c13b30515`.
Unit archive/restore, amenities, and owner schedules now have implementation and evidence in [OPERATIONS-BATCH.md](OPERATIONS-BATCH.md).
Documents, images, activation evidence, full finance, and complete inventory acceptance remain incomplete.
