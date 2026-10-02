# Third-Party Service Mocking

## Table of Contents

1. [OAuth/SSO Mocking](#oauthsso-mocking)
2. [Payment Gateway Mocking](#payment-gateway-mocking)
3. [Email Verification](#email-verification)
4. [SMS Verification](#sms-verification)
5. [Analytics & Tracking](#analytics--tracking)
6. [CAPTCHA](#captcha)

## OAuth/SSO Mocking

### Mock Google OAuth

An OAuth login needs three endpoints mocked: the provider callback, which redirects back into the app; the session endpoint, which the app polls after the redirect; and the current-user endpoint. Each is a factory in `test/mocks/`, installed by the page object's opening call, so a spec never sees a route or a status code. The provider is a parameter, so the same factories cover Google, GitHub, and Microsoft.

The samples extend the `auth` feature of [authentication.md](authentication.md). These types join its `common/auth.type.ts`, where `ResponseHeaders` is `Record<string, string>`.

```ts
// e2e/auth/common/auth.type.ts
export type OAuthProvider = 'github' | 'google' | 'microsoft';

export type OAuthUser = {
  readonly avatar?: string;
  readonly email: string;
  readonly id: string;
  readonly name: string;
};

export type OAuthLogin = {
  readonly provider: OAuthProvider;
  readonly user: OAuthUser;
};

export type OAuthSession = {
  readonly authenticated: boolean;
  readonly provider: OAuthProvider | 'saml';
  readonly user: OAuthUser;
};
```

The callback mock is `providerCallbackMock`, because `oauthCallbackMock` in `test/mocks/oauth.mock.ts` already names the provider-redirect mock behind `LoginOptions.oauthCallback`.

```ts
// e2e/auth/test/mocks/oauth-login.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { OAuthProvider, OAuthSession, OAuthUser, ResponseHeaders } from '../../common/auth.type';

export const providerCallbackMock = (provider: OAuthProvider): RouteHandler => {
  const headers: ResponseHeaders = { Location: `/auth/success?provider=${provider}` };

  return (route: Route): Promise<void> => route.fulfill({ headers, status: 302 });
};

export const oauthSessionMock = (provider: OAuthProvider, user: OAuthUser): RouteHandler => {
  const json: OAuthSession = { authenticated: true, provider, user };

  return (route: Route): Promise<void> => route.fulfill({ json });
};

export const currentUserMock = (user: OAuthUser): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: user });
};
```

| Provider | Callback pattern | Button label |
|---|---|---|
| Google | `**/auth/google/callback**` | `Sign in with Google` |
| GitHub | `**/auth/github/callback**` | `Sign in with GitHub` |
| Microsoft | `**/auth/microsoft/callback**` | `Sign in with Microsoft` |

### OAuth on the Opening Call

The opening call installs all three routes for one provider and one user, then navigates: `loginPage.goto({ oauthLogin })`. The spec never routes, and its `WHEN` only says the login page is opened; the title names the mocked provider. `LoginOptions` from authentication.md keeps `oauthCallback` and gains `oauthLogin?: OAuthLogin`, so `goto` applies whichever option it is given. The sample shows the members this file uses; the form members of [Login Page Object](authentication.md#login-page-object) are left out.

```ts
// e2e/auth/pages/login.po.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { PROVIDER_AUTHORIZE_URL } from '../common/auth.const';
import type { LoginOptions, OAuthLogin } from '../common/auth.type';
import { currentUserMock, oauthSessionMock, providerCallbackMock } from '../test/mocks/oauth-login.mock';
import { oauthCallbackMock } from '../test/mocks/oauth.mock';

export class LoginPage {
  public readonly githubButton: Locator;
  public readonly googleButton: Locator;
  public readonly ssoButton: Locator;
  public readonly welcomeBanner: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.githubButton = page.getByRole('button', { name: 'Sign in with GitHub' });
    this.googleButton = page.getByRole('button', { name: 'Sign in with Google' });
    this.ssoButton = page.getByRole('button', { name: 'SSO Login' });
    this.welcomeBanner = page.getByRole('status');
  }

  public async goto(options: LoginOptions = {}): Promise<void> {
    if (options.oauthCallback) await this.page.route(PROVIDER_AUTHORIZE_URL, oauthCallbackMock(options.oauthCallback));
    if (options.oauthLogin) await this.routeOAuthLogin(options.oauthLogin);

    await this.page.goto('/login');
  }

  public async signInWithGithub(): Promise<void> {
    await this.githubButton.click();
  }

  public async signInWithGoogle(): Promise<void> {
    await this.googleButton.click();
  }

  public async signInWithSso(): Promise<void> {
    await this.ssoButton.click();
  }

  public async expectWelcome(name: string): Promise<void> {
    await expect(this.welcomeBanner).toContainText(`Welcome, ${name}`);
  }

  private async routeOAuthLogin({ provider, user }: OAuthLogin): Promise<void> {
    await this.page.route(`**/auth/${provider}/callback**`, providerCallbackMock(provider));
    await this.page.route('**/api/auth/session', oauthSessionMock(provider, user));
    await this.page.route('**/api/me', currentUserMock(user));
  }
}
```

`auth.fixture.ts` from authentication.md already hands over `loginPage`. `OAUTH_USER_STUB`, an `OAuthUser`, joins `OAUTH_CALLBACK_STUB` in `test/stubs/oauth.stub.ts`. The spec starts signed out, like every OAuth spec in the `auth` feature, and routes the app's own `/api`, so it is a `.test.ts`.

```ts
// e2e/auth/provider-login.test.ts
import { test } from './auth.fixture';
import { EMPTY_STORAGE_STATE } from './common/auth.const';
import type { OAuthLogin } from './common/auth.type';
import { OAUTH_USER_STUB } from './test/stubs/oauth.stub';

test.use({ storageState: EMPTY_STORAGE_STATE });

test.describe('FEATURE: provider login', () => {
  test('GIVEN a mocked GitHub provider, signing in names the user in the welcome banner', async ({ loginPage }): Promise<void> => {
    const oauthLogin: OAuthLogin = { provider: 'github', user: OAUTH_USER_STUB };

    await test.step('WHEN the login page is opened', (): Promise<void> => loginPage.goto({ oauthLogin }));

    await test.step('AND the user signs in with GitHub', (): Promise<void> => loginPage.signInWithGithub());

    await test.step('THEN the welcome banner names the user', (): Promise<void> => loginPage.expectWelcome(OAUTH_USER_STUB.name));
  });
});
```

### Mock SAML SSO

SAML differs from OAuth in one place: the assertion consumer service (`/saml/acs`) sets the session cookie on the redirect. The session mock then reports `provider: 'saml'`.

```ts
// e2e/auth/test/stubs/saml.stub.ts
import type { ResponseHeaders } from '../../common/auth.type';

export const SAML_ACS_HEADERS_STUB: ResponseHeaders = {
  Location: '/dashboard',
  'Set-Cookie': 'session=mock-saml-session; Path=/; HttpOnly'
};
```

```ts
// e2e/auth/test/mocks/saml.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { OAuthSession, OAuthUser, ResponseHeaders } from '../../common/auth.type';
import { OAUTH_USER_STUB } from '../stubs/oauth.stub';
import { SAML_ACS_HEADERS_STUB } from '../stubs/saml.stub';

export const samlAcsMock = (headers: ResponseHeaders = SAML_ACS_HEADERS_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ headers, status: 302 });
};

export const samlSessionMock = (user: OAuthUser = OAUTH_USER_STUB): RouteHandler => {
  const json: OAuthSession = { authenticated: true, provider: 'saml', user };

  return (route: Route): Promise<void> => route.fulfill({ json });
};
```

`LoginOptions` gains `saml?: OAuthUser`, and `goto` routes `samlAcsMock()` on `**/saml/acs` and `samlSessionMock(user)` on `**/api/auth/session` for it the same way it routes `oauthLogin`. The spec opens with `loginPage.goto({ saml: OAUTH_USER_STUB })` as its `WHEN`, clicks `loginPage.signInWithSso()` in an `AND` step, and asserts `expect(page).toHaveURL('/dashboard')` in a `THEN` step.

## Payment Gateway Mocking

### Mock Stripe

Stripe.js is loaded by the app, so the mock replaces `window.Stripe` with `page.addInitScript` before any page script runs. The init function is serialised into the browser, so every value it uses is declared inside it; the `shouldFail` flag is the one argument passed in. `Object.assign(window, ...)` installs the global without a cast. Add `createPaymentMethod` to the stub the same way when the checkout calls it.

```ts
// e2e/checkout/test/mocks/stripe.mock.ts
import type { Page } from '@playwright/test';

type StripeError = { readonly message: string };
type PaymentIntent = { readonly id: string; readonly status: string };
type PaymentResult = { readonly error?: StripeError; readonly paymentIntent?: PaymentIntent };
type StripeElement = {
  readonly destroy: () => void;
  readonly mount: () => void;
  readonly on: (event: string, handler: () => void) => void;
};
type StripeElements = { readonly create: () => StripeElement };
type StripeStub = {
  readonly confirmCardPayment: () => Promise<PaymentResult>;
  readonly elements: () => StripeElements;
};

const installStripeStub = (shouldFail: boolean): void => {
  const onEvent = (event: string, handler: () => void): void => {
    if (event === 'ready') setTimeout(handler, 100);
  };
  const element: StripeElement = { destroy: (): void => {}, mount: (): void => {}, on: onEvent };
  const elements: StripeElements = { create: (): StripeElement => element };
  const declined: StripeError = { message: 'Card declined' };
  const succeeded: PaymentIntent = { id: 'pi_mock_123', status: 'succeeded' };
  const failure: PaymentResult = { error: declined };
  const success: PaymentResult = { paymentIntent: succeeded };
  const result = shouldFail ? failure : success;
  const stripe: StripeStub = {
    confirmCardPayment: (): Promise<PaymentResult> => Promise.resolve(result),
    elements: (): StripeElements => elements
  };

  Object.assign(window, { Stripe: (): StripeStub => stripe });
};

export const stripeMock = async (page: Page, shouldFail: boolean): Promise<void> => {
  await page.addInitScript(installStripeStub, shouldFail);
};
```

The backend endpoints the checkout calls are plain route mocks. `PaymentIntent` is `{ readonly clientSecret: string }` and `PaymentConfirmation` is `{ readonly orderId: string; readonly success: boolean }`, both in `common/checkout.type.ts`. The bodies are stubs; the mocks only intercept.

```ts
// e2e/checkout/test/stubs/payment.stub.ts
import type { PaymentConfirmation, PaymentIntent } from '../../common/checkout.type';

export const PAYMENT_CONFIRMATION_STUB: PaymentConfirmation = { orderId: 'order-123', success: true };

export const PAYMENT_INTENT_STUB: PaymentIntent = { clientSecret: 'pi_mock_123_secret_mock' };
```

```ts
// e2e/checkout/test/mocks/payment.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { PaymentConfirmation, PaymentIntent } from '../../common/checkout.type';
import { PAYMENT_CONFIRMATION_STUB, PAYMENT_INTENT_STUB } from '../stubs/payment.stub';

export const confirmPaymentMock = (confirmation: PaymentConfirmation = PAYMENT_CONFIRMATION_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: confirmation });
};

export const paymentIntentMock = (intent: PaymentIntent = PAYMENT_INTENT_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: intent });
};
```

### Mock PayPal

The PayPal SDK renders its own button and calls the app's `onApprove` callback. The stub keeps the `Buttons(options)` shape and calls `options.onApprove` from `render()`, which is how the spec simulates approval without reaching into `window`. The order and capture endpoints are route mocks shaped like the Stripe ones, fed by their own stubs.

```ts
// e2e/checkout/test/stubs/paypal.stub.ts
import type { PayPalCapture, PayPalOrder } from '../../common/checkout.type';

export const PAYPAL_CAPTURE_STUB: PayPalCapture = { success: true, transactionId: 'TXN-123' };

export const PAYPAL_ORDER_STUB: PayPalOrder = { orderId: 'PAYPAL-ORDER-123' };
```

```ts
// e2e/checkout/test/mocks/paypal.mock.ts
import type { Page, Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { PayPalCapture, PayPalOrder } from '../../common/checkout.type';
import { PAYPAL_CAPTURE_STUB, PAYPAL_ORDER_STUB } from '../stubs/paypal.stub';

type PayPalApproval = { readonly orderID: string };
type PayPalButtonOptions = { readonly onApprove: (approval: PayPalApproval) => Promise<void> };
type PayPalButtons = { readonly isEligible: () => boolean; readonly render: () => Promise<void> };
type PayPalStub = {
  readonly Buttons: (options: PayPalButtonOptions) => PayPalButtons;
  readonly FUNDING: Record<string, string>;
};

const installPayPalStub = (): void => {
  const approval: PayPalApproval = { orderID: 'PAYPAL-ORDER-123' };
  const buttonsFor = (options: PayPalButtonOptions): PayPalButtons => {
    const buttons: PayPalButtons = {
      isEligible: (): boolean => true,
      render: (): Promise<void> => options.onApprove(approval)
    };

    return buttons;
  };
  const funding = { CARD: 'card', PAYPAL: 'paypal' };
  const paypal: PayPalStub = { Buttons: buttonsFor, FUNDING: funding };

  Object.assign(window, { paypal });
};

export const paypalSdkMock = async (page: Page): Promise<void> => {
  await page.addInitScript(installPayPalStub);
};

export const paypalCaptureMock = (capture: PayPalCapture = PAYPAL_CAPTURE_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: capture });
};

export const paypalOrderMock = (order: PayPalOrder = PAYPAL_ORDER_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: order });
};
```

### Payment Mocks on the Opening Call

`CheckoutPage.goto(options: CheckoutOptions = {})` takes `card?: 'accepted' | 'declined'` (`CheckoutOptions` in `common/checkout.type.ts`; [network-advanced.md](network-advanced.md#mock-graphql-mutations) adds `graphql?: 'createOrder'`). Given a card, it calls `stripeMock(this.page, card === 'declined')` and routes `paymentIntentMock()` and `confirmPaymentMock()` before it navigates. Declined and succeeded cases differ only in that option, and the fixture below keeps only what every test shares.

```ts
// e2e/checkout/checkout.fixture.ts
import { test as base } from '@playwright/test';

import type { AnalyticsCapture } from './common/checkout.type';
import { CheckoutPage } from './pages/checkout.po';
import { analyticsCaptureMock, analyticsSdkMock } from './test/mocks/analytics.mock';

type CheckoutFixtures = {
  readonly analytics: AnalyticsCapture;
  readonly checkoutPage: CheckoutPage;
};

export const test = base.extend<CheckoutFixtures>({
  analytics: async ({ page }, use): Promise<void> => {
    const capture = analyticsCaptureMock();

    await analyticsSdkMock(page);
    await page.route('**/api/analytics/track', capture.handler);
    await use(capture);
  },
  checkoutPage: async ({ page }, use): Promise<void> => {
    await use(new CheckoutPage(page));
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/checkout/checkout.test.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: checkout', () => {
  test('GIVEN a declined card, paying shows the declined message', async ({ checkoutPage }): Promise<void> => {
    await test.step('WHEN the checkout is opened', (): Promise<void> => checkoutPage.goto({ card: 'declined' }));

    await test.step('AND the user pays', (): Promise<void> => checkoutPage.pay());

    await test.step('THEN the status reads card declined', (): Promise<void> => checkoutPage.expectStatus('Card declined'));
  });

  test('GIVEN an accepted card, paying shows the success message', async ({ checkoutPage }): Promise<void> => {
    await test.step('WHEN the checkout is opened', (): Promise<void> => checkoutPage.goto({ card: 'accepted' }));

    await test.step('AND the user pays', (): Promise<void> => checkoutPage.pay());

    await test.step('THEN the status reads payment successful', (): Promise<void> => checkoutPage.expectStatus('Payment successful'));
  });
});
```

`CheckoutPage` holds `payButton` (`getByRole('button', { name: /^Pay/ })`) and `status` (`getByRole('status')`), with `pay()` and an `expectStatus(text)` holding one plain `expect`.

## Email Verification

### Mock Email API

The send endpoint never sends; it records a token. The verify endpoint compares the query-string token with the recorded one. Both handlers close over the same variable, so one factory returns both plus a `token()` reader the spec passes to the step that opens the link the email would have carried. The token varies per run, so it is generated; the three response bodies are fixed, so they are stubs the mock imports rather than parameters.

```ts
// e2e/signup/test/stubs/verification.stub.ts
import type { VerificationError, VerificationSent, VerificationVerified } from '../../common/signup.type';

export const TOKEN_INVALID_STUB: VerificationError = { error: 'Invalid token' };

export const TOKEN_SENT_STUB: VerificationSent = { messageId: 'msg-123', sent: true };

export const TOKEN_VERIFIED_STUB: VerificationVerified = { verified: true };
```

```ts
// e2e/signup/test/mocks/verification.mock.ts
import type { Route } from '@playwright/test';

import type { VerificationMock } from '../../common/signup.type';
import { TOKEN_INVALID_STUB, TOKEN_SENT_STUB, TOKEN_VERIFIED_STUB } from '../stubs/verification.stub';

export const verificationMock = (): VerificationMock => {
  let token = '';

  const send = (route: Route): Promise<void> => {
    token = `mock-token-${Date.now()}`;

    return route.fulfill({ json: TOKEN_SENT_STUB });
  };
  const verify = (route: Route): Promise<void> => {
    const url = new URL(route.request().url());
    const isValid = url.searchParams.get('token') === token;

    if (isValid) return route.fulfill({ json: TOKEN_VERIFIED_STUB });

    return route.fulfill({ json: TOKEN_INVALID_STUB, status: 400 });
  };
  const mock: VerificationMock = { send, token: (): string => token, verify };

  return mock;
};
```

`VerificationMock` lives in `e2e/signup/common/signup.type.ts` as `{ readonly send: RouteHandler; readonly token: () => string; readonly verify: RouteHandler }`. A `verification` fixture creates it, routes `send` on `**/api/send-verification` and `verify` on `**/api/verify-email**`, and yields it. Those are the app's own endpoints, so the spec is a `.test.ts`. The check-your-email notice is the guard that the send finished; opening the link after it starts a new phase.

```ts
// e2e/signup/signup.test.ts
import { test } from './signup.fixture';
import { SIGNUP_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup', () => {
  test('GIVEN a mocked email service, opening the emailed link verifies the address', async ({ signupPage, verification, verifyPage }): Promise<void> => {
    await test.step('WHEN the signup page is opened', (): Promise<void> => signupPage.goto());

    await test.step('AND the email address is submitted', (): Promise<void> => signupPage.submitEmail(SIGNUP_STUB.email));

    await test.step('THEN the check-your-email notice is shown', (): Promise<void> => signupPage.expectCheckEmailNotice());

    await test.step('WHEN the verification link is opened', (): Promise<void> => verifyPage.goto(verification.token()));

    await test.step('THEN the verified notice is shown', (): Promise<void> => verifyPage.expectVerified());
  });
});
```

### Use Mailinator/Temp Mail

For a real inbox, a util polls the Mailinator API: list the inbox, fetch the newest message, and pull the first `verify` link out of the HTML part. The API key is read once into `MAILINATOR_API_KEY` in `common/signup.const.ts`; the util never touches `process.env`. Response shapes are typed at the boundary, so `response.json()` lands in a named type rather than `any`.

```ts
// e2e/signup/test/utils/mailinator.spec.util.ts
import type { APIRequestContext } from '@playwright/test';

import { MAILINATOR_API_KEY } from '../../common/signup.const';

type InboxMessage = { readonly id: string };
type InboxResponse = { readonly msgs: InboxMessage[] };
type MessagePart = { readonly body: string };
type MessageResponse = { readonly parts: MessagePart[] };

const INBOX_URL = 'https://api.mailinator.com/v2/domains/public/inboxes';
const LINK_PATTERN = /href="([^"]*verify[^"]*)"/;

export const fetchVerificationLink = async (request: APIRequestContext, inbox: string): Promise<string> => {
  const headers = { Authorization: `Bearer ${MAILINATOR_API_KEY}` };
  const inboxResponse = await request.get(`${INBOX_URL}/${inbox}`, { headers });
  const messages: InboxResponse = await inboxResponse.json();
  const latest = messages.msgs[0];

  if (!latest) throw new Error(`inbox ${inbox} is empty`);

  const messageResponse = await request.get(`${INBOX_URL}/${inbox}/messages/${latest.id}`, { headers });
  const message: MessageResponse = await messageResponse.json();
  const body = message.parts[0]?.body ?? '';
  const match = body.match(LINK_PATTERN);

  return match?.[1] ?? '';
};
```

The spec keeps the phases above: its `WHEN` opens the signup page, an `AND` submits the address, and the `THEN` checks the notice. The next `WHEN` is one call, `verifyPage.gotoEmailedLink(inbox)`: the page object calls `fetchVerificationLink(this.page.request, inbox)` and navigates to the link it returns, so no step only reads the link.

## SMS Verification

### Mock SMS API

Same shape as the email mock: the send handler generates a six-digit code, the verify handler compares `postDataJSON().code` with it, and a `code()` reader lets the spec type the code the phone would have received. The bodies live in `test/stubs/sms.stub.ts` with `SmsError`, `SmsSent`, and `SmsVerified` declared in `common/verify-phone.type.ts`. An `sms` fixture routes `send` and `verify` on the app's SMS endpoints the way the `verification` fixture does and yields the mock, so this spec is a `.test.ts` too.

```ts
// e2e/verify-phone/test/mocks/sms.mock.ts
import type { Route } from '@playwright/test';

import type { SmsMock, VerifySmsBody } from '../../common/verify-phone.type';
import { CODE_INVALID_STUB, CODE_SENT_STUB, CODE_VERIFIED_STUB } from '../stubs/sms.stub';

export const smsMock = (): SmsMock => {
  let code = '';

  const send = (route: Route): Promise<void> => {
    code = Math.random().toString().slice(2, 8);

    return route.fulfill({ json: CODE_SENT_STUB });
  };
  const verify = (route: Route): Promise<void> => {
    const body: VerifySmsBody = route.request().postDataJSON();
    const isValid = body.code === code;

    if (isValid) return route.fulfill({ json: CODE_VERIFIED_STUB });

    return route.fulfill({ json: CODE_INVALID_STUB, status: 400 });
  };
  const mock: SmsMock = { code: (): string => code, send, verify };

  return mock;
};
```

```ts
// e2e/verify-phone/verify-phone.test.ts
import { test } from './verify-phone.fixture';
import { PHONE_STUB } from './test/stubs/phone.stub';

test.describe('FEATURE: phone verification', () => {
  test('GIVEN a mocked SMS service, entering the texted code verifies the phone', async ({ sms, verifyPhonePage }): Promise<void> => {
    await test.step('WHEN the verify-phone page is opened', (): Promise<void> => verifyPhonePage.goto());

    await test.step('AND a code is requested', (): Promise<void> => verifyPhonePage.requestCode(PHONE_STUB.number));

    await test.step('AND the received code is submitted', (): Promise<void> => verifyPhonePage.submitCode(sms.code()));

    await test.step('THEN the verified notice is shown', (): Promise<void> => verifyPhonePage.expectVerified());
  });
});
```

## Analytics & Tracking

### Block Analytics in Tests

Blocking belongs to the shared fixture, not to each spec. Overriding `context` routes every tracker host to `abort()` before any page opens. The fixture wires; the handler is a mock and the host pattern is a const, so neither is declared here.

```ts
// e2e/common/tracker.const.ts
export const TRACKER_HOSTS: RegExp = /google-analytics|googletagmanager|facebook|hotjar|segment|mixpanel|amplitude/;
```

```ts
// e2e/test/mocks/blocked.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../common/playwright.type';

export const blockedMock = (): RouteHandler => {
  return (route: Route): Promise<void> => route.abort();
};
```

```ts
// e2e/playwright.fixture.ts
import { test as base } from '@playwright/test';

import { TRACKER_HOSTS } from './common/tracker.const';
import { blockedMock } from './test/mocks/blocked.mock';

export const test = base.extend({
  context: async ({ context }, use): Promise<void> => {
    await context.route(TRACKER_HOSTS, blockedMock());

    await use(context);
  }
});

export { expect } from '@playwright/test';
```

### Mock Analytics for Verification

To assert that an event fires, replace the analytics SDK with a stub that posts to a local endpoint, and capture that endpoint's bodies. The factory returns the captured list and the route handler together.

```ts
// e2e/checkout/test/mocks/analytics.mock.ts
import type { Page, Route } from '@playwright/test';

import type { AnalyticsCapture, AnalyticsEvent } from '../../common/checkout.type';

const installAnalyticsStub = (): void => {
  const track = (event: string, props: Record<string, unknown>): void => {
    const payload: AnalyticsEvent = { event, props };

    fetch('/api/analytics/track', { body: JSON.stringify(payload), method: 'POST' });
  };
  const analytics = { track };

  Object.assign(window, { analytics });
};

export const analyticsSdkMock = async (page: Page): Promise<void> => {
  await page.addInitScript(installAnalyticsStub);
};

export const analyticsCaptureMock = (): AnalyticsCapture => {
  const events: AnalyticsEvent[] = [];
  const handler = (route: Route): Promise<void> => {
    const body: AnalyticsEvent = route.request().postDataJSON();

    events.push(body);

    return route.fulfill({ status: 200 });
  };
  const capture: AnalyticsCapture = { events, handler };

  return capture;
};
```

`AnalyticsEvent` is `{ readonly event: string; readonly props: Record<string, unknown> }` and `AnalyticsCapture` is `{ readonly events: AnalyticsEvent[]; readonly handler: RouteHandler }`, both in `common/checkout.type.ts`. The `analytics` fixture in `checkout.fixture.ts` above installs the SDK stub, routes `**/api/analytics/track` to the capture handler, and yields the capture.

```ts
// e2e/checkout/checkout-analytics.test.ts
import { expect, test } from './checkout.fixture';

test.describe('FEATURE: checkout analytics', () => {
  test('GIVEN a stubbed analytics sdk, completing the purchase tracks the purchase event', async ({ analytics, checkoutPage }): Promise<void> => {
    const props = expect.objectContaining({ amount: expect.any(Number) });
    const purchase = expect.objectContaining({ event: 'Purchase Completed', props });

    await test.step('WHEN the checkout is opened', (): Promise<void> => checkoutPage.goto());

    await test.step('AND the purchase completes', (): Promise<void> => checkoutPage.completePurchase());

    await test.step('THEN the purchase event was tracked with an amount', (): void => expect(analytics.events).toContainEqual(purchase));
  });
});
```

## CAPTCHA

A test never solves a CAPTCHA, and never routes Google's script to a fake: that tests the fake. The app takes its site key and secret from config, and the test environment sets Google's documented reCAPTCHA v2 test keys:

| Key | Value |
|---|---|
| Site key | `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` |
| Secret key | `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe` |

With them the widget never shows a challenge and every server-side verification passes; it also renders a warning that it is not for production traffic, so a visual baseline must mask it. The checkbox lives in Google's cross-origin iframe, reached through a `FrameLocator` field ([iframes.md](../browser-apis/iframes.md)). The spec stays `.e2e.ts`: nothing is routed.

| Variant | Test setup |
|---|---|
| reCAPTCHA v2 checkbox or invisible | The test keys above |
| reCAPTCHA v3 (score) | Google's advice: a separate key for the test environment, not the test keys; its scores may be inaccurate because v3 relies on real traffic |
| Your own `/api/verify-captcha` returning a failure | Route that endpoint through the opening call's failure option; the spec becomes `.test.ts` |

## Anti-Patterns to Avoid

| Anti-Pattern              | Problem                        | Solution                |
| ------------------------- | ------------------------------ | ----------------------- |
| Using real OAuth in tests | Slow, needs credentials, flaky | Mock OAuth endpoints    |
| Real payment processing   | Charges real money, slow       | Use test mode or mock   |
| Waiting for real emails   | Very slow, unreliable          | Mock email API          |
| Not mocking analytics     | Pollutes analytics data        | Block or mock analytics |
| Solving or faking reCAPTCHA | Brittle, or tests a fake | Google's test site key in the test environment |

## Related References

- **Network Mocking**: See [network-advanced.md](network-advanced.md) for route patterns
- **Authentication**: See [authentication.md](authentication.md) for the `auth` feature the OAuth samples extend
