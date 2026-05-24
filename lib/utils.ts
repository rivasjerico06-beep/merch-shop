import type { CartItem, OrderItem, Product, ProductForm } from "@/lib/types";

export const emptyProductForm: ProductForm = {
  name: "",
  category: "",
  price: "",
  image_url: "",
  description: "",
  stock: "",
  sizes: "",
  slug: "",
  colors: "",
  material: "",
  gender: "Unisex",
  care_instructions: "",
  brand: "",
  sku: "",
  sale_price: "",
  is_active: true,
  is_featured: false,
  is_on_sale: false,
};

export function formatPrice(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getCartProduct(item: CartItem) {
  if (Array.isArray(item.products)) {
    return item.products[0] || null;
  }

  return item.products;
}

export function getOrderItemProduct(item: OrderItem) {
  if (Array.isArray(item.products)) {
    return item.products[0] || null;
  }

  return item.products;
}

export function getDisplayPrice(product: Product) {
  if (product.is_on_sale && product.sale_price) {
    return Number(product.sale_price);
  }

  return Number(product.price || 0);
}

export function isProductInStock(product: Product) {
  return Number(product.stock || 0) > 0;
}

export function hasValidImageUrl(value: string | null | undefined) {
  if (!value) return false;

  const trimmed = value.trim();

  if (!trimmed) return false;
  if (trimmed === "null") return false;
  if (trimmed === "undefined") return false;

  return true;
}

export function normalizePhone(phone: string) {
  return phone.replace(/\s|-/g, "");
}

export function isValidPhilippinePhone(phone: string) {
  const cleaned = normalizePhone(phone);
  return /^09\d{9}$/.test(cleaned) || /^\+639\d{9}$/.test(cleaned);
}

export function getStatusBadgeClass(status: string | null | undefined) {
  if (status === "delivered") return "bg-green-600 text-white";
  if (status === "cancelled") return "bg-red-600 text-white";
  if (status === "shipped") return "bg-blue-600 text-white";
  if (status === "packed") return "bg-violet-600 text-white";
  if (status === "confirmed") return "bg-emerald-600 text-white";
  return "bg-yellow-500 text-black";
}

export const orderTrackingSteps = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
];

export function getTrackingStepIndex(status: string | null | undefined) {
  if (status === "cancelled") return -1;

  const index = orderTrackingSteps.indexOf(status || "pending");
  return index >= 0 ? index : 0;
}

export function formatOrderDate(date: string) {
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatOrderDateTime(date: string) {
  return new Date(date).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildProductPayload(form: ProductForm, imageUrl: string | null) {
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    price: Number(form.price || 0),
    image_url: imageUrl,
    description: form.description.trim() || null,
    stock: Number(form.stock || 0),
    sizes: parseList(form.sizes),
    slug: form.slug.trim() || slugify(form.name),
    colors: parseList(form.colors),
    material: form.material.trim() || null,
    gender: form.gender.trim() || null,
    care_instructions: form.care_instructions.trim() || null,
    brand: form.brand.trim() || null,
    sku: form.sku.trim() || null,
    sale_price:
      form.is_on_sale && form.sale_price ? Number(form.sale_price) : null,
    is_on_sale: form.is_on_sale,
    is_active: form.is_active,
    is_featured: form.is_featured,
  };
}

export function productToForm(product: Product): ProductForm {
  return {
    name: product.name || "",
    category: product.category || "",
    price: String(product.price ?? ""),
    image_url: product.image_url || "",
    description: product.description || "",
    stock: String(product.stock ?? ""),
    sizes: (product.sizes || []).join(", "),
    slug: product.slug || "",
    colors: (product.colors || []).join(", "),
    material: product.material || "",
    gender: product.gender || "Unisex",
    care_instructions: product.care_instructions || "",
    brand: product.brand || "",
    sku: product.sku || "",
    sale_price: product.sale_price ? String(product.sale_price) : "",
    is_active: product.is_active !== false,
    is_featured: product.is_featured === true,
    is_on_sale: product.is_on_sale === true,
  };
}

export function calculateCartTotal(cartItems: CartItem[]) {
  return cartItems.reduce((total, item) => {
    const product = getCartProduct(item);
    const price = Number(product?.price || 0);

    return total + price * Number(item.quantity || 1);
  }, 0);
}

export function calculateCartCount(cartItems: CartItem[]) {
  return cartItems.reduce(
    (total, item) => total + Number(item.quantity || 1),
    0
  );
}

export function calculateOrderTotal(items: OrderItem[]) {
  return items.reduce((total, item) => {
    return total + Number(item.price || 0) * Number(item.quantity || 1);
  }, 0);
}
