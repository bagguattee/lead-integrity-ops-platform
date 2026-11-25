"use client";

import { useEffect, useState, useTransition } from "react";
import { askWorkspaceCopilotAction } from "@/app/actions";
import { Bot, Loader2, Send, ShieldCheck, Sparkles, X } from "lucide-react";

interface CopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantName: string;
  complianceLaw: string;
}

interface Message {
  role: "assistant" | "user";
  text: string;
  tokens?: number;
}

export function CopilotDrawer({
  open,
  onClose,
  tenantName,
  complianceLaw,
}: CopilotDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: `Connected to ${tenantName} read-only ledger. Ask me about mathematical reconciliation, FinOps cap usage, unenriched backfill queue, voice calls, or quarantine counts (raw DNC PII is automatically redacted per ${complianceLaw}).`,
    },
  ]);

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        text: `Connected to ${tenantName} read-only ledger. Ask me about mathematical reconciliation, FinOps cap usage, unenriched backfill queue, voice calls, or quarantine counts (raw DNC PII is automatically redacted per ${complianceLaw}).`,
      },
    ]);
  }, [tenantName, complianceLaw]);

  if (!open) return null;

  const sendPrompt = (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isPending) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");

    startTransition(async () => {
      await new Promise((r) => setTimeout(r, 250));
      const res = await askWorkspaceCopilotAction(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.data?.answer || res.message,
          tokens: res.data?.tokensUsed,
        },
      ]);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0A194E]/35 backdrop-blur-xs" role="dialog" aria-label="Workspace AI Copilot">
      <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-[#E4EBF5] flex flex-col justify-between">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-[#0A2472] to-[#1750AC] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <Bot className="w-5 h-5 text-[#5CE1C6]" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Ops Integrity Copilot</h3>
              <p className="text-[11px] text-white/75 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#5CE1C6]" /> Scoped to {tenantName} • PII Redacted
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
            aria-label="Close Copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#F6F9FD]">
          <div className="flex flex-wrap gap-1.5 pb-2">
            {[
              "Is the reconciliation equation balanced?",
              "Show current FinOps spend vs cap",
              "Any unenriched leads waiting for backfill?",
              "Voice AI call outcomes",
              "Why are leads in quarantine?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendPrompt(q)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white border border-[#DCE5F2] text-[#1649C7] hover:bg-[#EEF4FF] transition"
              >
                {q}
              </button>
            ))}
          </div>

          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-[#1649C7] text-white ml-10 rounded-br-sm"
                  : "bg-white border border-[#E6ECF5] text-[#172554] mr-6 rounded-bl-sm shadow-xs"
              }`}
            >
              <p>{m.text}</p>
              {m.tokens && (
                <p className="text-[10px] font-mono text-slate-400 mt-1.5">
                  Read-only tool query • {m.tokens} tokens • $0.0002
                </p>
              )}
            </div>
          ))}

          {isPending && (
            <div className="p-3 rounded-2xl bg-white border border-[#E6ECF5] text-xs text-slate-500 flex items-center gap-2 w-fit">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1649C7]" />
              <span>Querying {tenantName} ledger...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="p-4 bg-white border-t border-[#E8EEF6] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about ledger counts, quarantine, or FinOps..."
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#DCE4F0] bg-[#FAFBFD] text-xs text-[#172554] focus:outline-none focus:border-[#1649C7]"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="p-2.5 rounded-xl bg-[#1649C7] hover:bg-[#1E5EFF] text-white disabled:opacity-50 transition"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
