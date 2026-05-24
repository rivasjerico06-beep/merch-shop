import { z } from "zod";

/**
 * Security validation layer for the merch shop.
 *
 * Goals:
 * - Trim and normalize strings.
 * - Reject unexpected fields with .strict().
 * - Enforce type checks and length limits.
 * - Prevent raw HTML/script injection in user-controlled text.
 * - Build safe payloads before inserting/updating Supabase.
 */

const htmlLikePattern = /<[^>]*>|javascript:|data:text\/html|onerror=|onload=/i;

export function sanitizeText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

export function sanitizeMultilineText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const safeShortText = (fieldName: string, max = 120) =>
  z
    .string({ error: `${fieldName} must be text.` })
    .transform(sanitizeText)
    .refine((value) => value.length > 0, `${fieldName} is required.`)
    .refine((value) => value.length <= max, `${fieldName} is too long.`)
    .refine(
      (value) => !htmlLikePattern.test(value),
      `${fieldName} contains unsafe characters.`
    );

const optionalShortText = (fieldName: string, max = 120) =>
  z
    .string({ error: `${fieldName} must be text.` })
    .transform(sanitizeText)
    .refine((value) => value.length <= max, `${fieldName} is too long.`)
    .refine(
      (value) => !htmlLikePattern.test(value),
      `${fieldName} contains unsafe characters.`
    )
    .optional()
    .or(z.literal(""));

const optionalLongText = (fieldName: string, max = 1500) =>
  z
    .string({ error: `${fieldName} must be text.` })
    .transform(sanitizeMultilineText)
    .refine((value) => value.length <= max, `${fieldName} is too long.`)
    .refine(
      (value) => !htmlLikePattern.test(value),
      `${fieldName} contains unsafe characters.`
    )
    .optional()
    .or(z.literal(""));

const numericString = (fieldName: string, min = 0, max = 999999) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value), `${fieldName} must be a number.`)
    .refine((value) => value >= min, `${fieldName} is too low.`)
    .refine((value) => value <= max, `${fieldName} is too high.`);

const integerString = (fieldName: string, min = 0, max = 999999) =>
  numericString(fieldName, min, max).refine(
    (value) => Number.isInteger(value),
    `${fieldName} must be a whole number.`
  );

const emailSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.email("Enter a valid email address."))
  .refine((value) => value.length <= 254, "Email is too long.");

export const authSchema = z
  .object({
    email: emailSchema,
    password: z
      .string()
      .refine((value) => value.length >= 6, "Password must be at least 6 characters.")
      .refine((value) => value.length <= 128, "Password is too long."),
  })
  .strict();

export const profileSchema = z
  .object({
    full_name: safeShortText("Full name", 100),
    phone: z
      .string()
      .transform((value) => sanitizeText(value).replace(/\s|-/g, ""))
      .refine(
        (value) => /^09\d{9}$/.test(value) || /^\+639\d{9}$/.test(value),
        "Enter a valid Philippine phone number."
      ),
    address: safeShortText("Complete address", 180),
    city: safeShortText("City or municipality", 80),
    province: safeShortText("Province", 80),
    postal_code: z
      .string()
      .transform(sanitizeText)
      .refine((value) => value.length <= 12, "Postal code is too long.")
      .refine(
        (value) => value === "" || /^[0-9A-Za-z -]+$/.test(value),
        "Postal code contains invalid characters."
      ),
  })
  .strict();

export const checkoutSchema = profileSchema
  .extend({
    payment_method: z.enum(["COD", "GCash", "Bank Transfer"], {
      error: "Invalid payment method.",
    }),
  })
  .strict();

export const newsletterSchema = z.object({ email: emailSchema }).strict();

export const productSchema = z
  .object({
    name: safeShortText("Product name", 140),
    category: safeShortText("Category", 80),
    price: numericString("Price", 0.01, 999999),
    image_url: optionalShortText("Image URL", 2000),
    description: optionalLongText("Description", 2500),
    short_description: optionalLongText("Short description", 300),
    stock: integerString("Stock", 0, 100000),
    sizes: z.array(z.string().transform(sanitizeText).refine((v) => v.length <= 20)).max(30),
    slug: optionalShortText("Slug", 160),
    colors: z.array(z.string().transform(sanitizeText).refine((v) => v.length <= 40)).max(30),
    material: optionalShortText("Material", 100),
    gender: optionalShortText("Gender", 40),
    care_instructions: optionalLongText("Care instructions", 1000),
    brand: optionalShortText("Brand", 100),
    sku: optionalShortText("SKU", 80),
    sale_price: z
      .union([z.string(), z.number(), z.null(), z.undefined()])
      .transform((value) => {
        if (value === "" || value === null || value === undefined) return null;
        return Number(value);
      })
      .refine(
        (value) => value === null || (Number.isFinite(value) && value >= 0 && value <= 999999),
        "Sale price must be valid."
      ),
    is_active: z.boolean(),
    is_featured: z.boolean(),
    is_on_sale: z.boolean(),
    currency: z.enum(["USD", "PHP"]).default("USD"),
    disclaimer: optionalLongText("Disclaimer", 1500),
  })
  .strict()
  .refine(
    (data) => !data.is_on_sale || (data.sale_price !== null && data.sale_price < data.price),
    "Sale price must be lower than regular price."
  );

export const productOptionSchema = z
  .object({
    product_id: z.uuid("Invalid product ID."),
    label: safeShortText("Option label", 180),
    quantity: integerString("Quantity", 1, 10000),
    price_delta: numericString("Price delta", 0, 999999),
    is_default: z.boolean(),
    sort_order: integerString("Sort order", 0, 10000),
  })
  .strict();

export const cartInsertSchema = z
  .object({
    user_id: z.uuid("Invalid user ID."),
    product_id: z.uuid("Invalid product ID."),
    size: z.string().nullable().optional(),
    quantity: integerString("Cart quantity", 1, 10000),
    option_id: z.uuid("Invalid option ID.").nullable().optional(),
    option_label: optionalShortText("Option label", 180).nullable().optional(),
    option_price_delta: numericString("Option price delta", 0, 999999),
    option_quantity: integerString("Option quantity", 1, 10000),
  })
  .strict();

export const cartQuantitySchema = z
  .object({
    quantity: integerString("Quantity", 1, 10000),
  })
  .strict();

export const orderStatusSchema = z
  .object({
    status: z.enum(["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"], {
      error: "Invalid order status.",
    }),
  })
  .strict();

export const imageFileSchema = z
  .object({
    type: z.string().refine((value) => value.startsWith("image/"), "File must be an image."),
    size: z.number().max(5 * 1024 * 1024, "Image must be 5MB or smaller."),
    name: z
      .string()
      .transform(sanitizeText)
      .refine((value) => value.length <= 180, "File name is too long.")
      .refine(
        (value) => /^[a-zA-Z0-9._ -]+$/.test(value),
        "File name contains invalid characters."
      ),
  })
  .strict();

export const profileImageFileSchema = imageFileSchema.extend({
  size: z.number().max(2 * 1024 * 1024, "Profile photo must be 2MB or smaller."),
});

export function getValidationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || "Invalid input.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Invalid input.";
}

export function validateStrict<T>(schema: z.ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}