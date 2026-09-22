# Form Testing Patterns

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Patterns](#patterns)
3. [Decision Guide](#decision-guide)
4. [Anti-Patterns](#anti-patterns)
5. [Troubleshooting](#troubleshooting)

> **When to use**: Testing form filling, submission, validation messages, multi-step wizards, dynamic fields, and auto-complete interactions.

## Quick Reference

Every call below lives in a page-object method. Specs never touch `page.getBy*`.

| Control | Page-object call |
|---|---|
| Text input | `this.username.fill('john_doe')` |
| Select by value | `this.region.selectOption('EU')` |
| Select by label | `this.region.selectOption({ label: 'Europe' })` |
| Checkbox | `this.subscribe.check()` |
| Radio | `this.priorityShipping.check()` |
| Date input | `this.departure.fill('2025-08-20')` |
| Clear a field | `this.username.clear()` |
| Submit | `this.registerButton.click()` |
| Validation error | `expect(this.page.getByText('Username is required')).toBeVisible()` inside a boxed `expect*` method |

## Patterns

### Auto-Complete and Typeahead Fields

**Use when**: Testing search fields, address lookups, mention pickers, or any input that shows suggestions as the user types.

`pressSequentially` fires a keystroke per character so the suggestion list reacts. `fill` sets the value in one event and skips the typeahead.

```ts
// e2e/product-search/pages/product-search.page.ts
import type { Locator, Page } from '@playwright/test';

export class ProductSearchPage {
  public readonly searchBox: Locator;
  public readonly suggestionList: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.searchBox = page.getByRole('combobox', { name: 'Find product' });
    this.suggestionList = page.getByRole('listbox');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/products');
  }

  public async typeQuery(text: string): Promise<void> {
    await this.searchBox.pressSequentially(text, { delay: 100 });
  }

  public async pickSuggestion(name: string): Promise<void> {
    await this.suggestionList.getByRole('option', { name }).click();
  }
}
```

```ts
// e2e/product-search/product-search.spec.ts
import { expect, test } from './product-search.fixture';

test.describe('FEATURE: product typeahead', () => {
  test.describe('GIVEN the products page', () => {
    test.beforeEach(async ({ productSearchPage }): Promise<void> => {
      await test.step('GIVEN the products page is open', (): Promise<void> => productSearchPage.goto());
    });

    test('picking a suggestion fills the search box with its value', async ({ productSearchPage }): Promise<void> => {
      await test.step('WHEN a partial query is typed', (): Promise<void> => productSearchPage.typeQuery('lapt'));

      await test.step('THEN the suggestion list opens', (): Promise<void> => expect(productSearchPage.suggestionList).toBeVisible());

      await test.step('WHEN Laptop Pro is picked', (): Promise<void> => productSearchPage.pickSuggestion('Laptop Pro'));

      await test.step('THEN the search box holds Laptop Pro', (): Promise<void> => expect(productSearchPage.searchBox).toHaveValue('Laptop Pro'));
    });
  });
});
```

| Variant | Page-object method body |
|---|---|
| API-driven suggestions (address lookup) | Register `this.page.waitForResponse('**/api/address-lookup*')` before `pressSequentially('456 Elm', { delay: 50 })`, await it, then click `getByRole('option', { name: /456 Elm St/ })`. The spec asserts `Town`, `State`, `Postal code` values with `toHaveValue`. |
| Dismiss suggestions, keep custom value | `pressSequentially('my-label')`, then `press('Escape')`; spec asserts the listbox is hidden, then `press('Enter')` and the label text is visible. |

### Dynamic Forms — Conditional Fields

**Use when**: Form fields appear, disappear, or change based on the value of other fields.

`expectBusinessFieldsVisible` and `expectBusinessFieldsHidden` are boxed steps that group the two related assertions. `BusinessDetails` is a named type in `common/loan.type.ts`.

```ts
// e2e/loan/pages/loan-application.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { BusinessDetails } from '../common/loan.type';

export class LoanApplicationPage {
  public readonly applicantType: Locator;
  public readonly businessName: Locator;
  public readonly ein: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.applicantType = page.getByLabel('Applicant type');
    this.businessName = page.getByLabel('Business name');
    this.ein = page.getByLabel('EIN');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/loan/apply');
  }

  public async chooseApplicantType(value: string): Promise<void> {
    await this.applicantType.selectOption(value);
  }

  public async fillBusiness(details: BusinessDetails): Promise<void> {
    await this.businessName.fill(details.name);
    await this.ein.fill(details.ein);
  }

  public async expectBusinessFieldsVisible(): Promise<void> {
    await test.step('business fields are visible', async (): Promise<void> => {
      await expect(this.businessName).toBeVisible();
      await expect(this.ein).toBeVisible();
    }, { box: true });
  }

  public async expectBusinessFieldsHidden(): Promise<void> {
    await test.step('business fields are hidden', async (): Promise<void> => {
      await expect(this.businessName).not.toBeVisible();
      await expect(this.ein).not.toBeVisible();
    }, { box: true });
  }
}
```

```ts
// e2e/loan/loan-application.spec.ts
import { expect, test } from './loan.fixture';
import { BUSINESS_STUB } from './test/stubs/loan.stub';

test.describe('FEATURE: loan application', () => {
  test.describe('GIVEN the application form', () => {
    test.beforeEach(async ({ loanApplicationPage }): Promise<void> => {
      await test.step('GIVEN the application form is open', (): Promise<void> => loanApplicationPage.goto());
    });

    test('choosing corporate shows the business fields', async ({ loanApplicationPage }): Promise<void> => {
      await test.step('WHEN corporate is chosen', (): Promise<void> => loanApplicationPage.chooseApplicantType('corporate'));

      await test.step('THEN the business fields are visible', (): Promise<void> => loanApplicationPage.expectBusinessFieldsVisible());
    });

    test('switching back to individual hides the business fields', async ({ loanApplicationPage }): Promise<void> => {
      await test.step('GIVEN corporate is chosen', (): Promise<void> => loanApplicationPage.chooseApplicantType('corporate'));

      await test.step('AND the business details are filled', (): Promise<void> => loanApplicationPage.fillBusiness(BUSINESS_STUB));

      await test.step('WHEN individual is chosen', (): Promise<void> => loanApplicationPage.chooseApplicantType('individual'));

      await test.step('THEN the business fields are hidden', (): Promise<void> => loanApplicationPage.expectBusinessFieldsHidden());
    });
  });
});
```

| Variant | Page-object method body |
|---|---|
| Checkbox toggles a section | `this.separateInvoice.check()`; the section is `page.getByRole('group', { name: 'Invoice address' })`; fill `section.getByLabel('Address')` and `City`; `uncheck()` hides the group. |
| Dependent dropdown chain | After `this.country.selectOption('CA')`, assert `expect(this.province.getByRole('option')).not.toHaveCount(0)` in a boxed step before `this.province.selectOption('ON')`; repeat for `City` with `selectOption({ label: 'Toronto' })`. |

### Multi-Step Forms and Wizards

**Use when**: The form spans multiple pages or steps, with next/previous navigation and per-step validation.

Each wizard step is a page-object method that fills the fields and clicks Next. The spec reads as one step per wizard page. `Guest` and `Room` are named types in `common/booking.type.ts`; `GUEST_STUB` and `ROOM_STUB` in `test/stubs/booking.stub.ts`.

```ts
// e2e/booking/pages/booking-wizard.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { Guest, Room } from '../common/booking.type';

export class BookingWizardPage {
  public readonly confirmButton: Locator;
  public readonly email: Locator;
  public readonly fullName: Locator;
  public readonly nextButton: Locator;
  public readonly previousButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.confirmButton = page.getByRole('button', { name: 'Confirm booking' });
    this.email = page.getByLabel('Email');
    this.fullName = page.getByLabel('Full name');
    this.nextButton = page.getByRole('button', { name: 'Next' });
    this.previousButton = page.getByRole('button', { name: 'Previous' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/booking');
  }

  public async fillGuestInfo(guest: Guest): Promise<void> {
    await this.fullName.fill(guest.fullName);
    await this.email.fill(guest.email);
    await this.page.getByLabel('Phone').fill(guest.phone);
    await this.nextButton.click();
  }

  public async selectRoom(room: Room): Promise<void> {
    await this.page.getByLabel('Room type').selectOption(room.type);
    await this.page.getByLabel('Check-in').fill(room.checkIn);
    await this.page.getByLabel('Check-out').fill(room.checkOut);
    await this.nextButton.click();
  }

  public async expectStep(heading: string): Promise<void> {
    await test.step(`wizard shows ${heading}`, (): Promise<void> => expect(this.page.getByRole('heading', { name: heading })).toBeVisible(), { box: true });
  }

  public async expectSummary(guest: Guest, room: Room): Promise<void> {
    await test.step('summary repeats the entries', async (): Promise<void> => {
      await expect(this.page.getByText(guest.fullName)).toBeVisible();
      await expect(this.page.getByText(room.type)).toBeVisible();
    }, { box: true });
  }
}
```

```ts
// e2e/booking/booking-wizard.spec.ts
import { expect, test } from './booking.fixture';
import { GUEST_STUB, ROOM_STUB } from './test/stubs/booking.stub';

test.describe('FEATURE: booking wizard', () => {
  test.describe('GIVEN the booking wizard', () => {
    test.beforeEach(async ({ bookingWizardPage }): Promise<void> => {
      await test.step('GIVEN the wizard is open', (): Promise<void> => bookingWizardPage.goto());

      await test.step('AND the wizard shows Guest Info', (): Promise<void> => bookingWizardPage.expectStep('Guest Info'));
    });

    test('completing every step confirms the booking', async ({ bookingWizardPage }): Promise<void> => {
      await test.step('WHEN guest information is entered', (): Promise<void> => bookingWizardPage.fillGuestInfo(GUEST_STUB));

      await test.step('THEN the wizard shows Room Selection', (): Promise<void> => bookingWizardPage.expectStep('Room Selection'));

      await test.step('WHEN room options are selected', (): Promise<void> => bookingWizardPage.selectRoom(ROOM_STUB));

      await test.step('THEN the wizard shows Confirmation', (): Promise<void> => bookingWizardPage.expectStep('Confirmation'));

      await test.step('AND the summary repeats the entries', (): Promise<void> => bookingWizardPage.expectSummary(GUEST_STUB, ROOM_STUB));

      await test.step('WHEN the booking is confirmed', (): Promise<void> => bookingWizardPage.confirmButton.click());

      await test.step('THEN the wizard shows Booking complete', (): Promise<void> => bookingWizardPage.expectStep('Booking complete'));
    });

    test('clicking Next on an empty step stays and reports the gap', async ({ bookingWizardPage }): Promise<void> => {
      await test.step('WHEN Next is clicked with nothing filled', (): Promise<void> => bookingWizardPage.nextButton.click());

      await test.step('THEN the wizard still shows Guest Info', (): Promise<void> => bookingWizardPage.expectStep('Guest Info'));

      await test.step('AND the full name is reported missing', (): Promise<void> => expect(bookingWizardPage.fullName).toHaveAccessibleDescription(/required/i));
    });

    test('going back keeps the entries', async ({ bookingWizardPage }): Promise<void> => {
      await test.step('GIVEN guest information is entered', (): Promise<void> => bookingWizardPage.fillGuestInfo(GUEST_STUB));

      await test.step('WHEN the user goes back one step', (): Promise<void> => bookingWizardPage.previousButton.click());

      await test.step('THEN the full name is still filled', (): Promise<void> => expect(bookingWizardPage.fullName).toHaveValue(GUEST_STUB.fullName));

      await test.step('AND the email is still filled', (): Promise<void> => expect(bookingWizardPage.email).toHaveValue(GUEST_STUB.email));
    });
  });
});
```

When the error is plain text rather than an accessible description, assert it with `expect(page.getByText('Full name is required')).toBeVisible()` inside a boxed page-object method.

### Form Submission and Response Handling

**Use when**: Testing what happens after a form is submitted — success messages, redirects, error responses from the server, and loading states during submission.

`submit()` registers `waitForResponse` before the click and returns the `Response`. The submit button's name is matched with `/Submit feedback|Submitting/` so the same locator resolves in both states. `Feedback` is a named type in `common/feedback.type.ts`.

```ts
// e2e/feedback/pages/feedback.page.ts
import type { Locator, Page, Response } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { Feedback } from '../common/feedback.type';

export class FeedbackPage {
  public readonly details: Locator;
  public readonly email: Locator;
  public readonly subject: Locator;
  public readonly submitButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.details = page.getByLabel('Details');
    this.email = page.getByLabel('Email');
    this.subject = page.getByLabel('Subject');
    this.submitButton = page.getByRole('button', { name: /Submit feedback|Submitting/ });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/feedback');
  }

  public async fill(feedback: Feedback): Promise<void> {
    await this.subject.fill(feedback.subject);
    await this.email.fill(feedback.email);
    await this.details.fill(feedback.details);
  }

  public async submit(): Promise<Response> {
    const responsePromise = this.page.waitForResponse('**/api/feedback');

    await this.submitButton.click();

    return responsePromise;
  }

  public async expectSubmitting(): Promise<void> {
    await test.step('submit button shows Submitting and is disabled', async (): Promise<void> => {
      await expect(this.submitButton).toHaveText(/Submitting/);
      await expect(this.submitButton).toBeDisabled();
    }, { box: true });
  }

  public async expectReady(): Promise<void> {
    await test.step('submit button is enabled again', async (): Promise<void> => {
      await expect(this.submitButton).toHaveText('Submit feedback');
      await expect(this.submitButton).toBeEnabled();
    }, { box: true });
  }
}
```

```ts
// e2e/feedback/feedback.spec.ts
import type { Response } from '@playwright/test';

import { expect, test } from './feedback.fixture';
import { FEEDBACK_STUB } from './test/stubs/feedback.stub';

test.describe('FEATURE: feedback form', () => {
  test.describe('GIVEN a filled feedback form', () => {
    test.beforeEach(async ({ feedbackPage }): Promise<void> => {
      await test.step('GIVEN the feedback form is open', (): Promise<void> => feedbackPage.goto());

      await test.step('AND the form is filled', (): Promise<void> => feedbackPage.fill(FEEDBACK_STUB));
    });

    test('submitting the form is accepted and shows a confirmation', async ({ feedbackPage, page }): Promise<void> => {
      const response = await test.step('WHEN the form is submitted', (): Promise<Response> => feedbackPage.submit());

      await test.step('THEN the server responds 200', (): void => expect(response.status()).toBe(200));

      await test.step('AND the confirmation is shown', (): Promise<void> => expect(page.getByText('Feedback received')).toBeVisible());
    });

    test('submitting the form shows the in-flight button state', async ({ feedbackPage }): Promise<void> => {
      await test.step('WHEN submit is clicked', (): Promise<void> => feedbackPage.submitButton.click());

      await test.step('THEN the button shows Submitting', (): Promise<void> => feedbackPage.expectSubmitting());

      await test.step('AND the button is ready again', (): Promise<void> => feedbackPage.expectReady());
    });
  });
});
```

| Variant | Spec step |
|---|---|
| Server-side validation error | Submit a signup with an existing email; boxed `expectError('Email address already registered')`. |
| Redirect after success | Submit login; `expect(page).toHaveURL('/home')` then `expectHeading('Welcome')`. Web-first `toHaveURL` replaces `page.waitForURL`. |

### Filling Basic Form Fields

**Use when**: Testing any form with standard HTML inputs — text, email, password, number, textarea, select, checkbox, radio.

One `fill()` method takes a typed `SignupForm` and drives every control. `{ exact: true }` on `Password` stops it matching `Confirm password`. Multi-select takes an array.

```ts
// e2e/signup/common/signup.type.ts
export type SignupForm = {
  readonly about: string;
  readonly annualBilling: boolean;
  readonly city: string;
  readonly confirmPassword: string;
  readonly country: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
  readonly skills: string[];
  readonly yearsOfExperience: string;
};
```

```ts
// e2e/signup/pages/signup.page.ts
import type { Locator, Page } from '@playwright/test';

import type { SignupForm } from '../common/signup.type';

export class SignupPage {
  public readonly acceptTerms: Locator;
  public readonly annualBilling: Locator;
  public readonly createAccountButton: Locator;
  public readonly email: Locator;
  public readonly emailError: Locator;
  public readonly password: Locator;
  public readonly welcomeHeading: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.acceptTerms = page.getByLabel('Accept terms');
    this.annualBilling = page.getByLabel('Annual billing');
    this.createAccountButton = page.getByRole('button', { name: 'Create account' });
    this.email = page.getByLabel('Email');
    this.emailError = page.getByText('Enter a valid email address');
    this.password = page.getByLabel('Password', { exact: true });
    this.welcomeHeading = page.getByRole('heading', { name: 'Welcome' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/signup');
  }

  public async fill(form: SignupForm): Promise<void> {
    await this.page.getByLabel('First name').fill(form.firstName);
    await this.page.getByLabel('Last name').fill(form.lastName);
    await this.email.fill(form.email);
    await this.password.fill(form.password);
    await this.page.getByLabel('Confirm password').fill(form.confirmPassword);
    await this.page.getByLabel('About you').fill(form.about);
    await this.page.getByLabel('Years of experience').fill(form.yearsOfExperience);
    await this.page.getByLabel('Country').selectOption(form.country);
    await this.page.getByLabel('City').selectOption({ label: form.city });
    await this.page.getByLabel('Skills').selectOption(form.skills);
    await this.acceptTerms.check();
    await this.annualBilling.setChecked(form.annualBilling);
  }

  public async fillEmail(email: string): Promise<void> {
    await this.email.fill(email);
    await this.email.blur();
  }

  public async submit(): Promise<void> {
    await this.createAccountButton.click();
  }
}
```

```ts
// e2e/signup/signup.spec.ts
import { expect, test } from './signup.fixture';
import { SIGNUP_STUB } from './test/stubs/signup.stub';

test.describe('FEATURE: signup form', () => {
  test.describe('GIVEN the signup page', () => {
    test.beforeEach(async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());
    });

    test('filling every field and submitting opens the welcome page', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN the form is filled', (): Promise<void> => signupPage.fill(SIGNUP_STUB));

      await test.step('THEN the terms are accepted', (): Promise<void> => expect(signupPage.acceptTerms).toBeChecked());

      await test.step('AND annual billing is selected', (): Promise<void> => expect(signupPage.annualBilling).toBeChecked());

      await test.step('WHEN the form is submitted', (): Promise<void> => signupPage.submit());

      await test.step('THEN the welcome heading is shown', (): Promise<void> => expect(signupPage.welcomeHeading).toBeVisible());
    });
  });
});
```

### Date and Time Inputs

**Use when**: Testing native `<input type="date">`, `<input type="time">`, `<input type="datetime-local">`, or third-party date pickers.

Native inputs take ISO strings through `fill()`. A third-party picker is driven through its own controls.

`ReservationPage` owns `eventDate`, `reminder`, `reservationDate` and `timeSlot`, each a `getByLabel` locator, plus `goto()`. `fillNativeInputs(date, time, reminder)` fills the three native inputs. `pickEventDateNextMonth(day)` clicks `eventDate`, then `getByRole('button', { name: 'Next month' })`, then `getByRole('gridcell', { name: day })`.

```ts
// e2e/reservation/reservation.spec.ts
import { expect, test } from './reservation.fixture';

test.describe('FEATURE: reservation dates', () => {
  test.describe('GIVEN the reservation form', () => {
    test.beforeEach(async ({ reservationPage }): Promise<void> => {
      await test.step('GIVEN the reservation form is open', (): Promise<void> => reservationPage.goto());
    });

    test('filling native inputs stores the ISO date value', async ({ reservationPage }): Promise<void> => {
      await test.step('WHEN date, time and reminder are filled', (): Promise<void> => reservationPage.fillNativeInputs('2025-07-10', '18:00', '2025-07-10T17:30'));

      await test.step('THEN the reservation date holds 2025-07-10', (): Promise<void> => expect(reservationPage.reservationDate).toHaveValue('2025-07-10'));
    });

    test('picking a day in the calendar fills the input with the date', async ({ reservationPage }): Promise<void> => {
      await test.step('WHEN the 25th of next month is picked', (): Promise<void> => reservationPage.pickEventDateNextMonth('25'));

      await test.step('THEN the event date holds a 2025 date', (): Promise<void> => expect(reservationPage.eventDate).toHaveValue(/2025/));
    });
  });
});
```

### Required Field Validation

**Use when**: Testing that the form shows appropriate error messages when required fields are empty.

`emailValidationMessage()` reads the native HTML5 constraint message through `evaluate` with a typed element parameter, so no cast is needed.

`InquiryPage` owns `email`, `name`, `nameError` (`getByText('Name is required')`) and `sendButton`, plus `goto()` and `send()`. `fillNameAndLeave(name)` fills the name and calls `this.email.focus()`. `emailValidationMessage(): Promise<string>` returns `this.email.evaluate((element: HTMLInputElement): string => element.validationMessage)`. Boxed `expectRequiredErrors()` asserts `nameError`, `Email is required` and `Question is required` are visible.

```ts
// e2e/inquiry/inquiry.spec.ts
import { expect, test } from './inquiry.fixture';

test.describe('FEATURE: inquiry validation', () => {
  test.describe('GIVEN an empty inquiry form', () => {
    test.beforeEach(async ({ inquiryPage }): Promise<void> => {
      await test.step('GIVEN the inquiry form is open', (): Promise<void> => inquiryPage.goto());
    });

    test('sending the empty form reports every required field and stays', async ({ inquiryPage, page }): Promise<void> => {
      await test.step('WHEN the empty form is sent', (): Promise<void> => inquiryPage.send());

      await test.step('THEN the required errors are shown', (): Promise<void> => inquiryPage.expectRequiredErrors());

      await test.step('AND the url is still /inquiry', (): Promise<void> => expect(page).toHaveURL(/\/inquiry/));
    });

    test('filling a reported field clears its error', async ({ inquiryPage }): Promise<void> => {
      await test.step('GIVEN the empty form is sent', (): Promise<void> => inquiryPage.send());

      await test.step('WHEN the name is filled and left', (): Promise<void> => inquiryPage.fillNameAndLeave('Carol Brown'));

      await test.step('THEN the name error is gone', (): Promise<void> => expect(inquiryPage.nameError).not.toBeVisible());
    });

    test('sending the empty form sets the native constraint message', async ({ inquiryPage }): Promise<void> => {
      await test.step('WHEN the empty form is sent', (): Promise<void> => inquiryPage.send());

      const message = await test.step('AND the email validation message is read', (): Promise<string> => inquiryPage.emailValidationMessage());

      await test.step('THEN the message is non-empty', (): void => expect(message).toBeTruthy());
    });
  });
});
```

### Format Validation and Custom Rules

**Use when**: Testing email format, phone number format, password strength, and business-specific validation rules.

Validation runs on `blur`, so `fillEmail()` on `SignupPage` fills and blurs. One test per invalid value keeps the failing case named; the loop sits outside the `test` body.

```ts
// e2e/signup/email-format.spec.ts
import { expect, test } from './signup.fixture';

const INVALID_EMAILS: string[] = ['invalid', 'missing@', '@nodomain.com', 'has spaces@mail.com'];

test.describe('FEATURE: signup email format', () => {
  test.describe('GIVEN the signup page', () => {
    test.beforeEach(async ({ signupPage }): Promise<void> => {
      await test.step('GIVEN the signup page is open', (): Promise<void> => signupPage.goto());
    });

    for (const email of INVALID_EMAILS) {
      test(`entering "${email}" shows the format error`, async ({ signupPage }): Promise<void> => {
        await test.step('WHEN the email is entered and blurred', (): Promise<void> => signupPage.fillEmail(email));

        await test.step('THEN the format error is shown', (): Promise<void> => expect(signupPage.emailError).toBeVisible());
      });
    }

    test('entering a valid email shows no format error', async ({ signupPage }): Promise<void> => {
      await test.step('WHEN a valid email is entered and blurred', (): Promise<void> => signupPage.fillEmail('correct@domain.com'));

      await test.step('THEN the format error is absent', (): Promise<void> => expect(signupPage.emailError).not.toBeVisible());
    });
  });
});
```

The same fill-blur-assert shape covers other rules. Each row is one test.

| Field | Input | Expected message |
|---|---|---|
| Password | `Xy1!` | `Minimum 8 characters` |
| Password | `lowercase1!` | `Include an uppercase letter` |
| Password | `SecureP@ss1` | neither `/Minimum\|Include/` visible |
| Amount | `5` | `Minimum transfer is $10` |
| Amount | `1000000` | `Maximum transfer is $100,000` |
| Amount | `500` | neither `/Minimum\|Maximum/` visible |

### Form Reset Testing

**Use when**: Testing "clear form" or "reset" functionality, verifying that fields return to their default values.

`PreferencesPage` owns `emailAlerts`, `language`, `nickname` and `resetButton`, plus `goto()`. `changeEverything()` fills the nickname, `selectOption('es')` on language and `uncheck()` on email alerts. `reset()` clicks Reset. Boxed `expectDefaults()` asserts `toHaveValue('')`, `toHaveValue('en')` and `toBeChecked()` in one step.

```ts
// e2e/preferences/preferences.spec.ts
import { test } from './preferences.fixture';

test.describe('FEATURE: preferences reset', () => {
  test.describe('GIVEN changed preferences', () => {
    test.beforeEach(async ({ preferencesPage }): Promise<void> => {
      await test.step('GIVEN the preferences page is open', (): Promise<void> => preferencesPage.goto());

      await test.step('AND every field is changed', (): Promise<void> => preferencesPage.changeEverything());
    });

    test('clicking Reset returns every field to its default', async ({ preferencesPage }): Promise<void> => {
      await test.step('WHEN Reset is clicked', (): Promise<void> => preferencesPage.reset());

      await test.step('THEN the fields hold their defaults', (): Promise<void> => preferencesPage.expectDefaults());
    });
  });
});
```

A reset guarded by a confirm dialog registers the handler before the click, inside the page-object method: `DocumentPage.clearChangesAndAccept()` runs `this.page.once('dialog', (dialog): Promise<void> => dialog.accept())` and then clicks `clearChangesButton`. The spec fills `title`, calls `clearChangesAndAccept()`, then asserts `expect(documentPage.title).toHaveValue('')`.

## Decision Guide

| Scenario | Approach | Key API |
|---|---|---|
| Standard text input | `fill()` (clears, then types) | `this.field.fill('value')` |
| Need keystroke events (autocomplete) | `pressSequentially()` with delay | `this.field.pressSequentially('text', { delay: 100 })` |
| Native `<select>` dropdown | `selectOption()` by value or label | `this.select.selectOption('US')` or `{ label: 'United States' }` |
| Custom dropdown (ARIA listbox) | Click trigger, then select option role | `this.page.getByRole('option', { name: '...' }).click()` |
| Checkbox | `check()` / `uncheck()` (idempotent) | `this.box.check()` — safe to call even if already checked |
| Radio button | `check()` on the target radio | `this.option.check()` |
| Date input (native) | `fill()` with ISO format | `this.date.fill('2025-03-15')` |
| Date picker (third-party) | Click to open, navigate, select day | `this.page.getByRole('gridcell', { name: '15' }).click()` |
| Validation errors | Submit, then assert error text | boxed `expectRequiredErrors()` |
| Multi-step wizard | One page-object method per wizard step, `expectStep(heading)` between | `test.step('enter guest information', (): Promise<void> => wizard.fillGuestInfo(GUEST_STUB))` |
| Conditional/dynamic fields | Change trigger field, assert new field visibility | `expect(locator).toBeVisible()` / `.not.toBeVisible()` |
| Form submission | `waitForResponse` registered before the click, inside `submit()` | `submit(): Promise<Response>` |
| Auto-complete | `pressSequentially()`, wait for listbox, select option | `pickSuggestion(name)` |
| Form reset | Click reset, assert default values | boxed `expectDefaults()` |

## Anti-Patterns

| Avoid | Problem | Prefer |
|---|---|---|
| `await this.field.type('value')` | `type()` appends to existing content; does not clear first | `await this.field.fill('value')` |
| `await this.option.click()` on a checkbox | `click()` toggles — if already checked, it unchecks | `await this.option.check()` |
| `await page.fill('#email', 'test@test.com')` | CSS selector is fragile | `page.getByLabel('Email')` assigned to a page-object field |
| `await page.selectOption('select', 'US')` without label | Targets first `<select>` on page; ambiguous | `page.getByLabel('Country')` field, then `selectOption('US')` |
| Testing every invalid input in one test | Test becomes huge, slow, and hard to debug | One test per value; loop outside the `test` body |
| `expect(await input.inputValue()).toBe('value')` | Resolves once — no retry. Race condition. | `await expect(input).toHaveValue('value')` |
| Filling fields with `page.evaluate()` | Bypasses event handlers (no `input`, `change` events fire) | `fill()` or `pressSequentially()` |
| Not waiting for conditional fields before filling | `fill()` fails on hidden/detached elements | `await expect(field).toBeVisible()` first |
| Hardcoding wait after selecting a dropdown | `waitForTimeout(500)` is flaky and slow | Wait for the dependent element with `expect(...).toBeVisible()` |
| Skipping server-side validation tests | Client-side validation can be bypassed | Test both client-side UX and server response |
| `page.getByLabel(...)` inside a spec | Spec knows the DOM | Locator on the page object, method for the action |

## Troubleshooting

### `fill()` does nothing or clears but doesn't type

**Cause**: The input is a `contenteditable` element (rich text editor), not a real `<input>` or `<textarea>`. Click it, then type with `pressSequentially`.

`EditorPage.type(text)` clicks `editor` (`getByTestId('editor')`) and then calls `this.editor.pressSequentially(text)`.

### Date picker does not accept `fill()` value

**Cause**: Third-party date pickers render custom UI over a hidden input. `fill()` sets the hidden input but the UI does not update.

Drive the picker through its controls as `pickEventDateNextMonth()` does above. If the library reads the input on `change`, a page-object method may `fill('2025-06-15')` and then `dispatchEvent('change')` on the same locator.

### `selectOption()` throws "not a select element"

**Cause**: The dropdown is a custom component (ARIA listbox), not a native `<select>`. Click the combobox, then click the option.

`CheckoutPage.selectCountry(name)` clicks `countryCombobox` (`getByRole('combobox', { name: 'Country' })`) and then `this.page.getByRole('option', { name }).click()`.

### Validation errors do not appear after `fill()` and submit

**Cause**: Validation triggers on `blur`, and `fill()` does not blur. `fillEmail()` on `SignupPage` fills then calls `blur()`; focusing the next field with `focus()` works too, as `fillNameAndLeave()` on `InquiryPage` shows.
