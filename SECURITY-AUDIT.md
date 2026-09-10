# Mystic Essence security and persistence audit

Date: 2026-08-30. Baseline: ea15f0d. Target: current local source and safe, unauthenticated checks of mysticessence.pt / Firebase project mystic-essence.

## Launch assessment

**Not a complete security sign-off.** This audit found and locally fixed concrete problems, but the unresolved items below prevent a claim that everything is safe or that every production write has been verified. No website can be certified impossible to hack from these tests.

**No production deployment, customer-data changes, real checkout, payment, email delivery, or production test-account creation was performed during this audit.** Local fixes to Firebase rules/functions and Netlify headers are NOT live. Existing production data was not altered.

## Remaining launch gates

1. **Deploy as a coordinated release.** All fixes remain local. Deploy the Firebase functions and Firestore/Storage rules together with the frontend; new UI actions need the new callable functions. Old checkout clients without an attempt ID are deliberately rejected and must refresh. Do not interpret a localhost test against emulators as a production sign-off.
2. **Configure App Check before enforcing it.** Client support for reCAPTCHA Enterprise and the callable `ENFORCE_APP_CHECK` parameter are implemented. The parameter defaults to false to avoid locking out legitimate clients without a registered site key. Register the web app and allowed domains, set `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, verify token metrics, then enforce callable and supported Firebase service protection. No production key or enforcement setting was changed. Rate limits are not protection against all distributed attacks.
3. **Finish account and infrastructure settings.** Verify admin MFA enrollment and a compatible sign-in challenge flow, Firebase password policy and email-enumeration protection, OAuth authorized domains, least-privilege IAM, backups/restore and billing alerts. These console/account settings are not established by a source-code change. Recovery, verification and session revocation now exist in the app; live Google sign-in and real recovery-email delivery remain untested.
4. **Verify payments and operate the review queue.** MB WAY status reconciliation is implemented using the provider status endpoint: 000 confirms payment; 020/101/122 release reserved stock once; unknown responses keep the reservation. Automatic terminal-state reconciliation for card, Multibanco and Payshop is NOT implemented. Admins must verify final cancellation in IFTHENPAY and record evidence before releasing those reservations. Legacy pending orders without `nextReconcileAt` also require review. The new scheduler must be deployed with its secret and functioning Cloud Scheduler permissions. Late confirmations after stock release are flagged, never automatically fulfilled. Real settlement/refunds still require a controlled provider test.
5. **Verify deployment integration.** Storage rules now read Firestore revocation metadata; grant the narrowly scoped cross-service permission required by Firebase when deploying those rules. Verify scheduled-function IAM and `revokeRefreshTokens` access. Check production CSP with Google OAuth and App Check, plus actual email-extension delivery and retry behavior. No real payment or email was initiated in this fix pass.
6. **Know the explicit limits.** Bulk pricing/seed operations refuse catalogues above 450 documents before writing, rather than applying partial financial changes. Existing unverified restock subscriptions no longer send: customers must sign in, verify their email and subscribe again. Checkout attempt reuse currently survives retries in the same loaded page, not a full reload/new tab; per-identity/IP limits still apply to new attempts. No infinite-load test or independent penetration test was performed.

## Confirmed findings fixed locally

| Finding | Evidence | Local change |
| --- | --- | --- |
| Logout disabled after successful login | Reproduced in the real app connected to emulators: `authBusy` stayed true after success | Email and Google handlers now clear busy state in `finally`; repeated UI sign-out/sign-in worked |
| Profile creation accepted privileged-looking fields | Emulator test demonstrated self-created `isInfluencer` field | Creation now whitelists customer-editable fields; role/influencer edits are refused. This was NOT an admin privilege escalation: admin access depends on trusted claims/UID |
| Browser admin could rewrite payment state/totals/ownership | Expected-denial test failed before rule fix | Admin order writes limited to fulfillment/tracking/archive fields on paid orders; payment fields remain backend-only |
| Upload type broader than advertised | Admin SVG upload succeeded before rule fix | Storage accepts JPEG/PNG/WebP MIME types only; generated filename extension follows MIME. This is not byte-level image sanitization |
| Replayed payment confirmation rewrote `paidAt` | Backend/emulator replay test failed | Transactional, idempotent confirmation; rejects late confirmation after inventory restoration for manual reconciliation |
| Save failure looked successful | Inspected optimistic product/coupon/order/deletion handlers | Affected UI handlers now await success or show an error; favorite deletion no longer disappears before confirmation; missing Firebase writes throw instead of silently returning |
| Empty remote catalogue ignored | Both watcher and consumer required nonempty arrays | Empty Firebase results now clear the catalogue |
| Account transitions could receive stale listener results | Inspected callback lifecycle | Added UID guards to private listeners and fail-closed handling for token verification errors |
| Numeric validation gaps | Invalid ratings could pass comparisons as NaN; disabled/invalid coupon percentages became 1% | Validate integer ratings/quantities, positive variant prices and valid coupon percentages before side effects |
| Missing browser security headers | Live response had HSTS but not CSP, framing/MIME/referrer protections | Added Netlify CSP, frame denial, nosniff, referrer/permissions policies and popup-compatible opener policy locally |
| Abandoned and uncertain payments | New provider-status, timeout, concurrency and cancellation tests | MB WAY scheduled reconciliation; separate admin review queue; evidence-required release for other methods; uncertain initiation no longer frees stock that could still be paid |
| Duplicate requests and request abuse | Repeated and concurrent attempts, ninth-identity-attempt denial, shipping spoof test | Transactional checkout attempts, per-IP/identity/account limits, request timeout, server destination/price validation and safe redirect host checks |
| Arbitrary-email restock subscriptions | Anonymous, unverified and different-account emails rejected | Verified account-email ownership required, rate limits and atomic deterministic email-queue records |
| Partial or stale catalogue writes | Actual client-helper saves and server bulk-pricing tests | Base/decant records save atomically, stale stock edits fail, pricing reads current stock inside one transaction; UI retains authoritative Firebase snapshots |
| Account profile overwritten on login | Three actual-helper login cycles preserved an edited name | Create the profile only when missing; creation failure signs out; email verification can be retried from account settings |
| Cross-device favourite conflict | Independent edit rejected a stale write | Transactional changed-folder writes; queued local saves; old-account failures cannot roll back a new account's UI |
| Stolen-session incident response missing | Revoked ID token denied by Firestore/Storage/callables; browser immediately signed out | Recent-login-protected sign-out-everywhere action, refresh-token revocation and revocation-aware rules/listeners, including admin UI |
| Dependency and type-check failures | Clean dependency audits, TypeScript and both builds | Updated supported dependencies and scoped transitive overrides; Vite/Cloudflare environment declarations and product narrowing fixed |

## Test coverage and results

- 70 unit, mocked-backend, source-regression and rendered-HTML tests passed. Not all of these are behavioral integration tests.
- 20 Firebase Auth/Firestore/Storage emulator integration tests passed, including denial with already-issued revoked tokens.
- 21 backend integration tests passed against the real Firestore emulator, including payment reconciliation, duplicate requests, session revocation, ownership checks and bulk pricing. IFTHENPAY HTTP responses were replaced with a fake provider; no SMTP extension or deployed trigger ran.
- 6 actual frontend Firebase-helper integration tests passed: login/profile preservation, product groups and stale-stock rejection, non-destructive catalogue seeding, coupon association preservation, cross-account/cross-device favourites, and local recovery/verification messages.
- These 47 integration tests passed repeatedly, including two complete runs on Node 22.23.2. All 70 existing unit/regression tests also passed. Handler `.run` tests exercise the actual application handler with a trusted test authentication fixture; transport token validation and App Check enforcement are separate deployment gates.
- Repeated SDK account switching: three Alice/sign-out/Bob cycles, with server reads denied while signed out and for the other account.
- Real application browser test at an isolated origin: login, saved favorite folder, switch to another account (folder absent), sign back in (folder present), three additional sign-out/sign-in cycles, wrong-password rejection and optional-cookie rejection.
- Stored HTML-like favorite name rendered literally. DOM check found zero injected `img[onerror]` nodes. This is one XSS regression scenario, not exhaustive proof against every injection path.
- Final browser pass: Alice's paid order visible, pending order hidden, favourite name saved, Bob's account showed neither Alice's favourites nor orders, Alice's favourites returned on next sign-in. Revoking Alice's session removed private content automatically. Verification/recovery UI returned appropriate feedback using emulator-only email messages. Wrong passwords remained rejected after repeated account switching.
- Final admin browser pass: pending payments appeared only in their separate review panel; stock-release button stayed disabled without evidence/confirmation. Two consecutive product edits saved and independent emulator reads confirmed both base and decant records, with unchanged stock. No horizontal page overflow was observed at the tested desktop size.
- Concurrent checkout for a single remaining unit allowed exactly one checkout and left stock at zero.
- Forged client totals/discounts were ignored; server calculated the amount. Missing/wrong callback keys, wrong amount and mismatched request ID were rejected. Pending payments did not generate influencer earnings or paid-order emails.
- Verified-purchase review tests rejected anonymous users, another customer, unpaid and undelivered purchases, and invalid ratings; a delivered, paid purchase saved its review.
- Duplicate paid-event delivery retained deterministic email document IDs rather than duplicating email records.
- `tsc --noEmit`, `npm run build` and `npm run build:netlify` passed. Full build and emulator suite also passed on Node 22. Existing bundle-size and future-config-loader warnings remain.
- Root `npm audit` including development dependencies and both root/functions `npm audit --omit=dev` reported zero known vulnerabilities. Compatibility smoke checks covered the patched tracing propagator, TypeScript loader and Drizzle CLI. This is an advisory-database result, not proof of no unknown vulnerabilities.

## Persistence matrix

| Data | Verified | Production write tested? |
| --- | --- | --- |
| Authentication and account profile | SDK registration/sign-in, private reads, profile edit from separate client | No |
| Product catalogue and variants | Emulator create/edit/delete plus independent public server reads | No; live public reads only |
| Images | Admin upload, exact-byte public read, customer/anonymous upload denial, SVG denial | No |
| Favorite folders | SDK create/edit/delete across independent clients; browser creation and sign-in reload | No |
| Brands | Admin write and fresh public read; customer/anonymous write denial | No |
| Shipping | Three zones saved/read; invalid settings refused | No |
| Decant pricing and global availability | Settings saved/read; unauthorized writes refused; server transaction updates prices/settings/mirrors while retaining stock | No |
| Coupons | Admin create/read/delete; private-list denial; server applies saved discount | No |
| Orders and fulfillment | Actual handler/emulator pending order, stock transaction, confirmation and fulfillment writes | No |
| Influencer association and earnings | Actual handler writes profile/coupon association and paid-only commission; separate-user read denial | No |
| Reviews | Actual handler saves only for delivered/paid purchase; direct client writes denied | No |
| Restock alerts | Verified-email-only subscription, availability change and deterministic email queue record | No inbox delivery |
| Payment/order emails | Escaped HTML and persisted deterministic queue records | No inbox delivery |
| Cookie choice | Browser UI and source review; stored locally by design, not in Firebase | Not applicable |

Emulator writes are actual Firebase SDK/Firestore operations followed by independent reads, not just local React state. They establish local behavior under the tested rules, not an assertion that every production deployment/configuration matches them.

## Safe checks against the live services

- Homepage HTTPS returned 200 and HSTS `max-age=31536000`.
- Public product listing returned 200. Read-only catalogue validation found **367 documents / 1,282 variants**, zero missing Portuguese names and zero invalid/zero variant prices.
- Anonymous collection reads for profiles, orders, coupons, mail, restockSubscriptions and influencerCouponUses all returned 403.
- Unauthenticated `setInfluencerAccount` and `submitReview` returned 401.
- Disabled `createPendingOrder` returned 400/FAILED_PRECONDITION; empty `createCheckout` returned 400/INVALID_ARGUMENT before side effects.
- Unsigned `ifthenpayCallback` returned 403.
- Tracked-source filename/private-key/token pattern scan found no matching credential files or secret patterns. This was not a complete historical secret scan. Firebase web configuration/API keys are public client configuration, not proof of leaked admin credentials.

## Sessions and cookie theft

This site uses Firebase's browser authentication SDK, not an HttpOnly server-session-cookie architecture. Passwords are passed to Firebase for authentication; the inspected application does not store plaintext passwords. Browser persistence contains authentication tokens and must be protected against XSS and compromised devices/extensions.

A fast logout is not intrinsically unsafe. The important properties are clearing the local authenticated UI and denying subsequent unauthenticated server access; both were tested. Ordinary logout on one browser does **not** revoke another device or a copied token. The new separate **sign out everywhere** action requires authentication within five minutes, records revocation metadata and revokes refresh tokens. Updated Firestore/Storage rules and callable wrappers deny older authenticated sessions; listeners sign the browser out. Public product data remains public. This mechanism must be deployed together to take effect. See [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions) and [browser persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence).

The new CSP reduces browser injection opportunities but cannot make token theft impossible. Google OAuth compatibility, malicious extensions, phishing, compromised machines, full cross-browser testing, sustained attacks and an independent penetration test remain outside the verified scope.

## Reproduce safely

Requires Node 22.13+ and Java 21+ with Java on PATH. Run `npm run build` before `npm run test:unit` because the rendered-HTML test imports the generated server. `npm run test:security` starts only the demo project's Auth/Firestore/Storage emulators, clears its disposable data, and runs all three integration suites sequentially. Every suite asserts the demo project ID and loopback emulator endpoints before any write.

`tests/preview-security-ui.mjs` starts the actual frontend on localhost:3001 with env-file loading disabled and forced demo-emulator connections. It cannot load production Firebase credentials; it is not a replacement for the normal localhost:3000 site. Temporary audit services should be stopped after testing.

For browser fixtures, start the emulators with `firebase.audit.json`, then run `tests/seed-security-ui.cjs` with `GCLOUD_PROJECT=demo-mystic-audit`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9098`. It creates only disposable `example.invalid` accounts and sample orders. The preview points callables at an intentionally unavailable local Functions emulator; callable logic is verified by the backend integration suite, not by successful browser calls to production.

## Release order

1. Review this diff, back up production data, confirm Firebase project and Netlify site, and keep existing secrets out of the repository. Build under Node 22; run unit and emulator suites.
2. Register App Check and verify admin/recovery settings. Confirm the payment and email configuration and review legacy pending orders without changing their financial status blindly.
3. Deploy functions/rules with the required scoped permissions, then the frontend and headers. Check all new callable endpoints and the scheduled reconciliation job. No deployment commands were executed by this fix pass.
4. Exercise Google/email sign-in, normal logout, sign-out-everywhere, actual saved-data readback, a controlled provider-approved payment, cancellation/reconciliation, paid-only fulfillment and inbox delivery with designated test accounts. Activate enforcement only after legitimate App Check traffic is confirmed. Observe errors and billing before declaring the release ready.

Further references: [Firebase App Check enforcement](https://firebase.google.com/docs/app-check/cloud-functions), [password policy and enumeration protection](https://firebase.google.com/docs/auth/web/password-auth), [uuid maintainer advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
