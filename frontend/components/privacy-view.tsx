"use client";

import Link from "next/link";
import { IconArrowLeft, IconBus } from "@tabler/icons-react";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  privacyContent,
  PRIVACY_LAST_UPDATED,
} from "@/lib/i18n/privacy-content";

export function PrivacyView() {
  const { locale } = useI18n();
  const content = privacyContent[locale];

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-zinc-950">
      {/* Header bar */}
      <div className="vibrancy sticky top-0 z-30 flex items-center justify-between px-4 sm:px-5 h-12 border-b border-white/[0.06] bg-zinc-950/70">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-zinc-400 hover:text-white transition-colors"
        >
          <IconArrowLeft size={18} />
          <span className="text-[13px] font-medium">{content.back}</span>
        </Link>
        <LanguageSwitcher />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 sm:px-6 py-10 sm:py-14 safe-bottom">
          <div className="flex items-center justify-center size-12 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
            <IconBus size={24} className="text-white" />
          </div>

          <h1 className="mt-6 text-[1.75rem] sm:text-4xl font-bold tracking-tight text-white">
            {content.title}
          </h1>
          <p className="mt-2 text-[13px] text-zinc-500">
            {content.lastUpdatedLabel}: {PRIVACY_LAST_UPDATED}
          </p>

          <div className="mt-8 space-y-4">
            {content.intro.map((paragraph) => (
              <p
                key={paragraph}
                className="text-[15px] leading-relaxed text-zinc-300"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-12 space-y-10">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-[17px] font-semibold tracking-tight text-white">
                  {section.heading}
                </h2>
                {section.body?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-3 text-[15px] leading-relaxed text-zinc-400"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-3 space-y-2.5">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="relative pl-5 text-[15px] leading-relaxed text-zinc-400"
                      >
                        <span
                          aria-hidden
                          className="absolute left-0 top-[0.6em] size-1.5 rounded-full bg-blue-500/70"
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <div className="mt-14 pt-6 border-t border-white/[0.06]">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[13px] text-zinc-500 hover:text-white transition-colors"
            >
              <IconArrowLeft size={16} />
              {content.back}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
