# Feature Modules

## Contents

- [Core Principle](#core-principle)
- [Layer Graph](#layer-graph)
- [Placement Ladder](#placement-ladder)
- [feature](#feature)
- [ui](#ui)
- [domain-logic](#domain-logic)
- [data-access](#data-access)
- [common, config, and composition roots](#common-config-and-composition-roots)
- [Angular Decorators](#angular-decorators)
- [Barrels and Cross-Module Imports](#barrels-and-cross-module-imports)
- [Naming](#naming)
- [Layout](#layout)
- [Procedure](#procedure)
- [Common Mistakes](#common-mistakes)
- [Rationalizations](#rationalizations)

## Core Principle

Slice first, layer second. One feature = one folder. Inside it, every file sits in a layer folder, and imports flow one way. A module below the layering trigger stays flat, and a chunk split off by `module-size.md` sits in the same layer folder as its entry file. The folder says what a file may touch, so its blast radius is read from the path alone.

The graph is the `boundaries` config of `lint-suite` (`eslint-plugin-boundaries`, matched by folder name, default disallow). It is a standalone export, and of the presets only `recommended` includes it; a repo that spreads `base`, `typescript`, … individually has **no** layer enforcement until it also spreads `boundaries`. Without it, apply the graph by review.

## Layer Graph

| Layer | One-line job | May import |
|---|---|---|
| `feature/` | Entry adapters: turn a route, request, or tool call into a domain call and its result into a view or response. | `feature`, `ui`, `domain-logic`, `utils`, `common` |
| `ui/` | Presentational: render inputs, emit outputs. | `ui`, `utils`, `common` |
| `domain-logic/` | Decide and orchestrate: compose `data-access` + `utils`, own loading, error, retry, and fallback policy. | `domain-logic`, `data-access`, `utils`, `common` |
| `data-access/` | Talk to the outside or remember: HTTP, SQL, SDKs, messaging, storage, state stores. | `data-access`, `utils`, `common` |
| `utils/` | Pure functions, per `utility-style.md`. | `utils`, `common` |
| `common/` | Types, constants, contract schemas, exception classes. No functions. | `common` |

- `feature` never imports `data-access`, not even a type. A type both sides need is a `common/` type.
- `ui` never imports `domain-logic` or `feature`.
- `domain-logic` never imports `feature`. A service that needs a component (opening a dialog) is a `feature` service.
- `data-access` never imports `domain-logic`.
- `config/` is not a `boundaries` element, so lint leaves it unchecked. Treat it like `common/`: it imports only `common/` and is imported by `data-access`, `domain-logic` (environment tokens), and composition roots.
- A `feature` that needs one `data-access` call still goes through a `domain-logic` function, even a one-line forwarder. The forwarder is the only legal road and the seam where the next rule lands.

## Placement Ladder

First matching rung wins.

1. Type, constant, contract schema, exception class → `common/`.
2. Pure function → `utils/`.
3. Touches the outside (network, DB, SDK, file system, browser messaging, storage) or holds store or persisted state → `data-access/`. View-only state shared across components (`signal()` with no persistence) is `domain-logic`.
4. Decides, sequences calls, maps errors to state, or wraps a store → `domain-logic/`.
5. Receives a route, request, guard check, or tool call, or renders with injected app services → `feature/`.
6. Renders only from inputs → `ui/`.
7. Wires providers, plugins, or routes and holds no logic → composition root (outside the layers).

## feature

Entry adapters. On the frontend these are smart components; on a server, request handlers.

| Concern | Rule |
|---|---|
| Files | `<name>.component.ts` (smart component), `<name>.guard.ts` (functional `CanActivateFn`), `<name>.seo.config.ts` (page metadata), `<name>.handler.ts` (HTTP / MCP / CLI handler), `<verb-noun>.ts` for a server `preHandler` hook (`require-user.ts`), `<name>.plugin.ts` (Fastify `fp(...)` plugin that adds request hooks), `<name>.service.ts` only for a UI-coupled service that opens a `feature` component (dialog). |
| Injects | `domain-logic` services and state facades, plus Angular framework and router primitives (`Router`, `DestroyRef`, `Injector`, `Title`, `Meta`, `DOCUMENT`), through `inject()` into `private readonly` fields. Nothing from `data-access`. |
| Reads data | A `Signal` from a state facade (`this.favoritesState.get()`), a `resource()` returned by a service, or `toSignal()` over a service `Observable`. |
| Triggers work | Calls a service method. Fire-and-forget names the promise, then `void load.catch(ignoreRecordedError)`: the orchestrator already wrote the error to state and rethrew, and the `catch` only stops an unhandled rejection. Only a method that records its error through `fail$` may be fired this way; a bare forwarder's caller handles the error itself. `ignoreRecordedError` is one shared no-op, `export const ignoreRecordedError = (): void => undefined;` in `utils/ignore-recorded-error.util.ts` (an empty `{}` body fails `no-empty-function`). |
| Route input | Route params arrive as `input()` through `withComponentInputBinding()`, not by injecting `ActivatedRoute`. |
| Owns | Page-level concerns: forms (Signal Forms `form()` on Angular 22+), SEO config, translation (`*transloco`, `t('key')`), `@defer` boundaries. |
| Feeds `ui` | Passes plain values and already-translated strings as inputs; listens to outputs. |
| Composition | A presentational component that renders a `feature` component stays in `feature/`, because `ui` may not import `feature`. |
| Guards | Functional `CanActivateFn`: `inject()` a state facade, read its signal, return a boolean or a `UrlTree`. |
| Server handler | `async (request: FastifyRequest<Typed>, reply: FastifyReply): Promise<void>`. Input is already validated by the route schema. Destructure, call one `domain-logic` function with `request.user.userId`, map the outcome to a status: `if (!updated) return reply.code(404).send(NOT_FOUND)`. |
| Never | `inject(Store)`, `inject(HttpClient)`, an `.api.ts` / `.db.ts` / `.client.ts` / `.messaging.ts` import, a third-party SDK call, a business decision (plan building, price, quota), `catchError` policy. |

```ts
// favorites/feature/favorites.component.ts
@Component({ selector: 'app-favorites', templateUrl: './favorites.component.html', imports: [UiHistoryMenuComponent] })
export class FavoritesComponent {
  private readonly favoritesService = inject(FavoritesService);
  private readonly favoritesState = inject(FavoritesStateService);

  public readonly favorites = this.favoritesState.get();

  public constructor() {
    const load = firstValueFrom(this.favoritesService.getFavorites$());

    void load.catch(ignoreRecordedError);
  }

  public onDelete(favoriteId: string): void {
    const deletion = firstValueFrom(this.favoritesService.deleteFavorite$(favoriteId));

    void deletion.catch(ignoreRecordedError);
  }
}
```

## ui

Presentational only. A `ui` component could be dropped into Storybook with nothing but inputs.

| Concern | Rule |
|---|---|
| Files | `<name>.component.ts`, `<name>.directive.ts`, `<name>.pipe.ts`. A pipe that only formats or sanitizes for display is `ui`, not `domain-logic`. |
| API | `input()`, `input.required()`, `output()`, `model()` for two-way `[(value)]`. Never `@Input` / `@Output`. |
| Local state | `signal()` and `computed()` for view-only state (expanded, hovered). Nothing another component reads. |
| Injects | Nothing app-authored. Only framework and CDK primitives a directive or pipe needs: `ElementRef`, `DestroyRef`, `ViewContainerRef`, `Overlay`, `DomSanitizer`, `DOCUMENT`. |
| Host | `host: { ... }` in the decorator, never `@HostBinding` / `@HostListener`. |
| Text | Receives translated strings as inputs; never calls a translation service. |
| Formatting | May call `utils/` pure functions. |
| Never | An app service, a state facade, `Router.navigate` (emit an output; the `feature` navigates), HTTP, translation, a business rule. |

```ts
// history/ui/history-menu.component.ts
@Component({ selector: 'ui-history-menu', templateUrl: './history-menu.component.html' })
export class UiHistoryMenuComponent {
  public readonly historyId = input.required<string>();
  public readonly size = input<'small' | 'medium'>('medium');
  public readonly delete = output<string>();

  public onDeleteClick(): void {
    this.delete.emit(this.historyId());
  }
}
```

## domain-logic

Decides and orchestrates. The only layer that composes I/O with state.

### Frontend roles

| File | Role | Injects | Returns |
|---|---|---|---|
| `<name>.state.service.ts` | Facade over one state slice. The only `Store` consumer in the app. No logic, no I/O. | `Store` only | `get()` / `getState()`: `Signal<T>` via `selectSignal`; `getSnapshot()`: `T` via `selectSnapshot`; `set()`, `loading(isLoading: boolean)`, `error()`, `clear()`: `void`, each one `dispatch`. `set()` and `error()` also clear loading in the reducer. |
| `<name>.service.ts` | Orchestrator. Calls `data-access`, writes results through the facade, owns the error policy. | `.api.ts` classes, state facades, cross-cutting app services (`NotifyService`, session state), runtime tokens | `Observable<T>` with a `$` suffix, or a `ResourceRef` from `resource()`. |
| `<name>.service.ts` (UI-wide state) | Shared view state with no persistence: `signal()` exposed through `asReadonly()`. | nothing or other services | `Signal<T>` |
| `<name>.provider.ts` | `provideX()` for a service, `APP_INITIALIZER`-style setup. | — | `EnvironmentProviders` |
| `<name>.interceptor.ts`, `<name>.redirect.ts` | Functional interceptors and route redirects. | services | per Angular signature |

Orchestrator flow, in order: `defer()` so `state.loading(true)` runs only on subscribe → `api.x$()` → `tap` into `state.set(value)` → `catchError` into `this.fail$(error)`, which writes `state.error(message)` and rethrows → `finalize` into `state.loading(false)` → `takeUntil(...)` last (`rxjs/no-unsafe-takeuntil`). `defer` covers an Observable that is never subscribed; `finalize` covers one cancelled by `switchMap`, `takeUntil`, or unsubscribe. Session-scoped requests use `takeUntil(this.sessionState.invalidated$(generation))`. A runtime switch (HTTP vs browser messaging) is a branch here, not in `data-access`. The `Loading` reducer patches only `loading`, never data or `error`: `finalize` runs after `set` / `error`, and a reducer that resets them wipes the result. A boolean `loading` assumes one request in flight per slice; overlapping triggers go through `switchMap` / `exhaustMap` at the trigger or a request-generation guard, or the older response overwrites the newer one.

A third-party UI service (`MatSnackBar`, `MatDialog` without a component) is wrapped by an app service here (`NotifyService`), so `feature` injects the wrapper.

```ts
// geo-location/domain-logic/geo-location.state.service.ts
@Service()
export class GeoLocationStateService {
  private readonly store = inject(Store);

  public get(): Signal<Location | null> {
    return this.store.selectSignal(GeoLocationState.selectGeoLocation);
  }

  public set(location: Location | null): void {
    this.store.dispatch(new GeoLocationSet(location));
  }

  public loading(isLoading: boolean): void {
    this.store.dispatch(new GeoLocationLoading(isLoading));
  }

  public error(message: string): void {
    this.store.dispatch(new GeoLocationError(message));
  }
}

// geo-location/domain-logic/geo-location.service.ts
@Service()
export class GeoLocationService {
  private readonly api = inject(GeoLocationApi);
  private readonly state = inject(GeoLocationStateService);

  public rehydrateProviderLocation$(): Observable<Location> {
    const request$ = defer(() => this.startRequest$());
    const setLocation = (location: Location): void => this.state.set(location);
    const failLocation = (error: unknown): Observable<never> => this.fail$(error);
    const stopLoading = (): void => this.state.loading(false);

    return request$.pipe(tap(setLocation), catchError(failLocation), finalize(stopLoading));
  }

  private startRequest$(): Observable<Location> {
    this.state.loading(true);

    return this.api.getProviderLocation$();
  }

  private fail$(error: unknown): Observable<never> {
    const message = error instanceof Error ? error.message : 'Unknown error';

    this.state.error(message);

    return throwError(() => error);
  }
}
```

### Backend roles

| Concern | Rule |
|---|---|
| Shape | Exported `async` arrow functions. Primitives and domain types in (`userId`, `historyId`), `Promise<DomainType>` out. No classes, no DI container. |
| Body | Call `data-access`, map rows to domain types with a `utils/*-mapper.util.ts`, return. A thin forwarder is correct. |
| Errors | Throw a typed exception from `common/` (`ConflictException`). The `feature` handler or the global error handler maps it to a status. |
| Telemetry | Business context goes to the wide event (`enrichWideEvent({ ... })`); an external call is wrapped in the tracking helper. |
| Framework plugins | A Fastify plugin that adds request hooks (`fp(...)`) handles `FastifyRequest`, so it is `feature/<name>.plugin.ts`; it calls `domain-logic` for the work. The app registers it in its composition root. |
| Never | `FastifyRequest` / `FastifyReply`, `fetch`, SQL, an SDK client (`new Polar`, `@ai-sdk/*`, Redis), `process.env`. |

```ts
// prompt-history/domain-logic/prompt-history.ts
export const getPromptHistory = async (userId: string, offset = 0, limit = 20): Promise<PaginatedHistory> => {
  const page = await findPromptHistory(userId, offset, limit);
  const items = page.items.map(mapPromptHistory);
  const promptHistory: PaginatedHistory = { ...page, items };

  return promptHistory;
};
```

### Never, both sides

`HttpClient`, `fetch`, file system reads, `browser.runtime` messaging, `inject(Store)` outside a `.state.service.ts`, a `feature` import, globals (`window`, `document`, `navigator`: inject `DOCUMENT` or a token), a pure transformation that belongs in `utils/`.

## data-access

Talks to the outside or remembers. No decisions: no retry policy, no user-facing error text, no mapping to view models.

### Frontend roles

| File | Role |
|---|---|
| `<name>.api.ts` | `@Service()` class, `inject(HttpClient)` only. One method per endpoint, `Observable<T>` with a `$` suffix, URL from a shared route constant. No `catchError`, no `tap` into state. |
| `<name>.messaging.ts` | Exported functions wrapping `browser.runtime.sendMessage` in an `Observable`, validating the reply with a type predicate. |
| `<name>.engine.ts` | A storage engine (`StorageEngine` for NGXS, cookie storage for SSR). |
| `<name>.token.ts` | An `InjectionToken` with a root factory that reads the platform (`IS_EXTENSION_RUNTIME`). |
| `+state/<name>.state.ts` | `@State({ name: TOKEN, defaults: INITIAL })` + `@Injectable({ providedIn: 'root' })`. Not `@Service`: NGXS needs `@Injectable`, and lint-suite `@angular-eslint/use-injectable-provided-in` rejects a bare `@Injectable()`. Static `@Selector()`s (`selectState`, `select<Thing>`). `@Action` handlers only `patchState` / `setState`: no I/O, no `dispatch` chains. |
| `+state/<name>.state.action.ts` | One flat exported class per action, named `<Slice><Verb>` (`GeoLocationSet`): `public static readonly type = '[GeoLocation] Set'`, payload as a `public readonly` field set in the constructor. No `namespace` grouping: it is not erasable syntax. Handlers: `Set` patches data and clears `loading` / `error`; `Error` patches `error` and clears `loading`; `Loading` patches `loading` only. |
| `+state/<name>.state.token.ts` | `new StateToken<NameState>('name')`. |
| `+state/<name>.state.provider.ts` | `provideNameState = (): EnvironmentProviders => provideStates([NameState], withStorageFeature([...]))`. Session, local, or cookie storage chosen here. |

The state shape type and its initial value are exported and read by the facade, so they live in `common/<name>.type.ts` and `common/<name>.const.ts`, per `typescript-style.md`. A module with several slices uses `+state/<slice>/`.

```ts
// favorites/data-access/favorites.api.ts
@Service()
export class FavoritesApi {
  private readonly httpClient = inject(HttpClient);

  public getFavorites$(): Observable<PromptFavorite[]> {
    const url = `${API_PREFIX}${API_ROUTES.prompt.favorites}`;

    return this.httpClient.get<PromptFavorite[]>(url);
  }
}
```

### Backend roles

| File | Role |
|---|---|
| `<name>.db.ts` | Exported `async` functions, one parameterized SQL statement each, run through the shared query helper. Optional `client` parameter for transactions. Return snake_case row types (`*DbSchema`). Ownership is a SQL predicate (`WHERE user_id = $1`), so another user's row never matches. |
| `<name>.client.ts` | A lazy singleton SDK client: `getPolarClient()`. |
| `<name>.api.ts` | `fetch` to a third-party REST API: read config, `schema.parse()` the response, throw a typed exception on a non-OK status. |
| `<name>.cache.ts` | Redis or in-memory cache access. |
| `<name>.store.ts`, `.lock.ts`, `.path.ts`, `.schema.ts` | File or in-memory stores, their locks and paths, and the schema that validates what the store reads back. |
| `migrations/*.sql` | Schema changes, each one listed by the migration runner. |

No `utils/` folder and no `.util.ts` inside `data-access/`. A pure helper the store needs goes to the module's `utils/`.

```ts
// prompt-favorites/data-access/prompt-favorites.db.ts
export const deleteFavoriteById = async (favoriteId: string, userId: string): Promise<number> => {
  const deleteQuery = 'DELETE FROM prompt_favorites WHERE favorite_id = $1 AND user_id = $2 RETURNING favorite_id';
  const deleteValues = [favoriteId, userId];
  const results = await executeQuery<FavoriteId, string>(deleteQuery, deleteValues, 'Deleting prompt favorite');

  return results.length;
};
```

## common, config, and composition roots

| Folder | Holds |
|---|---|
| `common/` | `<name>.type.ts`, `<name>.const.ts`, `<name>.schema.ts` (request / response contract: `z.object({...}) satisfies z.ZodType<Payload>`), `<name>.exception.ts` (exception classes with a constructor only). Never functions, never stubs. |
| `config/` | Backend: `<name>-env.schema.ts` with a private zod schema, the inferred type, and `get<Name>Env()` that parses `process.env` once at bootstrap and throws with `cause`. `<name>.config.ts` builds a typed config object from it. Frontend: environment `InjectionToken`s. Nothing else reads `process.env`. |
| Composition roots | `main.ts`, `app.config.ts`, `app.routes.ts`, `ngxs.config.ts`, `shell/`, `routes.ts`, `server.ts`, an extension `background.ts`. They wire providers, register plugins, and map routes to `feature` handlers. No logic, and no `data-access` calls beyond wiring `provideXState()`. |

Server `routes.ts` per slice: `const router = fastify.withTypeProvider<ZodTypeProvider>()`, a plugin-scoped `router.addHook('preHandler', requireUser)`, and `{ schema: { body, params, querystring } }` from `common/` on every route.

## Angular Decorators

| Angular | Rule |
|---|---|
| 22+ | `@Service()` for every root singleton: `.service.ts`, `.state.service.ts`, `.api.ts`. It implies `providedIn: 'root'` and supports `inject()` only. |
| 22+ | Non-root scope: `@Service({ autoProvided: false })`, then list it in the route or component `providers`. Custom creation: `@Service({ factory: () => ... })`. |
| 22+ | `@Injectable({ providedIn: ... })` only where `@Service` cannot go: NGXS `@State` classes and provider keys on the decorator itself (`@Injectable({ providedIn: 'root', useClass: ... })`). angular-eslint `prefer-service-decorator` enforces `@Service`; turn it off for `+state/*.state.ts`. Never a bare `@Injectable()`: lint-suite `use-injectable-provided-in` rejects it. |
| 21 and below | `@Injectable({ providedIn: 'root' })` for the same roots. |
| 22+ | Omit `changeDetection: OnPush` (default). Below 22, set it on every component. |
| 19+ | Omit `standalone: true` (default). Never `CommonModule`; import the directives the template uses. |
| All | `inject()`, never constructor injection. `input()` / `output()` / `model()`, never decorators. `host: {}`, never `@HostBinding` / `@HostListener`. `@if` / `@for` / `@switch`, never `*ngIf` / `*ngFor` / `*ngSwitch`. Library structural directives (`*transloco`) stay. `class` / `style` bindings, never `ngClass` / `ngStyle`. |

Read the version from the workspace catalog or `package.json` before choosing.

## Barrels and Cross-Module Imports

| Concern | Rule |
|---|---|
| Root barrel | One `index.ts` at a library's root is its public API for aliased imports (`@frontend/geo`). An app-internal module needs one only when something imports it by alias. Named exports only, `export type { }` on its own line. Start empty; add a symbol only when another module imports it. No `export *`. |
| Root barrel contents | Services, facades, `provideX()`, `common/` types and constants, and the pure `utils/` functions another module calls. Never an `.api.ts`, a `.db.ts`, or a `+state/` class: a consumer that needs them is skipping `domain-logic`. |
| Internal imports | No layer barrels inside a module. Import each file directly: `../data-access/geo-location.api.ts`. |
| Cross-module, aliased | A workspace alias (`@frontend/geo`) resolves to the library's root `index.ts`: the only way in. |
| Cross-module, relative | Sibling modules in one app import the exact file: types from `common/<name>.type.ts` (`type-placement` rejects a relative type import from an `index.ts`), values from the file that declares them (`../../history/domain-logic/history.service.ts`). A relative `index.ts` path fails `no-useless-path-segments`, and the directory form breaks the `.ts` extension rule. |
| Graph across modules | Direct file imports are checked by `boundaries`. An aliased import stops at the root barrel, which lint cannot see through, so the graph holds by hand there: a `data-access` file imports only another library's `common` / `utils` exports. |
| Shared modules | Code two feature modules use lives in `shared/<name>/` with the same layers. Never a `shared/` or `api/` facade folder inside a feature. |

## Naming

| Thing | Rule | Example |
|---|---|---|
| File | `<slice>.<kind>.ts` | `favorites.state.service.ts` |
| Observable | `$` suffix on the method or field | `getFavorites$()` |
| `ui` component | `Ui` class prefix, `ui-` selector | `UiNavItemComponent`, `ui-nav-item` |
| Type | Prefix + Domain + Concept + Role | `NatTableControlsIntlConfig` |
| Role suffixes | Carry meaning | `Config`, `ProviderConfig`, `Context`, `Labels`, `Map`, `Formatter` |
| Config trio | Repeat per slice | `X` / `XConfig` / `XProviderConfig` |
| Constant | `NAMESPACE_SCREAMING_SNAKE` | `NAT_TABLE_BUILT_IN_LOCALES` |
| Default variant | Core drops the infix; variants carry it | core `X_LABELS`, variant `X_CONTROLS_LABELS` |
| Canonical id | One export, never a duplicate alias | `NAT_EN_LOCALE_ID` |
| Class vs file | The class name is the file name in PascalCase, plus the `Ui` prefix in `ui/` | `icon.service.ts` → `IconService`, `ui/history-menu.component.ts` → `UiHistoryMenuComponent` |

Renaming a folder or concept renames its types too. A type exported from the root barrel gets a one-line JSDoc on each field (the public-export case of the Comments rule in `typescript-style.md`).

## Layout

```text
<feature>/                              frontend
  common/        <name>.type.ts  <name>.const.ts
  utils/         <behavior>.util.ts
  data-access/   <name>.api.ts
                 +state/  <name>.state.ts  .state.action.ts  .state.token.ts  .state.provider.ts
  domain-logic/  <name>.service.ts  <name>.state.service.ts
  feature/       <name>.component.ts  <name>.guard.ts
  ui/            <name>.component.ts
  test/          per unit-testing.md
  index.ts       public API, the only barrel

<slice>/                                backend
  common/        <name>.type.ts  <name>.schema.ts  <name>.exception.ts
  config/        <name>-env.schema.ts
  utils/         <name>-mapper.util.ts
  data-access/   <name>.db.ts  <name>.client.ts  migrations/
  domain-logic/  <name>.ts
  feature/       <name>.handler.ts
  test/
  routes.ts      composition root
  index.ts
```

Create only the folders that hold a file.

## Procedure

1. Read the Angular version and check lint: `npx eslint --print-config <file> | grep -c boundaries/dependencies`. Zero means the graph is unenforced; apply it by review and say so. `boundaries` also matches `test/utils/` and `test/common/` as the `utils` and `common` layers, so a spec util that wires a service is flagged; until lint-suite adds a `**/test/**` override, keep that wiring in the spec.
2. List the module's concerns: types and constants, pure logic, I/O or state, entry adapters (components, handlers), presentational components. Two or more: lay the layer folders that will hold a file.
3. Place each file by the ladder.
4. Walk every import against the graph. A violation moves the file or adds a `domain-logic` function, never a lint disable.
5. For a library, write the root `index.ts` with only what another library imports by alias.
6. Gate: lint clean with `boundaries` on, typecheck clean, same tests pass.

## Common Mistakes

Each row was found in a real module.

| Mistake | Fix |
|---|---|
| `feature` imports a state type from `data-access/+state/` | Move the type to `common/<name>.type.ts`. |
| Handler builds plans, caches, and calls the payment SDK | SDK call → `data-access/<name>.client.ts`; decision → `domain-logic`; handler maps the result. |
| `domain-logic` calls `@ai-sdk/*` or Redis directly | Wrap it in `data-access/<name>.client.ts` or `.cache.ts`. |
| `domain-logic` loader injects `HttpClient` or reads the file system | `data-access/<name>.api.ts` or a server-only `data-access` loader. |
| `domain-logic` service imports a `feature` component to open a dialog | Move the dialog service to `feature/`. |
| `ui` imports a pipe from `domain-logic` | A display pipe is `ui/<name>.pipe.ts`. |
| Mapper in `data-access` | `utils/<name>-mapper.util.ts`, called by `domain-logic`. |
| `api/` folder re-exporting another layer | Delete it; import the exact file (types from `common/<name>.type.ts`), or the library alias. |
| Relative `import type` from another module's `index.ts` | Import its `common/<name>.type.ts`; `type-placement` fails otherwise. |
| Root barrel exports `+state` classes or tokens | Export the facade and `provideXState()`; keep the state class private. |
| NGXS `@State` with a bare `@Injectable()` | `@Injectable({ providedIn: 'root' })`; lint-suite `use-injectable-provided-in` fails otherwise. |
| `state.loading()` called before the Observable is subscribed | Move it inside `defer()`. |
| `void firstValueFrom(x$)` with no `catch` while the orchestrator rethrows | Name the promise and `void load.catch(ignoreRecordedError)`. |
| `process.env` parsed inside each request | Parse once in `config/` at bootstrap. |
| `Loading` reducer resets data or `error` | Patch `loading` only; `finalize` would wipe the result. |
| Actions grouped in `export namespace XActions` | Flat `XSet` / `XLoading` / `XError` classes. |
| Exception class with fields, getters, or a `.class.ts` name | Constructor-only `common/<name>.exception.ts`. |
| Stub in `common/`, `+state/`, or a production barrel | `test/stubs/` per `unit-testing.md`. |
| Global `window` / `document` / `navigator` in a service | Inject `DOCUMENT` or a platform token. |
| Repo spreads `base`, `typescript`, … but not `boundaries` | Add `...boundaries` to the ESLint config. |

## Rationalizations

| Excuse | Counter |
|---|---|
| "Too small for layers, split later." | Splitting later renames imports across every consumer. Lay the folders when the concerns exist. |
| "The `domain-logic` forwarder is useless." | It is the only legal road from `feature` to `data-access`, and where the next rule lands. |
| "It is only a type import from `data-access`." | A type is a dependency. Shared types live in `common/`. |
| "The facade adds nothing over `Store`." | It is the one place that knows the state library. Swap NGXS and only facades change. |
| "This component only takes inputs, so it is `ui`." | If it renders a `feature` component or injects an app service, it is `feature`. |
| "The handler is where the request is, so the logic goes there." | The handler adapts a protocol. The decision goes to `domain-logic`. |
| "A layer barrel keeps imports short." | Short imports hide which file owns the symbol, and lint cannot check the layer behind a barrel. One root barrel per library is the public API. |
| "Lint passes, so the layers are fine." | Check that `boundaries` is spread. A passing lint without it proves nothing. |
