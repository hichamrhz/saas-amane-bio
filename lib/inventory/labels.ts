export const RECEPTION_KIND_LABELS: Record<string, string> = {
  SUPPLIER_PURCHASE: "Achat fournisseur",
  COOPERATIVE_PRODUCT: "Réception coopérative",
  OPENING_STOCK: "Stock d'ouverture",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  OPENING: "Ouverture",
  PURCHASE_RECEPTION: "Réception achat",
  COOPERATIVE_TRANSFER_OUT: "Transfert sortant",
  COOPERATIVE_TRANSFER_IN: "Transfert entrant",
  LABEL_CONSUMPTION: "Consommation étiquette",
  COOPERATIVE_RECEPTION: "Réception coopérative",
  CORRECTION: "Correction",
};

export const LOCATION_KIND_LABELS: Record<string, string> = {
  INTERNAL: "Chez moi",
  COOPERATIVE: "Coopérative",
  TRANSIT: "Transit",
  QUARANTINE: "Quarantaine",
  OTHER: "Autre",
};
