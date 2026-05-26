"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { CartItem, Profile, Receipt, ToastItem } from "@/lib/types";
import {
  calculateCartCount,
  formatPrice,
  getCartProduct,
  hasValidImageUrl,
  isValidPhilippinePhone,
  normalizePhone,
} from "@/lib/utils";
import { checkoutSchema, getValidationMessage } from "@/lib/validation";

type CheckoutForm = {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  payment_method: string;
};

type ReferralMatch = {
  agent_id: string;
  agent_name: string;
  referral_code: string;
};

type StoredReferral = {
  referralCode: string;
  agentName: string;
  savedAt: number;
  expiresAt: number;
  assistedLeadToken?: string | null;
  isLeadSpecific?: boolean;
};

const REFERRAL_STORAGE_KEY = "merch-agent-referral";
const ASSISTED_LINK_SESSION_KEY = "merch-assisted-lead-referral";

type CustomerCoupon = {
  id: string;
  coupon_code: string;
  discount_percent: number;
  max_discount: number;
  minimum_order_amount: number;
  status: string;
  expires_at: string;
};

type CheckoutRpcResult = {
  order_id: string;
  order_subtotal: number;
  order_discount: number;
  order_total: number;
  applied_coupon_code: string | null;
  applied_agent_referral_code: string | null;
};

const emptyCheckoutForm: CheckoutForm = {
  full_name: "",
  phone: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
  payment_method: "COD",
};

export default function CheckoutPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [checkoutForm, setCheckoutForm] =
    useState<CheckoutForm>(emptyCheckoutForm);
  const [referralCode, setReferralCode] = useState("");
  const [validatedReferral, setValidatedReferral] =
    useState<ReferralMatch | null>(null);
  const [checkingReferral, setCheckingReferral] = useState(false);
  const [assistedLeadToken, setAssistedLeadToken] = useState<string | null>(null);
  const [isLeadSpecificReferral, setIsLeadSpecificReferral] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CustomerCoupon | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const cartCount = useMemo(() => calculateCartCount(cartItems), [cartItems]);

  const getBaseProductPrice = (item: CartItem) => {
    const product = getCartProduct(item);
    const isOnSale = product?.is_on_sale;
    const salePrice = Number(product?.sale_price || 0);

    if (isOnSale && salePrice > 0) {
      return salePrice;
    }

    return Number(product?.price || 0);
  };

  const getUnitBundlePrice = (item: CartItem) => {
    return getBaseProductPrice(item) + Number(item.option_price_delta || 0);
  };

  const getCheckoutTotal = () => {
    return cartItems.reduce((total, item) => {
      return total + getUnitBundlePrice(item) * Number(item.quantity || 1);
    }, 0);
  };

  const formatCartPrice = (item: CartItem, value: number) => {
    const product = getCartProduct(item);
    const currency = product?.currency || "USD";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
  };

  const fillFormFromProfile = (profileData: Profile | null) => {
    setCheckoutForm({
      full_name: profileData?.full_name || "",
      phone: profileData?.phone || "",
      address: profileData?.address || "",
      city: profileData?.city || "",
      province: profileData?.province || "",
      postal_code: profileData?.postal_code || "",
      payment_method: "COD",
    });
  };

  const fetchCheckoutData = async (currentUserId?: string) => {
    const id = currentUserId || userId;

    if (!id) {
      setCartItems([]);
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [profileResult, cartResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase
        .from("cart_items")
        .select(
          "id, user_id, product_id, size, quantity, created_at, option_id, option_label, option_price_delta, option_quantity, products(name, price, category, image_url, stock, currency, sale_price, is_on_sale)"
        )
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (!profileResult.error && profileResult.data) {
      setProfile(profileResult.data as Profile);
      fillFormFromProfile(profileResult.data as Profile);
    }

    if (cartResult.error) {
      addToast("Failed to load cart", "error");
      console.error(cartResult.error);
    } else {
      setCartItems((cartResult.data || []) as CartItem[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    const loadPage = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id || "");
      await fetchCheckoutData(user?.id || "");
    };

    loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || "";
      setUserId(id);
      fetchCheckoutData(id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const validateReferralCode = async ({
    silent = false,
    codeOverride,
  }: {
    silent?: boolean;
    codeOverride?: string;
  } = {}): Promise<ReferralMatch | null> => {
    const code = (codeOverride ?? referralCode).trim().toUpperCase();

    if (!code) {
      setValidatedReferral(null);
      return null;
    }

    if (!userId) {
      if (!silent) addToast("Please login before applying a referral code.", "error");
      return null;
    }

    setCheckingReferral(true);

    const { data, error } = await supabase.rpc("validate_agent_referral_code", {
      input_code: code,
    });

    setCheckingReferral(false);

    const match = Array.isArray(data)
      ? (data[0] as ReferralMatch | undefined)
      : undefined;

    if (error || !match) {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
      setAssistedLeadToken(null);
      setIsLeadSpecificReferral(false);
      setReferralCode("");
      setValidatedReferral(null);
      if (!silent) addToast("Invalid or inactive agent referral code.", "error");
      return null;
    }

    if (match.agent_id === userId) {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
      setAssistedLeadToken(null);
      setIsLeadSpecificReferral(false);
      setReferralCode("");
      setValidatedReferral(null);
      if (!silent) {
        addToast(
          "You cannot apply your own referral code to your personal order.",
          "error"
        );
      }
      return null;
    }

    setReferralCode(match.referral_code);
    setValidatedReferral(match);

    if (!assistedLeadToken) {
      localStorage.setItem(
        REFERRAL_STORAGE_KEY,
        JSON.stringify({
          referralCode: match.referral_code,
          agentName: match.agent_name,
          savedAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
          assistedLeadToken: null,
          isLeadSpecific: false,
        } satisfies StoredReferral)
      );
    }

    if (!silent) {
      addToast(`Referral code applied: ${match.agent_name}`, "success");
    }

    return match;
  };

  useEffect(() => {
    if (!userId || referralCode || validatedReferral) return;

    const assistedValue = sessionStorage.getItem(ASSISTED_LINK_SESSION_KEY);

    if (assistedValue) {
      try {
        const stored = JSON.parse(assistedValue) as StoredReferral;

        if (
          !stored.referralCode ||
          !stored.assistedLeadToken ||
          !stored.expiresAt ||
          stored.expiresAt <= Date.now()
        ) {
          sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
        } else {
          setAssistedLeadToken(stored.assistedLeadToken);
          setIsLeadSpecificReferral(true);
          setReferralCode(stored.referralCode);
          void validateReferralCode({
            silent: true,
            codeOverride: stored.referralCode,
          });
          return;
        }
      } catch {
        sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
      }
    }

    const storedValue = localStorage.getItem(REFERRAL_STORAGE_KEY);

    if (!storedValue) return;

    try {
      const stored = JSON.parse(storedValue) as StoredReferral;

      if (
        !stored.referralCode ||
        !stored.expiresAt ||
        stored.expiresAt <= Date.now()
      ) {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        return;
      }

      setAssistedLeadToken(null);
      setIsLeadSpecificReferral(false);
      setReferralCode(stored.referralCode);
      void validateReferralCode({
        silent: true,
        codeOverride: stored.referralCode,
      });
    } catch {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
    }
    // Restore a referral once after the signed-in customer is identified.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const validateCouponCode = async ({
    silent = false,
  }: {
    silent?: boolean;
  } = {}): Promise<CustomerCoupon | null> => {
    const code = couponCode.trim().toUpperCase();

    if (!code) {
      setAppliedCoupon(null);
      return null;
    }

    if (!userId) {
      if (!silent) addToast("Please login before applying a coupon.", "error");
      return null;
    }

    setCheckingCoupon(true);

    const { data, error } = await supabase
      .from("customer_coupons")
      .select(
        "id, coupon_code, discount_percent, max_discount, minimum_order_amount, status, expires_at"
      )
      .eq("user_id", userId)
      .ilike("coupon_code", code)
      .maybeSingle();

    setCheckingCoupon(false);

    const coupon = (data as CustomerCoupon | null) || null;

    if (error || !coupon) {
      setAppliedCoupon(null);
      if (!silent) addToast("Coupon code is invalid for this account.", "error");
      return null;
    }

    if (coupon.status !== "available") {
      setAppliedCoupon(null);
      if (!silent) addToast("This coupon is no longer available.", "error");
      return null;
    }

    if (new Date(coupon.expires_at).getTime() <= Date.now()) {
      setAppliedCoupon(null);
      if (!silent) addToast("This coupon has expired.", "error");
      return null;
    }

    if (getCheckoutTotal() < Number(coupon.minimum_order_amount || 0)) {
      setAppliedCoupon(null);
      if (!silent) {
        addToast(
          `This coupon requires a minimum order of ${formatUSD(
            Number(coupon.minimum_order_amount || 0)
          )}.`,
          "error"
        );
      }
      return null;
    }

    setCouponCode(coupon.coupon_code);
    setAppliedCoupon(coupon);

    if (!silent) {
      addToast(`${Number(coupon.discount_percent).toFixed(0)}% coupon applied`, "success");
    }

    return coupon;
  };

  const validateStock = () => {
    for (const item of cartItems) {
      const product = getCartProduct(item);

      if (!product) {
        return "One of your cart items no longer exists.";
      }

      const stock = Number(product.stock ?? 0);
      const bundleUnits = Number(item.option_quantity || 1);
      const totalUnitsNeeded = Number(item.quantity || 1) * bundleUnits;

      if (stock <= 0) {
        return `${product.name} is out of stock.`;
      }

      if (totalUnitsNeeded > stock) {
        return `${product.name} only has ${stock} unit(s) left. This bundle needs ${bundleUnits} unit(s) each.`;
      }
    }

    return "";
  };

  const validateCheckout = () => {
    if (!userId) return "Please login before checkout.";
    if (cartItems.length === 0) return "Your cart is empty.";
    if (getCheckoutTotal() <= 0) return "Cart total must be greater than zero.";

    if (!checkoutForm.full_name.trim()) return "Full name is required.";
    if (checkoutForm.full_name.trim().length < 3) {
      return "Full name must be at least 3 characters.";
    }

    if (!checkoutForm.phone.trim()) return "Phone number is required.";
    if (!isValidPhilippinePhone(checkoutForm.phone)) {
      return "Enter a valid PH phone number, e.g. 09XXXXXXXXX.";
    }

    if (!checkoutForm.address.trim()) return "Complete address is required.";
    if (checkoutForm.address.trim().length < 10) {
      return "Please enter a more complete delivery address.";
    }

    if (!checkoutForm.city.trim()) return "City or municipality is required.";
    if (!checkoutForm.province.trim()) return "Province is required.";

    if (!checkoutForm.postal_code.trim()) {
      return "Postal code is required.";
    }

    if (
      checkoutForm.postal_code.trim().length < 3 ||
      checkoutForm.postal_code.trim().length > 20
    ) {
      return "Enter a valid postal code.";
    }

    if (!checkoutForm.payment_method) return "Payment method is required.";

    const stockError = validateStock();
    if (stockError) return stockError;

    return "";
  };

  const buildReceiptItems = () => {
    return cartItems.map((item) => {
      const product = getCartProduct(item);

      return {
        name: product?.name || "Product",
        category: product?.category || "Merch",
        size: item.size || null,
        quantity: Number(item.quantity || 1),
        price: getUnitBundlePrice(item),
        option_label: item.option_label || null,
      };
    });
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateCheckout();

    if (validationError) {
      addToast(validationError, "error");
      return;
    }

    setPlacingOrder(true);

    let parsed;

    try {
      parsed = checkoutSchema.parse(checkoutForm);
    } catch (error) {
      addToast(getValidationMessage(error), "error");
      setPlacingOrder(false);
      return;
    }

    let verifiedReferral: ReferralMatch | null = null;
    let verifiedCoupon: CustomerCoupon | null = null;

    if (referralCode.trim()) {
      verifiedReferral = await validateReferralCode({ silent: true });

      if (!verifiedReferral) {
        addToast(
          "Please apply a valid agent referral code or remove it before placing your order.",
          "error"
        );
        setPlacingOrder(false);
        return;
      }
    }

    if (couponCode.trim()) {
      verifiedCoupon = await validateCouponCode({ silent: true });

      if (!verifiedCoupon) {
        addToast(
          "Please apply a valid coupon code or remove it before placing your order.",
          "error"
        );
        setPlacingOrder(false);
        return;
      }
    }

    const { data, error } = await supabase.rpc("place_checkout_order", {
      input_full_name: parsed.full_name,
      input_phone: normalizePhone(parsed.phone),
      input_address: parsed.address,
      input_city: parsed.city,
      input_province: parsed.province,
      input_postal_code: parsed.postal_code,
      input_payment_method: parsed.payment_method,
      input_agent_referral_code: verifiedReferral?.referral_code || null,
      input_coupon_code: verifiedCoupon?.coupon_code || null,
      input_assisted_lead_token: assistedLeadToken || null,
    });

    const checkoutResult = Array.isArray(data)
      ? (data[0] as CheckoutRpcResult | undefined)
      : undefined;

    if (error || !checkoutResult) {
      const message = error?.message || "";

      if (message.includes("assisted shopping link")) {
        sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
        setAssistedLeadToken(null);
        setIsLeadSpecificReferral(false);
        addToast(
          "This assisted-shopping link is invalid, expired, or already used. Remove it or request a new link from your agent.",
          "error"
        );
      } else if (message.includes("own referral code")) {
        addToast(
          "You cannot apply your own referral code to your personal order.",
          "error"
        );
      } else if (message.includes("Invalid or inactive agent referral code")) {
        addToast("The agent referral code is invalid or inactive.", "error");
      } else if (message.includes("coupon has expired")) {
        addToast("This coupon has expired.", "error");
      } else if (message.includes("coupon is no longer available")) {
        addToast("This coupon has already been used or is unavailable.", "error");
      } else if (message.includes("minimum amount required")) {
        addToast(
          "Your order does not meet the minimum amount for this coupon.",
          "error"
        );
      } else if (
        message.includes("out of stock") ||
        message.includes("unavailable")
      ) {
        addToast("One or more products are unavailable or out of stock.", "error");
      } else {
        addToast(
          error?.message
            ? `Checkout failed: ${error.message}`
            : "Checkout failed: no order result was returned.",
          "error"
        );
      }

      console.warn("Secure checkout failed:", {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        data,
      });

      setPlacingOrder(false);
      return;
    }

    setReceipt({
      orderId: checkoutResult.order_id,
      createdAt: new Date().toISOString(),
      fullName: parsed.full_name,
      phone: normalizePhone(parsed.phone),
      address: parsed.address,
      city: parsed.city,
      province: parsed.province,
      postalCode: parsed.postal_code,
      paymentMethod: parsed.payment_method,
      status: "pending",
      totalAmount: Number(checkoutResult.order_total || 0),
      items: buildReceiptItems(),
    });

    setCartItems([]);
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
    sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
    setAssistedLeadToken(null);
    setIsLeadSpecificReferral(false);
    setReferralCode("");
    setValidatedReferral(null);
    setCouponCode("");
    setAppliedCoupon(null);
    setPlacingOrder(false);

    if (Number(checkoutResult.order_discount || 0) > 0) {
      addToast(
        `Order placed. You saved ${formatUSD(Number(checkoutResult.order_discount))}.`,
        "success"
      );
    } else {
      addToast("Order placed. Receipt is ready.", "success");
    }
  };

  const copyReceiptSummary = async () => {
    if (!receipt) return;

    const lines = [
      "Order Receipt",
      `Order No.: ${receipt.orderId.slice(0, 8).toUpperCase()}`,
      `Date: ${new Date(receipt.createdAt).toLocaleString()}`,
      `Customer: ${receipt.fullName}`,
      `Phone: ${receipt.phone}`,
      `Address: ${receipt.address}, ${receipt.city}, ${receipt.province} ${receipt.postalCode}`,
      `Payment: ${receipt.paymentMethod}`,
      `Status: ${receipt.status}`,
      "",
      "Items:",
      ...receipt.items.map(
        (item) =>
          `- ${item.name} (${item.size || "N/A"}) x${item.quantity} = ${formatUSD(
            item.price * item.quantity
          )}`
      ),
      "",
      `Total: ${formatUSD(receipt.totalAmount)}`,
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      addToast("Receipt copied", "success");
    } catch {
      addToast("Unable to copy receipt", "error");
    }
  };

  const checkoutSubtotal = getCheckoutTotal();
  const previewDiscount =
    appliedCoupon && checkoutSubtotal >= Number(appliedCoupon.minimum_order_amount || 0)
      ? Math.min(
          checkoutSubtotal * (Number(appliedCoupon.discount_percent || 0) / 100),
          Number(appliedCoupon.max_discount || 0)
        )
      : 0;
  const checkoutTotal = Math.max(0, checkoutSubtotal - previewDiscount);

  return (
    <AppShell title="Checkout" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Checkout
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Complete Order
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              Confirm your delivery details and payment method before placing
              your order.
            </p>
          </div>

          <div className="rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
              Order Total
            </p>
            <p className="mt-1 text-3xl font-black">{formatUSD(checkoutTotal)}</p>
            <p className="text-sm text-zinc-600 dark:text-gray-400">
              {cartCount} item(s)
            </p>
          </div>
        </div>
      </section>

      {!userId && (
        <section className="mt-6 rounded-[2rem] border border-red-500/30 bg-red-500/10 p-6">
          <h2 className="text-xl font-black text-red-600">Login required</h2>
          <p className="mt-2 text-sm text-red-500">
            Please login or create an account before checkout. You will return to checkout after logging in.
          </p>
          <Link
            href="/login?redirect=/checkout"
            className="mt-4 inline-block rounded-full bg-red-600 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white"
          >
            Go to Login
          </Link>
        </section>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <form
          onSubmit={placeOrder}
          className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
        >
          <h2 className="text-2xl font-black">Delivery Details</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
            These details will be saved with your order.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FormInput
              label="Full Name"
              value={checkoutForm.full_name}
              onChange={(value) =>
                setCheckoutForm((prev) => ({ ...prev, full_name: value }))
              }
              placeholder="Juan Dela Cruz"
            />

            <FormInput
              label="Phone Number"
              value={checkoutForm.phone}
              onChange={(value) =>
                setCheckoutForm((prev) => ({ ...prev, phone: value }))
              }
              placeholder="09XXXXXXXXX or +639XXXXXXXXX"
            />

            <div className="md:col-span-2">
              <FormInput
                label="Complete Address"
                value={checkoutForm.address}
                onChange={(value) =>
                  setCheckoutForm((prev) => ({ ...prev, address: value }))
                }
                placeholder="House no., street, barangay"
              />
            </div>

            <FormInput
              label="City / Municipality"
              value={checkoutForm.city}
              onChange={(value) =>
                setCheckoutForm((prev) => ({ ...prev, city: value }))
              }
              placeholder="City or municipality"
            />

            <FormInput
              label="Province"
              value={checkoutForm.province}
              onChange={(value) =>
                setCheckoutForm((prev) => ({ ...prev, province: value }))
              }
              placeholder="Province"
            />

            <FormInput
              label="Postal Code"
              value={checkoutForm.postal_code}
              onChange={(value) =>
                setCheckoutForm((prev) => ({ ...prev, postal_code: value }))
              }
              placeholder="Postal code"
            />

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
                Payment Method
              </label>
              <select
                value={checkoutForm.payment_method}
                onChange={(e) =>
                  setCheckoutForm((prev) => ({
                    ...prev,
                    payment_method: e.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              >
                <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="COD">
                  Cash on Delivery
                </option>
                <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="GCash">
                  GCash
                </option>
                <option className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white" value="Bank Transfer">
                  Bank Transfer
                </option>
              </select>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-400/20 dark:bg-violet-400/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
              Assisted by an Agent?
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-gray-300">
              Enter the referral code given by the agent who guided your purchase.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={referralCode}
                onChange={(e) => {
                  localStorage.removeItem(REFERRAL_STORAGE_KEY);
                  sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
                  setAssistedLeadToken(null);
                  setIsLeadSpecificReferral(false);
                  setReferralCode(e.target.value.toUpperCase());
                  setValidatedReferral(null);
                }}
                maxLength={24}
                placeholder="Example: AGT-A83F29BC"
                className="min-w-0 flex-1 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-zinc-950 outline-none focus:border-violet-600 dark:border-violet-400/20 dark:bg-zinc-900 dark:text-white"
              />

              <button
                type="button"
                disabled={checkingReferral || !referralCode.trim() || !userId}
                onClick={() => validateReferralCode()}
                className="rounded-2xl bg-violet-600 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                {checkingReferral ? "Checking..." : "Apply Code"}
              </button>
            </div>

            {validatedReferral && (
              <div className="mt-4 flex flex-col justify-between gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-400/20 dark:bg-green-400/10 dark:text-green-200 sm:flex-row sm:items-center">
                <div>
                  <p className="font-black">
                    {isLeadSpecificReferral
                      ? "Personal assisted-shopping link applied"
                      : "Referral applied"}
                  </p>
                  <p className="mt-1">
                    Guided by: {validatedReferral.agent_name} · {validatedReferral.referral_code}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(REFERRAL_STORAGE_KEY);
                    sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
                    setAssistedLeadToken(null);
                    setIsLeadSpecificReferral(false);
                    setReferralCode("");
                    setValidatedReferral(null);
                  }}
                  className="rounded-full border border-green-300 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] transition hover:bg-green-700 hover:text-white dark:border-green-400/20"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-3xl border border-green-200 bg-green-50 p-5 dark:border-green-400/20 dark:bg-green-400/10">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-green-700 dark:text-green-300">
              Reward Coupon
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-gray-300">
              Use a coupon you earned from your delivered purchase milestones.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setAppliedCoupon(null);
                }}
                maxLength={40}
                placeholder="Enter your coupon code"
                className="min-w-0 flex-1 rounded-2xl border border-green-200 bg-white px-4 py-3 text-sm font-bold uppercase tracking-[0.08em] text-zinc-950 outline-none focus:border-green-600 dark:border-green-400/20 dark:bg-zinc-900 dark:text-white"
              />

              <button
                type="button"
                disabled={checkingCoupon || !couponCode.trim() || !userId}
                onClick={() => validateCouponCode()}
                className="rounded-2xl bg-green-700 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-green-800 disabled:opacity-60"
              >
                {checkingCoupon ? "Checking..." : "Apply Coupon"}
              </button>
            </div>

            {appliedCoupon && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-white p-4 text-sm text-green-900 dark:border-green-400/20 dark:bg-green-400/10 dark:text-green-100">
                <p className="font-black">Coupon applied</p>
                <p className="mt-1">
                  {Number(appliedCoupon.discount_percent).toFixed(0)}% OFF · up to{" "}
                  {formatUSD(Number(appliedCoupon.max_discount || 0))} savings
                </p>
              </div>
            )}

            <Link
              href="/rewards"
              className="mt-4 inline-block text-xs font-black uppercase tracking-[0.15em] text-green-700 hover:underline dark:text-green-300"
            >
              View my reward coupons
            </Link>
          </div>

          <button
            disabled={placingOrder || loading || checkingReferral || checkingCoupon || cartItems.length === 0 || !userId}
            className="mt-6 w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
          >
            {placingOrder ? "Placing Order..." : "Place Order"}
          </button>
        </form>

        <aside className="h-fit rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Order Summary</h2>

          {loading ? (
            <div className="mt-6 flex h-40 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
            </div>
          ) : cartItems.length === 0 ? (
            <div className="mt-6 rounded-3xl bg-black/[0.03] p-6 text-center dark:bg-white/[0.05]">
              <p className="font-black">Your cart is empty</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-gray-400">
                Add products first before checkout.
              </p>
              <Link
                href="/products"
                className="mt-5 inline-block rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
              >
                Browse Products
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-5 space-y-3">
                {cartItems.map((item) => {
                  const product = getCartProduct(item);

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-black/10 p-4 dark:border-white/10"
                    >
                      <div className="flex gap-3">
                        {hasValidImageUrl(product?.image_url) ? (
                          <img
                            src={product?.image_url || ""}
                            alt={product?.name || "Product"}
                            className="h-16 w-16 rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-xl text-white">
                            🛍️
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-black">
                            {product?.name || "Product"}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-gray-400">
                            Size: {item.size || "N/A"} · Qty: {item.quantity}
                          </p>
                          <p className="mt-1 font-bold">
                            {formatCartPrice(item, getUnitBundlePrice(item) * Number(item.quantity || 1))}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-black/10 pt-5 dark:border-white/10">
                <SummaryRow label="Items" value={cartCount.toString()} />
                <SummaryRow label="Subtotal" value={formatUSD(checkoutSubtotal)} />
                {appliedCoupon && previewDiscount > 0 && (
                  <SummaryRow
                    label={`Coupon (${Number(appliedCoupon.discount_percent).toFixed(0)}% OFF)`}
                    value={`- ${formatUSD(previewDiscount)}`}
                  />
                )}
                <SummaryRow label="Shipping" value="To be confirmed" />
                {validatedReferral && (
                  <SummaryRow
                    label="Guided by Agent"
                    value={`${validatedReferral.agent_name} (${validatedReferral.referral_code})`}
                  />
                )}
                <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
                  <SummaryRow label="Total" value={formatUSD(checkoutTotal)} strong />
                </div>
              </div>

              <Link
                href="/cart"
                className="mt-5 block w-full rounded-2xl border border-black/10 py-4 text-center text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              >
                Back to Cart
              </Link>
            </>
          )}
        </aside>
      </section>

      {receipt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl">
          <div className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:p-8">
            <button
              onClick={() => setReceipt(null)}
              className="absolute right-5 top-5 rounded-full bg-zinc-950 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-black"
            >
              ✕
            </button>

            <p className="text-xs font-black uppercase tracking-[0.3em] text-green-600">
              Order Successful
            </p>

            <h2 className="mt-3 text-3xl font-black">Receipt</h2>

            <div className="mt-6 rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
                Order Number
              </p>
              <p className="mt-1 text-2xl font-black">
                #{receipt.orderId.slice(0, 8).toUpperCase()}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-gray-400">
                {new Date(receipt.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ReceiptBlock title="Customer" lines={[receipt.fullName, receipt.phone]} />
              <ReceiptBlock
                title="Delivery"
                lines={[
                  `${receipt.address}, ${receipt.city}`,
                  `${receipt.province} ${receipt.postalCode}`,
                  `Payment: ${receipt.paymentMethod}`,
                ]}
              />
            </div>

            <div className="mt-5 rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]">
              <h3 className="text-lg font-black">Items Ordered</h3>

              <div className="mt-4 space-y-3">
                {receipt.items.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] md:flex-row md:items-center"
                  >
                    <div>
                      <p className="font-black">{item.name}</p>
                      <p className="text-xs text-zinc-600 dark:text-gray-400">
                        {item.category} · {item.option_label || `Size: ${item.size || "N/A"}`} · Qty:{" "}
                        {item.quantity}
                      </p>
                    </div>

                    <p className="font-black">
                      {formatUSD(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-between border-t border-black/10 pt-5 dark:border-white/10">
                <p className="text-lg font-black">Total</p>
                <p className="text-lg font-black">
                  {formatUSD(receipt.totalAmount)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <button
                onClick={copyReceiptSummary}
                className="rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
              >
                Copy Receipt
              </button>

              <Link
                href="/orders"
                className="rounded-2xl border border-black/10 py-4 text-center text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              >
                View My Orders
              </Link>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <p
        className={
          strong
            ? "text-lg font-black"
            : "text-sm text-zinc-600 dark:text-gray-400"
        }
      >
        {label}
      </p>
      <p className={strong ? "text-lg font-black" : "text-sm font-bold"}>
        {value}
      </p>
    </div>
  );
}

function ReceiptBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]">
      <h3 className="text-lg font-black">{title}</h3>
      <div className="mt-3 space-y-1">
        {lines.map((line) => (
          <p key={line} className="text-sm text-zinc-600 dark:text-gray-400">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}