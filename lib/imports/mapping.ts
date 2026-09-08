export const IMPORT_FIELD_KEYS = [
  "orderNumber",
  "externalRef",
  "customerName",
  "customerPhone",
  "deliveryAddress",
  "channel",
  "marketingSource",
  "carrierName",
  "trackingNumber",
  "sku",
  "quantity",
  "unitPrice",
  "discount",
  "deliveryFeeAmount",
  "codAmount",
  "status",
  "eventDate",
  "withSalt",
  "notes",
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

// Fields that describe the whole order (must not contradict across the rows
// of one order group). Everything else (sku/quantity/unitPrice/discount) is
// per-line and simply accumulates into `lines`.
export const GLOBAL_FIELD_KEYS: ImportFieldKey[] = IMPORT_FIELD_KEYS.filter(
  (k) => k !== "sku" && k !== "quantity" && k !== "unitPrice" && k !== "discount"
);

export type ColumnMapping = Record<string, ImportFieldKey | null>;

export const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  orderNumber: "Numéro de commande",
  externalRef: "Référence externe",
  customerName: "Nom du client",
  customerPhone: "Téléphone",
  deliveryAddress: "Adresse de livraison",
  channel: "Canal (site/whatsapp)",
  marketingSource: "Source marketing",
  carrierName: "Transporteur",
  trackingNumber: "Numéro de suivi",
  sku: "SKU",
  quantity: "Quantité",
  unitPrice: "Prix unitaire",
  discount: "Remise",
  deliveryFeeAmount: "Frais de livraison",
  codAmount: "Montant à collecter (COD)",
  status: "Statut",
  eventDate: "Date",
  withSalt: "Avec sel",
  notes: "Notes",
};
