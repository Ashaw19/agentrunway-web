"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface Props {
  forwardingAddress: string | null;
}

/**
 * Client-side portion of the email-forwarding guide: copy-to-clipboard for
 * the unique address plus the step-by-step Gmail filter walkthrough.
 */
export function EmailForwardingSteps({ forwardingAddress }: Props) {
  const [copied, setCopied] = useState(false);

  if (!forwardingAddress) {
    return (
      <p className="text-sm text-muted-foreground">
        Your forwarding address is being generated. Refresh in a moment.
      </p>
    );
  }

  const copy = () => {
    navigator.clipboard.writeText(forwardingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 text-sm font-mono">
          {forwardingAddress}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? (
            <>
              <Check className="mr-1 h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
            </>
          )}
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <p className="font-medium">Set up Gmail forwarding (60 seconds):</p>

        <ol className="space-y-3 text-muted-foreground">
          <li>
            <strong className="text-foreground">1. Add the forwarding address.</strong>{" "}
            In Gmail, open <em>Settings → See all settings → Forwarding and POP/IMAP →
            Add a forwarding address</em>. Paste the address above and click
            Next. Gmail will send a confirmation email to your Agent Runway
            inbox — come back here and click it to confirm.
          </li>
          <li>
            <strong className="text-foreground">2. Create a filter for replies.</strong>{" "}
            Open <em>Settings → Filters and Blocked Addresses → Create a new
            filter</em>. In the <em>Subject</em> field, enter{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">Re:</code>{" "}
            — this matches any email whose subject starts with &ldquo;Re:&rdquo;.
          </li>
          <li>
            <strong className="text-foreground">3. Forward matched messages.</strong>{" "}
            Click <em>Create filter</em>, then check{" "}
            <em>Forward it to:</em> and pick the Agent Runway address you
            added in step 1. Click <em>Create filter</em>.
          </li>
          <li>
            <strong className="text-foreground">4. Test it.</strong>{" "}
            Reply to any email in your sent folder and check your Agent
            Runway Inbox. The reply should appear within a few seconds.
          </li>
        </ol>

        <p className="pt-2 text-xs text-muted-foreground">
          Using Outlook or another provider? The same pattern works — add a
          forwarding rule that matches replies (subject starts with
          &ldquo;Re:&rdquo;) and forwards to your unique Agent Runway address.
        </p>
      </div>
    </div>
  );
}
