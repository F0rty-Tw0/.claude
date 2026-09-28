# Multi-User & Collaboration Testing

## Table of Contents

1. [Multiple Browser Contexts](#multiple-browser-contexts)
2. [Real-Time Collaboration](#real-time-collaboration)
3. [Role-Based Testing](#role-based-testing)
4. [Concurrent Actions](#concurrent-actions)
5. [Chat & Messaging](#chat--messaging)
6. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
7. [Related References](#related-references)

Every user is a separate browser context, opened through the `openUser` fixture below and closed by it. Saved sessions come from the `setup` project in [authentication.md](authentication.md): `AUTH_DIR/<role>.json` for `Role = 'admin' | 'guest' | 'member'`. `openUser` hands over a page object built on that user's own `Page`; `RecordPage` is shown in full, the rest are listed.

| Page object | File | Members used in this file |
|---|---|---|
| `DocumentPage` | `e2e/collaboration/pages/document.page.ts` | `goto(id)`, `fillContent(text)` (label "Content"), `expectText(text)` |
| `SupportPage` | `e2e/collaboration/pages/support.page.ts` | `goto()`, `submit(message)` (label "Message", "Submit"), `expectReply(text)` |
| `TicketsPage` | `e2e/collaboration/pages/tickets.page.ts` | `goto()`, `expectTicket(text)`, `reply(text)` ("Reply", label "Response", "Send") |
| `EditorPage` | `e2e/collaboration/pages/editor.page.ts` | `goto()`, `typeAtStart(text)`, `typeAtEnd(text)` (click textbox, `Home`/`End`, `pressSequentially`), `expectContains(text)` |
| `WhiteboardPage` | `e2e/collaboration/pages/whiteboard.page.ts` | `goto(id, { identity })` (routes `**/api/me` to `meMock(identity)` before it navigates), `moveCursor(x, y)`, `expectCursor(identity)` (test id `cursor-<id>` plus name) |
| `DocumentAccessPage` | `e2e/documents/pages/document-access.page.ts` | `goto(id)`, `expectContentVisible(visible)`, `expectEditEnabled(enabled)`, `expectDeleteVisible(visible)` |
| `AdminUsersPage` | `e2e/admin/pages/admin-users.page.ts` | `goto()`, `expectRedirected()` (url is not `/admin/users`), `expectAccessDenied()` |
| `ItemPage` | `e2e/collaboration/pages/item.page.ts` | `conflictMessage`, `goto(id)`, `edit()`, `fillName(text)`, `save()` |
| `RecordPage` | `e2e/collaboration/pages/record.page.ts` | shown below |
| `ChatPage` | `e2e/collaboration/pages/chat.page.ts` | `goto(room, { identity })` (routes `**/api/me` to `meMock(identity)` before it navigates), `send(text)`, `expectMessage(text)` |

## Multiple Browser Contexts

### Multi-User Fixture

`openUser(PageObject, storageState?)` opens a fresh context, optionally from a saved session file, and hands over a page object built on its page. Nothing is visible yet, so it is not a step: the test calls it above its first step, like case data, and the page object's `goto` is the `WHEN`. The fixture closes every context it opened after the test.

```ts
// e2e/collaboration/collaboration.fixture.ts
import type { BrowserContext, Page } from '@playwright/test';
import { test as base } from '@playwright/test';

type PageObjectClass<T> = new (page: Page) => T;

type OpenUser = <T>(PageObject: PageObjectClass<T>, storageState?: string) => Promise<T>;

type CollaborationFixtures = {
  readonly openUser: OpenUser;
};

export const test = base.extend<CollaborationFixtures>({
  openUser: async ({ browser }, use): Promise<void> => {
    const contexts: BrowserContext[] = [];
    const openUser: OpenUser = async <T>(PageObject: PageObjectClass<T>, storageState?: string): Promise<T> => {
      const context = await browser.newContext({ storageState });

      contexts.push(context);

      return new PageObject(await context.newPage());
    };

    await use(openUser);

    for (const context of contexts) {
      await context.close();
    }
  }
});

export { expect } from '@playwright/test';
```

Three users are three `openUser` calls; nothing else changes. The first user opening the page is the `WHEN`; every further user opening it is an `AND`.

### Two Users in Same Test

```ts
// e2e/collaboration/shared-document.e2e.ts
import { test } from './collaboration.fixture';
import { DocumentPage } from './pages/document.page';

test.describe('FEATURE: shared document', () => {
  test('GIVEN two users on one document, text typed by one is seen by the other', async ({ openUser }): Promise<void> => {
    const documentA = await openUser(DocumentPage);
    const documentB = await openUser(DocumentPage);

    await test.step('WHEN user A opens the document', (): Promise<void> => documentA.goto('shared-123'));

    await test.step('AND user B opens the document', (): Promise<void> => documentB.goto('shared-123'));

    await test.step('AND user A types', (): Promise<void> => documentA.fillContent('Hello from User A'));

    await test.step('THEN user B sees the text', (): Promise<void> => documentB.expectText('Hello from User A'));
  });
});
```

### Multiple Users with Auth States

Each user starts from a different saved session, so the admin sees the admin UI and the member sees the member UI in the same test. The admin's reply is an action after the first assertion, so the member's check after it is a new `THEN`.

```ts
// e2e/collaboration/support-ticket.e2e.ts
import { AUTH_DIR } from '../auth/common/auth.const';
import { test } from './collaboration.fixture';
import { SupportPage } from './pages/support.page';
import { TicketsPage } from './pages/tickets.page';

const ADMIN_STATE = `${AUTH_DIR}/admin.json`;
const MEMBER_STATE = `${AUTH_DIR}/member.json`;

test.describe('FEATURE: support tickets', () => {
  test('GIVEN a member question, the admin reply reaches the member who asked', async ({ openUser }): Promise<void> => {
    const tickets = await openUser(TicketsPage, ADMIN_STATE);
    const support = await openUser(SupportPage, MEMBER_STATE);

    await test.step('WHEN the member opens support', (): Promise<void> => support.goto());

    await test.step('AND the member submits a request', (): Promise<void> => support.submit('Need help!'));

    await test.step('AND the admin opens the tickets', (): Promise<void> => tickets.goto());

    await test.step('THEN the admin sees the request', (): Promise<void> => tickets.expectTicket('Need help!'));

    await test.step('AND the admin replies', (): Promise<void> => tickets.reply('How can I help?'));

    await test.step('THEN the member sees the reply', (): Promise<void> => support.expectReply('How can I help?'));
  });
});
```

## Real-Time Collaboration

### Collaborative Document

`expectContains` is one plain assertion per fragment, and each call is its own spec step, so the spec lists what each user must see.

```ts
// e2e/collaboration/collaborative-editing.e2e.ts
import { test } from './collaboration.fixture';
import { EditorPage } from './pages/editor.page';

test.describe('FEATURE: collaborative editing', () => {
  test('GIVEN two users typing at different ends, both see the combined text', async ({ openUser }): Promise<void> => {
    const editorOne = await openUser(EditorPage);
    const editorTwo = await openUser(EditorPage);

    await test.step('WHEN user 1 opens the editor', (): Promise<void> => editorOne.goto());

    await test.step('AND user 2 opens the editor', (): Promise<void> => editorTwo.goto());

    await test.step('AND user 1 types at the start', (): Promise<void> => editorOne.typeAtStart('User 1: '));

    await test.step('AND user 2 types at the end', (): Promise<void> => editorTwo.typeAtEnd(' - User 2'));

    await test.step('THEN user 1 sees the start fragment', (): Promise<void> => editorOne.expectContains('User 1:'));

    await test.step('AND user 1 sees the end fragment', (): Promise<void> => editorOne.expectContains('- User 2'));

    await test.step('AND user 2 sees the start fragment', (): Promise<void> => editorTwo.expectContains('User 1:'));

    await test.step('AND user 2 sees the end fragment', (): Promise<void> => editorTwo.expectContains('- User 2'));
  });
});
```

### Cursor Presence

Identity comes from a mocked `/api/me` per user, routed by the opening call: `goto(id, { identity })` registers `meMock(identity)` on that user's page before it navigates. `Identity` is `{ readonly id: string; readonly name: string }` in `e2e/collaboration/common/collaboration.type.ts`; the stub and the factory are shared with the chat sample below.

```ts
// e2e/collaboration/test/stubs/identity.stub.ts
import type { Identity } from '../../common/collaboration.type';

export const ALICE_STUB: Identity = { id: 'user-1', name: 'Alice' };

export const BOB_STUB: Identity = { id: 'user-2', name: 'Bob' };
```

```ts
// e2e/collaboration/test/mocks/me.mock.ts
import type { Route } from '@playwright/test';

import type { RouteHandler } from '../../../common/playwright.type';
import type { Identity } from '../../common/collaboration.type';
import { ALICE_STUB } from '../stubs/identity.stub';

export const meMock = (identity: Identity = ALICE_STUB): RouteHandler => {
  return (route: Route): Promise<void> => route.fulfill({ json: identity });
};
```

```ts
// e2e/collaboration/cursor-presence.test.ts
import { test } from './collaboration.fixture';
import { WhiteboardPage } from './pages/whiteboard.page';
import { ALICE_STUB, BOB_STUB } from './test/stubs/identity.stub';

test.describe('FEATURE: cursor presence', () => {
  test('GIVEN Alice and Bob on one board, moving her cursor shows Bob her name', async ({ openUser }): Promise<void> => {
    const aliceBoard = await openUser(WhiteboardPage);
    const bobBoard = await openUser(WhiteboardPage);

    await test.step('WHEN Alice opens the whiteboard', (): Promise<void> => aliceBoard.goto('123', { identity: ALICE_STUB }));

    await test.step('AND Bob opens the whiteboard', (): Promise<void> => bobBoard.goto('123', { identity: BOB_STUB }));

    await test.step('AND Alice moves her cursor', (): Promise<void> => aliceBoard.moveCursor(200, 200));

    await test.step('THEN Bob sees the cursor labelled Alice', (): Promise<void> => bobBoard.expectCursor(ALICE_STUB));
  });
});
```

## Role-Based Testing

### Test RBAC

One test per role from a permissions table. The page object takes the expected state as an argument and passes it to the matcher option (`toBeVisible({ visible })`, `toBeEnabled({ enabled })`), so neither spec nor page object branches.

```ts
// e2e/documents/common/document.const.ts
import type { Role } from '../../auth/common/auth.type';

type RolePermissions = {
  readonly canDelete: boolean;
  readonly canEdit: boolean;
  readonly canView: boolean;
  readonly role: Role;
};

export const ROLE_PERMISSIONS: RolePermissions[] = [
  { canDelete: true, canEdit: true, canView: true, role: 'admin' },
  { canDelete: false, canEdit: true, canView: true, role: 'member' },
  { canDelete: false, canEdit: false, canView: true, role: 'guest' }
];
```

```ts
// e2e/documents/document-access.e2e.ts
import { AUTH_DIR } from '../auth/common/auth.const';
import { test } from '../collaboration/collaboration.fixture';
import { ROLE_PERMISSIONS } from './common/document.const';
import { DocumentAccessPage } from './pages/document-access.page';

test.describe('FEATURE: document access by role', () => {
  for (const permissions of ROLE_PERMISSIONS) {
    test(`GIVEN the ${permissions.role} role, the document shows the controls that match the role`, async ({ openUser }): Promise<void> => {
      const documentPage = await openUser(DocumentAccessPage, `${AUTH_DIR}/${permissions.role}.json`);

      await test.step('WHEN the document is opened', (): Promise<void> => documentPage.goto('123'));

      await test.step('THEN the content visibility matches the role', (): Promise<void> => documentPage.expectContentVisible(permissions.canView));

      await test.step('AND the edit button state matches the role', (): Promise<void> => documentPage.expectEditEnabled(permissions.canEdit));

      await test.step('AND the delete button visibility matches the role', (): Promise<void> => documentPage.expectDeleteVisible(permissions.canDelete));
    });
  }
});
```

### Permission Escalation Test

A member opening an admin route must be bounced. `openUser` hands over the page object, so the url check is `AdminUsersPage.expectRedirected()` instead of `expect(page)`. `AdminUsersPage.expectAccessDenied()` is the same method [authentication.md](authentication.md#multiple-roles) uses.

```ts
// e2e/documents/admin-route.e2e.ts
import { AdminUsersPage } from '../admin/pages/admin-users.page';
import { AUTH_DIR } from '../auth/common/auth.const';
import { test } from '../collaboration/collaboration.fixture';

const MEMBER_STATE = `${AUTH_DIR}/member.json`;

test.describe('FEATURE: admin route protection', () => {
  test('GIVEN a member session, opening the admin users route directly is denied', async ({ openUser }): Promise<void> => {
    const adminUsers = await openUser(AdminUsersPage, MEMBER_STATE);

    await test.step('WHEN the admin users route is opened', (): Promise<void> => adminUsers.goto());

    await test.step('THEN the url is not the admin users route', (): Promise<void> => adminUsers.expectRedirected());

    await test.step('AND access denied is shown', (): Promise<void> => adminUsers.expectAccessDenied());
  });
});
```

## Concurrent Actions

### Race Condition Testing

Both clicks go through one `Promise.all`, which is one call and therefore one step. "Exactly one conflict" is a number, so a util counts visible conflict messages and `expect.poll` retries until both saves have settled.

```ts
// e2e/collaboration/test/utils/conflict.spec.util.ts
import type { ItemPage } from '../../pages/item.page';

const isConflictVisible = (item: ItemPage): Promise<boolean> => item.conflictMessage.isVisible();

export const countConflicts = async (items: ItemPage[]): Promise<number> => {
  const visible = await Promise.all(items.map(isConflictVisible));

  return visible.filter(Boolean).length;
};
```

```ts
// e2e/collaboration/concurrent-edit.e2e.ts
import { expect, test } from './collaboration.fixture';
import { ItemPage } from './pages/item.page';
import { countConflicts } from './test/utils/conflict.spec.util';

test.describe('FEATURE: concurrent item edit', () => {
  test('GIVEN two users on one item, saving at once gives exactly one a conflict', async ({ openUser }): Promise<void> => {
    const itemOne = await openUser(ItemPage);
    const itemTwo = await openUser(ItemPage);
    const items = [itemOne, itemTwo];

    await test.step('WHEN user 1 opens the item', (): Promise<void> => itemOne.goto('123'));

    await test.step('AND user 2 opens the item', (): Promise<void> => itemTwo.goto('123'));

    await test.step('AND both click edit at once', (): Promise<void[]> => Promise.all([itemOne.edit(), itemTwo.edit()]));

    await test.step('AND user 1 fills a name', (): Promise<void> => itemOne.fillName('Value from User 1'));

    await test.step('AND user 2 fills a name', (): Promise<void> => itemTwo.fillName('Value from User 2'));

    await test.step('AND both save at once', (): Promise<void[]> => Promise.all([itemOne.save(), itemTwo.save()]));

    await test.step('THEN exactly one user sees a conflict', (): Promise<void> => expect.poll((): Promise<number> => countConflicts(items)).toBe(1));
  });
});
```

### Optimistic Locking Test

Sequential saves against the same version: the second must be rejected. `expectStaleConflict` checks the message and the reload button together, as two plain `expect` lines in one method; the spec's `THEN` step is the only step around them.

```ts
// e2e/collaboration/pages/record.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class RecordPage {
  public readonly conflictMessage: Locator;
  public readonly editButton: Locator;
  public readonly reloadButton: Locator;
  public readonly savedMessage: Locator;
  public readonly saveButton: Locator;
  public readonly valueInput: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.conflictMessage = page.getByText('Someone else modified this');
    this.editButton = page.getByRole('button', { name: 'Edit' });
    this.reloadButton = page.getByRole('button', { name: 'Reload' });
    this.savedMessage = page.getByText('Saved');
    this.saveButton = page.getByRole('button', { name: 'Save' });
    this.valueInput = page.getByLabel('Value');
  }

  public async goto(id: string): Promise<void> {
    await this.page.goto(`/record/${id}`);
  }

  public async edit(): Promise<void> {
    await this.editButton.click();
  }

  public async save(value: string): Promise<void> {
    await this.valueInput.fill(value);
    await this.saveButton.click();
  }

  public async expectSaved(): Promise<void> {
    await expect(this.savedMessage).toBeVisible();
  }

  public async expectStaleConflict(): Promise<void> {
    await expect(this.conflictMessage).toBeVisible();
    await expect(this.reloadButton).toBeVisible();
  }
}
```

```ts
// e2e/collaboration/optimistic-locking.e2e.ts
import { test } from './collaboration.fixture';
import { RecordPage } from './pages/record.page';

test.describe('FEATURE: optimistic locking', () => {
  test('GIVEN a stale version, saving is rejected', async ({ openUser }): Promise<void> => {
    const recordOne = await openUser(RecordPage);
    const recordTwo = await openUser(RecordPage);

    await test.step('WHEN user 1 opens the record', (): Promise<void> => recordOne.goto('123'));

    await test.step('AND user 2 opens the record', (): Promise<void> => recordTwo.goto('123'));

    await test.step('AND user 1 edits', (): Promise<void> => recordOne.edit());

    await test.step('AND user 1 saves', (): Promise<void> => recordOne.save('Updated by User 1'));

    await test.step('THEN user 1 sees saved', (): Promise<void> => recordOne.expectSaved());

    await test.step('AND user 2 edits', (): Promise<void> => recordTwo.edit());

    await test.step('AND user 2 saves the stale version', (): Promise<void> => recordTwo.save('Updated by User 2'));

    await test.step('THEN user 2 sees the version conflict', (): Promise<void> => recordTwo.expectStaleConflict());
  });
});
```

## Chat & Messaging

### Real-Time Chat

Identity is routed by the opening call, as in the cursor sample. Bob's reply is an action after the first assertion, so Alice's check after it is a new `THEN`.

```ts
// e2e/collaboration/chat.test.ts
import { test } from './collaboration.fixture';
import { ChatPage } from './pages/chat.page';
import { ALICE_STUB, BOB_STUB } from './test/stubs/identity.stub';

test.describe('FEATURE: chat room', () => {
  test('GIVEN Alice and Bob in one chat, a sent message reaches the other with the sender name', async ({ openUser }): Promise<void> => {
    const aliceChat = await openUser(ChatPage);
    const bobChat = await openUser(ChatPage);

    await test.step('WHEN Alice opens the room', (): Promise<void> => aliceChat.goto('room-1', { identity: ALICE_STUB }));

    await test.step('AND Bob opens the room', (): Promise<void> => bobChat.goto('room-1', { identity: BOB_STUB }));

    await test.step('AND Alice sends a message', (): Promise<void> => aliceChat.send('Hi Bob!'));

    await test.step('THEN Bob sees the message', (): Promise<void> => bobChat.expectMessage('Alice: Hi Bob!'));

    await test.step('AND Bob replies', (): Promise<void> => bobChat.send('Hey Alice!'));

    await test.step('THEN Alice sees the reply', (): Promise<void> => aliceChat.expectMessage('Bob: Hey Alice!'));
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                  | Problem                       | Solution                     |
| ----------------------------- | ----------------------------- | ---------------------------- |
| Sharing context between users | State leaks, not isolated     | Create separate contexts     |
| Not closing contexts          | Memory leak, browser overload | Always close in cleanup      |
| Hardcoded timing for sync     | Flaky tests                   | Use `expect().toBeVisible()` |
| Testing only single user      | Misses collaboration bugs     | Test multi-user scenarios    |

## Related References

- **Authentication**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for auth setup
- **WebSockets**: See [websockets.md](../browser-apis/websockets.md) for real-time mocking
