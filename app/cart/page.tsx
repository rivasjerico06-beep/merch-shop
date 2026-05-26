"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { cartQuantitySchema, getValidationMessage } from "@/lib/validation";
import type { CartItem, ToastItem } from "@/lib/types";
import {
  calculateCartCount,
  formatPrice,
  getCartProduct,
  hasValidImageUrl,
} from "@/lib/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCartShopping, faBagShopping } from "@fortawesome/free-solid-svg-icons";

export default function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [userId, setUserId] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatCartPrice = (item: CartItem, value: number) => {
    const product = getCartProduct(item);
    const currency = product?.currency || "USD";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  };

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

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => {
      return total + getUnitBundlePrice(item) * Number(item.quantity || 1);
    }, 0);
  };

  const fetchCart = async (currentUserId: string) => {
    if (!currentUserId) {
      setCartItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("cart_items")
      .select(
        "id, user_id, product_id, size, quantity, created_at, option_id, option_label, option_price_delta, option_quantity, products(name, price, category, image_url, stock, currency, sale_price, is_on_sale)"
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      addToast("Failed to load cart", "error");
      console.error(error);
    } else {
      setCartItems((data || []) as CartItem[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    const loadPage = async () => {
      setCheckingSession(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const id = user?.id || "";
      setUserId(id);
      setCheckingSession(false);

      if (id) {
        await fetchCart(id);
      } else {
        setCartItems([]);
        setLoading(false);
      }
    };

    loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || "";
      setUserId(id);

      if (id) {
        fetchCart(id);
      } else {
        setCartItems([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateCartQuantity = async (itemId: string, newQuantity: number) => {
    if (!userId) {
      addToast("Please login first", "error");
      return;
    }

    let parsed;

    try {
      parsed = cartQuantitySchema.parse({
        quantity: newQuantity,
      });
    } catch (error) {
      addToast(getValidationMessage(error), "error");
      return;
    }

    const item = cartItems.find((cartItem) => cartItem.id === itemId);
    const product = item ? getCartProduct(item) : null;

    const bundleUnits = Number(item?.option_quantity || 1);
    const totalUnitsNeeded = parsed.quantity * bundleUnits;

    if (product && totalUnitsNeeded > Number(product.stock || 0)) {
      addToast(
        `Only ${product.stock} unit(s) available. This bundle needs ${bundleUnits} unit(s) each.`,
        "error"
      );
      return;
    }

    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: parsed.quantity })
      .eq("id", itemId)
      .eq("user_id", userId);

    if (error) {
      addToast("Failed to update quantity", "error");
      console.error(error);
      return;
    }

    setCartItems((prev) =>
      prev.map((cartItem) =>
        cartItem.id === itemId
          ? { ...cartItem, quantity: parsed.quantity }
          : cartItem
      )
    );
  };

  const removeCartItem = async (itemId: string) => {
    if (!userId) {
      addToast("Please login first", "error");
      return;
    }

    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", userId);

    if (error) {
      addToast("Failed to remove item", "error");
      console.error(error);
      return;
    }

    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
    addToast("Item removed", "info");
  };

  const clearCart = async () => {
    if (!userId) {
      addToast("Please login first", "error");
      return;
    }

    const confirmed = window.confirm("Clear all items from your cart?");

    if (!confirmed) return;

    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", userId);

    if (error) {
      addToast("Failed to clear cart", "error");
      console.error(error);
      return;
    }

    setCartItems([]);
    addToast("Cart cleared", "info");
  };

  const cartTotal = getCartTotal();
  const cartCount = calculateCartCount(cartItems);

  return (
    <AppShell title="Cart" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">
              Shopping Cart
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">My Cart</h1>
            <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
              Review your selected collectible bundles before proceeding to checkout.
            </p>
          </div>

          <div className="rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
              Cart Total
            </p>
            <p className="mt-1 text-3xl font-black">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(cartTotal)}
            </p>
            <p className="text-sm text-[#725f4d] dark:text-gray-400">
              {cartCount} bundle(s)
            </p>
          </div>
        </div>
      </section>

      {checkingSession ? (
        <section className="mt-6 flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
        </section>
      ) : !userId ? (
        <section className="mx-auto mt-8 max-w-2xl rounded-[2.5rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">
            Account required
          </p>
          <h2 className="mt-4 text-4xl font-black">Login to view your cart</h2>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">
            Your cart is connected to your account. Please login first, then you
            will return to this page.
          </p>

          <Link
            href="/login?redirect=/cart"
            className="mt-6 inline-block rounded-full bg-[#093459] px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#093459]"
          >
            Go to Login
          </Link>
        </section>
      ) : (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {loading ? (
              <div className="flex h-64 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
              </div>
            ) : cartItems.length === 0 ? (
              <div className="rounded-[2rem] border border-[#ded0bf] bg-white p-10 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gray-200 dark:bg-zinc-700">
                  <FontAwesomeIcon
                    icon={faCartShopping}
                    className="text-3xl text-gray-500 dark:text-gray-400"
                  />
                </div>
                <h2 className="text-2xl font-black">Your cart is empty</h2>
                <p className="mt-2 text-[#725f4d] dark:text-gray-400">
                  Add products first before checking out.
                </p>
                <Link
                  href="/products"
                  className="mt-6 inline-block rounded-full bg-[#093459] px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#093459]"
                >
                  Browse Products
                </Link>
              </div>
            ) : (
              cartItems.map((item) => {
                const product = getCartProduct(item);
                const unitPrice = getUnitBundlePrice(item);
                const subtotal = unitPrice * Number(item.quantity || 1);

                return (
                  <div
                    key={item.id}
                    className="rounded-[2rem] border border-[#ded0bf] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
                      {hasValidImageUrl(product?.image_url) ? (
                        <img
                          src={product?.image_url || ""}
                          alt={product?.name || "Product"}
                          className="h-28 w-28 rounded-3xl object-cover"
                        />
                      ) : (
                        <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-[#58948f]">
                          <FontAwesomeIcon
                            icon={faBagShopping}
                            className="text-3xl text-white"
                          />
                        </div>
                      )}

                      <div>
                        <p className="text-xl font-black">
                          {product?.name || "Product"}
                        </p>
                        <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                          {product?.category || "Collectible"}
                        </p>

                        {item.option_label && (
                          <div className="mt-3 rounded-2xl border border-[#58948f]/30 bg-[#58948f]/10 p-3 text-sm text-[#093459] dark:border-[#58948f]/20 dark:bg-[#58948f]/10 dark:text-[#58948f]">
                            <p className="font-black">Selected Bundle</p>
                            <p className="mt-1">{item.option_label}</p>
                            <p className="mt-1 text-xs">
                              Bundle units: {item.option_quantity || 1}
                            </p>
                            {Number(item.option_price_delta || 0) > 0 && (
                              <p className="mt-1 text-xs">
                                Bundle adjustment: +
                                {formatCartPrice(item, Number(item.option_price_delta || 0))}
                              </p>
                            )}
                          </div>
                        )}

                        <p className="mt-3 font-black">
                          {formatCartPrice(item, unitPrice)} per selected bundle
                        </p>
                        <p className="mt-1 text-xs text-[#725f4d] dark:text-gray-400">
                          Available stock: {product?.stock ?? 0}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 md:justify-end">
                        <div className="flex items-center rounded-2xl border border-[#ded0bf] p-2 dark:border-white/10">
                          <button
                            onClick={() =>
                              updateCartQuantity(item.id, item.quantity - 1)
                            }
                            className="h-9 w-9 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-black"
                          >
                            -
                          </button>
                          <span className="w-12 text-center font-black">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateCartQuantity(item.id, item.quantity + 1)
                            }
                            className="h-9 w-9 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-black"
                          >
                            +
                          </button>
                        </div>

                        <div className="min-w-28 text-left md:text-right">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
                            Subtotal
                          </p>
                          <p className="font-black">{formatCartPrice(item, subtotal)}</p>
                        </div>

                        <button
                          onClick={() => removeCartItem(item.id)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <aside className="h-fit rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">Order Summary</h2>

            <div className="mt-5 space-y-3">
              <SummaryRow label="Bundles" value={cartCount.toString()} />
              <SummaryRow
                label="Subtotal"
                value={new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(cartTotal)}
              />
              <SummaryRow label="Shipping" value="To be confirmed" />
            </div>

            <div className="mt-5 border-t border-[#ded0bf] pt-5 dark:border-white/10">
              <SummaryRow
                label="Total"
                value={new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(cartTotal)}
                strong
              />
            </div>

            <Link
              href="/checkout"
              className={`mt-6 block w-full rounded-2xl py-4 text-center text-sm font-black uppercase tracking-[0.2em] transition ${
                cartItems.length === 0
                  ? "pointer-events-none bg-zinc-400 text-white opacity-60"
                  : "bg-[#093459] text-white hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#093459]"
              }`}
            >
              Proceed to Checkout
            </Link>

            {cartItems.length > 0 && (
              <button
                onClick={clearCart}
                className="mt-3 w-full rounded-2xl border border-red-500/30 py-4 text-sm font-black uppercase tracking-[0.2em] text-red-600 transition hover:bg-red-600 hover:text-white"
              >
                Clear Cart
              </button>
            )}

            <Link
              href="/products"
              className="mt-3 block w-full rounded-2xl border border-[#ded0bf] py-4 text-center text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
            >
              Continue Shopping
            </Link>
          </aside>
        </section>
      )}
    </AppShell>
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
    <div className="flex items-center justify-between gap-4">
      <p
        className={
          strong
            ? "text-lg font-black"
            : "text-sm text-[#725f4d] dark:text-gray-400"
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