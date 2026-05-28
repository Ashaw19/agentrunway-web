/**
 * Voice & Personality Quiz — mobile screen.
 *
 * Mobile parity for the web `<VoiceQuizModal>`
 * (`apps/web/app/(app)/settings/voice-quiz-modal.tsx`). Both surfaces
 * consume the same canonical question set + derivation logic from
 * `@agent-runway/core/voice-quiz` — the lift to that shared lib was the
 * gating step before this screen could exist without duplicating data.
 *
 * Flow:
 *   1. Step-through 12 questions, multi-select per question, progress bar.
 *   2. Summary screen with derived traits + the AI voice paragraph the
 *      Flight Crew prompt assembly consumes.
 *   3. Save persists `communication_profile` (JSONB) + `ai_voice_guide`
 *      (plain text) on `user_settings`. Direct supabase client write —
 *      same pattern as `apps/mobile/app/(app)/profile/settings.tsx`
 *      (`saveGci`/`saveTx`), RLS-scoped to the authed user. No new
 *      `/api/mobile/voice-quiz` route — JSONB writes from mobile already
 *      flow direct.
 *
 * Voice Quiz is brand-voice intake, not tax. Skips `TaxBoundary`
 * intentionally per the mobile parity dispatch (2026-05-27).
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  QUIZ_QUESTIONS,
  deriveProfile,
  buildAiVoiceSummary,
  VOICE_TRAIT_LABELS,
} from "@agent-runway/core/voice-quiz";
import type { CommunicationProfile } from "@agent-runway/core/types/database";
import { useDataStore } from "@/stores/data-store";
import { supabase } from "@/lib/supabase";
import { useT } from "@/lib/useT";
import {
  useColors,
  useTheme,
  shadows,
  Space,
  Radius,
  Type,
} from "@/lib/theme";
import { Sparkles, Check, ChevronLeft, ChevronRight } from "lucide-react-native";

// ── Trait → mobile theme token map ─────────────────────────────────────────
// Web uses Tailwind utility strings; mobile maps to theme tokens so the
// same trait shows up with the same semantic colour. If a new trait is
// added to `VOICE_TRAIT_LABELS` in the shared lib, mirror its colour
// here AND in `apps/web/app/(app)/settings/voice-quiz-modal.tsx`.
function traitColor(trait: string, c: ReturnType<typeof useColors>): {
  fg: string;
  bg: string;
} {
  switch (trait) {
    case "expressive":
    case "connector":
      return { fg: c.warning, bg: c.warningDim };
    case "warm":
    case "advocate":
      return { fg: c.danger, bg: c.dangerDim };
    case "concise":
    case "closer":
      return { fg: c.primary, bg: c.primaryDim };
    case "candid":
      return { fg: c.gold, bg: c.goldDim };
    case "plain_language":
    case "educator":
      return { fg: c.success, bg: c.successDim };
    case "phone_preferred":
    case "trusted_advisor":
      return { fg: c.purple, bg: c.purpleDim };
    default:
      return { fg: c.textMuted, bg: c.divider };
  }
}

export default function VoiceQuizScreen() {
  const router = useRouter();
  const c = useColors();
  const { mode } = useTheme();
  const sh = shadows(mode);
  const { t } = useT("profile");
  const store = useDataStore();
  const existing = store.settings?.communication_profile ?? null;

  const [step, setStep] = useState<"quiz" | "summary">("quiz");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(
    existing?.answers ?? {},
  );
  const [saving, setSaving] = useState(false);

  const question = QUIZ_QUESTIONS[currentQ];
  const selected = answers[question.id] ?? [];
  const totalQ = QUIZ_QUESTIONS.length;
  const progress = ((currentQ + 1) / totalQ) * 100;

  function toggleOption(key: string) {
    Haptics.selectionAsync().catch(() => {
      /* haptics is best-effort */
    });
    const current = answers[question.id] ?? [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    setAnswers((prev) => ({ ...prev, [question.id]: next }));
  }

  function handleNext() {
    if (currentQ < totalQ - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      setStep("summary");
    }
  }

  function handleBack() {
    if (step === "summary") {
      setStep("quiz");
      setCurrentQ(totalQ - 1);
      return;
    }
    if (currentQ > 0) {
      setCurrentQ((q) => q - 1);
      return;
    }
    router.back();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const derived = deriveProfile(answers);
      const ai_voice_summary = buildAiVoiceSummary(derived);
      const profile: CommunicationProfile = {
        completed: true,
        answers,
        derived,
        ai_voice_summary,
      };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Mirror of web `saveVoiceProfile` in
      // `apps/web/app/(app)/settings/settings-content.tsx` — same two
      // columns, same shape. `ai_voice_guide` is a flat text mirror so
      // the Flight Crew system-prompt assembly can read it without
      // touching the JSONB blob.
      const { error } = await supabase
        .from("user_settings")
        .update({
          communication_profile: profile as unknown as Record<string, unknown>,
          ai_voice_guide: ai_voice_summary,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await store.fetchAll();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {
          /* haptics is best-effort */
        },
      );
      router.back();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {
          /* haptics is best-effort */
        },
      );
      Alert.alert(
        t("voiceQuiz.saveErrorTitle"),
        t("voiceQuiz.saveErrorBody"),
      );
    } finally {
      setSaving(false);
    }
  }

  // Summary screen derived values
  const derived = step === "summary" ? deriveProfile(answers) : null;
  const summaryTraits = derived
    ? [...derived.voice_traits, ...derived.archetype].slice(0, 6)
    : [];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Space.xl,
          paddingTop: Space.md,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "quiz" ? (
          <>
            {/* ── Header ── */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Space.sm,
                marginBottom: Space.xs,
              }}
            >
              <Sparkles size={18} color={c.purple} />
              <Text style={{ ...Type.h2, color: c.text }}>
                {t("voiceQuiz.title")}
              </Text>
            </View>
            <Text
              style={{
                ...Type.caption,
                color: c.textDim,
                marginBottom: Space.lg,
              }}
            >
              {t("voiceQuiz.subtitle")}
            </Text>

            {/* ── Progress ── */}
            <View style={{ marginBottom: Space.xl }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: Space.xs,
                }}
              >
                <Text style={{ ...Type.micro, color: c.textDim }}>
                  {t("voiceQuiz.progress", {
                    current: currentQ + 1,
                    total: totalQ,
                  })}
                </Text>
                <Text style={{ ...Type.micro, color: c.textDim }}>
                  {t("voiceQuiz.percentComplete", {
                    percent: Math.round(progress),
                  })}
                </Text>
              </View>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: c.divider,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: 8,
                    width: `${progress}%`,
                    backgroundColor: c.purple,
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>

            {/* ── Question ── */}
            <View
              style={[
                {
                  backgroundColor: c.card,
                  borderRadius: Radius.xl,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  padding: Space.lg,
                  marginBottom: Space.lg,
                },
                sh.card,
              ]}
            >
              <Text
                style={{
                  ...Type.h3,
                  color: c.text,
                  marginBottom: Space.xs,
                  lineHeight: 24,
                }}
              >
                {question.question}
              </Text>
              <Text style={{ ...Type.micro, color: c.textDim }}>
                {t("voiceQuiz.selectAll")}
              </Text>
            </View>

            {/* ── Options ── */}
            <View style={{ gap: Space.sm }}>
              {question.options.map((opt) => {
                const isSelected = selected.includes(opt.key);
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => toggleOption(opt.key)}
                    style={({ pressed }) => ({
                      borderRadius: Radius.lg,
                      borderWidth: 1,
                      borderColor: isSelected
                        ? c.purple
                        : c.cardBorder,
                      backgroundColor: isSelected
                        ? c.purpleDim
                        : c.card,
                      padding: Space.md,
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: Space.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: isSelected
                          ? c.purple
                          : c.divider,
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          color: isSelected ? "#FFFFFF" : c.textMuted,
                        }}
                      >
                        {opt.key}
                      </Text>
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        ...Type.body,
                        color: isSelected ? c.text : c.textSecondary,
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {opt.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ── Navigation ── */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: Space.xl,
                gap: Space.md,
              }}
            >
              <Pressable
                onPress={handleBack}
                disabled={currentQ === 0}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  paddingVertical: Space.md,
                  borderRadius: Radius.lg,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  opacity: pressed ? 0.7 : currentQ === 0 ? 0.4 : 1,
                })}
              >
                <ChevronLeft size={16} color={c.textMuted} />
                <Text
                  style={{ ...Type.bodyBold, color: c.textMuted }}
                >
                  {t("voiceQuiz.back")}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleNext}
                style={({ pressed }) => ({
                  flex: 2,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  paddingVertical: Space.md,
                  borderRadius: Radius.lg,
                  backgroundColor: c.purple,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    ...Type.bodyBold,
                    color: "#FFFFFF",
                  }}
                >
                  {currentQ === totalQ - 1
                    ? t("voiceQuiz.seeResults")
                    : t("voiceQuiz.next")}
                </Text>
                <ChevronRight size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          </>
        ) : (
          /* ── Summary screen ── */
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Space.sm,
                marginBottom: Space.xs,
              }}
            >
              <Sparkles size={18} color={c.purple} />
              <Text style={{ ...Type.h2, color: c.text }}>
                {t("voiceQuiz.summaryTitle")}
              </Text>
            </View>
            <Text
              style={{
                ...Type.caption,
                color: c.textDim,
                marginBottom: Space.xl,
              }}
            >
              {t("voiceQuiz.summarySubtitle")}
            </Text>

            {/* ── Trait badges ── */}
            {summaryTraits.length > 0 && (
              <View style={{ marginBottom: Space.xl }}>
                <Text
                  style={{
                    ...Type.label,
                    color: c.textMuted,
                    marginBottom: Space.sm,
                  }}
                >
                  {t("voiceQuiz.traitsLabel")}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: Space.sm,
                  }}
                >
                  {summaryTraits.map((trait) => {
                    const { fg, bg } = traitColor(trait, c);
                    return (
                      <View
                        key={trait}
                        style={{
                          backgroundColor: bg,
                          paddingHorizontal: Space.md,
                          paddingVertical: 6,
                          borderRadius: Radius.pill,
                          borderWidth: 1,
                          borderColor: fg + "40",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: fg,
                          }}
                        >
                          {VOICE_TRAIT_LABELS[trait] ??
                            trait.replace(/_/g, " ")}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── Stats row ── */}
            {derived && (
              <View
                style={{
                  flexDirection: "row",
                  gap: Space.sm,
                  marginBottom: Space.xl,
                }}
              >
                <StatPill
                  label={t("voiceQuiz.humor")}
                  value={t(`voiceQuiz.humorValue.${derived.humor_level}`)}
                  c={c}
                />
                <StatPill
                  label={t("voiceQuiz.directness")}
                  value={t(`voiceQuiz.directnessValue.${derived.directness}`)}
                  c={c}
                />
                <StatPill
                  label={t("voiceQuiz.style")}
                  value={t(`voiceQuiz.verbosityValue.${derived.verbosity}`)}
                  c={c}
                />
              </View>
            )}

            {/* ── AI voice summary ── */}
            {derived && (
              <View
                style={{
                  marginBottom: Space.xl,
                }}
              >
                <Text
                  style={{
                    ...Type.label,
                    color: c.textMuted,
                    marginBottom: Space.sm,
                  }}
                >
                  {t("voiceQuiz.aiIntroLabel")}
                </Text>
                <View
                  style={{
                    backgroundColor: c.purpleDim,
                    borderLeftWidth: 4,
                    borderLeftColor: c.purple,
                    padding: Space.lg,
                    borderRadius: Radius.md,
                  }}
                >
                  <Text
                    style={{
                      ...Type.body,
                      color: c.text,
                      fontStyle: "italic",
                      lineHeight: 22,
                    }}
                  >
                    {buildAiVoiceSummary(derived)}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Actions ── */}
            <View
              style={{
                flexDirection: "row",
                gap: Space.md,
                marginTop: Space.lg,
              }}
            >
              <Pressable
                onPress={handleBack}
                disabled={saving}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  paddingVertical: Space.md,
                  borderRadius: Radius.lg,
                  borderWidth: 1,
                  borderColor: c.cardBorder,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <ChevronLeft size={16} color={c.textMuted} />
                <Text
                  style={{ ...Type.bodyBold, color: c.textMuted }}
                >
                  {t("voiceQuiz.back")}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={({ pressed }) => ({
                  flex: 2,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: Space.xs,
                  paddingVertical: Space.md,
                  borderRadius: Radius.lg,
                  backgroundColor: c.purple,
                  opacity: pressed ? 0.85 : saving ? 0.6 : 1,
                })}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Check size={16} color="#FFFFFF" />
                )}
                <Text
                  style={{
                    ...Type.bodyBold,
                    color: "#FFFFFF",
                  }}
                >
                  {saving
                    ? t("voiceQuiz.saving")
                    : t("voiceQuiz.save")}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  c,
}: {
  label: string;
  value: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.card,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: c.cardBorder,
        padding: Space.md,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          ...Type.micro,
          color: c.textDim,
          marginBottom: 2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          ...Type.bodyBold,
          color: c.text,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
