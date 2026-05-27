"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import RequestAssistanceButton from "@/components/RequestAssistanceButton";
import { supabase } from "@/lib/supabase";
import type {
  AvailabilityFilter,
  Product,
  SaleFilter,
  SortOption,
  ToastItem,
} from "@/lib/types";
import {
  getDisplayPrice,
  hasValidImageUrl,
  isProductInStock,
} from "@/lib/utils";

type ProductOption = {
  id: string;
  product_id: string;
  label: string;
  quantity: number | null;
  price_delta: number | null;
  is_default: boolean | null;
  sort_order: number | null;
};

type ProductWithOptions = Product & {
  product_options?: ProductOption[];
};

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithOptions[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] =
    useState<ProductWithOptions | null>(null);
  const [selectedOption, setSelectedOption] = useState<ProductOption | null>(
    null
  );
  const [userId, setUserId] = useState("");

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>("all");
  const [saleFilter, setSaleFilter] = useState<SaleFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [minPriceFilter, setMinPriceFilter] = useState("");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = crypto.randomUUID();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const formatProductPrice = (product: Product, value: number) => {
    const currency = product.currency || "USD";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(value || 0));
  };

  const getOptionAdjustedPrice = (
    product: ProductWithOptions,
    option: ProductOption | null
  ) => {
    return getDisplayPrice(product) + Number(option?.price_delta || 0);
  };

  const getDefaultOption = (product: ProductWithOptions) => {
    const options = [...(product.product_options || [])].sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
    );

    return options.find((option) => option.is_default) || options[0] || null;
  };

  const fetchProducts = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*, product_options(*)")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      addToast("Failed to load products", "error");
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
    }

    setLoading(false);
  };

  const fetchFavorites = async (currentUserId: string) => {
    if (!currentUserId) {
      setFavorites([]);
      return;
    }

    const { data, error } = await supabase
      .from("favorites")
      .select("product_id")
      .eq("user_id", currentUserId);

    if (!error && data) {
      setFavorites(data.map((item) => item.product_id));
    }
  };

  useEffect(() => {
    const loadPage = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id || "");

      await fetchProducts();

      if (user?.id) {
        await fetchFavorites(user.id);
      }
    };

    loadPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || "";
      setUserId(id);
      fetchFavorites(id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(products.map((p) => p.category)))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = [...products];

    list = list.filter((product) => {
      const defaultOption = getDefaultOption(product);
      const displayPrice = getOptionAdjustedPrice(product, defaultOption);
      const minPrice = minPriceFilter ? Number(minPriceFilter) : null;
      const maxPrice = maxPriceFilter ? Number(maxPriceFilter) : null;

      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        product.category.toLowerCase().includes(search.toLowerCase()) ||
        (product.brand || "").toLowerCase().includes(search.toLowerCase()) ||
        (product.sku || "").toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        activeCategory === "All" || product.category === activeCategory;

      const matchesAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "in-stock" && isProductInStock(product)) ||
        (availabilityFilter === "out-of-stock" && !isProductInStock(product));

      const matchesSale =
        saleFilter === "all" ||
        (saleFilter === "sale" && product.is_on_sale) ||
        (saleFilter === "regular" && !product.is_on_sale);

      const matchesMin = minPrice === null || displayPrice >= minPrice;
      const matchesMax = maxPrice === null || displayPrice <= maxPrice;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesAvailability &&
        matchesSale &&
        matchesMin &&
        matchesMax
      );
    });

    if (sortOption === "price-low") {
      list.sort(
        (a, b) =>
          getOptionAdjustedPrice(a, getDefaultOption(a)) -
          getOptionAdjustedPrice(b, getDefaultOption(b))
      );
    }

    if (sortOption === "price-high") {
      list.sort(
        (a, b) =>
          getOptionAdjustedPrice(b, getDefaultOption(b)) -
          getOptionAdjustedPrice(a, getDefaultOption(a))
      );
    }

    if (sortOption === "name-az") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sortOption === "stock-high") {
      list.sort((a, b) => Number(b.stock || 0) - Number(a.stock || 0));
    }

    if (sortOption === "newest") {
      list.sort(
        (a, b) =>
          new Date(b.created_at || "").getTime() -
          new Date(a.created_at || "").getTime()
      );
    }

    return list;
  }, [
    products,
    search,
    activeCategory,
    availabilityFilter,
    saleFilter,
    minPriceFilter,
    maxPriceFilter,
    sortOption,
  ]);

  const resetFilters = () => {
    setSearch("");
    setActiveCategory("All");
    setAvailabilityFilter("all");
    setSaleFilter("all");
    setMinPriceFilter("");
    setMaxPriceFilter("");
    setSortOption("newest");
  };

  const toggleFavorite = async (
    e: React.MouseEvent<HTMLButtonElement>,
    productId: string
  ) => {
    e.stopPropagation();

    if (!userId) {
      addToast("Please login to save favorites", "error");
      return;
    }

    const isFavorite = favorites.includes(productId);

    if (isFavorite) {
      setFavorites((prev) => prev.filter((id) => id !== productId));

      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId);

      if (error) {
        setFavorites((prev) => [...prev, productId]);
        addToast("Failed to remove favorite", "error");
      } else {
        addToast("Removed from favorites", "info");
      }
    } else {
      setFavorites((prev) => [...prev, productId]);

      const { error } = await supabase.from("favorites").insert({
        user_id: userId,
        product_id: productId,
      });

      if (error) {
        setFavorites((prev) => prev.filter((id) => id !== productId));
        addToast("Failed to save favorite", "error");
      } else {
        addToast("Added to favorites", "success");
      }
    }
  };

  const addToCart = async () => {
    if (!selectedProduct) return;

    if (!userId) {
      addToast("Please login before adding to cart", "error");
      return;
    }

    if (Number(selectedProduct.stock || 0) <= 0) {
      addToast("This product is out of stock", "error");
      return;
    }

    const optionToUse = selectedOption || getDefaultOption(selectedProduct);

    if (!optionToUse) {
      addToast("Please select a bundle option", "error");
      return;
    }

    const optionQuantity = Number(optionToUse.quantity || 1);

    if (optionQuantity > Number(selectedProduct.stock || 0)) {
      addToast(`Only ${selectedProduct.stock} item(s) available`, "error");
      return;
    }

    const { data: existingItems, error: existingError } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("product_id", selectedProduct.id)
      .eq("option_id", optionToUse.id);

    if (existingError) {
      addToast("Failed to check cart", "error");
      console.error(existingError);
      return;
    }

    const existingItem = existingItems?.[0];

    if (existingItem) {
      const newQuantity = Number(existingItem.quantity || 0) + 1;
      const totalUnits = newQuantity * optionQuantity;

      if (totalUnits > Number(selectedProduct.stock || 0)) {
        addToast(`Only ${selectedProduct.stock} item(s) available`, "error");
        return;
      }

      const { error } = await supabase
        .from("cart_items")
        .update({
          quantity: newQuantity,
          option_label: optionToUse.label,
          option_price_delta: Number(optionToUse.price_delta || 0),
          option_quantity: Number(optionToUse.quantity || 1),
        })
        .eq("id", existingItem.id)
        .eq("user_id", userId);

      if (error) {
        addToast("Failed to update cart", "error");
        console.error(error);
        return;
      }
    } else {
      const { error } = await supabase.from("cart_items").insert({
        user_id: userId,
        product_id: selectedProduct.id,
        size: null,
        quantity: 1,
        option_id: optionToUse.id,
        option_label: optionToUse.label,
        option_price_delta: Number(optionToUse.price_delta || 0),
        option_quantity: Number(optionToUse.quantity || 1),
      });

      if (error) {
        addToast("Failed to add to cart", "error");
        console.error(error);
        return;
      }
    }

    addToast("Added to cart", "success");
    setSelectedProduct(null);
    setSelectedOption(null);
  };

  const openProduct = (product: ProductWithOptions) => {
    setSelectedProduct(product);
    setSelectedOption(getDefaultOption(product));
  };

  const optionClass = "bg-white text-zinc-950 dark:bg-zinc-900 dark:text-white";

  return (
    <AppShell
      title="Products"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search products, category, SKU, or brand..."
      toasts={toasts}
    >
      <section className="rounded-[2.5rem] border border-[#58948f] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
              Novelty Collectibles
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              Shop Collectibles
            </h1>
            <p className="mt-3 max-w-2xl text-[#000000] dark:text-gray-400">
              Browse display-only novelty collectibles. These items are not
              legal tender, not cryptocurrency, and not investments.
            </p>
          </div>

          <div className="rounded-3xl bg-[#58948f] p-5 dark:bg-white/[0.05]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b5e8e4] dark:text-gray-400">
              Showing
            </p>
            <p className="mt-1 text-3xl font-black">
              {filteredProducts.length}
            </p>
            <p className="text-sm text-[#b5e8e4] dark:text-gray-400">
              of {products.length} products
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-[#58948f] bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Category"
            value={activeCategory}
            onChange={setActiveCategory}
            options={categories}
            optionClass={optionClass}
          />

          <FilterSelect
            label="Availability"
            value={availabilityFilter}
            onChange={(value) =>
              setAvailabilityFilter(value as AvailabilityFilter)
            }
            options={[
              { label: "All", value: "all" },
              { label: "In Stock", value: "in-stock" },
              { label: "Out of Stock", value: "out-of-stock" },
            ]}
            optionClass={optionClass}
          />

          <FilterSelect
            label="Sale"
            value={saleFilter}
            onChange={(value) => setSaleFilter(value as SaleFilter)}
            options={[
              { label: "All", value: "all" },
              { label: "On Sale", value: "sale" },
              { label: "Regular", value: "regular" },
            ]}
            optionClass={optionClass}
          />

          <FilterSelect
            label="Sort"
            value={sortOption}
            onChange={(value) => setSortOption(value as SortOption)}
            options={[
              { label: "Newest", value: "newest" },
              { label: "Price Low to High", value: "price-low" },
              { label: "Price High to Low", value: "price-high" },
              { label: "Name A-Z", value: "name-az" },
              { label: "Most Stock", value: "stock-high" },
            ]}
            optionClass={optionClass}
          />

          <FilterInput
            label="Min Price"
            value={minPriceFilter}
            onChange={setMinPriceFilter}
          />

          <FilterInput
            label="Max Price"
            value={maxPriceFilter}
            onChange={setMaxPriceFilter}
          />

          <div className="flex items-end md:col-span-2">
            <button
              onClick={resetFilters}
              className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.15em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-transparent dark:hover:bg-white dark:hover:text-black"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-[2rem] border border-[#ded0bf] bg-white dark:border-white/10 dark:bg-white/[0.04]">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#58948f] border-t-transparent" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-[2rem] border border-[#58948f] bg-white p-10 text-center text-[#58948f] dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
            No products found.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isFavorite={favorites.includes(product.id)}
                price={getOptionAdjustedPrice(product, getDefaultOption(product))}
                formatProductPrice={formatProductPrice}
                onOpen={() => openProduct(product)}
                onToggleFavorite={(e) => toggleFavorite(e, product.id)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedProduct && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl">
          <div className="relative grid max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[2.5rem] border border-[#ded0bf] bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 md:grid-cols-2">
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute right-6 top-6 z-10 rounded-full bg-zinc-950 px-3 py-2 text-sm font-bold text-white dark:bg-white dark:text-black"
            >
              ✕
            </button>

            <div className="flex min-h-[420px] items-center justify-center bg-[#58948f] dark:bg-[#58948f]">
              {hasValidImageUrl(selectedProduct.image_url) ? (
                <img
                  src={selectedProduct.image_url || ""}
                  alt={selectedProduct.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#58948f] text-4xl text-white">
                    🛍️
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#58948f]">
                    No Image Yet
                  </p>
                </div>
              )}
            </div>

            <div className="p-8 md:p-12">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-[#58948f]">
                {selectedProduct.category}
              </p>

              <h2 className="text-4xl font-black tracking-tight">
                {selectedProduct.name}
              </h2>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <p className="text-2xl font-black">
                  {formatProductPrice(
                    selectedProduct,
                    getOptionAdjustedPrice(selectedProduct, selectedOption)
                  )}
                </p>

                {selectedProduct.is_on_sale && selectedProduct.sale_price && (
                  <p className="text-sm text-[#725f4d] line-through dark:text-gray-400">
                    {formatProductPrice(selectedProduct, Number(selectedProduct.price || 0))}
                  </p>
                )}
              </div>

              <p className="mt-6 text-[#725f4d] dark:text-gray-400">
                {selectedProduct.description || "No description yet."}
              </p>

              <div className="mt-6 rounded-3xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                <p className="font-black">Important Disclaimer</p>
                <p className="mt-1">
                  {selectedProduct.disclaimer ||
                    "Novelty collectible only. Not legal tender, not cryptocurrency, not an investment product, and not redeemable for monetary value."}
                </p>
              </div>

              <div className="mt-8">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[#725f4d] dark:text-gray-400">
                  Select Bundle / Quantity Option
                </p>

                <div className="grid gap-2">
                  {(selectedProduct.product_options || []).map((option) => {
                    const isSelected = selectedOption?.id === option.id;
                    const finalPrice = getOptionAdjustedPrice(
                      selectedProduct,
                      option
                    );

                    return (
                      <button
                        key={option.id}
                        onClick={() => setSelectedOption(option)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-[#58948f] bg-[#58948f] text-white"
                            : "border-[#ded0bf] bg-[#fffaf4] hover:border-[#58948f] dark:border-white/10 dark:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                          <div>
                            <p className="font-black">{option.label}</p>
                            <p
                              className={`text-xs ${
                                isSelected
                                  ? "text-white/80"
                                  : "text-[#725f4d] dark:text-gray-400"
                              }`}
                            >
                              Bundle units: {option.quantity || 1}
                            </p>
                          </div>

                          <div className="text-left md:text-right">
                            {Number(option.price_delta || 0) > 0 && (
                              <p
                                className={`text-xs ${
                                  isSelected
                                    ? "text-white/80"
                                    : "text-[#725f4d] dark:text-gray-400"
                                }`}
                              >
                                +{formatProductPrice(selectedProduct, Number(option.price_delta || 0))}
                              </p>
                            )}
                            <p className="font-black">
                              {formatProductPrice(selectedProduct, finalPrice)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 grid gap-3 text-sm text-[#725f4d] dark:text-gray-400">
                <p>
                  <b>Available stock:</b> {selectedProduct.stock ?? 0}
                </p>
                {selectedProduct.material && (
                  <p>
                    <b>Material:</b> {selectedProduct.material}
                  </p>
                )}
                {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                  <p>
                    <b>Color:</b> {selectedProduct.colors.join(", ")}
                  </p>
                )}
                {selectedProduct.sku && (
                  <p>
                    <b>SKU:</b> {selectedProduct.sku}
                  </p>
                )}
              </div>

              <button
                onClick={addToCart}
                className="mt-8 w-full rounded-2xl bg-[#093459] py-5 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#58948f] dark:bg-[#58948f] dark:text-white dark:hover:bg-[#093459]"
              >
                Add Selected Bundle to Cart
              </button>

              <div className="mt-3">
                <RequestAssistanceButton productName={selectedProduct.name} />
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ProductCard({
  product,
  isFavorite,
  price,
  formatProductPrice,
  onOpen,
  onToggleFavorite,
}: {
  product: ProductWithOptions;
  isFavorite: boolean;
  price: number;
  formatProductPrice: (product: Product, value: number) => string;
  onOpen: () => void;
  onToggleFavorite: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-[2rem] border border-[#ded0bf] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]"
    >
      <div className="relative flex h-72 items-center justify-center bg-[#f8efe4] dark:bg-white/[0.05]">
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
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#725f4d]">
              No Image Yet
            </p>
          </div>
        )}

        <button
          onClick={onToggleFavorite}
          className={`absolute right-4 top-4 rounded-full border px-3 py-2 text-sm transition ${
            isFavorite
              ? "border-red-400 bg-red-500 text-white"
              : "border-[#ded0bf] bg-white text-zinc-950 hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:bg-black/50 dark:text-white dark:hover:bg-white dark:hover:text-black"
          }`}
        >
          {isFavorite ? "♥" : "♡"}
        </button>

        {product.is_on_sale && (
          <span className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1 text-xs font-black uppercase text-white">
            Sale
          </span>
        )}
      </div>

      <div className="p-6">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-[#58948f]">
          {product.category}
        </p>

        <h3 className="text-xl font-black">{product.name}</h3>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-lg font-black">{formatProductPrice(product, price)}</p>

          {product.is_on_sale && product.sale_price && (
            <p className="text-xs text-[#725f4d] line-through dark:text-gray-400">
              {formatProductPrice(product, Number(product.price || 0))}
            </p>
          )}
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-[#725f4d] dark:text-gray-400">
          {product.short_description ||
            product.description ||
            "Novelty collectible display item."}
        </p>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-[#725f4d] dark:text-gray-400">
            Stock: {product.stock ?? 0}
          </p>

          <span className="rounded-full bg-[#58948f] px-3 py-1 text-xs font-bold text-white">
            View
          </span>
        </div>

        <div className="mt-4">
          <RequestAssistanceButton productName={product.name} compact />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  optionClass,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options:
    | string[]
    | {
        label: string;
        value: string;
      }[];
  optionClass: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
      >
        {options.map((option) => {
          if (typeof option === "string") {
            return (
              <option className={optionClass} key={option} value={option}>
                {option}
              </option>
            );
          }

          return (
            <option
              className={optionClass}
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-[#725f4d] dark:text-gray-400">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-[#cdbba7] bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-[#58948f] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
        placeholder="0"
      />
    </div>
  );
}