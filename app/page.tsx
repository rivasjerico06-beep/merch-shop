"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/types";
import { formatPrice, getDisplayPrice, hasValidImageUrl } from "@/lib/utils";

export default function LandingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLandingProducts = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (!error) {
        setProducts((data || []) as Product[]);
      }

      setLoading(false);
    };

    fetchLandingProducts();
  }, []);

  const featuredProducts = useMemo(() => {
    const featured = products.filter((product) => product.is_featured);
    return (featured.length > 0 ? featured : products).slice(0, 4);
  }, [products]);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((product) => product.category))).slice(
      0,
      6
    );
  }, [products]);

  const newArrivals = useMemo(() => {
    return products.slice(0, 5);
  }, [products]);

  return (
    <AppShell title="Welcome">
      {/* ── Hero ── */}
        <section className="relative overflow-hidden rounded-[2.75rem] border border-[#58948f]/20 bg-[#58948f] p-8 text-white shadow-sm dark:border-[#58948f]/20 dark:bg-black md:p-14">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#093459]/30 blur-3xl" />
        <div className="absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-[#093459]/20 blur-3xl" />
        <div className="relative grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fb0aa]">
              Premium merch storefront
            </p>

            <h1 className="mt-6 text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Drop-ready merch, built for real orders.
            </h1>

            <p className="mt-6 max-w-2xl text-base text-white/70 md:text-lg">
              Sell shirts, hoodies, caps, totes, and future product drops with
              cart, checkout, customer accounts, order tracking, and admin
              analytics.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                 className="rounded-full border border-white/20 px-7 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-white hover:text-[#093459]"
              >
                Shop Now
              </Link>

              <Link
                href="/account"
                className="rounded-full border border-white/20 px-7 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-white hover:text-[#093459]"
              >
                My Account
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <LandingMetric label="Products" value={products.length.toString()} />
            <LandingMetric label="Categories" value={categories.length.toString()} />
            <LandingMetric
              label="Featured"
              value={products.filter((p) => p.is_featured).length.toString()}
            />
            <LandingMetric label="Checkout" value="Ready" />
          </div>
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section className="mt-10 grid gap-5 md:grid-cols-3">
        <FeatureCard
          title="Customer-ready"
          description="Accounts, saved delivery details, cart, checkout, receipt, and order tracking."
        />
        <FeatureCard
          title="Admin-ready"
          description="Analytics, products, orders, customers, status updates, and stock monitoring."
        />
        <FeatureCard
          title="Drop-ready"
          description="Featured products, sales, images, filters, sizes, stock, and categories."
        />
      </section>

      {/* ── Featured products ── */}
      <section className="mt-12">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
              Featured
            </p>
            <h2 className="mt-2 text-3xl font-black md:text-4xl">
              Merch worth checking out
            </h2>
          </div>

          <Link
            href="/products"
            className="w-fit rounded-full border border-[#093459]/15 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition hover:bg-[#093459] hover:text-white dark:border-white/10 dark:hover:bg-[#58948f] dark:hover:text-white"
          >
            View Products
          </Link>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-[2rem] border border-[#093459]/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
          </div>
        ) : featuredProducts.length === 0 ? (
          <EmptyBlock text="No products yet. Add products from the admin panel." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductPreviewCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* ── Categories + New arrivals ── */}
      <section className="mt-12 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-[2.5rem] border border-[#093459]/10 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
            Categories
          </p>
          <h2 className="mt-2 text-3xl font-black">Browse by type</h2>
          <p className="mt-3 text-sm text-[#093459]/60 dark:text-gray-400">
            Use categories to guide customers into the right merch section.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {categories.length === 0 ? (
              <p className="text-sm text-[#093459]/40 dark:text-gray-500">No categories yet.</p>
            ) : (
              categories.map((category) => (
                <Link
                  key={category}
                  href={`/products?category=${encodeURIComponent(category)}`}
                  className="rounded-full bg-[#58948f] px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white transition hover:bg-[#093459]"
                >
                  {category}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2.5rem] border border-[#093459]/10 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
                New arrivals
              </p>
              <h2 className="mt-2 text-3xl font-black">Latest drops</h2>
            </div>
            <Link
              href="/products"
              className="rounded-full border border-[#093459]/15 px-4 py-2 text-xs font-bold transition hover:bg-[#093459] hover:text-white dark:border-white/10 dark:hover:bg-[#58948f] dark:hover:text-white"
            >
              Shop
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {newArrivals.length === 0 ? (
              <p className="text-sm text-[#093459]/40 dark:text-gray-500">No arrivals yet.</p>
            ) : (
              newArrivals.map((product) => (
                <Link
                  key={product.id}
                  href="/products"
                  className="flex items-center justify-between gap-4 rounded-3xl bg-[#093459]/[0.04] p-4 transition hover:bg-[#093459]/[0.08] dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {hasValidImageUrl(product.image_url) ? (
                      <img
                        src={product.image_url || ""}
                        alt={product.name}
                        className="h-14 w-14 rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#58948f] text-xl text-white">
                        🛍️
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="truncate font-black">{product.name}</p>
                      <p className="text-sm text-[#093459]/60 dark:text-gray-400">
                        {product.category}
                      </p>
                    </div>
                  </div>

                  <p className="shrink-0 font-black">
                    {formatPrice(getDisplayPrice(product))}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ── Process ── */}
      <section className="mt-12 rounded-[2.75rem] border border-[#093459]/10 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
              Built for operations
            </p>
            <h2 className="mt-3 text-4xl font-black">
              From product drop to delivery tracking.
            </h2>
            <p className="mt-4 text-[#093459]/60 dark:text-gray-400">
              This shop now separates customer pages and admin pages for cleaner
              navigation, easier debugging, and a more professional structure.
            </p>
          </div>

          <div className="grid gap-3">
            <ProcessStep number="01" label="Customer browses products" />
            <ProcessStep number="02" label="Cart and checkout create order" />
            <ProcessStep number="03" label="Admin updates status" />
            <ProcessStep number="04" label="Customer tracks delivery" />
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function LandingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 backdrop-blur">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/60">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[2rem] border border-[#093459]/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm text-[#093459]/60 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

function ProductPreviewCard({ product }: { product: Product }) {
  return (
    <Link
      href="/products"
      className="group overflow-hidden rounded-[2rem] border border-[#093459]/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]"
    >
      <div className="flex h-64 items-center justify-center bg-[#093459]/[0.04] dark:bg-white/[0.05]">
        {hasValidImageUrl(product.image_url) ? (
          <img
            src={product.image_url || ""}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#58948f] text-2xl text-white">
              🛍️
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#093459]/40 dark:text-gray-500">
              No Image Yet
            </p>
          </div>
        )}
      </div>

      <div className="p-6">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-[#58948f]">
          {product.category}
        </p>
        <h3 className="text-xl font-black">{product.name}</h3>
        <p className="mt-2 font-black">{formatPrice(getDisplayPrice(product))}</p>
      </div>
    </Link>
  );
}

function ProcessStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-[#093459]/[0.04] p-5 dark:bg-white/[0.05]">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#58948f] text-sm font-black text-white">
        {number}
      </div>
      <p className="font-black">{label}</p>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[2rem] border border-[#093459]/10 bg-white p-10 text-center text-[#093459]/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
      {text}
    </div>
  );
}