# CRUD Testing

> **When to use**: Testing create, read, update, and delete flows on a resource list: tables, cards, detail forms, confirm dialogs.
> **See also**: [api-testing.md](api-testing.md) for the same operations without a browser, [test-data.md](../core/test-data.md#cleanup) for cleanup layers.

## Contents

1. [Rules](#rules)
2. [Seeded Fixture](#seeded-fixture)
3. [Page Object](#page-object)
4. [Spec](#spec)
5. [Failure Paths](#failure-paths)
6. [Checklist](#checklist)

Every sample belongs to the `projects` feature. `Project` (`id`, `name`) is in `common/projects.type.ts`.

## Rules

| Rule | Why |
|---|---|
| One operation per test | A full lifecycle test (create, then edit, then delete) fails at step one and hides the other three results |
| Each test starts from a seeded state | Seeding through `request` in a fixture takes milliseconds; reusing the previous test's row couples order and breaks under `fullyParallel` |
| Create goes through the UI | It is the operation under test. Read, update, and delete seed their row through the API, then drive the UI |
| Persistence is checked after a reload | A list updated from local state passes even when the save never reached the server |
| Cleanup lives in fixture teardown | It runs when the test fails; `afterEach` does not know what the test created |
| Names are unique per test | `buildProjectName()` is `TEST_DATA_PREFIX` plus `randomUUID()`, so parallel workers never match each other's rows and the run's sweep catches leftovers. A module-level counter restarts in every worker process and collides |

## Seeded Fixture

`seedProject(request)` posts `buildProject()` and returns the created `Project` through `readJson` ([api-testing.md](api-testing.md)). `deleteProject(request, id)` has the shape of `deleteUser` in [test-data.md](../core/test-data.md#fixture-teardown): a 404 counts as gone, because the delete test already removed the row.

```ts
// e2e/projects/projects.fixture.ts
import { test as base } from '@playwright/test';

import type { Project } from './common/projects.type';
import { ProjectsPage } from './pages/projects.page';
import { deleteProject, seedProject } from './test/utils/projects-api.spec.util';

type ProjectsFixtures = {
  readonly projectsPage: ProjectsPage;
  readonly seededProject: Project;
};

export const test = base.extend<ProjectsFixtures>({
  projectsPage: async ({ page }, use): Promise<void> => {
    await use(new ProjectsPage(page));
  },
  seededProject: async ({ request }, use): Promise<void> => {
    const project = await seedProject(request);

    await use(project);
    await deleteProject(request, project.id);
  }
});

export { expect } from '@playwright/test';
```

The create test has nothing to seed, so its fixture is `newProjectName`: it yields `buildProjectName()` and after `use` deletes any project with that name through the test-only `DELETE /api/test/projects?name=`.

## Page Object

Rows are found by name, never by index: a parallel worker's row can land anywhere in the list. The confirm dialog's buttons are scoped to the dialog, so the row's own Delete button never matches.

```ts
// e2e/projects/pages/projects.page.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class ProjectsPage {
  public readonly confirmDeleteButton: Locator;
  public readonly nameInput: Locator;
  public readonly rows: Locator;
  public readonly saveButton: Locator;

  private readonly page: Page;

  public constructor(page: Page) {
    const dialog = page.getByRole('dialog');

    this.page = page;
    this.confirmDeleteButton = dialog.getByRole('button', { name: 'Delete' });
    this.nameInput = page.getByLabel('Project name');
    this.rows = page.getByRole('row');
    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  public row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByRole('cell', { exact: true, name }) });
  }

  public async goto(): Promise<void> {
    await this.page.goto('/projects');
  }

  public async rename(name: string, newName: string): Promise<void> {
    const row = this.row(name);

    await row.getByRole('button', { name: 'Edit' }).click();
    await this.nameInput.fill(newName);
    await this.saveButton.click();
  }

  public async requestDelete(name: string): Promise<void> {
    const row = this.row(name);

    await row.getByRole('button', { name: 'Delete' }).click();
  }

  public async expectListed(name: string): Promise<void> {
    const row = this.row(name);

    await expect(row).toHaveCount(1);
  }

  public async expectNotListed(name: string): Promise<void> {
    const row = this.row(name);

    await expect(row).toHaveCount(0);
  }
}
```

`confirmDelete()` clicks `confirmDeleteButton`; `cancelDelete()` clicks a `cancelDeleteButton` field scoped to the same dialog. `reload()` is `await this.page.reload();` in a block body. `create(name)` opens the New form, fills `nameInput`, and saves; `expectEmpty()` is `toBeVisible()` on an `emptyState` field (`getByText('No projects yet')`).

## Spec

The delete tests check the row is listed before acting on it, so "the row is gone" cannot pass for a row that never rendered. The update test reloads before its last check, so it proves the server kept the change.

```ts
// e2e/projects/projects.e2e.ts
import { test } from './projects.fixture';

test.describe('FEATURE: projects', () => {
  test('GIVEN a seeded project, renaming it survives a reload', async ({ projectsPage, seededProject }): Promise<void> => {
    const newName = `${seededProject.name} renamed`;

    await test.step('WHEN the projects page is opened', (): Promise<void> => projectsPage.goto());

    await test.step('AND the project is renamed', (): Promise<void> => projectsPage.rename(seededProject.name, newName));

    await test.step('THEN the new name is listed', (): Promise<void> => projectsPage.expectListed(newName));

    await test.step('WHEN the page is reloaded', (): Promise<void> => projectsPage.reload());

    await test.step('THEN the new name is still listed', (): Promise<void> => projectsPage.expectListed(newName));
  });

  test('GIVEN a seeded project, confirming the delete removes it', async ({ projectsPage, seededProject }): Promise<void> => {
    await test.step('WHEN the projects page is opened', (): Promise<void> => projectsPage.goto());

    await test.step('THEN the project is listed', (): Promise<void> => projectsPage.expectListed(seededProject.name));

    await test.step('WHEN its delete is requested', (): Promise<void> => projectsPage.requestDelete(seededProject.name));

    await test.step('AND the dialog is confirmed', (): Promise<void> => projectsPage.confirmDelete());

    await test.step('THEN the project is gone', (): Promise<void> => projectsPage.expectNotListed(seededProject.name));
  });

  test('GIVEN a seeded project, cancelling the delete keeps it', async ({ projectsPage, seededProject }): Promise<void> => {
    await test.step('WHEN the projects page is opened', (): Promise<void> => projectsPage.goto());

    await test.step('AND its delete is requested', (): Promise<void> => projectsPage.requestDelete(seededProject.name));

    await test.step('AND the dialog is cancelled', (): Promise<void> => projectsPage.cancelDelete());

    await test.step('THEN the project is still listed', (): Promise<void> => projectsPage.expectListed(seededProject.name));
  });
});
```

| Operation | Title | Steps |
|---|---|---|
| Create | `'GIVEN a new project name, creating it lists the project'` | `goto()`, `create(newProjectName)`, `expectListed`, reload, `expectListed` |
| Read | `'GIVEN a seeded project, the list shows it'` | `goto()`, `expectListed(seededProject.name)` |
| Empty | `'GIVEN no projects, the list shows the empty state'` | Its own spec on a fresh tenant ([test-data.md](../core/test-data.md#tenant-per-worker)), since other workers' rows share the list |

A native `confirm()` instead of a dialog element is accepted in the page object: `this.page.once('dialog', acceptDialog)` before the click, with `acceptDialog` a named `(dialog: Dialog): Promise<void> => dialog.accept()`.

## Failure Paths

A failing server cannot be seeded through the real API, so these route the app's own endpoint and live in `projects-errors.test.ts`. `ProjectsOptions` (in `common/projects.type.ts`) gains `failOn?: 'delete' | 'update'` and `status?: number`; `goto(options)` routes `projectErrorMock(status)` for that operation before it navigates, with the body a typed `PROJECT_ERROR_STUB`.

| Case | Opening call | Outcome to assert |
|---|---|---|
| Delete conflict | `goto({ failOn: 'delete', status: 409 })` | Error alert names the conflict; row still listed |
| Optimistic delete rolls back | `goto({ failOn: 'delete', status: 500 })` | Row disappears, then returns with an error alert: `expectNotListed` would pass early, so assert the alert first, then `expectListed` |
| Optimistic rename rolls back | `goto({ failOn: 'update', status: 500 })` | Old name listed again, new name gone, error alert shown |
| Validation | Real backend, empty or duplicate name | Field error from the server; nothing listed; the form stays open |

## Checklist

- Create, read, update, delete each have their own test and their own seeded row.
- Update and create re-check after `reload()`.
- Delete covers confirm, cancel, and a server refusal (409).
- Optimistic UI covers the rollback when the server fails.
- Empty state is covered on a list no other worker writes to.
- No test reads a row by index or by an id it did not create.
- Every seed has a teardown below `use`; the run's prefix sweep catches the rest.
