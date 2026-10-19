/**
 * VoiceCaptureSheet — the confirm card in a bottom sheet, for the Clients and
 * Deals lists. Closing the sheet without confirming saves nothing.
 */

import type { CaptureProposal } from "@agent-runway/core/lib/capture/types";
import { Sheet } from "@/components/ui/Sheet";
import { VoiceCaptureCard } from "./VoiceCaptureCard";

interface Props {
  proposal: CaptureProposal | null;
  onClose: () => void;
}

export function VoiceCaptureSheet({ proposal, onClose }: Props) {
  return (
    <Sheet visible={!!proposal} onClose={onClose} title="Review your note" maxHeight="92%">
      {/* Keyed by the note, so a new note starts with a fresh card. */}
      {proposal && <VoiceCaptureCard key={`${proposal.today}-${proposal.transcript.length}-${proposal.transcript.slice(0, 24)}`} proposal={proposal} onClose={onClose} />}
    </Sheet>
  );
}
