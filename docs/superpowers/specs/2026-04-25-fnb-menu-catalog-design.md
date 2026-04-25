# F&B Control Pane — Menu & Catalog Sub-Project Design

**Date:** 2026-04-25
**Status:** Approved (brainstorming phase complete; ready for implementation planning)
**Sub-project:** 1 of 7 — Menu & Catalog
**Repo:** `/Users/parth.vora/code/fnb-control-pane`
**Depends on:** Foundation (sub-project 0). All Foundation primitives are assumed present.

---

## 1. Project context

### 1.1 Where this sub-project sits

Menu & Catalog is the canonical source of "what does this restaurant sell, at what price, with what options" for every downstream sub-project. POS, Online Ordering, and Analytics all read from it.

| # | Sub-project | Status |
|---|---|---|
| 0 | Foundation | **Complete** |
| 1 | **Menu & Catalog** | **This spec** |
| 2 | POS / In-Person Orders | Future |
| 3 | Floor / Tables / Reservations | Future |
| 4 | Online Orders | Future |
| 5 | Staff & Scheduling | Future |
| 6 | Analytics & Guest CRM | Future |
| — | Payroll | Out of scope |

### 1.2 Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Menu sharing across locations | Tenant master catalog with per-location overrides (Clover-style inheritance) |
| Modifier model | Grouped modifiers with `minSelections` / `maxSelections`; reusable `ModifierGroup`s |
| Time-varying menus | First-class `Menu` entity with weekly schedules |
| Size variants (S/M/L) | Modeled as a required `ModifierGroup` ("Size"), not separate item rows |
| `MenuItem` primary category | Optional `categoryId` for analytics rollups; `MenuSection` governs display order |
| Tax categories | Tenant-level `TaxCategory` (FOOD / NON_ALCOHOL_BEV / ALCOHOL / RETAIL / OTHER); time-bounded rates per Location |
| Photos | Single `imageUrl` per item; upload UX deferred |
| Dietary / allergen tags | Multi-select `String[]` with Zod-enforced enum values |
| Inventory / 86 status | Boolean `available` on per-location override row; full inventory tracking deferred |
| Course & kitchen routing | `course` enum + `printerStation` string on `MenuItem`; KDS routing logic in POS |
| Draft / publish workflow | Deferred — edit and save |
| Multi-language descriptions | Deferred — English only |
| Drag-and-drop reorder | `@dnd-kit` added to `@repo/ui` |

### 1.3 RBAC scope rules

| Operation | Required scope |
|---|---|
| Read master catalog | `manager` (any active membership in the tenant) |
| Write master catalog | `admin` (tenant-wide ADMIN/OWNER) |
| Read location menus | `manager` (location-scoped or tenant-wide) |
| Write location menus | `manager` (location-scoped or tenant-wide) |
| Read/write location overrides | `manager` (location-scoped or tenant-wide) |
| `setItem86` (toggle availability) | `staff` — line cooks must be able to do this fast |

---

## 2. Architecture

### 2.1 Repo impact (purely additive to Foundation)

```
packages/db/prisma/schema.prisma        ← additions only; no changes to Foundation models
packages/validation/src/menu.ts          ← new
packages/validation/src/modifier.ts      ← new
packages/ui/src/patterns/schedule-editor.tsx       ← new
packages/ui/src/patterns/modifier-group-builder.tsx ← new
packages/ui/src/patterns/menu-item-picker.tsx       ← new
packages/ui/src/lib/format-money.ts                 ← new

apps/api/src/menu/pricing.ts             ← pure helpers
apps/api/src/menu/schedule.ts            ← pure helpers
apps/api/src/schema/menu.ts              ← Menu, MenuSection, MenuSectionItem types & queries
apps/api/src/schema/menu-item.ts         ← MenuItem, Category, TaxCategory types & queries
apps/api/src/schema/modifier.ts          ← ModifierGroup, Modifier types & queries
apps/api/src/schema/mutations/catalog/   ← one file per catalog mutation
apps/api/src/schema/mutations/menu/      ← one file per menu-composition mutation
apps/api/src/schema/mutations/location-overrides/ ← one file per override mutation

apps/web/app/(app)/[tenantSlug]/admin/catalog/      ← master catalog admin
apps/web/app/(app)/[tenantSlug]/[locationSlug]/menus/ ← location menu builder + overrides
apps/web/components/catalog/             ← shared admin components
apps/web/lib/graphql/operations/menu.graphql        ← new operations
```

### 2.2 What does NOT change

- No changes to Foundation tables (Tenant, Location, User, Membership, Invitation, AuditLog).
- No changes to GraphQL request context, Auth.js setup, or RBAC scope-auth wiring.
- No infrastructure changes — same Postgres, same gateway, same nginx topology.
- No new external services or runtime dependencies.

---

## 3. Data model

### 3.1 Master catalog (tenant-level)

```prisma
model Category {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  name         String
  slug         String
  sortOrder    Int       @default(0) @map("sort_order")
  archivedAt   DateTime? @map("archived_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  items        MenuItem[]

  @@unique([tenantId, slug])
  @@index([tenantId])
  @@map("categories")
}

model TaxCategory {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  name         String
  kind         TaxCategoryKind
  archivedAt   DateTime? @map("archived_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  rates        TaxRate[]
  items        MenuItem[]

  @@unique([tenantId, kind])
  @@map("tax_categories")
}

model TaxRate {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  taxCategoryId   String    @map("tax_category_id") @db.Uuid
  locationId      String    @map("location_id") @db.Uuid
  ratePermille    Int       @map("rate_permille")            // 825 = 8.25%
  effectiveFrom   DateTime  @default(now()) @map("effective_from")
  effectiveUntil  DateTime? @map("effective_until")

  taxCategory     TaxCategory @relation(fields: [taxCategoryId], references: [id], onDelete: Cascade)
  location        Location    @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@index([taxCategoryId, locationId, effectiveFrom])
  @@map("tax_rates")
}

model MenuItem {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String    @map("tenant_id") @db.Uuid
  categoryId        String?   @map("category_id") @db.Uuid
  taxCategoryId     String    @map("tax_category_id") @db.Uuid

  name              String
  shortDescription  String?   @map("short_description")
  description       String?
  basePriceCents    Int       @map("base_price_cents")
  imageUrl          String?   @map("image_url")
  course            ItemCourse @default(MAIN)
  printerStation    String?   @map("printer_station")
  dietaryTags       String[]  @default([]) @map("dietary_tags")
  allergenTags      String[]  @default([]) @map("allergen_tags")
  archivedAt        DateTime? @map("archived_at")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  tenant            Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  category          Category?   @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  taxCategory       TaxCategory @relation(fields: [taxCategoryId], references: [id], onDelete: Restrict)
  modifierGroups    MenuItemModifierGroup[]
  sectionItems      MenuSectionItem[]
  locationOverrides LocationItem[]

  @@index([tenantId, archivedAt])
  @@index([tenantId, categoryId])
  @@map("menu_items")
}

model ModifierGroup {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  name            String
  minSelections   Int       @default(0) @map("min_selections")
  maxSelections   Int       @default(1) @map("max_selections")
  archivedAt      DateTime? @map("archived_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  tenant          Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  modifiers       Modifier[]
  itemAttachments MenuItemModifierGroup[]

  @@index([tenantId])
  @@map("modifier_groups")
}

model Modifier {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  modifierGroupId   String    @map("modifier_group_id") @db.Uuid
  name              String
  priceDeltaCents   Int       @default(0) @map("price_delta_cents")
  isDefault         Boolean   @default(false) @map("is_default")
  sortOrder         Int       @default(0) @map("sort_order")
  archivedAt        DateTime? @map("archived_at")

  modifierGroup     ModifierGroup @relation(fields: [modifierGroupId], references: [id], onDelete: Cascade)
  locationOverrides LocationModifier[]

  @@index([modifierGroupId])
  @@map("modifiers")
}

model MenuItemModifierGroup {
  menuItemId      String   @map("menu_item_id") @db.Uuid
  modifierGroupId String   @map("modifier_group_id") @db.Uuid
  sortOrder       Int      @default(0) @map("sort_order")

  menuItem        MenuItem      @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  modifierGroup   ModifierGroup @relation(fields: [modifierGroupId], references: [id], onDelete: Cascade)

  @@id([menuItemId, modifierGroupId])
  @@map("menu_item_modifier_groups")
}
```

### 3.2 Menu composition (location-level)

```prisma
model Menu {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId   String    @map("location_id") @db.Uuid
  name         String
  description  String?
  sortOrder    Int       @default(0) @map("sort_order")
  schedule     Json?
  isActive     Boolean   @default(true) @map("is_active")
  archivedAt   DateTime? @map("archived_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  location     Location  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  sections     MenuSection[]

  @@index([locationId, archivedAt])
  @@map("menus")
}

model MenuSection {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  menuId     String    @map("menu_id") @db.Uuid
  name       String
  sortOrder  Int       @default(0) @map("sort_order")
  archivedAt DateTime? @map("archived_at")

  menu       Menu      @relation(fields: [menuId], references: [id], onDelete: Cascade)
  items      MenuSectionItem[]

  @@index([menuId])
  @@map("menu_sections")
}

model MenuSectionItem {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  menuSectionId      String    @map("menu_section_id") @db.Uuid
  menuItemId         String    @map("menu_item_id") @db.Uuid
  sortOrder          Int       @default(0) @map("sort_order")
  priceOverrideCents Int?      @map("price_override_cents")
  archivedAt         DateTime? @map("archived_at")

  menuSection MenuSection @relation(fields: [menuSectionId], references: [id], onDelete: Cascade)
  menuItem    MenuItem    @relation(fields: [menuItemId], references: [id], onDelete: Cascade)

  @@unique([menuSectionId, menuItemId])
  @@index([menuItemId])
  @@map("menu_section_items")
}
```

### 3.3 Per-location overrides

```prisma
model LocationItem {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId  String   @map("location_id") @db.Uuid
  menuItemId  String   @map("menu_item_id") @db.Uuid
  hidden      Boolean  @default(false)
  available   Boolean  @default(true)
  priceCents  Int?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  location  Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  menuItem  MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)

  @@unique([locationId, menuItemId])
  @@index([locationId])
  @@map("location_items")
}

model LocationModifier {
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId               String   @map("location_id") @db.Uuid
  modifierId               String   @map("modifier_id") @db.Uuid
  hidden                   Boolean  @default(false)
  available                Boolean  @default(true)
  priceDeltaOverrideCents  Int?     @map("price_delta_override_cents")
  createdAt                DateTime @default(now()) @map("created_at")
  updatedAt                DateTime @updatedAt @map("updated_at")

  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  modifier Modifier @relation(fields: [modifierId], references: [id], onDelete: Cascade)

  @@unique([locationId, modifierId])
  @@index([locationId])
  @@map("location_modifiers")
}
```

### 3.4 Enums

```prisma
enum TaxCategoryKind { FOOD  NON_ALCOHOL_BEV  ALCOHOL  RETAIL  OTHER }
enum ItemCourse      { APPETIZER  MAIN  DESSERT  SIDE  BEVERAGE  OTHER }
```

### 3.5 Schedule shape (TypeScript / Zod)

`Menu.schedule` is a JSON column with this shape, validated end-to-end by Zod:

```ts
type Schedule =
  | { kind: 'always' }
  | {
      kind: 'weekly';
      windows: Array<{
        days: ('MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN')[];
        start: string;   // "06:00" — local time per Location.timezone
        end:   string;   // "11:00"
      }>;
    };
```

`kind: 'always'` = always live (24/7). `kind: 'weekly'` = live whenever current local time falls inside any window. Resolved against `Location.timezone` from Foundation.

### 3.6 Schema decisions and rationale

1. **Money is integer cents.** No float, no Decimal. Currency-aware display reads `Location.currency`.
2. **Soft delete via `archivedAt`.** Hard deletes break order history audit trails (orders land in POS sub-project).
3. **Effective price resolves through three layers:** `MenuSectionItem.priceOverrideCents` → `LocationItem.priceCents` → `MenuItem.basePriceCents`. Single helper (`resolveItemPrice`) lives in `apps/api/src/menu/pricing.ts`.
4. **`dietaryTags` / `allergenTags` are `String[]` with Zod-enforced enum values**, not Postgres enums. Migration ergonomics — adding a new tag is a Zod constant change, not a migration.
5. **`TaxRate` is location-scoped and time-bounded.** Past orders compute correct tax even after a rate change.
6. **No `Variant` table.** Sizes are `ModifierGroup`s.
7. **Many-to-many for items↔modifier groups.** Same group attached to many items; same item attaches many groups.

### 3.7 What is intentionally not in the schema

- Inventory / recipe / unit tracking. Just `available: boolean` for ad-hoc 86.
- Combos / meal deals / prix-fixe.
- Promotions, coupons, loyalty pricing.
- Channel-specific visibility (in-store / online / delivery).
- Versioning / draft-publish workflow.
- Image upload to a media server. URLs only.
- Multi-language item names / descriptions.

---

## 4. GraphQL surface

### 4.1 Object types

```graphql
type Category {
  id: UUID!
  name: String!
  slug: String!
  sortOrder: Int!
  archivedAt: DateTime
  items(first: Int, after: String): MenuItemConnection!
}

type TaxCategory {
  id: UUID!
  name: String!
  kind: TaxCategoryKind!
  ratesAtLocation(locationId: UUID!): [TaxRate!]!
}

type TaxRate {
  id: UUID!
  ratePermille: Int!
  effectiveFrom: DateTime!
  effectiveUntil: DateTime
  location: Location!
}

type MenuItem {
  id: UUID!
  category: Category
  taxCategory: TaxCategory!
  name: String!
  shortDescription: String
  description: String
  basePriceCents: Int!
  imageUrl: String
  course: ItemCourse!
  printerStation: String
  dietaryTags: [String!]!
  allergenTags: [String!]!
  modifierGroups: [ModifierGroup!]!
  archivedAt: DateTime

  effectivePriceCents: Int!
  availableAtViewerLocation: Boolean!
  locationOverride: LocationItem
}

type ModifierGroup {
  id: UUID!
  name: String!
  minSelections: Int!
  maxSelections: Int!
  modifiers: [Modifier!]!
  archivedAt: DateTime
  attachedItems: [MenuItem!]!
}

type Modifier {
  id: UUID!
  name: String!
  priceDeltaCents: Int!
  isDefault: Boolean!
  sortOrder: Int!
  archivedAt: DateTime

  effectivePriceDeltaCents: Int!
  availableAtViewerLocation: Boolean!
}

type LocationItem {
  id: UUID!
  hidden: Boolean!
  available: Boolean!
  priceCents: Int
  menuItem: MenuItem!
  location: Location!
}

type Menu {
  id: UUID!
  name: String!
  description: String
  sortOrder: Int!
  schedule: JSON!
  isActive: Boolean!
  archivedAt: DateTime
  sections: [MenuSection!]!

  isLive: Boolean!
  nextWindow: ScheduleWindow
}

type MenuSection {
  id: UUID!
  name: String!
  sortOrder: Int!
  items: [MenuSectionItem!]!
  archivedAt: DateTime
}

type MenuSectionItem {
  id: UUID!
  sortOrder: Int!
  priceOverrideCents: Int
  menuItem: MenuItem!
  effectivePriceCents: Int!
}

type ScheduleWindow {
  start: DateTime!
  end: DateTime!
}

enum TaxCategoryKind { FOOD  NON_ALCOHOL_BEV  ALCOHOL  RETAIL  OTHER }
enum ItemCourse      { APPETIZER  MAIN  DESSERT  SIDE  BEVERAGE  OTHER }
```

### 4.2 Queries

```graphql
extend type Query {
  catalogItems(first: Int, after: String, filter: CatalogItemsFilter): MenuItemConnection!
  catalogItem(id: UUID!): MenuItem
  catalogCategories: [Category!]!
  catalogTaxCategories: [TaxCategory!]!
  catalogModifierGroups(first: Int, after: String): ModifierGroupConnection!
  catalogModifierGroup(id: UUID!): ModifierGroup

  locationMenus: [Menu!]!
  locationMenu(id: UUID!): Menu
  locationActiveMenus(at: DateTime): [Menu!]!
  locationOverrides: [LocationItem!]!
}

input CatalogItemsFilter {
  search: String
  categoryId: UUID
  archivedOnly: Boolean = false
  includeArchived: Boolean = false
}
```

### 4.3 Mutations

```graphql
extend type Mutation {
  # Master catalog (admin scope)
  createMenuItem(input: CreateMenuItemInput!): MenuItem!
  updateMenuItem(input: UpdateMenuItemInput!): MenuItem!
  archiveMenuItem(input: ArchiveMenuItemInput!): MenuItem!
  unarchiveMenuItem(input: UnarchiveMenuItemInput!): MenuItem!

  createCategory(input: CreateCategoryInput!): Category!
  updateCategory(input: UpdateCategoryInput!): Category!
  reorderCategories(input: ReorderCategoriesInput!): [Category!]!
  archiveCategory(input: ArchiveCategoryInput!): Category!

  createTaxCategory(input: CreateTaxCategoryInput!): TaxCategory!
  setTaxRate(input: SetTaxRateInput!): TaxRate!

  createModifierGroup(input: CreateModifierGroupInput!): ModifierGroup!
  updateModifierGroup(input: UpdateModifierGroupInput!): ModifierGroup!
  archiveModifierGroup(input: ArchiveModifierGroupInput!): ModifierGroup!
  addModifier(input: AddModifierInput!): Modifier!
  updateModifier(input: UpdateModifierInput!): Modifier!
  reorderModifiers(input: ReorderModifiersInput!): [Modifier!]!
  archiveModifier(input: ArchiveModifierInput!): Modifier!

  attachModifierGroupToItem(input: AttachModifierGroupInput!): MenuItem!
  detachModifierGroupFromItem(input: DetachModifierGroupInput!): MenuItem!

  # Menu composition (manager scope, location-scoped)
  createMenu(input: CreateMenuInput!): Menu!
  updateMenu(input: UpdateMenuInput!): Menu!
  archiveMenu(input: ArchiveMenuInput!): Menu!
  reorderMenus(input: ReorderMenusInput!): [Menu!]!

  createMenuSection(input: CreateMenuSectionInput!): MenuSection!
  updateMenuSection(input: UpdateMenuSectionInput!): MenuSection!
  reorderMenuSections(input: ReorderMenuSectionsInput!): [MenuSection!]!
  archiveMenuSection(input: ArchiveMenuSectionInput!): MenuSection!

  addItemToMenuSection(input: AddItemToMenuSectionInput!): MenuSectionItem!
  updateMenuSectionItem(input: UpdateMenuSectionItemInput!): MenuSectionItem!
  removeItemFromMenuSection(input: RemoveItemFromMenuSectionInput!): MenuSectionItem!

  # Per-location overrides (manager scope, location-scoped)
  upsertLocationItem(input: UpsertLocationItemInput!): LocationItem!
  upsertLocationModifier(input: UpsertLocationModifierInput!): LocationModifier!
  setItem86(input: SetItem86Input!): LocationItem!     # staff scope — fast 86 toggle
}
```

### 4.4 Pure helpers (single source of truth for resolution rules)

Three helpers in `apps/api/src/menu/`. Pure functions, no DB dependencies, fully unit-tested:

```ts
// pricing.ts
export function resolveItemPrice(args: {
  basePriceCents: number;
  locationOverride: { priceCents: number | null } | null;
  sectionOverride: { priceOverrideCents: number | null } | null;
}): number;

export function resolveModifierPrice(args: {
  basePriceDeltaCents: number;
  locationOverride: { priceDeltaOverrideCents: number | null } | null;
}): number;

export function resolveItemAvailability(args: {
  archivedAt: Date | null;
  locationOverride: { hidden: boolean; available: boolean } | null;
}): boolean;

// schedule.ts
export function resolveActiveMenus(args: {
  menus: Array<{ id: string; schedule: Schedule; isActive: boolean }>;
  timezone: string;
  at: Date;
}): string[];

export function nextScheduleWindow(args: {
  schedule: Schedule;
  timezone: string;
  at: Date;
}): { start: Date; end: Date } | null;
```

These are reused by POS, online ordering, and analytics in later sub-projects.

### 4.5 RBAC scope summary

| Resolver | Scope |
|---|---|
| Catalog reads (`catalog*`) | `manager` |
| Catalog writes (items, categories, modifier groups, tax categories) | `admin` |
| Menu reads (`locationMenus*`) | `manager` |
| Menu writes (create/update/reorder/archive) | `manager` |
| Override writes (`upsertLocation*`) | `manager` |
| `setItem86` | `staff` |

### 4.6 Audit log conventions

Every write mutation calls `writeAudit(ctx, ...)` with action codes:

```
catalog.item.created
catalog.item.updated
catalog.item.archived
catalog.item.unarchived
catalog.category.created
catalog.category.updated
catalog.category.archived
catalog.tax_category.created
catalog.tax_rate.set
catalog.modifier_group.created
catalog.modifier_group.updated
catalog.modifier_group.archived
catalog.modifier.added
catalog.modifier.updated
catalog.modifier.archived
catalog.item.modifier_group.attached
catalog.item.modifier_group.detached
menu.created
menu.updated
menu.archived
menu.section.created
menu.section.updated
menu.section.archived
menu.section.item_added
menu.section.item_updated
menu.section.item_removed
location.item.override_set
location.modifier.override_set
location.item.86_toggled
```

---

## 5. UI shape

### 5.1 Surface 1 — Tenant master catalog

**Route:** `/[tenantSlug]/admin/catalog/...`. Access: ADMIN+ writes, MANAGER+ reads.

```
admin/catalog/
├─ page.tsx                     redirects to /items
├─ items/
│  ├─ page.tsx                  Items list — DataTable with search, category filter, archived toggle
│  ├─ new/page.tsx              New item form
│  └─ [id]/page.tsx             Edit item
├─ modifiers/
│  ├─ page.tsx                  Modifier groups list
│  ├─ new/page.tsx
│  └─ [id]/page.tsx             Group + inline modifiers editor
├─ categories/
│  └─ page.tsx                  Inline list with drag-handle reorder
└─ taxes/
   └─ page.tsx                  Tax categories with per-location rate editor
```

**Items list:** `DataTable<MenuItem>` with columns — image thumbnail, name, category, base price, course, dietary chips, modifier group count, archived badge, row actions (Edit / Duplicate / Archive). Bulk-select for "Archive selected" only.

**Item form:** single page, two columns. Left = identity (name, descriptions, image URL with preview, category, course, dietary/allergen multi-select). Right = pricing & ops (base price, tax category, printer station, archive toggle). Below = attached modifier groups with drag-orderable list + "Attach group" combobox.

**Modifier group editor:** group name, min/max selection inputs with friendly explanations ("Required — pick exactly 1" / "Optional — up to 3"). Below: drag-orderable list of modifiers, inline editable. Right sidebar: "Attached to" — list of items using this group.

**Categories page:** single inline `DataTable` with drag-handle reorder. Add row at bottom.

**Taxes page:** list of tax categories. Each row expands to per-location rates table. "Set new rate" dialog: rate input as percentage, effective-from date.

### 5.2 Surface 2 — Location menu builder

**Route:** `/[tenantSlug]/[locationSlug]/menus/...`. Access: MANAGER+ on this location.

```
[locationSlug]/menus/
├─ page.tsx                     Menus list with "Live now" badges
├─ new/page.tsx                 New menu form
├─ [menuId]/page.tsx            Menu builder
└─ overrides/
   └─ page.tsx                  86 board + price/visibility overrides
```

**Menus list:** `DataTable<Menu>` — name, schedule summary (humanized: "Mon–Fri 6am–11am"), item count, "Live now" badge if `isLive`, status, row actions. Top of page: one-line summary of currently-live menus.

**Menu builder:** the most interactive screen.

- **Top bar:** menu name (inline editable), schedule editor button, "Live now" badge with next-window preview, archive toggle.
- **Body:** vertical list of `MenuSection` cards. Each section: header with name (inline edit), drag handle, kebab menu (Rename / Archive). Section body: list of `MenuSectionItem` rows with thumbnail, name, base price (struck through if overridden), price-override input, drag handle, remove button. "Add item" combobox per section, typeahead-filtered.
- **Footer:** "Add section" button.

Reorder uses `dnd-kit`, mutations are debounced and optimistically applied.

**Schedule editor (`@repo/ui/patterns/schedule-editor.tsx`):** dialog with mode toggle (Always live / Schedule). Schedule mode: list of windows, each = day-of-week pills + start time + end time. Live preview pane below: "This menu will be live next on Monday at 6:00 am" using `nextScheduleWindow` helper.

**Overrides + 86 board:** stacked tables.
- 86 board (top, prominent): items currently 86'd at this location, "Mark available" button per row.
- Price & visibility overrides: items with override rows. Columns: name, base price, location price (editable), hidden toggle, reset button. "Add override" combobox.

### 5.3 Cross-cutting UI bits

- **Money formatting:** `formatMoney(cents, currency)` in `@repo/ui`, uses `Intl.NumberFormat` keyed off `Location.currency`.
- **Image previews:** 64×64 rounded thumbnails. Null → stylized `ImageOff` placeholder.
- **Empty states:** `EmptyState` from `@repo/ui` with friendly copy + primary CTA. The "no overrides" empty state is positively framed ("every item uses the master catalog price").
- **Command palette additions:** "Go to catalog items", "New menu item", "Go to location menus", "Mark item 86…" (opens quick action dialog).
- **Drag-and-drop:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` added to `@repo/ui`.

### 5.4 What is intentionally not in the UI

- Customer-facing menu render (POS / Online Ordering).
- Bulk CSV import / export.
- Print-preview / printable menus.
- Image upload to a media server.
- Menu duplication / clone-for-next-season wizard.
- Modifier group templates / library.

---

## 6. Testing

### 6.1 Unit tests (Vitest)

- `resolveItemPrice` — section override wins, location override fallback, base fallback.
- `resolveModifierPrice` — same chain for modifier delta.
- `resolveItemAvailability` — archived item never available; location override `hidden` or `available: false` makes it unavailable.
- `resolveActiveMenus` — `kind: 'always'` always returns id; `kind: 'weekly'` matches windows in correct timezone; daylight-saving boundary is correct.
- `nextScheduleWindow` — returns next start, or current end if currently live.
- Zod schemas (Schedule, all mutation inputs) — accept valid, reject specific invalid shapes.

### 6.2 API integration tests (Vitest + Testcontainers)

Required happy + forbidden cases for every mutation. Specific scenarios beyond per-mutation tests:

- **Catalog inheritance from a location's perspective:** create master item with base price; create LocationItem override with priceCents; query `MenuItem.effectivePriceCents` from a context scoped to that location → returns override; query the same item from another location with no override → returns base.
- **86 toggle round-trip:** `setItem86(false)` from a STAFF context succeeds; `MenuItem.availableAtViewerLocation` flips to false; `setItem86(true)` flips it back.
- **Cross-tenant isolation:** items, modifier groups, menus from tenant A are unreachable from tenant B regardless of role (extends Foundation's tenant-isolation regression suite).
- **Cross-location bleed-through:** location A cannot edit location B's menus; LocationItem override at location A does not affect location B.
- **Tax rate time-bounding:** setting a new rate closes the previous rate's `effectiveUntil`; query returns the rate active at a given timestamp.
- **Audit log entries:** every write mutation produces exactly one audit row with the documented action code.

### 6.3 Web unit tests (Vitest + Testing Library)

- `formatMoney` with USD, EUR, JPY (no decimals).
- `ScheduleEditor` — selecting days, validating start < end, rejecting overlapping windows in the same window list (warn-only, not blocking).
- `ModifierGroupBuilder` form — required/optional toggle changes min/max display copy.
- `MenuItemPicker` — typeahead filters by name, excludes archived items, excludes items already in the section.

### 6.4 Playwright E2E

Three new specs added to `apps/web/tests/e2e/`:

- `catalog-flow.spec.ts` — admin creates a tax category, modifier group, category, and item; verifies they appear in the items list and the item detail loads correctly.
- `menu-builder.spec.ts` — manager creates a menu with `Always` schedule, adds a section, adds items, sets a section price override, verifies `locationActiveMenus` returns the menu via API call from the page.
- `location-86.spec.ts` — staff member toggles an item 86 from the overrides page; the item shows as unavailable on a subsequent fetch; toggling back restores availability.

The Foundation E2E suite (`sign-in`, `invitation-acceptance`, `tenant-isolation`) continues to pass.

---

## 7. Scope guard

### 7.1 In scope

| Capability | Notes |
|---|---|
| Tenant catalog: items, categories, modifier groups, modifiers, tax categories | ADMIN writes, MANAGER reads |
| Per-location menus with named sections and ordered items | MANAGER writes, location-scoped |
| Time-based menu schedules (always-live or weekly windows) | Resolved via `Location.timezone` |
| Per-location item overrides (hidden, available, price) | MANAGER writes |
| Per-location modifier overrides (hidden, available, price delta) | MANAGER writes |
| Effective-price resolution chain (section → location → base) | One pure helper |
| Currency-aware money display | Reads `Location.currency` |
| Dietary + allergen tags as multi-select | `String[]` validated by Zod |
| Tax categories with location-scoped, time-bounded rates | Historical orders compute correct tax |
| Audit log entries on all writes | Foundation pattern continues |
| Drag-and-drop reorder for menu sections, section items, modifiers | `@dnd-kit` |
| Soft delete via `archivedAt` | Hard deletes break order-history references |
| Command palette actions for fast catalog navigation | Plugs into Foundation's palette |

### 7.2 Explicit deferrals

| Deferred capability | Lives in |
|---|---|
| Customer-facing menu render | POS (in-restaurant) + Online Ordering |
| Order construction / cart logic | POS |
| Inventory tracking, recipes, ingredient mapping | Future (not in current decomposition) |
| Combos, meal deals, prix-fixe order grouping | POS or future Promotions |
| Promotions, coupons, loyalty pricing | Future Promotions |
| Image upload + media library | Future infra phase |
| Bulk CSV import / export | Future tooling phase |
| Menu draft / publish / scheduled rollouts | Future versioning phase |
| Multi-language item names / descriptions | Future i18n phase |
| Channel-specific item visibility | Online Ordering |
| PLU codes / legacy POS integrations | Future integrations phase |
| Nested modifiers | Future, only if a real customer asks |
| Per-size SKU tracking (Small Latte ≠ Medium Latte rows) | Future analytics requirement |
| Menu duplication wizard | Manual rebuild for now |
| Print-preview / printable menus | Future export phase |

---

## 8. Acceptance criteria

A new engineer can:

1. Sign in as the demo Acme owner from Foundation seed.
2. Navigate to `/acme/admin/catalog/items` — see an empty items list with a "New item" CTA.
3. Create a tax category "Food" of kind `FOOD`, set an 8.25% rate at the Mission St location.
4. Create a modifier group "Size" — required, exactly 1 selection — with three modifiers (Small +$0, Medium +$0.75, Large +$1.50).
5. Create a category "Drinks".
6. Create an item "Latte" — base price $4.50, category Drinks, tax category Food, attach the Size modifier group, set a dietary tag `VEGETARIAN`.
7. Navigate to `/acme/mission-st/menus/` — see an empty menus list.
8. Create a menu "All Day" with `Always` schedule, add a section "Drinks", add the Latte item to it.
9. Verify the GraphQL `locationActiveMenus` query returns the All Day menu as live.
10. Navigate to `/acme/mission-st/menus/overrides`, mark the Latte item 86 (unavailable), verify `MenuItem.availableAtViewerLocation` is `false` via the `catalogItem(id)` query at this location.
11. Mark Latte available again. Set a location-specific price of $5.00. Verify `MenuItem.effectivePriceCents` returns `500` at this location while remaining `450` at any other location with no override.
12. Confirm all 12 of the above flows are covered by either an integration test (Testcontainers) or a Playwright E2E spec.
13. CI is green: lint, typecheck, unit, integration, web build, E2E.

The Foundation acceptance criteria (Section 9 of the Foundation design) all still pass.

---

## 9. Next steps

1. User reviews and approves this spec.
2. Invoke `superpowers:writing-plans` to produce a detailed, ordered implementation plan.
3. Execute the plan via subagent-driven-development.
4. Sub-project 2 (POS / In-Person Orders) brainstorming begins after Menu & Catalog is verified.
