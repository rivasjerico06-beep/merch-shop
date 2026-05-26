"use client";

import { useRouter } from "next/navigation";

type RequestAssistanceButtonProps = {
  productName: string;
  className?: string;
  compact?: boolean;
};

export default function RequestAssistanceButton({
  productName,
  className = "",
  compact = false,
}: RequestAssistanceButtonProps) {
  const router = useRouter();

  const requestHelp = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    router.push(`/assistance?product=${encodeURIComponent(productName)}`);
  };

  return (
    <button
      type="button"
      onClick={requestHelp}
      className={
        className ||
        (compact
          ? "rounded-full border border-[#58948f]/30 bg-[#58948f]/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#58948f] transition hover:bg-[#58948f] hover:text-white dark:border-[#58948f]/30 dark:text-[#6fb0aa]"
          : "w-full rounded-2xl border border-[#58948f]/30 bg-[#58948f]/10 py-4 text-xs font-black uppercase tracking-[0.18em] text-[#58948f] transition hover:bg-[#58948f] hover:text-white dark:border-[#58948f]/30 dark:text-[#6fb0aa]"
  )}
    >
      Request Help for This Product
    </button>
  );
}