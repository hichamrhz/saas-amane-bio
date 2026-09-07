export const ORDER_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-neutral-200 text-neutral-700",
  CANCELLED_BEFORE_PREP: "bg-neutral-200 text-neutral-500",
  CONFIRMED: "bg-blue-100 text-blue-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED_AFTER_PREP: "bg-red-100 text-red-700",
  RETURN_ANNOUNCED: "bg-amber-100 text-amber-700",
  RETURN_RECEIVED: "bg-amber-200 text-amber-800",
  LOST: "bg-red-200 text-red-800",
};
