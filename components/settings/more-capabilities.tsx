import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProCapabilities } from "@/lib/pro/contract";
import { capabilityPrompts } from "@/lib/pro/prompts";

/**
 * Settings: the capabilities this account cannot use, and whatever the optional
 * module offered to say about them.
 *
 * **Renders nothing in a build without that module**, and that is the whole
 * reason it is safe for this to live in the public repository. `capabilities()`
 * comes back with no ctas there, `capabilityPrompts` returns an empty list, and
 * this returns null — no card, no heading, no disabled controls. A self-hosted
 * install shows exactly what it did before this file existed.
 *
 * The only words here are the title and the one-line description. Everything
 * else — what each capability is worth, what the button says, where it goes —
 * comes from the module, because only the module knows whether the honest
 * sentence is "you have not bought this" or "you have, and it is not built
 * yet". This component draws both without being able to tell them apart.
 */

/**
 * Capabilities that draw their own card in Settings already.
 *
 * Each handles its own unavailable state in place, next to the thing it is
 * about, which is better than a line in a list somewhere else on the page.
 * Including one here would put the same request in front of the same person
 * twice on one screen.
 *
 * A capability joins this list on the day it grows a card, not the day it is
 * built — an unbought account sees that card in its locked state, and that is
 * the ask. Ones with no card of their own stay out: nothing else on the page
 * would mention them.
 */
const DRAWS_ITS_OWN_CARD = ["programmaticApi", "retentionRules", "calendarFeed", "canvasSync"] as const;

export function MoreCapabilities({ capabilities }: { capabilities: ProCapabilities }) {
  const groups = capabilityPrompts(capabilities, DRAWS_ITS_OWN_CARD);

  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((group) => (
        <Card key={`${group.label} ${group.href}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              More in Evermind
            </CardTitle>
            <CardDescription>Things Evermind can do that this account cannot use yet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="space-y-4">
              {group.prompts.map((prompt) => (
                <li key={prompt.name}>
                  <p className="font-medium">{prompt.title}</p>
                  <p className="text-sm text-muted-foreground">{prompt.blurb}</p>
                </li>
              ))}
            </ul>
            <Button asChild>
              <Link href={group.href}>{group.label}</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
