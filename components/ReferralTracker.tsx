"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type StoredReferral = {
  referralCode: string;
  agentName: string;
  savedAt: number;
  expiresAt: number;
  assistedLeadToken?: string | null;
  isLeadSpecific?: boolean;
};

type ReferralLookup = {
  referral_code: string;
  agent_name: string;
  expires_at?: string;
};

const REFERRAL_STORAGE_KEY = "merch-agent-referral";
const ASSISTED_LINK_SESSION_KEY = "merch-assisted-lead-referral";
const REFERRAL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export default function ReferralTracker({ isDark = false }: { isDark?: boolean }) {
  const [activeReferral, setActiveReferral] = useState<StoredReferral | null>(null);
  const [invalidLink, setInvalidLink] = useState(false);

  useEffect(() => {
    const setStoredDisplay = (stored: StoredReferral) => {
      if (
        !stored.referralCode ||
        !stored.agentName ||
        !stored.expiresAt ||
        stored.expiresAt <= Date.now()
      ) {
        return false;
      }

      setActiveReferral(stored);
      return true;
    };

    const loadExistingReferral = () => {
      const assistedValue = sessionStorage.getItem(ASSISTED_LINK_SESSION_KEY);

      if (assistedValue) {
        try {
          const assisted = JSON.parse(assistedValue) as StoredReferral;

          if (setStoredDisplay(assisted)) {
            return;
          }

          sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
        } catch {
          sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
        }
      }

      const standardValue = localStorage.getItem(REFERRAL_STORAGE_KEY);

      if (!standardValue) return;

      try {
        const stored = JSON.parse(standardValue) as StoredReferral;

        if (!setStoredDisplay(stored)) {
          localStorage.removeItem(REFERRAL_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
      }
    };

    const captureReferralFromUrl = async () => {
      const params = new URLSearchParams(window.location.search);
      const incomingAssistToken = params.get("assist")?.trim();
      const incomingCode = params.get("ref")?.trim().toUpperCase();

      if (incomingAssistToken) {
        if (!/^[a-fA-F0-9]{48}$/.test(incomingAssistToken)) {
          setInvalidLink(true);
          return;
        }

        const { data, error } = await supabase.rpc("lookup_active_assisted_link", {
          input_token: incomingAssistToken,
        });

        const match = Array.isArray(data)
          ? (data[0] as ReferralLookup | undefined)
          : undefined;

        if (error || !match) {
          sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
          setActiveReferral(null);
          setInvalidLink(true);
          return;
        }

        const databaseExpiry = match.expires_at
          ? new Date(match.expires_at).getTime()
          : Date.now() + REFERRAL_LIFETIME_MS;

        const savedReferral: StoredReferral = {
          referralCode: match.referral_code,
          agentName: match.agent_name,
          savedAt: Date.now(),
          expiresAt: Math.min(databaseExpiry, Date.now() + REFERRAL_LIFETIME_MS),
          assistedLeadToken: incomingAssistToken,
          isLeadSpecific: true,
        };

        sessionStorage.setItem(
          ASSISTED_LINK_SESSION_KEY,
          JSON.stringify(savedReferral)
        );
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        setInvalidLink(false);
        setActiveReferral(savedReferral);
        return;
      }

      if (!incomingCode) {
        loadExistingReferral();
        return;
      }

      if (!/^[A-Z0-9-]{4,40}$/.test(incomingCode)) {
        setInvalidLink(true);
        return;
      }

      const { data, error } = await supabase.rpc("lookup_active_agent_referral", {
        input_code: incomingCode,
      });

      const match = Array.isArray(data)
        ? (data[0] as ReferralLookup | undefined)
        : undefined;

      if (error || !match) {
        localStorage.removeItem(REFERRAL_STORAGE_KEY);
        setActiveReferral(null);
        setInvalidLink(true);
        return;
      }

      const savedReferral: StoredReferral = {
        referralCode: match.referral_code,
        agentName: match.agent_name,
        savedAt: Date.now(),
        expiresAt: Date.now() + REFERRAL_LIFETIME_MS,
        assistedLeadToken: null,
        isLeadSpecific: false,
      };

      localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(savedReferral));
      sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
      setInvalidLink(false);
      setActiveReferral(savedReferral);
    };

    void captureReferralFromUrl();
  }, []);

  const removeReferral = () => {
    localStorage.removeItem(REFERRAL_STORAGE_KEY);
    sessionStorage.removeItem(ASSISTED_LINK_SESSION_KEY);
    setActiveReferral(null);
    setInvalidLink(false);
  };

  if (!activeReferral && !invalidLink) {
    return null;
  }

  if (invalidLink) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-5 md:px-6">
        <div
          className={`flex flex-col justify-between gap-3 rounded-3xl border p-4 text-sm md:flex-row md:items-center ${
            isDark
              ? "border-red-400/20 bg-red-400/10 text-red-100"
              : "border-red-200 bg-red-50 text-red-950"
          }`}
        >
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-600 dark:text-red-300">
              Referral Link Not Applied
            </p>
            <p className="mt-1">
              This assisted-shopping link is invalid, expired, already used, or no longer active.
            </p>
          </div>
          <button
            type="button"
            onClick={removeReferral}
            className="rounded-full border border-red-200 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] transition hover:bg-red-600 hover:text-white dark:border-red-400/20"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 md:px-6">
      <div
        className={`flex flex-col justify-between gap-3 rounded-3xl border p-4 md:flex-row md:items-center ${
          isDark
            ? "border-violet-400/20 bg-violet-400/10 text-violet-100"
            : "border-violet-200 bg-violet-50 text-violet-950"
        }`}
      >
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">
            {activeReferral?.isLeadSpecific
              ? "Personal Assisted-Shopping Link"
              : "Agent-Assisted Shopping"}
          </p>
          <p className="mt-1 text-sm">
            Guided by <span className="font-black">{activeReferral?.agentName}</span>. Referral code{" "}
            <span className="font-mono font-black">{activeReferral?.referralCode}</span> will be
            applied at checkout.
          </p>
        </div>

        <button
          type="button"
          onClick={removeReferral}
          className="rounded-full border border-violet-200 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] transition hover:bg-violet-600 hover:text-white dark:border-violet-400/20"
        >
          Remove Referral
        </button>
      </div>
    </div>
  );
}