/* eslint-disable */
import type { Prisma, Tenant, Location, User, Account, Session, VerificationToken, Membership, Invitation, AuditLog, Category, TaxCategory, TaxRate, MenuItem, ModifierGroup, Modifier, MenuItemModifierGroup, Menu, MenuSection, MenuSectionItem, LocationItem, LocationModifier, Ticket, TicketItem, TicketItemModifier, Discount, Section, Table, Reservation, JobRole, EmploymentProfile, AvailabilityWindow, Shift, TimeEntry, Break } from "@prisma/client";
import type { PothosPrismaDatamodel } from "@pothos/plugin-prisma";
export default interface PrismaTypes {
    Tenant: {
        Name: "Tenant";
        Shape: Tenant;
        Include: Prisma.TenantInclude;
        Select: Prisma.TenantSelect;
        OrderBy: Prisma.TenantOrderByWithRelationInput;
        WhereUnique: Prisma.TenantWhereUniqueInput;
        Where: Prisma.TenantWhereInput;
        Create: {};
        Update: {};
        RelationName: "locations" | "memberships" | "invitations" | "auditLogs" | "categories" | "taxCategories" | "menuItems" | "modifierGroups" | "jobRoles";
        ListRelations: "locations" | "memberships" | "invitations" | "auditLogs" | "categories" | "taxCategories" | "menuItems" | "modifierGroups" | "jobRoles";
        Relations: {
            locations: {
                Shape: Location[];
                Name: "Location";
                Nullable: false;
            };
            memberships: {
                Shape: Membership[];
                Name: "Membership";
                Nullable: false;
            };
            invitations: {
                Shape: Invitation[];
                Name: "Invitation";
                Nullable: false;
            };
            auditLogs: {
                Shape: AuditLog[];
                Name: "AuditLog";
                Nullable: false;
            };
            categories: {
                Shape: Category[];
                Name: "Category";
                Nullable: false;
            };
            taxCategories: {
                Shape: TaxCategory[];
                Name: "TaxCategory";
                Nullable: false;
            };
            menuItems: {
                Shape: MenuItem[];
                Name: "MenuItem";
                Nullable: false;
            };
            modifierGroups: {
                Shape: ModifierGroup[];
                Name: "ModifierGroup";
                Nullable: false;
            };
            jobRoles: {
                Shape: JobRole[];
                Name: "JobRole";
                Nullable: false;
            };
        };
    };
    Location: {
        Name: "Location";
        Shape: Location;
        Include: Prisma.LocationInclude;
        Select: Prisma.LocationSelect;
        OrderBy: Prisma.LocationOrderByWithRelationInput;
        WhereUnique: Prisma.LocationWhereUniqueInput;
        Where: Prisma.LocationWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "memberships" | "invitations" | "taxRates" | "menus" | "locationItems" | "locationModifiers" | "tickets" | "discounts" | "sections" | "tables" | "reservations" | "employmentProfiles" | "shifts" | "timeEntries";
        ListRelations: "memberships" | "invitations" | "taxRates" | "menus" | "locationItems" | "locationModifiers" | "tickets" | "discounts" | "sections" | "tables" | "reservations" | "employmentProfiles" | "shifts" | "timeEntries";
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            memberships: {
                Shape: Membership[];
                Name: "Membership";
                Nullable: false;
            };
            invitations: {
                Shape: Invitation[];
                Name: "Invitation";
                Nullable: false;
            };
            taxRates: {
                Shape: TaxRate[];
                Name: "TaxRate";
                Nullable: false;
            };
            menus: {
                Shape: Menu[];
                Name: "Menu";
                Nullable: false;
            };
            locationItems: {
                Shape: LocationItem[];
                Name: "LocationItem";
                Nullable: false;
            };
            locationModifiers: {
                Shape: LocationModifier[];
                Name: "LocationModifier";
                Nullable: false;
            };
            tickets: {
                Shape: Ticket[];
                Name: "Ticket";
                Nullable: false;
            };
            discounts: {
                Shape: Discount[];
                Name: "Discount";
                Nullable: false;
            };
            sections: {
                Shape: Section[];
                Name: "Section";
                Nullable: false;
            };
            tables: {
                Shape: Table[];
                Name: "Table";
                Nullable: false;
            };
            reservations: {
                Shape: Reservation[];
                Name: "Reservation";
                Nullable: false;
            };
            employmentProfiles: {
                Shape: EmploymentProfile[];
                Name: "EmploymentProfile";
                Nullable: false;
            };
            shifts: {
                Shape: Shift[];
                Name: "Shift";
                Nullable: false;
            };
            timeEntries: {
                Shape: TimeEntry[];
                Name: "TimeEntry";
                Nullable: false;
            };
        };
    };
    User: {
        Name: "User";
        Shape: User;
        Include: Prisma.UserInclude;
        Select: Prisma.UserSelect;
        OrderBy: Prisma.UserOrderByWithRelationInput;
        WhereUnique: Prisma.UserWhereUniqueInput;
        Where: Prisma.UserWhereInput;
        Create: {};
        Update: {};
        RelationName: "accounts" | "sessions" | "memberships" | "invitations" | "ticketsOpened" | "ticketsClosed" | "ticketsVoided" | "ticketItemsFired" | "ticketItemsServed" | "ticketItemsVoided" | "discountsApplied" | "discountsVoided" | "tablesAssigned" | "reservationsCreated" | "employmentProfiles" | "availabilityWindows" | "shifts" | "shiftsCreated" | "timeEntries" | "timeEntryEdits";
        ListRelations: "accounts" | "sessions" | "memberships" | "invitations" | "ticketsOpened" | "ticketsClosed" | "ticketsVoided" | "ticketItemsFired" | "ticketItemsServed" | "ticketItemsVoided" | "discountsApplied" | "discountsVoided" | "tablesAssigned" | "reservationsCreated" | "employmentProfiles" | "availabilityWindows" | "shifts" | "shiftsCreated" | "timeEntries" | "timeEntryEdits";
        Relations: {
            accounts: {
                Shape: Account[];
                Name: "Account";
                Nullable: false;
            };
            sessions: {
                Shape: Session[];
                Name: "Session";
                Nullable: false;
            };
            memberships: {
                Shape: Membership[];
                Name: "Membership";
                Nullable: false;
            };
            invitations: {
                Shape: Invitation[];
                Name: "Invitation";
                Nullable: false;
            };
            ticketsOpened: {
                Shape: Ticket[];
                Name: "Ticket";
                Nullable: false;
            };
            ticketsClosed: {
                Shape: Ticket[];
                Name: "Ticket";
                Nullable: false;
            };
            ticketsVoided: {
                Shape: Ticket[];
                Name: "Ticket";
                Nullable: false;
            };
            ticketItemsFired: {
                Shape: TicketItem[];
                Name: "TicketItem";
                Nullable: false;
            };
            ticketItemsServed: {
                Shape: TicketItem[];
                Name: "TicketItem";
                Nullable: false;
            };
            ticketItemsVoided: {
                Shape: TicketItem[];
                Name: "TicketItem";
                Nullable: false;
            };
            discountsApplied: {
                Shape: Discount[];
                Name: "Discount";
                Nullable: false;
            };
            discountsVoided: {
                Shape: Discount[];
                Name: "Discount";
                Nullable: false;
            };
            tablesAssigned: {
                Shape: Table[];
                Name: "Table";
                Nullable: false;
            };
            reservationsCreated: {
                Shape: Reservation[];
                Name: "Reservation";
                Nullable: false;
            };
            employmentProfiles: {
                Shape: EmploymentProfile[];
                Name: "EmploymentProfile";
                Nullable: false;
            };
            availabilityWindows: {
                Shape: AvailabilityWindow[];
                Name: "AvailabilityWindow";
                Nullable: false;
            };
            shifts: {
                Shape: Shift[];
                Name: "Shift";
                Nullable: false;
            };
            shiftsCreated: {
                Shape: Shift[];
                Name: "Shift";
                Nullable: false;
            };
            timeEntries: {
                Shape: TimeEntry[];
                Name: "TimeEntry";
                Nullable: false;
            };
            timeEntryEdits: {
                Shape: TimeEntry[];
                Name: "TimeEntry";
                Nullable: false;
            };
        };
    };
    Account: {
        Name: "Account";
        Shape: Account;
        Include: Prisma.AccountInclude;
        Select: Prisma.AccountSelect;
        OrderBy: Prisma.AccountOrderByWithRelationInput;
        WhereUnique: Prisma.AccountWhereUniqueInput;
        Where: Prisma.AccountWhereInput;
        Create: {};
        Update: {};
        RelationName: "user";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    Session: {
        Name: "Session";
        Shape: Session;
        Include: Prisma.SessionInclude;
        Select: Prisma.SessionSelect;
        OrderBy: Prisma.SessionOrderByWithRelationInput;
        WhereUnique: Prisma.SessionWhereUniqueInput;
        Where: Prisma.SessionWhereInput;
        Create: {};
        Update: {};
        RelationName: "user";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    VerificationToken: {
        Name: "VerificationToken";
        Shape: VerificationToken;
        Include: never;
        Select: Prisma.VerificationTokenSelect;
        OrderBy: Prisma.VerificationTokenOrderByWithRelationInput;
        WhereUnique: Prisma.VerificationTokenWhereUniqueInput;
        Where: Prisma.VerificationTokenWhereInput;
        Create: {};
        Update: {};
        RelationName: never;
        ListRelations: never;
        Relations: {};
    };
    Membership: {
        Name: "Membership";
        Shape: Membership;
        Include: Prisma.MembershipInclude;
        Select: Prisma.MembershipSelect;
        OrderBy: Prisma.MembershipOrderByWithRelationInput;
        WhereUnique: Prisma.MembershipWhereUniqueInput;
        Where: Prisma.MembershipWhereInput;
        Create: {};
        Update: {};
        RelationName: "user" | "tenant" | "location";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            location: {
                Shape: Location | null;
                Name: "Location";
                Nullable: true;
            };
        };
    };
    Invitation: {
        Name: "Invitation";
        Shape: Invitation;
        Include: Prisma.InvitationInclude;
        Select: Prisma.InvitationSelect;
        OrderBy: Prisma.InvitationOrderByWithRelationInput;
        WhereUnique: Prisma.InvitationWhereUniqueInput;
        Where: Prisma.InvitationWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "location" | "invitedBy";
        ListRelations: never;
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            location: {
                Shape: Location | null;
                Name: "Location";
                Nullable: true;
            };
            invitedBy: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    AuditLog: {
        Name: "AuditLog";
        Shape: AuditLog;
        Include: Prisma.AuditLogInclude;
        Select: Prisma.AuditLogSelect;
        OrderBy: Prisma.AuditLogOrderByWithRelationInput;
        WhereUnique: Prisma.AuditLogWhereUniqueInput;
        Where: Prisma.AuditLogWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant";
        ListRelations: never;
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
        };
    };
    Category: {
        Name: "Category";
        Shape: Category;
        Include: Prisma.CategoryInclude;
        Select: Prisma.CategorySelect;
        OrderBy: Prisma.CategoryOrderByWithRelationInput;
        WhereUnique: Prisma.CategoryWhereUniqueInput;
        Where: Prisma.CategoryWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "items";
        ListRelations: "items";
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            items: {
                Shape: MenuItem[];
                Name: "MenuItem";
                Nullable: false;
            };
        };
    };
    TaxCategory: {
        Name: "TaxCategory";
        Shape: TaxCategory;
        Include: Prisma.TaxCategoryInclude;
        Select: Prisma.TaxCategorySelect;
        OrderBy: Prisma.TaxCategoryOrderByWithRelationInput;
        WhereUnique: Prisma.TaxCategoryWhereUniqueInput;
        Where: Prisma.TaxCategoryWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "rates" | "items";
        ListRelations: "rates" | "items";
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            rates: {
                Shape: TaxRate[];
                Name: "TaxRate";
                Nullable: false;
            };
            items: {
                Shape: MenuItem[];
                Name: "MenuItem";
                Nullable: false;
            };
        };
    };
    TaxRate: {
        Name: "TaxRate";
        Shape: TaxRate;
        Include: Prisma.TaxRateInclude;
        Select: Prisma.TaxRateSelect;
        OrderBy: Prisma.TaxRateOrderByWithRelationInput;
        WhereUnique: Prisma.TaxRateWhereUniqueInput;
        Where: Prisma.TaxRateWhereInput;
        Create: {};
        Update: {};
        RelationName: "taxCategory" | "location";
        ListRelations: never;
        Relations: {
            taxCategory: {
                Shape: TaxCategory;
                Name: "TaxCategory";
                Nullable: false;
            };
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
        };
    };
    MenuItem: {
        Name: "MenuItem";
        Shape: MenuItem;
        Include: Prisma.MenuItemInclude;
        Select: Prisma.MenuItemSelect;
        OrderBy: Prisma.MenuItemOrderByWithRelationInput;
        WhereUnique: Prisma.MenuItemWhereUniqueInput;
        Where: Prisma.MenuItemWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "category" | "taxCategory" | "modifierGroups" | "sectionItems" | "locationOverrides" | "ticketItems";
        ListRelations: "modifierGroups" | "sectionItems" | "locationOverrides" | "ticketItems";
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            category: {
                Shape: Category | null;
                Name: "Category";
                Nullable: true;
            };
            taxCategory: {
                Shape: TaxCategory;
                Name: "TaxCategory";
                Nullable: false;
            };
            modifierGroups: {
                Shape: MenuItemModifierGroup[];
                Name: "MenuItemModifierGroup";
                Nullable: false;
            };
            sectionItems: {
                Shape: MenuSectionItem[];
                Name: "MenuSectionItem";
                Nullable: false;
            };
            locationOverrides: {
                Shape: LocationItem[];
                Name: "LocationItem";
                Nullable: false;
            };
            ticketItems: {
                Shape: TicketItem[];
                Name: "TicketItem";
                Nullable: false;
            };
        };
    };
    ModifierGroup: {
        Name: "ModifierGroup";
        Shape: ModifierGroup;
        Include: Prisma.ModifierGroupInclude;
        Select: Prisma.ModifierGroupSelect;
        OrderBy: Prisma.ModifierGroupOrderByWithRelationInput;
        WhereUnique: Prisma.ModifierGroupWhereUniqueInput;
        Where: Prisma.ModifierGroupWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "modifiers" | "itemAttachments";
        ListRelations: "modifiers" | "itemAttachments";
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            modifiers: {
                Shape: Modifier[];
                Name: "Modifier";
                Nullable: false;
            };
            itemAttachments: {
                Shape: MenuItemModifierGroup[];
                Name: "MenuItemModifierGroup";
                Nullable: false;
            };
        };
    };
    Modifier: {
        Name: "Modifier";
        Shape: Modifier;
        Include: Prisma.ModifierInclude;
        Select: Prisma.ModifierSelect;
        OrderBy: Prisma.ModifierOrderByWithRelationInput;
        WhereUnique: Prisma.ModifierWhereUniqueInput;
        Where: Prisma.ModifierWhereInput;
        Create: {};
        Update: {};
        RelationName: "modifierGroup" | "locationOverrides" | "ticketItemModifiers";
        ListRelations: "locationOverrides" | "ticketItemModifiers";
        Relations: {
            modifierGroup: {
                Shape: ModifierGroup;
                Name: "ModifierGroup";
                Nullable: false;
            };
            locationOverrides: {
                Shape: LocationModifier[];
                Name: "LocationModifier";
                Nullable: false;
            };
            ticketItemModifiers: {
                Shape: TicketItemModifier[];
                Name: "TicketItemModifier";
                Nullable: false;
            };
        };
    };
    MenuItemModifierGroup: {
        Name: "MenuItemModifierGroup";
        Shape: MenuItemModifierGroup;
        Include: Prisma.MenuItemModifierGroupInclude;
        Select: Prisma.MenuItemModifierGroupSelect;
        OrderBy: Prisma.MenuItemModifierGroupOrderByWithRelationInput;
        WhereUnique: Prisma.MenuItemModifierGroupWhereUniqueInput;
        Where: Prisma.MenuItemModifierGroupWhereInput;
        Create: {};
        Update: {};
        RelationName: "menuItem" | "modifierGroup";
        ListRelations: never;
        Relations: {
            menuItem: {
                Shape: MenuItem;
                Name: "MenuItem";
                Nullable: false;
            };
            modifierGroup: {
                Shape: ModifierGroup;
                Name: "ModifierGroup";
                Nullable: false;
            };
        };
    };
    Menu: {
        Name: "Menu";
        Shape: Menu;
        Include: Prisma.MenuInclude;
        Select: Prisma.MenuSelect;
        OrderBy: Prisma.MenuOrderByWithRelationInput;
        WhereUnique: Prisma.MenuWhereUniqueInput;
        Where: Prisma.MenuWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "sections";
        ListRelations: "sections";
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            sections: {
                Shape: MenuSection[];
                Name: "MenuSection";
                Nullable: false;
            };
        };
    };
    MenuSection: {
        Name: "MenuSection";
        Shape: MenuSection;
        Include: Prisma.MenuSectionInclude;
        Select: Prisma.MenuSectionSelect;
        OrderBy: Prisma.MenuSectionOrderByWithRelationInput;
        WhereUnique: Prisma.MenuSectionWhereUniqueInput;
        Where: Prisma.MenuSectionWhereInput;
        Create: {};
        Update: {};
        RelationName: "menu" | "items";
        ListRelations: "items";
        Relations: {
            menu: {
                Shape: Menu;
                Name: "Menu";
                Nullable: false;
            };
            items: {
                Shape: MenuSectionItem[];
                Name: "MenuSectionItem";
                Nullable: false;
            };
        };
    };
    MenuSectionItem: {
        Name: "MenuSectionItem";
        Shape: MenuSectionItem;
        Include: Prisma.MenuSectionItemInclude;
        Select: Prisma.MenuSectionItemSelect;
        OrderBy: Prisma.MenuSectionItemOrderByWithRelationInput;
        WhereUnique: Prisma.MenuSectionItemWhereUniqueInput;
        Where: Prisma.MenuSectionItemWhereInput;
        Create: {};
        Update: {};
        RelationName: "menuSection" | "menuItem";
        ListRelations: never;
        Relations: {
            menuSection: {
                Shape: MenuSection;
                Name: "MenuSection";
                Nullable: false;
            };
            menuItem: {
                Shape: MenuItem;
                Name: "MenuItem";
                Nullable: false;
            };
        };
    };
    LocationItem: {
        Name: "LocationItem";
        Shape: LocationItem;
        Include: Prisma.LocationItemInclude;
        Select: Prisma.LocationItemSelect;
        OrderBy: Prisma.LocationItemOrderByWithRelationInput;
        WhereUnique: Prisma.LocationItemWhereUniqueInput;
        Where: Prisma.LocationItemWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "menuItem";
        ListRelations: never;
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            menuItem: {
                Shape: MenuItem;
                Name: "MenuItem";
                Nullable: false;
            };
        };
    };
    LocationModifier: {
        Name: "LocationModifier";
        Shape: LocationModifier;
        Include: Prisma.LocationModifierInclude;
        Select: Prisma.LocationModifierSelect;
        OrderBy: Prisma.LocationModifierOrderByWithRelationInput;
        WhereUnique: Prisma.LocationModifierWhereUniqueInput;
        Where: Prisma.LocationModifierWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "modifier";
        ListRelations: never;
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            modifier: {
                Shape: Modifier;
                Name: "Modifier";
                Nullable: false;
            };
        };
    };
    Ticket: {
        Name: "Ticket";
        Shape: Ticket;
        Include: Prisma.TicketInclude;
        Select: Prisma.TicketSelect;
        OrderBy: Prisma.TicketOrderByWithRelationInput;
        WhereUnique: Prisma.TicketWhereUniqueInput;
        Where: Prisma.TicketWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "openedBy" | "closedBy" | "voidedBy" | "items" | "discounts" | "table" | "reservation";
        ListRelations: "items" | "discounts";
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            openedBy: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            closedBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            voidedBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            items: {
                Shape: TicketItem[];
                Name: "TicketItem";
                Nullable: false;
            };
            discounts: {
                Shape: Discount[];
                Name: "Discount";
                Nullable: false;
            };
            table: {
                Shape: Table | null;
                Name: "Table";
                Nullable: true;
            };
            reservation: {
                Shape: Reservation | null;
                Name: "Reservation";
                Nullable: true;
            };
        };
    };
    TicketItem: {
        Name: "TicketItem";
        Shape: TicketItem;
        Include: Prisma.TicketItemInclude;
        Select: Prisma.TicketItemSelect;
        OrderBy: Prisma.TicketItemOrderByWithRelationInput;
        WhereUnique: Prisma.TicketItemWhereUniqueInput;
        Where: Prisma.TicketItemWhereInput;
        Create: {};
        Update: {};
        RelationName: "ticket" | "menuItem" | "modifiers" | "discounts" | "firedBy" | "servedBy" | "voidedBy";
        ListRelations: "modifiers" | "discounts";
        Relations: {
            ticket: {
                Shape: Ticket;
                Name: "Ticket";
                Nullable: false;
            };
            menuItem: {
                Shape: MenuItem;
                Name: "MenuItem";
                Nullable: false;
            };
            modifiers: {
                Shape: TicketItemModifier[];
                Name: "TicketItemModifier";
                Nullable: false;
            };
            discounts: {
                Shape: Discount[];
                Name: "Discount";
                Nullable: false;
            };
            firedBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            servedBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            voidedBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
        };
    };
    TicketItemModifier: {
        Name: "TicketItemModifier";
        Shape: TicketItemModifier;
        Include: Prisma.TicketItemModifierInclude;
        Select: Prisma.TicketItemModifierSelect;
        OrderBy: Prisma.TicketItemModifierOrderByWithRelationInput;
        WhereUnique: Prisma.TicketItemModifierWhereUniqueInput;
        Where: Prisma.TicketItemModifierWhereInput;
        Create: {};
        Update: {};
        RelationName: "ticketItem" | "modifier";
        ListRelations: never;
        Relations: {
            ticketItem: {
                Shape: TicketItem;
                Name: "TicketItem";
                Nullable: false;
            };
            modifier: {
                Shape: Modifier;
                Name: "Modifier";
                Nullable: false;
            };
        };
    };
    Discount: {
        Name: "Discount";
        Shape: Discount;
        Include: Prisma.DiscountInclude;
        Select: Prisma.DiscountSelect;
        OrderBy: Prisma.DiscountOrderByWithRelationInput;
        WhereUnique: Prisma.DiscountWhereUniqueInput;
        Where: Prisma.DiscountWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "ticket" | "ticketItem" | "appliedBy" | "voidedBy";
        ListRelations: never;
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            ticket: {
                Shape: Ticket | null;
                Name: "Ticket";
                Nullable: true;
            };
            ticketItem: {
                Shape: TicketItem | null;
                Name: "TicketItem";
                Nullable: true;
            };
            appliedBy: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            voidedBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
        };
    };
    Section: {
        Name: "Section";
        Shape: Section;
        Include: Prisma.SectionInclude;
        Select: Prisma.SectionSelect;
        OrderBy: Prisma.SectionOrderByWithRelationInput;
        WhereUnique: Prisma.SectionWhereUniqueInput;
        Where: Prisma.SectionWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "tables";
        ListRelations: "tables";
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            tables: {
                Shape: Table[];
                Name: "Table";
                Nullable: false;
            };
        };
    };
    Table: {
        Name: "Table";
        Shape: Table;
        Include: Prisma.TableInclude;
        Select: Prisma.TableSelect;
        OrderBy: Prisma.TableOrderByWithRelationInput;
        WhereUnique: Prisma.TableWhereUniqueInput;
        Where: Prisma.TableWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "section" | "assignedServer" | "tickets" | "reservations";
        ListRelations: "tickets" | "reservations";
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            section: {
                Shape: Section | null;
                Name: "Section";
                Nullable: true;
            };
            assignedServer: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            tickets: {
                Shape: Ticket[];
                Name: "Ticket";
                Nullable: false;
            };
            reservations: {
                Shape: Reservation[];
                Name: "Reservation";
                Nullable: false;
            };
        };
    };
    Reservation: {
        Name: "Reservation";
        Shape: Reservation;
        Include: Prisma.ReservationInclude;
        Select: Prisma.ReservationSelect;
        OrderBy: Prisma.ReservationOrderByWithRelationInput;
        WhereUnique: Prisma.ReservationWhereUniqueInput;
        Where: Prisma.ReservationWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "table" | "ticket" | "createdBy";
        ListRelations: never;
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            table: {
                Shape: Table | null;
                Name: "Table";
                Nullable: true;
            };
            ticket: {
                Shape: Ticket | null;
                Name: "Ticket";
                Nullable: true;
            };
            createdBy: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    JobRole: {
        Name: "JobRole";
        Shape: JobRole;
        Include: Prisma.JobRoleInclude;
        Select: Prisma.JobRoleSelect;
        OrderBy: Prisma.JobRoleOrderByWithRelationInput;
        WhereUnique: Prisma.JobRoleWhereUniqueInput;
        Where: Prisma.JobRoleWhereInput;
        Create: {};
        Update: {};
        RelationName: "tenant" | "shifts";
        ListRelations: "shifts";
        Relations: {
            tenant: {
                Shape: Tenant;
                Name: "Tenant";
                Nullable: false;
            };
            shifts: {
                Shape: Shift[];
                Name: "Shift";
                Nullable: false;
            };
        };
    };
    EmploymentProfile: {
        Name: "EmploymentProfile";
        Shape: EmploymentProfile;
        Include: Prisma.EmploymentProfileInclude;
        Select: Prisma.EmploymentProfileSelect;
        OrderBy: Prisma.EmploymentProfileOrderByWithRelationInput;
        WhereUnique: Prisma.EmploymentProfileWhereUniqueInput;
        Where: Prisma.EmploymentProfileWhereInput;
        Create: {};
        Update: {};
        RelationName: "user" | "location";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
        };
    };
    AvailabilityWindow: {
        Name: "AvailabilityWindow";
        Shape: AvailabilityWindow;
        Include: Prisma.AvailabilityWindowInclude;
        Select: Prisma.AvailabilityWindowSelect;
        OrderBy: Prisma.AvailabilityWindowOrderByWithRelationInput;
        WhereUnique: Prisma.AvailabilityWindowWhereUniqueInput;
        Where: Prisma.AvailabilityWindowWhereInput;
        Create: {};
        Update: {};
        RelationName: "user";
        ListRelations: never;
        Relations: {
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
        };
    };
    Shift: {
        Name: "Shift";
        Shape: Shift;
        Include: Prisma.ShiftInclude;
        Select: Prisma.ShiftSelect;
        OrderBy: Prisma.ShiftOrderByWithRelationInput;
        WhereUnique: Prisma.ShiftWhereUniqueInput;
        Where: Prisma.ShiftWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "user" | "jobRole" | "createdBy" | "timeEntries";
        ListRelations: "timeEntries";
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            jobRole: {
                Shape: JobRole;
                Name: "JobRole";
                Nullable: false;
            };
            createdBy: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            timeEntries: {
                Shape: TimeEntry[];
                Name: "TimeEntry";
                Nullable: false;
            };
        };
    };
    TimeEntry: {
        Name: "TimeEntry";
        Shape: TimeEntry;
        Include: Prisma.TimeEntryInclude;
        Select: Prisma.TimeEntrySelect;
        OrderBy: Prisma.TimeEntryOrderByWithRelationInput;
        WhereUnique: Prisma.TimeEntryWhereUniqueInput;
        Where: Prisma.TimeEntryWhereInput;
        Create: {};
        Update: {};
        RelationName: "location" | "user" | "shift" | "manualEditBy" | "breaks";
        ListRelations: "breaks";
        Relations: {
            location: {
                Shape: Location;
                Name: "Location";
                Nullable: false;
            };
            user: {
                Shape: User;
                Name: "User";
                Nullable: false;
            };
            shift: {
                Shape: Shift | null;
                Name: "Shift";
                Nullable: true;
            };
            manualEditBy: {
                Shape: User | null;
                Name: "User";
                Nullable: true;
            };
            breaks: {
                Shape: Break[];
                Name: "Break";
                Nullable: false;
            };
        };
    };
    Break: {
        Name: "Break";
        Shape: Break;
        Include: Prisma.BreakInclude;
        Select: Prisma.BreakSelect;
        OrderBy: Prisma.BreakOrderByWithRelationInput;
        WhereUnique: Prisma.BreakWhereUniqueInput;
        Where: Prisma.BreakWhereInput;
        Create: {};
        Update: {};
        RelationName: "timeEntry";
        ListRelations: never;
        Relations: {
            timeEntry: {
                Shape: TimeEntry;
                Name: "TimeEntry";
                Nullable: false;
            };
        };
    };
}
export function getDatamodel(): PothosPrismaDatamodel { return JSON.parse("{\"datamodel\":{\"models\":{\"Tenant\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TenantStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"locations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Membership\",\"kind\":\"object\",\"name\":\"memberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Invitation\",\"kind\":\"object\",\"name\":\"invitations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AuditLog\",\"kind\":\"object\",\"name\":\"auditLogs\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AuditLogToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Category\",\"kind\":\"object\",\"name\":\"categories\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TaxCategory\",\"kind\":\"object\",\"name\":\"taxCategories\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroups\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierGroupToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"JobRole\",\"kind\":\"object\",\"name\":\"jobRoles\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"JobRoleToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Location\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"timezone\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"currency\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locale\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"address\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"LocationStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"businessDayCutoff\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Membership\",\"kind\":\"object\",\"name\":\"memberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMembership\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Invitation\",\"kind\":\"object\",\"name\":\"invitations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToLocation\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TaxRate\",\"kind\":\"object\",\"name\":\"taxRates\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTaxRate\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Menu\",\"kind\":\"object\",\"name\":\"menus\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMenu\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LocationItem\",\"kind\":\"object\",\"name\":\"locationItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LocationModifier\",\"kind\":\"object\",\"name\":\"locationModifiers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationModifier\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"tickets\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTicket\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Discount\",\"kind\":\"object\",\"name\":\"discounts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DiscountToLocation\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Section\",\"kind\":\"object\",\"name\":\"sections\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToSection\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Table\",\"kind\":\"object\",\"name\":\"tables\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTable\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Reservation\",\"kind\":\"object\",\"name\":\"reservations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToReservation\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"EmploymentProfile\",\"kind\":\"object\",\"name\":\"employmentProfiles\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"EmploymentProfileToLocation\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Shift\",\"kind\":\"object\",\"name\":\"shifts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToShift\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TimeEntry\",\"kind\":\"object\",\"name\":\"timeEntries\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTimeEntry\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"slug\"]}]},\"User\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"email\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"emailVerified\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"image\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"passwordHash\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"mfaEnabled\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"mfaSecret\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"UserStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Account\",\"kind\":\"object\",\"name\":\"accounts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AccountToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Session\",\"kind\":\"object\",\"name\":\"sessions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SessionToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Membership\",\"kind\":\"object\",\"name\":\"memberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Invitation\",\"kind\":\"object\",\"name\":\"invitations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitedByUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"ticketsOpened\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketOpenedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"ticketsClosed\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketClosedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"ticketsVoided\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketVoidedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"ticketItemsFired\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemFiredBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"ticketItemsServed\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemServedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"ticketItemsVoided\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemVoidedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Discount\",\"kind\":\"object\",\"name\":\"discountsApplied\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DiscountAppliedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Discount\",\"kind\":\"object\",\"name\":\"discountsVoided\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DiscountVoidedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Table\",\"kind\":\"object\",\"name\":\"tablesAssigned\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TableAssignedServer\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Reservation\",\"kind\":\"object\",\"name\":\"reservationsCreated\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ReservationCreatedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"EmploymentProfile\",\"kind\":\"object\",\"name\":\"employmentProfiles\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserEmploymentProfile\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AvailabilityWindow\",\"kind\":\"object\",\"name\":\"availabilityWindows\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserAvailability\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Shift\",\"kind\":\"object\",\"name\":\"shifts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserShift\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Shift\",\"kind\":\"object\",\"name\":\"shiftsCreated\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ShiftCreatedBy\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TimeEntry\",\"kind\":\"object\",\"name\":\"timeEntries\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserTimeEntry\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TimeEntry\",\"kind\":\"object\",\"name\":\"timeEntryEdits\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TimeEntryEditBy\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Account\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"type\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"provider\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"providerAccountId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"refresh_token\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"access_token\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"expires_at\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"token_type\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"scope\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id_token\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"session_state\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AccountToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"provider\",\"providerAccountId\"]}]},\"Session\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"sessionToken\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expires\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SessionToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"VerificationToken\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"identifier\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"token\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expires\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"identifier\",\"token\"]}]},\"Membership\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Role\",\"kind\":\"enum\",\"name\":\"role\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"MembershipStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMembership\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"userId\",\"tenantId\",\"locationId\"]}]},\"Invitation\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"email\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Role\",\"kind\":\"enum\",\"name\":\"role\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tokenHash\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"invitedById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expiresAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"acceptedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToLocation\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"invitedBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitedByUser\",\"relationFromFields\":[\"invitedById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"AuditLog\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"actorUserId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"action\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"resourceType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"resourceId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"metadata\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AuditLogToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Category\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToMenuItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"slug\"]}]},\"TaxCategory\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TaxCategoryKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"TaxRate\",\"kind\":\"object\",\"name\":\"rates\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTaxRate\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTaxCategory\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"kind\"]}]},\"TaxRate\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taxCategoryId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"ratePermille\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"effectiveFrom\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"effectiveUntil\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TaxCategory\",\"kind\":\"object\",\"name\":\"taxCategory\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTaxRate\",\"relationFromFields\":[\"taxCategoryId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTaxRate\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"categoryId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taxCategoryId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"shortDescription\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"basePriceCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"imageUrl\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ItemCourse\",\"kind\":\"enum\",\"name\":\"course\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"printerStation\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"dietaryTags\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"allergenTags\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Category\",\"kind\":\"object\",\"name\":\"category\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToMenuItem\",\"relationFromFields\":[\"categoryId\"],\"isUpdatedAt\":false},{\"type\":\"TaxCategory\",\"kind\":\"object\",\"name\":\"taxCategory\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTaxCategory\",\"relationFromFields\":[\"taxCategoryId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItemModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroups\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuItemModifierGroup\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuSectionItem\",\"kind\":\"object\",\"name\":\"sectionItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuSectionItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LocationItem\",\"kind\":\"object\",\"name\":\"locationOverrides\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationItemToMenuItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"ticketItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTicketItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ModifierGroup\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"minSelections\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"maxSelections\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierGroupToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Modifier\",\"kind\":\"object\",\"name\":\"modifiers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierToModifierGroup\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuItemModifierGroup\",\"kind\":\"object\",\"name\":\"itemAttachments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemModifierGroupToModifierGroup\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Modifier\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierGroupId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceDeltaCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isDefault\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroup\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierToModifierGroup\",\"relationFromFields\":[\"modifierGroupId\"],\"isUpdatedAt\":false},{\"type\":\"LocationModifier\",\"kind\":\"object\",\"name\":\"locationOverrides\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationModifierToModifier\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TicketItemModifier\",\"kind\":\"object\",\"name\":\"ticketItemModifiers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierToTicketItemModifier\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuItemModifierGroup\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierGroupId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuItemModifierGroup\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false},{\"type\":\"ModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroup\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemModifierGroupToModifierGroup\",\"relationFromFields\":[\"modifierGroupId\"],\"isUpdatedAt\":false}],\"primaryKey\":{\"name\":null,\"fields\":[\"menuItemId\",\"modifierGroupId\"]},\"uniqueIndexes\":[]},\"Menu\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"schedule\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isActive\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMenu\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"MenuSection\",\"kind\":\"object\",\"name\":\"sections\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuToMenuSection\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuSection\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Menu\",\"kind\":\"object\",\"name\":\"menu\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuToMenuSection\",\"relationFromFields\":[\"menuId\"],\"isUpdatedAt\":false},{\"type\":\"MenuSectionItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuSectionToMenuSectionItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuSectionItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuSectionId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceOverrideCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"MenuSection\",\"kind\":\"object\",\"name\":\"menuSection\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuSectionToMenuSectionItem\",\"relationFromFields\":[\"menuSectionId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuSectionItem\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"menuSectionId\",\"menuItemId\"]}]},\"LocationItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"hidden\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"available\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationItem\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationItemToMenuItem\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"menuItemId\"]}]},\"LocationModifier\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"hidden\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"available\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceDeltaOverrideCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationModifier\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"Modifier\",\"kind\":\"object\",\"name\":\"modifier\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationModifierToModifier\",\"relationFromFields\":[\"modifierId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"modifierId\"]}]},\"Ticket\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"shortNumber\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"businessDay\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"customerLabel\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"OrderType\",\"kind\":\"enum\",\"name\":\"orderType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TicketStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"openedById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"openedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"closedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"closedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"voidedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"voidedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"voidReason\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"closeNote\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"subtotalCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"discountCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"taxCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"totalCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tableId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTicket\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"openedBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketOpenedBy\",\"relationFromFields\":[\"openedById\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"closedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketClosedBy\",\"relationFromFields\":[\"closedById\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"voidedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketVoidedBy\",\"relationFromFields\":[\"voidedById\"],\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketToTicketItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Discount\",\"kind\":\"object\",\"name\":\"discounts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketLevelDiscounts\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Table\",\"kind\":\"object\",\"name\":\"table\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TableToTicket\",\"relationFromFields\":[\"tableId\"],\"isUpdatedAt\":false},{\"type\":\"Reservation\",\"kind\":\"object\",\"name\":\"reservation\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ReservationTicket\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"businessDay\",\"shortNumber\"]}]},\"TicketItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"ticketId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TicketItemStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"nameSnapshot\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"unitPriceCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"quantity\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"modifiersTotalCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"lineSubtotalCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"notes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ItemCourse\",\"kind\":\"enum\",\"name\":\"course\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"firedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"firedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"readyAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"servedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"servedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"voidedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"voidedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"voidReason\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"ticket\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketToTicketItem\",\"relationFromFields\":[\"ticketId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTicketItem\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false},{\"type\":\"TicketItemModifier\",\"kind\":\"object\",\"name\":\"modifiers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemToTicketItemModifier\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Discount\",\"kind\":\"object\",\"name\":\"discounts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LineLevelDiscounts\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"firedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemFiredBy\",\"relationFromFields\":[\"firedById\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"servedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemServedBy\",\"relationFromFields\":[\"servedById\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"voidedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemVoidedBy\",\"relationFromFields\":[\"voidedById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"TicketItemModifier\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"ticketItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"nameSnapshot\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceDeltaCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierGroupName\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"ticketItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketItemToTicketItemModifier\",\"relationFromFields\":[\"ticketItemId\"],\"isUpdatedAt\":false},{\"type\":\"Modifier\",\"kind\":\"object\",\"name\":\"modifier\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierToTicketItemModifier\",\"relationFromFields\":[\"modifierId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Discount\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"ticketId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"ticketItemId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DiscountKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"amountCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"percentBp\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"computedCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"reason\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"appliedById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"appliedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"voidedById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"voidedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"voidReason\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DiscountToLocation\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"ticket\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TicketLevelDiscounts\",\"relationFromFields\":[\"ticketId\"],\"isUpdatedAt\":false},{\"type\":\"TicketItem\",\"kind\":\"object\",\"name\":\"ticketItem\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LineLevelDiscounts\",\"relationFromFields\":[\"ticketItemId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"appliedBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DiscountAppliedBy\",\"relationFromFields\":[\"appliedById\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"voidedBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"DiscountVoidedBy\",\"relationFromFields\":[\"voidedById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Section\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToSection\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"Table\",\"kind\":\"object\",\"name\":\"tables\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SectionToTable\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"name\"]}]},\"Table\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"sectionId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"label\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"capacity\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TableShape\",\"kind\":\"enum\",\"name\":\"shape\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"positionX\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"positionY\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"width\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"height\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"rotation\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TableManualState\",\"kind\":\"enum\",\"name\":\"manualState\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"assignedServerId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTable\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"Section\",\"kind\":\"object\",\"name\":\"section\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SectionToTable\",\"relationFromFields\":[\"sectionId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"assignedServer\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TableAssignedServer\",\"relationFromFields\":[\"assignedServerId\"],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"tickets\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TableToTicket\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Reservation\",\"kind\":\"object\",\"name\":\"reservations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ReservationToTable\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"label\"]}]},\"Reservation\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ReservationKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ReservationStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"guestName\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"guestPhone\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"partySize\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"notes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"requestedTime\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"durationMinutes\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tableId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"ticketId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"seatedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"completedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"noShowAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"cancelledAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"cancelReason\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToReservation\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"Table\",\"kind\":\"object\",\"name\":\"table\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ReservationToTable\",\"relationFromFields\":[\"tableId\"],\"isUpdatedAt\":false},{\"type\":\"Ticket\",\"kind\":\"object\",\"name\":\"ticket\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ReservationTicket\",\"relationFromFields\":[\"ticketId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"createdBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ReservationCreatedBy\",\"relationFromFields\":[\"createdById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"JobRole\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"color\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"JobRoleToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Shift\",\"kind\":\"object\",\"name\":\"shifts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"JobRoleToShift\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"name\"]}]},\"EmploymentProfile\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"EmploymentType\",\"kind\":\"enum\",\"name\":\"employmentType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"hourlyRateCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"hireDate\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"terminationDate\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"notes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserEmploymentProfile\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"EmploymentProfileToLocation\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"userId\",\"locationId\"]}]},\"AvailabilityWindow\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DayOfWeekDb\",\"kind\":\"enum\",\"name\":\"dayOfWeek\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"startTime\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"endTime\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"notes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserAvailability\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Shift\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"jobRoleId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"startsAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"endsAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ShiftStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"notes\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"createdById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"cancelledAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"cancelReason\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToShift\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserShift\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"JobRole\",\"kind\":\"object\",\"name\":\"jobRole\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"JobRoleToShift\",\"relationFromFields\":[\"jobRoleId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"createdBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ShiftCreatedBy\",\"relationFromFields\":[\"createdById\"],\"isUpdatedAt\":false},{\"type\":\"TimeEntry\",\"kind\":\"object\",\"name\":\"timeEntries\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ShiftToTimeEntry\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"TimeEntry\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"shiftId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"clockedInAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"clockedOutAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"totalBreakMinutes\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"manualEdit\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"manualEditReason\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"manualEditById\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTimeEntry\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"UserTimeEntry\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Shift\",\"kind\":\"object\",\"name\":\"shift\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ShiftToTimeEntry\",\"relationFromFields\":[\"shiftId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"manualEditBy\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TimeEntryEditBy\",\"relationFromFields\":[\"manualEditById\"],\"isUpdatedAt\":false},{\"type\":\"Break\",\"kind\":\"object\",\"name\":\"breaks\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BreakToTimeEntry\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Break\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"timeEntryId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"startedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"endedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TimeEntry\",\"kind\":\"object\",\"name\":\"timeEntry\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"BreakToTimeEntry\",\"relationFromFields\":[\"timeEntryId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]}}}}"); }