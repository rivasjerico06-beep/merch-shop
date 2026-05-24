"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Profile, ToastItem } from "@/lib/types";
import { profileSchema, getValidationMessage, profileImageFileSchema } from "@/lib/validation";

const emptyProfileForm = {
  full_name: "",
  phone: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
};

export default function AccountPage() {
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);

  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [favoritesCount, setFavoritesCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const fillProfileForm = (profileData: Profile | null) => {
    setProfileForm({
      full_name: profileData?.full_name || "",
      phone: profileData?.phone || "",
      address: profileData?.address || "",
      city: profileData?.city || "",
      province: profileData?.province || "",
      postal_code: profileData?.postal_code || "",
    });
  };

  const loadAccountData = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUserId("");
      setUserEmail("");
      setProfile(null);
      fillProfileForm(null);
      setFavoritesCount(0);
      setOrdersCount(0);
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setUserEmail(user.email || "");

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      addToast("Unable to load profile", "error");
      console.error("Profile load error:", profileError);
      setLoading(false);
      return;
    }

    if (!profileData) {
      const { data: upsertedProfile, error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: "",
            phone: "",
            address: "",
            city: "",
            province: "",
            postal_code: "",
            role: "customer",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (upsertError) {
        addToast("Unable to create profile", "error");
        console.error("Profile upsert error:", upsertError);
        setLoading(false);
        return;
      }

      setProfile(upsertedProfile as Profile);
      fillProfileForm(upsertedProfile as Profile);
    } else {
      setProfile(profileData as Profile);
      fillProfileForm(profileData as Profile);
    }

    const [favoritesResult, ordersResult] = await Promise.all([
      supabase.from("favorites").select("id").eq("user_id", user.id),
      supabase.from("orders").select("id").eq("user_id", user.id),
    ]);

    setFavoritesCount(favoritesResult.data?.length || 0);
    setOrdersCount(ordersResult.data?.length || 0);

    setLoading(false);
  };

  useEffect(() => {
    loadAccountData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAccountData();
    });

    return () => subscription.unsubscribe();
  }, []);

const saveProfile = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!userId) {
    addToast("Please login first", "error");
    return;
  }

  setProfileSaving(true);

  let parsed;

  try {
    parsed = profileSchema.parse(profileForm);
  } catch (error) {
    addToast(getValidationMessage(error), "error");
    setProfileSaving(false);
    return;
  }

  const payload = {
    id: userId,
    full_name: parsed.full_name,
    phone: parsed.phone,
    address: parsed.address,
    city: parsed.city,
    province: parsed.province,
    postal_code: parsed.postal_code,
    role: profile?.role || "customer",
    profile_photo_url: profile?.profile_photo_url || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    addToast("Failed to save profile", "error");
    console.error(error);
  } else {
    setProfile(data as Profile);
    addToast("Profile saved", "success");
  }

  setProfileSaving(false);
};
  const uploadProfilePhoto = async () => {
  if (!userId) {
    addToast("Please login first", "error");
    return;
  }

  if (!profilePhotoFile) {
    addToast("Please select a photo first", "error");
    return;
  }

  try {
    profileImageFileSchema.parse({
      type: profilePhotoFile.type,
      size: profilePhotoFile.size,
      name: profilePhotoFile.name,
    });
  } catch (error) {
    addToast(getValidationMessage(error), "error");
    return;
  }

  setPhotoUploading(true);

    const safeName = profilePhotoFile.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const filePath = `${userId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, profilePhotoFile, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      addToast("Failed to upload photo", "error");
      console.error(uploadError);
      setPhotoUploading(false);
      return;
    }

    const { data } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(filePath);

    const photoUrl = data.publicUrl;

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({
        profile_photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();

    if (updateError) {
      addToast("Photo uploaded but profile was not updated", "error");
      console.error(updateError);
    } else {
      setProfile(updatedProfile as Profile);
      setProfilePhotoFile(null);
      addToast("Profile photo updated", "success");
    }

    setPhotoUploading(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();

    setUserId("");
    setUserEmail("");
    setProfile(null);
    fillProfileForm(null);
    setFavoritesCount(0);
    setOrdersCount(0);
    addToast("Signed out", "info");
  };

  if (loading) {
    return (
      <AppShell title="Account" toasts={toasts}>
        <div className="flex h-72 items-center justify-center rounded-[2rem] border border-black/10 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!userId) {
    return (
      <AppShell title="Account" toasts={toasts}>
        <section className="mx-auto max-w-2xl rounded-[2.5rem] border border-black/10 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
            Account required
          </p>
          <h1 className="mt-4 text-4xl font-black">Please login first</h1>
          <p className="mt-4 text-zinc-600 dark:text-gray-400">
            Your account page is separate from the login page. Login first to
            manage your profile, saved address, photo, and orders.
          </p>

          <Link
            href="/login?redirect=/account"
            className="mt-6 inline-block rounded-full bg-zinc-950 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 dark:bg-white dark:text-black dark:hover:bg-violet-400"
          >
            Go to Login
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell title="Account" toasts={toasts}>
      <section className="rounded-[2.5rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-600">
              Customer Account
            </p>
            <h1 className="mt-3 text-4xl font-black md:text-6xl">
              My Account
            </h1>
            <p className="mt-3 max-w-2xl text-zinc-600 dark:text-gray-400">
              Manage your profile, 1x1 photo, delivery details, and account
              shortcuts.
            </p>
          </div>

          <div className="rounded-3xl bg-black/[0.03] p-5 dark:bg-white/[0.05]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-gray-400">
              Account Role
            </p>
            <p className="mt-1 text-3xl font-black">
              {profile?.role || "customer"}
            </p>
            <p className="text-sm text-zinc-600 dark:text-gray-400">
              {userEmail}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="h-fit rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="text-center">
            {profile?.profile_photo_url ? (
              <img
                src={profile.profile_photo_url}
                alt="Profile photo"
                className="mx-auto h-36 w-36 rounded-[2rem] object-cover"
              />
            ) : (
              <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-[2rem] bg-violet-600 text-5xl font-black text-white">
                {profile?.full_name?.[0]?.toUpperCase() || "U"}
              </div>
            )}

            <h2 className="mt-5 text-2xl font-black">
              {profile?.full_name || "No name yet"}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
              {userEmail}
            </p>

            <span className="mt-3 inline-block rounded-full bg-violet-600 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white">
              {profile?.role || "customer"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniStat label="Orders" value={ordersCount.toString()} />
            <MiniStat label="Favorites" value={favoritesCount.toString()} />
          </div>

          <div className="mt-6 space-y-3">
            <Link
              href="/orders"
              className="block rounded-2xl border border-black/10 py-4 text-center text-sm font-black uppercase tracking-[0.2em] transition hover:bg-zinc-950 hover:text-white dark:border-white/10 dark:hover:bg-white dark:hover:text-black"
            >
              View Orders
            </Link>

            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="block rounded-2xl bg-violet-600 py-4 text-center text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-800"
              >
                Admin Dashboard
              </Link>
            )}

            <button
              onClick={signOut}
              className="w-full rounded-2xl bg-red-600 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-red-700"
            >
              Sign Out
            </button>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">1x1 Profile Photo</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
              Optional. Upload a square-looking photo for your account.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
                  Upload Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setProfilePhotoFile(e.target.files?.[0] || null)
                  }
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                />
                <p className="mt-2 text-xs text-zinc-500 dark:text-gray-400">
                  Maximum 2MB. JPG, PNG, or WebP recommended.
                </p>
              </div>

              <button
                onClick={uploadProfilePhoto}
                disabled={photoUploading || !profilePhotoFile}
                className="rounded-2xl bg-zinc-950 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
              >
                {photoUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <h2 className="text-2xl font-black">Profile & Delivery Details</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-gray-400">
              These details can be used during checkout.
            </p>

            <form onSubmit={saveProfile} className="mt-6 grid gap-4 md:grid-cols-2">
              <ProfileInput
                label="Full Name"
                value={profileForm.full_name}
                onChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    full_name: value,
                  }))
                }
                placeholder="Juan Dela Cruz"
              />

              <ProfileInput
                label="Phone Number"
                value={profileForm.phone}
                onChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    phone: value,
                  }))
                }
                placeholder="09XXXXXXXXX"
              />

              <div className="md:col-span-2">
                <ProfileInput
                  label="Complete Address"
                  value={profileForm.address}
                  onChange={(value) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      address: value,
                    }))
                  }
                  placeholder="House no., street, barangay"
                />
              </div>

              <ProfileInput
                label="City / Municipality"
                value={profileForm.city}
                onChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    city: value,
                  }))
                }
                placeholder="City or municipality"
              />

              <ProfileInput
                label="Province"
                value={profileForm.province}
                onChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    province: value,
                  }))
                }
                placeholder="Province"
              />

              <ProfileInput
                label="Postal Code"
                value={profileForm.postal_code}
                onChange={(value) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    postal_code: value,
                  }))
                }
                placeholder="Postal code"
              />

              <ProfileInput
                label="Email"
                value={userEmail}
                onChange={() => {}}
                disabled
              />

              <div className="md:col-span-2">
                <button
                  disabled={profileSaving}
                  className="w-full rounded-2xl bg-zinc-950 py-4 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-violet-700 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-violet-400"
                >
                  {profileSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>
    </AppShell>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </label>
      <input
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-zinc-950 outline-none focus:border-violet-500 disabled:opacity-70 dark:border-white/10 dark:bg-zinc-900 dark:text-white dark:placeholder:text-gray-500"
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.03] p-4 text-center dark:bg-white/[0.05]">
      <p className="text-xs font-black uppercase tracking-[0.15em] text-zinc-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}