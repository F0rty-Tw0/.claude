# Payment flip bug + Profile route

## Context

After a Polar checkout the extension keeps showing the free tier ("Choose plan", quota N/50).
User confirmed: Polar shows the webhook delivered with **202**, yet `subscriptionTier` never flips.

The webhook handler returns 202 on three paths, and two of them write nothing:

| Path in `payment-webhook.handler.ts` | Writes DB? |
| --- | --- |
| event type is not `subscription.*` | no |
| subscription event, no user id resolved | no (only a `warn`) |
| `updateUserSubscription()` ran | `UPDATE ... WHERE user_id = $4`, **0 matched rows is silent** |

Three candidate causes, all consistent with a 202:

- **(a) Stale Polar external id.** `getSubscriptionUserId` prefers `customer.externalId`, falls back to
  `metadata.userId`. Polar never updates a customer's `external_id` once set (SDK
  `subscriptioncustomer.d.ts:26`). A customer created in an earlier test with the same email but an old DB
  uuid makes the UPDATE match 0 rows.
- **(b) Wrong events registered.** Only `order.*` / `checkout.*` → early 202, nothing written.
- **(c) Out-of-order delivery.** Every `subscription.*` overwrites tier unguarded. A retried
  `subscription.created` (status `incomplete`) landing after `subscription.active` flips pro back to free.

Also confirmed: the enhancer reads `isProUser` from the **session cookie**
(`prompt-enhancer.handler.ts:80-85`), which only `GET /auth/user` rewrites. And the extension caches the
user in NGXS: `UserService.getUser$()` returns the snapshot, and the 5 s poll in `PremiumComponent` dies
with the component. Coming back from the Polar tab after closing the dialog leaves a stale `free` user.

Third ask: a real profile. Route `profile` already exists (dialog outlet, `authGuard`) with a stub component.
Invoices/payments: **link to Polar customer portal** (user's choice). No new backend for billing.

## Step 0. Diagnose before coding (user, 5 min)

1. Polar dashboard → Webhooks → the 202 delivery → raw payload. Note `type`, `data.status`,
   `data.customer.external_id`, `data.metadata.userId`, `data.customer_id`.
2. Compare `external_id` with `users.user_id` for that email (needs `pnpm start:db:dev`).
3. Fly API logs: grep `Polar webhook`. `Subscription updated` vs `without a user reference` vs nothing.

| Finding | Cause | Extra work beyond Parts A–D |
| --- | --- | --- |
| `external_id` ≠ `user_id`, metadata correct | (a) | Persist `data.customer_id` in a new `polar_customer_id` column; portal + checkout use `customerId` instead of `externalCustomerId` (external id is immutable, portal lookup by it will 502 for this user) |
| `type` is `order.*` / `checkout.*` only | (b) | Re-register webhook with all `subscription.*` events; no code |
| `active` then a later `created`/`incomplete` | (c) | Ordering guard (Part A.4) |

Parts A–D are correct regardless; the table only adds to them.

## Part A. Make the webhook honest (backend)

Files: `apps/backend/prompt-enhancer-api/src/payment/feature/payment-webhook.handler.ts`,
`apps/backend/prompt-enhancer-api/src/auth/data-access/users.db.ts`, new
`apps/backend/prompt-enhancer-api/src/payment/domain-logic/webhook-user-id.ts` (+ spec)

1. **Prefer our own id.** `resolveWebhookUserId(event)`: `metadata.userId` first, `customer.externalId`
   second. Metadata is set per checkout in `createCheckoutHandler` and copied to the subscription by
   Polar, so it cannot go stale. Pure function, vitest spec in the style of
   `auth/domain-logic/subscription.spec.ts` (metadata wins, externalId fallback, neither → undefined).
2. **Log every event type** at info before the `isSubscriptionEvent` early return.
3. **Detect 0-row updates.** `updateUserSubscription` becomes `UPDATE ... RETURNING user_id`, returns
   `boolean`. On `false` the webhook logs `warn` with `userId`, `customer.externalId`, `customerId`,
   `metadata`, `status`, `type`, and still returns 202 (Polar must not retry forever).
4. **Ordering guard, only if Step 0 shows (c)** or the new logs ever show it: add
   `subscription_updated_at TIMESTAMPTZ` (idempotent migration in `auth/data-access/migrations/`),
   write `data.modifiedAt`, and make the UPDATE `WHERE user_id = $4 AND (subscription_updated_at IS NULL
   OR subscription_updated_at <= $5)`. Not built by default.

## Part B. Block double subscription (backend)

File: `apps/backend/prompt-enhancer-api/src/payment/feature/payment.handler.ts`

`createCheckoutHandler`: after the auth check, `findUserSubscription(user.userId)` +
`toUserSubscription()`; if tier is `pro` respond `409 { message: 'Already subscribed' }`. DB read, not
session, because the session can be stale. Frontend surfaces the message via
`PaymentService.handleError$` snackbar, and `PremiumComponent.upgrade()` calls
`userService.refreshUser$()` in its `catchError` so the stale "Choose plan" self-heals after the 409.

## Part C. Stop caching a stale user (extension)

File: `apps/frontend/prompt-enhancer-extension/src/app/feature/dialog/dialog.component.ts`

In the constructor: if `userState.getSnapshot()` exists, `void firstValueFrom(userService.refreshUser$())`.
Force mode swallows errors and skips loading toggles (`user.service.ts:70-76`), so it is silent. This
also rewrites the session cookie, which is what the enhancer's `isProUser` reads. No focus/visibility
hooks; reopening the dialog is the natural "I'm back" signal. Existing premium polling stays.

## Part D. Profile route (extension)

Existing: `shell/shell.routes.ts` → `profile` (dialog outlet, `authGuard`), stub
`feature/profile/profile.component.{ts,html,scss}`.

### D1. Entry point
`feature/auth/auth.component.{ts,html}`: signed-in item becomes the sidenav anchor pattern
(`<a mat-list-item [routerLink]="[{ outlets: { dialog: ['profile'] } }]" [skipLocationChange]="true"
routerLinkActive="sidenav__link--active">`, same as `sidenav.component.html:26-41`), tooltip **Profile**.
`skipLocationChange` is mandatory or the host page URL changes. Remove `logout()` and the
`Router` / `AppSettingsStateService` injections from AuthComponent. Signed-out branch unchanged.

### D2. ProfileComponent
Injects `UserStateService`, `PaymentService`, `AuthService`, `AppSettingsStateService`, `Router`,
`MaterialSvgIconsService` (`user`, `premium` icons). Styled like `premium.component.scss` cards, dark
palette, `pro-button` mixin for the accent button.

1. **Identity** — avatar (`NgOptimizedImage`, fallback `user` svg icon), name, email.
2. **Plan card** — "Pro · active" or "Free". `subscriptionStatus` of `past_due` / `canceled` / `unpaid`
   shown as a red hint.
   - Pro: one button **Manage plan & billing** → `paymentService.openCustomerPortal$()` with the
     spinner + `catchError(() => of(null))` + `finalize` pattern from `PremiumComponent.manage()`.
     No polling here; Part C covers the return trip. Portal shows invoices, payment method, cancel.
   - Free: **Upgrade to Pro** → routerLink to the `premium` dialog outlet.
3. **Shortcuts** — History and Templates anchors, same outlets as the sidenav.
4. **Sign out** — `logout()` body moved verbatim from AuthComponent, including the navigate to
   `enhance-prompt/:mode`. Required: the profile route is guarded, so after reset the outlet must leave it.

No new runtime message, no new API: `openCustomerPortal` exists end to end.

### D3. Sidenav
No change; `AuthComponent` lives inside it.

## Part E. Analysis: what else belongs in the profile (not built now)

| Candidate | Source today | Effort | Verdict |
| --- | --- | --- | --- |
| Renewal / cancel-at-period-end date | `currentPeriodEnd`, `cancelAtPeriodEnd` on the webhook payload; needs one `current_period_end` column, same UPDATE, add to `User` type + `findUserSubscription` | S | **Best next step.** Only billing fact the portal link does not show inline |
| Default target / enhance mode / output language / role | `utils/settings.storage.ts` (`browser.storage.local`, device-local) | S | Only with an edit path (selects that call `patchSettings`); display-only is noise |
| Saved roles manage (rename/delete) | `savedRoles` in same storage, edited in `role-menu` | S | Pairs with the row above |
| Quota + refines left | `prompt-enhancer` state, set only from an enhance response | S | Skip until a quota endpoint exists; otherwise shows a stale or empty number |
| Reset onboarding tips | `triedTargets`, `triedExampleCategories` in same storage | XS | Nice-to-have toggle |
| Connected provider (Google) | `user_providers` table, not exposed | S | Display only, low value |
| Export data / delete account | none | L | GDPR item, separate task |
| Native invoice list | Polar `orders.list({ externalCustomerId })` + `orders.invoice` | M | Skip; portal covers it (user decision) |

## Verification

1. Baseline: `pnpx nx run prompt-enhancer-api:test` and `pnpx nx run prompt-enhancer-extension:test`,
   record pass/fail counts. Re-run after each part, report delta.
2. Backend unit: new `webhook-user-id.spec.ts` green.
3. Backend manual: `pnpm start:api`, resend the delivery from Polar dashboard (Webhooks → deliveries →
   Resend) and read the log: `Subscription updated` or the new `No user row` warn naming the ids.
4. Recovery for the already-paid account, user runs after Step 0 (needs `pnpm start:db:dev`):
   ```sql
   UPDATE users SET subscription_status = 'active', subscription_tier = 'pro', subscription_id = '<polar sub id>'
   WHERE email = '<email>';
   ```
   or resend the webhook after Part A is deployed.
5. Extension: `pnpm build:extension`, load unpacked. Sign in → avatar click opens Profile → Sign out returns
   to enhance-prompt. Free user: Upgrade routes to premium. Pro user: Manage plan opens portal tab.
   Checkout as pro → snackbar "Already subscribed" and the page flips to Active.
6. Lint + typecheck: `pnpm lint`, `pnpx nx run prompt-enhancer-extension:build`.
7. e2e: `pnpm e2e:extension`. Verified no spec references Sign Out / `auth__link`; `waitForSignedIn` keys on
   the premium badge (`e2e/test/fixtures/dialog.ts:119-121`).

## Execution notes

- Delegate code edits to `executor`: task 1 backend (Parts A, B), task 2 extension (Parts C, D).
- Working tree already has 41 dirty files from unrelated UI work; stage only touched files, no commit
  unless asked.
