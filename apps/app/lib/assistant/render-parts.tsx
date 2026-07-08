import React, { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { UIMessage } from "ai";

type Part = UIMessage["parts"][number];

type NavAction = { action: "navigate"; path: string } & Record<string, unknown>;
type FormAction = { action: "open_form"; path: string; prefill?: Record<string, unknown> };

function isNavAction(x: unknown): x is NavAction {
  return !!x && typeof x === "object" && (x as { action?: string }).action === "navigate";
}

function isFormAction(x: unknown): x is FormAction {
  return !!x && typeof x === "object" && (x as { action?: string }).action === "open_form";
}

function NavigationEffect({ target }: { target: string }) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    router.push(target as never);
  }, [router, target]);
  return null;
}

function ToolPill({ label, tone = "default" }: { label: string; tone?: "default" | "ok" | "error" }) {
  const bg = tone === "error" ? "bg-red-100" : tone === "ok" ? "bg-emerald-100" : "bg-slate-100";
  const fg = tone === "error" ? "text-red-800" : tone === "ok" ? "text-emerald-800" : "text-slate-700";
  return (
    <View className={`self-start rounded-full px-3 py-1 ${bg} mt-1`}>
      <Text className={`text-xs font-body-medium ${fg}`}>{label}</Text>
    </View>
  );
}

function humanizeToolName(toolType: string): string {
  // "tool-create_contact" -> "Creating contact…"
  const raw = toolType.replace(/^tool-/, "");
  return raw.replace(/_/g, " ");
}

function EntityCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50"
    >
      <Text className="font-heading-semibold text-slate-900">{title}</Text>
      {subtitle ? <Text className="text-xs text-slate-500 mt-0.5">{subtitle}</Text> : null}
    </Pressable>
  );
}

function CreatedContactCard({ output }: { output: { contact?: { id?: string; displayName?: string; company?: string | null } } }) {
  const router = useRouter();
  const c = output?.contact;
  if (!c?.id || !c?.displayName) return <ToolPill label="Created contact" tone="ok" />;
  return (
    <EntityCard
      title={c.displayName}
      subtitle={c.company ?? "Contact created"}
      onPress={() => router.push(`/contact/${c.id}` as never)}
    />
  );
}

function CreatedConversationCard({ output }: { output: { conversation?: { id?: string; medium?: string; happenedAt?: string } } }) {
  const router = useRouter();
  const conv = output?.conversation;
  if (!conv?.id) return <ToolPill label="Logged conversation" tone="ok" />;
  const when = conv.happenedAt ? new Date(conv.happenedAt).toLocaleString() : "";
  return (
    <EntityCard
      title={`${conv.medium ?? "Conversation"} logged`}
      subtitle={when}
      onPress={() => router.push(`/conversation/${conv.id}` as never)}
    />
  );
}

function CreatedEventCard({ output }: { output: { event?: { id?: string; title?: string; startAt?: string } } }) {
  const router = useRouter();
  const ev = output?.event;
  if (!ev?.id) return <ToolPill label="Created event" tone="ok" />;
  const when = ev.startAt ? new Date(ev.startAt).toLocaleString() : "";
  return (
    <EntityCard
      title={ev.title ?? "Event"}
      subtitle={when}
      onPress={() => router.push(`/event/${ev.id}` as never)}
    />
  );
}

function CreatedReminderCard({ output }: { output: { reminder?: { id?: string; title?: string; dueAt?: string } } }) {
  const router = useRouter();
  const r = output?.reminder;
  if (!r?.id) return <ToolPill label="Created reminder" tone="ok" />;
  const due = r.dueAt ? new Date(r.dueAt).toLocaleString() : "";
  return (
    <EntityCard
      title={r.title ?? "Reminder"}
      subtitle={due ? `Due ${due}` : "Reminder created"}
      onPress={() => router.push(`/reminder/${r.id}` as never)}
    />
  );
}

function CandidatesCard({ output, kind }: { output: { candidates?: Array<{ id: string; displayName?: string; title?: string }> }; kind: "contact" | "event" | "conversation" | "reminder" }) {
  const router = useRouter();
  const items = output?.candidates ?? [];
  if (items.length === 0) return <ToolPill label="No matches" />;
  return (
    <View className="mt-1">
      {items.slice(0, 8).map((it) => {
        const label = it.displayName ?? it.title ?? it.id;
        return (
          <EntityCard
            key={it.id}
            title={label}
            onPress={() => router.push(`/${kind}/${it.id}` as never)}
          />
        );
      })}
    </View>
  );
}

function renderToolOutput(toolType: string, output: unknown): React.ReactNode {
  // Navigation side-effect tools
  if (isNavAction(output)) {
    return <NavigationEffect target={output.path} />;
  }
  if (isFormAction(output)) {
    const prefill = output.prefill && Object.keys(output.prefill).length > 0
      ? `?prefill=${encodeURIComponent(JSON.stringify(output.prefill))}`
      : "";
    return <NavigationEffect target={`${output.path}${prefill}`} />;
  }

  // Error shape
  if (output && typeof output === "object" && "error" in (output as { error?: string }) && (output as { error?: string }).error) {
    return <ToolPill label={String((output as { error: string }).error)} tone="error" />;
  }

  // Rich created cards
  const name = toolType.replace(/^tool-/, "");
  switch (name) {
    case "create_contact":
      return <CreatedContactCard output={output as any} />;
    case "create_conversation":
      return <CreatedConversationCard output={output as any} />;
    case "create_event":
      return <CreatedEventCard output={output as any} />;
    case "create_reminder":
      return <CreatedReminderCard output={output as any} />;
    case "search_contacts":
    case "list_contacts":
      return <CandidatesCard output={output as any} kind="contact" />;
    case "search_events":
    case "list_upcoming_events":
      return <CandidatesCard output={{ candidates: (output as any)?.events }} kind="event" />;
    case "search_conversations":
      return <CandidatesCard output={{ candidates: (output as any)?.conversations }} kind="conversation" />;
    case "list_reminders":
    case "list_open_reminders":
      return <CandidatesCard output={{ candidates: (output as any)?.reminders }} kind="reminder" />;
    default:
      return <ToolPill label={`Done: ${humanizeToolName(toolType)}`} tone="ok" />;
  }
}

export function renderPart(part: Part, key: string): React.ReactNode {
  if (part.type === "text") {
    const text = (part as { text: string }).text;
    if (!text) return null;
    return (
      <Text key={key} className="font-body text-slate-900 leading-5">
        {text}
      </Text>
    );
  }

  // Tool parts
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    const p = part as { type: string; state?: string; output?: unknown };
    if (p.state === "input-streaming" || p.state === "input-available") {
      return <ToolPill key={key} label={`${humanizeToolName(p.type)}…`} />;
    }
    if (p.state === "output-error") {
      return <ToolPill key={key} label={`${humanizeToolName(p.type)} failed`} tone="error" />;
    }
    if (p.state === "output-available") {
      return <React.Fragment key={key}>{renderToolOutput(p.type, p.output)}</React.Fragment>;
    }
    return null;
  }

  if (part.type === "dynamic-tool") {
    const p = part as { toolName: string; state?: string };
    return <ToolPill key={key} label={humanizeToolName(`tool-${p.toolName}`)} />;
  }

  return null;
}
