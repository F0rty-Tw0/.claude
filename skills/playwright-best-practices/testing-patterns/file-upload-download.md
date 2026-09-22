# File Upload and Download Testing

> **When to use**: Testing file uploads (single, multiple, drag-and-drop), downloads (content verification, filename, type), upload progress indicators, or file type/size restrictions.

## Table of Contents

1. [Downloading Files](#downloading-files)
2. [Single File Upload](#single-file-upload)
3. [Multiple File Upload](#multiple-file-upload)
4. [Drag-and-Drop Zones](#drag-and-drop-zones)
5. [File Chooser Dialog](#file-chooser-dialog)
6. [Upload Progress and Cancellation](#upload-progress-and-cancellation)
7. [Retry After Failure](#retry-after-failure)
8. [File Type and Size Restrictions](#file-type-and-size-restrictions)
9. [Authenticated Downloads](#authenticated-downloads)
10. [Tips](#tips)

---

## Downloading Files

### Capturing Downloads and Verifying Content

The page object registers `page.waitForEvent('download')` before the click that triggers the download, then returns the `Download`. Reading the content through `createReadStream()` avoids disk I/O and temp-file cleanup.

```ts
// e2e/exports/pages/exports.page.ts
import type { Download, Page } from '@playwright/test';

export class ExportsPage {
  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
  }

  public async goto(): Promise<void> {
    await this.page.goto('/exports');
  }

  public async download(fileName: string): Promise<Download> {
    const downloadPromise = this.page.waitForEvent('download');

    await this.page.getByRole('link', { name: fileName }).click();

    return downloadPromise;
  }
}
```

```ts
// e2e/exports/test/utils/download-content.spec.util.ts
import type { Download } from '@playwright/test';

export const readDownload = async (download: Download): Promise<string> => {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf-8');
};
```

```ts
// e2e/exports/exports.spec.ts
import type { Download } from '@playwright/test';

import { expect, test } from './exports.fixture';
import { readDownload } from './test/utils/download-content.spec.util';

test.describe('FEATURE: exports', () => {
  test.describe('GIVEN the exports page', () => {
    test.beforeEach(async ({ exportsPage }): Promise<void> => {
      await test.step('GIVEN the exports page is open', (): Promise<void> => exportsPage.goto());
    });

    test('SCENARIO: downloading transactions.csv yields the header and data rows', async ({ exportsPage }): Promise<void> => {
      const download = await test.step('WHEN transactions.csv is downloaded', (): Promise<Download> => exportsPage.download('transactions.csv'));

      const content = await test.step('AND the download is read from its stream', (): Promise<string> => readDownload(download));

      await test.step('THEN the header row is present', (): void => expect(content).toContain('id,amount,date'));

      await test.step('AND the first data row is present', (): void => expect(content).toContain('1001,250.00,2025-01-15'));
    });
  });
});
```

| Need | Call |
|---|---|
| Content without touching disk | `download.createReadStream()` as above |
| File on disk for another tool | `await download.saveAs(savePath)` then `fs.readFile(savePath)`; delete it after |
| Playwright's own temp path | `await download.path()` |
| Name the app proposed | `download.suggestedFilename()` |

### Verifying Filename, Format and Response Headers

`exportPdf()` waits for the download and the API response together so one method serves both the filename and the header checks. `ExportResult` is a named type in `common/exports.type.ts` with `readonly download: Download` and `readonly response: Response`. The spec returns it from the `WHEN` step, then asserts `result.download.suggestedFilename()` matches `/^analytics-\d{4}-\d{2}-\d{2}\.pdf$/`, `result.response.headers()['content-type']` contains `application/pdf`, and `['content-disposition']` contains `attachment`. A format picker is `formatSelect.selectOption(format)` before the click, asserted with `suggestedFilename()` against `/\.csv$/`, `/\.xlsx$/` or `/\.pdf$/`.

```ts
// e2e/exports/pages/analytics.page.ts
import type { Locator, Page } from '@playwright/test';

import type { ExportResult } from '../common/exports.type';

export class AnalyticsPage {
  public readonly alert: Locator;
  public readonly exportPdfButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.alert = page.getByRole('alert');
    this.exportPdfButton = page.getByRole('button', { name: 'Export PDF' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/analytics');
  }

  public async exportPdf(): Promise<ExportResult> {
    const responsePromise = this.page.waitForResponse('**/api/analytics/export**');
    const downloadPromise = this.page.waitForEvent('download');

    await this.exportPdfButton.click();

    const [download, response] = await Promise.all([downloadPromise, responsePromise]);
    const result: ExportResult = { download, response };

    return result;
  }
}
```

A failed export: route `**/api/analytics/export**` to `route.fulfill({ json: { error: 'Generation failed' }, status: 500 })` in a `GIVEN` step before `goto()`, click `exportPdfButton`, then `expect(analyticsPage.alert).toContainText(/failed|error/i)`. The route-mock-in-`GIVEN` shape is shown under [Retry After Failure](#retry-after-failure).

---

## Single File Upload

Every upload sample below uses one page object and one fixture file. `UploadFile` and `UploadSelection` are named in `common/attachments.type.ts`. `setInputFiles([])` empties the input.

```ts
// e2e/attachments/common/attachments.type.ts
export type UploadFile = {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly name: string;
};

export type UploadSelection = string | string[] | UploadFile | UploadFile[];
```

```ts
// e2e/attachments/pages/attachments.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { UploadSelection } from '../common/attachments.type';
import { DropZoneComponent } from '../components/drop-zone.component';
import { UploadProgressComponent } from '../components/upload-progress.component';

export class AttachmentsPage {
  public readonly alert: Locator;
  public readonly dropZone: DropZoneComponent;
  public readonly fileInput: Locator;
  public readonly progress: UploadProgressComponent;
  public readonly uploadButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.alert = page.getByRole('alert');
    this.dropZone = new DropZoneComponent(page.getByTestId('drop-zone'));
    this.fileInput = page.locator('input[type="file"]');
    this.progress = new UploadProgressComponent(page.getByTestId('upload-status'));
    this.uploadButton = page.getByRole('button', { name: /^Upload/ });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/attachments');
  }

  public async select(files: UploadSelection): Promise<void> {
    await this.fileInput.setInputFiles(files);
  }

  public async clearSelection(): Promise<void> {
    await this.fileInput.setInputFiles([]);
  }

  public async upload(): Promise<void> {
    await this.uploadButton.click();
  }

  public async expectListed(text: string | RegExp): Promise<void> {
    await test.step(`${text} is listed`, (): Promise<void> => expect(this.page.getByText(text)).toBeVisible(), { box: true });
  }

  public async expectNotListed(text: string | RegExp): Promise<void> {
    await test.step(`${text} is not listed`, (): Promise<void> => expect(this.page.getByText(text)).not.toBeVisible(), { box: true });
  }
}
```

```ts
// e2e/attachments/attachments.fixture.ts
import { test as base } from '@playwright/test';

import { AttachmentsPage } from './pages/attachments.page';

type AttachmentsFixtures = {
  readonly attachmentsPage: AttachmentsPage;
};

export const test = base.extend<AttachmentsFixtures>({
  attachmentsPage: async ({ page }, use): Promise<void> => {
    await use(new AttachmentsPage(page));
  }
});

export { expect } from '@playwright/test';
```

The `exports` and `avatar` fixtures follow the same shape with `exportsPage`, `analyticsPage` and `avatarPage` members and are not repeated here.

### From Fixture File or In-Memory Buffer

Real files live under `test/fixtures/`; the spec resolves the path and hands it to `select()`. In-memory files are typed stubs: `Buffer.from()` keeps the test self-contained, and a stub is spread and renamed when a case needs several copies. Selecting a stub is the first test with `attachmentsPage.select(CSV_FILE_STUB)` and `expectListed(CSV_FILE_STUB.name)`.

```ts
// e2e/attachments/attachments.spec.ts
import path from 'node:path';

import { expect, test } from './attachments.fixture';
import { CSV_FILE_STUB } from './test/stubs/attachments.stub';

test.describe('FEATURE: attachments upload', () => {
  test.describe('GIVEN the attachments page', () => {
    test.beforeEach(async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: uploading a fixture file lists it as an attachment', async ({ attachmentsPage }): Promise<void> => {
      const invoicePath = path.join(__dirname, 'test/fixtures/invoice.pdf');

      await test.step('WHEN invoice.pdf is selected from disk', (): Promise<void> => attachmentsPage.select(invoicePath));

      await test.step('THEN invoice.pdf is listed', (): Promise<void> => attachmentsPage.expectListed('invoice.pdf'));

      await test.step('AND the selection is uploaded', (): Promise<void> => attachmentsPage.upload());

      await test.step('THEN the alert confirms the upload', (): Promise<void> => expect(attachmentsPage.alert).toContainText('uploaded successfully'));
    });

    test('SCENARIO: clearing the selection removes the file', async ({ attachmentsPage }): Promise<void> => {
      await test.step('WHEN the CSV is selected', (): Promise<void> => attachmentsPage.select(CSV_FILE_STUB));

      await test.step('THEN contacts.csv is listed', (): Promise<void> => attachmentsPage.expectListed(CSV_FILE_STUB.name));

      await test.step('AND the selection is cleared', (): Promise<void> => attachmentsPage.clearSelection());

      await test.step('THEN contacts.csv is gone', (): Promise<void> => attachmentsPage.expectNotListed(CSV_FILE_STUB.name));
    });
  });
});
```

```ts
// e2e/attachments/test/stubs/attachments.stub.ts
import type { UploadFile } from '../../common/attachments.type';

export const CSV_FILE_STUB: UploadFile = {
  buffer: Buffer.from('name,email\nAlice,alice@acme.com\nBob,bob@acme.com'),
  mimeType: 'text/csv',
  name: 'contacts.csv'
};

export const EXE_FILE_STUB: UploadFile = {
  buffer: Buffer.from('exe-content'),
  mimeType: 'application/x-msdownload',
  name: 'malware.exe'
};

export const LARGE_FILE_STUB: UploadFile = {
  buffer: Buffer.alloc(5 * 1024 * 1024, 'x'),
  mimeType: 'application/octet-stream',
  name: 'dataset.bin'
};

export const PDF_FILE_STUB: UploadFile = {
  buffer: Buffer.from('pdf-content'),
  mimeType: 'application/pdf',
  name: 'report.pdf'
};
```

---

## Multiple File Upload

`select()` accepts an array. Removing one row is a `removeFile(name)` page method that clicks `getByText(name).locator('..').getByRole('button', { name: /remove|delete|×/i })`, then `expectNotListed(name)` and `expectListed` on the survivor.

```ts
// e2e/attachments/attachments-multiple.spec.ts
import type { UploadFile } from './common/attachments.type';
import { expect, test } from './attachments.fixture';
import { PDF_FILE_STUB } from './test/stubs/attachments.stub';

const THREE_PDFS: UploadFile[] = [
  { ...PDF_FILE_STUB, name: 'doc1.pdf' },
  { ...PDF_FILE_STUB, name: 'doc2.pdf' },
  { ...PDF_FILE_STUB, name: 'doc3.pdf' }
];

test.describe('FEATURE: attachments multiple upload', () => {
  test.describe('GIVEN the attachments page', () => {
    test.beforeEach(async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: uploading three files together reports all three', async ({ attachmentsPage }): Promise<void> => {
      await test.step('WHEN three PDFs are selected', (): Promise<void> => attachmentsPage.select(THREE_PDFS));

      await test.step('THEN the summary counts three files', (): Promise<void> => attachmentsPage.expectListed('3 files selected'));

      await test.step('AND all three are uploaded', (): Promise<void> => attachmentsPage.upload());

      await test.step('THEN the alert counts three uploads', (): Promise<void> => expect(attachmentsPage.alert).toContainText('3 files uploaded'));
    });
  });
});
```

---

## Drag-and-Drop Zones

Drop zones always have an underlying `input[type="file"]`, so a drop is `select()` on that input and the upload spec above covers it; never simulate OS-level drag events. Drag-over feedback is tested by dispatching `dragenter` and `dragleave` on the zone with a `dataTransfer` whose `types` include `Files`.

```ts
// e2e/attachments/components/drop-zone.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

const ACTIVE_CLASS = /active|highlight|drag-over/;

export class DropZoneComponent {
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
  }

  public async dragEnter(): Promise<void> {
    await this.root.dispatchEvent('dragenter', { dataTransfer: { files: [], types: ['Files'] } });
  }

  public async dragLeave(): Promise<void> {
    await this.root.dispatchEvent('dragleave');
  }

  public async expectActive(): Promise<void> {
    await test.step('drop zone highlights the drag', async (): Promise<void> => {
      await expect(this.root).toHaveClass(ACTIVE_CLASS);
      await expect(this.root).toContainText(/release|drop now/i);
    }, { box: true });
  }

  public async expectIdle(): Promise<void> {
    await test.step('drop zone highlight is gone', (): Promise<void> => expect(this.root).not.toHaveClass(ACTIVE_CLASS), { box: true });
  }
}
```

```ts
// e2e/attachments/drop-zone.spec.ts
import { test } from './attachments.fixture';

test.describe('FEATURE: attachments drop zone', () => {
  test.describe('GIVEN the attachments page', () => {
    test.beforeEach(async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: a drag entering and leaving moves the highlight with it', async ({ attachmentsPage }): Promise<void> => {
      await test.step('WHEN a drag enters the zone', (): Promise<void> => attachmentsPage.dropZone.dragEnter());

      await test.step('THEN the zone highlights the drag', (): Promise<void> => attachmentsPage.dropZone.expectActive());

      await test.step('AND the drag leaves the zone', (): Promise<void> => attachmentsPage.dropZone.dragLeave());

      await test.step('THEN the zone highlight is gone', (): Promise<void> => attachmentsPage.dropZone.expectIdle());
    });
  });
});
```

---

## File Chooser Dialog

`openFileChooser()` registers `waitForEvent('filechooser')` before the click and returns the `FileChooser`. The spec inspects `isMultiple()` and calls `setFiles()` on it. Image preview is `expectPreviewRendered()`: the preview is visible and its `src` starts with `blob:` or `data:image`.

```ts
// e2e/avatar/pages/avatar.page.ts
import type { FileChooser, Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import type { UploadSelection } from '../../attachments/common/attachments.type';

export class AvatarPage {
  public readonly alert: Locator;
  public readonly chooseFileButton: Locator;
  public readonly fileInput: Locator;
  public readonly preview: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.alert = page.getByRole('alert');
    this.chooseFileButton = page.getByRole('button', { name: 'Choose file' });
    this.fileInput = page.locator('input[type="file"]');
    this.preview = page.getByRole('img', { name: /preview|avatar/i });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/profile/avatar');
  }

  public async select(files: UploadSelection): Promise<void> {
    await this.fileInput.setInputFiles(files);
  }

  public async openFileChooser(): Promise<FileChooser> {
    const chooserPromise = this.page.waitForEvent('filechooser');

    await this.chooseFileButton.click();

    return chooserPromise;
  }

  public async expectListed(name: string): Promise<void> {
    await test.step(`${name} is listed`, (): Promise<void> => expect(this.page.getByText(name)).toBeVisible(), { box: true });
  }

  public async expectPreviewRendered(): Promise<void> {
    await test.step('preview shows a blob or data image', async (): Promise<void> => {
      await expect(this.preview).toBeVisible();
      await expect(this.preview).toHaveAttribute('src', /^(blob:|data:image)/);
    }, { box: true });
  }
}
```

```ts
// e2e/avatar/avatar.spec.ts
import type { FileChooser } from '@playwright/test';
import path from 'node:path';

import { expect, test } from './avatar.fixture';
import { PDF_FILE_STUB } from '../attachments/test/stubs/attachments.stub';

test.describe('FEATURE: avatar upload', () => {
  test.describe('GIVEN the avatar page', () => {
    test.beforeEach(async ({ avatarPage }): Promise<void> => {
      await test.step('GIVEN the avatar page is open', (): Promise<void> => avatarPage.goto());
    });

    test('SCENARIO: choosing a file through the native chooser lists it', async ({ avatarPage }): Promise<void> => {
      const selected = { ...PDF_FILE_STUB, name: 'selected.pdf' };

      const chooser = await test.step('WHEN the native chooser is opened', (): Promise<FileChooser> => avatarPage.openFileChooser());

      await test.step('THEN the chooser is single-select', (): void => expect(chooser.isMultiple()).toBe(false));

      await test.step('AND selected.pdf is chosen', (): Promise<void> => chooser.setFiles(selected));

      await test.step('THEN selected.pdf is listed', (): Promise<void> => avatarPage.expectListed('selected.pdf'));
    });

    test('SCENARIO: selecting a photo renders a preview', async ({ avatarPage }): Promise<void> => {
      const photoPath = path.join(__dirname, 'test/fixtures/photo.jpg');

      await test.step('WHEN photo.jpg is selected', (): Promise<void> => avatarPage.select(photoPath));

      await test.step('THEN the preview shows the image', (): Promise<void> => avatarPage.expectPreviewRendered());
    });
  });
});
```

---

## Upload Progress and Cancellation

The progress component is scoped to the region that wraps the progress bar and the cancel / retry buttons. `expectStarted()` asserts `aria-valuenow` moved above zero with a web-first matcher instead of a polling loop. The happy path is `select(LARGE_FILE_STUB)`, `upload()`, `progress.expectStarted()`, `progress.expectFinished()`, then the alert.

```ts
// e2e/attachments/components/upload-progress.component.ts
import type { Locator } from '@playwright/test';
import { expect, test } from '@playwright/test';

const UPLOAD_TIMEOUT = 60_000;

export class UploadProgressComponent {
  public readonly cancelButton: Locator;
  public readonly progressBar: Locator;
  public readonly retryButton: Locator;
  public readonly root: Locator;

  public constructor(root: Locator) {
    this.root = root;
    this.cancelButton = root.getByRole('button', { name: 'Cancel upload' });
    this.progressBar = root.getByRole('progressbar');
    this.retryButton = root.getByRole('button', { name: /retry/i });
  }

  public async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  public async retry(): Promise<void> {
    await this.retryButton.click();
  }

  public async expectStarted(): Promise<void> {
    await test.step('progress bar is visible and moving', async (): Promise<void> => {
      await expect(this.progressBar).toBeVisible();
      await expect(this.progressBar).toHaveAttribute('aria-valuenow', /^[1-9]\d*$/, { timeout: 10_000 });
    }, { box: true });
  }

  public async expectFinished(): Promise<void> {
    await test.step('progress bar is gone', (): Promise<void> => expect(this.progressBar).not.toBeVisible({ timeout: UPLOAD_TIMEOUT }), { box: true });
  }

  public async expectCancelled(): Promise<void> {
    await test.step('upload reports cancelled', async (): Promise<void> => {
      await expect(this.progressBar).not.toBeVisible();
      await expect(this.root.getByText(/cancelled|aborted/i)).toBeVisible();
    }, { box: true });
  }
}
```

The cancellation case needs the upload to stay in flight. The mock holds the request for ten seconds before letting it continue.

```ts
// e2e/attachments/test/mocks/slow-upload.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

const HOLD_MS = 10_000;

export const slowUploadMock = (): RouteHandler => {
  return async (route: Route): Promise<void> => {
    await new Promise((resolve): void => {
      setTimeout(resolve, HOLD_MS);
    });
    await route.continue();
  };
};
```

```ts
// e2e/attachments/upload-progress.spec.ts
import { test } from './attachments.fixture';
import { slowUploadMock } from './test/mocks/slow-upload.mock';
import { LARGE_FILE_STUB } from './test/stubs/attachments.stub';

test.describe('FEATURE: attachments upload progress', () => {
  test.describe('GIVEN the upload endpoint stalls', () => {
    test.beforeEach(async ({ attachmentsPage, page }): Promise<void> => {
      await test.step('GIVEN the upload endpoint holds the request', async (): Promise<void> => {
        await page.route('**/api/attachments/upload', slowUploadMock());
      });

      await test.step('AND the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: cancelling the upload attaches nothing', async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the 5 MB file is selected', (): Promise<void> => attachmentsPage.select(LARGE_FILE_STUB));

      await test.step('AND the selection is uploaded', (): Promise<void> => attachmentsPage.upload());

      await test.step('AND the progress bar is moving', (): Promise<void> => attachmentsPage.progress.expectStarted());

      await test.step('WHEN the upload is cancelled', (): Promise<void> => attachmentsPage.progress.cancel());

      await test.step('THEN the upload reports cancelled', (): Promise<void> => attachmentsPage.progress.expectCancelled());

      await test.step('AND dataset.bin is not attached', (): Promise<void> => attachmentsPage.expectNotListed(LARGE_FILE_STUB.name));
    });
  });
});
```

---

## Retry After Failure

The mock fails the first attempt with a 500 and succeeds afterwards. It exposes `attempts()` so the spec can assert the server saw two calls.

```ts
// e2e/attachments/test/mocks/flaky-upload.mock.ts
import type { Route } from '@playwright/test';

type RouteHandler = (route: Route) => Promise<void>;

export type FlakyUpload = {
  readonly attempts: () => number;
  readonly handler: RouteHandler;
};

const FAILURE_BODY = { error: 'Server error' };
const SUCCESS_BODY = { id: 'abc', name: 'data.csv' };

export const flakyUploadMock = (): FlakyUpload => {
  let attempts = 0;

  const handler = (route: Route): Promise<void> => {
    attempts += 1;

    if (attempts === 1) return route.fulfill({ json: FAILURE_BODY, status: 500 });

    return route.fulfill({ json: SUCCESS_BODY, status: 200 });
  };

  const promise = { attempts: (): number => attempts, handler };

  return promise;
};
```

```ts
// e2e/attachments/upload-retry.spec.ts
import { expect, test } from './attachments.fixture';
import { flakyUploadMock } from './test/mocks/flaky-upload.mock';
import { CSV_FILE_STUB } from './test/stubs/attachments.stub';

test.describe('FEATURE: attachments upload retry', () => {
  test.describe('GIVEN the upload endpoint fails once', () => {
    test('SCENARIO: retrying the upload succeeds on the second attempt', async ({ attachmentsPage, page }): Promise<void> => {
      const flaky = flakyUploadMock();

      await test.step('GIVEN the upload endpoint fails once', async (): Promise<void> => {
        await page.route('**/api/attachments/upload', flaky.handler);
      });

      await test.step('AND the attachments page is open', (): Promise<void> => attachmentsPage.goto());

      await test.step('AND the CSV is selected', (): Promise<void> => attachmentsPage.select(CSV_FILE_STUB));

      await test.step('WHEN the selection is uploaded', (): Promise<void> => attachmentsPage.upload());

      await test.step('THEN the failure is reported', (): Promise<void> => attachmentsPage.expectListed(/upload failed|error/i));

      await test.step('AND the upload is retried', (): Promise<void> => attachmentsPage.progress.retry());

      await test.step('THEN the alert confirms the upload', (): Promise<void> => expect(attachmentsPage.alert).toContainText('uploaded successfully'));

      await test.step('AND the server saw two attempts', (): void => expect(flaky.attempts()).toBe(2));
    });
  });
});
```

---

## File Type and Size Restrictions

The HTML `accept` attribute only filters the OS dialog. `setInputFiles()` bypasses it, which is what lets the spec exercise the app's JavaScript validation with a disallowed type. The allowed case is a `GIVEN` step with `expect(attachmentsPage.fileInput).toHaveAttribute('accept', /\.pdf|\.doc|\.docx|\.txt/)`, `select(PDF_FILE_STUB)`, `expectListed('report.pdf')` and `expectNotListed(/not allowed|invalid/i)`.

```ts
// e2e/attachments/upload-restrictions.spec.ts
import { expect, test } from './attachments.fixture';
import { EXE_FILE_STUB } from './test/stubs/attachments.stub';

test.describe('FEATURE: attachments upload restrictions', () => {
  test.describe('GIVEN the attachments page', () => {
    test.beforeEach(async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: selecting a disallowed type rejects it', async ({ attachmentsPage }): Promise<void> => {
      await test.step('WHEN malware.exe is selected', (): Promise<void> => attachmentsPage.select(EXE_FILE_STUB));

      await test.step('THEN the alert rejects the type', (): Promise<void> => expect(attachmentsPage.alert).toContainText(/not allowed|unsupported file type|only .pdf, .doc/i));

      await test.step('AND malware.exe is not listed', (): Promise<void> => attachmentsPage.expectNotListed('malware.exe'));
    });
  });
});
```

Every other limit is the rejection test with a different selection and alert pattern:

| Limit | `WHEN` selection | Alert pattern |
|---|---|---|
| Size, 11 MB | `attachmentsPage.select({ ...PDF_FILE_STUB, buffer: Buffer.alloc(11 * 1024 * 1024, 'x'), name: 'huge.pdf' })` | `/file.*too large\|exceeds.*10 ?MB/i` |
| Count, six files | `attachmentsPage.select(buildTextFiles(6))`, a `test/utils/upload-file-builder.spec.util.ts` loop returning `{ ...CSV_FILE_STUB, name: \`file-${index}.txt\` }`; sequenced data is a builder, never a stub | `/maximum.*5 files\|too many files/i` |
| Image dimensions, 1x1 PNG at `test/fixtures/tiny.png` | `avatarPage.select(path.join(__dirname, 'test/fixtures/tiny.png'))`; image bytes are never exported from a `.ts` module | `/minimum.*dimensions\|too small/i` on `avatarPage.alert` |

---

## Authenticated Downloads

The browser download succeeds because the context's cookies travel with the request, so `exportsPage.download('confidential.pdf')` from `exports.spec.ts` needs nothing extra. The `request` fixture shares the same auth state, so the API path is checked alongside: `const response = await test.step('WHEN the same file is fetched through the API', (): Promise<APIResponse> => request.get('/api/attachments/456/download'));` then `expect(response.ok()).toBeTruthy()` and `expect(response.headers()['content-type']).toContain('application/pdf')` in sync `THEN` steps.


---

## Tips

1. **Use `setInputFiles` for uploads**. Even drag-and-drop zones have an underlying `input[type="file"]`. Target it directly instead of simulating OS-level drag events.
2. **Prefer in-memory buffers**. Typed stubs built with `Buffer.from()` keep tests self-contained. Use `test/fixtures/` files only when the app needs real content (a valid PDF it parses, a real PNG it measures).
3. **Set up the download listener before clicking**. Call `page.waitForEvent('download')` before the click that triggers the download, inside the page-object method, or the event is missed.
4. **Use `createReadStream()` for content verification**. Reading from the stream avoids disk I/O and cleanup of temporary files.
5. **Test both the `accept` attribute and JavaScript validation**. `accept` only filters the OS file dialog. `setInputFiles()` bypasses it, which is exactly what exercises the app's own validation.
