"use client";

export type ToastItem = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
};

type ToastContainerProps = {
  toasts: ToastItem[];
  isDark?: boolean;
};

export default function ToastContainer({
  toasts,
  isDark = false,
}: ToastContainerProps) {
  return (
    <div className="fixed right-6 top-6 z-[99999] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm rounded-2xl px-5 py-3 text-xs font-bold shadow-xl ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : toast.type === "error"
              ? "bg-red-600 text-white"
              : isDark
              ? "bg-white text-black"
              : "bg-zinc-950 text-white"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}