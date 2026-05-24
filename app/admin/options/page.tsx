"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { productOptionSchema, getValidationMessage } from "@/lib/validation";
import type { Product, Profile, ToastItem } from "@/lib/types";

type ProductOption = {
  id: string;
  product_id: string;
  label: string;
  quantity: number | null;
  price_delta: number | null;
  is_default: boolean | null;
  sort_order: number | null;
  created_at?: string;
};

type ProductWithOptions = Product & {
  product_options?: ProductOption[];
};

const emptyOptionForm = {
  label: "",
  quantity: "1",
  price_delta: "0",
  is_default: false,
  sort_order: "1",
};

export default function AdminOptionsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [products, setProducts] = useState<ProductWithOptions[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  const [optionForm, setOptionForm] = useState(emptyOptionForm);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatProductPrice = (product: Product | undefined, value: number) => {
    const currency = product?.currency || "USD";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  };

  const fetchPage = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setProfile(null);
      setUserEmail("");
      setLoading(false);
      return;
    }

    setUserEmail(user.email || "");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      addToast("Unable to load admin profile", "error");
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(profileData as Profile);

    if (profileData.role !== "admin") {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select("*, product_options(*)")
      .order("created_at", { ascending: false });

    if (error) {
      addToast("Failed to load products and options", "error");
      console.error(error);
    } else {
      const normalized = ((data || []) as ProductWithOptions[]).map(
        (product) => ({
          ...product,
          product_options: [...(product.product_options || [])].sort(
            (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
          ),
        })
      );

      setProducts(normalized);

      if (!selectedProductId && normalized.length > 0) {
        setSelectedProductId(normalized[0].id);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPage();
  }, []);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId);
  }, [products, selectedProductId]);

  const selectedOptions = selectedProduct?.product_options || [];

  const resetForm = () => {
    setEditingOptionId(null);
    setOptionForm({
      ...emptyOptionForm,
      sort_order: String(selectedOptions.length + 1),
      is_default: selectedOptions.length === 0,
    });
  };

  const editOption = (option: ProductOption) => {
    setEditingOptionId(option.id);
    setOptionForm({
      label: option.label || "",
      quantity: String(option.quantity || 1),
      price_delta: String(option.price_delta || 0),
      is_default: option.is_default === true,
      sort_order: String(option.sort_order || 1),
    });
  };

  const saveOption = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId) {
      addToast("Select a product first", "error");
      return;
    }

    if (!optionForm.label.trim()) {
      addToast("Option label is required", "error");
      return;
    }

   setSaving(true);

if (optionForm.is_default) {
  await supabase
    .from("product_options")
    .update({ is_default: false })
    .eq("product_id", selectedProductId);
}

const rawPayload = {
  product_id: selectedProductId,
  label: optionForm.label,
  quantity: optionForm.quantity,
  price_delta: optionForm.price_delta,
  is_default: optionForm.is_default,
  sort_order: optionForm.sort_order,
};

let payload;

try {
  payload = productOptionSchema.parse(rawPayload);
} catch (error) {
  addToast(getValidationMessage(error), "error");
  setSaving(false);
  return;
}

const result = editingOptionId
  ? await supabase.from("product_options").update(payload).eq("id", editingOptionId)
  : await supabase.from("product_options").insert(payload);

    if (result.error) {
      addToast("Failed to save option", "error");
      console.error(result.error);
    } else {
      addToast(editingOptionId ? "Option updated" : "Option added", "success");
      resetForm();
      fetchPage();
    }

    setSaving(false);
  };

  const deleteOption = async (optionId: string) => {
    const confirmed = window.confirm("Delete this bundle option?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("product_options")
      .delete()
      .eq("id", optionId);

    if (error) {
      addToast("Failed to delete option", "error");
      console.error(error);
      return;
    }

    addToast("Option deleted", "success");
    fetchPage();
  };

  if (loading) {
    return (
      <AppShell title="Admin Options" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Admin Options" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Login</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">
            Please login with your admin account to manage product options.
          </p>

          <Link
            href="/login?redirect=/admin/options"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
          >
            Login as Admin
          </Link>
        </section>
      </AppShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AppShell title="Admin Options" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-[#ded0bf] bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-600">
            Access Denied
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Only</h1>
          <p className="mt-4 text-[#725f4d] dark:text-gray-400">
            This page is only for accounts with <b>role = admin</b>.
          </p>

          <div className="mt-6 rounded-2xl bg-[#f8efe4] p-4 text-left text-sm dark:bg-white/[0.05]">
            <p>
              <b>Email:</b> {userEmail || "Not logged in"}
            </p>
            <p>
              <b>Detected role:</b> {profile.role || "No role"}
            </p>
          </div>

          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-white dark:bg-white dark:text-black"
          >
            Back to Shop
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin Options" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Bundle Options
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Product Options
            </h1>
            <p className="mt-3 max-w-2xl text-[#725f4d] dark:text-gray-400">
              Create bundle choices like 1X, 3X (+$200), 5X (+$500), and
              choose the default option for each product.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchPage}
              className="rounded-full border border-[#cdbba7] bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
            >
              Refresh
            </button>

            <Link
              href="/admin/products"
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              Products
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="h-fit rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <h2 className="text-2xl font-black">Select Product</h2>
          <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
            Choose which product options to manage.
          </p>

          <select
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              setEditingOptionId(null);
              setOptionForm(emptyOptionForm);
            }}
            className="mt-5 w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          >
            {products.map((product) => (
              <option
                key={product.id}
                value={product.id}
                className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white"
              >
                {product.name}
              </option>
            ))}
          </select>

          {selectedProduct && (
            <div className="mt-5 rounded-3xl bg-[#f8efe4] p-5 dark:bg-white/[0.05]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
                Base Price
              </p>
              <p className="mt-2 text-2xl font-black">
                {formatProductPrice(
                  selectedProduct,
                  selectedProduct.is_on_sale && selectedProduct.sale_price
                    ? Number(selectedProduct.sale_price)
                    : Number(selectedProduct.price)
                )}
              </p>
              <p className="mt-2 text-sm text-[#725f4d] dark:text-gray-400">
                Existing options: {selectedOptions.length}
              </p>
            </div>
          )}
        </aside>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">
              {editingOptionId ? "Edit Option" : "Add Option"}
            </h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Price delta is added on top of the product's sale/base price.
            </p>

            <form onSubmit={saveOption} className="mt-6 space-y-4">
              <TextInput
                label="Option Label"
                value={optionForm.label}
                onChange={(value) =>
                  setOptionForm((prev) => ({ ...prev, label: value }))
                }
                placeholder="3X BTC Diamond 2025 Certified"
                required
              />

              <div className="grid gap-4 md:grid-cols-3">
                <TextInput
                  label="Quantity"
                  type="number"
                  value={optionForm.quantity}
                  onChange={(value) =>
                    setOptionForm((prev) => ({ ...prev, quantity: value }))
                  }
                  required
                />

                <TextInput
                  label="Price Delta"
                  type="number"
                  value={optionForm.price_delta}
                  onChange={(value) =>
                    setOptionForm((prev) => ({
                      ...prev,
                      price_delta: value,
                    }))
                  }
                  required
                />

                <TextInput
                  label="Sort Order"
                  type="number"
                  value={optionForm.sort_order}
                  onChange={(value) =>
                    setOptionForm((prev) => ({ ...prev, sort_order: value }))
                  }
                  required
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-[#f8efe4] p-4 dark:bg-white/[0.05]">
                <input
                  type="checkbox"
                  checked={optionForm.is_default}
                  onChange={(e) =>
                    setOptionForm((prev) => ({
                      ...prev,
                      is_default: e.target.checked,
                    }))
                  }
                  className="h-5 w-5"
                />
                <span className="text-sm font-black uppercase tracking-[0.15em]">
                  Set as default option
                </span>
              </label>

              <button
                disabled={saving}
                className="w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
              >
                {saving
                  ? "Saving..."
                  : editingOptionId
                  ? "Update Option"
                  : "Add Option"}
              </button>

              {editingOptionId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full rounded-2xl border border-[#cdbba7] py-4 text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
                >
                  Cancel Edit
                </button>
              )}
            </form>
          </section>

          <section className="rounded-[2rem] border border-[#ded0bf] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">Existing Options</h2>
            <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
              Options for {selectedProduct?.name || "selected product"}.
            </p>

            <div className="mt-5 space-y-3">
              {selectedOptions.length === 0 ? (
                <p className="rounded-3xl bg-[#f8efe4] p-5 text-sm text-[#725f4d] dark:bg-white/[0.05] dark:text-gray-400">
                  No options yet.
                </p>
              ) : (
                selectedOptions.map((option) => (
                  <div
                    key={option.id}
                    className="rounded-3xl border border-[#ded0bf] bg-[#f8efe4] p-5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-black">{option.label}</p>
                          {option.is_default && (
                            <span className="rounded-full bg-violet-600 px-3 py-1 text-[10px] font-black uppercase text-white">
                              default
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[#725f4d] dark:text-gray-400">
                          Quantity: {option.quantity || 1} · Delta:{" "}
                          {formatProductPrice(
                            selectedProduct,
                            Number(option.price_delta || 0)
                          )}{" "}
                          · Sort: {option.sort_order || 0}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => editOption(option)}
                          className="rounded-full border border-[#cdbba7] bg-white px-4 py-2 text-xs font-bold transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteOption(option.id)}
                          className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-600 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
      />
    </div>
  );
}