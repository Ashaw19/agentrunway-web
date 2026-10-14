/**
 * Tick-off sheet for a Checklist item that has a client: the phone's
 * version of web's CompleteItemDialog (components/checklist/
 * complete-item-dialog.tsx), recorded the same way through the same core
 * writers (core/lib/checklist-actions):
 *   - Save to their profile → contact logged (counts as contact), item done
 *   - Couldn't reach them   → note logged (not contact), item moves to tomorrow
 *   - Just mark done        → item done, nothing logged
 * Logging on the client also marks their memory profile outdated, so
 * Flight Crew picks up the contact.
 */

import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  CHECKLIST_CONTACT_METHODS,
  METHOD_LABEL,
  type ChecklistContactMethod,
} from "@agent-runway/core/lib/checklist";
import { Sheet } from "@/components/ui/Sheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useDataStore, type ContactTask } from "@/stores/data-store";
import { useColors, Space, Radius, Type } from "@/lib/theme";

const METHOD_ICON: Record<ChecklistContactMethod, keyof typeof Ionicons.glyphMap> = {
  call: "call-outline",
  text: "chatbubble-outline",
  email: "mail-outline",
  meeting: "people-outline",
};

export function CompleteTaskSheet({
  task,
  clientName,
  onClose,
}: {
  /** The item being ticked off; null hides the sheet. Must have a client_id. */
  task: ContactTask | null;
  clientName: string;
  onClose: () => void;
}) {
  const c = useColors();
  const { t } = useTranslation("profile");
  const { completeTaskWithContact, rescheduleTaskAfterAttempt, markTaskDone } = useDataStore();
  const [method, setMethod] = useState<ChecklistContactMethod>("call");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<null | "contact" | "attempt" | "done">(null);

  // Fresh form for each item.
  useEffect(() => {
    if (task) {
      setMethod("call");
      setNote("");
      setSaving(null);
    }
  }, [task?.id]);

  if (!task) return null;
  const name = clientName || t("checklist.thisClient");
  const busy = saving !== null;

  const run = async (kind: "contact" | "attempt" | "done") => {
    setSaving(kind);
    const ok =
      kind === "contact"
        ? await completeTaskWithContact(task, method, note)
        : kind === "attempt"
          ? await rescheduleTaskAfterAttempt(task, method, note)
          : await markTaskDone(task);
    setSaving(null);
    if (ok) onClose();
  };

  return (
    <Sheet visible={!!task} onClose={() => !busy && onClose()} title={task.title} maxHeight="90%">
      <View style={{ gap: Space.lg, paddingBottom: Space.lg }}>
        <Text style={[Type.body, { color: c.textMuted }]}>{t("checklist.howDidItGo", { name })}</Text>

        <View style={{ gap: Space.xs }}>
          <Text style={[Type.caption, { color: c.textMuted, marginLeft: Space.xs }]}>
            {t("checklist.methodLabel")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Space.sm }}>
            {CHECKLIST_CONTACT_METHODS.map((m) => {
              const active = method === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMethod(m)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Space.xs,
                    paddingHorizontal: Space.md,
                    height: 36,
                    borderRadius: Radius.pill,
                    borderWidth: 1,
                    borderColor: active ? c.primary : c.cardBorder,
                    backgroundColor: active ? c.primaryDim : c.card,
                  }}
                >
                  <Ionicons name={METHOD_ICON[m]} size={15} color={active ? c.primary : c.textDim} />
                  <Text style={[Type.caption, { color: active ? c.primary : c.textMuted, fontWeight: "600" }]}>
                    {METHOD_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          value={note}
          onChange={setNote}
          placeholder={t("checklist.notePlaceholder")}
          multiline
        />

        <Button
          label={saving === "contact" ? t("checklist.saving") : t("checklist.saveToProfile")}
          onPress={() => run("contact")}
          loading={saving === "contact"}
          disabled={busy}
          variant="primary"
          icon="checkmark-circle"
        />
        <View style={{ flexDirection: "row", gap: Space.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t("checklist.couldntReach")}
              onPress={() => run("attempt")}
              loading={saving === "attempt"}
              disabled={busy}
              variant="secondary"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t("checklist.justDone")}
              onPress={() => run("done")}
              loading={saving === "done"}
              disabled={busy}
              variant="secondary"
            />
          </View>
        </View>
        <Text style={[Type.micro, { color: c.textDim }]}>{t("checklist.footnote")}</Text>
      </View>
    </Sheet>
  );
}
