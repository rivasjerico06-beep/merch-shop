export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
  description: string | null;
  stock: number | null;
  sizes: string[] | null;
  created_at?: string;
  is_active?: boolean | null;
  is_featured?: boolean | null;
  slug?: string | null;
  colors?: string[] | null;
  material?: string | null;
  gender?: string | null;
  care_instructions?: string | null;
  brand?: string | null;
  sku?: string | null;
  sale_price?: number | null;
  is_on_sale?: boolean | null;
  currency?: string | null;
  short_description?: string | null;
  disclaimer?: string | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  role: string | null;
  profile_photo_url?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type CartItem = {
  id: string;
  user_id: string;
  product_id: string;
  size: string | null;
  quantity: number;
  created_at: string;
  option_id?: string | null;
  option_label?: string | null;
  option_price_delta?: number | null;
  option_quantity?: number | null;
  products:
    | {
        name: string;
        price: number;
        category: string;
        image_url: string | null;
        stock: number | null;
        currency?: string | null;
        sale_price?: number | null;
        is_on_sale?: boolean | null;
      }
    | {
        name: string;
        price: number;
        category: string;
        image_url: string | null;
        stock: number | null;
        currency?: string | null;
        sale_price?: number | null;
        is_on_sale?: boolean | null;
      }[]
    | null;
};
export type OrderItem = {
  id: string;
  order_id: string | null;
  product_id: string | null;
  size: string | null;
  quantity: number | null;
  price: number | null;
  created_at: string;
  option_id?: string | null;
  option_label?: string | null;
  option_price_delta?: number | null;
  option_quantity?: number | null;
  products:
    | {
        name: string;
        category: string;
        price?: number;
        currency?: string | null;
      }
    | {
        name: string;
        category: string;
        price?: number;
        currency?: string | null;
      }[]
    | null;
};

export type Order = {
  id: string;
  user_id: string | null;
  status: string | null;
  total_amount: number | null;
  payment_method: string | null;
  full_name: string | null;
  phone: string | null;
  address?: string | null;
  city: string | null;
  province: string | null;
  postal_code?: string | null;
  agent_id?: string | null;
  agent_referral_code?: string | null;
  agent_name?: string | null;
  created_at: string;
  order_items?: OrderItem[];
};


export type ToastItem = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
};

export type ReceiptItem = {
  name: string;
  category: string;
  size: string | null;
  quantity: number;
  price: number;
  option_label?: string | null;
};

export type Receipt = {
  orderId: string;
  createdAt: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  paymentMethod: string;
  status: string;
  totalAmount: number;
  items: ReceiptItem[];
};

export type ProductForm = {
  name: string;
  category: string;
  price: string;
  image_url: string;
  description: string;
  stock: string;
  sizes: string;
  slug: string;
  colors: string;
  material: string;
  gender: string;
  care_instructions: string;
  brand: string;
  sku: string;
  sale_price: string;
  is_active: boolean;
  is_featured: boolean;
  is_on_sale: boolean;
};

export type SortOption =
  | "newest"
  | "price-low"
  | "price-high"
  | "name-az"
  | "stock-high";

export type AvailabilityFilter = "all" | "in-stock" | "out-of-stock";

export type SaleFilter = "all" | "sale" | "regular";

export const orderStatuses = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];