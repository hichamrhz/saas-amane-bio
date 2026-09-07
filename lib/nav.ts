export type NavItem = {
  href: string;
  messageKey:
    | "dashboard"
    | "products"
    | "packaging"
    | "cooperative"
    | "purchases"
    | "recipes"
    | "orders"
    | "returns"
    | "carriers"
    | "team"
    | "commissions"
    | "expenses"
    | "inventory"
    | "reports"
    | "settings";
  implemented: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", messageKey: "dashboard", implemented: true },
  { href: "/products", messageKey: "products", implemented: true },
  { href: "/packaging", messageKey: "packaging", implemented: true },
  { href: "/cooperative", messageKey: "cooperative", implemented: true },
  { href: "/purchases", messageKey: "purchases", implemented: true },
  { href: "/recipes", messageKey: "recipes", implemented: false },
  { href: "/orders", messageKey: "orders", implemented: false },
  { href: "/returns", messageKey: "returns", implemented: false },
  { href: "/carriers", messageKey: "carriers", implemented: false },
  { href: "/team", messageKey: "team", implemented: false },
  { href: "/commissions", messageKey: "commissions", implemented: false },
  { href: "/expenses", messageKey: "expenses", implemented: false },
  { href: "/inventory", messageKey: "inventory", implemented: true },
  { href: "/reports", messageKey: "reports", implemented: false },
  { href: "/settings", messageKey: "settings", implemented: true },
];
