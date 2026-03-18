"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { IconArrowUp } from "@tabler/icons-react";

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export function ChatInput({
  onSubmit,
  disabled,
  placeholder = "Ask about HK transportation...",
  compact,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const canSend = input.trim().length > 0 && !disabled;

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={compact ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="w-full max-w-2xl mx-auto"
    >
      <div
        className={`relative flex items-end rounded-2xl border transition-colors duration-200 ${
          compact
            ? "bg-white/[0.06] border-white/[0.08] focus-within:border-white/[0.15]"
            : "bg-white/[0.06] border-white/[0.08] focus-within:border-white/[0.15] shadow-lg shadow-black/20"
        }`}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className={`flex-1 bg-transparent resize-none text-white placeholder:text-zinc-500 outline-none text-[15px] leading-relaxed [&]:scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            compact ? "px-4 py-3" : "px-5 py-4"
          }`}
          style={{ maxHeight: 120 }}
        />
        <div className={compact ? "pr-2 pb-2" : "pr-3 pb-3"}>
          <button
            type="submit"
            disabled={!canSend}
            className={`flex items-center justify-center rounded-xl transition-all duration-200 ${
              canSend
                ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30 hover:bg-blue-400 active:scale-95"
                : "bg-white/[0.06] text-zinc-600"
            } ${compact ? "size-8" : "size-9"}`}
          >
            <IconArrowUp size={compact ? 16 : 18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </motion.form>
  );
}
