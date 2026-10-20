/**
 * After a call from Next up: "How did the call with <name> go?"
 *
 *   the voice note button   record a note; what it proposes shows on the
 *                           confirm card in this same sheet, and nothing is
 *                           saved until Confirm (iOS shows one modal at a
 *                           time, so the card opens here, not in a second sheet)
 *   Just log the call       logs the call, nothing else
 *   Not now                 nothing is logged
 *
 * The dashboard's "Record a note" card opens the same sheet with no client
 * and no "Just log the call".
 */

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { CaptureContext, CaptureProposal } from "@agent-runway/core/lib/capture/types";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { VoiceCaptureButton } from "@/components/voice/VoiceCaptureButton";
import { VoiceCaptureCard } from "@/components/voice/VoiceCaptureCard";
import { Space } from "@/lib/theme";

export function PostCallSheet({
  visible,
  title,
  context,
  onRecorded,
  onSaved,
  onLogOnly,
  logging = false,
  onNotNow,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** The client the note is about ("she" is them). */
  context?: CaptureContext;
  /** A note was recorded and read: its confirm card is showing. */
  onRecorded?: () => void;
  /** The confirm card saved (or queued) at least one item. */
  onSaved?: () => void;
  /** "Just log the call"; left out, the button isn't shown. */
  onLogOnly?: () => void;
  logging?: boolean;
  onNotNow: () => void;
  /** Closed without a choice (the close button, the backdrop, Done on the confirm card). */
  onClose: () => void;
}) {
  const { t } = useTranslation("home");
  const [proposal, setProposal] = useState<CaptureProposal | null>(null);

  // Each opening starts at the question, not at an old note.
  useEffect(() => {
    if (visible) setProposal(null);
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      onClose={() => !logging && onClose()}
      title={proposal ? t("postCall.review") : title}
      maxHeight={proposal ? "92%" : undefined}
    >
      {proposal ? (
        // Keyed by the note, so a new note starts with a fresh card.
        <VoiceCaptureCard
          key={`${proposal.today}-${proposal.transcript.length}-${proposal.transcript.slice(0, 24)}`}
          proposal={proposal}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : (
        <View style={{ gap: Space.md, paddingBottom: Space.lg }}>
          <VoiceCaptureButton
            variant="inline"
            context={context}
            onProposal={(p) => {
              setProposal(p);
              onRecorded?.();
            }}
          />
          {onLogOnly && (
            <Button label={t("postCall.logOnly")} variant="secondary" icon="call-outline" onPress={onLogOnly} loading={logging} />
          )}
          <Button label={t("postCall.notNow")} variant="ghost" onPress={onNotNow} disabled={logging} />
        </View>
      )}
    </Sheet>
  );
}
