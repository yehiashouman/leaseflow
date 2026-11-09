# Private Case Notice Delivery

Date: 9 November 2026, Asia/Dubai.

## Behavior

Case events create durable in-app notices and external delivery intent within the same MySQL transaction.
Each recipient's non-security preferences choose email, WhatsApp, or both.
Unverified contacts receive a suppressed intent.
Configured providers can dispatch queued notices; disabled providers leave eligible intent paused.
Messages contain a generic update and an authenticated application link.
They omit complaint text, identity numbers, documents, and case message bodies.
Arabic email templates and configured Arabic WhatsApp templates use the recipient language.
Other templates fall back to English.
Security account email remains independent from non-security preferences.

## Provider Results

SMTP acceptance proves server acceptance; inbox delivery remains unverified.
WhatsApp acceptance differs from a signed provider delivery or read callback.
Provider callbacks never accept a case resolution or mark an in-app notice read.
The callback signature binds the public callback URL, job identifier, and form fields.
The configured Twilio account and message identifier must match.
Duplicate callback fingerprints receive an acknowledgement without duplicate effects.
Lower-ranked callbacks cannot replace a delivery or read result.

## Recovery

Workers claim MySQL leases with SKIP LOCKED.
Known transient rejections permit three bounded attempts.
An ambiguous network result or expired worker lease becomes UNKNOWN.
The worker does not automatically resend an uncertain notice.
An owner can request two additional resend revisions.
An uncertain resend requires explicit acknowledgement of possible duplication.
Each resend verifies current contact ownership, verification, preferences, and record access.
Each revision preserves its own immutable attempt history.
A prior accepted revision suppresses a later automatic duplicate dispatch.
The worker logs safe failure codes and omits provider diagnostics and plaintext destinations.

## Configuration

| Variable                               | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| CASE_EMAIL_ENABLED                     | Enable case email after account SMTP configuration |
| CASE_WHATSAPP_ENABLED                  | Enable case WhatsApp dispatch                      |
| WHATSAPP_FROM                          | Explicit WhatsApp sender                           |
| WHATSAPP_CONTENT_SID_EN                | Provider-approved English content SID              |
| WHATSAPP_CONTENT_SID_AR                | Optional provider-approved Arabic content SID      |
| TWILIO_STATUS_CALLBACK_URL             | Canonical HTTPS callback address                   |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN | Existing provider credentials                      |

The callback path is `/api/v1/providers/twilio/status`.
The sender adds the job query parameter; ingress must preserve it.
Keep credentials outside version control.
Production activation remains blocked until sender, template, retention, and deployment policies receive approval and implementation.
Real SMTP inbox delivery and real WhatsApp delivery remain unverified.
Automated acceptance uses deterministic sender adapters and independently signed callback fixtures.

## API and Interface

| Method | Path                                | Authorization                                      |
| ------ | ----------------------------------- | -------------------------------------------------- |
| GET    | /notifications/deliveries           | Own authorized case notices                        |
| POST   | /notifications/deliveries/:id/retry | Own latest failed, uncertain, or suppressed notice |
| POST   | /providers/twilio/status?job=:id    | Provider signature and account validation          |

Delivery status shows masked destinations, language, attempts, observed status, and permitted recovery.
Administrators receive aggregate job state through the protected operations screen.
They do not receive private message payloads or sender impersonation access.

## Scope

This module covers operational case events.
Future financial events need their own immutable source records and notice integration.
It does not resolve the pending provider, reminder, retention, or production decisions.
