# WebSocket & Real-Time Testing

## Table of Contents

1. [WebSocket Basics](#websocket-basics)
2. [Mocking WebSocket Messages](#mocking-websocket-messages)
3. [Testing Real-Time Features](#testing-real-time-features)
4. [Server-Sent Events](#server-sent-events)
5. [Reconnection Testing](#reconnection-testing)

## WebSocket Basics

Every sample in this file belongs to the `chat` feature. The shared types, the frame log util, the fixture, and the page object are shown once here; later sections show only the spec and the mock they add.

```ts
// e2e/chat/common/chat.type.ts
import type { WebSocketRoute } from '@playwright/test';

export type SocketMessage = {
  readonly type: string;
  readonly [key: string]: unknown;
};

export type SocketFrame = {
  readonly payload: string | Buffer;
};

export type FrameLog = {
  readonly received: string[];
  readonly sent: string[];
};

export type ChatSocket = {
  readonly close: () => void;
  readonly handler: (ws: WebSocketRoute) => void;
  readonly injectMessage: (message: SocketMessage) => void;
  readonly sentMessages: () => SocketMessage[];
};

type ChatGlobals = {
  readonly chatSocket?: WebSocket;
};

export type ChatWindow = Window & ChatGlobals;
```

`recordFrames` attaches its listeners when it is called, so the fixture below calls it before the spec navigates.

```ts
// e2e/chat/test/utils/frame-log.spec.util.ts
import type { Page, WebSocket } from '@playwright/test';

import type { FrameLog, SocketFrame, SocketMessage } from '../../common/chat.type';

export const recordFrames = (page: Page): FrameLog => {
  const log: FrameLog = { received: [], sent: [] };

  const recordReceived = (frame: SocketFrame): void => {
    log.received.push(String(frame.payload));
  };

  const recordSent = (frame: SocketFrame): void => {
    log.sent.push(String(frame.payload));
  };

  const record = (socket: WebSocket): void => {
    socket.on('framereceived', recordReceived);
    socket.on('framesent', recordSent);
  };

  page.on('websocket', record);

  return log;
};

export const parseFrame = (frame: string | undefined): SocketMessage => {
  const message: SocketMessage = JSON.parse(frame ?? '{}');

  return message;
};

export const waitForFirstFrame = async (socket: WebSocket): Promise<void> => {
  await socket.waitForEvent('framesent');
};
```

```ts
// e2e/chat/chat.fixture.ts
import { test as base } from '@playwright/test';

import type { ChatSocket, FrameLog } from './common/chat.type';
import { ChatPage } from './pages/chat.page';
import { chatSocketMock } from './test/mocks/chat-socket.mock';
import { recordFrames } from './test/utils/frame-log.spec.util';

type ChatFixtures = {
  readonly chatPage: ChatPage;
  readonly chatSocket: ChatSocket;
  readonly frameLog: FrameLog;
};

export const test = base.extend<ChatFixtures>({
  chatPage: async ({ page }, use): Promise<void> => {
    await use(new ChatPage(page));
  },
  chatSocket: async ({ page }, use): Promise<void> => {
    const socket = chatSocketMock();

    await page.routeWebSocket('**/ws/chat', socket.handler);
    await use(socket);
  },
  frameLog: async ({ page }, use): Promise<void> => {
    await use(recordFrames(page));
  }
});

export { expect } from '@playwright/test';
```

```ts
// e2e/chat/pages/chat.page.ts
import type { Locator, Page, WebSocket } from '@playwright/test';
import { expect, test } from '@playwright/test';

export class ChatPage {
  public readonly alert: Locator;
  public readonly messageInput: Locator;
  public readonly messageList: Locator;
  public readonly sendButton: Locator;
  public readonly status: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.alert = page.getByRole('alert');
    this.messageInput = page.getByLabel('Message');
    this.messageList = page.getByRole('log');
    this.sendButton = page.getByRole('button', { name: 'Send' });
    this.status = page.getByTestId('connection-status');
  }

  public async goto(): Promise<void> {
    await this.page.goto('/chat');
  }

  public async gotoAndCaptureSocket(): Promise<WebSocket> {
    const socketPromise = this.page.waitForEvent('websocket');

    await this.page.goto('/chat');

    return socketPromise;
  }

  public async send(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  public async expectAlert(text: string): Promise<void> {
    await test.step(`alert reads "${text}"`, (): Promise<void> => expect(this.alert).toContainText(text), { box: true });
  }

  public async expectMessage(text: string): Promise<void> {
    await test.step(`message list shows "${text}"`, (): Promise<void> => expect(this.messageList).toContainText(text), { box: true });
  }

  public async expectStatus(text: string): Promise<void> {
    await test.step(`status reads "${text}"`, (): Promise<void> => expect(this.status).toHaveText(text), { box: true });
  }
}
```

### Wait for WebSocket Connection

`page.waitForEvent('websocket')` must be started before navigation, so the page object starts it and returns the socket. The step returns the typed value. The import block below covers every fragment of `chat.spec.ts` in this file.

```ts
// e2e/chat/chat.spec.ts
import type { WebSocket } from '@playwright/test';

import { expect, test } from './chat.fixture';
import type { SocketMessage } from './common/chat.type';
import { parseFrame, waitForFirstFrame } from './test/utils/frame-log.spec.util';
import { dispatchSocketMessage } from './test/utils/socket-message.spec.util';

test.describe('FEATURE: chat socket', () => {
  test.describe('GIVEN the chat page', () => {
    test('opening the page connects a socket to the chat endpoint', async ({ chatPage }): Promise<void> => {
      const socket = await test.step('WHEN the page opens and the socket is captured', (): Promise<WebSocket> => chatPage.gotoAndCaptureSocket());

      await test.step('THEN the socket url targets the chat endpoint', (): void => expect(socket.url()).toContain('/ws/chat'));

      await test.step('AND the client sends its first frame', (): Promise<void> => waitForFirstFrame(socket));
    });
  });
});
```

### Monitor WebSocket Messages

The `frameLog` fixture is created before the test body runs, so the listener is in place before `goto`. `expect.poll` waits for the first frame.

```ts
// e2e/chat/chat.spec.ts
test('a frame pushed by the server carries a type', async ({ chatPage, frameLog }): Promise<void> => {
  await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());

  await test.step('WHEN a frame arrives', (): Promise<void> => expect.poll((): number => frameLog.received.length).toBeGreaterThan(0));

  await test.step('THEN the first frame carries a type', (): void => expect(parseFrame(frameLog.received[0])).toHaveProperty('type'));
});
```

### Capture Sent Messages

```ts
// e2e/chat/chat.spec.ts
test('sending a message makes the last sent frame the chat message', async ({ chatPage, frameLog }): Promise<void> => {
  await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());

  await test.step('WHEN a greeting is sent', (): Promise<void> => chatPage.send('Hello!'));

  await test.step('THEN a frame was sent', (): Promise<void> => expect.poll((): number => frameLog.sent.length).toBeGreaterThan(0));

  await test.step('AND the last sent frame is the chat message', (): void => expect(parseFrame(frameLog.sent.at(-1))).toEqual({ content: 'Hello!', type: 'message' }));
});
```

## Mocking WebSocket Messages

### Inject Messages via Page Evaluate

When the app exposes its socket on `window.chatSocket`, a util dispatches a `MessageEvent` on it. Both browser-side functions are self-contained because `page.evaluate` serialises them. `ChatWindow` types the global without a cast: `Window` is assignable to it because `chatSocket` is optional. `page.waitForFunction` guards against sending before `readyState` is `OPEN`.

```ts
// e2e/chat/test/utils/socket-message.spec.util.ts
import type { Page } from '@playwright/test';

import type { ChatWindow, SocketMessage } from '../../common/chat.type';

const isSocketOpen = (): boolean => {
  const chatWindow: ChatWindow = window;

  return chatWindow.chatSocket?.readyState === WebSocket.OPEN;
};

const dispatchInBrowser = (message: SocketMessage): void => {
  const chatWindow: ChatWindow = window;
  const event = new MessageEvent('message', { data: JSON.stringify(message) });

  chatWindow.chatSocket?.dispatchEvent(event);
};

export const dispatchSocketMessage = async (page: Page, message: SocketMessage): Promise<void> => {
  await page.waitForFunction(isSocketOpen);
  await page.evaluate(dispatchInBrowser, message);
};
```

```ts
// e2e/chat/chat.spec.ts
test('a message event dispatched on the app socket shows the message', async ({ chatPage, page }): Promise<void> => {
  const message: SocketMessage = { content: 'Hello there!', from: 'Alice', type: 'message' };

  await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());

  await test.step('WHEN an incoming message is dispatched on the socket', (): Promise<void> => dispatchSocketMessage(page, message));

  await test.step('THEN the message from Alice is shown', (): Promise<void> => chatPage.expectMessage('Alice: Hello there!'));
});
```

### Mock WebSocket with Route Handler

`page.route` cannot fulfill a WebSocket upgrade. `page.routeWebSocket` can: it intercepts the connection, never contacts the server unless `ws.connectToServer()` is called, and gives the test a `WebSocketRoute` to send and receive frames on. The mock factory keeps the route and the frames the page sent.

```ts
// e2e/chat/test/mocks/chat-socket.mock.ts
import type { WebSocketRoute } from '@playwright/test';

import type { ChatSocket, SocketMessage } from '../../common/chat.type';

export const chatSocketMock = (): ChatSocket => {
  const sent: SocketMessage[] = [];
  let route: WebSocketRoute | undefined;

  const recordFrame = (frame: string | Buffer): void => {
    const message: SocketMessage = JSON.parse(String(frame));

    sent.push(message);
  };

  const handler = (ws: WebSocketRoute): void => {
    route = ws;
    ws.onMessage(recordFrame);
  };

  const injectMessage = (message: SocketMessage): void => {
    route?.send(JSON.stringify(message));
  };

  const close = (): void => {
    route?.close();
  };

  const sentMessages = (): SocketMessage[] => {
    return sent;
  };

  const socket: ChatSocket = { close, handler, injectMessage, sentMessages };

  return socket;
};
```

### WebSocket Mock Fixture

The `chatSocket` fixture (shown in [WebSocket Basics](#websocket-basics)) registers the mock with `page.routeWebSocket('**/ws/chat', socket.handler)` and hands the `ChatSocket` to the spec.

```ts
// e2e/chat/chat.spec.ts
test.describe('GIVEN a mocked chat socket', () => {
  test.beforeEach(async ({ chatPage }): Promise<void> => {
    await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());
  });

  test('a message pushed by the server is shown', async ({ chatPage, chatSocket }): Promise<void> => {
    const message: SocketMessage = { content: 'Hi!', from: 'Bob', type: 'message' };

    await test.step('WHEN a message from Bob is injected', (): void => chatSocket.injectMessage(message));

    await test.step('THEN the message from Bob is shown', (): Promise<void> => chatPage.expectMessage('Bob: Hi!'));
  });

  test('sending a reply delivers it to the socket', async ({ chatPage, chatSocket }): Promise<void> => {
    await test.step('WHEN a reply is sent', (): Promise<void> => chatPage.send('Hello Bob!'));

    await test.step('THEN the sent frames contain the reply', (): Promise<void> => expect.poll((): SocketMessage[] => chatSocket.sentMessages()).toContainEqual(expect.objectContaining({ content: 'Hello Bob!' })));
  });
});
```

## Testing Real-Time Features

Every real-time feature test has the same shape: open the page, inject one message through the mocked socket, assert the UI. One complete example; the variants differ only in message shape and assertion.

### Live Notifications

```ts
// e2e/chat/chat.spec.ts
test('an arriving notification shows the order in the alert', async ({ chatPage, chatSocket }): Promise<void> => {
  const notification: SocketMessage = { message: 'Order #123 received', title: 'New Order', type: 'notification' };

  await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());

  await test.step('WHEN a notification is injected', (): void => chatSocket.injectMessage(notification));

  await test.step('THEN the alert names the order', (): Promise<void> => chatPage.expectAlert('Order #123 received'));
});
```

### Live Data Updates

| Feature | Injected message | Assertion |
|---|---|---|
| Stock price | `{ price: 150.25, symbol: 'AAPL', type: 'price_update' }` | `stockPage.expectPrice('150.25')` on the `stock-price` test id; a second boxed step asserts the old text is gone with `not.toHaveText(previous)` |
| Collaborative cursor | `{ position: { x: 100, y: 200 }, type: 'cursor', userId: 'user-456', userName: 'Alice' }` | `documentPage.expectCursor('user-456', 'Alice')`: cursor test id visible and the user name visible |

### Collaborative Editing

Covered by the cursor row above. The message's nested `position` object is a named const in the spec before it is spread into the message, per the nested-values rule.

## Server-Sent Events

### Test SSE Updates

An SSE endpoint is a normal HTTP response with `Content-Type: text/event-stream`. The mock factory takes the event bodies; `EventSource` parses each `data:` line terminated by a blank line.

```ts
// e2e/live-data/test/mocks/events.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

const SSE_HEADERS = {
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream'
};

export const eventsMock = (events: string[]): RouteHandler => {
  const body = events.map((event: string): string => `data: ${event}\n\n`).join('');

  return (route: Route): Promise<void> => route.fulfill({ body, headers: SSE_HEADERS, status: 200 });
};
```

### Simulate Multiple SSE Events

`liveDataPage` exposes `goto()` and `expectCount(text)`; its fixture follows the chat fixture shape. The route is installed in a step before navigation.

```ts
// e2e/live-data/live-data.spec.ts
import { expect, test } from './live-data.fixture';
import { eventsMock } from './test/mocks/events.mock';

const COUNTER_EVENTS = ['{"count":1}', '{"count":2}', '{"count":3}'];

test.describe('FEATURE: live data', () => {
  test.describe('GIVEN the events endpoint streams three counter events', () => {
    test('opening the page shows the last event on the counter', async ({ liveDataPage, page }): Promise<void> => {
      await test.step('GIVEN three counter events are served', async (): Promise<void> => {
        await page.route('**/api/events', eventsMock(COUNTER_EVENTS));
      });

      await test.step('WHEN the page opens', (): Promise<void> => liveDataPage.goto());

      await test.step('THEN the counter shows 3', (): Promise<void> => liveDataPage.expectCount('3'));
    });
  });
});
```

A single-event stream is `eventsMock(['{"type":"update","value":42}'])` with `expectValue('42')`.

## Reconnection Testing

### Test Connection Loss

`chatSocket.close()` closes the mocked route, which the page sees as a server-side close.

```ts
// e2e/chat/chat.spec.ts
test('closing the socket shows the reconnecting status', async ({ chatPage, chatSocket }): Promise<void> => {
  await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());

  await test.step('AND the status shows connected', (): Promise<void> => chatPage.expectStatus('Connected'));

  await test.step('WHEN the socket is closed', (): void => chatSocket.close());

  await test.step('THEN the status shows reconnecting', (): Promise<void> => chatPage.expectStatus('Reconnecting...'));
});
```

### Test Reconnection

When the app reconnects, `page.routeWebSocket` calls the handler again for the new connection, so the same mock serves the second socket. If the app only reconnects on the browser `online` event, add a page-object method that dispatches `new Event('online')` on `window` through `page.evaluate` and call it as a step.

```ts
// e2e/chat/chat.spec.ts
test('closing the socket makes the app reconnect', async ({ chatPage, chatSocket }): Promise<void> => {
  await test.step('GIVEN the chat page is open', (): Promise<void> => chatPage.goto());

  await test.step('WHEN the socket is closed', (): void => chatSocket.close());

  await test.step('THEN the status shows reconnecting', (): Promise<void> => chatPage.expectStatus('Reconnecting...'));

  await test.step('AND the status shows connected again', (): Promise<void> => chatPage.expectStatus('Connected'));
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                          | Problem                       | Solution                                              |
| ------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Not waiting for WebSocket ready       | Messages sent too early       | Wait for `readyState === WebSocket.OPEN` or use `routeWebSocket` |
| Testing against real WebSocket server | Flaky, timing-dependent       | Mock with `page.routeWebSocket`                       |
| Ignoring connection state             | Tests pass but feature broken | Test connected/disconnected states                    |
| No cleanup of listeners               | Memory leaks in tests         | Attach listeners in a fixture so they die with the page |

## Related References

- **Network**: See [network-advanced.md](../advanced/network-advanced.md) for HTTP mocking patterns
- **Assertions**: See [assertions-waiting.md](../core/assertions-waiting.md) for polling patterns
- **Multi-User**: See [multi-user.md](../advanced/multi-user.md) for real-time collaboration testing with multiple users
