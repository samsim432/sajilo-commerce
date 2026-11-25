export type SupportedLocale = "en" | "ne";

export const DICTIONARIES = {
  en: {
    brandTagline: "Every channel. One business.",
    overviewTitle: "Business Overview",
    todaysSales: "Today's Sales",
    monthlyOrders: "Monthly Orders",
    pendingAttention: "Pending Attention",
    unsettledCod: "Unsettled COD",
    quickActions: "Next setup milestones",
    addFirstProduct: "Add your first product",
    inviteTeam: "Invite staff & set roles",
    configureSettings: "Review Nepal & PAN/VAT settings",
  },
  ne: {
    brandTagline: "हरेक च्यानल। एउटै व्यवसाय।",
    overviewTitle: "व्यवसाय अवलोकन",
    todaysSales: "आजको बिक्री",
    monthlyOrders: "मासिक अर्डरहरू",
    pendingAttention: "ध्यान दिनुपर्ने अर्डर",
    unsettledCod: "बाँकी COD हिसाब",
    quickActions: "अर्को सेटअप चरणहरू",
    addFirstProduct: "पहिलो सामान थप्नुहोस्",
    inviteTeam: "टोली सदस्य थप्नुहोस्",
    configureSettings: "नेपाल र PAN/VAT सेटिङ हेर्नुहोस्",
  },
} as const;

export function getDictionary(locale: SupportedLocale) {
  return DICTIONARIES[locale] ?? DICTIONARIES.en;
}
