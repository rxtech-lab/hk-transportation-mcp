"use client";

import { useI18n, locales } from "@/lib/i18n/i18n-provider";
import { IconLanguage } from "@tabler/icons-react";
import { useState, useRef, useEffect } from "react";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center size-10 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
        aria-label="Change language"
      >
        <IconLanguage size={24} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-xl bg-zinc-900 border border-white/10 shadow-xl py-1.5 overflow-hidden">
          {locales.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className={`w-full text-left px-5 py-3 text-[15px] transition-colors ${
                locale === l.code
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
