import { notFound } from "next/navigation";
import { addToGroup, createGroup, deleteGroup, removeFromGroup, renameGroup, startDirect } from "./actions";
import { ChatRoom, RoomList } from "./chat-room";
import { Flash } from "@/components/ui/flash";
import { Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { joinEveryone, myRooms, nameOf, roomFor } from "@/lib/chat";
import { must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

type Person = { id: string; name: string | null; email: string };

function NewChat({ people, meId }: { people: Person[]; meId: string }) {
  const others = people.filter((p) => p.id !== meId);
  const select = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px]";
  return (
    <div className="space-y-2">
      <details className="rounded-xl border border-border p-3">
        <summary className="min-h-[28px] cursor-pointer text-[15px] font-semibold">Message someone</summary>
        <form action={startDirect} className="mt-3 space-y-2">
          <label className="sr-only" htmlFor="dm-person">
            Person
          </label>
          <select id="dm-person" name="person" required className={select} defaultValue="">
            <option value="" disabled>
              Pick a teammate
            </option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {nameOf(p)}
              </option>
            ))}
          </select>
          <SubmitButton size="sm" pendingText="Opening...">
            Open chat
          </SubmitButton>
        </form>
      </details>
      <details className="rounded-xl border border-border p-3">
        <summary className="min-h-[28px] cursor-pointer text-[15px] font-semibold">New group</summary>
        <form action={createGroup} className="mt-3 space-y-2">
          <label className="sr-only" htmlFor="group-name">
            Group name
          </label>
          <Input id="group-name" name="name" required maxLength={80} placeholder="Group name, like Shopify deals" />
          <fieldset className="max-h-48 space-y-1 overflow-y-auto">
            <legend className="mb-1 text-[13px] text-muted-foreground">Who is in it</legend>
            {others.map((p) => (
              <label key={p.id} className="flex min-h-[36px] items-center gap-2 text-[14px]">
                <input type="checkbox" name="people" value={p.id} className="size-5 accent-primary" />
                {nameOf(p)}
              </label>
            ))}
          </fieldset>
          <SubmitButton size="sm" pendingText="Making...">
            Make group
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}

/** Team chat: Everyone, groups and one to one messages. You only ever see rooms you are in. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMember();
  if (!me) notFound();
  const [rooms, people, everyone] = await Promise.all([
    myRooms(me),
    sb().from("members").select("id, name, email").eq("status", "active").order("name").then((r) => must(r) as Person[]),
    joinEveryone(me),
  ]);
  const links = rooms.map((r) => ({ id: r.id, kind: r.kind, title: r.title, unread: r.unread, people: r.people }));
  const side = <NewChat people={people} meId={me.id} />;

  // On a phone, "All chats" shows the list and the new chat forms.
  if (sp.list === "1") {
    return (
      <>
        <h1 className="mb-4 text-[24px] font-bold">Team chat</h1>
        <Flash searchParams={sp} />
        <div className="space-y-4">
          {side}
          <RoomList rooms={links} />
        </div>
      </>
    );
  }

  const roomId = Number(sp.room) || everyone.id;
  const room = await roomFor(me, roomId);
  if (!room) notFound();
  const row = rooms.find((r) => r.id === room.id);
  const inRoom =
    room.kind === "group"
      ? (must(await sb().from("chat_members").select("member_id, is_admin").eq("room_id", room.id)) as { member_id: string; is_admin: boolean }[])
      : [];
  const nameById = new Map(people.map((p) => [p.id, p.id === me.id ? "You" : nameOf(p)]));
  const title = row?.title ?? room.name ?? "Chat";
  const subtitle =
    room.kind === "everyone" ? `Everyone on the team, ${people.length} people` : room.kind === "direct" ? "Only the two of you" : inRoom.map((m) => nameById.get(m.member_id) ?? "Former member").join(", ");

  const tools =
    room.kind === "group" ? (
      <details className="relative">
        <summary className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-border px-3 text-[14px] font-medium hover:bg-muted">Group</summary>
        <div className="absolute right-0 z-20 mt-2 w-[min(320px,calc(100vw-2rem))] space-y-4 rounded-2xl border border-border bg-background p-4 shadow-lg">
          <ul className="space-y-1">
            {inRoom.map((m) => (
              <li key={m.member_id} className="flex min-h-[36px] items-center justify-between gap-2 text-[14px]">
                <span className="truncate">
                  {nameById.get(m.member_id) ?? "Former member"}
                  {m.is_admin ? <span className="text-muted-foreground">, admin</span> : null}
                </span>
                {room.is_admin && m.member_id !== me.id ? (
                  <form action={removeFromGroup}>
                    <input type="hidden" name="room" value={room.id} />
                    <input type="hidden" name="person" value={m.member_id} />
                    <SubmitButton variant="secondary" size="sm" pendingText="...">
                      Remove
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          {room.is_admin ? (
            <>
              <form action={addToGroup} className="space-y-2 border-t border-border pt-3">
                <input type="hidden" name="room" value={room.id} />
                <p className="text-[13px] font-semibold">Add people</p>
                {people.filter((p) => !inRoom.some((m) => m.member_id === p.id)).length ? (
                  <>
                    <div className="max-h-36 space-y-1 overflow-y-auto">
                      {people
                        .filter((p) => !inRoom.some((m) => m.member_id === p.id))
                        .map((p) => (
                          <label key={p.id} className="flex min-h-[32px] items-center gap-2 text-[14px]">
                            <input type="checkbox" name="people" value={p.id} className="size-5 accent-primary" />
                            {nameOf(p)}
                          </label>
                        ))}
                    </div>
                    <SubmitButton size="sm" pendingText="Adding...">
                      Add
                    </SubmitButton>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">Everyone is already here.</p>
                )}
              </form>
              <form action={renameGroup} className="flex gap-2 border-t border-border pt-3">
                <input type="hidden" name="room" value={room.id} />
                <label className="sr-only" htmlFor="rename">
                  Group name
                </label>
                <Input id="rename" name="name" defaultValue={room.name ?? ""} maxLength={80} required />
                <SubmitButton variant="secondary" size="sm" pendingText="...">
                  Rename
                </SubmitButton>
              </form>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <form action={removeFromGroup}>
              <input type="hidden" name="room" value={room.id} />
              <input type="hidden" name="person" value={me.id} />
              <SubmitButton variant="secondary" size="sm" pendingText="Leaving..." confirm="Leave this group?">
                Leave group
              </SubmitButton>
            </form>
            {room.is_admin ? (
              <form action={deleteGroup}>
                <input type="hidden" name="room" value={room.id} />
                <SubmitButton variant="danger" size="sm" pendingText="Deleting..." confirm="Delete this group, its messages and files for everyone?">
                  Delete group
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      </details>
    ) : null;

  return (
    <>
      <h1 className="sr-only">Team chat</h1>
      <Flash searchParams={sp} />
      <ChatRoom key={room.id} roomId={room.id} meId={me.id} title={title} subtitle={subtitle} rooms={links} side={side} tools={tools} />
    </>
  );
}
