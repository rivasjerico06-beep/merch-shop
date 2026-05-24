"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Product, ProductForm, Profile, ToastItem } from "@/lib/types";
import {
  buildProductPayload,
  emptyProductForm,
  formatPrice,
  productToForm,
} from "@/lib/utils";
import {
  getValidationMessage,
  imageFileSchema,
  productSchema,
} from "@/lib/validation";

export default function AdminProductsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [userEmail, setUserEmail] = useState("");

  const [productForm, setProductForm] =
    useState<ProductForm>(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [productSaving, setProductSaving] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const fetchProductsPage = async () => {
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
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      addToast("Failed to load products", "error");
      console.error(error);
    } else {
      setProducts((data || []) as Product[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchProductsPage();
  }, []);

  const uploadProductImage = async () => {
    if (!productImageFile) return productForm.image_url.trim() || null;

    try {
      imageFileSchema.parse({
        type: productImageFile.type,
        size: productImageFile.size,
        name: productImageFile.name,
      });
    } catch (error) {
      addToast(getValidationMessage(error), "error");
      return null;
    }

    const safeName = productImageFile.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const filePath = `products/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
      .from("product-images")
      .upload(filePath, productImageFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) {
      addToast("Failed to upload product image", "error");
      console.error(error);
      return null;
    }

    const { data } = supabase.storage
      .from("product-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const resetProductForm = () => {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
    setProductImageFile(null);
  };

  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductForm(productToForm(product));
    setProductImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productForm.name.trim()) {
      addToast("Product name is required", "error");
      return;
    }

    if (!productForm.category.trim()) {
      addToast("Category is required", "error");
      return;
    }

    const price = Number(productForm.price);
    if (!Number.isFinite(price) || price <= 0) {
      addToast("Enter a valid product price", "error");
      return;
    }

    setProductSaving(true);

    const imageUrl = await uploadProductImage();

    if (productImageFile && !imageUrl) {
      setProductSaving(false);
      return;
    }

    const rawPayload = {
      ...buildProductPayload(productForm, imageUrl),
      currency: "USD",
      short_description: "",
      disclaimer:
        "Novelty collectible only. Not legal tender, not cryptocurrency, not an investment product, and not redeemable for monetary value.",
    };

    let payload;

    try {
      payload = productSchema.parse(rawPayload);
    } catch (error) {
      addToast(getValidationMessage(error), "error");
      setProductSaving(false);
      return;
    }

    const result = editingProductId
      ? await supabase.from("products").update(payload).eq("id", editingProductId)
      : await supabase.from("products").insert(payload);

    if (result.error) {
      addToast("Failed to save product", "error");
      console.error(result.error);
    } else {
      addToast(editingProductId ? "Product updated" : "Product added", "success");
      resetProductForm();
      fetchProductsPage();
    }

    setProductSaving(false);
  };

  const quickUpdateProduct = async (
    productId: string,
    updates: Partial<Product>
  ) => {
    const { error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", productId);

    if (error) {
      addToast("Failed to update product", "error");
      console.error(error);
      return;
    }

    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId ? { ...product, ...updates } : product
      )
    );

    addToast("Product updated", "success");
  };

  const deleteProduct = async (productId: string) => {
    const confirmed = window.confirm(
      "Delete this product? This cannot be undone."
    );

    if (!confirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", productId);

    if (error) {
      addToast("Failed to delete product", "error");
      console.error(error);
    } else {
      setProducts((prev) => prev.filter((product) => product.id !== productId));
      addToast("Product deleted", "success");
    }
  };

  if (loading) {
    return (
      <AppShell title="Admin Products" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Admin Products" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Login required
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Login</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            Please login with your admin account to manage products.
          </p>

          <Link
            href="/login?redirect=/admin/products"
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
      <AppShell title="Admin Products" toasts={toasts}>
        <section className="mx-auto max-w-xl rounded-[2rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-red-600">
            Access Denied
          </p>
          <h1 className="mt-4 text-4xl font-black">Admin Only</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            This page is only for accounts with <b>role = admin</b>.
          </p>

          <div className="mt-6 rounded-2xl bg-black/[0.03] p-4 text-left text-sm dark:bg-white/[0.05]">
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
    <AppShell title="Admin Products" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Product Management
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Manage Products
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              Add, edit, hide, feature, delete, and upload product images for
              your merch catalog.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={fetchProductsPage}
              className="rounded-full border border-black/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
            >
              Refresh
            </button>

            <Link
              href="/admin/orders"
              className="rounded-full bg-zinc-950 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              View Orders
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {editingProductId ? "Edit Product" : "Add Product"}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                Manage details, pricing, stock, image, and visibility.
              </p>
            </div>

            {editingProductId && (
              <button
                onClick={resetProductForm}
                className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
              >
                Cancel
              </button>
            )}
          </div>

          <form onSubmit={saveProduct} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="Product Name"
                value={productForm.name}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, name: value }))
                }
                required
              />
              <TextInput
                label="Category"
                value={productForm.category}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, category: value }))
                }
                required
              />
              <TextInput
                label="Price"
                type="number"
                value={productForm.price}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, price: value }))
                }
                required
              />
              <TextInput
                label="Stock"
                type="number"
                value={productForm.stock}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, stock: value }))
                }
              />
              <TextInput
                label="Brand"
                value={productForm.brand}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, brand: value }))
                }
              />
              <TextInput
                label="SKU"
                value={productForm.sku}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, sku: value }))
                }
              />
              <TextInput
                label="Slug"
                value={productForm.slug}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, slug: value }))
                }
                placeholder="auto-generated if blank"
              />
              <TextInput
                label="Material"
                value={productForm.material}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, material: value }))
                }
              />
              <TextInput
                label="Gender"
                value={productForm.gender}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, gender: value }))
                }
                placeholder="Unisex / Men / Women"
              />
              <TextInput
                label="Sale Price"
                type="number"
                value={productForm.sale_price}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, sale_price: value }))
                }
              />
              <TextInput
                label="Sizes"
                value={productForm.sizes}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, sizes: value }))
                }
                placeholder="S, M, L, XL"
              />
              <TextInput
                label="Colors"
                value={productForm.colors}
                onChange={(value) =>
                  setProductForm((prev) => ({ ...prev, colors: value }))
                }
                placeholder="Black, White, Violet"
              />
            </div>

            <TextArea
              label="Description"
              value={productForm.description}
              onChange={(value) =>
                setProductForm((prev) => ({ ...prev, description: value }))
              }
              placeholder="Short product description"
            />

            <TextArea
              label="Care Instructions"
              value={productForm.care_instructions}
              onChange={(value) =>
                setProductForm((prev) => ({
                  ...prev,
                  care_instructions: value,
                }))
              }
              placeholder="Wash cold, do not bleach, etc."
            />

            <div className="rounded-3xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
                Product Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setProductImageFile(e.target.files?.[0] || null)
                }
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
              <input
                value={productForm.image_url}
                onChange={(e) =>
                  setProductForm((prev) => ({
                    ...prev,
                    image_url: e.target.value,
                  }))
                }
                className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                placeholder="Or paste image URL"
              />
              {(productImageFile || productForm.image_url) && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-gray-400">
                  {productImageFile
                    ? `Selected: ${productImageFile.name}`
                    : "Current image URL is set."}
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <CheckBox
                label="Active"
                checked={productForm.is_active}
                onChange={(checked) =>
                  setProductForm((prev) => ({
                    ...prev,
                    is_active: checked,
                  }))
                }
              />
              <CheckBox
                label="Featured"
                checked={productForm.is_featured}
                onChange={(checked) =>
                  setProductForm((prev) => ({
                    ...prev,
                    is_featured: checked,
                  }))
                }
              />
              <CheckBox
                label="On Sale"
                checked={productForm.is_on_sale}
                onChange={(checked) =>
                  setProductForm((prev) => ({
                    ...prev,
                    is_on_sale: checked,
                  }))
                }
              />
            </div>

            <button
              disabled={productSaving}
              className="w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
            >
              {productSaving
                ? "Saving..."
                : editingProductId
                ? "Update Product"
                : "Add Product"}
            </button>
          </form>
        </div>

        <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-black">Product List</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                {products.length} total products in your shop.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {products.length === 0 ? (
              <p className="rounded-3xl bg-black/[0.03] p-5 text-sm text-zinc-500 dark:bg-white/[0.05] dark:text-gray-400">
                No products yet.
              </p>
            ) : (
              products.map((product) => (
                <div
                  key={product.id}
                  className="rounded-3xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-20 w-20 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-600 text-2xl text-white">
                        🛍️
                      </div>
                    )}

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black">{product.name}</p>
                        {product.is_featured && <Badge label="featured" />}
                        {product.is_active === false && <Badge label="hidden" gray />}
                        {product.is_on_sale && <Badge label="sale" red />}
                      </div>

                      <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
                        {product.category} · Stock: {product.stock ?? 0} ·{" "}
                        {product.brand || "No brand"} · {product.sku || "No SKU"}
                      </p>

                      <p className="mt-2 font-black">
                        {product.is_on_sale && product.sale_price
                          ? `${formatPrice(Number(product.sale_price))} sale · ${formatPrice(Number(product.price))} original`
                          : formatPrice(Number(product.price))}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <ActionButton label="Edit" onClick={() => editProduct(product)} />
                      <ActionButton
                        label={product.is_active === false ? "Show" : "Hide"}
                        onClick={() =>
                          quickUpdateProduct(product.id, {
                            is_active: product.is_active === false,
                          })
                        }
                      />
                      <ActionButton
                        label={product.is_featured ? "Unfeature" : "Feature"}
                        onClick={() =>
                          quickUpdateProduct(product.id, {
                            is_featured: product.is_featured !== true,
                          })
                        }
                      />
                      <button
                        onClick={() => deleteProduct(product.id)}
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
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
      />
    </div>
  );
}

function TextArea({
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
      />
    </div>
  );
}

function CheckBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/[0.05]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5"
      />
      <span className="text-sm font-black uppercase tracking-[0.15em]">
        {label}
      </span>
    </label>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-black/10 px-4 py-2 text-xs font-bold transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
    >
      {label}
    </button>
  );
}

function Badge({
  label,
  gray = false,
  red = false,
}: {
  label: string;
  gray?: boolean;
  red?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase text-white ${
        red ? "bg-red-600" : gray ? "bg-zinc-500" : "bg-violet-600"
      }`}
    >
      {label}
    </span>
  );
}