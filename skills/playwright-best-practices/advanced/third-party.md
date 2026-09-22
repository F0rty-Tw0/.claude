# Third-Party Service Mocking

## Table of Contents

1. [OAuth/SSO Mocking](#oauthsso-mocking)
2. [Payment Gateway Mocking](#payment-gateway-mocking)
3. [Email Verification](#email-verification)
4. [SMS Verification](#sms-verification)
5. [Analytics & Tracking](#analytics--tracking)

## OAuth/SSO Mocking

### Mock Google OAuth

An OAuth login needs three endpoints mocked: the provider callback, which redirects back into the app; the session endpoint, which the app polls after the redirect; and the current-user endpoint. Each is a factory in `test/mocks/`, so a spec installs them by name and never sees a status code. The provider is a parameter, so the same factories cover Google, GitHub, and Microsoft.

```ts
// e2e/login/common/login.type.ts
export type OAuthProvider = 'github' | 'google' | 'microsoft';

export type OAuthUser = {
  readonly avatar?: string;
  readonly email: string;
  readonly id: string;
  readonly name: string;
};
```

```ts
// e2e/login/test/mocks/oauth.mock.ts
import type { Route } from '@playwright/test';

import type { OAuthProvider, OAuthUser } from '../../common/login.type';

type RouteHandler = (route: Route) => Promise<void>;

export const oauthCallbackMock = (provider: OAuthProvider): RouteHandler => {
  const headers = { Location: `/auth/success?provider=${provider}` };

  return (route: Route): Promise<void> => route.fulfill({ headers, status: 302 });
};

export const oauthSessionMock = (provider: OAuthProvider, user: OAuthUser): RouteHandler => {
  const json = { authenticated: true, provider, user };

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

### OAuth Fixture

The fixture installs all three routes for one provider and one user. A spec calls `mockOAuth` in the `GIVEN` hook and then drives the real login button.

```ts
// e2e/login/login.fixture.ts
import { test as base } from '@playwright/test';

import type { OAuthProvider, OAuthUser } from './common/login.type';
import { LoginPage } from './pages/login.page';
import { currentUserMock, oauthCallbackMock, oauthSessionMock } from './test/mocks/oauth.mock';

type MockOAuth = (provider: OAuthProvider, user: OAuthUser) => Promise<void>;

type LoginFixtures = {
  readonly loginPage: LoginPage;
  readonly mockOAuth: MockOAuth;
};

export const test = base.extend<LoginFixtures>({
  loginPage: async ({ page }, use): Promise<void> => {
    await use(new LoginPage(page));
  },
  mockOAuth: async ({ page }, use): Promise<void> => {
    const mockOAuth = async (provider: OAuthProvider, user: OAuthUser): Promise<void> => {
      await page.route(`**/auth/${provider}/callback**`, oauthCallbackMock(provider));
      await page.route('**/api/auth/session', oauthSessionMock(provider, user));
      await page.route('**/api/me', currentUserMock(user));
    };

    await use(mockOAuth);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/login/pages/login.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

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

  public async goto(): Promise<void> {
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
    await test.step(`welcome banner names ${name}`, (): Promise<void> => expect(this.welcomeBanner).toContainText(`Welcome, ${name}`), { box: true });
  }
}
```

```ts
// e2e/login/login.test.ts
import { test } from './login.fixture';
import { OAUTH_USER_STUB } from './test/stubs/oauth.stub';

test.describe('FEATURE: login', () => {
  test.describe('GIVEN the GitHub provider is mocked', () => {
    test.beforeEach(async ({ mockOAuth }): Promise<void> => {
      await test.step('GIVEN the GitHub OAuth endpoints are mocked', (): Promise<void> => mockOAuth('github', OAUTH_USER_STUB));
    });

    test('SCENARIO: signing in with GitHub names the user in the welcome banner', async ({ loginPage }): Promise<void> => {
      await test.step('AND the login page is open', (): Promise<void> => loginPage.goto());

      await test.step('WHEN the user signs in with GitHub', (): Promise<void> => loginPage.signInWithGithub());

      await test.step('THEN the welcome banner names the user', (): Promise<void> => loginPage.expectWelcome(OAUTH_USER_STUB.name));
    });
  });
});
```

### Mock SAML SSO

SAML differs from OAuth in one place: the assertion consumer service (`/saml/acs`) sets the session cookie on the redirect. The session mock then reports `provider: 'saml'`.

```ts
// e2e/login/test/stubs/saml.stub.ts
import type { ResponseHeaders } from '../../common/login.type';

export const SAML_ACS_HEADERS_STUB: ResponseHeaders = {
  Location: '/dashboard',
  'Set-Cookie': 'session=mock-saml-session; Path=/; HttpOnly'
};
```

```ts
// e2e/login/test/mocks/saml.mock.ts
import type { Route } from '@playwright/test';

import type { OAuthSession, OAuthUser, ResponseHeaders } from '../../common/login.type';
import { OAUTH_USER_STUB, SAML_ACS_HEADERS_STUB } from '../stubs/saml.stub';

type RouteHandler = (route: Route) => Promise<void>;

export const samlAcsMock = (headers: ResponseHeaders = SAML_ACS_HEADERS_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ headers, status: 302 });
};

export const samlSessionMock = (user: OAuthUser = OAUTH_USER_STUB): RouteHandler => {
  const json: OAuthSession = { provider: 'saml', user };

  return (route: Route): Promise<void> => route.fulfill({ json });
};
```

The spec installs `samlAcsMock()` on `**/saml/acs` and `samlSessionMock(user)` on `**/api/session` through a `mockSaml` fixture shaped like `mockOAuth`, clicks `loginPage.signInWithSso()`, and asserts `expect(page).toHaveURL('/dashboard')` in a step.

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

import type { PaymentConfirmation, PaymentIntent } from '../../common/checkout.type';
import { PAYMENT_CONFIRMATION_STUB, PAYMENT_INTENT_STUB } from '../stubs/payment.stub';

type RouteHandler = (route: Route) => Promise<void>;

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

import type { PayPalCapture, PayPalOrder } from '../../common/checkout.type';
import { PAYPAL_CAPTURE_STUB, PAYPAL_ORDER_STUB } from '../stubs/paypal.stub';

type RouteHandler = (route: Route) => Promise<void>;
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

### Payment Fixture

`mockStripe` takes the failure flag, installs the init script and the backend routes, and is called in the `GIVEN` hook. Declined and succeeded cases differ only in the flag.

```ts
// e2e/checkout/checkout.fixture.ts
import { test as base } from '@playwright/test';

import type { AnalyticsCapture } from './common/checkout.type';
import { CheckoutPage } from './pages/checkout.page';
import { analyticsCaptureMock, analyticsSdkMock } from './test/mocks/analytics.mock';
import { confirmPaymentMock, paymentIntentMock } from './test/mocks/payment.mock';
import { stripeMock } from './test/mocks/stripe.mock';

type MockStripe = (shouldFail: boolean) => Promise<void>;

type CheckoutFixtures = {
  readonly analytics: AnalyticsCapture;
  readonly checkoutPage: CheckoutPage;
  readonly mockStripe: MockStripe;
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
  },
  mockStripe: async ({ page }, use): Promise<void> => {
    const mockStripe = async (shouldFail: boolean): Promise<void> => {
      await stripeMock(page, shouldFail);
      await page.route('**/api/create-payment-intent', paymentIntentMock());
      await page.route('**/api/confirm-payment', confirmPaymentMock());
    };

    await use(mockStripe);
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/checkout/checkout.test.ts
import { test } from './checkout.fixture';

test.describe('FEATURE: checkout', () => {
  test.describe('GIVEN Stripe declines the card', () => {
    test.beforeEach(async ({ mockStripe }): Promise<void> => {
      await test.step('GIVEN Stripe is mocked with a declined card', (): Promise<void> => mockStripe(true));
    });

    test('SCENARIO: paying shows the declined message', async ({ checkoutPage }): Promise<void> => {
      await test.step('AND the checkout is open', (): Promise<void> => checkoutPage.goto());

      await test.step('WHEN the user pays', (): Promise<void> => checkoutPage.pay());

      await test.step('THEN the status reads card declined', (): Promise<void> => checkoutPage.expectStatus('Card declined'));
    });
  });

  test.describe('GIVEN Stripe accepts the card', () => {
    test.beforeEach(async ({ mockStripe }): Promise<void> => {
      await test.step('GIVEN Stripe is mocked with a succeeding card', (): Promise<void> => mockStripe(false));
    });

    test('SCENARIO: paying shows the success message', async ({ checkoutPage }): Promise<void> => {
      await test.step('AND the checkout is open', (): Promise<void> => checkoutPage.goto());

      await test.step('WHEN the user pays', (): Promise<void> => checkoutPage.pay());

      await test.step('THEN the status reads payment successful', (): Promise<void> => checkoutPage.expectStatus('Payment successful'));
    });
  });
});
```

`CheckoutPage` holds `payButton` (`getByRole('button', { name: /^Pay/ })`) and `status` (`getByRole('status')`), with `pay()` and a boxed `expectStatus(text)`.

## Email Verification

### Mock Email API

The send endpoint never sends; it records a token. The verify endpoint compares the query-string token with the recorded one. Both handlers close over the same variable, so one factory returns both plus a `token()` reader the spec uses to build the link the email would have carried. The token varies per run, so it is generated; the three response bodies are fixed, so they are stubs the mock imports rather than parameters.

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

`VerificationMock` lives in `e2e/signup/common/signup.type.ts` as `{ readonly send: RouteHandler; readonly token: () => string; readonly verify: RouteHandler }`. A `verification` fixture creates it, routes `send` on `**/api/send-verification` and `verify` on `**/api/verify-email**`, and yields it.

```ts
// e2e/signup/signup.e2e.ts
import { test } from './signup.fixture';
import { SIGNUP_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup', () => {
  test('SCENARIO: opening the emailed link verifies the address', async ({ signupPage, verification, verifyPage }): Promise<void> => {
    await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());

    await test.step('AND the email address is submitted', (): Promise<void> => signupPage.submitEmail(SIGNUP_STUB.email));

    await test.step('AND the check-your-email notice is shown', (): Promise<void> => signupPage.expectCheckEmailNotice());

    const token = await test.step('AND the captured token is read', (): string => verification.token());

    await test.step('WHEN the verification link is opened', (): Promise<void> => verifyPage.goto(token));

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

A spec calls it in one step, `const link = await test.step('WHEN the verification link is fetched', (): Promise<string> => fetchVerificationLink(request, inbox))`, then opens the link with `page.goto(link)` inside the next step.

## SMS Verification

### Mock SMS API

Same shape as the email mock: the send handler generates a six-digit code, the verify handler compares `postDataJSON().code` with it, and a `code()` reader lets the spec type the code the phone would have received. The bodies live in `test/stubs/sms.stub.ts` with `SmsError`, `SmsSent`, and `SmsVerified` declared in `common/verify-phone.type.ts`.

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
// e2e/verify-phone/verify-phone.e2e.ts
import { test } from './verify-phone.fixture';
import { PHONE_STUB } from './test/stubs/phone.stub';

test.describe('FEATURE: phone verification', () => {
  test('SCENARIO: entering the received code verifies the phone', async ({ sms, verifyPhonePage }): Promise<void> => {
    await test.step('GIVEN the verify-phone page is open', (): Promise<void> => verifyPhonePage.goto());

    await test.step('AND a code is requested', (): Promise<void> => verifyPhonePage.requestCode(PHONE_STUB.number));

    const code = await test.step('AND the captured code is read', (): string => sms.code());

    await test.step('WHEN the code is submitted', (): Promise<void> => verifyPhonePage.submitCode(code));

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

type RouteHandler = (route: Route) => Promise<void>;

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

`AnalyticsEvent` is `{ readonly event: string; readonly props: Record<string, unknown> }` and `AnalyticsCapture` is `{ readonly events: AnalyticsEvent[]; readonly handler: RouteHandler }`, both in `common/checkout.type.ts`. An `analytics` fixture installs the SDK stub, routes `**/api/analytics/**` to the capture handler, and yields the capture.

```ts
// e2e/checkout/checkout-analytics.test.ts
import { expect, test } from './checkout.fixture';

test.describe('FEATURE: checkout analytics', () => {
  test('SCENARIO: completing the purchase tracks the purchase event', async ({ analytics, checkoutPage }): Promise<void> => {
    const props = expect.objectContaining({ amount: expect.any(Number) });
    const purchase = expect.objectContaining({ event: 'Purchase Completed', props });

    await test.step('GIVEN the checkout is open', (): Promise<void> => checkoutPage.goto());

    await test.step('WHEN the purchase completes', (): Promise<void> => checkoutPage.completePurchase());

    await test.step('THEN the purchase event was tracked with an amount', (): void => expect(analytics.events).toContainEqual(purchase));
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern              | Problem                        | Solution                |
| ------------------------- | ------------------------------ | ----------------------- |
| Using real OAuth in tests | Slow, needs credentials, flaky | Mock OAuth endpoints    |
| Real payment processing   | Charges real money, slow       | Use test mode or mock   |
| Waiting for real emails   | Very slow, unreliable          | Mock email API          |
| Not mocking analytics     | Pollutes analytics data        | Block or mock analytics |

## Related References

- **Network Mocking**: See [network-advanced.md](network-advanced.md) for route patterns
- **Authentication**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for auth patterns
