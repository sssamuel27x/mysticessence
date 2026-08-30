"use client";

import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PRODUCT_IMAGE_IDS } from "./product-images";
import { getProductImages, productImageFields, validateProductImageFiles, MAX_PRODUCT_IMAGES, type ProductImage } from "./product-gallery";
import { LEGAL_DOCUMENTS, type LegalKind } from "./legal-content";
import { ShippingSettingsProvider, ShippingSettingsDialog, useShippingSettings } from "./shipping-settings";
import { DecantAvailabilityProvider, DecantAvailabilityControls, useDecantAvailability } from "./decant-availability";
import { applyDecantAvailability, isDecantBlocked } from "../functions/decant-availability.mjs";
import { BrandsProvider, BrandSettingsDialog, useBrands } from "./brand-settings";
import { brandKey, productsForBrand } from "./brand-catalogue";
import { SHIPPING_ZONE_IDS, getShippingCost, type ShippingZone } from "../functions/shipping.mjs";
import { DEFAULT_DECANT_PRICING, applyDecantPricing, decantPriceFor, isValidDecantPricing, type DecantPricingRule, type DecantSize } from "../functions/decant-pricing.mjs";
import {
  createCheckout,
  deleteFavoriteFolder,
  type IfthenpayCheckoutResult,
  firebaseEnabled,
  paymentsEnabled,
  storageEnabled,
  loginWithEmail,
  loginWithGoogle,
  logoutFirebase,
  registerWithEmail,
  removeCoupon as removeFirebaseCoupon,
  removeProduct as removeFirebaseProduct,
  saveCoupon as saveFirebaseCoupon,
  saveDecantPricing,
  saveFavoriteFolders,
  saveProduct as saveFirebaseProduct,
  setInfluencerAccount,
  seedProducts,
  submitReview as submitFirebaseReview,
  subscribeToRestock,
  updateOrder as updateFirebaseOrder,
  uploadProductImage,
  validateCoupon,
  watchCoupons,
  watchDecantPricing,
  watchFavoriteFolders,
  watchInfluencerCouponUses,
  watchOrders,
  watchProfiles,
  watchProducts,
  watchReviews,
  watchSession,
} from "./firebase";
import {
  Apple,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BadgeCheck,
  Boxes,
  ClipboardList,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Citrus,
  Cookie,
  CreditCard,
  Clock3,
  Landmark,
  LayoutDashboard,
  Globe2,
  Heart,
  Headphones,
  History,
  Folder,
  Flower2,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Music2,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Save,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  SlidersHorizontal,
  Star,
  Tag,
  TicketPercent,
  Phone,
  Trash2,
  Truck,
  Trees,
  User,
  X,
} from "lucide-react";

type Lang = "pt" | "en";
type View = "home" | "listing" | "product" | "checkout" | "account" | "favorites" | "admin" | "legal";
type ListingKind = "all" | "new" | "best" | "sale" | "decants" | "men" | "women" | "unisex" | "other";
type ScentProfile = "fresh" | "fruity" | "floral" | "sweet" | "woody";
type PaymentMethod = "mbway" | "multibanco" | "payshop" | "card";
type Session = { uid: string; name: string; email: string; role: "customer" | "admin"; isInfluencer?: boolean; influencerCouponCode?: string | null };
type OrderStatus = "received" | "preparing" | "shipped" | "delivered";
type ProductAudience = "men" | "women" | "unisex";

type ProductVariant = {
  volume: string;
  price: number;
  isDecant?: boolean;
  soldout?: boolean;
  stock?: number;
};

type Product = {
  id: string;
  brand: string;
  category: "Masculinos" | "Femininos" | "Unissexo" | "Outros produtos";
  scentProfile: ScentProfile;
  audiences: ProductAudience[];
  tag: "new" | "stock" | "soldout";
  isNew?: boolean;
  bestSeller?: boolean;
  name: Record<Lang, string>;
  family: Record<Lang, string>;
  desc: Record<Lang, string>;
  notes: {
    top: Record<Lang, string[]>;
    heart: Record<Lang, string[]>;
    base: Record<Lang, string[]>;
  };
  price: number;
  discount?: number;
  promotionEndsAt?: string;
  isDecant?: boolean;
  volume: string;
  variants: ProductVariant[];
  color: string;
  accent: string;
  mood: string;
  imageUrl?: string;
  imagePath?: string;
  images?: ProductImage[];
};

type DraftProductImage = ProductImage & { id: string; file?: File };
type DraftVariant = { id: string; volume: string; price: string; isDecant: boolean; stock: string; soldout: boolean };

type ListingFilters = {
  availability: "all" | "stock" | "soldout";
  priceRange: "all" | "under30" | "30to50" | "over50";
  brands: string[];
  profiles: ScentProfile[];
};

const EMPTY_LISTING_FILTERS: ListingFilters = {
  availability: "all",
  priceRange: "all",
  brands: [],
  profiles: [],
};

type AppRoute = {
  view: View;
  listing: ListingKind;
  profileFilter: ScentProfile | null;
  brandFilter?: string | null;
  activeId?: string;
  legal?: LegalKind;
};

const LEGAL_PATHS: Record<LegalKind, string> = {
  terms: "/termos-e-condicoes",
  privacy: "/politica-de-privacidade",
  cookies: "/politica-de-cookies",
  returns: "/devolucoes-e-reembolsos",
};

const LISTING_PATHS: Record<ListingKind, string> = {
  all: "/perfumes",
  men: "/perfumes/masculinos",
  women: "/perfumes/femininos",
  unisex: "/perfumes/unissexo",
  other: "/outros-produtos",
  new: "/novidades",
  best: "/best-sellers",
  sale: "/promocoes",
  decants: "/decants",
};

function routeFromPath(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  const legalEntry = (Object.entries(LEGAL_PATHS) as [LegalKind, string][]).find(([, routePath]) => routePath === path);
  if (legalEntry) return { view: "legal", listing: "all", profileFilter: null, legal: legalEntry[0] };
  const listingEntry = (Object.entries(LISTING_PATHS) as [ListingKind, string][]).find(([, routePath]) => routePath === path);
  if (listingEntry) return { view: "listing", listing: listingEntry[0], profileFilter: null };
  if (path.startsWith("/perfil-olfativo/")) {
    const profile = path.slice("/perfil-olfativo/".length) as ScentProfile;
    if (SCENT_PROFILES.includes(profile)) return { view: "listing", listing: "all", profileFilter: profile };
  }
  if (path.startsWith("/marcas/")) {
    return { view: "listing", listing: "all", profileFilter: null, brandFilter: decodeURIComponent(path.slice("/marcas/".length)) };
  }
  if (path === "/marcas") return { view: "listing", listing: "all", profileFilter: null, brandFilter: null };
  if (path.startsWith("/produto/")) {
    return { view: "product", listing: "all", profileFilter: null, activeId: decodeURIComponent(path.slice("/produto/".length)) };
  }
  if (path === "/checkout") return { view: "checkout", listing: "all", profileFilter: null };
  if (path === "/conta") return { view: "account", listing: "all", profileFilter: null };
  if (path === "/conta/favoritos") return { view: "favorites", listing: "all", profileFilter: null };
  if (path === "/admin") return { view: "admin", listing: "all", profileFilter: null };
  return { view: "home", listing: "all", profileFilter: null };
}

const SCENT_PROFILE_LABELS: Record<Lang, Record<ScentProfile, string>> = {
  pt: {
    fresh: "Frescos e cítricos",
    fruity: "Frutados",
    floral: "Florais",
    sweet: "Doces e Gourmand",
    woody: "Amadeirados e especiados",
  },
  en: {
    fresh: "Fresh and citrus",
    fruity: "Fruity",
    floral: "Floral",
    sweet: "Sweet and Gourmand",
    woody: "Woody and spicy",
  },
};

const SCENT_PROFILES = Object.keys(SCENT_PROFILE_LABELS.pt) as ScentProfile[];

function inferScentProfile(seed: CatalogSeed): ScentProfile {
  const name = seed.name.toLowerCase();
  const matches = (terms: string[]) => terms.some((term) => name.includes(term));

  if (matches(["aqua", "aquatica", "pacific", "ocean", "blue", "snow", "ice", "freeze", "beach", "aloha", "tropical", "electric", "rainfall", "island dreams"])) return "fresh";
  if (matches(["coral", "sublime", "baie", "fruit", "yum yum", "tous", "passion", "gold edition", "opulent dubai"])) return "fruity";
  if (matches(["rose", "flor", "woman", "for women", "her", "queen", "dalal", "haya", "layaan", "marwa", "aira", "reyna", "victoria", "atheeri", "bint hoor", "sabah"])) return "floral";
  if (matches(["yara", "vanilla", "vanille", "eclaire", "tiramisu", "brioche", "sugar", "nebras", "angham", "qahwa", "khamrah", "sweet", "gourmand"])) return "sweet";
  if (matches(["oud", "asad", "wood", "amber", "musamam", "wraith", "black", "intense", "king", "kingdom", "firestorm", "dynasty", "dukhan", "tobacco"])) return "woody";

  if (seed.category === "Femininos") return "floral";
  if (seed.category === "Masculinos") return "woody";
  return "sweet";
}

type CartItem = Product & { qty: number };
const MAX_ORDER_QUANTITY = 99;
type OrderItem = {
  id: string;
  productId?: string;
  name: Record<Lang, string>;
  brand: string;
  volume: string;
  price: number;
  qty: number;
  imageUrl?: string;
};
type ProductReview = {
  id: string;
  productId: string;
  rating: number;
  comment: string;
  customerName: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt?: string;
};
type FavoriteFolder = { id: string; name: string; productIds: string[] };
type Coupon = { id: string; code: string; discount: number; createdAt: string; influencerUid?: string; influencerEmail?: string; influencerName?: string };
type CustomerProfile = {
  uid: string;
  name?: string;
  email: string;
  createdAt?: string;
  isInfluencer?: boolean;
  influencerCouponCode?: string;
};
type InfluencerCouponUse = {
  id: string;
  influencerUid: string;
  couponCode: string;
  orderId: string;
  usedAt: string;
  month: string;
  discountAmount: number;
  orderTotal: number;
};
type Order = {
  id: string;
  createdAt: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    postal: string;
    city: string;
    taxId?: string;
    notes: string;
  };
  billing?: {
    sameAsContact: boolean;
    name: string;
    address: string;
    taxId: string;
  };
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  shippingZone?: ShippingZone;
  shippingCarrierId?: string;
  shippingCarrierName?: string;
  shippingDescription?: string;
  couponCode?: string;
  discount?: number;
  discountAmount?: number;
  total: number;
  customerUid?: string | null;
  payment: PaymentMethod | "ifthenpay";
  paymentMethod?: string;
  paymentStatus?: "pending" | "paid" | "failed";
  status: OrderStatus;
  archived: boolean;
  trackingNumber?: string;
};

const ORDER_STATUS_SEQUENCE: OrderStatus[] = ["received", "preparing", "shipped", "delivered"];
const ORDER_STATUS_LABELS: Record<Lang, Record<OrderStatus, string>> = {
  pt: {
    received: "Encomenda recebida",
    preparing: "Em preparação",
    shipped: "Enviada",
    delivered: "Entregue",
  },
  en: {
    received: "Order received",
    preparing: "Preparing",
    shipped: "Shipped",
    delivered: "Delivered",
  },
};

function paymentMethodLabel(method?: string) {
  if (method === "mbway") return "MB WAY";
  if (method === "multibanco") return "Multibanco";
  if (method === "payshop") return "Payshop";
  if (method === "card") return "Cartão";
  return method || "Pendente";
}

const COPY = {
  pt: {
    nav: { perfumes: "Perfumes", brands: "Marcas", newIn: "Novidades", best: "Best sellers", sale: "Promoções", decants: "Decants" },
    search: "Pesquisar fragrâncias, marcas ou notas",
    account: "Conta",
    heroEyebrow: "Perfumaria Árabe em Santa Maria da Feira",
    heroTitle: "Mystic Essence",
    heroSub:
      "Descubra essências de luxo inesquecíveis que marcam presença com elegância e exclusividade.",
    heroCta: "Explorar perfumes",
    heroSecond: "Ver novidades",
    featured: "Escolhas da casa",
    featuredSub: "Best sellers com rasto marcante, boa projeção e preços fáceis de entrar no mundo árabe.",
    newTitle: "Novidades",
    bestTitle: "Best sellers",
    saleTitle: "Promoções",
    allTitle: "Perfumes",
    decantsTitle: "Decants 2, 5 e 10 ml",
    products: "produtos",
    sort: "Ordenar por",
    sortValue: "Data, mais recentes",
    filters: ["Disponibilidade", "Preço", "Marca", "Família olfativa"],
    results: "Ver resultados",
    add: "Adicionar ao carrinho",
    details: "Ver detalhes",
    from: "A partir de",
    stock: "Em stock",
    soldout: "Esgotado",
    pick: "Escolha uma opção",
    qty: "Quantidade",
    signature: "Assinatura olfativa",
    journey: "A viagem desta fragrância",
    journeySub: "Da primeira impressão ao rasto que permanece na pele.",
    top: "Notas de saída",
    heart: "Notas de coração",
    base: "Notas de fundo",
    related: "Perfumes semelhantes",
    cart: "Carrinho",
    empty: "O carrinho está vazio.",
    emptySub: "Adicione uma fragrância para ver o resumo aqui.",
    subtotal: "Subtotal",
    checkout: "Finalizar compra",
    mockOnly: "Pagamento processado em segurança pela Ifthenpay.",
    checkoutPage: {
      eyebrow: "Checkout seguro",
      title: "Finalizar compra",
      back: "Voltar às compras",
      contactTitle: "Dados de contacto",
      billingTitle: "Dados de faturação",
      deliveryTitle: "Morada de entrega",
      paymentTitle: "Método de pagamento",
      name: "Nome completo",
      email: "Email",
      phone: "Número de telefone",
      taxId: "NIF (opcional)",
      sameBilling: "Dados de contacto iguais aos de faturação",
      billingName: "Nome de faturação",
      billingAddress: "Morada de faturação",
      billingTaxId: "NIF",
      address: "Morada",
      postal: "Código postal",
      city: "Localidade",
      shippingZone: "Zona de entrega",
      shippingZones: {
        continental: "Portugal Continental",
        islands: "Madeira / Açores",
        spain: "Espanha",
      },
      shippingZoneNotes: {
        continental: "4,90 € ou grátis acima de 85 €",
        islands: "12 € ou grátis acima de 100 €",
        spain: "10 € ou grátis acima de 100 €",
      },
      notes: "Notas da encomenda (opcional)",
      cardName: "Nome no cartão",
      cardNumber: "Número do cartão",
      expiry: "MM/AA",
      cvc: "CVC",
      order: "Resumo da encomenda",
      promoCode: "Código promocional",
      promoPlaceholder: "Introduza o código",
      promoApply: "Aplicar",
      promoApplied: "Cupão aplicado",
      promoInvalid: "Cupão inválido ou inexistente.",
      discount: "Desconto",
      shipping: "Envio",
      free: "Grátis",
      total: "Total",
      confirm: "Confirmar pedido",
      secure: "Os seus dados são utilizados para processar e entregar a encomenda.",
      successTitle: "Pedido confirmado",
      successText: "A demonstração do checkout foi concluída. Nenhum pagamento real foi processado.",
      continue: "Continuar a comprar",
    },
    remove: "Remover",
    menuShop: "Comprar",
    menuDiscover: "Descobrir",
    menuPromo: "A maior seleção de perfumes árabes em Santa Maria da Feira.",
    menuPromoSub: "Fragrâncias autênticas, atendimento próximo e seleção para todos os estilos.",
    footerTag: "Perfumaria árabe autêntica em Santa Maria da Feira, Aveiro.",
    contact: "Contactos",
    address: "R. São Nicolau 8 Lj 20, 4520-248 Santa Maria da Feira",
    phone: "+351 938 258 798",
    hours: "Seg-Sex 10:30-13:00, 14:30-19:00",
    legal: "Termos e políticas",
    rights: "Todos os direitos reservados.",
  },
  en: {
    nav: { perfumes: "Perfumes", brands: "Brands", newIn: "New in", best: "Best sellers", sale: "Offers", decants: "Decants" },
    search: "Search fragrances, brands or notes",
    account: "Account",
    heroEyebrow: "Arabian perfumery in Santa Maria da Feira",
    heroTitle: "Mystic Essence",
    heroSub:
      "Intense, elegant and memorable Arabian fragrances selected for effortless presence.",
    heroCta: "Explore perfumes",
    heroSecond: "See new in",
    featured: "House picks",
    featuredSub: "Best sellers with memorable trails, strong projection and approachable entry prices.",
    newTitle: "New in",
    bestTitle: "Best sellers",
    saleTitle: "Offers",
    allTitle: "Perfumes",
    decantsTitle: "2, 5 and 10 ml decants",
    products: "products",
    sort: "Sort by",
    sortValue: "Date, newest",
    filters: ["Availability", "Price", "Brand", "Olfactory family"],
    results: "See results",
    add: "Add to cart",
    details: "View details",
    from: "From",
    stock: "In stock",
    soldout: "Sold out",
    pick: "Choose an option",
    qty: "Quantity",
    signature: "Olfactory signature",
    journey: "The journey of this fragrance",
    journeySub: "From the first impression to the trail that remains.",
    top: "Top notes",
    heart: "Heart notes",
    base: "Base notes",
    related: "Similar perfumes",
    cart: "Cart",
    empty: "Your cart is empty.",
    emptySub: "Add a fragrance to see the summary here.",
    subtotal: "Subtotal",
    checkout: "Checkout",
    mockOnly: "Payment securely processed by Ifthenpay.",
    checkoutPage: {
      eyebrow: "Secure checkout",
      title: "Complete your order",
      back: "Back to shopping",
      contactTitle: "Contact details",
      billingTitle: "Billing details",
      deliveryTitle: "Delivery address",
      paymentTitle: "Payment method",
      name: "Full name",
      email: "Email",
      phone: "Phone number",
      taxId: "Tax number (optional)",
      sameBilling: "Contact details are the same as billing details",
      billingName: "Billing name",
      billingAddress: "Billing address",
      billingTaxId: "Tax number",
      address: "Address",
      postal: "Postcode",
      city: "City",
      shippingZone: "Delivery zone",
      shippingZones: {
        continental: "Mainland Portugal",
        islands: "Madeira / Azores",
        spain: "Spain",
      },
      shippingZoneNotes: {
        continental: "€4.90 or free over €85",
        islands: "€12 or free over €100",
        spain: "€10 or free over €100",
      },
      notes: "Order notes (optional)",
      cardName: "Name on card",
      cardNumber: "Card number",
      expiry: "MM/YY",
      cvc: "CVC",
      order: "Order summary",
      promoCode: "Promotional code",
      promoPlaceholder: "Enter your code",
      promoApply: "Apply",
      promoApplied: "Coupon applied",
      promoInvalid: "Invalid or unknown coupon.",
      discount: "Discount",
      shipping: "Shipping",
      free: "Free",
      total: "Total",
      confirm: "Confirm order",
      secure: "Your details are used to process and deliver your order.",
      successTitle: "Order confirmed",
      successText: "The checkout demonstration is complete. No real payment was processed.",
      continue: "Continue shopping",
    },
    remove: "Remove",
    menuShop: "Shop",
    menuDiscover: "Discover",
    menuPromo: "The largest selection of Arabian perfumes in Santa Maria da Feira.",
    menuPromoSub: "Authentic fragrances, personal service and a selection for every style.",
    footerTag: "Authentic Arabian perfumery in Santa Maria da Feira, Aveiro.",
    contact: "Contacts",
    address: "R. São Nicolau 8 Lj 20, 4520-248 Santa Maria da Feira",
    phone: "+351 938 258 798",
    hours: "Mon-Fri 10:30-13:00, 14:30-19:00",
    legal: "Terms and policies",
    rights: "All rights reserved.",
  },
};

const BRANDS = [
  "Afnan",
  "Al Haramain",
  "Al Wataniah",
  "Arabiyat Prestige",
  "Ard Al Zaafaran",
  "Armaf",
  "Asdaaf",
  "Bujairami",
  "Fragrance World",
  "French Avenue",
  "Khadlaj",
  "Lattafa",
  "Maison Alhambra",
  "Maison Asrar",
  "Mamlakat Al Oud",
  "Nusuk",
  "Paris Corner",
  "Rasasi",
  "Rayhaan",
  "Riiffs",
  "Swiss Arabian",
  "Volaré",
  "Zimaya",
];

type CatalogSeed = {
  id: string;
  name: string;
  brand: string;
  volume: string;
  price: number;
  category: Product["category"];
  audiences?: ProductAudience[];
  soldout?: boolean;
  bestSeller?: boolean;
};

const PRODUCT_PALETTES = [
  ["#66553f", "#d7b35b", "amber"],
  ["#4f5968", "#c8d0db", "silver"],
  ["#8a6036", "#e4b964", "gold"],
  ["#5d3440", "#d59a9f", "rose"],
  ["#315967", "#9ec9d5", "aqua"],
  ["#3d4d3d", "#b9c59f", "green"],
] as const;

const BUDGET_DECANTS = new Set([
  "ameerat-sugar-crown", "sensuous-night", "yara", "fakhar-platinum", "sabah-al-ward",
  "fakhar-rose", "brioche-vanille", "yara-tous", "milani-warm-vanilla", "fakhar-gold",
  "asad", "ameerat-al-arab", "ana-abiyedh-white", "bint-hooran", "ana-abiyedh-coral",
  "asad-elixir", "passion", "raghba-wood-intense", "hayaati", "yara-elixir",
  "qaed-al-fursan", "opulent-dubai", "amazon-rainfall", "yara-moi", "kingsman",
  "your-touch-for-women", "barakkat-rouge-540", "durrat-al-aroos",
]);

const PREMIUM_DECANTS = new Set([
  "atlantis-extrait", "queen-of-arabia", "afeef", "liquid-brun-limited", "safari-breeze",
  "regent", "rayhaan-aquatica", "pisa", "marwa", "irida-extrait", "hawas-kobra",
  "amber-oud-gold", "king-of-arabia", "musamam-black", "supremacy-collectors", "hectic-bujairami",
]);

function decantVariants(productId: string, fullSizePrice: number): ProductVariant[] {
  const twoMl = { volume: "2ml", price: fullSizePrice <= 45 ? 1.9 : 2.5, isDecant: true };
  if (BUDGET_DECANTS.has(productId)) {
    return [
      twoMl,
      { volume: "5ml", price: 3.8, isDecant: true },
      { volume: "10ml", price: 6.9, isDecant: true },
    ];
  }
  if (PREMIUM_DECANTS.has(productId)) {
    const fiveMlPrice = ["regent", "rayhaan-aquatica", "pisa", "marwa", "supremacy-collectors", "hectic-bujairami"].includes(productId) ? 5.5 : 5.8;
    return [
      twoMl,
      { volume: "5ml", price: fiveMlPrice, isDecant: true },
      { volume: "10ml", price: 8.9, isDecant: true },
    ];
  }
  return [
    twoMl,
    { volume: "5ml", price: 4.5, isDecant: true },
    { volume: "10ml", price: 7.99, isDecant: true },
  ];
}

function fullSizeVariants(seed: CatalogSeed): ProductVariant[] {
  if (seed.id === "yara") {
    return [
      { volume: "100ml", price: 28 },
      { volume: "50ml", price: 12.9 },
    ];
  }
  if (seed.id === "amber-oud-gold") {
    return [
      { volume: "60ml", price: seed.price },
      { volume: "100ml", price: seed.price },
    ];
  }
  return [{ volume: seed.volume, price: seed.price }];
}

const CATALOG: CatalogSeed[] = [
  { id: "manaal", name: "Manaal", brand: "Ard Al Zaafaran", volume: "100ml", price: 44.9, category: "Femininos" },
  { id: "atlantis-extrait", name: "Atlantis Extrait", brand: "French Avenue", volume: "100ml", price: 54.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "dalal", name: "Dalal", brand: "Lattafa", volume: "100ml", price: 44.99, category: "Femininos" },
  { id: "spectra-surge", name: "Spectra & Surge", brand: "Riiffs", volume: "100ml", price: 47.9, category: "Masculinos" },
  { id: "beach-party", name: "Beach Party", brand: "Armaf", volume: "100ml", price: 42.99, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "queen-of-arabia", name: "Queen of Arabia + 4 decants", brand: "Lattafa", volume: "100ml", price: 55.99, category: "Femininos" },
  { id: "yum-yum", name: "Yum Yum", brand: "Armaf", volume: "100ml", price: 48.9, category: "Femininos" },
  { id: "ameerat-sugar-crown", name: "Ameerat Al Arab Sugar Crown", brand: "Asdaaf", volume: "100ml", price: 32.5, category: "Femininos" },
  { id: "sensuous-night", name: "Sensuous Night", brand: "Khadlaj", volume: "100ml", price: 29.9, category: "Femininos" },
  { id: "yara", name: "Yara", brand: "Lattafa", volume: "100ml", price: 28, category: "Femininos", bestSeller: true },
  { id: "petra", name: "Petra", brand: "Lattafa", volume: "100ml", price: 44.99, category: "Femininos" },
  { id: "fakhar-platinum", name: "Fakhar Platinum", brand: "Lattafa", volume: "100ml", price: 32.9, category: "Masculinos" },
  { id: "her-confession", name: "Her Confession", brand: "Lattafa", volume: "100ml", price: 45.9, category: "Femininos" },
  { id: "azm", name: "AZM", brand: "Paris Corner", volume: "100ml", price: 38.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "haya", name: "Haya", brand: "Lattafa", volume: "100ml", price: 38.9, category: "Femininos" },
  { id: "shaghaf", name: "Shaghaf", brand: "Al Wataniah", volume: "100ml", price: 37.9, category: "Femininos" },
  { id: "sakeena", name: "Sakeena", brand: "Lattafa", volume: "100ml", price: 39.8, category: "Femininos" },
  { id: "afeef", name: "Afeef", brand: "Lattafa", volume: "100ml", price: 52.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "hoor-riiffs", name: "Hoor", brand: "Riiffs", volume: "100ml", price: 48.99, category: "Femininos" },
  { id: "liquid-brun-limited", name: "Liquid Brun Limited Edition", brand: "French Avenue", volume: "150ml", price: 59.8, category: "Masculinos" },
  { id: "queen-checkmate", name: "Queen Checkmate", brand: "Armaf", volume: "100ml", price: 44.9, category: "Femininos" },
  { id: "safari-breeze", name: "Safari Breeze", brand: "French Avenue", volume: "100ml", price: 54.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "liquid-brun", name: "Liquid Brun", brand: "French Avenue", volume: "100ml", price: 44.99, category: "Masculinos", bestSeller: true },
  { id: "shaghaf-woman", name: "Shaghaf Woman", brand: "Swiss Arabian", volume: "75ml", price: 37.9, category: "Femininos" },
  { id: "regent", name: "Regent", brand: "Maison Asrar", volume: "100ml", price: 64.99, category: "Masculinos" },
  { id: "rayhaan-pacific", name: "Pacific", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "sabah-al-ward", name: "Sabah Al Ward", brand: "Al Wataniah", volume: "100ml", price: 28.5, category: "Femininos" },
  { id: "badee-al-oud-sublime", name: "Bade'e Al Oud Sublime", brand: "Lattafa", volume: "100ml", price: 38.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "rayhaan-aquatica", name: "Aquatica", brand: "Rayhaan", volume: "100ml", price: 52.9, category: "Masculinos" },
  { id: "momento-riiffs", name: "Momento", brand: "Riiffs", volume: "100ml", price: 39.99, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "layaan", name: "Layaan", brand: "Lattafa", volume: "100ml", price: 39.8, category: "Femininos" },
  { id: "island-vanilla-dunes", name: "Island Vanilla Dunes", brand: "Khadlaj", volume: "100ml", price: 45.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "habik-women", name: "Habik for Women", brand: "Lattafa", volume: "100ml", price: 38.5, category: "Femininos" },
  { id: "yara-50", name: "Yara", brand: "Lattafa", volume: "50ml", price: 12.9, category: "Femininos" },
  { id: "shiyaaka-snow", name: "Shiyaaka Snow", brand: "Khadlaj", volume: "100ml", price: 42.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "fakhar-rose", name: "Fakhar Rose", brand: "Lattafa", volume: "100ml", price: 32.9, category: "Femininos" },
  { id: "rayhaan-azul", name: "Azul", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "brioche-vanille", name: "Brioche Vanille", brand: "Lattafa", volume: "100ml", price: 32.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "pisa", name: "Pisa", brand: "Lattafa", volume: "100ml", price: 58.99, category: "Masculinos" },
  { id: "vulcan-feu", name: "Vulcan Feu", brand: "French Avenue", volume: "100ml", price: 48.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "sehr", name: "Sehr", brand: "Lattafa", volume: "100ml", price: 52.5, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "rayhaan-kiss", name: "Kiss", brand: "Rayhaan", volume: "100ml", price: 44.99, category: "Femininos" },
  { id: "nebras-elixir", name: "Nebras Elixir", brand: "Lattafa", volume: "100ml", price: 44.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "marwa", name: "Marwa", brand: "Arabiyat Prestige", volume: "100ml", price: 52.5, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "rayhaan-aloha", name: "Pacific Aloha", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "turathi-electric", name: "Turathi Electric", brand: "Afnan", volume: "100ml", price: 44.5, category: "Masculinos" },
  { id: "irida-extrait", name: "Irida Extrait", brand: "French Avenue", volume: "100ml", price: 53.9, category: "Femininos" },
  { id: "island-dreams", name: "Island Dreams", brand: "Khadlaj", volume: "100ml", price: 44.5, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "9pm-rebel", name: "9PM Rebel", brand: "Afnan", volume: "100ml", price: 44.9, category: "Masculinos", bestSeller: true },
  { id: "yara-tous", name: "Yara Tous", brand: "Lattafa", volume: "100ml", price: 28, category: "Femininos" },
  { id: "milani-warm-vanilla", name: "Milani Warm Vanilla", brand: "Volaré", volume: "100ml", price: 32.99, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "art-of-arabia-i", name: "Art of Arabia I", brand: "Lattafa", volume: "100ml", price: 46, category: "Masculinos" },
  { id: "vanilla-voyage", name: "Vanilla Voyage", brand: "Maison Asrar", volume: "100ml", price: 45.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "khamrah-dukhan", name: "Khamrah Dukhan", brand: "Lattafa", volume: "100ml", price: 43.99, category: "Masculinos", bestSeller: true },
  { id: "club-de-nuit-intense-man", name: "Club de Nuit Intense Man", brand: "Armaf", volume: "105ml", price: 44.99, category: "Masculinos", bestSeller: true },
  { id: "ravine-ice", name: "Ravine Ice", brand: "Riiffs", volume: "100ml", price: 49.99, category: "Masculinos" },
  { id: "odyssey-mega", name: "Odyssey Mega", brand: "Armaf", volume: "100ml", price: 37.9, category: "Masculinos" },
  { id: "eclaire", name: "Eclaire", brand: "Lattafa", volume: "100ml", price: 40, category: "Femininos", bestSeller: true },
  { id: "fakhar-gold", name: "Fakhar Gold", brand: "Lattafa", volume: "100ml", price: 32.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "hawas-kobra", name: "Hawas Kobra", brand: "Rasasi", volume: "100ml", price: 52.5, category: "Masculinos" },
  { id: "asad-zanzibar-limited", name: "Asad Zanzibar Limited Edition", brand: "Lattafa", volume: "100ml", price: 29.5, category: "Masculinos" },
  { id: "rayhaan-obsidian", name: "Obsidian", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "tiramisu-coco", name: "Tiramisu Coco", brand: "Zimaya", volume: "100ml", price: 42.5, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "amber-oud-gold", name: "Amber Oud Gold Edition", brand: "Al Haramain", volume: "60ml / 100ml", price: 74.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "voux-turquoise", name: "Voux Turquoise", brand: "Paris Corner", volume: "100ml", price: 38.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "platine-blanc", name: "Platine Blanc", brand: "Aromatix x French Avenue", volume: "100ml", price: 52.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "bayn-al-asrar", name: "Bayn Al Asrar", brand: "Paris Corner", volume: "100ml", price: 45.9, category: "Femininos" },
  { id: "khamrah-qahwa", name: "Khamrah Qahwa", brand: "Lattafa", volume: "100ml", price: 42.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "asad", name: "Asad", brand: "Lattafa", volume: "100ml", price: 28, category: "Masculinos" },
  { id: "saher", name: "Saher", brand: "Nusuk", volume: "100ml", price: 47.9, category: "Femininos" },
  { id: "falak", name: "Falak", brand: "Nusuk", volume: "100ml", price: 52.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "rayhaan-terra", name: "Terra", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "rayhaan-wolf", name: "Wolf", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "jasoor", name: "Jasoor", brand: "Lattafa", volume: "100ml", price: 38.99, category: "Masculinos" },
  { id: "ameerat-al-arab", name: "Ameerat Al Arab", brand: "Asdaaf", volume: "100ml", price: 32.5, category: "Femininos" },
  { id: "narissa-for-her", name: "Narissa for Her", brand: "Maison Alhambra", volume: "100ml", price: 40, category: "Femininos" },
  { id: "shiyaaka-white", name: "Shiyaaka White", brand: "Khadlaj", volume: "100ml", price: 38.9, category: "Femininos" },
  { id: "atlas", name: "Atlas", brand: "Lattafa", volume: "55ml", price: 42, category: "Masculinos" },
  { id: "the-kingdom", name: "The Kingdom", brand: "Lattafa", volume: "100ml", price: 38.9, category: "Femininos" },
  { id: "victoria", name: "Victoria", brand: "Lattafa", volume: "100ml", price: 39.99, category: "Femininos" },
  { id: "king-of-arabia", name: "King of Arabia + 4 decants", brand: "Lattafa", volume: "100ml", price: 55.9, category: "Masculinos" },
  { id: "nasmaat", name: "Nasmaat", brand: "Lattafa", volume: "100ml", price: 38.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "mashrabya", name: "Mashrabya", brand: "Lattafa", volume: "100ml", price: 34.99, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "cordoba-rouge", name: "Cordoba Rouge", brand: "Mamlakat Al Oud", volume: "100ml", price: 42.5, category: "Femininos" },
  { id: "asad-bourbon", name: "Asad Bourbon", brand: "Lattafa", volume: "100ml", price: 30.8, category: "Masculinos" },
  { id: "aira", name: "Aira", brand: "Paris Corner", volume: "100ml", price: 42.9, category: "Femininos" },
  { id: "rayhaan-italia", name: "Italia Pour Homme", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "bint-hooran-rose", name: "Bint Hooran Rose", brand: "Ard Al Zaafaran", volume: "100ml", price: 34.9, category: "Femininos" },
  { id: "ana-abiyedh-white", name: "Ana Abiyedh White", brand: "Lattafa", volume: "60ml", price: 30.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "club-de-nuit-woman", name: "Club de Nuit Woman", brand: "Armaf", volume: "105ml", price: 48.9, category: "Femininos", bestSeller: true },
  { id: "wadi", name: "Wadi", brand: "Maison Asrar", volume: "100ml", price: 42.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "bint-hooran", name: "Bint Hooran", brand: "Ard Al Zaafaran", volume: "100ml", price: 34.9, category: "Femininos" },
  { id: "odyssey-spectra", name: "Odyssey Spectra", brand: "Armaf", volume: "100ml", price: 37.9, category: "Masculinos" },
  { id: "chaos-extrait", name: "Chaos Extrait", brand: "French Avenue", volume: "100ml", price: 45.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "confidential-private-gold", name: "Confidential Private Gold", brand: "Lattafa", volume: "100ml", price: 32.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "queen-of-roses", name: "Queen of Roses + 4 decants", brand: "Lattafa", volume: "100ml", price: 47.9, category: "Femininos" },
  { id: "pacific-blue", name: "Pacific Blue", brand: "Maison Alhambra", volume: "100ml", price: 38.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "ana-abiyedh-coral", name: "Ana Abiyedh Coral", brand: "Lattafa", volume: "60ml", price: 32.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "winners-trophy-gold", name: "Winner's Trophy Gold", brand: "Lattafa", volume: "100ml", price: 39.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "ana-abiyedh-passion", name: "Ana Abiyedh Passion", brand: "Lattafa", volume: "60ml", price: 35.9, category: "Femininos" },
  { id: "aether-extrait", name: "Aether Extrait", brand: "French Avenue", volume: "100ml", price: 45.5, category: "Masculinos" },
  { id: "rave-now-women", name: "Rave Now Women", brand: "Rave", volume: "100ml", price: 38.99, category: "Femininos" },
  { id: "legacy-maison-asrar", name: "Legacy", brand: "Maison Asrar", volume: "100ml", price: 52.99, category: "Masculinos" },
  { id: "asad-elixir", name: "Asad Elixir", brand: "Lattafa", volume: "100ml", price: 30.8, category: "Masculinos" },
  { id: "passion", name: "Passion", brand: "Lattafa", volume: "65ml", price: 35.9, category: "Femininos" },
  { id: "raghba-wood-intense", name: "Raghba Wood Intense", brand: "Lattafa", volume: "100ml", price: 25.5, category: "Masculinos" },
  { id: "firestorm", name: "Firestorm", brand: "French Avenue", volume: "100ml", price: 48.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "hayaati", name: "Hayaati", brand: "Lattafa", volume: "100ml", price: 27.9, category: "Masculinos" },
  { id: "musamam-black", name: "Musamam Black", brand: "Lattafa", volume: "100ml", price: 52.9, category: "Masculinos" },
  { id: "rare-reef", name: "Rare Reef", brand: "Afnan", volume: "100ml", price: 42.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "9pm-night-out", name: "9PM Night Out", brand: "Afnan", volume: "100ml", price: 55.9, category: "Masculinos" },
  { id: "mughal-fort", name: "Mughal Fort", brand: "Lattafa", volume: "100ml", price: 62.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "rayhaan-divine", name: "Divine", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "riiffs-freeze", name: "Freeze", brand: "Riiffs", volume: "100ml", price: 44.99, category: "Masculinos" },
  { id: "rayhaan-floriana", name: "Floriana", brand: "Rayhaan", volume: "100ml", price: 42.9, category: "Femininos" },
  { id: "yara-elixir", name: "Yara Elixir", brand: "Lattafa", volume: "100ml", price: 30.5, category: "Femininos" },
  { id: "nebras", name: "Nebras", brand: "Lattafa", volume: "100ml", price: 42.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "qaed-al-fursan", name: "Qaed Al Fursan", brand: "Lattafa", volume: "100ml", price: 28.99, category: "Masculinos" },
  { id: "philos-messenger", name: "Philos Messenger", brand: "Maison Alhambra", volume: "100ml", price: 38.99, category: "Masculinos" },
  { id: "supremacy-collectors", name: "Supremacy Collector's Edition", brand: "Afnan", volume: "100ml", price: 74.9, category: "Masculinos", soldout: true },
  { id: "reem", name: "Reem", brand: "Lattafa", volume: "100ml", price: 45, category: "Femininos" },
  { id: "veneno-bianco", name: "Veneno Bianco", brand: "French Avenue", volume: "100ml", price: 52.5, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "angham-second-song", name: "Angham Second Song", brand: "Lattafa", volume: "100ml", price: 42.5, category: "Femininos" },
  { id: "his-confession", name: "His Confession", brand: "Lattafa", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "dynasty", name: "Dynasty", brand: "Lattafa", volume: "100ml", price: 44.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "rayhaan-pacific-aura", name: "Pacific Aura", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "vulcan-baie", name: "Vulcan Baie", brand: "French Avenue", volume: "100ml", price: 44.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "rayhaan-elixir", name: "Elixir", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Masculinos" },
  { id: "opulent-dubai", name: "Opulent Dubai", brand: "Lattafa", volume: "100ml", price: 32.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "amazon-rainfall", name: "Amazon Rainfall", brand: "Volaré", volume: "100ml", price: 34.9, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "rayhaan-tropical-vibe", name: "Tropical Vibe", brand: "Rayhaan", volume: "100ml", price: 45.9, category: "Unissexo", audiences: ["men", "women", "unisex"] },
  { id: "december-vanille", name: "December Vanille", brand: "Paris Corner", volume: "100ml", price: 38.8, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "rayhaan-ocean-rush", name: "Ocean Rush", brand: "Rayhaan", volume: "100ml", price: 42.9, category: "Masculinos" },
  { id: "hectic-bujairami", name: "Hectic", brand: "Bujairami", volume: "100ml", price: 64.99, category: "Unissexo", audiences: ["men", "unisex"] },
  { id: "9pm", name: "9PM", brand: "Afnan", volume: "100ml", price: 37.9, category: "Masculinos", bestSeller: true },
  { id: "angham", name: "Angham", brand: "Lattafa", volume: "100ml", price: 42.5, category: "Femininos" },
  { id: "rayhaan-nocturno-elixir", name: "Nocturno Elixir", brand: "Rayhaan", volume: "100ml", price: 47.9, category: "Masculinos" },
  { id: "yara-moi", name: "Yara Moi", brand: "Lattafa", volume: "100ml", price: 28.5, category: "Femininos" },
  { id: "atheeri", name: "Atheeri", brand: "Lattafa", volume: "100ml", price: 48.5, category: "Femininos" },
  { id: "amber-empire", name: "Amber Empire", brand: "French Avenue", volume: "100ml", price: 48.9, category: "Masculinos" },
  { id: "kingsman", name: "Kingsman", brand: "Maison Alhambra", volume: "100ml", price: 34.9, category: "Masculinos" },
  { id: "your-touch-for-women", name: "Your Touch for Women", brand: "Maison Alhambra", volume: "100ml", price: 32.9, category: "Femininos" },
  { id: "barakkat-rouge-540", name: "Barakkat Rouge 540", brand: "Fragrance World", volume: "100ml", price: 29.9, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "odyssey-mandarin-sky", name: "Odyssey Mandarin Sky", brand: "Armaf", volume: "100ml", price: 38.9, category: "Masculinos" },
  { id: "musamam-white", name: "Musamam White Intense", brand: "Lattafa", volume: "100ml", price: 49.5, category: "Unissexo", audiences: ["women", "unisex"] },
  { id: "reyna", name: "Reyna", brand: "Maison Alhambra", volume: "100ml", price: 36.99, category: "Femininos" },
  { id: "durrat-al-aroos", name: "Durrat Al Aroos", brand: "Al Wataniah", volume: "100ml", price: 32.9, category: "Femininos" },
  { id: "spectre-wraith", name: "Spectre Wraith", brand: "French Avenue", volume: "100ml", price: 47.8, category: "Masculinos" },
  { id: "your-touch-amber", name: "Your Touch Amber", brand: "Maison Alhambra", volume: "100ml", price: 35, category: "Masculinos" },
  { id: "club-de-nuit-sillage", name: "Club de Nuit Sillage", brand: "Armaf", volume: "100ml", price: 45, category: "Masculinos" },
];

const PRODUCTS: Product[] = CATALOG.filter((seed) => seed.id !== "yara-50").map((seed, index) => {
  const [color, accent, mood] = PRODUCT_PALETTES[index % PRODUCT_PALETTES.length];
  const variants = [...fullSizeVariants(seed), ...decantVariants(seed.id, seed.price)];
  return {
    id: seed.id,
    brand: seed.brand,
    category: seed.category,
    scentProfile: inferScentProfile(seed),
    audiences: seed.audiences ?? [seed.category === "Masculinos" ? "men" : seed.category === "Femininos" ? "women" : "unisex"],
    tag: seed.soldout ? "soldout" : "stock",
    isNew: index < 12,
    bestSeller: seed.bestSeller,
    name: { pt: seed.name, en: seed.name },
    family: { pt: "Informação olfativa brevemente", en: "Olfactory details coming soon" },
    desc: {
      pt: `${seed.name}, de ${seed.brand}, disponível em ${seed.volume}.`,
      en: `${seed.name} by ${seed.brand}, available in ${seed.volume}.`,
    },
    notes: {
      top: { pt: [], en: [] },
      heart: { pt: [], en: [] },
      base: { pt: [], en: [] },
    },
    price: seed.price,
    volume: variants[0].volume,
    variants,
    color,
    accent,
    mood,
    imageUrl: PRODUCT_IMAGE_IDS.has(seed.id) ? `/products/${seed.id}.webp` : undefined,
  };
});

function asDecantProduct(product: Product): Product | null {
  if (product.category === "Outros produtos") return null;
  const variants = product.variants.filter((variant) => variant.isDecant);
  const firstVariant = variants.find((variant) => !variant.soldout) ?? variants[0];
  if (!firstVariant) return null;
  return {
    ...product,
    id: `decant-${product.id}`,
    name: {
      pt: `${product.name.pt} · Decant`,
      en: `${product.name.en} · Decant`,
    },
    price: firstVariant.price,
    volume: firstVariant.volume,
    variants,
    tag: variants.every((variant) => variant.soldout) ? "soldout" : "stock",
    isNew: false,
    bestSeller: false,
    isDecant: true,
  };
}

const DECANT_PRODUCTS: Product[] = PRODUCTS.flatMap((product) => {
  const decantProduct = asDecantProduct(product);
  return decantProduct ? [decantProduct] : [];
});

const INITIAL_PRODUCTS = [...PRODUCTS, ...DECANT_PRODUCTS];

const shopMenu = {
  buy: [
    { kind: "all" as const, label: { pt: "Ver todos", en: "View all" } },
    { kind: "men" as const, label: { pt: "Perfumes Masculinos", en: "Men's fragrances" } },
    { kind: "women" as const, label: { pt: "Perfumes Femininos", en: "Women's fragrances" } },
    { kind: "unisex" as const, label: { pt: "Perfumes Unissexo", en: "Unisex fragrances" } },
    { kind: "other" as const, label: { pt: "Outros produtos", en: "Other products" } },
  ],
  discover: ["Novidades", "Best sellers", "Decants 5 ml"],
};

const DISCOUNTS: Record<string, number> = {};

const PROMOTION_ENDS: Record<string, string> = Object.fromEntries(
  Object.keys(DISCOUNTS).map((id) => [id, "2026-08-20T22:59:00.000Z"]),
);

function price(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "pt" ? "pt-PT" : "en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function adminSaveError(error: unknown, lang: Lang) {
  const message = error instanceof Error ? error.message.replace(/^FirebaseError:\s*/i, "") : "";
  if (/permission|insufficient/i.test(message)) {
    return lang === "pt"
      ? "A sessão não tem permissão de administrador. Termine sessão, volte a entrar e tente novamente."
      : "This session does not have administrator permission. Sign out, sign back in, and try again.";
  }
  return message || (lang === "pt" ? "Não foi possível guardar os preços." : "The prices could not be saved.");
}

function productSet(products: Product[], kind: ListingKind) {
  if (kind === "decants") return products.filter((product) => product.isDecant);
  const fullSizes = products.filter((product) => !product.isDecant);
  if (kind === "other") return fullSizes.filter((product) => product.category === "Outros produtos");
  if (kind === "men") return fullSizes.filter((product) => product.audiences.includes("men"));
  if (kind === "women") return fullSizes.filter((product) => product.audiences.includes("women"));
  if (kind === "unisex") return fullSizes.filter((product) => product.audiences.includes("unisex"));
  if (kind === "new") return fullSizes.filter(isNewProduct);
  if (kind === "best") return fullSizes.filter((product) => product.bestSeller);
  if (kind === "sale") return fullSizes.filter((product) => productDiscount(product) > 0);
  return fullSizes;
}

function isNewProduct(product: Product) {
  return product.isNew ?? product.tag === "new";
}

function filterAdminCatalogue(products: Product[], query: string, category: ListingKind, highlight: "all" | "best" | "sale") {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return productSet(productSet(products, category), highlight).filter((product) => {
    const text = normalize([product.name.pt, product.name.en, product.brand, product.id].join(" "));
    return words.every((word) => text.includes(word));
  });
}

function productsForProfile(products: Product[], profile: ScentProfile) {
  return products.filter((product) => !product.isDecant && product.category !== "Outros produtos" && product.scentProfile === profile);
}

function canonicalProductId(productId: string) {
  return productId.replace(/^decant-/, "").split("--")[0];
}

function productPromotionEnd(product: Product) {
  if (Object.prototype.hasOwnProperty.call(product, "promotionEndsAt")) return product.promotionEndsAt;
  return PROMOTION_ENDS[product.id];
}

function productDiscount(product: Product, now = Date.now()) {
  const discount = Object.prototype.hasOwnProperty.call(product, "discount") ? product.discount ?? 0 : DISCOUNTS[product.id] ?? 0;
  const endsAt = productPromotionEnd(product);
  if (endsAt && new Date(endsAt).getTime() <= now) return 0;
  return discount;
}

function productPrice(product: Product) {
  const discount = productDiscount(product);
  return discount ? product.price * (1 - discount / 100) : product.price;
}

function toDateTimeInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatCountdown(endsAt: string, now: number, lang: Lang) {
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  if (remaining <= 0) return lang === "pt" ? "Promoção terminada" : "Promotion ended";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const prefix = lang === "pt" ? "Termina em" : "Ends in";
  if (days > 0) {
    const dayLabel = lang === "pt" ? (days === 1 ? "dia" : "dias") : (days === 1 ? "day" : "days");
    const hourLabel = lang === "pt" ? (hours === 1 ? "hora" : "horas") : (hours === 1 ? "hour" : "hours");
    return `${prefix} ${days} ${dayLabel}${hours > 0 ? ` ${lang === "pt" ? "e" : "and"} ${hours} ${hourLabel}` : ""}`;
  }
  if (hours > 0) {
    const hourLabel = lang === "pt" ? (hours === 1 ? "hora" : "horas") : (hours === 1 ? "hour" : "hours");
    const minuteLabel = lang === "pt" ? (minutes === 1 ? "minuto" : "minutos") : (minutes === 1 ? "minute" : "minutes");
    return `${prefix} ${hours} ${hourLabel}${minutes > 0 ? ` ${lang === "pt" ? "e" : "and"} ${minutes} ${minuteLabel}` : ""}`;
  }
  if (minutes > 0) return `${prefix} ${minutes} ${lang === "pt" ? (minutes === 1 ? "minuto" : "minutos") : (minutes === 1 ? "minute" : "minutes")}`;
  return `${prefix} ${seconds} ${lang === "pt" ? (seconds === 1 ? "segundo" : "segundos") : (seconds === 1 ? "second" : "seconds")}`;
}

function formatFullCountdown(endsAt: string, now: number) {
  const remaining = Math.max(0, new Date(endsAt).getTime() - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function usePromotionClock(product: Product) {
  const endsAt = productPromotionEnd(product);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  return { endsAt, now };
}

export default function Home() {
  return <ShippingSettingsProvider><DecantAvailabilityProvider><Storefront /></DecantAvailabilityProvider></ShippingSettingsProvider>;
}

function Storefront() {
  const [lang, setLang] = useState<Lang>("pt");
  const [view, setView] = useState<View>("home");
  const [legalKind, setLegalKind] = useState<LegalKind>("terms");
  const [cookieChoice, setCookieChoice] = useState<"accepted" | "rejected" | null>(null);
  const [cookiePanelOpen, setCookiePanelOpen] = useState(false);
  const [rawCatalog, setCatalog] = useState<Product[]>(INITIAL_PRODUCTS);
  const { blockedSizes, ready: decantsReady, error: decantsError } = useDecantAvailability();
  const catalog = useMemo(() => rawCatalog.map((product) => applyDecantAvailability(product, blockedSizes)), [rawCatalog, blockedSizes]);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authTransition, setAuthTransition] = useState(false);
  const [pendingFavoritesPage, setPendingFavoritesPage] = useState(false);
  const [favoritesOwner, setFavoritesOwner] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [influencerUses, setInfluencerUses] = useState<InfluencerCouponUse[]>([]);
  const [favoriteFolders, setFavoriteFolders] = useState<FavoriteFolder[]>([]);
  const [favoriteProductId, setFavoriteProductId] = useState<string | null>(null);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingKind>("all");
  const [profileFilter, setProfileFilter] = useState<ScentProfile | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(PRODUCTS[0].id);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteFavorites = useRef("");
  const t = COPY[lang];

  const activeProduct = catalog.find((product) => product.id === activeId) ?? catalog[0] ?? PRODUCTS[0];
  const favoriteProduct = catalog.find((product) => product.id === favoriteProductId) ?? null;
  const listingProducts = brandFilter
    ? productsForBrand(productSet(catalog, "all"), brandFilter)
    : profileFilter
      ? productsForProfile(catalog, profileFilter)
      : productSet(catalog, listing);
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((product) => {
      const haystack = [
        product.name[lang],
        product.brand,
        product.family[lang],
        product.desc?.[lang] ?? product.desc?.pt ?? "",
        product.category,
        ...product.notes.top[lang],
        ...product.notes.heart[lang],
        ...product.notes.base[lang],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }).slice(0, 5);
  }, [query, lang, catalog]);

  function applyRoute(route: AppRoute) {
    setView(route.view);
    setListing(route.listing);
    setProfileFilter(route.profileFilter);
    setBrandFilter(route.brandFilter ?? null);
    if (route.activeId) setActiveId(route.activeId);
    if (route.legal) setLegalKind(route.legal);
    setMobileOpen(false);
    setCartOpen(false);
  }

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view, listing, activeId, profileFilter, brandFilter]);

  useEffect(() => {
    const syncFromAddress = () => applyRoute(routeFromPath(window.location.pathname));
    syncFromAddress();
    window.addEventListener("popstate", syncFromAddress);
    return () => window.removeEventListener("popstate", syncFromAddress);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("drawer-lock", cartOpen || mobileOpen);
    return () => document.body.classList.remove("drawer-lock");
  }, [cartOpen, mobileOpen]);

  useEffect(() => {
    const stored = window.localStorage.getItem("mystic-cookie-consent-v1");
    const timer = window.setTimeout(() => {
      if (stored === "accepted" || stored === "rejected") {
        setCookieChoice(stored);
      } else {
        setCookiePanelOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => watchSession((nextSession) => {
    setSession(nextSession);
    setAuthReady(true);
    setAuthTransition(false);
  }, () => {
    setAuthReady(false);
    setSession(null);
    setOrders([]);
    setProfiles([]);
    setInfluencerUses([]);
    setFavoriteFolders([]);
    setFavoritesOwner(null);
    setFavoriteProductId(null);
    remoteFavorites.current = "";
  }), []);

  useEffect(() => {
    if (view !== "favorites" || !authReady || session) return;
    setPendingFavoritesPage(true);
    window.history.replaceState({}, "", "/conta");
    applyRoute({ view: "account", listing: "all", profileFilter: null });
  }, [view, authReady, session]);

  useEffect(() => {
    if (!authReady || !session) return;
    if (pendingFavoritesPage) {
      setPendingFavoritesPage(false);
      navigate("/conta/favoritos", { view: "favorites", listing, profileFilter });
      return;
    }
    if (view === "account" && !pendingFavoriteId && session.role === "admin") {
      navigate("/admin", { view: "admin", listing, profileFilter });
    }
  }, [authReady, session?.uid, session?.role, pendingFavoritesPage, pendingFavoriteId, view]);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return watchProducts<Product>((products) => {
      if (products.length) {
        setCatalog(products.map((product) => {
          const normalizedProduct = {
            ...product,
            isNew: product.isNew ?? product.tag === "new",
            tag: product.tag === "new" ? "stock" : product.tag,
          } as Product;
          if (Array.isArray(normalizedProduct.images)) return { ...normalizedProduct, ...productImageFields(normalizedProduct.images) };
          if (normalizedProduct.imageUrl) return normalizedProduct;
          const baseId = product.id.startsWith("decant-") ? product.id.slice(7) : product.id;
          return PRODUCT_IMAGE_IDS.has(baseId)
            ? { ...normalizedProduct, imageUrl: `/products/${baseId}.webp` }
            : normalizedProduct;
        }));
      }
    });
  }, []);

  useEffect(() => {
    if (!session || !firebaseEnabled) {
      if (!session) setOrders([]);
      return;
    }
    return watchOrders<Order>(session, setOrders);
  }, [session]);

  useEffect(() => {
    if (!session || session.role !== "admin" || !firebaseEnabled) {
      setCoupons([]);
      return;
    }
    return watchCoupons<Coupon>(setCoupons);
  }, [session]);

  useEffect(() => {
    if (!session || session.role !== "admin" || !firebaseEnabled) {
      setProfiles([]);
      return;
    }
    return watchProfiles<CustomerProfile>(setProfiles);
  }, [session]);

  useEffect(() => {
    if (!session?.isInfluencer || !firebaseEnabled) {
      setInfluencerUses([]);
      return;
    }
    return watchInfluencerCouponUses<InfluencerCouponUse>(session.uid, setInfluencerUses);
  }, [session?.uid, session?.isInfluencer]);

  useEffect(() => {
    setFavoriteFolders([]);
    setFavoritesOwner(null);
    setFavoriteProductId(null);
    if (!session?.uid || !firebaseEnabled) return;
    return watchFavoriteFolders<FavoriteFolder>(session.uid, (folders) => {
      remoteFavorites.current = JSON.stringify(folders);
      setFavoriteFolders(folders);
      setFavoritesOwner(session.uid);
    });
  }, [session?.uid]);

  useEffect(() => {
    if (!session || favoritesOwner !== session.uid || !firebaseEnabled) return;
    const next = JSON.stringify(favoriteFolders);
    if (next === remoteFavorites.current) return;
    remoteFavorites.current = next;
    void saveFavoriteFolders(session.uid, favoriteFolders).catch(() => {
      showToast(lang === "pt" ? "Não foi possível guardar os favoritos. Tente novamente." : "Could not save favourites. Please try again.");
    });
  }, [favoriteFolders, favoritesOwner, session]);

  useEffect(() => {
    if (!session || favoritesOwner !== session.uid || !pendingFavoriteId) return;
    setFavoriteProductId(pendingFavoriteId);
    setPendingFavoriteId(null);
  }, [session, favoritesOwner, pendingFavoriteId]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  async function handleLogout() {
    if (authTransition) return;
    setAuthTransition(true);
    setAuthReady(false);
    navigate("/conta", { view: "account", listing, profileFilter });
    try {
      await logoutFirebase();
    } catch {
      setAuthReady(true);
      setAuthTransition(false);
      showToast(lang === "pt" ? "Não foi possível terminar a sessão. Tente novamente." : "Could not sign out. Please try again.");
    }
  }

  function navigate(path: string, route: AppRoute) {
    if (window.location.pathname !== path) window.history.pushState({ mysticRoute: true }, "", path);
    applyRoute(route);
  }

  function openHome() {
    navigate("/", { view: "home", listing: "all", profileFilter: null });
  }

  function openListing(kind: ListingKind) {
    navigate(LISTING_PATHS[kind], { view: "listing", listing: kind, profileFilter: null });
  }

  function openProfile(profile: ScentProfile) {
    navigate(`/perfil-olfativo/${profile}`, { view: "listing", listing: "all", profileFilter: profile });
  }

  function openBrand(brand: string) {
    navigate(`/marcas/${encodeURIComponent(brand)}`, { view: "listing", listing: "all", profileFilter: null, brandFilter: brand });
  }

  function openProduct(id: string) {
    navigate(`/produto/${encodeURIComponent(id)}`, { view: "product", listing, profileFilter, activeId: id });
    setQuery("");
  }

  function openLegal(kind: LegalKind) {
    navigate(LEGAL_PATHS[kind], { view: "legal", listing: "all", profileFilter: null, legal: kind });
  }

  function saveCookieChoice(choice: "accepted" | "rejected") {
    window.localStorage.setItem("mystic-cookie-consent-v1", choice);
    setCookieChoice(choice);
    setCookiePanelOpen(false);
  }

  function addToCart(product: Product, quantity = 1) {
    const selectedVariant = product.variants.find((variant) => variant.volume === product.volume) ?? product.variants[0];
    if (selectedVariant?.isDecant && (!decantsReady || decantsError || isDecantBlocked(selectedVariant, blockedSizes))) return;
    const stockLimit = typeof selectedVariant?.stock === "number" ? Math.max(0, selectedVariant.stock) : MAX_ORDER_QUANTITY;
    const isUnavailable = stockLimit === 0 || Boolean(selectedVariant?.soldout) || (!selectedVariant?.isDecant && product.tag === "soldout");
    if (isUnavailable) return;
    const amount = Math.min(MAX_ORDER_QUANTITY, stockLimit, Math.max(1, quantity));
    setCart((items) => {
      const existing = items.find((item) => item.id === product.id);
      if (existing) {
        return items.map((item) => (item.id === product.id ? { ...item, qty: Math.min(MAX_ORDER_QUANTITY, stockLimit, item.qty + amount) } : item));
      }
      return [...items, { ...product, price: productPrice(product), qty: amount }];
    });
    showToast(lang === "pt" ? "Adicionado ao carrinho" : "Added to cart");
  }

  function updateQty(id: string, qty: number) {
    setCart((items) => items.map((item) => {
      if (item.id !== id) return item;
      const stockLimit = typeof item.variants[0]?.stock === "number" ? Math.max(1, item.variants[0].stock) : MAX_ORDER_QUANTITY;
      return { ...item, qty: Math.min(stockLimit, Math.max(1, qty)) };
    }));
  }

  function removeItem(id: string) {
    setCart((items) => items.filter((item) => item.id !== id));
  }

  function openFavorite(product: Product) {
    if (!session) {
      setPendingFavoriteId(product.id);
      navigate("/conta", { view: "account", listing, profileFilter });
      showToast(lang === "pt" ? "Entre na sua conta para guardar favoritos" : "Sign in to save favourites");
      return;
    }
    if (favoritesOwner !== session.uid) {
      setPendingFavoriteId(product.id);
      showToast(lang === "pt" ? "A carregar os seus favoritos..." : "Loading your favourites...");
      return;
    }
    setFavoriteProductId(product.id);
  }

  function openFavorites() {
    if (!session) {
      setPendingFavoritesPage(true);
      navigate("/conta", { view: "account", listing, profileFilter });
      return;
    }
    navigate("/conta/favoritos", { view: "favorites", listing, profileFilter });
  }

  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  return (
    <BrandsProvider catalogueNames={catalog.map((product) => product.brand)} initialNames={BRANDS}><div className="site-shell">
      <Header
        lang={lang}
        setLang={setLang}
        t={t}
        session={session}
        cartCount={cartCount}
        query={query}
        setQuery={setQuery}
        searchResults={searchResults}
        onHome={openHome}
        onListing={openListing}
        onBrand={openBrand}
        onProduct={openProduct}
        onCart={() => setCartOpen(true)}
        onFavorites={openFavorites}
        onAccount={() => session?.role === "admin"
          ? navigate("/admin", { view: "admin", listing, profileFilter })
          : navigate("/conta", { view: "account", listing, profileFilter })}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <main>
        {view === "home" && (
          <>
            <Hero t={t} lang={lang} />
            <DiscoveryCarousel products={catalog} lang={lang} onListing={openListing} />
            <div className="home-decant-feature">
              <DecantPromo lang={lang} />
            </div>
            <NewArrivals products={catalog} t={t} lang={lang} onListing={openListing} onProduct={openProduct} onFavorite={openFavorite} favoriteFolders={favoriteFolders} />
            <WhatsAppConsultationBanner />
            <ScentProfiles lang={lang} onProfile={openProfile} />
            <BrandBand onBrand={openBrand} />
          </>
        )}

        {view === "listing" && (
          <ListingPage
            t={t}
            lang={lang}
            kind={listing}
            profile={profileFilter}
            brand={brandFilter}
            products={listingProducts}
            onProduct={openProduct}
            onFavorite={openFavorite}
            favoriteFolders={favoriteFolders}
          />
        )}

        {view === "product" && (
          <ProductDetail
            key={activeProduct.id}
            t={t}
            lang={lang}
            product={activeProduct}
            products={catalog}
            onListing={openListing}
            onProduct={openProduct}
            onCart={addToCart}
            onFavorite={openFavorite}
            favoriteFolders={favoriteFolders}
            session={session}
            orders={orders}
            onLogin={() => navigate("/conta", { view: "account", listing, profileFilter })}
          />
        )}

        {view === "checkout" && (
          <CheckoutPage
            t={t}
            lang={lang}
            cart={cart}
            coupons={coupons}
            onCheckoutStarted={() => setCart([])}
            onBack={openHome}
          />
        )}

        {(view === "account" || (view === "favorites" && session)) && (
          <AccountPage
            favoritesOnly={view === "favorites"}
            authReady={authReady}
            favoritesReady={Boolean(session && favoritesOwner === session.uid)}
            lang={lang}
            session={session}
            products={catalog}
            orders={orders}
            influencerUses={influencerUses}
            favoriteFolders={favoriteFolders}
            setFavoriteFolders={setFavoriteFolders}
            onProduct={openProduct}
            onLogout={handleLogout}
            onShop={openHome}
          />
        )}

        {view === "admin" && session?.role === "admin" && (
          <AdminPage
            lang={lang}
            products={rawCatalog}
            setProducts={setCatalog}
            orders={orders}
            setOrders={setOrders}
            coupons={coupons}
            setCoupons={setCoupons}
            profiles={profiles}
            session={session}
            onShop={openHome}
            onLogout={handleLogout}
          />
        )}

        {view === "legal" && (
          <LegalPage kind={legalKind} onLegal={openLegal} onHome={openHome} />
        )}
      </main>

      <Footer t={t} onLegal={openLegal} onCookies={() => setCookiePanelOpen(true)} />
      <CartDrawer
        t={t}
        lang={lang}
        open={cartOpen}
        cart={cart}
        onClose={() => setCartOpen(false)}
        onUpdate={updateQty}
        onRemove={removeItem}
        onCheckout={() => {
          setCartOpen(false);
          navigate("/checkout", { view: "checkout", listing, profileFilter });
        }}
      />
      <FavoritePicker
        lang={lang}
        product={favoriteProduct}
        folders={favoriteFolders}
        setFolders={setFavoriteFolders}
        onClose={() => setFavoriteProductId(null)}
        onSaved={(message) => showToast(message)}
      />
      <a
        className="whatsapp-help"
        href="https://wa.me/351938258798?text=Ol%C3%A1%21%20Preciso%20de%20ajuda."
        target="_blank"
        rel="noreferrer"
        aria-label="Precisa de recomendações? Falar no WhatsApp"
      >
        <MessageCircle size={21} />
        <span>Precisa de recomendações?</span>
      </a>
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {cookiePanelOpen && (
        <CookieConsent
          choice={cookieChoice}
          onAccept={() => saveCookieChoice("accepted")}
          onReject={() => saveCookieChoice("rejected")}
          onCookies={() => {
            setCookiePanelOpen(false);
            openLegal("cookies");
          }}
          onPrivacy={() => {
            setCookiePanelOpen(false);
            openLegal("privacy");
          }}
        />
      )}
    </div></BrandsProvider>
  );
}

function Header({
  lang,
  setLang,
  t,
  session,
  cartCount,
  query,
  setQuery,
  searchResults,
  onHome,
  onListing,
  onBrand,
  onProduct,
  onCart,
  onAccount,
  onFavorites,
  mobileOpen,
  setMobileOpen,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (typeof COPY)[Lang];
  session: Session | null;
  cartCount: number;
  query: string;
  setQuery: (value: string) => void;
  searchResults: Product[];
  onHome: () => void;
  onListing: (kind: ListingKind) => void;
  onBrand: (brand: string) => void;
  onProduct: (id: string) => void;
  onCart: () => void;
  onAccount: () => void;
  onFavorites: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  const { brands } = useBrands();
  const { settings } = useShippingSettings();
  const announcement = lang === "pt"
    ? `Envios grátis para Portugal Continental a partir de ${price(settings.continental.freeFrom, lang)}`
    : `Free shipping to mainland Portugal from ${price(settings.continental.freeFrom, lang)}`;
  return (
    <header className="header">
      <div className="announcement" aria-label={lang === "pt" ? "Informações da loja" : "Store information"}>
        <div className="announcement-track">
          {Array.from({ length: 8 }, (_, index) => (
            <span className="announcement-item" key={index} aria-hidden={index > 0 ? "true" : undefined}>
              <b>{announcement}</b><i aria-hidden="true" />
            </span>
          ))}
        </div>
      </div>

      <div className="brand-row">
        <button
          className="mobile-menu-button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={lang === "pt" ? "Abrir menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          <Menu size={22} />
        </button>
        <button className="brand-logo" onClick={onHome} aria-label="Mystic Essence homepage">
          <Image src="/mystic-essence-wordmark.png" width={1206} height={254} alt="Mystic Essence" priority />
        </button>
        <nav className="gold-nav" aria-label="Primary navigation">
          <div className="nav-item has-mega">
            <button onClick={() => onListing("all")}>{t.nav.perfumes}</button>
            <PerfumeMega t={t} lang={lang} onListing={onListing} />
          </div>
          <div className="nav-item has-mega">
            <button type="button">{t.nav.brands}</button>
            <BrandMega onBrand={onBrand} />
          </div>
          <div className="nav-item">
            <button onClick={() => onListing("new")}>{t.nav.newIn}</button>
          </div>
          <div className="nav-item">
            <button onClick={() => onListing("sale")}>{t.nav.sale}</button>
          </div>
        </nav>
        <div className="header-actions">
          <div className="lang-pill" aria-label="Language switch">
            <Globe2 size={16} />
            <button className={lang === "pt" ? "active" : ""} onClick={() => setLang("pt")}>PT</button>
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          <button className="account-pill" onClick={onAccount} aria-label={t.account}>
            <User size={17} />
            <span>{session?.role === "admin" ? "Admin" : session?.name.split(" ")[0] || t.account}</span>
          </button>
          <div className="search-wrap">
            <Search className="search-icon" size={20} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} />
            {query.trim() && (
              <div className="search-panel">
                {searchResults.length === 0 ? (
                  <p>{lang === "pt" ? "Sem resultados" : "No results"}</p>
                ) : (
                  searchResults.map((product) => (
                    <button key={product.id} onClick={() => onProduct(product.id)}>
                      <ProductVisual product={product} compact />
                      <span>
                        <strong>{product.name[lang]}</strong>
                        <small>{product.brand} · {price(product.price, lang)}</small>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            className="mobile-account-button"
            onClick={onAccount}
            aria-label={lang === "pt" ? "Entrar ou criar conta" : "Sign in or create account"}
          >
            <User size={21} />
          </button>
          <button className="header-favorites-button" onClick={onFavorites} aria-label={lang === "pt" ? "Os meus favoritos" : "My favourites"} title={lang === "pt" ? "Os meus favoritos" : "My favourites"}>
            <Heart size={21} />
          </button>
          <button className="cart-button" onClick={onCart} aria-label={t.cart}>
            <ShoppingBag size={22} />
            <span>{cartCount}</span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mobile-menu-layer">
          <button className="mobile-menu-backdrop" onClick={() => setMobileOpen(false)} aria-label={lang === "pt" ? "Fechar menu" : "Close menu"} />
          <div className="mobile-panel" role="dialog" aria-label={lang === "pt" ? "Menu de navegação" : "Navigation menu"}>
            <div className="mobile-panel-head">
              <strong>{lang === "pt" ? "Menu" : "Menu"}</strong>
              <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label={lang === "pt" ? "Fechar menu" : "Close menu"}><X size={22} /></button>
            </div>
            <div className="mobile-search">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} />
              {query.trim() && (
                <div className="mobile-search-results">
                  {searchResults.length === 0 ? <p>{lang === "pt" ? "Sem resultados" : "No results"}</p> : searchResults.map((product) => (
                    <button key={product.id} onClick={() => onProduct(product.id)}>
                      <span><strong>{product.name[lang]}</strong><small>{product.brand} · {price(product.price, lang)}</small></span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <nav className="mobile-nav" aria-label={lang === "pt" ? "Navegação mobile" : "Mobile navigation"}>
              <button onClick={() => onListing("all")}><span>{lang === "pt" ? "Ver todos" : "View all"}</span><ChevronRight size={17} /></button>
              <button onClick={() => onListing("men")}><span>{lang === "pt" ? "Perfumes masculinos" : "Men's fragrances"}</span><ChevronRight size={17} /></button>
              <button onClick={() => onListing("women")}><span>{lang === "pt" ? "Perfumes femininos" : "Women's fragrances"}</span><ChevronRight size={17} /></button>
              <button onClick={() => onListing("unisex")}><span>{lang === "pt" ? "Perfumes unissexo" : "Unisex fragrances"}</span><ChevronRight size={17} /></button>
              <button onClick={() => onListing("other")}><span>{lang === "pt" ? "Outros produtos" : "Other products"}</span><ChevronRight size={17} /></button>
              <details className="mobile-brands-dropdown">
                <summary><span>{t.nav.brands}</span><ChevronRight size={17} /></summary>
                <div className="mobile-brands">
                  {brands.map((brand) => <button type="button" key={brandKey(brand)} onClick={() => onBrand(brand)}>{brand}</button>)}
                </div>
              </details>
              <button onClick={() => onListing("new")}><span>{t.nav.newIn}</span><ChevronRight size={17} /></button>
              <button onClick={() => onListing("sale")}><span>{t.nav.sale}</span><ChevronRight size={17} /></button>
              <button className="mobile-account-link" onClick={() => { setMobileOpen(false); onAccount(); }}>
                <span><User size={17} />{session?.role === "admin" ? "Admin" : session?.name.split(" ")[0] || (lang === "pt" ? "Entrar / Criar conta" : "Sign in / Create account")}</span>
                <ChevronRight size={17} />
              </button>
            </nav>
            <div className="mobile-language" aria-label="Language switch">
              <Globe2 size={16} />
              <button className={lang === "pt" ? "active" : ""} onClick={() => setLang("pt")}>PT</button>
              <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function PerfumeMega({ t, lang, onListing }: { t: (typeof COPY)[Lang]; lang: Lang; onListing: (kind: ListingKind) => void }) {
  return (
    <div className="mega perfume-mega">
      {shopMenu.buy.map((item) => <button key={item.kind} onClick={() => onListing(item.kind)}>{item.label[lang]}</button>)}
      <button onClick={() => onListing("best")}>{t.nav.best}</button>
    </div>
  );
}

function BrandMega({ onBrand }: { onBrand: (brand: string) => void }) {
  const { brands } = useBrands();
  return (
    <div className="mega brand-mega">
      {brands.map((brand) => <button key={brandKey(brand)} onClick={() => onBrand(brand)}>{brand}</button>)}
    </div>
  );
}

function Hero({ t, lang }: { t: (typeof COPY)[Lang]; lang: Lang }) {
  const { settings } = useShippingSettings();
  const trustItems = lang === "pt"
    ? [
        { icon: Truck, title: "Envios rápidos", detail: "Portugal, ilhas e Espanha" },
        { icon: Boxes, title: "Portes grátis", detail: `Portugal Continental: a partir de ${price(settings.continental.freeFrom, lang)}` },
        { icon: BadgeCheck, title: "100% originais", detail: "Seleção de marcas árabes" },
        { icon: Headphones, title: "Apoio personalizado", detail: "Ajuda a escolher o perfume ideal" },
      ]
    : [
        { icon: Truck, title: "Fast delivery", detail: "Portugal, islands and Spain" },
        { icon: Boxes, title: "Free shipping", detail: `Mainland Portugal: from ${price(settings.continental.freeFrom, lang)}` },
        { icon: BadgeCheck, title: "100% authentic", detail: "Selected Arabian brands" },
        { icon: Headphones, title: "Personal service", detail: "Help choosing your ideal scent" },
      ];

  return (
    <section className="hero">
      <div className="hero-main">
        <div className="hero-copy">
          <Image className="hero-emblem" src="/mystic-essence-hero-logo.png" width={498} height={501} alt="Mystic Essence" priority />
          <h1>{lang === "pt" ? "Perfumaria Árabe" : "Arabian Perfumery"}</h1>
          <p>{t.heroSub}</p>
          <span className="hero-signoff">{lang === "pt" ? "Descobre a tua essência ideal na Mystic" : "Discover your ideal essence at Mystic"}</span>
        </div>
        <div className="hero-stage">
          <div className="hero-store-image">
            <Image
              src="/mystic-essence-store-saturated.png"
              fill
              sizes="(max-width: 940px) 100vw, 62vw"
              alt="Interior da loja Mystic Essence em Santa Maria da Feira"
              priority
            />
          </div>
          <span className="hero-image-caption">Santa Maria da Feira · Aveiro</span>
        </div>
      </div>
      <div className="hero-trust" aria-label={lang === "pt" ? "Vantagens da loja" : "Store benefits"}>
        {trustItems.map(({ icon: Icon, title, detail }) => (
          <div className="hero-trust-item" key={title}>
            <Icon size={32} strokeWidth={1.45} />
            <span><strong>{title}</strong><small>{detail}</small></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DiscoveryCarousel({
  products,
  lang,
  onListing,
}: {
  products: Product[];
  lang: Lang;
  onListing: (kind: ListingKind) => void;
}) {
  const [active, setActive] = useState(2);
  const [paused, setPaused] = useState(false);
  const usedProductIds = new Set<string>();
  const pickSlideProduct = (preferredIds: string[], matches: (product: Product) => boolean) => {
    const preferred = preferredIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is Product => Boolean(product) && matches(product));
    const candidates = [...preferred, ...products.filter(matches), ...products];
    const selected = candidates.find((product) => product.imageUrl && !usedProductIds.has(product.id))
      ?? candidates.find((product) => !usedProductIds.has(product.id))
      ?? products[0];
    if (selected) usedProductIds.add(selected.id);
    return selected;
  };
  const saleProduct = pickSlideProduct(["9pm-rebel", "club-de-nuit-intense-man"], (product) => productDiscount(product) > 0);
  const bestProduct = pickSlideProduct(["eclaire", "yara", "khamrah-dukhan"], (product) => Boolean(product.bestSeller));
  const menProduct = pickSlideProduct(["club-de-nuit-intense-man", "liquid-brun", "fakhar-platinum"], (product) => product.category === "Masculinos");
  const womenProduct = pickSlideProduct(["aira", "yara-tous", "fakhar-rose"], (product) => product.category === "Femininos");
  const unisexProduct = pickSlideProduct(["vulcan-feu", "firestorm", "atlantis-extrait"], (product) => product.category === "Unissexo");
  const slides = [
    {
      eyebrow: lang === "pt" ? "Oportunidades especiais" : "Special offers",
      title: lang === "pt" ? "Promoções" : "Promotions",
      description: lang === "pt" ? "Preços especiais por tempo limitado." : "Special prices for a limited time.",
      action: lang === "pt" ? "Ver promoções" : "View promotions",
      kind: "sale" as ListingKind,
      product: saleProduct,
    },
    {
      eyebrow: lang === "pt" ? "Os mais desejados" : "Most wanted",
      title: "Best sellers",
      description: lang === "pt" ? "Os aromas que todos querem conhecer." : "The scents everyone wants to discover.",
      action: lang === "pt" ? "Ver best sellers" : "View best sellers",
      kind: "best" as ListingKind,
      product: bestProduct,
    },
    {
      eyebrow: lang === "pt" ? "Perfumes masculinos" : "Men's fragrances",
      title: lang === "pt" ? "Masculino" : "For him",
      description: lang === "pt" ? "Intenso, elegante e marcante." : "Intense, elegant and distinctive.",
      action: lang === "pt" ? "Ver perfumes" : "View fragrances",
      kind: "men" as ListingKind,
      product: menProduct,
    },
    {
      eyebrow: lang === "pt" ? "Perfumes femininos" : "Women's fragrances",
      title: lang === "pt" ? "Feminino" : "For her",
      description: lang === "pt" ? "Envolvente, luminoso e inesquecível." : "Captivating, luminous and unforgettable.",
      action: lang === "pt" ? "Ver perfumes" : "View fragrances",
      kind: "women" as ListingKind,
      product: womenProduct,
    },
    {
      eyebrow: lang === "pt" ? "Sem rótulos" : "Beyond labels",
      title: lang === "pt" ? "Unissexo" : "Unisex",
      description: lang === "pt" ? "Fragrâncias feitas para partilhar." : "Fragrances made to be shared.",
      action: lang === "pt" ? "Descobrir seleção" : "Discover selection",
      kind: "unisex" as ListingKind,
      product: unisexProduct,
    },
  ];

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5200);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  function move(direction: number) {
    setActive((current) => (current + direction + slides.length) % slides.length);
  }

  return (
    <section
      className="discovery-carousel"
      aria-roledescription="carousel"
      aria-label={lang === "pt" ? "Descobrir perfumes por coleção" : "Discover fragrances by collection"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="discovery-carousel-heading">
        <span aria-hidden="true" />
        <p>{lang === "pt" ? "Explora por estilo e encontra o aroma certo para cada momento." : "Explore by style and find the right scent for every moment."}</p>
      </div>

      <div className="discovery-carousel-stage">
        {slides.map((slide, index) => {
          let offset = (index - active + slides.length) % slides.length;
          if (offset > Math.floor(slides.length / 2)) offset -= slides.length;
          const position = offset === 0 ? "is-active" : `${offset < 0 ? "is-left" : "is-right"}-${Math.abs(offset)}`;
          return (
            <article className={`discovery-slide ${position}`} key={slide.title} aria-hidden={offset !== 0}>
              <button
                className="discovery-slide-button"
                onClick={() => offset === 0 ? onListing(slide.kind) : setActive(index)}
                tabIndex={offset === 0 ? 0 : -1}
                aria-label={`${slide.title}: ${slide.action}`}
              >
                <ProductVisual product={slide.product} />
                <span className="discovery-slide-shine" aria-hidden="true" />
                <span className="discovery-slide-copy">
                  <small>{slide.eyebrow}</small>
                  <strong>{slide.title}</strong>
                  <span>{slide.description}</span>
                  <i>{slide.action}<ChevronRight size={16} /></i>
                </span>
              </button>
            </article>
          );
        })}

        <button className="discovery-arrow discovery-arrow-left" onClick={() => move(-1)} aria-label={lang === "pt" ? "Anterior" : "Previous"}><ChevronLeft size={23} /></button>
        <button className="discovery-arrow discovery-arrow-right" onClick={() => move(1)} aria-label={lang === "pt" ? "Seguinte" : "Next"}><ChevronRight size={23} /></button>
      </div>

      <div className="discovery-dots" aria-label={lang === "pt" ? "Escolher slide" : "Choose slide"}>
        {slides.map((slide, index) => (
          <button key={slide.title} className={index === active ? "active" : ""} onClick={() => setActive(index)} aria-label={`${index + 1}: ${slide.title}`} aria-current={index === active ? "true" : undefined} />
        ))}
      </div>
    </section>
  );
}

function NewArrivals({
  products,
  t,
  lang,
  onListing,
  onProduct,
  onFavorite,
  favoriteFolders,
}: {
  products: Product[];
  t: (typeof COPY)[Lang];
  lang: Lang;
  onListing: (kind: ListingKind) => void;
  onProduct: (id: string) => void;
  onFavorite: (product: Product) => void;
  favoriteFolders: FavoriteFolder[];
}) {
  const arrivals = products.filter((product) => !product.isDecant && isNewProduct(product)).slice(0, 12);
  const [activeArrival, setActiveArrival] = useState(0);
  const safeActive = arrivals.length ? activeArrival % arrivals.length : 0;
  const activeProduct = arrivals[safeActive];
  const previousProduct = arrivals[(safeActive - 1 + arrivals.length) % arrivals.length];
  const nextProduct = arrivals[(safeActive + 1) % arrivals.length];

  function slide(direction: number) {
    if (!arrivals.length) return;
    setActiveArrival((current) => (current + direction + arrivals.length) % arrivals.length);
  }

  if (!activeProduct) return null;

  const activePrice = productPrice(activeProduct);
  const activeIsFavorite = favoriteFolders.some((folder) => folder.productIds.includes(activeProduct.id));

  return (
    <section className="new-arrivals-carousel">
      <div className="new-arrivals-heading">
        <div>
          <span>{lang === "pt" ? "Acabaram de chegar" : "Just arrived"}</span>
          <h2>{t.newTitle}</h2>
        </div>
        <p>{lang === "pt" ? "Novas essências, novas histórias para descobrir." : "New scents, new stories to discover."}</p>
        <button onClick={() => onListing("new")}>{lang === "pt" ? "Ver todas" : "View all"}<ChevronRight size={15} /></button>
      </div>

      <div className="new-arrivals-window">
        <button className="new-arrival-preview new-arrival-preview-left" onClick={() => slide(-1)} aria-label={lang === "pt" ? `Ver ${previousProduct.name.pt}` : `View ${previousProduct.name.en}`}>
          <div className="new-arrival-preview-art" style={{ "--pack": previousProduct.color, "--pack-accent": previousProduct.accent } as React.CSSProperties}>
            <ProductVisual product={previousProduct} compact />
          </div>
          <span>{previousProduct.brand}</span>
          <strong>{previousProduct.name[lang]}</strong>
        </button>

        <article key={activeProduct.id} className="new-arrival-feature" style={{ "--pack": activeProduct.color, "--pack-accent": activeProduct.accent } as React.CSSProperties}>
          <button className="new-arrival-feature-art" onClick={() => onProduct(activeProduct.id)} aria-label={activeProduct.name[lang]}>
            <span className="new-arrival-brand-mark">{activeProduct.brand}</span>
            <ProductVisual product={activeProduct} />
          </button>

          <div className="new-arrival-feature-copy">
            <span className="new-arrival-kicker">{lang === "pt" ? "Nova chegada" : "New arrival"}</span>
            <h3>{activeProduct.name[lang]}</h3>
            <p>{activeProduct.brand} · {activeProduct.volume}</p>
            <div className="new-arrival-rating"><span>☆☆☆☆☆</span><small>{lang === "pt" ? "Ainda sem avaliações" : "No reviews yet"}</small></div>
            <strong>{lang === "pt" ? "A partir de " : "From "}{price(activePrice, lang)}</strong>
            <div className="new-arrival-actions">
              <button onClick={() => onProduct(activeProduct.id)}>{lang === "pt" ? "Descobrir perfume" : "Discover fragrance"}<ChevronRight size={16} /></button>
              <button className={activeIsFavorite ? "saved" : ""} onClick={() => onFavorite(activeProduct)} aria-label={lang === "pt" ? "Adicionar aos favoritos" : "Add to favourites"}><Heart size={19} fill={activeIsFavorite ? "currentColor" : "none"} /></button>
            </div>
          </div>
        </article>

        <button className="new-arrival-preview new-arrival-preview-right" onClick={() => slide(1)} aria-label={lang === "pt" ? `Ver ${nextProduct.name.pt}` : `View ${nextProduct.name.en}`}>
          <div className="new-arrival-preview-art" style={{ "--pack": nextProduct.color, "--pack-accent": nextProduct.accent } as React.CSSProperties}>
            <ProductVisual product={nextProduct} compact />
          </div>
          <span>{nextProduct.brand}</span>
          <strong>{nextProduct.name[lang]}</strong>
        </button>

        <button className="new-arrival-arrow new-arrival-arrow-left" onClick={() => slide(-1)} aria-label={lang === "pt" ? "Novidade anterior" : "Previous new arrival"}><ChevronLeft size={23} /></button>
        <button className="new-arrival-arrow new-arrival-arrow-right" onClick={() => slide(1)} aria-label={lang === "pt" ? "Novidade seguinte" : "Next new arrival"}><ChevronRight size={23} /></button>
      </div>

      <div className="new-arrival-pagination">
        <span>{String(safeActive + 1).padStart(2, "0")}</span>
        <div>
          {arrivals.map((product, index) => (
            <button key={product.id} className={index === safeActive ? "active" : ""} onClick={() => setActiveArrival(index)} aria-label={`${index + 1}: ${product.name[lang]}`} />
          ))}
        </div>
        <span>{String(arrivals.length).padStart(2, "0")}</span>
      </div>
    </section>
  );
}

function ShowcaseProductCard({
  product,
  label,
  lang,
  decantPrice,
  onProduct,
  onFavorite,
  favoriteFolders,
}: {
  product: Product;
  label: string;
  lang: Lang;
  decantPrice?: number;
  onProduct: (id: string) => void;
  onFavorite: (product: Product) => void;
  favoriteFolders: FavoriteFolder[];
}) {
  const { endsAt, now } = usePromotionClock(product);
  const discount = productDiscount(product, now);
  const currentPrice = productPrice(product);
  const isFavorite = favoriteFolders.some((folder) => folder.productIds.includes(product.id));
  const variantPrices = product.variants.map((variant) => variant.isDecant ? variant.price : (discount ? variant.price * (1 - discount / 100) : variant.price));
  const lowestPrice = decantPrice ?? Math.min(...variantPrices);
  const highestPrice = Math.max(...variantPrices, currentPrice);
  const priceLabel = lowestPrice < highestPrice
    ? `${price(lowestPrice, lang)}–${price(highestPrice, lang)}`
    : price(currentPrice, lang);

  return (
    <article className="home-new-card catalog-showcase-card" style={{ "--pack": product.color, "--pack-accent": product.accent } as React.CSSProperties}>
      <div className="home-new-media-wrap">
        <button className="home-new-media" onClick={() => onProduct(product.id)} aria-label={product.name[lang]}>
          {product.tag === "soldout" && <span className="showcase-status-badge">{lang === "pt" ? "Esgotado" : "Sold out"}</span>}
          {discount > 0 && (
            <div className="showcase-discount-stack">
              <span>-{discount}%</span>
              {endsAt && <small>{formatCountdown(endsAt, now, lang)}</small>}
            </div>
          )}
          <ProductVisual product={product} />
        </button>
        <button className={`home-new-favorite ${isFavorite ? "saved" : ""}`} onClick={() => onFavorite(product)} aria-label={lang === "pt" ? `Guardar ${product.name.pt} nos favoritos` : `Save ${product.name.en} to favourites`}>
          <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="home-new-copy">
        <span>{label}:</span>
        <button onClick={() => onProduct(product.id)}>{product.name[lang]}</button>
        <small className="home-new-brand">{product.brand}</small>
        <div className="home-new-rating" aria-label={lang === "pt" ? "Ainda sem avaliações" : "No reviews yet"}><i>☆☆☆☆☆</i><small>(0)</small></div>
        <strong className={discount > 0 ? "discounted" : ""}>
          {discount > 0 && <del>{price(product.price, lang)}</del>}
          <span>{priceLabel}</span>
        </strong>
      </div>
    </article>
  );
}

function ScentProfiles({ lang, onProfile }: { lang: Lang; onProfile: (profile: ScentProfile) => void }) {
  const profiles = lang === "pt" ? [
    { id: "fresh" as const, icon: Citrus, label: "Frescos e cítricos" },
    { id: "fruity" as const, icon: Apple, label: "Frutados" },
    { id: "floral" as const, icon: Flower2, label: "Florais" },
    { id: "sweet" as const, icon: Cookie, label: "Doces e Gourmand" },
    { id: "woody" as const, icon: Trees, label: "Amadeirados e especiados" },
  ] : [
    { id: "fresh" as const, icon: Citrus, label: "Fresh and citrus" },
    { id: "fruity" as const, icon: Apple, label: "Fruity" },
    { id: "floral" as const, icon: Flower2, label: "Floral" },
    { id: "sweet" as const, icon: Cookie, label: "Sweet" },
    { id: "woody" as const, icon: Trees, label: "Woody and spicy" },
  ];

  return (
    <section className="scent-profile-section">
      <h2>{lang === "pt" ? "Descobre por perfil olfativo" : "Discover by scent profile"}</h2>
      <div className="scent-profile-band">
        <div className="scent-profile-grid">
          {profiles.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => onProfile(id)}>
              <Icon size={30} strokeWidth={1.55} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatsAppConsultationBanner() {
  return (
    <section className="whatsapp-consultation-banner" aria-label="Aconselhamento personalizado Mystic Essence">
      <a
        href="https://wa.me/351938258798?text=Ol%C3%A1%21%20Preciso%20de%20ajuda."
        target="_blank"
        rel="noreferrer"
        aria-label="Falar com a Mystic Essence pelo WhatsApp"
      >
        <Image
          src="/whatsapp-consultation-banner.png"
          width={1536}
          height={1024}
          sizes="(max-width: 620px) 100vw, 94vw"
          alt="Vamos encontrar a tua melhor essência com aconselhamento personalizado pelo WhatsApp"
        />
      </a>
    </section>
  );
}

function BrandBand({ onBrand }: { onBrand: (brand: string) => void }) {
  const { brands } = useBrands();
  return (
    <section className="brand-band" aria-label="Featured brands">
      {brands.map((brand) => <button type="button" key={brandKey(brand)} onClick={() => onBrand(brand)}>{brand}</button>)}
    </section>
  );
}

function ListingPage({
  t,
  lang,
  kind,
  profile,
  brand,
  products,
  onProduct,
  onFavorite,
  favoriteFolders,
}: {
  t: (typeof COPY)[Lang];
  lang: Lang;
  kind: ListingKind;
  profile: ScentProfile | null;
  brand: string | null;
  products: Product[];
  onProduct: (id: string) => void;
  onFavorite: (product: Product) => void;
  favoriteFolders: FavoriteFolder[];
}) {
  const categoryTitles: Partial<Record<ListingKind, Record<Lang, string>>> = {
    men: { pt: "Perfumes masculinos", en: "Men's fragrances" },
    women: { pt: "Perfumes femininos", en: "Women's fragrances" },
    unisex: { pt: "Perfumes unissexo", en: "Unisex fragrances" },
    other: { pt: "Outros produtos", en: "Other products" },
  };
  const title = brand
    ?? (profile
    ? SCENT_PROFILE_LABELS[lang][profile]
    : categoryTitles[kind]?.[lang]
      ?? (kind === "new" ? t.newTitle : kind === "best" ? t.bestTitle : kind === "sale" ? t.saleTitle : kind === "decants" ? t.decantsTitle : t.allTitle));
  const [openFilter, setOpenFilter] = useState<keyof ListingFilters | null>(null);
  const [draftFilters, setDraftFilters] = useState<ListingFilters>(EMPTY_LISTING_FILTERS);
  const [activeFilters, setActiveFilters] = useState<ListingFilters>(EMPTY_LISTING_FILTERS);
  const [sortBy, setSortBy] = useState<"newest" | "price-asc" | "price-desc">("newest");
  const availableBrands = useMemo(
    () => Array.from(new Set(products.map((product) => product.brand))).sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const filteredProducts = useMemo(() => products.filter((product) => {
    const currentPrice = productPrice(product);
    const matchesAvailability = activeFilters.availability === "all"
      || (activeFilters.availability === "stock" ? product.tag !== "soldout" : product.tag === "soldout");
    const matchesPrice = activeFilters.priceRange === "all"
      || (activeFilters.priceRange === "under30" && currentPrice < 30)
      || (activeFilters.priceRange === "30to50" && currentPrice >= 30 && currentPrice <= 50)
      || (activeFilters.priceRange === "over50" && currentPrice > 50);
    const matchesBrand = activeFilters.brands.length === 0 || activeFilters.brands.includes(product.brand);
    const matchesProfile = activeFilters.profiles.length === 0 || activeFilters.profiles.includes(product.scentProfile);
    return matchesAvailability && matchesPrice && matchesBrand && matchesProfile;
  }), [products, activeFilters]);
  const orderedProducts = useMemo(() => [...filteredProducts].sort((a, b) => {
    if (sortBy === "price-asc") return productPrice(a) - productPrice(b);
    if (sortBy === "price-desc") return productPrice(b) - productPrice(a);
    return Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
  }), [filteredProducts, sortBy]);
  const activeFilterCount = (activeFilters.availability !== "all" ? 1 : 0)
    + (activeFilters.priceRange !== "all" ? 1 : 0)
    + activeFilters.brands.length
    + activeFilters.profiles.length;

  useEffect(() => {
    setOpenFilter(null);
    setDraftFilters(EMPTY_LISTING_FILTERS);
    setActiveFilters(EMPTY_LISTING_FILTERS);
    setSortBy("newest");
  }, [kind, profile, brand]);

  const toggleListFilter = <K extends "brands" | "profiles">(key: K, value: ListingFilters[K][number]) => {
    setDraftFilters((current) => ({
      ...current,
      [key]: current[key].includes(value as never)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  };

  const filterHeaders: { key: keyof ListingFilters; label: string }[] = [
    { key: "availability", label: t.filters[0] },
    { key: "priceRange", label: t.filters[1] },
    { key: "brands", label: t.filters[2] },
    { key: "profiles", label: t.filters[3] },
  ];
  return (
    <section className="listing-page">
      {kind === "decants" && <DecantPromo lang={lang} />}
      <div className="listing-hero">
        <p>{lang === "pt" ? "Início" : "Home"} / {title}</p>
        <span className="eyebrow">{brand ? (lang === "pt" ? "Marca" : "Brand") : profile ? (lang === "pt" ? "Perfil olfativo" : "Scent profile") : (lang === "pt" ? "Perfumaria Árabe" : "Arabian Perfumery")}</span>
        <h1>{title}</h1>
        {kind === "other" && <p>{lang === "pt" ? "Cremes, coffrets, body mists e ambientadores." : "Creams, gift sets, body mists and home fragrances."}</p>}
        <small>{filteredProducts.length} {t.products}</small>
      </div>
      <div className="listing-toolbar">
        <span>{activeFilterCount > 0 ? `${activeFilterCount} ${lang === "pt" ? "filtros ativos" : "active filters"}` : ""}</span>
        <label>{t.sort}<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
          <option value="newest">{t.sortValue}</option>
          <option value="price-asc">{lang === "pt" ? "Preço: mais baixo" : "Price: low to high"}</option>
          <option value="price-desc">{lang === "pt" ? "Preço: mais alto" : "Price: high to low"}</option>
        </select></label>
      </div>
      <div className="catalog-layout">
        <aside className="filters">
          {filterHeaders.map(({ key, label }) => (
            <div className={`filter-group ${openFilter === key ? "open" : ""}`} key={key}>
              <button
                type="button"
                className="filter-group-trigger"
                aria-expanded={openFilter === key}
                onClick={() => setOpenFilter((current) => current === key ? null : key)}
              >
                {label}<ChevronDown size={16} />
              </button>
              {openFilter === key && (
                <div className="filter-options">
                  {key === "availability" && [
                    ["all", lang === "pt" ? "Todos" : "All"],
                    ["stock", lang === "pt" ? "Em stock" : "In stock"],
                    ["soldout", lang === "pt" ? "Esgotados" : "Sold out"],
                  ].map(([value, optionLabel]) => (
                    <label key={value}><input type="radio" name="availability" checked={draftFilters.availability === value} onChange={() => setDraftFilters((current) => ({ ...current, availability: value as ListingFilters["availability"] }))} />{optionLabel}</label>
                  ))}
                  {key === "priceRange" && [
                    ["all", lang === "pt" ? "Todos os preços" : "All prices"],
                    ["under30", lang === "pt" ? "Até 30 €" : "Under €30"],
                    ["30to50", "30 € - 50 €"],
                    ["over50", lang === "pt" ? "Mais de 50 €" : "Over €50"],
                  ].map(([value, optionLabel]) => (
                    <label key={value}><input type="radio" name="priceRange" checked={draftFilters.priceRange === value} onChange={() => setDraftFilters((current) => ({ ...current, priceRange: value as ListingFilters["priceRange"] }))} />{optionLabel}</label>
                  ))}
                  {key === "brands" && availableBrands.map((brand) => (
                    <label key={brand}><input type="checkbox" checked={draftFilters.brands.includes(brand)} onChange={() => toggleListFilter("brands", brand)} />{brand}</label>
                  ))}
                  {key === "profiles" && SCENT_PROFILES.map((scentProfile) => (
                    <label key={scentProfile}><input type="checkbox" checked={draftFilters.profiles.includes(scentProfile)} onChange={() => toggleListFilter("profiles", scentProfile)} />{SCENT_PROFILE_LABELS[lang][scentProfile]}</label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <button type="button" className="filter-submit" onClick={() => setActiveFilters(draftFilters)}>{t.results}</button>
          <button type="button" className="filter-clear" onClick={() => { setDraftFilters(EMPTY_LISTING_FILTERS); setActiveFilters(EMPTY_LISTING_FILTERS); }}>
            {lang === "pt" ? "Limpar filtros" : "Clear filters"}
          </button>
        </aside>
        <div className="home-new-grid listing-grid listing-showcase-grid">
          {orderedProducts.length > 0 ? orderedProducts.map((product) => (
            <ShowcaseProductCard
              key={product.id}
              product={product}
              label={product.isDecant ? "Decant" : title}
              lang={lang}
              onProduct={onProduct}
              onFavorite={onFavorite}
              favoriteFolders={favoriteFolders}
            />
          )) : <div className="listing-empty"><Search size={28} /><strong>{lang === "pt" ? "Nenhum produto encontrado" : "No products found"}</strong><p>{lang === "pt" ? "Experimente alterar ou limpar os filtros." : "Try changing or clearing the filters."}</p></div>}
        </div>
      </div>
    </section>
  );
}

function DecantPromo({ lang }: { lang: Lang }) {
  return (
    <section className="decant-promo decant-promo-image-only" aria-label={lang === "pt" ? "Decants Mystic Essence de 2ml, 5ml e 10ml" : "Mystic Essence 2ml, 5ml and 10ml decants"}>
      <Image src="/decants-2-5-10.png" width={1536} height={1024} sizes="100vw" alt={lang === "pt" ? "Informação sobre decants Mystic Essence de 2ml, 5ml e 10ml" : "Mystic Essence 2ml, 5ml and 10ml decant information"} />
    </section>
  );
}

function ProductCard({
  product,
  lang,
  t,
  onProduct,
  onCart,
  onFavorite,
  favoriteFolders,
  showPromotionCountdown = false,
}: {
  product: Product;
  lang: Lang;
  t: (typeof COPY)[Lang];
  onProduct: (id: string) => void;
  onCart: (product: Product) => void;
  onFavorite: (product: Product) => void;
  favoriteFolders: FavoriteFolder[];
  showPromotionCountdown?: boolean;
}) {
  const { endsAt, now } = usePromotionClock(product);
  const discount = productDiscount(product, now);
  const isFavorite = favoriteFolders.some((folder) => folder.productIds.includes(product.id));
  const primaryVariant = product.variants.find((variant) => variant.volume === product.volume) ?? product.variants[0];
  const productUnavailable = Boolean(primaryVariant?.soldout) || primaryVariant?.stock === 0 || (!primaryVariant?.isDecant && product.tag === "soldout");
  return (
    <article className="product-card">
      <div className="product-media-wrap">
        <button className="product-media" onClick={() => onProduct(product.id)}>
          {productUnavailable && <span className="status-badge">{t.soldout}</span>}
          {isNewProduct(product) && <span className="status-badge">{t.newTitle}</span>}
          {discount > 0 && (
            <div className={`promotion-badge-stack ${isNewProduct(product) || product.tag === "soldout" ? "below-status" : ""}`}>
              <span className="discount-badge">-{discount}%</span>
              {showPromotionCountdown && endsAt && <span className="promotion-countdown">{formatCountdown(endsAt, now, lang)}</span>}
            </div>
          )}
          <ProductVisual product={product} />
        </button>
        <button className={`favorite-button ${isFavorite ? "saved" : ""}`} onClick={() => onFavorite(product)} aria-label={lang === "pt" ? `Guardar ${product.name.pt} nos favoritos` : `Save ${product.name.en} to favourites`}>
          <Heart size={19} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="product-card-body">
        <span>{product.brand}</span>
        <button onClick={() => onProduct(product.id)}>{product.name[lang]}</button>
        <strong className={discount ? "sale-price" : ""}>
          {discount > 0 && <del>{price(product.price, lang)}</del>}
          {t.from} {price(productPrice(product), lang)}
        </strong>
        <div className="card-actions">
          <button onClick={() => onProduct(product.id)}>{t.details}</button>
          <button disabled={productUnavailable} onClick={() => onCart(product)}>{t.add}</button>
        </div>
      </div>
    </article>
  );
}

function ProductDetail({
  t,
  lang,
  product,
  products,
  onListing,
  onProduct,
  onCart,
  onFavorite,
  favoriteFolders,
  session,
  orders,
  onLogin,
}: {
  t: (typeof COPY)[Lang];
  lang: Lang;
  product: Product;
  products: Product[];
  onListing: (kind: ListingKind) => void;
  onProduct: (id: string) => void;
  onCart: (product: Product, quantity?: number) => void;
  onFavorite: (product: Product) => void;
  favoriteFolders: FavoriteFolder[];
  session: Session | null;
  orders: Order[];
  onLogin: () => void;
}) {
  const [qty, setQty] = useState(1);
  const { settings: shippingSettings } = useShippingSettings();
  const [selectedVolume, setSelectedVolume] = useState(product.volume);
  const related = products.filter((item) => item.id !== product.id && item.brand !== product.brand).slice(0, 4);
  const { endsAt, now } = usePromotionClock(product);
  const discount = productDiscount(product, now);
  const selectedVariant = product.variants.find((variant) => variant.volume === selectedVolume) ?? product.variants[0];
  const selectedDiscount = selectedVariant.isDecant ? 0 : discount;
  const selectedPrice = selectedDiscount ? selectedVariant.price * (1 - selectedDiscount / 100) : selectedVariant.price;
  const selectedStock = typeof selectedVariant.stock === "number" ? Math.max(0, selectedVariant.stock) : null;
  const selectedSoldOut = selectedStock === 0 || Boolean(selectedVariant.soldout) || (!selectedVariant.isDecant && product.tag === "soldout");
  const maximumQuantity = selectedStock === null ? MAX_ORDER_QUANTITY : Math.max(1, Math.min(MAX_ORDER_QUANTITY, selectedStock));
  const isFavorite = favoriteFolders.some((folder) => folder.productIds.includes(product.id));
  const isDecant = selectedVariant.isDecant;
  const [restockEmail, setRestockEmail] = useState(session?.email ?? "");
  const [restockBusy, setRestockBusy] = useState(false);
  const [restockMessage, setRestockMessage] = useState("");
  const [restockError, setRestockError] = useState("");

  useEffect(() => {
    setSelectedVolume(product.volume);
    setQty(1);
  }, [product.id, product.volume]);

  useEffect(() => {
    setQty((value) => Math.min(value, maximumQuantity));
    setRestockMessage("");
    setRestockError("");
  }, [selectedVolume, maximumQuantity]);

  useEffect(() => {
    if (session?.email) setRestockEmail(session.email);
  }, [session?.email]);

  function addSelectedVariant() {
    if (selectedSoldOut) return;
    const variantId = selectedVariant.volume.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    onCart({
      ...product,
      id: `${product.id}--${variantId}`,
      price: selectedPrice,
      volume: selectedVariant.volume,
      variants: [selectedVariant],
      isDecant: selectedVariant.isDecant,
      discount: undefined,
      promotionEndsAt: undefined,
    }, qty);
  }

  async function requestRestockNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestockMessage("");
    setRestockError("");
    if (!restockEmail.trim()) return;
    setRestockBusy(true);
    try {
      await subscribeToRestock({ productId: canonicalProductId(product.id), volume: selectedVariant.volume, email: restockEmail.trim(), lang });
      setRestockMessage(lang === "pt" ? "Avisamos por email assim que este tamanho voltar." : "We will email you as soon as this size returns.");
    } catch (error) {
      setRestockError(error instanceof Error ? error.message : (lang === "pt" ? "Não foi possível criar o aviso." : "The alert could not be created."));
    } finally {
      setRestockBusy(false);
    }
  }

  return (
    <section className="product-page">
      <div className="product-detail">
        <div className="detail-gallery">
          <ProductGallery key={product.id} product={product} lang={lang} />
          <div className="detail-gallery-caption">
            <span>{product.brand}</span>
            <strong>{isDecant ? "Decant Mystic Essence" : "Fragrância original"}</strong>
          </div>
        </div>

        <div className="detail-info">
          <div className="detail-title-block">
            <span className="eyebrow">{product.brand}</span>
            <h1>{product.name[lang]}</h1>
            <div className="detail-meta-strip">
              <span><BadgeCheck size={15} /> Original</span>
              <span><ShoppingBag size={15} /> {selectedVolume}</span>
            </div>
          </div>

          <div className="detail-purchase-card">
            <div className="detail-price-line">
              <div>
                <span>{lang === "pt" ? "Preço" : "Price"}</span>
                <strong className="detail-price">{selectedDiscount > 0 && <del>{price(selectedVariant.price, lang)}</del>}{price(selectedPrice, lang)}</strong>
              </div>
              <p className={selectedSoldOut ? "stock sold" : "stock"}><span />{selectedSoldOut ? t.soldout : selectedStock === null ? t.stock : `${selectedStock} ${lang === "pt" ? "em stock" : "in stock"}`}</p>
            </div>

            {selectedDiscount > 0 && endsAt && (
              <div className="detail-promotion-timer">
                <Tag size={17} />
                <span>{lang === "pt" ? "A promoção termina em" : "Promotion ends in"}</span>
                <strong>{formatFullCountdown(endsAt, now)}</strong>
              </div>
            )}

            <p className="tax-copy">IVA incluído. Portes calculados no checkout.</p>

            <fieldset className="variant-picker">
              <legend>{t.pick}</legend>
              <div className="variant-options">
                {product.variants.map((variant) => {
                  const unavailable = variant.stock === 0 || Boolean(variant.soldout) || (!variant.isDecant && product.tag === "soldout");
                  const variantDiscount = variant.isDecant ? 0 : discount;
                  const variantPrice = variantDiscount ? variant.price * (1 - variantDiscount / 100) : variant.price;
                  const active = variant.volume === selectedVolume;
                  const volumeLabel = variant.volume.replace(/(\d)\s*ml/i, "$1 ml");
                  return (
                    <button
                      type="button"
                      key={`${variant.volume}-${variant.price}`}
                      className={`${active ? "active" : ""} ${unavailable ? "unavailable" : ""}`.trim()}
                      onClick={() => setSelectedVolume(variant.volume)}
                      disabled={unavailable}
                      aria-pressed={active}
                    >
                      <span>{volumeLabel}</span>
                      <small>{variant.isDecant ? "Decant" : lang === "pt" ? "Frasco completo" : "Full bottle"}</small>
                      <strong>{unavailable ? t.soldout : price(variantPrice, lang)}</strong>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {selectedSoldOut && (
              <form className="restock-alert" onSubmit={requestRestockNotification}>
                <div><Mail size={19} /><span><strong>{lang === "pt" ? "Avise-me quando voltar" : "Notify me when it returns"}</strong><small>{lang === "pt" ? `Receba um email quando ${selectedVolume} estiver disponível.` : `Receive an email when ${selectedVolume} is available.`}</small></span></div>
                <label><span className="sr-only">Email</span><input type="email" value={restockEmail} onChange={(event) => setRestockEmail(event.target.value)} placeholder="email@exemplo.pt" required /></label>
                <button type="submit" disabled={restockBusy}>{restockBusy ? (lang === "pt" ? "A guardar..." : "Saving...") : (lang === "pt" ? "Criar aviso" : "Create alert")}</button>
                {restockMessage && <p className="restock-success" role="status"><Check size={14} />{restockMessage}</p>}
                {restockError && <p className="restock-error" role="alert">{restockError}</p>}
              </form>
            )}

            <div className="buy-row">
              <div className="qty-control" aria-label={t.qty}>
                <button onClick={() => setQty((value) => Math.max(1, value - 1))}><Minus size={16} /></button>
                <span>{qty}</span>
                <button disabled={selectedSoldOut || qty >= maximumQuantity} onClick={() => setQty((value) => Math.min(maximumQuantity, value + 1))}><Plus size={16} /></button>
              </div>
              <button className="add-to-cart-signature" disabled={selectedSoldOut} onClick={addSelectedVariant}>
                <span>{t.add}</span>
                <ShoppingBag size={20} />
              </button>
              <button className={`detail-favorite ${isFavorite ? "saved" : ""}`} onClick={() => onFavorite(product)} aria-label={lang === "pt" ? "Guardar nos favoritos" : "Save to favourites"}><Heart size={20} fill={isFavorite ? "currentColor" : "none"} /></button>
            </div>
          </div>

          <div className="trust-panel">
            <p><ShieldCheck size={18} /><span><strong>100% autêntico</strong>Garantia Mystic Essence</span></p>
            <p><Truck size={18} /><span><strong>{lang === "pt" ? "Envio gratuito" : "Free shipping"}</strong>{lang === "pt" ? "A partir de" : "From"} {price(shippingSettings.continental.freeFrom, lang)} {lang === "pt" ? "em Portugal Continental" : "to mainland Portugal"}</span></p>
            <p><Headphones size={18} /><span><strong>Apoio especializado</strong>Estamos disponíveis para ajudar</span></p>
          </div>

          <div className="detail-service-note">
            <MessageCircle size={18} />
            <span>Precisas de ajuda a escolher? A Mystic Essence recomenda a fragrância certa para o teu estilo.</span>
          </div>
        </div>
      </div>

      {(product.desc?.[lang] || product.desc?.pt) && (
        <section className="detail-description" aria-labelledby="product-description-title">
          <h2 id="product-description-title">{lang === "pt" ? "Descrição do produto" : "Product description"}</h2>
          <p>{product.desc?.[lang] || product.desc?.pt}</p>
        </section>
      )}

      <ProductReviews product={product} lang={lang} session={session} orders={orders} onLogin={onLogin} />

      <section className="related-section">
        <div className="section-head split">
          <h2>{t.related}</h2>
          <button className="text-link" onClick={() => onListing("all")}>{t.allTitle}</button>
        </div>
        <div className="product-grid">
          {related.map((item) => (
            <ProductCard key={item.id} product={item} lang={lang} t={t} onProduct={onProduct} onCart={onCart} onFavorite={onFavorite} favoriteFolders={favoriteFolders} />
          ))}
        </div>
      </section>
    </section>
  );
}

function ProductReviews({
  product,
  lang,
  session,
  orders,
  onLogin,
}: {
  product: Product;
  lang: Lang;
  session: Session | null;
  orders: Order[];
  onLogin: () => void;
}) {
  const productId = canonicalProductId(product.id);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const canReview = session?.role === "customer" && orders.some((order) => (
    order.status === "delivered"
    && order.customerUid === session.uid
    && order.items.some((item) => canonicalProductId(item.productId ?? item.id) === productId)
  ));
  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;

  useEffect(() => {
    if (!firebaseEnabled) return;
    return watchReviews<ProductReview>(productId, setReviews);
  }, [productId]);

  async function publishReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewError("");
    setReviewMessage("");
    if (!session) {
      onLogin();
      return;
    }
    if (!canReview) {
      setReviewError(lang === "pt"
        ? "Só pode avaliar este perfume depois de a sua encomenda aparecer como entregue."
        : "You can only review this perfume after your order is marked as delivered.");
      return;
    }
    if (!rating) {
      setReviewError(lang === "pt" ? "Escolha o número de estrelas." : "Choose a star rating.");
      return;
    }
    if (comment.trim().length < 10) {
      setReviewError(lang === "pt" ? "Escreva um comentário com pelo menos 10 caracteres." : "Write a comment with at least 10 characters.");
      return;
    }
    setReviewBusy(true);
    try {
      await submitFirebaseReview({ productId, rating, comment: comment.trim() });
      setComment("");
      setRating(0);
      setReviewMessage(lang === "pt" ? "Avaliação publicada. Obrigado!" : "Review published. Thank you!");
    } catch (error) {
      const fallback = lang === "pt" ? "Não foi possível publicar a avaliação." : "The review could not be published.";
      setReviewError(error instanceof Error ? error.message.replace(/^FirebaseError:\s*/i, "") : fallback);
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <section className="reviews-section" aria-labelledby="reviews-title">
      <header className="reviews-heading">
        <div>
          <span className="eyebrow">{lang === "pt" ? "Opiniões verificadas" : "Verified opinions"}</span>
          <h2 id="reviews-title">{lang === "pt" ? "Avaliações de clientes" : "Customer reviews"}</h2>
          <p>{lang === "pt" ? "Só clientes que receberam este produto podem deixar uma avaliação." : "Only customers who received this product can leave a review."}</p>
        </div>
        <div className="reviews-summary" aria-label={lang === "pt" ? `Classificação média ${average.toFixed(1)} em 5` : `Average rating ${average.toFixed(1)} out of 5`}>
          <strong>{reviews.length ? average.toFixed(1).replace(".", ",") : "—"}</strong>
          <div><ReviewStars rating={Math.round(average)} /><span>{reviews.length} {lang === "pt" ? (reviews.length === 1 ? "avaliação" : "avaliações") : (reviews.length === 1 ? "review" : "reviews")}</span></div>
        </div>
      </header>

      <div className="reviews-layout">
        <div className="reviews-list">
          {reviews.length === 0 ? (
            <div className="reviews-empty"><MessageCircle size={25} /><strong>{lang === "pt" ? "Ainda não existem avaliações" : "There are no reviews yet"}</strong><p>{lang === "pt" ? "A primeira opinião verificada pode ser a sua." : "The first verified opinion could be yours."}</p></div>
          ) : reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <header>
                <div className="review-avatar" aria-hidden="true">{review.customerName.slice(0, 1).toUpperCase()}</div>
                <div><strong>{review.customerName}</strong><span><BadgeCheck size={14} />{lang === "pt" ? "Compra verificada" : "Verified purchase"}</span></div>
                <time dateTime={review.createdAt}>{new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(review.createdAt))}</time>
              </header>
              <ReviewStars rating={review.rating} />
              <p>{review.comment}</p>
            </article>
          ))}
        </div>

        <div className="review-compose">
          <span className="eyebrow">{lang === "pt" ? "Partilhe a experiência" : "Share your experience"}</span>
          <h3>{lang === "pt" ? "Avaliar este perfume" : "Review this perfume"}</h3>
          {!session ? (
            <div className="review-gate"><LockKeyhole size={20} /><p>{lang === "pt" ? "Inicie sessão para verificarmos se já recebeu este produto." : "Sign in so we can verify that you received this product."}</p><button type="button" onClick={onLogin}>{lang === "pt" ? "Entrar na conta" : "Sign in"}</button></div>
          ) : !canReview ? (
            <div className="review-gate"><Truck size={20} /><p>{lang === "pt" ? "A avaliação fica disponível quando uma encomenda com este produto estiver marcada como entregue." : "Reviewing becomes available when an order containing this product is marked as delivered."}</p></div>
          ) : (
            <form className="review-form" onSubmit={publishReview}>
              <fieldset>
                <legend>{lang === "pt" ? "A sua classificação" : "Your rating"}</legend>
                <div className="review-star-picker">
                  {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= rating ? "selected" : ""} onClick={() => setRating(value)} aria-label={`${value} ${lang === "pt" ? (value === 1 ? "estrela" : "estrelas") : (value === 1 ? "star" : "stars")}`} aria-pressed={value <= rating}><Star size={25} fill={value <= rating ? "currentColor" : "none"} /></button>)}
                </div>
              </fieldset>
              <label>{lang === "pt" ? "O seu comentário" : "Your comment"}<textarea value={comment} onChange={(event) => setComment(event.target.value)} minLength={10} maxLength={1000} rows={5} placeholder={lang === "pt" ? "Conte como foi a fragrância, a projeção e a duração..." : "Tell us about the fragrance, projection and longevity..."} /></label>
              <div className="review-form-footer"><small>{comment.length}/1000</small><button type="submit" disabled={reviewBusy}>{reviewBusy ? (lang === "pt" ? "A publicar..." : "Publishing...") : (lang === "pt" ? "Publicar avaliação" : "Publish review")}</button></div>
            </form>
          )}
          {reviewError && <p className="review-feedback error" role="alert">{reviewError}</p>}
          {reviewMessage && <p className="review-feedback success" role="status">{reviewMessage}</p>}
        </div>
      </div>
    </section>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  return <div className="review-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((value) => <Star key={value} size={17} fill={value <= rating ? "currentColor" : "none"} />)}</div>;
}

function ProductGallery({ product, lang }: { product: Product; lang: Lang }) {
  const images = getProductImages(product);
  const [selectedUrl, setSelectedUrl] = useState(images[0]?.imageUrl ?? "");
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const selectedIndex = Math.max(0, images.findIndex((image) => image.imageUrl === selectedUrl));
  const selected = images[selectedIndex];
  const hasMultiple = images.length > 1;
  const previousLabel = lang === "pt" ? "Imagem anterior" : "Previous image";
  const nextLabel = lang === "pt" ? "Imagem seguinte" : "Next image";
  const imageLabel = lang === "pt" ? "Imagem" : "Image";

  function moveImage(direction: number) {
    if (images.length) setSelectedUrl(images[(selectedIndex + direction + images.length) % images.length].imageUrl);
  }

  return (
    <div className="product-gallery" role="group" aria-label={lang === "pt" ? "Imagens do produto" : "Product images"} onKeyDown={(event) => {
      if (hasMultiple && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        moveImage(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}>
      <div className="detail-gallery-frame">
        {selected && !failedUrls.includes(selected.imageUrl) ? <div className="visual product-photo-visual hero-visual"><img
          key={selected.imageUrl}
          src={selected.imageUrl}
          alt={`${product.name[lang]} - ${imageLabel.toLowerCase()} ${selectedIndex + 1}`}
          decoding="async"
          onError={() => setFailedUrls((urls) => [...urls, selected.imageUrl])}
        /></div> : <ProductVisual product={{ ...product, ...productImageFields([]) }} hero />}
        {hasMultiple && <>
          <button type="button" className="gallery-arrow previous" onClick={() => moveImage(-1)} aria-label={previousLabel} title={previousLabel}><ChevronLeft size={20} /></button>
          <button type="button" className="gallery-arrow next" onClick={() => moveImage(1)} aria-label={nextLabel} title={nextLabel}><ChevronRight size={20} /></button>
          <span className="gallery-counter" aria-live="polite" aria-atomic="true">{selectedIndex + 1} / {images.length}</span>
        </>}
      </div>
      {hasMultiple && <div className="gallery-thumbnails">
        {images.map((image, index) => <button type="button" key={image.imageUrl} aria-label={`${imageLabel} ${index + 1} - ${product.name[lang]}`} aria-pressed={index === selectedIndex} onClick={() => setSelectedUrl(image.imageUrl)}>
          <img src={image.imageUrl} alt="" loading="lazy" decoding="async" />
        </button>)}
      </div>}
    </div>
  );
}

function ProductVisual({ product, hero = false, compact = false }: { product: Product; hero?: boolean; compact?: boolean }) {
  const imageUrl = getProductImages(product)[0]?.imageUrl;
  if (imageUrl) {
    return (
      <div className={`visual product-photo-visual ${hero ? "hero-visual" : ""} ${compact ? "compact" : ""}`}>
        <img
          src={imageUrl}
          alt={`${product.name.pt} — ${product.brand}`}
          loading={hero ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={hero ? "high" : "low"}
        />
      </div>
    );
  }
  return (
    <div className={`visual product-image-missing ${hero ? "hero-visual" : ""} ${compact ? "compact" : ""}`}>
      <img src="/mystic-essence-hero-logo.png" alt="" loading="lazy" decoding="async" />
      {!compact && <span>Imagem em breve</span>}
    </div>
  );
}

function AccountPage({
  favoritesOnly = false,
  authReady,
  favoritesReady,
  lang,
  session,
  products,
  orders,
  influencerUses,
  favoriteFolders,
  setFavoriteFolders,
  onProduct,
  onLogout,
  onShop,
}: {
  favoritesOnly?: boolean;
  authReady: boolean;
  favoritesReady: boolean;
  lang: Lang;
  session: Session | null;
  products: Product[];
  orders: Order[];
  influencerUses: InfluencerCouponUse[];
  favoriteFolders: FavoriteFolder[];
  setFavoriteFolders: Dispatch<SetStateAction<FavoriteFolder[]>>;
  onProduct: (id: string) => void;
  onLogout: () => Promise<void>;
  onShop: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [folderName, setFolderName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const copy = lang === "pt" ? {
    eyebrow: "Área de cliente",
    login: "Entrar",
    register: "Criar conta",
    titleLogin: "Bem-vindo de volta",
    titleRegister: "Junte-se à Mystic Essence",
    subtitleLogin: "Entre para acompanhar os seus favoritos e futuras encomendas.",
    subtitleRegister: "Crie o seu perfil para uma experiência de compra mais simples.",
    name: "Nome completo",
    email: "Email",
    password: "Palavra-passe",
    google: "Continuar com Google",
    divider: "ou use o seu email",
    profile: "A minha conta",
    hello: "Olá",
    orders: "Ainda não existem encomendas associadas a esta conta.",
    shop: "Continuar a comprar",
    logout: "Terminar sessão",
  } : {
    eyebrow: "Customer area",
    login: "Sign in",
    register: "Create account",
    titleLogin: "Welcome back",
    titleRegister: "Join Mystic Essence",
    subtitleLogin: "Sign in to follow your favourites and future orders.",
    subtitleRegister: "Create your profile for a simpler shopping experience.",
    name: "Full name",
    email: "Email",
    password: "Password",
    google: "Continue with Google",
    divider: "or use your email",
    profile: "My account",
    hello: "Hello",
    orders: "There are no orders associated with this account yet.",
    shop: "Continue shopping",
    logout: "Sign out",
  };

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || email.split("@")[0] || "Cliente").trim();
    setAuthBusy(true);
    setAuthError("");
    try {
      if (!firebaseEnabled) throw new Error(lang === "pt" ? "A ligação Firebase ainda não está configurada neste ambiente." : "Firebase is not configured in this environment yet.");
      if (mode === "login") await loginWithEmail(email, password);
      else await registerWithEmail(name, email, password);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : (lang === "pt" ? "Não foi possível entrar." : "Could not sign in."));
      setAuthBusy(false);
    }
  }

  async function googleAccount() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await loginWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : (lang === "pt" ? "Não foi possível entrar com Google." : "Could not sign in with Google."));
      setAuthBusy(false);
    }
  }

  if (!authReady) {
    return (
      <section className="account-auth-status" role="status" aria-live="polite">
        <span className="auth-spinner" aria-hidden="true" />
        <div>
          <span className="eyebrow">{lang === "pt" ? "Conta segura" : "Secure account"}</span>
          <h1>{lang === "pt" ? "A verificar a sessão" : "Checking your session"}</h1>
          <p>{lang === "pt" ? "Estamos a confirmar a sua conta e os respetivos acessos." : "We are confirming your account and its permissions."}</p>
        </div>
      </section>
    );
  }

  if (session) {
    const customerOrders = orders.filter((order) => order.customer.email.toLowerCase() === session.email.toLowerCase());
    const favoriteCount = new Set(favoriteFolders.flatMap((folder) => folder.productIds)).size;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentMonthUses = influencerUses.filter((use) => use.month === currentMonth);
    const monthCommission = currentMonthUses.reduce((sum, use) => sum + use.discountAmount, 0);
    const lifetimeCommission = influencerUses.reduce((sum, use) => sum + use.discountAmount, 0);
    const createFolder = () => {
      const name = folderName.trim();
      if (!name || !favoritesReady) return;
      setFavoriteFolders((folders) => [...folders, { id: `folder-${Date.now()}`, name, productIds: [] }]);
      setFolderName("");
    };
    const removeFolder = async (folder: FavoriteFolder) => {
      const confirmed = window.confirm(lang === "pt"
        ? `Eliminar a pasta “${folder.name}”? Os produtos guardados nela deixam de estar nos favoritos.`
        : `Delete the “${folder.name}” folder? Products saved in it will no longer be favourites.`);
      if (!confirmed) return;
      setFavoriteFolders((folders) => folders.filter((item) => item.id !== folder.id));
      await deleteFavoriteFolder(session.uid, folder.id);
    };
    return (
      <section className={`account-hub ${favoritesOnly ? "favorites-page" : ""} ${session.isInfluencer ? "influencer-account" : ""}`}>
        <header className="account-hub-header">
          <div className="account-profile-mark">{favoritesOnly ? <Heart size={28} /> : session.isInfluencer ? <TicketPercent size={28} /> : <User size={28} />}</div>
          <div>
            <span className="eyebrow">{session.isInfluencer && !favoritesOnly ? (lang === "pt" ? "Área de influencer" : "Influencer area") : copy.profile}</span>
            <h1>{favoritesOnly ? (lang === "pt" ? "Os meus favoritos" : "My favourites") : `${copy.hello}, ${session.name}`}</h1>
            <p>{session.email}</p>
          </div>
          <div className="account-actions">
            <button className="ghost-button" onClick={onShop}>{copy.shop}</button>
            <button className="icon-text-button" onClick={() => void onLogout()} disabled={authBusy}><LogOut size={16} />{copy.logout}</button>
          </div>
        </header>

        {!favoritesOnly && <div className={`account-overview ${session.isInfluencer ? "" : "customer-overview"}`}>
          {session.isInfluencer ? <>
            <article><TicketPercent size={20} /><span>{lang === "pt" ? "Usos este mês" : "Uses this month"}</span><strong>{currentMonthUses.length}</strong></article>
            <article><ReceiptText size={20} /><span>{lang === "pt" ? "Comissão do mês" : "Monthly commission"}</span><strong>{price(monthCommission, lang)}</strong></article>
            <article><History size={20} /><span>{lang === "pt" ? "Total acumulado" : "Lifetime total"}</span><strong>{price(lifetimeCommission, lang)}</strong></article>
          </> : <>
            <article><Heart size={20} /><span>{lang === "pt" ? "Favoritos" : "Favourites"}</span><strong>{favoriteCount}</strong></article>
            <article><ShoppingBag size={20} /><span>{lang === "pt" ? "Encomendas" : "Orders"}</span><strong>{customerOrders.length}</strong></article>
          </>}
        </div>}

        {session.isInfluencer && !favoritesOnly && (
          <section className="influencer-dashboard account-panel">
            <header><TicketPercent size={21} /><div><h2>{lang === "pt" ? "Desempenho do meu cupão" : "My coupon performance"}</h2><p>{lang === "pt" ? "Só aparecem compras cujo pagamento foi confirmado." : "Only purchases with confirmed payment are shown."}</p></div></header>
            <div className="influencer-coupon-banner">
              <span>{lang === "pt" ? "Cupão associado" : "Assigned coupon"}</span>
              <strong>{session.influencerCouponCode || (lang === "pt" ? "Por associar" : "Not assigned")}</strong>
            </div>
            {influencerUses.length === 0 ? (
              <div className="account-empty-state"><ReceiptText size={24} /><strong>{lang === "pt" ? "Ainda não existem utilizações pagas" : "No paid uses yet"}</strong><p>{lang === "pt" ? "Quando uma compra com o seu cupão for paga, ficará registada aqui." : "When a purchase using your coupon is paid, it will appear here."}</p></div>
            ) : (
              <div className="influencer-use-list">
                <div className="influencer-use-heading"><span>{lang === "pt" ? "Encomenda" : "Order"}</span><span>{lang === "pt" ? "Data" : "Date"}</span><span>{lang === "pt" ? "Cupão" : "Coupon"}</span><span>{lang === "pt" ? "Valor atribuído" : "Commission"}</span></div>
                {influencerUses.map((use) => <article key={use.id}><strong>{use.orderId}</strong><time dateTime={use.usedAt}>{new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(use.usedAt))}</time><span>{use.couponCode}</span><strong>{price(use.discountAmount, lang)}</strong></article>)}
              </div>
            )}
            <footer><span>{lang === "pt" ? "Total a acertar este mês" : "Total due this month"}</span><strong>{price(monthCommission, lang)}</strong></footer>
          </section>
        )}

        <div className="account-dashboard-grid">
          <section className="account-panel favorites-panel">
            <header><div><Heart size={20} /><div><h2>{favoritesOnly ? (lang === "pt" ? "As minhas pastas" : "My folders") : (lang === "pt" ? "Os meus favoritos" : "My favourites")}</h2><p>{lang === "pt" ? "Organize fragrâncias por marca, ocasião ou estilo." : "Organise fragrances by brand, occasion or style."}</p></div></div></header>
            <div className="create-folder-bar">
              <Folder size={18} />
              <input aria-label={lang === "pt" ? "Nome da nova pasta" : "New folder name"} disabled={!favoritesReady} value={folderName} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFolder(); }} placeholder={lang === "pt" ? "Nome da nova pasta (ex.: JPG)" : "New folder name (e.g. JPG)"} />
              <button disabled={!favoritesReady || !folderName.trim()} onClick={createFolder}><Plus size={16} />{lang === "pt" ? "Criar pasta" : "Create folder"}</button>
            </div>
            {!favoritesReady ? <p role="status">{lang === "pt" ? "A carregar as suas pastas..." : "Loading your folders..."}</p> : favoriteFolders.length === 0 ? (
              <div className="account-empty-state"><Heart size={24} /><strong>{lang === "pt" ? "Ainda não guardou nenhum perfume" : "You have not saved any perfumes yet"}</strong><p>{lang === "pt" ? "Crie uma pasta e use o coração nos produtos que gosta." : "Create a folder and use the heart on products you love."}</p></div>
            ) : (
              <div className="favorite-folder-list">
                {favoriteFolders.map((folder) => {
                  const folderProducts = folder.productIds.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => Boolean(product));
                  return (
                    <article className="favorite-folder" key={folder.id}>
                      <header>
                        <div><Folder size={17} /><strong>{folder.name}</strong></div>
                        <div className="favorite-folder-actions">
                          <span aria-label={lang === "pt" ? `${folderProducts.length} produtos` : `${folderProducts.length} products`}>{folderProducts.length}</span>
                          <button type="button" onClick={() => void removeFolder(folder)} aria-label={lang === "pt" ? `Eliminar pasta ${folder.name}` : `Delete folder ${folder.name}`} title={lang === "pt" ? "Eliminar pasta" : "Delete folder"}><Trash2 size={16} /></button>
                        </div>
                      </header>
                      {folderProducts.length === 0 ? <p>{lang === "pt" ? "Pasta vazia" : "Empty folder"}</p> : (
                        <div className="folder-products">
                          {folderProducts.map((product) => (
                            <div key={product.id}>
                              <button className="folder-product" onClick={() => onProduct(product.id)}><ProductVisual product={product} compact /><span><strong>{product.name[lang]}</strong><small>{product.brand}</small></span></button>
                              <button className="folder-remove" onClick={() => setFavoriteFolders((folders) => folders.map((item) => item.id === folder.id ? { ...item, productIds: item.productIds.filter((id) => id !== product.id) } : item))} aria-label={lang === "pt" ? "Remover da pasta" : "Remove from folder"}><X size={14} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {!favoritesOnly && <aside className="account-side-stack">
            <section className="account-panel order-history-panel">
              <header><History size={19} /><h2>{lang === "pt" ? "Encomendas e histórico" : "Orders and history"}</h2></header>
              {customerOrders.length === 0 ? <p className="muted-copy">{copy.orders}</p> : customerOrders.map((order) => {
                const currentStep = Math.max(0, ORDER_STATUS_SEQUENCE.indexOf(order.status));
                return (
                  <article className="customer-order" key={order.id}>
                    <div className="customer-order-summary">
                      <div><strong>{order.id}</strong><span>{new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium" }).format(new Date(order.createdAt))}</span></div>
                      <div><span className={`customer-order-status status-${order.status}`}>{ORDER_STATUS_LABELS[lang][order.status]}</span><strong>{price(order.total, lang)}</strong></div>
                    </div>
                    <div className="customer-order-progress" aria-label={`${lang === "pt" ? "Estado" : "Status"}: ${ORDER_STATUS_LABELS[lang][order.status]}`}>
                      {ORDER_STATUS_SEQUENCE.map((status, index) => (
                        <span className={index <= currentStep ? "complete" : ""} key={status}><i /><small>{ORDER_STATUS_LABELS[lang][status]}</small></span>
                      ))}
                    </div>
                    {order.trackingNumber && (
                      <div className="customer-tracking"><Truck size={15} /><span>{lang === "pt" ? "Código de seguimento" : "Tracking number"}</span><strong>{order.trackingNumber}</strong></div>
                    )}
                  </article>
                );
              })}
            </section>
          </aside>}
        </div>
      </section>
    );
  }

  return (
    <section className="account-page">
      <div className="account-intro">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{mode === "login" ? copy.titleLogin : copy.titleRegister}</h1>
        <p>{mode === "login" ? copy.subtitleLogin : copy.subtitleRegister}</p>
        <div className="account-benefits">
          <p><Check size={16} />{lang === "pt" ? "Guarde os seus perfumes favoritos" : "Save your favourite perfumes"}</p>
          <p><Check size={16} />{lang === "pt" ? "Checkout mais rápido" : "Faster checkout"}</p>
          <p><Check size={16} />{lang === "pt" ? "Histórico de encomendas" : "Order history"}</p>
        </div>
      </div>

      <div className="account-form-panel">
        <div className="auth-tabs" role="tablist">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>{copy.login}</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>{copy.register}</button>
        </div>
        <button className="google-button" onClick={googleAccount} disabled={authBusy}>
          <span>G</span>{copy.google}
        </button>
        <div className="auth-divider"><span>{copy.divider}</span></div>
        <form className="account-form" onSubmit={submitAccount}>
          {mode === "register" && <label className="field"><span>{copy.name}</span><input name="name" autoComplete="name" required /></label>}
          <label className="field"><span>{copy.email}</span><input name="email" type="email" autoComplete="email" required /></label>
          <label className="field"><span>{copy.password}</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
          <button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? (lang === "pt" ? "Aguarde..." : "Please wait...") : mode === "login" ? copy.login : copy.register}</button>
        </form>
        {authError && <p className="auth-error" role="alert">{authError}</p>}
      </div>
    </section>
  );
}

function FavoritePicker({
  lang,
  product,
  folders,
  setFolders,
  onClose,
  onSaved,
}: {
  lang: Lang;
  product: Product | null;
  folders: FavoriteFolder[];
  setFolders: Dispatch<SetStateAction<FavoriteFolder[]>>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState("");
  if (!product) return null;

  function toggleFolder(folderId: string) {
    const isSaved = folders.find((folder) => folder.id === folderId)?.productIds.includes(product!.id);
    setFolders((items) => items.map((folder) => folder.id === folderId ? {
      ...folder,
      productIds: isSaved ? folder.productIds.filter((id) => id !== product!.id) : [...folder.productIds, product!.id],
    } : folder));
    onSaved(isSaved ? (lang === "pt" ? "Removido da pasta" : "Removed from folder") : (lang === "pt" ? "Guardado nos favoritos" : "Saved to favourites"));
  }

  function createFolder() {
    const folderName = name.trim();
    if (!folderName) return;
    setFolders((items) => [...items, { id: `folder-${Date.now()}`, name: folderName, productIds: [product!.id] }]);
    setName("");
    onSaved(lang === "pt" ? `Pasta “${folderName}” criada` : `Folder “${folderName}” created`);
  }

  return (
    <>
      <button className="modal-backdrop" onClick={onClose} aria-label={lang === "pt" ? "Fechar favoritos" : "Close favourites"} />
      <section className="favorite-picker" role="dialog" aria-modal="true" aria-label={lang === "pt" ? "Guardar nos favoritos" : "Save to favourites"}>
        <header><div><Heart size={20} /><div><span>{lang === "pt" ? "Guardar favorito" : "Save favourite"}</span><h2>{product.name[lang]}</h2></div></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <div className="picker-create">
          <input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFolder(); }} placeholder={lang === "pt" ? "Criar pasta (ex.: JPG)" : "Create folder (e.g. JPG)"} />
          <button onClick={createFolder}><Plus size={17} />{lang === "pt" ? "Criar" : "Create"}</button>
        </div>
        <div className="picker-folders">
          {folders.length === 0 ? <p>{lang === "pt" ? "Crie a primeira pasta para guardar este perfume." : "Create your first folder to save this perfume."}</p> : folders.map((folder) => {
            const saved = folder.productIds.includes(product.id);
            return <button className={saved ? "selected" : ""} key={folder.id} onClick={() => toggleFolder(folder.id)}><Folder size={18} /><span><strong>{folder.name}</strong><small>{folder.productIds.length} {lang === "pt" ? "perfumes" : "perfumes"}</small></span>{saved && <Check size={17} />}</button>;
          })}
        </div>
      </section>
    </>
  );
}

function AdminPage({
  lang,
  products,
  setProducts,
  orders,
  setOrders,
  coupons,
  setCoupons,
  profiles,
  session,
  onShop,
  onLogout,
}: {
  lang: Lang;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  orders: Order[];
  setOrders: Dispatch<SetStateAction<Order[]>>;
  coupons: Coupon[];
  setCoupons: Dispatch<SetStateAction<Coupon[]>>;
  profiles: CustomerProfile[];
  session: Session;
  onShop: () => void;
  onLogout: () => Promise<void>;
}) {
  const emptyDraft = () => ({ name: "", brand: "", descriptionPt: "", descriptionEn: "", price: "", volume: "100ml", category: "Unissexo" as Product["category"], scentProfile: "fresh" as ScentProfile, tag: "stock" as Product["tag"], isNew: false, bestSeller: false, promotion: false, discount: "", endsAt: toDateTimeInput() });
  const defaultDraftVariants = (): DraftVariant[] => [
    { id: crypto.randomUUID(), volume: "100ml", price: "", isDecant: false, stock: "", soldout: false },
    ...decantVariants("custom", 0).map((variant) => ({ id: crypto.randomUUID(), volume: variant.volume, price: String(variant.price), isDecant: true, stock: "", soldout: false })),
  ];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [draftVariants, setDraftVariants] = useState<DraftVariant[]>(defaultDraftVariants);
  const [editorOpen, setEditorOpen] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [draftImages, setDraftImages] = useState<DraftProductImage[]>([]);
  const [imageError, setImageError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const imagePreviewUrls = useRef(new Set<string>());
  const newProductId = useRef("");
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, OrderStatus>>({});
  const [adminBusy, setAdminBusy] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [influencersOpen, setInfluencersOpen] = useState(false);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [decantPricingOpen, setDecantPricingOpen] = useState(false);
  const [decantPricingRules, setDecantPricingRules] = useState<DecantPricingRule[]>(DEFAULT_DECANT_PRICING.map((rule) => ({ ...rule })));
  const [decantPricingError, setDecantPricingError] = useState("");
  const { brands } = useBrands();
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("10");
  const [couponError, setCouponError] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<ListingKind>("all");
  const [catalogHighlight, setCatalogHighlight] = useState<"all" | "best" | "sale">("all");
  const copy = lang === "pt" ? {
    title: "Gestão da loja", store: "Ver loja", logout: "Sair", products: "Produtos", best: "Best sellers", sold: "Esgotados", orders: "Encomendas",
    add: "Adicionar produto", edit: "Editar produto", name: "Nome", brand: "Marca", descriptionPt: "Descrição do produto (Português)", descriptionEn: "Descrição do produto (Inglês)", descriptionHint: "Descreva o aroma, a sensação e para quem é indicada esta fragrância.", price: "Preço", volume: "Tamanho", category: "Categoria", scentProfile: "Perfil olfativo", status: "Estado", variantStock: "Tamanhos, preços e stock", stockQuantity: "Quantidade", stockUndefined: "Ilimitado", stockHelp: "Adicione os tamanhos vendidos e defina o preço e stock de cada um. Quantidade vazia significa stock ilimitado.", fullSize: "Frasco inteiro", decant: "Decant", variantSoldOut: "Esgotado",
    save: "Guardar produto", cancel: "Cancelar", inventory: "Inventário", actions: "Ações", remove: "Remover", editAction: "Editar", image: "Imagem do produto", imageHint: "Escolher uma imagem JPG, PNG ou WebP (máx. 5 MB)", promotion: "Criar promoção", bestSellerToggle: "Adicionar aos Best sellers", newToggle: "Novidade", discount: "Desconto (%)", newPrice: "Novo preço", promotionEnd: "Termina em", seed: "Enviar catálogo para Firebase", tracking: "Número de seguimento", confirmTracking: "Confirmar envio",
    ordersTitle: "Encomendas recebidas", ordersSub: "Dados de entrega e resumo de cada pedido realizado no mockup.", noOrders: "Ainda não existem encomendas.", noOrdersText: "As encomendas concluídas no checkout vão aparecer aqui.",
    customer: "Cliente", delivery: "Entrega", payment: "Pagamento", items: "Produtos", notes: "Notas do cliente", orderStatus: "Estado da encomenda",
    archive: "Arquivo de entregas", backToOrders: "Encomendas ativas", archiveOrder: "Arquivar entrega", restoreOrder: "Repor encomenda",
    archiveTitle: "Arquivo de entregas", archiveSub: "Histórico das encomendas entregues e arquivadas.", noArchive: "O arquivo está vazio.", noArchiveText: "As entregas arquivadas vão aparecer aqui.",
    coupon: "Criar Cupão", couponTitle: "Gerir cupões", couponCode: "Código do cupão", couponDiscount: "Desconto (%)", couponCreate: "Criar cupão", couponEmpty: "Ainda não existem cupões.", couponRemove: "Remover cupão",
    statuses: { received: "Recebida", preparing: "Em preparação", shipped: "Enviada", delivered: "Entregue" },
  } : {
    title: "Store management", store: "View store", logout: "Sign out", products: "Products", best: "Best sellers", sold: "Sold out", orders: "Orders",
    add: "Add product", edit: "Edit product", name: "Name", brand: "Brand", descriptionPt: "Product description (Portuguese)", descriptionEn: "Product description (English)", descriptionHint: "Describe the scent, feeling and who this fragrance is best suited for.", price: "Price", volume: "Size", category: "Category", scentProfile: "Scent profile", status: "Status", variantStock: "Sizes, prices and stock", stockQuantity: "Quantity", stockUndefined: "Unlimited", stockHelp: "Add each available size and set its price and stock. An empty quantity means unlimited stock.", fullSize: "Full bottle", decant: "Decant", variantSoldOut: "Sold out",
    save: "Save product", cancel: "Cancel", inventory: "Inventory", actions: "Actions", remove: "Remove", editAction: "Edit", image: "Product image", imageHint: "Choose a JPG, PNG or WebP image (max. 5 MB)", promotion: "Create promotion", bestSellerToggle: "Add to Best sellers", newToggle: "New arrival", discount: "Discount (%)", newPrice: "New price", promotionEnd: "Ends at", seed: "Upload catalogue to Firebase", tracking: "Tracking number", confirmTracking: "Confirm shipment",
    ordersTitle: "Received orders", ordersSub: "Delivery details and purchase summary for every mock order.", noOrders: "There are no orders yet.", noOrdersText: "Orders completed at checkout will appear here.",
    customer: "Customer", delivery: "Delivery", payment: "Payment", items: "Products", notes: "Customer notes", orderStatus: "Order status",
    archive: "Delivery archive", backToOrders: "Active orders", archiveOrder: "Archive delivery", restoreOrder: "Restore order",
    archiveTitle: "Delivery archive", archiveSub: "History of delivered and archived orders.", noArchive: "The archive is empty.", noArchiveText: "Archived deliveries will appear here.",
    coupon: "Create coupon", couponTitle: "Manage coupons", couponCode: "Coupon code", couponDiscount: "Discount (%)", couponCreate: "Create coupon", couponEmpty: "There are no coupons yet.", couponRemove: "Remove coupon",
    statuses: { received: "Received", preparing: "Preparing", shipped: "Shipped", delivered: "Delivered" },
  };
  const activeOrders = orders.filter((order) => !order.archived);
  const archivedOrders = orders.filter((order) => order.archived);
  const visibleOrders = showArchive ? archivedOrders : activeOrders;
  const inventoryProducts = products.filter((product) => !product.isDecant);
  const visibleProducts = filterAdminCatalogue(products, catalogQuery, catalogCategory, catalogHighlight);

  useEffect(() => {
    const previews = imagePreviewUrls.current;
    return () => { previews.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return watchDecantPricing(setDecantPricingRules, (error) => setDecantPricingError(error.message));
  }, []);

  function clearImageDraft() {
    imagePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    imagePreviewUrls.current.clear();
    setDraftImages([]);
    setImageError("");
    setUploadProgress("");
  }

  function addImages(files: File[]) {
    if (!files.length || adminBusy) return;
    const error = validateProductImageFiles(files, draftImages.length);
    if (error) {
      setImageError(error === "count"
        ? (lang === "pt" ? `Pode adicionar até ${MAX_PRODUCT_IMAGES} imagens por produto.` : `You can add up to ${MAX_PRODUCT_IMAGES} images per product.`)
        : error === "type" ? (lang === "pt" ? "Escolha apenas imagens JPG, PNG ou WebP." : "Choose JPG, PNG or WebP images only.")
        : (lang === "pt" ? "Cada imagem deve ter menos de 5 MB e não pode estar vazia." : "Each image must be under 5 MB and cannot be empty."));
      return;
    }
    const additions = files.map((file) => {
      const imageUrl = URL.createObjectURL(file);
      imagePreviewUrls.current.add(imageUrl);
      return { id: crypto.randomUUID(), imageUrl, file };
    });
    setDraftImages((images) => [...images, ...additions]);
    setImageError("");
  }

  function clearCatalogueFilters() {
    setCatalogQuery("");
    setCatalogCategory("all");
    setCatalogHighlight("all");
  }

  function updateDraftVariant(id: string, changes: Partial<DraftVariant>) {
    const primaryId = draftVariants.find((variant) => !variant.isDecant)?.id;
    setDraftVariants((variants) => variants.map((variant) => variant.id === id ? { ...variant, ...changes } : variant));
    if (id === primaryId) {
      setDraft((current) => ({
        ...current,
        ...(changes.volume !== undefined ? { volume: changes.volume } : {}),
        ...(changes.price !== undefined ? { price: changes.price } : {}),
      }));
    }
  }

  function updatePrimaryVariant(changes: Partial<Pick<DraftVariant, "volume" | "price">>) {
    const primary = draftVariants.find((variant) => !variant.isDecant);
    if (primary) updateDraftVariant(primary.id, changes);
  }

  function addDraftVariant(isDecant: boolean) {
    const usedVolumes = new Set(draftVariants.map((variant) => variant.volume.toLowerCase().replace(/\s/g, "")));
    const defaultVolume = isDecant
      ? ([2, 5, 10].find((size) => !usedVolumes.has(`${size}ml`)) ?? 15) + "ml"
      : ([30, 50, 75, 100, 150].find((size) => !usedVolumes.has(`${size}ml`)) ?? 200) + "ml";
    const decantSize = Number.parseInt(defaultVolume, 10) as DecantSize;
    const suggestedPrice = isDecant ? decantPriceFor(decantPricingRules, Number(draft.price) || 0, decantSize) : Number(draft.price) || 0;
    setDraftVariants((variants) => [...variants, {
      id: crypto.randomUUID(),
      volume: defaultVolume,
      price: String(suggestedPrice ?? 0),
      isDecant,
      stock: "",
      soldout: false,
    }]);
  }

  function removeDraftVariant(id: string) {
    const target = draftVariants.find((variant) => variant.id === id);
    if (target && !target.isDecant && draftVariants.filter((variant) => !variant.isDecant).length === 1) {
      window.alert(lang === "pt" ? "O produto precisa de pelo menos um tamanho de frasco." : "The product needs at least one full-bottle size.");
      return;
    }
    setDraftVariants((variants) => variants.filter((variant) => variant.id !== id));
  }

  function resetEditor() {
    if (adminBusy) return;
    setEditingId(null);
    setDraft(emptyDraft());
    setDraftVariants(defaultDraftVariants());
    clearImageDraft();
    setEditorOpen(false);
  }

  function addProduct() {
    setEditingId(null);
    setDraft(emptyDraft());
    setDraftVariants(defaultDraftVariants());
    newProductId.current = `custom-${crypto.randomUUID()}`;
    clearImageDraft();
    setEditorOpen(true);
  }

  function editProduct(product: Product) {
    const discount = productDiscount(product);
    const endsAt = productPromotionEnd(product);
    setEditingId(product.id);
    setDraft({ name: product.name[lang], brand: product.brand, descriptionPt: product.desc?.pt ?? "", descriptionEn: product.desc?.en ?? "", price: String(product.price), volume: product.volume, category: product.category, scentProfile: product.scentProfile, tag: product.tag === "new" ? "stock" : product.tag, isNew: product.isNew ?? product.tag === "new", bestSeller: Boolean(product.bestSeller), promotion: discount > 0, discount: discount ? String(discount) : "", endsAt: toDateTimeInput(endsAt) });
    const editableVariants = product.variants.length ? product.variants : [{ volume: product.volume, price: product.price, soldout: product.tag === "soldout" }];
    setDraftVariants(editableVariants.map((variant) => ({ id: crypto.randomUUID(), volume: variant.volume, price: String(variant.price), isDecant: Boolean(variant.isDecant), stock: typeof variant.stock === "number" ? String(variant.stock) : "", soldout: Boolean(variant.soldout) })));
    clearImageDraft();
    setDraftImages(getProductImages(product).map((image) => ({ ...image, id: crypto.randomUUID() })));
    setEditorOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adminBusy) return;
    const existing = products.find((product) => product.id === editingId);
    const fallback = existing ?? PRODUCTS[0];
    const nextId = existing?.id ?? newProductId.current;
    const isOtherProduct = draft.category === "Outros produtos";
    const usableDraftVariants = draftVariants.filter((variant) => variant.volume.trim() && (!isOtherProduct || !variant.isDecant));
    const primaryDraftVariant = usableDraftVariants.find((variant) => !variant.isDecant);
    const basePrice = Math.max(0, Number(primaryDraftVariant?.price ?? draft.price));
    const baseVolume = primaryDraftVariant?.volume.trim() || draft.volume.trim();
    const normalizedVolumes = usableDraftVariants.map((variant) => variant.volume.toLowerCase().replace(/\s/g, ""));
    if (!usableDraftVariants.some((variant) => !variant.isDecant)) {
      window.alert(lang === "pt" ? "Adicione pelo menos um tamanho de frasco." : "Add at least one full-bottle size.");
      return;
    }
    if (new Set(normalizedVolumes).size !== normalizedVolumes.length) {
      window.alert(lang === "pt" ? "Existem tamanhos repetidos. Cada tamanho só pode aparecer uma vez." : "There are duplicate sizes. Each size can only appear once.");
      return;
    }
    if (usableDraftVariants.some((variant) => !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0)) {
      window.alert(lang === "pt" ? "Revise os preços dos tamanhos." : "Review the size prices.");
      return;
    }
    const updatedVariants = (usableDraftVariants.length ? usableDraftVariants : defaultDraftVariants().slice(0, 1)).map((variant) => {
      const stock = variant.stock.trim() === "" ? undefined : Math.max(0, Math.trunc(Number(variant.stock) || 0));
      return {
        volume: variant.volume.trim(),
        price: Math.max(0, Number(variant.price) || 0),
        isDecant: variant.isDecant || undefined,
        stock,
        soldout: stock === 0 || variant.soldout,
      };
    });
    setAdminBusy(true);
    try {
      const images: ProductImage[] = [];
      const uploadCount = draftImages.filter((image) => image.file).length;
      let uploaded = 0;
      for (const image of draftImages) {
        let savedImage: ProductImage = image;
        if (image.file) {
          setUploadProgress(lang === "pt" ? `A enviar imagem ${uploaded + 1} de ${uploadCount}...` : `Uploading image ${uploaded + 1} of ${uploadCount}...`);
          savedImage = await uploadProductImage(nextId, image.file);
          uploaded += 1;
          // Keep successful uploads in the draft so retrying does not upload them again.
          setDraftImages((items) => items.map((item) => item.id === image.id ? { ...savedImage, id: item.id } : item));
        }
        images.push(savedImage);
      }
      setUploadProgress("");
      const imageData = productImageFields(images);
      const nextProduct: Product = {
        ...fallback,
        id: nextId,
        brand: brands.find((brand) => brandKey(brand) === brandKey(draft.brand)) ?? draft.brand.trim(),
        category: draft.category,
        scentProfile: draft.scentProfile,
        audiences: isOtherProduct ? [] : existing && existing.category === draft.category
          ? existing.audiences
          : [draft.category === "Masculinos" ? "men" : draft.category === "Femininos" ? "women" : "unisex"],
        tag: draft.tag === "new" ? "stock" : draft.tag,
        isNew: draft.isNew,
        bestSeller: draft.bestSeller,
        name: { pt: draft.name.trim(), en: draft.name.trim() },
        price: basePrice,
        discount: draft.promotion ? Math.min(95, Math.max(1, Number(draft.discount))) : undefined,
        promotionEndsAt: draft.promotion ? new Date(draft.endsAt).toISOString() : undefined,
        volume: baseVolume,
        variants: updatedVariants,
        family: existing?.family ?? { pt: "", en: "" },
        desc: {
          pt: draft.descriptionPt.trim() || existing?.desc?.pt || `${draft.name.trim()}, de ${draft.brand.trim()}.`,
          en: draft.descriptionEn.trim() || draft.descriptionPt.trim() || existing?.desc?.en || `${draft.name.trim()} by ${draft.brand.trim()}.`,
        },
        notes: existing?.notes ?? {
          top: { pt: [], en: [] },
          heart: { pt: [], en: [] },
          base: { pt: [], en: [] },
        },
        color: existing?.color ?? "#4d3611",
        accent: existing?.accent ?? "#d9ae4b",
        mood: existing?.mood ?? "custom",
        ...imageData,
      };
      const nextDecantProduct = asDecantProduct(nextProduct);

      if (firebaseEnabled) {
        const saves = [saveFirebaseProduct(nextProduct.id, nextProduct)];
        if (nextDecantProduct) saves.push(saveFirebaseProduct(nextDecantProduct.id, nextDecantProduct));
        else if (existing && products.some((product) => product.id === `decant-${existing.id}`)) saves.push(removeFirebaseProduct(`decant-${existing.id}`));
        await Promise.race([
          Promise.all(saves),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error(lang === "pt" ? "A Firebase demorou demasiado a responder. Tente novamente." : "Firebase took too long to respond. Please try again.")), 8000)),
        ]);
      }

      setProducts((items) => {
        if (!existing) return nextDecantProduct ? [nextProduct, nextDecantProduct, ...items] : [nextProduct, ...items];
        const decantId = `decant-${existing.id}`;
        const hasDecantEntry = items.some((item) => item.id === decantId);
        const updatedItems = items.filter((item) => nextDecantProduct || item.id !== decantId).map((item) => item.id === existing.id ? nextProduct : item.id === decantId && nextDecantProduct ? nextDecantProduct : item);
        return nextDecantProduct && !hasDecantEntry ? [...updatedItems, nextDecantProduct] : updatedItems;
      });
      setEditingId(null);
      setDraft(emptyDraft());
      setDraftVariants(defaultDraftVariants());
      clearImageDraft();
      setEditorOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : (lang === "pt" ? "Não foi possível guardar o produto." : "The product could not be saved."));
    } finally {
      setAdminBusy(false);
      setUploadProgress("");
    }
  }

  async function deleteProduct(product: Product) {
    setProducts((items) => items.filter((item) => item.id !== product.id));
    if (firebaseEnabled) await removeFirebaseProduct(product.id);
  }

  function changeOrder(orderId: string, changes: Record<string, unknown>) {
    setOrders((items) => items.map((item) => item.id === orderId ? { ...item, ...changes } as Order : item));
    if (firebaseEnabled) void updateFirebaseOrder(orderId, { ...changes, updatedAt: new Date().toISOString() });
  }

  function selectOrderStatus(order: Order, status: OrderStatus) {
    if (status === "shipped") {
      setPendingStatuses((items) => ({ ...items, [order.id]: status }));
      setTrackingDrafts((items) => ({ ...items, [order.id]: items[order.id] ?? order.trackingNumber ?? "" }));
      return;
    }
    setPendingStatuses((items) => ({ ...items, [order.id]: status }));
    changeOrder(order.id, { status });
  }

  function confirmShipment(order: Order) {
    const trackingNumber = (trackingDrafts[order.id] ?? "").trim();
    if (!trackingNumber) return;
    changeOrder(order.id, { status: "shipped", trackingNumber });
    setPendingStatuses((items) => ({ ...items, [order.id]: "shipped" }));
  }

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = couponCode.trim().toUpperCase();
    const discount = Math.trunc(Number(couponDiscount));
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      setCouponError(lang === "pt" ? "Use 3 a 30 letras, números, hífenes ou underscores." : "Use 3 to 30 letters, numbers, hyphens or underscores.");
      return;
    }
    if (discount < 1 || discount > 95) {
      setCouponError(lang === "pt" ? "O desconto deve estar entre 1% e 95%." : "The discount must be between 1% and 95%.");
      return;
    }
    if (coupons.some((coupon) => coupon.code === code)) {
      setCouponError(lang === "pt" ? "Este código já existe." : "This code already exists.");
      return;
    }
    const coupon = { id: code, code, discount, createdAt: new Date().toISOString() };
    setCouponError("");
    setCoupons((items) => [coupon, ...items]);
    setCouponCode("");
    setCouponDiscount("10");
    if (firebaseEnabled) await saveFirebaseCoupon(code, coupon);
  }

  async function deleteCoupon(code: string) {
    const assigned = coupons.find((coupon) => coupon.code === code)?.influencerUid;
    if (assigned) {
      setCouponError(lang === "pt" ? "Retire primeiro este cupão da conta influencer associada." : "First unlink this coupon from its influencer account.");
      return;
    }
    setCoupons((items) => items.filter((coupon) => coupon.code !== code));
    if (firebaseEnabled) await removeFirebaseCoupon(code);
  }

  async function applyGlobalDecantRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDecantPricingError("");
    if (!isValidDecantPricing(decantPricingRules)) {
      setDecantPricingError(lang === "pt" ? "Revise os intervalos e preços antes de guardar." : "Review the ranges and prices before saving.");
      return;
    }
    const updatedBaseProducts = inventoryProducts.map((product) => applyDecantPricing(product, decantPricingRules));
    const updates = new Map<string, Product>();
    updatedBaseProducts.forEach((product) => {
      updates.set(product.id, product);
      const decantProduct = asDecantProduct(product);
      if (decantProduct) updates.set(decantProduct.id, decantProduct);
    });
    setAdminBusy(true);
    try {
      if (firebaseEnabled) {
        await saveDecantPricing(decantPricingRules);
        await Promise.all([...updates.values()].map((product) => saveFirebaseProduct(product.id, product)));
      }
      setProducts((items) => items.map((product) => updates.get(product.id) ?? product));
      setDecantPricingOpen(false);
    } catch (error) {
      setDecantPricingError(adminSaveError(error, lang));
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-heading">
        <div><span className="eyebrow">Mystic Essence Admin</span><h1>{copy.title}</h1><p>{session.email}</p></div>
        <div className="admin-heading-actions"><button className="ghost-button" onClick={onShop}>{copy.store}</button><button className="ghost-button" onClick={() => setShippingOpen(true)}><Truck size={17} />{lang === "pt" ? "Portes" : "Shipping"}</button><button className="ghost-button" onClick={() => setDecantPricingOpen(true)}><SlidersHorizontal size={17} />{lang === "pt" ? "Preços dos decants" : "Decant prices"}</button><button className="ghost-button" onClick={() => setBrandsOpen(true)}><Tag size={17} />{lang === "pt" ? "Criar marca" : "Create brand"}</button><button className="ghost-button admin-coupon-button" onClick={() => setCouponOpen(true)}><TicketPercent size={17} />{copy.coupon}</button><button className="ghost-button" onClick={() => setInfluencersOpen(true)}><User size={17} />{lang === "pt" ? "Gerir influencers" : "Manage influencers"}</button><button className="icon-text-button" onClick={() => void onLogout()}><LogOut size={16} />{copy.logout}</button></div>
      </header>

      {shippingOpen && <ShippingSettingsDialog lang={lang} onClose={() => setShippingOpen(false)} />}
      {brandsOpen && <BrandSettingsDialog lang={lang} onClose={() => setBrandsOpen(false)} onCreated={editorOpen ? (brand) => { setDraft((current) => ({ ...current, brand })); setBrandsOpen(false); } : undefined} />}
      {decantPricingOpen && <>
        <button className="modal-backdrop" onClick={() => setDecantPricingOpen(false)} aria-label={copy.cancel} />
        <form className="decant-pricing-manager" onSubmit={applyGlobalDecantRules} role="dialog" aria-modal="true" aria-labelledby="decant-pricing-title">
          <header><div><SlidersHorizontal size={20} /><div><span className="eyebrow">Mystic Essence Admin</span><h2 id="decant-pricing-title">{lang === "pt" ? "Preços gerais dos decants" : "Global decant prices"}</h2></div></div><button type="button" onClick={() => setDecantPricingOpen(false)} aria-label={copy.cancel}><X size={20} /></button></header>
          <DecantAvailabilityControls lang={lang} disabled={adminBusy} />
          <p>{lang === "pt" ? "Cada regra aplica um preço de decant aos perfumes cujo preço do frasco esteja dentro do intervalo." : "Each rule applies a decant price to bottles whose price is within the range."}</p>
          <div className="decant-pricing-list">
            {decantPricingRules.map((rule) => <div className="decant-pricing-row" key={rule.id}>
              <label><span>{lang === "pt" ? "Preço mínimo" : "Minimum"}</span><input type="number" min="0" step="0.01" value={rule.minPrice} onChange={(event) => setDecantPricingRules((rules) => rules.map((item) => item.id === rule.id ? { ...item, minPrice: Number(event.target.value) } : item))} /></label>
              <label><span>{lang === "pt" ? "Preço máximo" : "Maximum"}</span><input type="number" min="0" step="0.01" value={rule.maxPrice} onChange={(event) => setDecantPricingRules((rules) => rules.map((item) => item.id === rule.id ? { ...item, maxPrice: Number(event.target.value) } : item))} /></label>
              <label><span>{lang === "pt" ? "Tamanho" : "Size"}</span><select value={rule.size} onChange={(event) => setDecantPricingRules((rules) => rules.map((item) => item.id === rule.id ? { ...item, size: Number(event.target.value) as DecantSize } : item))}><option value="2">2 ml</option><option value="5">5 ml</option><option value="10">10 ml</option></select></label>
              <label><span>{lang === "pt" ? "Preço do decant" : "Decant price"}</span><input type="number" min="0" step="0.01" value={rule.price} onChange={(event) => setDecantPricingRules((rules) => rules.map((item) => item.id === rule.id ? { ...item, price: Number(event.target.value) } : item))} /></label>
              <button type="button" onClick={() => setDecantPricingRules((rules) => rules.filter((item) => item.id !== rule.id))} aria-label={lang === "pt" ? "Remover regra" : "Remove rule"}><Trash2 size={16} /></button>
            </div>)}
          </div>
          <button className="ghost-button decant-rule-add" type="button" onClick={() => setDecantPricingRules((rules) => [...rules, { id: crypto.randomUUID(), minPrice: 0, maxPrice: 100, size: 2, price: 1.9 }])}><Plus size={16} />{lang === "pt" ? "Adicionar regra" : "Add rule"}</button>
          {decantPricingError && <p className="auth-error" role="alert">{decantPricingError}</p>}
          <button className="primary-button" type="submit" disabled={adminBusy}>{adminBusy ? (lang === "pt" ? "A aplicar..." : "Applying...") : (lang === "pt" ? "Guardar e aplicar ao catálogo" : "Save and apply to catalogue")}</button>
        </form>
      </>}

      <div className="admin-metrics">
        <div><Boxes size={20} /><span>{copy.products}</span><strong>{inventoryProducts.length}</strong></div>
        <div><Sparkles size={20} /><span>{copy.best}</span><strong>{inventoryProducts.filter((product) => product.bestSeller).length}</strong></div>
        <div><ShoppingBag size={20} /><span>{copy.sold}</span><strong>{inventoryProducts.filter((product) => product.tag === "soldout").length}</strong></div>
        <div><ClipboardList size={20} /><span>{copy.orders}</span><strong>{activeOrders.length}</strong></div>
      </div>

      <div className="admin-workspace">
        <div className="admin-inventory">
          <div className="admin-inventory-title">
            <div><LayoutDashboard size={19} /><h2>{copy.inventory}</h2></div>
            <div className="admin-inventory-actions">
              {firebaseEnabled && <button onClick={() => void seedProducts(INITIAL_PRODUCTS)} disabled={adminBusy}><Boxes size={17} />{copy.seed}</button>}
              <button onClick={addProduct}><PackagePlus size={17} />{copy.add}</button>
            </div>
          </div>
          <div className="admin-product-list">
            <div className="admin-catalogue-tools">
              <label className="field admin-catalogue-search"><span>{lang === "pt" ? "Pesquisar no catálogo" : "Search catalogue"}</span><div><Search size={18} /><input type="search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder={lang === "pt" ? "Nome ou marca" : "Name or brand"} /></div></label>
              <label className="field"><span>{copy.category}</span><select value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value as ListingKind)}>
                <option value="all">{lang === "pt" ? "Todas as categorias" : "All categories"}</option>
                {shopMenu.buy.filter((item) => item.kind !== "all").map((item) => <option key={item.kind} value={item.kind}>{item.label[lang]}</option>)}
              </select></label>
              <label className="field"><span>{lang === "pt" ? "Destaque" : "Featured"}</span><select value={catalogHighlight} onChange={(event) => setCatalogHighlight(event.target.value as typeof catalogHighlight)}>
                <option value="all">{lang === "pt" ? "Todos os produtos" : "All products"}</option><option value="best">Best sellers</option><option value="sale">{lang === "pt" ? "Promoções" : "Promotions"}</option>
              </select></label>
              <div className="admin-catalogue-results"><span role="status">{visibleProducts.length} / {inventoryProducts.length} {copy.products.toLowerCase()}</span><button type="button" onClick={clearCatalogueFilters} disabled={!catalogQuery && catalogCategory === "all" && catalogHighlight === "all"}>{lang === "pt" ? "Limpar filtros" : "Clear filters"}</button></div>
            </div>
            {visibleProducts.length === 0 && <div className="admin-catalogue-empty"><Search size={24} /><p>{lang === "pt" ? "Nenhum produto encontrado." : "No products found."}</p><button className="text-link" onClick={clearCatalogueFilters}>{lang === "pt" ? "Limpar filtros" : "Clear filters"}</button></div>}
            {visibleProducts.map((product) => (
              <article className="admin-product-row" key={product.id}>
                <ProductVisual product={product} compact />
                <div className="admin-product-name"><strong>{product.name[lang]}</strong><span>{product.brand} · {product.volume} · {SCENT_PROFILE_LABELS[lang][product.scentProfile]}</span></div>
                <span className={`admin-status ${product.tag}`}>
                  {product.tag === "soldout" ? (lang === "pt" ? "Esgotado" : "Sold out") : (lang === "pt" ? "Em stock" : "In stock")}
                </span>
                <strong>{productDiscount(product) > 0 ? price(productPrice(product), lang) : price(product.price, lang)}</strong>
                <div className="admin-row-actions" aria-label={copy.actions}>
                  <button onClick={() => editProduct(product)} aria-label={`${copy.editAction} ${product.name[lang]}`} title={copy.editAction}><Pencil size={15} /></button>
                  <button onClick={() => void deleteProduct(product)} aria-label={`${copy.remove} ${product.name[lang]}`} title={copy.remove}><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {editorOpen && (
        <>
          <button className="modal-backdrop" onClick={resetEditor} aria-label={copy.cancel} />
          <form className="admin-editor admin-editor-modal" onSubmit={saveProduct} role="dialog" aria-modal="true">
          <header><div><span className="eyebrow">{editingId ? copy.edit : copy.add}</span><h2>{editingId ? draft.name : copy.add}</h2></div><button type="button" disabled={adminBusy} onClick={resetEditor} aria-label={copy.cancel}><X size={20} /></button></header>
          <section className="admin-product-images" aria-label={lang === "pt" ? "Imagens do produto" : "Product images"}>
            <div className="admin-images-heading"><h3>{lang === "pt" ? "Imagens do produto" : "Product images"}</h3><span>{draftImages.length} / {MAX_PRODUCT_IMAGES}</span></div>
            {draftImages.length > 0 && <div className="admin-image-list">
              {draftImages.map((image, index) => <div className="admin-image-item" key={image.id}>
                <img src={image.imageUrl} alt={`${lang === "pt" ? "Imagem" : "Image"} ${index + 1}`} />
                <div className="admin-image-actions">
                  <button type="button" disabled={adminBusy} aria-pressed={index === 0} aria-label={`${lang === "pt" ? "Definir como principal" : "Set as main image"} ${index + 1}`} title={lang === "pt" ? "Definir como principal" : "Set as main image"} onClick={() => setDraftImages((items) => [image, ...items.filter((item) => item.id !== image.id)])}><Star size={17} /></button>
                  <button type="button" disabled={adminBusy} aria-label={`${lang === "pt" ? "Remover imagem" : "Remove image"} ${index + 1}`} title={lang === "pt" ? "Remover imagem" : "Remove image"} onClick={() => { setDraftImages((items) => items.filter((item) => item.id !== image.id)); setImageError(""); }}><Trash2 size={17} /></button>
                </div>
                <span>{index === 0 ? (lang === "pt" ? "Principal" : "Main image") : `${lang === "pt" ? "Imagem" : "Image"} ${index + 1}`}</span>
              </div>)}
            </div>}
            <label className="admin-image-drop">
              <Camera size={24} />
              <span><strong>{lang === "pt" ? "Adicionar imagens" : "Add images"}</strong><small>JPG, PNG, WebP · &lt; 5 MB</small></span>
              <input type="file" multiple aria-label={lang === "pt" ? "Adicionar imagens" : "Add images"} accept="image/jpeg,image/png,image/webp" disabled={!storageEnabled || adminBusy || draftImages.length >= MAX_PRODUCT_IMAGES} onChange={(event) => { addImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
            </label>
            {imageError && <p className="admin-image-error" role="alert">{imageError}</p>}
          </section>
          <label className="field"><span>{copy.name}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
          <div className="admin-brand-field"><label className="field"><span>{copy.brand}</span><select value={brands.find((brand) => brandKey(brand) === brandKey(draft.brand)) ?? draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} required><option value="">{lang === "pt" ? "Selecionar marca" : "Select brand"}</option>{draft.brand && !brands.some((brand) => brandKey(brand) === brandKey(draft.brand)) && <option value={draft.brand}>{draft.brand} ({lang === "pt" ? "retirada" : "removed"})</option>}{brands.map((brand) => <option key={brandKey(brand)} value={brand}>{brand}</option>)}</select></label><button type="button" className="ghost-button" disabled={adminBusy} onClick={() => setBrandsOpen(true)}><Plus size={16} />{lang === "pt" ? "Criar marca" : "Create brand"}</button></div>
          <label className="field admin-description-field"><span>{copy.descriptionPt}</span><textarea rows={4} maxLength={1200} value={draft.descriptionPt} onChange={(event) => setDraft({ ...draft, descriptionPt: event.target.value })} placeholder={copy.descriptionHint} /></label>
          <label className="field admin-description-field"><span>{copy.descriptionEn}</span><textarea rows={4} maxLength={1200} value={draft.descriptionEn} onChange={(event) => setDraft({ ...draft, descriptionEn: event.target.value })} placeholder={copy.descriptionHint} /></label>
          <div className="admin-field-row">
            <label className={`field ${draft.promotion ? "locked-field" : ""}`}><span>{copy.price}</span><input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => { setDraft({ ...draft, price: event.target.value }); updatePrimaryVariant({ price: event.target.value }); }} disabled={draft.promotion} required /></label>
            <label className="field"><span>{copy.volume}</span><input value={draft.volume} onChange={(event) => { setDraft({ ...draft, volume: event.target.value }); updatePrimaryVariant({ volume: event.target.value }); }} required /></label>
          </div>
          <label className="promotion-toggle">
            <input type="checkbox" checked={draft.promotion} onChange={(event) => setDraft({ ...draft, promotion: event.target.checked, discount: event.target.checked ? (draft.discount || "10") : "", endsAt: event.target.checked ? (draft.endsAt || toDateTimeInput()) : draft.endsAt })} />
            <span><Check size={14} />{copy.promotion}</span>
          </label>
          {draft.promotion && (
            <div className="admin-field-row promotion-fields">
              <label className="field"><span>{copy.discount}</span><input type="number" min="1" max="95" step="1" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} required /></label>
              <label className="field output-field"><span>{copy.newPrice}</span><input value={price(Math.max(0, Number(draft.price)) * (1 - Math.min(95, Math.max(0, Number(draft.discount))) / 100), lang)} readOnly /></label>
              <label className="field promotion-end-field"><span>{copy.promotionEnd}</span><input type="datetime-local" min={toDateTimeInput(new Date().toISOString())} value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} required /></label>
            </div>
          )}
          <div className="admin-field-row">
            <label className="field"><span>{copy.category}</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Product["category"] })}><option>Masculinos</option><option>Femininos</option><option>Unissexo</option><option value="Outros produtos">{lang === "pt" ? "Outros produtos" : "Other products"}</option></select></label>
            <label className="field"><span>{copy.status}</span><select value={draft.tag === "new" ? "stock" : draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value as Product["tag"] })}><option value="stock">{lang === "pt" ? "Em stock" : "In stock"}</option><option value="soldout">{lang === "pt" ? "Esgotado" : "Sold out"}</option></select></label>
          </div>
          <section className="admin-variant-stock">
            <h3>{copy.variantStock}</h3>
            <p className="admin-stock-help">{copy.stockHelp}</p>
            <div className="admin-variant-list">
              {draftVariants.filter((variant) => draft.category !== "Outros produtos" || !variant.isDecant).map((variant) => (
                <div className="admin-variant-stock-row" key={variant.id}>
                  <label className="admin-variant-field"><span>{lang === "pt" ? "Tamanho" : "Size"}</span><input value={variant.volume} onChange={(event) => updateDraftVariant(variant.id, { volume: event.target.value })} placeholder={variant.isDecant ? "5ml" : "100ml"} required /></label>
                  <label className="admin-variant-field"><span>{lang === "pt" ? "Tipo" : "Type"}</span><select value={variant.isDecant ? "decant" : "full"} onChange={(event) => updateDraftVariant(variant.id, { isDecant: event.target.value === "decant" })} disabled={draft.category === "Outros produtos"}><option value="full">{draft.category === "Outros produtos" ? (lang === "pt" ? "Produto" : "Product") : copy.fullSize}</option><option value="decant">{copy.decant}</option></select></label>
                  <label className={`admin-variant-field ${draft.promotion && !variant.isDecant ? "locked-field" : ""}`}><span>{copy.price}</span><input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateDraftVariant(variant.id, { price: event.target.value })} disabled={draft.promotion && !variant.isDecant} required /></label>
                  <label className="admin-stock-quantity"><span>{copy.stockQuantity}</span><input type="number" min="0" step="1" value={variant.stock} placeholder={copy.stockUndefined} onChange={(event) => updateDraftVariant(variant.id, { stock: event.target.value, soldout: event.target.value === "0" ? true : variant.soldout })} /></label>
                  <label className="admin-stock-soldout">
                    <input className="variant-soldout-input" type="checkbox" checked={variant.soldout} onChange={(event) => updateDraftVariant(variant.id, { soldout: event.target.checked })} />
                    <i><Check size={13} /></i>
                    <b>{copy.variantSoldOut}</b>
                  </label>
                  <button className="admin-variant-remove" type="button" onClick={() => removeDraftVariant(variant.id)} aria-label={lang === "pt" ? `Remover ${variant.volume}` : `Remove ${variant.volume}`}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <div className="admin-variant-actions">
              <button className="ghost-button" type="button" onClick={() => addDraftVariant(false)}><Plus size={15} />{lang === "pt" ? "Adicionar tamanho" : "Add size"}</button>
              {draft.category !== "Outros produtos" && <button className="ghost-button" type="button" onClick={() => addDraftVariant(true)}><Plus size={15} />{lang === "pt" ? "Adicionar decant" : "Add decant"}</button>}
            </div>
          </section>
          <label className="field"><span>{copy.scentProfile}</span><select value={draft.scentProfile} onChange={(event) => setDraft({ ...draft, scentProfile: event.target.value as ScentProfile })}>{SCENT_PROFILES.map((profile) => <option key={profile} value={profile}>{SCENT_PROFILE_LABELS[lang][profile]}</option>)}</select></label>
          <label className="promotion-toggle best-seller-toggle">
            <input type="checkbox" checked={draft.bestSeller} onChange={(event) => setDraft({ ...draft, bestSeller: event.target.checked })} />
            <span><Check size={14} />{copy.bestSellerToggle}</span>
          </label>
          <label className="promotion-toggle best-seller-toggle">
            <input type="checkbox" checked={draft.isNew} onChange={(event) => setDraft({ ...draft, isNew: event.target.checked })} />
            <span><Check size={14} />{copy.newToggle}</span>
          </label>
          <button className="primary-button" type="submit" disabled={adminBusy}><Save size={16} />{adminBusy ? (uploadProgress || (lang === "pt" ? "A guardar..." : "Saving...")) : copy.save}</button>
          <button className="admin-cancel" type="button" disabled={adminBusy} onClick={resetEditor}>{copy.cancel}</button>
          </form>
        </>
      )}

      {couponOpen && (
        <>
          <button className="modal-backdrop" onClick={() => setCouponOpen(false)} aria-label={copy.cancel} />
          <section className="coupon-manager" role="dialog" aria-modal="true" aria-labelledby="coupon-manager-title">
            <header>
              <div><TicketPercent size={20} /><div><span className="eyebrow">Mystic Essence Admin</span><h2 id="coupon-manager-title">{copy.couponTitle}</h2></div></div>
              <button type="button" onClick={() => setCouponOpen(false)} aria-label={copy.cancel}><X size={20} /></button>
            </header>
            <form className="coupon-create-form" onSubmit={createCoupon}>
              <label className="field"><span>{copy.couponCode}</span><input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="MYSTIC10" maxLength={30} required /></label>
              <label className="field"><span>{copy.couponDiscount}</span><input type="number" min="1" max="95" step="1" value={couponDiscount} onChange={(event) => setCouponDiscount(event.target.value)} required /></label>
              <button className="primary-button" type="submit"><Plus size={17} />{copy.couponCreate}</button>
            </form>
            {couponError && <p className="auth-error" role="alert">{couponError}</p>}
            <div className="coupon-list">
              {coupons.length === 0 ? <p>{copy.couponEmpty}</p> : coupons.map((coupon) => (
                <article key={coupon.code}>
                  <div><strong>{coupon.code}</strong><span>{coupon.discount}% {lang === "pt" ? "de desconto" : "off"}</span></div>
                  <button type="button" onClick={() => void deleteCoupon(coupon.code)} aria-label={`${copy.couponRemove} ${coupon.code}`} title={copy.couponRemove}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {influencersOpen && <InfluencerManager lang={lang} profiles={profiles} coupons={coupons} onClose={() => setInfluencersOpen(false)} />}

      <section className="admin-orders">
        <header className="admin-orders-heading">
          <div>{showArchive ? <Archive size={21} /> : <ClipboardList size={21} />}<div><h2>{showArchive ? copy.archiveTitle : copy.ordersTitle}</h2><p>{showArchive ? copy.archiveSub : copy.ordersSub}</p></div></div>
          <div className="admin-orders-actions">
            <span>{visibleOrders.length}</span>
            <button type="button" onClick={() => setShowArchive((current) => !current)}>
              {showArchive ? <ClipboardList size={16} /> : <Archive size={16} />}
              {showArchive ? copy.backToOrders : copy.archive}
            </button>
          </div>
        </header>

        {visibleOrders.length === 0 ? (
          <div className="admin-orders-empty">
            {showArchive ? <Archive size={28} /> : <ClipboardList size={28} />}
            <strong>{showArchive ? copy.noArchive : copy.noOrders}</strong>
            <p>{showArchive ? copy.noArchiveText : copy.noOrdersText}</p>
          </div>
        ) : (
          <div className="admin-order-list">
            {visibleOrders.map((order) => (
              <article className="admin-order-card" key={order.id}>
                <header className="admin-order-header">
                  <div>
                    <span className="admin-order-id">{order.id}</span>
                    <time dateTime={order.createdAt}>{new Intl.DateTimeFormat(lang === "pt" ? "pt-PT" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</time>
                  </div>
                  <strong>{price(order.total, lang)}</strong>
                  <div className="admin-order-controls">
                    {showArchive ? (
                      <>
                        <span className="admin-archived-status"><Check size={15} />{copy.statuses.delivered}</span>
                        <button className="admin-restore-order" type="button" onClick={() => changeOrder(order.id, { archived: false })}><ArchiveRestore size={15} />{copy.restoreOrder}</button>
                      </>
                    ) : (
                      <>
                        <label className="admin-order-status">
                          <span>{copy.orderStatus}</span>
                          <select value={pendingStatuses[order.id] ?? order.status} onChange={(event) => selectOrderStatus(order, event.target.value as OrderStatus)}>
                            {(Object.keys(copy.statuses) as OrderStatus[]).map((status) => <option value={status} key={status}>{copy.statuses[status]}</option>)}
                          </select>
                        </label>
                        {(pendingStatuses[order.id] ?? order.status) === "shipped" && (
                          <div className="admin-tracking-form">
                            <input value={trackingDrafts[order.id] ?? order.trackingNumber ?? ""} onChange={(event) => setTrackingDrafts((items) => ({ ...items, [order.id]: event.target.value }))} placeholder={copy.tracking} aria-label={copy.tracking} />
                            <button type="button" onClick={() => confirmShipment(order)} disabled={!(trackingDrafts[order.id] ?? order.trackingNumber ?? "").trim()}><Truck size={15} />{copy.confirmTracking}</button>
                          </div>
                        )}
                        {order.status === "delivered" && <button className="admin-archive-order" type="button" onClick={() => changeOrder(order.id, { archived: true })}><Check size={16} />{copy.archiveOrder}</button>}
                      </>
                    )}
                  </div>
                </header>

                <div className="admin-order-details">
                  <section>
                    <h3>{copy.customer}</h3>
                    <p><User size={15} /><strong>{order.customer.name}</strong></p>
                    <p><Mail size={15} /><a href={`mailto:${order.customer.email}`}>{order.customer.email}</a></p>
                    <p><Phone size={15} /><a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></p>
                  </section>
                  <section>
                    <h3>{copy.delivery}</h3>
                    <p className="admin-address"><MapPin size={15} /><span>{order.customer.address}<br />{order.customer.postal} {order.customer.city}</span></p>
                  </section>
                  <section>
                    <h3>{copy.payment}</h3>
                    <p><CreditCard size={15} /><strong>{paymentMethodLabel(order.paymentMethod || order.payment)}</strong></p>
                    <div className="admin-order-totals">
                      <span>{lang === "pt" ? "Subtotal" : "Subtotal"}<strong>{price(order.subtotal, lang)}</strong></span>
                      {Boolean(order.discountAmount) && <span className="admin-order-discount">{lang === "pt" ? `Cupão ${order.couponCode}` : `Coupon ${order.couponCode}`}<strong>-{price(order.discountAmount ?? 0, lang)}</strong></span>}
                      <span>{lang === "pt" ? "Envio" : "Shipping"}<strong>{order.shipping === 0 ? (lang === "pt" ? "Grátis" : "Free") : price(order.shipping, lang)}</strong></span>
                    </div>
                  </section>
                </div>

                <div className="admin-order-products">
                  <h3>{copy.items}</h3>
                  {order.items.map((item) => (
                    <div key={item.id}><span>{item.qty} × {item.name[lang]} <small>{item.volume}</small></span><strong>{price(item.price * item.qty, lang)}</strong></div>
                  ))}
                </div>

                {order.customer.notes && <div className="admin-order-notes"><strong>{copy.notes}</strong><p>{order.customer.notes}</p></div>}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function InfluencerManager({
  lang,
  profiles,
  coupons,
  onClose,
}: {
  lang: Lang;
  profiles: CustomerProfile[];
  coupons: Coupon[];
  onClose: () => void;
}) {
  type InfluencerDraft = { isInfluencer: boolean; couponCode: string };
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, InfluencerDraft>>({});
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProfiles = profiles.filter((profile) => !normalizedQuery || `${profile.name ?? ""} ${profile.email}`.toLowerCase().includes(normalizedQuery));
  const getDraft = (profile: CustomerProfile): InfluencerDraft => drafts[profile.uid] ?? {
    isInfluencer: profile.isInfluencer === true,
    couponCode: profile.influencerCouponCode ?? "",
  };

  function updateDraft(profile: CustomerProfile, changes: Partial<InfluencerDraft>) {
    setDrafts((current) => ({ ...current, [profile.uid]: { ...getDraft(profile), ...changes } }));
    setMessage("");
  }

  async function saveProfile(profile: CustomerProfile) {
    const draft = getDraft(profile);
    if (draft.isInfluencer && !draft.couponCode) {
      setMessage(lang === "pt" ? "Escolha um cupão antes de guardar." : "Choose a coupon before saving.");
      return;
    }
    setSavingUid(profile.uid);
    setMessage("");
    try {
      await setInfluencerAccount({ uid: profile.uid, isInfluencer: draft.isInfluencer, couponCode: draft.isInfluencer ? draft.couponCode : null });
      setMessage(lang === "pt" ? `Conta ${profile.email} atualizada.` : `${profile.email} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (lang === "pt" ? "Não foi possível atualizar a conta." : "Could not update the account."));
    } finally {
      setSavingUid(null);
    }
  }

  return <>
    <button className="modal-backdrop" onClick={onClose} aria-label={lang === "pt" ? "Fechar" : "Close"} />
    <section className="influencer-manager" role="dialog" aria-modal="true" aria-labelledby="influencer-manager-title">
      <header><div><User size={21} /><div><span className="eyebrow">Mystic Essence Admin</span><h2 id="influencer-manager-title">{lang === "pt" ? "Gerir influencers" : "Manage influencers"}</h2></div></div><button type="button" onClick={onClose} aria-label={lang === "pt" ? "Fechar" : "Close"}><X size={20} /></button></header>
      <div className="influencer-manager-search"><Search size={18} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "pt" ? "Pesquisar por nome ou email" : "Search by name or email"} /></div>
      <p className="influencer-manager-help">{lang === "pt" ? "Associe um cupão exclusivo a cada influencer. Apenas pagamentos confirmados geram comissão." : "Assign an exclusive coupon to each influencer. Only confirmed payments generate commission."}</p>
      {message && <p className="influencer-manager-message" role="status">{message}</p>}
      <div className="influencer-profile-list">
        {visibleProfiles.length === 0 ? <div className="account-empty-state"><User size={24} /><strong>{lang === "pt" ? "Nenhuma conta encontrada" : "No accounts found"}</strong></div> : visibleProfiles.map((profile) => {
          const draft = getDraft(profile);
          return <article className={draft.isInfluencer ? "is-influencer" : ""} key={profile.uid}>
            <div className="influencer-profile-identity"><span>{(profile.name || profile.email).slice(0, 1).toUpperCase()}</span><div><strong>{profile.name || (lang === "pt" ? "Conta sem nome" : "Unnamed account")}</strong><small>{profile.email}</small></div></div>
            <label className="influencer-toggle"><input type="checkbox" checked={draft.isInfluencer} onChange={(event) => updateDraft(profile, { isInfluencer: event.target.checked, couponCode: event.target.checked ? draft.couponCode : "" })} /><i><Check size={13} /></i><b>{lang === "pt" ? "É influencer?" : "Is influencer?"}</b></label>
            {draft.isInfluencer && <label className="field influencer-coupon-select"><span>{lang === "pt" ? "Cupão associado" : "Assigned coupon"}</span><select value={draft.couponCode} onChange={(event) => updateDraft(profile, { couponCode: event.target.value })} required><option value="">{lang === "pt" ? "Selecionar cupão" : "Select coupon"}</option>{coupons.map((coupon) => <option key={coupon.code} value={coupon.code} disabled={Boolean(coupon.influencerUid && coupon.influencerUid !== profile.uid)}>{coupon.code} · {coupon.discount}%{coupon.influencerUid && coupon.influencerUid !== profile.uid ? (lang === "pt" ? " (já associado)" : " (assigned)") : ""}</option>)}</select></label>}
            <button className="ghost-button influencer-save" type="button" onClick={() => void saveProfile(profile)} disabled={savingUid === profile.uid || (draft.isInfluencer && !draft.couponCode)}><Save size={15} />{savingUid === profile.uid ? (lang === "pt" ? "A guardar..." : "Saving...") : (lang === "pt" ? "Guardar" : "Save")}</button>
          </article>;
        })}
      </div>
    </section>
  </>;
}

function CheckoutPage({
  t,
  lang,
  cart,
  coupons,
  onCheckoutStarted,
  onBack,
}: {
  t: (typeof COPY)[Lang];
  lang: Lang;
  cart: CartItem[];
  coupons: Coupon[];
  onCheckoutStarted: () => void;
  onBack: () => void;
}) {
  const [payment, setPayment] = useState<PaymentMethod>("mbway");
  const [billingSameAsContact, setBillingSameAsContact] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<Order | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<IfthenpayCheckoutResult | null>(null);
  const [paymentReturn] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("payment");
    const orderId = params.get("order");
    return status && orderId ? { status, orderId } : null;
  });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const { blockedSizes, ready: decantsReady, error: decantsError } = useDecantAvailability();
  const cartDecants = cart.map((item) => item.variants.find((variant) => variant.volume === item.volume)).filter((variant) => variant?.isDecant);
  const blockedDecantInCart = cartDecants.some((variant) => isDecantBlocked(variant, blockedSizes));
  const decantCheckoutBlocked = cartDecants.length > 0 && (!decantsReady || Boolean(decantsError) || blockedDecantInCart);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Pick<Coupon, "code" | "discount"> | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [shippingZone, setShippingZone] = useState<ShippingZone>("continental");
  const { settings: shippingSettings, ready: shippingReady, error: shippingError, previewChanged } = useShippingSettings();
  const [carrierSelection, setCarrierSelection] = useState<Partial<Record<ShippingZone, string>>>({});
  const carriers = shippingSettings[shippingZone].carriers;
  const selectedCarrier = carriers.find((carrier) => carrier.id === carrierSelection[shippingZone]) ?? carriers[0];
  const shippingBlocked = !shippingReady || Boolean(shippingError) || !selectedCarrier || (firebaseEnabled && previewChanged);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shipping = selectedCarrier && subtotal > 0 ? getShippingCost(subtotal, shippingZone, shippingSettings, selectedCarrier.id) : 0;
  const discountAmount = appliedCoupon ? Math.round(subtotal * appliedCoupon.discount) / 100 : 0;
  const total = Math.round((subtotal - discountAmount + shipping) * 100) / 100;
  const copy = t.checkoutPage;

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    setCouponMessage("");
    setAppliedCoupon(null);
    if (!code) return;
    const localCoupon = coupons.find((coupon) => coupon.code === code);
    if (localCoupon) {
      setAppliedCoupon({ code: localCoupon.code, discount: localCoupon.discount });
      setCouponMessage(`${copy.promoApplied}: ${localCoupon.discount}%`);
      return;
    }
    if (!firebaseEnabled) {
      setCouponMessage(copy.promoInvalid);
      return;
    }
    setCouponBusy(true);
    try {
      const coupon = await validateCoupon(code);
      setAppliedCoupon(coupon);
      setCouponMessage(`${copy.promoApplied}: ${coupon.discount}%`);
    } catch {
      setCouponMessage(copy.promoInvalid);
    } finally {
      setCouponBusy(false);
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shippingBlocked || decantCheckoutBlocked || !selectedCarrier || checkoutBusy || cart.length === 0) return;
    const form = new FormData(event.currentTarget);
    const createdAt = new Date().toISOString();
    const customerName = String(form.get("name") ?? "").trim();
    const customerTaxId = String(form.get("taxId") ?? "").trim();
    const deliveryAddress = String(form.get("address") ?? "").trim();
    const deliveryPostal = String(form.get("postal") ?? "").trim();
    const deliveryCity = String(form.get("city") ?? "").trim();
    const order: Order = {
      id: `ME-${createdAt.replace(/\D/g, "").slice(-8)}`,
      createdAt,
      customer: {
        name: customerName,
        email: String(form.get("email") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
        address: deliveryAddress,
        postal: deliveryPostal,
        city: deliveryCity,
        taxId: customerTaxId,
        notes: String(form.get("notes") ?? "").trim(),
      },
      billing: billingSameAsContact
        ? {
            sameAsContact: true,
            name: customerName,
            address: [deliveryAddress, deliveryPostal, deliveryCity].filter(Boolean).join(", "),
            taxId: customerTaxId,
          }
        : {
            sameAsContact: false,
            name: String(form.get("billingName") ?? "").trim(),
            address: String(form.get("billingAddress") ?? "").trim(),
            taxId: String(form.get("billingTaxId") ?? "").trim(),
          },
      items: cart.map((item) => ({ id: item.id, name: item.name, brand: item.brand, volume: item.volume, price: item.price, qty: item.qty, imageUrl: item.imageUrl })),
      subtotal,
      shipping,
      shippingZone,
      shippingCarrierId: selectedCarrier.id,
      shippingCarrierName: selectedCarrier.name,
      shippingDescription: selectedCarrier.description,
      couponCode: appliedCoupon?.code,
      discount: appliedCoupon?.discount,
      discountAmount,
      total,
      payment,
      status: "received",
      archived: false,
    };
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      if (firebaseEnabled && paymentsEnabled) {
        const payload = {
          lang,
          paymentMethod: payment,
          customer: order.customer,
          billing: order.billing,
          shippingZone,
          shippingCarrierId: selectedCarrier.id,
          expectedShipping: shipping,
          couponCode: appliedCoupon?.code,
          items: cart.map((item) => ({ productId: item.id, volume: item.volume, quantity: item.qty })),
        };
        const result = await createCheckout(payload);
        const pendingOrder = { ...order, id: result.orderId, paymentMethod: result.method, paymentStatus: result.paymentStatus };
        onCheckoutStarted();
        if (result.paymentUrl) {
          window.location.assign(result.paymentUrl);
          return;
        }
        setCheckoutResult(result);
        setSubmittedOrder(pendingOrder);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      throw new Error(lang === "pt" ? "Os pagamentos não estão disponíveis. Nenhuma encomenda foi criada." : "Payments are unavailable. No order was created.");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : (lang === "pt" ? "Não foi possível iniciar o pagamento." : "Could not start payment."));
    } finally {
      setCheckoutBusy(false);
    }
  }

  if (paymentReturn) {
    const successful = paymentReturn.status === "success";
    return (
      <section className={`checkout-success ${successful ? "" : "payment-return-warning"}`}>
        {successful ? <BadgeCheck size={52} /> : <CreditCard size={52} />}
        <span className="eyebrow">IFTHENPAY · Mystic Essence</span>
        <h1>{successful ? (lang === "pt" ? "Pagamento em validação" : "Payment being verified") : (lang === "pt" ? "Pagamento não concluído" : "Payment not completed")}</h1>
        <p>{successful
          ? (lang === "pt" ? "Estamos a confirmar o pagamento. Receberá um email assim que a encomenda ficar confirmada." : "We are confirming your payment. You will receive an email as soon as the order is confirmed.")
          : (lang === "pt" ? "O pagamento foi cancelado ou não pôde ser concluído. Não foi feita uma nova cobrança." : "The payment was cancelled or could not be completed. No new charge was made.")}</p>
        <span className="success-reference">{lang === "pt" ? "Encomenda" : "Order"}: {paymentReturn.orderId}</span>
        <button className="primary-button" onClick={onBack}>{copy.continue}</button>
      </section>
    );
  }

  if (submittedOrder) {
    const instruction = checkoutResult?.method === "mbway"
      ? checkoutResult.message
      : checkoutResult?.method === "multibanco"
        ? (lang === "pt" ? "Use os dados abaixo no Multibanco ou no homebanking. A encomenda será confirmada automaticamente após o pagamento." : "Use the details below at an ATM or in online banking. The order will be confirmed automatically after payment.")
        : checkoutResult?.method === "payshop"
          ? (lang === "pt" ? "Apresente esta referência num agente Payshop. A encomenda será confirmada automaticamente após o pagamento." : "Present this reference at a Payshop agent. The order will be confirmed automatically after payment.")
          : copy.successText;
    return (
      <section className="checkout-success">
        <BadgeCheck size={52} />
        <span className="eyebrow">IFTHENPAY · Mystic Essence</span>
        <h1>
          {checkoutResult?.method === "mbway"
            ? (lang === "pt" ? "Confirme no MB WAY" : "Confirm in MB WAY")
            : (lang === "pt" ? "Pagamento pendente" : "Payment pending")}
        </h1>
        <p>{instruction}</p>
        <div className="ifthenpay-instructions">
          <span><small>{lang === "pt" ? "Encomenda" : "Order"}</small><strong>{submittedOrder.id}</strong></span>
          {checkoutResult?.entity && <span><small>{lang === "pt" ? "Entidade" : "Entity"}</small><strong>{checkoutResult.entity}</strong></span>}
          {checkoutResult?.reference && <span><small>{lang === "pt" ? "Referência" : "Reference"}</small><strong>{checkoutResult.reference}</strong></span>}
        </div>
        <div className="success-total"><span>{copy.total}</span><strong>{price(submittedOrder.total, lang)}</strong></div>
        <button className="primary-button" onClick={onBack}>{copy.continue}</button>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <button className="checkout-back" onClick={onBack}><ArrowLeft size={17} />{copy.back}</button>
      <header className="checkout-heading">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
      </header>

      <form className="checkout-layout" onSubmit={submitOrder}>
        <div className="checkout-form">
          <section className="checkout-section">
            <h2>{copy.contactTitle}</h2>
            <div className="form-grid">
              <label className="field full"><span>{copy.name}</span><input name="name" autoComplete="name" required /></label>
              <label className="field"><span>{copy.email}</span><input name="email" type="email" autoComplete="email" required /></label>
              <label className="field"><span>{copy.phone}</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" required /></label>
              <label className="field full"><span>{copy.taxId}</span><input name="taxId" inputMode="numeric" autoComplete="off" maxLength={9} pattern="[0-9]{9}" /></label>
            </div>
            <label className="billing-match">
              <input
                type="checkbox"
                checked={billingSameAsContact}
                onChange={(event) => setBillingSameAsContact(event.target.checked)}
              />
              <span aria-hidden="true"><Check size={14} /></span>
              <strong>{copy.sameBilling}</strong>
            </label>
          </section>

          {!billingSameAsContact && (
            <section className="checkout-section billing-section">
              <h2>{copy.billingTitle}</h2>
              <div className="form-grid">
                <label className="field full"><span>{copy.billingName}</span><input name="billingName" autoComplete="billing name" required /></label>
                <label className="field full"><span>{copy.billingAddress}</span><input name="billingAddress" autoComplete="billing street-address" required /></label>
                <label className="field full"><span>{copy.billingTaxId}</span><input name="billingTaxId" inputMode="numeric" autoComplete="off" maxLength={9} pattern="[0-9]{9}" required /></label>
              </div>
            </section>
          )}

          <section className="checkout-section">
            <h2>{copy.deliveryTitle}</h2>
            <div className="form-grid">
              <label className="field full"><span>{copy.address}</span><input name="address" autoComplete="street-address" required /></label>
              <label className="field"><span>{copy.postal}</span><input name="postal" inputMode="numeric" autoComplete="postal-code" placeholder="4520-248" required /></label>
              <label className="field"><span>{copy.city}</span><input name="city" autoComplete="address-level2" required /></label>
              <div className="field full">
                <span>{copy.shippingZone}</span>
                <div className="shipping-zone-options">
                  {SHIPPING_ZONE_IDS.map((zone) => (
                    <button
                      type="button"
                      className={shippingZone === zone ? "active" : ""}
                      onClick={() => setShippingZone(zone)}
                      aria-pressed={shippingZone === zone}
                      key={zone}
                    >
                      <strong>{copy.shippingZones[zone]}</strong>
                      <small>{lang === "pt" ? "Grátis a partir de" : "Free from"} {price(shippingSettings[zone].freeFrom, lang)}</small>
                    </button>
                  ))}
                </div>
              </div>
              <fieldset className="checkout-carriers field full">
                <legend>{lang === "pt" ? "Transportadora" : "Carrier"}</legend>
                {carriers.map((carrier) => <label className={`checkout-carrier ${selectedCarrier?.id === carrier.id ? "selected" : ""}`} key={carrier.id}>
                  <input type="radio" name="shippingCarrier" value={carrier.id} checked={selectedCarrier?.id === carrier.id} onChange={() => setCarrierSelection((current) => ({ ...current, [shippingZone]: carrier.id }))} />
                  <span><strong>{carrier.name === "Envio standard" && lang === "en" ? "Standard shipping" : carrier.name}</strong>{carrier.description && <small>{carrier.description}</small>}</span>
                  <b>{getShippingCost(subtotal, shippingZone, shippingSettings, carrier.id) === 0 ? copy.free : price(carrier.price, lang)}</b>
                </label>)}
                {!selectedCarrier && <p role="status">{lang === "pt" ? "Entregas indisponíveis nesta zona." : "Delivery is unavailable in this zone."}</p>}
              </fieldset>
              <label className="field full"><span>{copy.notes}</span><textarea name="notes" rows={3} /></label>
            </div>
          </section>

          <section className="checkout-section payment-section">
            <h2>{copy.paymentTitle}</h2>
            <div className="payment-options" role="radiogroup" aria-label={copy.paymentTitle}>
              <button type="button" className={payment === "mbway" ? "active" : ""} onClick={() => setPayment("mbway")} aria-pressed={payment === "mbway"}>
                <Smartphone size={20} /><span><strong>MB WAY</strong><small>{lang === "pt" ? "Pagamento pelo telemóvel" : "Mobile payment"}</small></span>
              </button>
              <button type="button" className={payment === "multibanco" ? "active" : ""} onClick={() => setPayment("multibanco")} aria-pressed={payment === "multibanco"}>
                <Landmark size={20} /><span><strong>Multibanco</strong><small>{lang === "pt" ? "Entidade e referência" : "Entity and reference"}</small></span>
              </button>
              <button type="button" className={payment === "payshop" ? "active" : ""} onClick={() => setPayment("payshop")} aria-pressed={payment === "payshop"}>
                <ReceiptText size={20} /><span><strong>Payshop</strong><small>{lang === "pt" ? "Referência para pagamento" : "Payment reference"}</small></span>
              </button>
              <button type="button" className={payment === "card" ? "active" : ""} onClick={() => setPayment("card")} aria-pressed={payment === "card"}>
                <CreditCard size={20} /><span><strong>Visa / Mastercard</strong><small>{lang === "pt" ? "Cartão de crédito ou débito" : "Credit or debit card"}</small></span>
              </button>
            </div>

            <p className="payment-note"><LockKeyhole size={16} />{paymentsEnabled
              ? (lang === "pt"
                  ? "Pagamento seguro processado pela IFTHENPAY. Os dados do cartão nunca são recebidos pela Mystic Essence."
                  : "Secure payment processed by IFTHENPAY. Mystic Essence never receives your card details.")
              : (lang === "pt"
                  ? "A encomenda será registada como pendente. Não será efetuado qualquer pagamento durante esta fase de testes."
                  : "The order will be registered as pending. No payment will be taken during this testing phase.")}</p>
          </section>
        </div>

        <aside className="order-summary">
          <h2>{copy.order}</h2>
          <div className="checkout-items">
            {cart.map((item) => (
              <div className="checkout-item" key={item.id}>
                <ProductVisual product={item} compact />
                <div><strong>{item.name[lang]}</strong><span>{item.volume} · {t.qty}: {item.qty}</span></div>
                <b>{price(item.price * item.qty, lang)}</b>
              </div>
            ))}
          </div>
          <div className="checkout-coupon">
            <label htmlFor="checkout-coupon-code">{copy.promoCode}</label>
            <div>
              <input id="checkout-coupon-code" value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void applyCoupon(); } }} placeholder={copy.promoPlaceholder} maxLength={30} autoComplete="off" />
              <button type="button" onClick={() => void applyCoupon()} disabled={couponBusy || !couponInput.trim()}>{couponBusy ? "..." : copy.promoApply}</button>
            </div>
            {couponMessage && <p className={appliedCoupon ? "valid" : "invalid"}>{appliedCoupon && <Check size={14} />}{couponMessage}</p>}
          </div>
          <div className="summary-lines">
            <p><span>{t.subtotal}</span><strong>{price(subtotal, lang)}</strong></p>
            {appliedCoupon && <p className="summary-discount"><span>{copy.discount} ({appliedCoupon.code})</span><strong>-{price(discountAmount, lang)}</strong></p>}
            <p><span>{copy.shippingZone}</span><strong>{copy.shippingZones[shippingZone]}</strong></p>
            {selectedCarrier && <p><span>{lang === "pt" ? "Transportadora" : "Carrier"}</span><strong>{selectedCarrier.name}</strong></p>}
            <p><span>{copy.shipping}</span><strong>{!selectedCarrier ? (lang === "pt" ? "Indisponível" : "Unavailable") : shipping === 0 ? copy.free : price(shipping, lang)}</strong></p>
            <p className="summary-total"><span>{copy.total}</span><strong>{price(total, lang)}</strong></p>
          </div>
          <label className="checkout-legal-acceptance">
            <input type="checkbox" required />
            <strong>
              {lang === "pt" ? "Li e aceito os " : "I have read and accept the "}
              <a href={LEGAL_PATHS.terms} target="_blank" rel="noreferrer">{lang === "pt" ? "Termos e Condições" : "Terms and Conditions"}</a>
              {lang === "pt" ? " e a " : " and the "}
              <a href={LEGAL_PATHS.privacy} target="_blank" rel="noreferrer">{lang === "pt" ? "Política de Privacidade" : "Privacy Policy"}</a>.
            </strong>
          </label>
          {checkoutError && <p className="auth-error" role="alert">{checkoutError}</p>}
          {decantCheckoutBlocked && <p className="auth-error" role="alert">{blockedDecantInCart ? (lang === "pt" ? "Um tamanho de decant no carrinho está esgotado. Retire-o antes de continuar." : "A decant size in your cart is sold out. Remove it before continuing.") : (lang === "pt" ? "A aguardar confirmação da disponibilidade dos decants." : "Waiting for decant availability confirmation.")}</p>}
          {shippingError && <p className="auth-error" role="alert">{shippingError}</p>}
          {firebaseEnabled && previewChanged && <p className="shipping-settings-notice" role="status">{lang === "pt" ? "Portes em teste local. Para evitar cobranças com valores diferentes, o pagamento fica indisponível até publicar estas configurações no servidor." : "Shipping rates are in local preview. Payment is unavailable until these settings are published to the server, to prevent a different charge."}</p>}
          <button className="primary-button checkout-submit" type="submit" disabled={cart.length === 0 || checkoutBusy || shippingBlocked || decantCheckoutBlocked}>{checkoutBusy ? (paymentsEnabled ? (lang === "pt" ? "A abrir pagamento..." : "Opening payment...") : (lang === "pt" ? "A confirmar pedido..." : "Confirming order...")) : copy.confirm}</button>
          <p className="secure-note"><LockKeyhole size={14} />{copy.secure}</p>
        </aside>
      </form>
    </section>
  );
}

function CartDrawer({
  t,
  lang,
  open,
  cart,
  onClose,
  onUpdate,
  onRemove,
  onCheckout,
}: {
  t: (typeof COPY)[Lang];
  lang: Lang;
  open: boolean;
  cart: CartItem[];
  onClose: () => void;
  onUpdate: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
}) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  return (
    <>
      <button className={`drawer-backdrop ${open ? "visible" : ""}`} onClick={onClose} aria-label="Close cart backdrop" />
      <aside className={`cart-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <header>
          <h2>{t.cart}</h2>
          <button onClick={onClose} aria-label="Close cart"><X size={22} /></button>
        </header>
        {cart.length === 0 ? (
          <div className="empty-cart">
            <ShoppingBag size={34} />
            <p>{t.empty}</p>
            <span>{t.emptySub}</span>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => {
                const availableStock = typeof item.variants[0]?.stock === "number" ? Math.max(0, item.variants[0].stock) : MAX_ORDER_QUANTITY;
                const maximumQuantity = Math.min(MAX_ORDER_QUANTITY, availableStock);
                return (
                <article key={item.id} className="cart-item">
                  <ProductVisual product={item} compact />
                  <div>
                    <strong>{item.name[lang]}</strong>
                    <span>{item.volume} · {price(item.price, lang)}</span>
                    <div className="cart-line">
                      <div className="qty-control small">
                        <button onClick={() => onUpdate(item.id, Math.max(1, item.qty - 1))}><Minus size={13} /></button>
                        <span>{item.qty}</span>
                        <button disabled={item.qty >= maximumQuantity} onClick={() => onUpdate(item.id, Math.min(maximumQuantity, item.qty + 1))}><Plus size={13} /></button>
                      </div>
                      <button className="remove-button" onClick={() => onRemove(item.id)}>{t.remove}</button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
            <footer>
              <p><span>{t.subtotal}</span><strong>{price(subtotal, lang)}</strong></p>
              <button className="primary-button" onClick={onCheckout}>{t.checkout}</button>
              <small>{t.mockOnly}</small>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}

function LegalPage({ kind, onLegal, onHome }: { kind: LegalKind; onLegal: (kind: LegalKind) => void; onHome: () => void }) {
  const document = LEGAL_DOCUMENTS[kind];
  const tabs: { kind: LegalKind; label: string }[] = [
    { kind: "terms", label: "Termos e Condições" },
    { kind: "privacy", label: "Privacidade" },
    { kind: "cookies", label: "Cookies" },
    { kind: "returns", label: "Devoluções" },
  ];

  return (
    <section className="legal-page">
      <div className="legal-heading">
        <button type="button" onClick={onHome}><ArrowLeft size={17} />Voltar à loja</button>
        <span className="eyebrow">{document.eyebrow}</span>
        <h1>{document.title}</h1>
        <p>{document.intro}</p>
        <time>Última atualização: {document.updated}</time>
      </div>
      <nav className="legal-tabs" aria-label="Documentos legais">
        {tabs.map((tab) => (
          <button type="button" key={tab.kind} className={kind === tab.kind ? "active" : ""} onClick={() => onLegal(tab.kind)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <article className="legal-document">
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
            )}
          </section>
        ))}
      </article>
      <aside className="legal-help">
        <ShieldCheck size={21} />
        <div><strong>Precisa de esclarecimentos?</strong><p>Contacte-nos através de mystic.essence@hotmail.com ou +351 938 258 798.</p></div>
      </aside>
    </section>
  );
}

function CookieConsent({
  choice,
  onAccept,
  onReject,
  onCookies,
  onPrivacy,
}: {
  choice: "accepted" | "rejected" | null;
  onAccept: () => void;
  onReject: () => void;
  onCookies: () => void;
  onPrivacy: () => void;
}) {
  return (
    <div className="cookie-consent" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
      <div className="cookie-consent-icon"><Cookie size={23} /></div>
      <div className="cookie-consent-copy">
        <span>Privacidade sob controlo</span>
        <h2 id="cookie-title">A sua escolha de cookies</h2>
        <p>Utilizamos tecnologias necessárias para manter a conta, proteger o site e guardar esta escolha. Atualmente não utilizamos cookies de publicidade ou analítica.</p>
        <div className="cookie-consent-links">
          <button type="button" onClick={onCookies}>Consultar Política de Cookies</button>
          <button type="button" onClick={onPrivacy}>Política de Privacidade</button>
        </div>
      </div>
      <div className="cookie-consent-actions">
        <button type="button" onClick={onReject}>Rejeitar opcionais</button>
        <button type="button" onClick={onAccept}>Aceitar opcionais</button>
        {choice && <small>Escolha atual: {choice === "accepted" ? "aceite" : "rejeitada"}</small>}
      </div>
    </div>
  );
}

function Footer({ t, onLegal, onCookies }: { t: (typeof COPY)[Lang]; onLegal: (kind: LegalKind) => void; onCookies: () => void }) {
  const legalLink = (kind: LegalKind, label: string) => (
    <a href={LEGAL_PATHS[kind]} onClick={(event) => { event.preventDefault(); onLegal(kind); }}><span>{label}</span><ChevronRight size={16} /></a>
  );
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-signature">
          <Image src="/mystic-essence-logo.png" width={174} height={174} alt="Mystic Essence" />
          <div className="footer-signature-copy">
            <span>Mystic Essence</span>
            <h2>{t.footerTag}</h2>
            <p>{t.address}</p>
          </div>
          <div className="socials">
            <a href="https://www.instagram.com/_mystic.essence_/" target="_blank" rel="noreferrer" aria-label="Instagram Mystic Essence"><Camera size={18} /></a>
            <a href="https://www.tiktok.com/@_mystic.essence_" target="_blank" rel="noreferrer" aria-label="TikTok Mystic Essence"><Music2 size={18} /></a>
          </div>
        </div>

        <div className="footer-grid">
          <section className="footer-contact-panel">
            <header><span>{t.contact}</span><h3>Contactos</h3></header>
            <div className="footer-contact-list">
              <div><MapPin size={20} /><p>{t.address}</p></div>
              <a href={`tel:${t.phone.replace(/\s/g, "")}`}><Phone size={20} /><p>{t.phone}</p></a>
              <a href="mailto:mystic.essence@hotmail.com"><Mail size={20} /><p>mystic.essence@hotmail.com</p></a>
              <div><Clock3 size={20} /><p>{t.hours}</p></div>
            </div>
          </section>

          <nav className="footer-legal-panel" aria-label={t.legal}>
            <header><span>{t.legal}</span><h3>Informação legal</h3></header>
            <div className="footer-legal-links">
              {legalLink("terms", "Termos e Condições")}
              {legalLink("privacy", "Política de Privacidade")}
              <div className="footer-cookie-row">
                {legalLink("cookies", "Política de Cookies")}
                <button type="button" className="footer-cookie-button" onClick={onCookies} aria-label="Alterar preferências de cookies" title="Alterar preferências de cookies">
                  <Cookie size={15} />
                </button>
              </div>
              {legalLink("returns", "Devoluções e Reembolsos")}
              <a href="https://www.livroreclamacoes.pt/Inicio/" target="_blank" rel="noreferrer"><span>Livro de Reclamações Eletrónico</span><ChevronRight size={16} /></a>
            </div>
          </nav>
        </div>

        <div className="footer-bottom"><span>© 2026 Mystic Essence.</span><span>{t.rights}</span></div>
      </div>
    </footer>
  );
}
