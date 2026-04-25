/* eslint-disable */
import type { Prisma, Tenant, Location, User, Account, Session, VerificationToken, Membership, Invitation, AuditLog, Category, TaxCategory, TaxRate, MenuItem, ModifierGroup, Modifier, MenuItemModifierGroup, Menu, MenuSection, MenuSectionItem, LocationItem, LocationModifier } from "@prisma/client";
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
        RelationName: "locations" | "memberships" | "invitations" | "auditLogs" | "categories" | "taxCategories" | "menuItems" | "modifierGroups";
        ListRelations: "locations" | "memberships" | "invitations" | "auditLogs" | "categories" | "taxCategories" | "menuItems" | "modifierGroups";
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
        RelationName: "tenant" | "memberships" | "invitations" | "taxRates" | "menus" | "locationItems" | "locationModifiers";
        ListRelations: "memberships" | "invitations" | "taxRates" | "menus" | "locationItems" | "locationModifiers";
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
        RelationName: "accounts" | "sessions" | "memberships" | "invitations";
        ListRelations: "accounts" | "sessions" | "memberships" | "invitations";
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
        RelationName: "tenant" | "category" | "taxCategory" | "modifierGroups" | "sectionItems" | "locationOverrides";
        ListRelations: "modifierGroups" | "sectionItems" | "locationOverrides";
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
        RelationName: "modifierGroup" | "locationOverrides";
        ListRelations: "locationOverrides";
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
}
export function getDatamodel(): PothosPrismaDatamodel { return JSON.parse("{\"datamodel\":{\"models\":{\"Tenant\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TenantStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"locations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Membership\",\"kind\":\"object\",\"name\":\"memberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Invitation\",\"kind\":\"object\",\"name\":\"invitations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"AuditLog\",\"kind\":\"object\",\"name\":\"auditLogs\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AuditLogToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Category\",\"kind\":\"object\",\"name\":\"categories\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TaxCategory\",\"kind\":\"object\",\"name\":\"taxCategories\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"ModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroups\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierGroupToTenant\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Location\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"timezone\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"currency\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locale\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"address\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"LocationStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"businessDayCutoff\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Membership\",\"kind\":\"object\",\"name\":\"memberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMembership\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Invitation\",\"kind\":\"object\",\"name\":\"invitations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToLocation\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"TaxRate\",\"kind\":\"object\",\"name\":\"taxRates\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTaxRate\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Menu\",\"kind\":\"object\",\"name\":\"menus\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMenu\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LocationItem\",\"kind\":\"object\",\"name\":\"locationItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LocationModifier\",\"kind\":\"object\",\"name\":\"locationModifiers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationModifier\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"slug\"]}]},\"User\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"email\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"emailVerified\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"image\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"passwordHash\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"mfaEnabled\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"mfaSecret\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"UserStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Account\",\"kind\":\"object\",\"name\":\"accounts\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AccountToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Session\",\"kind\":\"object\",\"name\":\"sessions\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SessionToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Membership\",\"kind\":\"object\",\"name\":\"memberships\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToUser\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"Invitation\",\"kind\":\"object\",\"name\":\"invitations\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitedByUser\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Account\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"type\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"provider\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"providerAccountId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"refresh_token\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"access_token\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"expires_at\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"token_type\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"scope\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id_token\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"session_state\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AccountToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"provider\",\"providerAccountId\"]}]},\"Session\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"sessionToken\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expires\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"SessionToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"VerificationToken\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"identifier\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"token\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expires\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"identifier\",\"token\"]}]},\"Membership\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"userId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Role\",\"kind\":\"enum\",\"name\":\"role\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"MembershipStatus\",\"kind\":\"enum\",\"name\":\"status\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"user\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToUser\",\"relationFromFields\":[\"userId\"],\"isUpdatedAt\":false},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MembershipToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMembership\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"userId\",\"tenantId\",\"locationId\"]}]},\"Invitation\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"email\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Role\",\"kind\":\"enum\",\"name\":\"role\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tokenHash\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":true,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"invitedById\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"expiresAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"acceptedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitationToLocation\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"User\",\"kind\":\"object\",\"name\":\"invitedBy\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"InvitedByUser\",\"relationFromFields\":[\"invitedById\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"AuditLog\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"actorUserId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"action\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"resourceType\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"resourceId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"metadata\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"AuditLogToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Category\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"slug\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToMenuItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"slug\"]}]},\"TaxCategory\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TaxCategoryKind\",\"kind\":\"enum\",\"name\":\"kind\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"TaxRate\",\"kind\":\"object\",\"name\":\"rates\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTaxRate\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTaxCategory\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"tenantId\",\"kind\"]}]},\"TaxRate\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taxCategoryId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"ratePermille\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"effectiveFrom\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"effectiveUntil\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"TaxCategory\",\"kind\":\"object\",\"name\":\"taxCategory\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"TaxCategoryToTaxRate\",\"relationFromFields\":[\"taxCategoryId\"],\"isUpdatedAt\":false},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToTaxRate\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"categoryId\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"taxCategoryId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"shortDescription\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"basePriceCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"imageUrl\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ItemCourse\",\"kind\":\"enum\",\"name\":\"course\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"printerStation\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"dietaryTags\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"allergenTags\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Category\",\"kind\":\"object\",\"name\":\"category\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"CategoryToMenuItem\",\"relationFromFields\":[\"categoryId\"],\"isUpdatedAt\":false},{\"type\":\"TaxCategory\",\"kind\":\"object\",\"name\":\"taxCategory\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToTaxCategory\",\"relationFromFields\":[\"taxCategoryId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItemModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroups\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuItemModifierGroup\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuSectionItem\",\"kind\":\"object\",\"name\":\"sectionItems\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuSectionItem\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"LocationItem\",\"kind\":\"object\",\"name\":\"locationOverrides\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationItemToMenuItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"ModifierGroup\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"tenantId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"minSelections\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"maxSelections\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Tenant\",\"kind\":\"object\",\"name\":\"tenant\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierGroupToTenant\",\"relationFromFields\":[\"tenantId\"],\"isUpdatedAt\":false},{\"type\":\"Modifier\",\"kind\":\"object\",\"name\":\"modifiers\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierToModifierGroup\",\"relationFromFields\":[],\"isUpdatedAt\":false},{\"type\":\"MenuItemModifierGroup\",\"kind\":\"object\",\"name\":\"itemAttachments\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemModifierGroupToModifierGroup\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"Modifier\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierGroupId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceDeltaCents\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isDefault\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"ModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroup\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"ModifierToModifierGroup\",\"relationFromFields\":[\"modifierGroupId\"],\"isUpdatedAt\":false},{\"type\":\"LocationModifier\",\"kind\":\"object\",\"name\":\"locationOverrides\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationModifierToModifier\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuItemModifierGroup\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierGroupId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuItemModifierGroup\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false},{\"type\":\"ModifierGroup\",\"kind\":\"object\",\"name\":\"modifierGroup\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemModifierGroupToModifierGroup\",\"relationFromFields\":[\"modifierGroupId\"],\"isUpdatedAt\":false}],\"primaryKey\":{\"name\":null,\"fields\":[\"menuItemId\",\"modifierGroupId\"]},\"uniqueIndexes\":[]},\"Menu\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"description\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Json\",\"kind\":\"scalar\",\"name\":\"schedule\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"isActive\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToMenu\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"MenuSection\",\"kind\":\"object\",\"name\":\"sections\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuToMenuSection\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuSection\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"name\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Menu\",\"kind\":\"object\",\"name\":\"menu\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuToMenuSection\",\"relationFromFields\":[\"menuId\"],\"isUpdatedAt\":false},{\"type\":\"MenuSectionItem\",\"kind\":\"object\",\"name\":\"items\",\"isRequired\":true,\"isList\":true,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuSectionToMenuSectionItem\",\"relationFromFields\":[],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[]},\"MenuSectionItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuSectionId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"sortOrder\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceOverrideCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"archivedAt\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"MenuSection\",\"kind\":\"object\",\"name\":\"menuSection\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuSectionToMenuSectionItem\",\"relationFromFields\":[\"menuSectionId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"MenuItemToMenuSectionItem\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"menuSectionId\",\"menuItemId\"]}]},\"LocationItem\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"menuItemId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"hidden\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"available\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationItem\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"MenuItem\",\"kind\":\"object\",\"name\":\"menuItem\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationItemToMenuItem\",\"relationFromFields\":[\"menuItemId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"menuItemId\"]}]},\"LocationModifier\":{\"fields\":[{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"id\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":true,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"locationId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"String\",\"kind\":\"scalar\",\"name\":\"modifierId\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"hidden\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Boolean\",\"kind\":\"scalar\",\"name\":\"available\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"Int\",\"kind\":\"scalar\",\"name\":\"priceDeltaOverrideCents\",\"isRequired\":false,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"createdAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":true,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":false},{\"type\":\"DateTime\",\"kind\":\"scalar\",\"name\":\"updatedAt\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"isUpdatedAt\":true},{\"type\":\"Location\",\"kind\":\"object\",\"name\":\"location\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationToLocationModifier\",\"relationFromFields\":[\"locationId\"],\"isUpdatedAt\":false},{\"type\":\"Modifier\",\"kind\":\"object\",\"name\":\"modifier\",\"isRequired\":true,\"isList\":false,\"hasDefaultValue\":false,\"isUnique\":false,\"isId\":false,\"relationName\":\"LocationModifierToModifier\",\"relationFromFields\":[\"modifierId\"],\"isUpdatedAt\":false}],\"primaryKey\":null,\"uniqueIndexes\":[{\"name\":null,\"fields\":[\"locationId\",\"modifierId\"]}]}}}}"); }