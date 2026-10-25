import Link from "next/link";
import { markAllRead } from "./actions";
import { deleteNotifications } from "@/app/actions";
import { timeAgo } from "@/components/shell/app-shell";
import { Badge, Card, CardEmpty, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { must, sb } from "@/lib/db";
import { currentMember } from "@/lib/session";

const KIND: Record<string, { word: string; tone: "green" | "blue" | "amber" | "red" | "neutral" }> = {
  hot_lead: { word: "Hot lead", tone: "green" },
  assigned: { word: "Given to you", tone: "blue" },
  follow_up: { word: "Follow up", tone: "amber" },
  reply: { word: "Reply", tone: "green" },
  digest: { word: "Summary", tone: "neutral" },
  system: { word: "Notice", tone: "neutral" },
};

export default async function NotificationsPage() {
  const me = await currentMember();
  const items = me
    ? (must(await sb().from("notifications").select("*").eq("member_id", me.id).order("created_at", { ascending: false }).limit(100)) as {
        id: number;
        kind: string;
        title: string;
        body: string | null;
        lead_id: number | null;
        read_at: string | null;
        created_at: string;
      }[])
    : [];
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Hot leads, leads given to you and follow ups. Your extension also shows these as desktop alerts within a minute."
        actions={
          <>
            <form action={markAllRead}>
              <SubmitButton pendingText="Marking...">Mark all as read</SubmitButton>
            </form>
            <form action={deleteNotifications}>
              <input type="hidden" name="back" value="/notifications" />
              <SubmitButton variant="secondary" pendingText="Clearing..." confirm="Clear all your notifications?">
                Clear all
              </SubmitButton>
            </form>
          </>
        }
      />
      <Card padded={false}>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6 ${n.read_at ? "" : "bg-canvas"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND[n.kind]?.tone ?? "neutral"}>{KIND[n.kind]?.word ?? n.kind}</Badge>
                    {n.read_at ? null : <span className="text-[13px] font-semibold text-primary">New</span>}
                  </div>
                  <p className="mt-1 font-semibold">{n.lead_id ? <Link href={`/leads/${n.lead_id}`} className="hover:text-primary hover:underline">{n.title}</Link> : n.title}</p>
                  {n.body ? <p className="line-clamp-2 text-[14px] text-muted-foreground">{n.body}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] whitespace-nowrap text-muted-foreground">{timeAgo(n.created_at)}</span>
                  <form action={deleteNotifications}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="back" value="/notifications" />
                    <SubmitButton variant="ghost" size="sm" pendingText="..." aria-label={`Remove ${n.title}`}>
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <CardEmpty title="Nothing yet" description="You will see hot leads, leads given to you and follow ups here." />
        )}
      </Card>
    </>
  );
}
