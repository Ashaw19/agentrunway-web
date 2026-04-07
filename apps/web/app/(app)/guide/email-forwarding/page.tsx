import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";
import { EmailForwardingSteps } from "./email-forwarding-steps";

export const dynamic = "force-dynamic";

/**
 * Onboarding doc: "How to forward client replies into Agent Runway"
 *
 * ~60 seconds of reading. Shows the agent their unique forwarding address,
 * walks through Gmail filter setup, and explains what happens when a reply
 * lands (engagement score +15, nurture sequences auto-pause, inbox view).
 */
export default async function EmailForwardingGuidePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("inbound_alias")
    .eq("user_id", user.id)
    .maybeSingle();

  const alias = (settings?.inbound_alias as string | null) ?? null;
  const forwardingAddress = alias ? `${alias}@inbox.agentrunway.ca` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <Link
          href="/inbox"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Inbox
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Forward client replies into Agent Runway
        </h1>
        <p className="text-sm text-muted-foreground">
          About 60 seconds. Once set up, every client reply you receive will
          automatically link to their contact, boost their engagement score,
          and pause any active nurture sequence so you don&apos;t over-email
          an engaged lead.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Your unique forwarding address
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmailForwardingSteps forwardingAddress={forwardingAddress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What happens automatically</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Contact linking.</strong> We
            match the sender&apos;s email to your CRM and link the reply to
            that contact. Unknown senders show up as &ldquo;Unresolved&rdquo;
            in your Inbox for one-click linking.
          </p>
          <p>
            <strong className="text-foreground">Engagement score boost.</strong>{" "}
            A reply is worth <strong>+15 points</strong> on that
            contact&apos;s engagement score with a 30-day half-life. Replies
            are the strongest positive signal we track.
          </p>
          <p>
            <strong className="text-foreground">Nurture auto-pause.</strong>{" "}
            Any active nurture sequence for that contact is automatically
            paused, so you won&apos;t keep drip-sending to someone who&apos;s
            actively engaged with you.
          </p>
          <p>
            <strong className="text-foreground">Outreach matching.</strong>{" "}
            If the reply came in within 60 days of an outreach we
            sent them, we link the reply back to that specific message.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Privacy &amp; safety</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your forwarding address is unique, opaque, and not guessable.
            Only emails sent to your specific alias reach your Agent Runway
            inbox — nobody else&apos;s.
          </p>
          <p>
            We store message metadata (sender, subject, preview) and fetch
            body + attachments on-demand when you view them. Nothing is shared
            with other users, and you can delete any message from your Inbox
            at any time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
