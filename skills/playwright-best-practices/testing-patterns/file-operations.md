# File Upload & Download Testing

> For advanced patterns (progress tracking, cancellation, retry logic), see [file-upload-download.md](./file-upload-download.md). The page objects, stubs, and `readDownload` util named below are defined there and reused here.

## Table of Contents

1. [File Downloads](#file-downloads)
2. [File Uploads](#file-uploads)
3. [Drag and Drop](#drag-and-drop)
4. [File Content Verification](#file-content-verification)

## File Downloads

### Basic Download

`ExportsPage.download(name)` registers `page.waitForEvent('download')` before the click and returns the `Download`. The spec checks `suggestedFilename()` and saves the file with `saveAs`.

```ts
// e2e/exports/exports-basic.spec.ts
import type { Download } from '@playwright/test';

import { expect, test } from './exports.fixture';

test.describe('FEATURE: exports basic download', () => {
  test.describe('GIVEN the exports page', () => {
    test.beforeEach(async ({ exportsPage }): Promise<void> => {
      await test.step('GIVEN the exports page is open', (): Promise<void> => exportsPage.goto());
    });

    test('SCENARIO: downloading the PDF report offers report.pdf', async ({ exportsPage }, testInfo): Promise<void> => {
      const savePath = testInfo.outputPath('report.pdf');

      const download = await test.step('WHEN the PDF report is downloaded', (): Promise<Download> => exportsPage.download('Download PDF'));

      await test.step('THEN the filename is report.pdf', (): void => expect(download.suggestedFilename()).toBe('report.pdf'));

      await test.step('AND it is saved into the test output directory', (): Promise<void> => download.saveAs(savePath));
    });
  });
});
```

### Download with Custom Path

`testInfo.outputPath()` is unique per test, so parallel workers never collide. `testInfo.attach()` puts the saved file into the HTML report. `saveDownload` does both and returns the path.

```ts
// e2e/exports/test/utils/download-save.spec.util.ts
import type { Download, TestInfo } from '@playwright/test';

export const saveDownload = async (download: Download, testInfo: TestInfo): Promise<string> => {
  const savePath = testInfo.outputPath(download.suggestedFilename());

  await download.saveAs(savePath);
  await testInfo.attach('downloaded-file', { path: savePath });

  return savePath;
};
```

A spec calls `saveDownload(download, testInfo)` in an `AND` step typed `(): Promise<string>` and asserts `expect(savedPath).toContain(testInfo.outputDir)` in a `THEN` step.

| Need | Call |
|---|---|
| Per-test path | `testInfo.outputPath('name.ext')` |
| File in the HTML report | `testInfo.attach('label', { path })` |
| Shared directory per test | `downloadDir` fixture below |
| Playwright's own temp path | `await download.path()` |

### Multiple Downloads

`collectDownloads()` subscribes to `page.on('download')` and returns the array it fills. The spec calls it before the click and polls the array length with `expect.poll`, then counts PDFs through a util.

```ts
// e2e/exports/pages/batch-export.page.ts
import type { Download, Locator, Page } from '@playwright/test';

export class BatchExportPage {
  public readonly downloadSelectedButton: Locator;
  public readonly selectAllCheckbox: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    this.page = page;
    this.downloadSelectedButton = page.getByRole('button', { name: 'Download Selected' });
    this.selectAllCheckbox = page.getByRole('checkbox', { name: 'Select All' });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/batch-export');
  }

  public collectDownloads(): Download[] {
    const downloads: Download[] = [];

    this.page.on('download', (download: Download): number => downloads.push(download));

    return downloads;
  }

  public async selectAll(): Promise<void> {
    await this.selectAllCheckbox.check();
  }

  public async downloadSelected(): Promise<void> {
    await this.downloadSelectedButton.click();
  }
}
```

```ts
// e2e/exports/test/utils/download-count.spec.util.ts
import type { Download } from '@playwright/test';

const isPdf = (download: Download): boolean => download.suggestedFilename().endsWith('.pdf');

export const pdfCount = (downloads: Download[]): number => downloads.filter(isPdf).length;
```

```ts
// e2e/exports/batch-export.spec.ts
import type { Download } from '@playwright/test';

import { expect, test } from './exports.fixture';
import { pdfCount } from './test/utils/download-count.spec.util';

const BATCH_TIMEOUT = 30_000;

test.describe('FEATURE: batch export', () => {
  test.describe('GIVEN the batch export page', () => {
    test.beforeEach(async ({ batchExportPage }): Promise<void> => {
      await test.step('GIVEN the batch export page is open', (): Promise<void> => batchExportPage.goto());
    });

    test('SCENARIO: downloading all items yields five PDFs', async ({ batchExportPage }): Promise<void> => {
      const downloads = await test.step('GIVEN downloads are collected', (): Download[] => batchExportPage.collectDownloads());

      await test.step('WHEN all items are selected', (): Promise<void> => batchExportPage.selectAll());

      await test.step('AND the selection is downloaded', (): Promise<void> => batchExportPage.downloadSelected());

      await test.step('THEN five downloads arrive', (): Promise<void> => expect.poll((): number => downloads.length, { timeout: BATCH_TIMEOUT }).toBe(5));

      await test.step('AND every download is a PDF', (): void => expect(pdfCount(downloads)).toBe(5));
    });
  });
});
```

### Download Fixture

`downloadDir` creates a per-test directory under `testInfo.outputPath` so parallel runs never share a path. A spec joins the suggested filename onto it and calls `saveAs`; the filename assertion stays in the spec as its own step. `AnalyticsPage` is the page object from `file-upload-download.md`.

```ts
// e2e/exports/exports.fixture.ts
import { mkdirSync } from 'node:fs';

import { test as base } from '@playwright/test';

import { AnalyticsPage } from './pages/analytics.page';
import { BatchExportPage } from './pages/batch-export.page';
import { ExportsPage } from './pages/exports.page';

type ExportsFixtures = {
  readonly analyticsPage: AnalyticsPage;
  readonly batchExportPage: BatchExportPage;
  readonly downloadDir: string;
  readonly exportsPage: ExportsPage;
};

export const test = base.extend<ExportsFixtures>({
  analyticsPage: async ({ page }, use): Promise<void> => {
    await use(new AnalyticsPage(page));
  },
  batchExportPage: async ({ page }, use): Promise<void> => {
    await use(new BatchExportPage(page));
  },
  downloadDir: async ({}, use, testInfo): Promise<void> => {
    const dir = testInfo.outputPath('downloads');

    mkdirSync(dir, { recursive: true });
    await use(dir);
  },
  exportsPage: async ({ page }, use): Promise<void> => {
    await use(new ExportsPage(page));
  }
});

export { expect } from '@playwright/test';
```

A spec destructures `downloadDir`, computes `path.join(downloadDir, download.suggestedFilename())` as a `const`, and passes it to `download.saveAs` in one step, as in the basic download spec above.

## File Uploads

### Basic Upload

The spec hands `selectPicture()` a path under `test/fixtures/`.

`ProfilePage` owns `alert` (`getByRole('alert')`), `pictureInput` (`getByLabel('Profile Picture')`), `preview` (`getByAltText('Profile preview')`) and `saveButton`. Methods: `goto()`, `selectPicture(filePath)` calling `pictureInput.setInputFiles(filePath)`, `save()`, and boxed `expectPreview()` asserting `toBeVisible()` on the preview.

```ts
// e2e/profile/profile.spec.ts
import path from 'node:path';

import { expect, test } from './profile.fixture';

test.describe('FEATURE: profile picture upload', () => {
  test.describe('GIVEN the profile settings page', () => {
    test.beforeEach(async ({ profilePage }): Promise<void> => {
      await test.step('GIVEN the profile page is open', (): Promise<void> => profilePage.goto());
    });

    test('SCENARIO: saving the profile with avatar.png updates it', async ({ profilePage }): Promise<void> => {
      const avatarPath = path.join(__dirname, 'test/fixtures/avatar.png');

      await test.step('GIVEN avatar.png is selected', (): Promise<void> => profilePage.selectPicture(avatarPath));

      await test.step('AND the preview is shown', (): Promise<void> => profilePage.expectPreview());

      await test.step('WHEN the profile is saved', (): Promise<void> => profilePage.save());

      await test.step('THEN the alert confirms the update', (): Promise<void> => expect(profilePage.alert).toContainText('Profile updated'));
    });
  });
});
```

`profile.fixture.ts` follows the fixture shape in `core/house-style.md` and exposes `profilePage`.

### Selecting Files

`setInputFiles` accepts a path, a path array, `{ name, mimeType, buffer }`, or an array of those; `UploadSelection` in `file-upload-download.md` is that union and `AttachmentsPage.select()` takes it. `CSV_FILE_STUB` and `PDF_FILE_STUB` in `test/stubs/attachments.stub.ts` build their buffer with `Buffer.from()`; a case spreads a stub to rename it or change its content. `clearSelection()` calls `setInputFiles([])`, and a second `select()` replaces the file.

| Source | Call | Spec |
|---|---|---|
| One path | `attachmentsPage.select(path.join(__dirname, 'test/fixtures/document.pdf'))` | `file-upload-download.md` "From Fixture File or In-Memory Buffer" |
| Several paths | `attachmentsPage.select(DOC_PATHS)` with `const DOC_PATHS: string[] = ['doc1.pdf', 'doc2.pdf'].map(…)` | `file-upload-download.md` "Multiple File Upload" |
| In-memory buffer | `attachmentsPage.select({ ...CSV_FILE_STUB, buffer: Buffer.from('Name,Email\nJohn,john@example.com'), name: 'users.csv' })` | `file-upload-download.md` "From Fixture File or In-Memory Buffer" |
| Native chooser | `const chooser = await test.step('WHEN the native chooser is opened', (): Promise<FileChooser> => avatarPage.openFileChooser());` then `chooser.setFiles(documentPath)`, same arguments as `setInputFiles` | `file-upload-download.md` "File Chooser Dialog" |
| Clear and replace | `attachmentsPage.clearSelection()` then `attachmentsPage.select(NEW_PDF)` | below |

```ts
// e2e/attachments/attachments-replace.spec.ts
import { test } from './attachments.fixture';
import { PDF_FILE_STUB } from './test/stubs/attachments.stub';

const OLD_PDF = { ...PDF_FILE_STUB, name: 'old.pdf' };
const NEW_PDF = { ...PDF_FILE_STUB, name: 'new.pdf' };

test.describe('FEATURE: attachments replace', () => {
  test.describe('GIVEN the attachments page', () => {
    test.beforeEach(async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: clearing and refilling the selection lists only the new file', async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN old.pdf is selected', (): Promise<void> => attachmentsPage.select(OLD_PDF));

      await test.step('AND old.pdf is listed', (): Promise<void> => attachmentsPage.expectListed('old.pdf'));

      await test.step('WHEN the selection is cleared', (): Promise<void> => attachmentsPage.clearSelection());

      await test.step('AND new.pdf is selected', (): Promise<void> => attachmentsPage.select(NEW_PDF));

      await test.step('THEN new.pdf is listed', (): Promise<void> => attachmentsPage.expectListed('new.pdf'));

      await test.step('AND old.pdf is gone', (): Promise<void> => attachmentsPage.expectNotListed('old.pdf'));
    });
  });
});
```

## Drag and Drop

### Drag and Drop Upload

When the drop zone has no file input, build a `DataTransfer` in the page with `evaluateHandle`, add a `File` to it, and dispatch `drop` with the handle. `dropFile` owns all three calls.

```ts
// e2e/attachments/test/utils/drop-file.spec.util.ts
import type { JSHandle, Locator, Page } from '@playwright/test';

import type { UploadFile } from '../../common/attachments.type';

type DropPayload = {
  readonly bytes: number[];
  readonly mimeType: string;
  readonly name: string;
};

const createDataTransfer = (): DataTransfer => new DataTransfer();

const addFile = (dataTransfer: DataTransfer, payload: DropPayload): void => {
  const file = new File([new Uint8Array(payload.bytes)], payload.name, { type: payload.mimeType });

  dataTransfer.items.add(file);
};

export const dropFile = async (page: Page, zone: Locator, file: UploadFile): Promise<void> => {
  const payload: DropPayload = { bytes: [...file.buffer], mimeType: file.mimeType, name: file.name };
  const dataTransfer: JSHandle<DataTransfer> = await page.evaluateHandle(createDataTransfer);

  await dataTransfer.evaluate(addFile, payload);
  await zone.dispatchEvent('drop', { dataTransfer });
};
```

```ts
// e2e/attachments/drop-event.spec.ts
import { expect, test } from './attachments.fixture';
import { PDF_FILE_STUB } from './test/stubs/attachments.stub';
import { dropFile } from './test/utils/drop-file.spec.util';

test.describe('FEATURE: attachments drop event', () => {
  test.describe('GIVEN the attachments page', () => {
    test.beforeEach(async ({ attachmentsPage }): Promise<void> => {
      await test.step('GIVEN the attachments page is open', (): Promise<void> => attachmentsPage.goto());
    });

    test('SCENARIO: dropping report.pdf on the zone reports the upload', async ({ attachmentsPage, page }): Promise<void> => {
      await test.step('WHEN report.pdf is dropped on the zone', (): Promise<void> => dropFile(page, attachmentsPage.dropZone.root, PDF_FILE_STUB));

      await test.step('THEN the alert reports the upload', (): Promise<void> => expect(attachmentsPage.alert).toContainText('report.pdf uploaded'));
    });
  });
});
```

### Simpler Drag and Drop

Most drop zones wrap a hidden `input[type="file"]`. `setInputFiles` works on a hidden input, so `AttachmentsPage.select()` is enough and no drag event is needed. The "Drag-and-Drop Zones" section of `file-upload-download.md` shows that spec.

## File Content Verification

Each parser reads the file Playwright already saved at `download.path()`; `readDownload` (in `file-upload-download.md`) reads the stream instead, so no file touches disk. One util per format returns a typed value, the spec parses in an `AND` step and asserts in `THEN` steps. The PDF spec below is the shape; the other formats swap the util, the step return type, and the assertions.

| Format | Util | Step returns | Assertions |
|---|---|---|---|
| PDF text | `readPdfText(download)` | `Promise<string>` | `expect(text).toContain('Invoice #123')` |
| Excel rows | `readSheetRows(download)` | `Promise<ExportRow[]>` | `expect(rows).toHaveLength(10)`, `expect(rows[0]).toHaveProperty('Name')` |
| JSON payload | `readJsonPayload(download)` | `Promise<ExportPayload>` | `expect(payload.users).toHaveLength(5)`, `expect(payload.exportDate).toBeDefined()` |
| CSV text | `readDownload(download)` | `Promise<string>` | `expect(content).toContain('Name,Email,Status')`, `expect(content.trim().split('\n').length).toBeGreaterThan(1)` |

Each parser reads the file Playwright already saved at `download.path()`. One util per format returns a typed value; the spec asserts on it.

### Verify PDF Content

```ts
// e2e/exports/test/utils/pdf-text.spec.util.ts
import { readFile } from 'node:fs/promises';

import type { Download } from '@playwright/test';
import pdf from 'pdf-parse';

export const readPdfText = async (download: Download): Promise<string> => {
  const filePath = await download.path();
  const buffer = await readFile(filePath);
  const parsed = await pdf(buffer);

  return parsed.text;
};
```

### Verify Excel Content

`sheet_to_json` takes the row type as a generic. Column headers become keys, so `ExportRow` keeps their case. `ExportResult` is the type `AnalyticsPage.exportPdf()` in `file-upload-download.md` returns.

```ts
// e2e/exports/common/exports.type.ts
import type { Download, Response } from '@playwright/test';

export type ExportResult = {
  readonly download: Download;
  readonly response: Response;
};

export type ExportRow = {
  readonly Email: string;
  readonly Name: string;
};

export type ExportPayload = {
  readonly exportDate: string;
  readonly users: ExportRow[];
};
```

```ts
// e2e/exports/test/utils/sheet-rows.spec.util.ts
import type { Download } from '@playwright/test';
import XLSX from 'xlsx';

import type { ExportRow } from '../../common/exports.type';

export const readSheetRows = async (download: Download): Promise<ExportRow[]> => {
  const filePath = await download.path();
  const workbook = XLSX.readFile(filePath);
  const [firstSheetName] = workbook.SheetNames;
  const sheet = workbook.Sheets[firstSheetName];

  return XLSX.utils.sheet_to_json<ExportRow>(sheet);
};
```

### Verify JSON Download

`readDownload` returns the text; a typed `const` gives `JSON.parse` a contract without a cast.

```ts
// e2e/exports/test/utils/json-payload.spec.util.ts
import type { Download } from '@playwright/test';

import type { ExportPayload } from '../../common/exports.type';
import { readDownload } from './download-content.spec.util';

export const readJsonPayload = async (download: Download): Promise<ExportPayload> => {
  const content = await readDownload(download);
  const payload: ExportPayload = JSON.parse(content);

  return payload;
};
```

```ts
// e2e/exports/exports-formats.spec.ts
import type { Download } from '@playwright/test';

import { expect, test } from './exports.fixture';
import { readPdfText } from './test/utils/pdf-text.spec.util';

test.describe('FEATURE: exports formats', () => {
  test.describe('GIVEN the exports page', () => {
    test.beforeEach(async ({ exportsPage }): Promise<void> => {
      await test.step('GIVEN the exports page is open', (): Promise<void> => exportsPage.goto());
    });

    test('SCENARIO: downloading the invoice yields a PDF whose text names it', async ({ exportsPage }): Promise<void> => {
      const download = await test.step('WHEN the invoice is downloaded', (): Promise<Download> => exportsPage.download('Download Invoice'));

      const text = await test.step('AND the PDF text is parsed', (): Promise<string> => readPdfText(download));

      await test.step('THEN the invoice number is present', (): void => expect(text).toContain('Invoice #123'));

      await test.step('AND the total is present', (): void => expect(text).toContain('Total: $99.99'));
    });
  });
});
```

## Anti-Patterns to Avoid

| Anti-Pattern                          | Problem                         | Solution                                      |
| ------------------------------------- | ------------------------------- | --------------------------------------------- |
| Not waiting for download              | Race condition, test fails      | Register `waitForEvent('download')` before the click, inside the page-object method |
| Hardcoded download paths              | Conflicts in parallel runs      | Use `testInfo.outputPath()`                   |
| Skipping content verification         | Download might be empty/corrupt | Verify file content when possible             |
| Using `force: true` for hidden inputs | May not trigger proper events   | Use `setInputFiles` on hidden inputs directly |

## Related References

- **Fixtures**: See [fixtures-hooks.md](../core/fixtures-hooks.md) for download fixture patterns
- **Debugging**: See [debugging.md](../debugging/debugging.md) for troubleshooting download issues
