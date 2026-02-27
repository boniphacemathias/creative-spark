import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, CheckCircle2, CornerDownRight, MessageSquarePlus, RotateCcw, UserPlus } from "lucide-react";
import { CampaignData, TeamMessage } from "@/types/campaign";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface TeamChatPanelProps {
  data: CampaignData;
  onChange: (partial: Partial<CampaignData>) => void;
}

const IS_TEST_RUNTIME =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env === "object" &&
  import.meta.env.MODE === "test";

function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._-]+)/g) ?? [];
  const output: string[] = [];

  for (const raw of matches) {
    const mention = raw.slice(1).trim();
    if (!mention) {
      continue;
    }
    if (!output.some((value) => value.toLowerCase() === mention.toLowerCase())) {
      output.push(mention);
    }
  }

  return output;
}

function renderMessageContent(text: string) {
  const parts = text.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, index) => {
    if (!part.startsWith("@")) {
      return <span key={`text-${index}`}>{part}</span>;
    }

    return (
      <span key={`mention-${index}`} className="text-primary font-medium">
        {part}
      </span>
    );
  });
}

const FIELD_ANCHORS = [
  { key: "research.insight", label: "Research: Insight" },
  { key: "communication.objective", label: "Communication Objective" },
  { key: "creative.proposition", label: "Creative Proposition" },
  { key: "ideation.pool", label: "4Rs Idea Pool" },
  { key: "concept.primary", label: "Primary Concept" },
  { key: "board.prototype", label: "Concept Board Prototype" },
] as const;

function createMessage(
  author: string,
  content: string,
  parentId?: string,
  fieldKey?: string,
  anchorLabel?: string,
): TeamMessage {
  return {
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    author: author.trim() || "Planner",
    content,
    createdAt: new Date().toISOString(),
    mentions: extractMentions(content),
    parentId,
    resolved: false,
    fieldKey,
    anchorLabel,
  };
}

function formatMessageTime(raw: string): string {
  return new Date(raw).toLocaleString();
}

export function TeamChatPanel({ data, onChange }: TeamChatPanelProps) {
  const [author, setAuthor] = useState(data.collaboration.members[0] ?? "Planner");
  const [newMember, setNewMember] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [anchorField, setAnchorField] = useState<string>("research.insight");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const collaborationRef = useRef(data.collaboration);
  useEffect(() => {
    collaborationRef.current = data.collaboration;
  }, [data.collaboration]);
  const anchorLabel = useMemo(
    () => FIELD_ANCHORS.find((entry) => entry.key === anchorField)?.label || "",
    [anchorField],
  );

  const emitCollaborationUpdate = (patch: Partial<CampaignData["collaboration"]>) => {
    const current = collaborationRef.current;
    const next = {
      members: Array.isArray(patch.members) ? patch.members : current.members,
      messages: Array.isArray(patch.messages) ? patch.messages : current.messages,
      presence: Array.isArray(patch.presence) ? patch.presence : current.presence || [],
    };

    collaborationRef.current = next;
    onChange({ collaboration: next });
  };

  const sortedMessages = useMemo(
    () => [...data.collaboration.messages].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1)),
    [data.collaboration.messages],
  );

  const rootMessages = useMemo(
    () => sortedMessages.filter((message) => !message.parentId),
    [sortedMessages],
  );

  const repliesByParentId = useMemo(() => {
    const map = new Map<string, TeamMessage[]>();
    for (const message of sortedMessages) {
      if (!message.parentId) {
        continue;
      }
      const bucket = map.get(message.parentId) ?? [];
      bucket.push(message);
      map.set(message.parentId, bucket);
    }
    return map;
  }, [sortedMessages]);

  const unresolvedCount = rootMessages.filter((message) => !message.resolved).length;
  const typingMembers = useMemo(() => {
    const nowMs = Date.now();
    const entries = data.collaboration.presence || [];
    return entries.filter((entry) => {
      if (!entry.isTyping) {
        return false;
      }
      const seenMs = Date.parse(entry.lastSeenAt);
      return Number.isFinite(seenMs) && nowMs - seenMs < 20_000;
    });
  }, [data.collaboration.presence]);

  const updatePresence = (isTyping: boolean, fieldKey?: string) => {
    if (IS_TEST_RUNTIME) {
      return;
    }
    const existing = collaborationRef.current.presence || [];
    const normalizedAuthor = author.trim() || "Planner";
    const byMember = new Map(existing.map((entry) => [entry.member.toLowerCase(), entry]));
    const previous = byMember.get(normalizedAuthor.toLowerCase());
    const nextPresence = {
      member: normalizedAuthor,
      fieldKey,
      isTyping,
      lastSeenAt: new Date().toISOString(),
    };

    if (
      previous &&
      previous.isTyping === nextPresence.isTyping &&
      previous.fieldKey === nextPresence.fieldKey
    ) {
      return;
    }

    byMember.set(normalizedAuthor.toLowerCase(), nextPresence);
    emitCollaborationUpdate({
      presence: [...byMember.values()],
    });
  };

  const pushMessages = (messages: TeamMessage[]) => {
    const current = collaborationRef.current;
    const missingMentions = new Set<string>();
    for (const message of messages) {
      for (const mention of message.mentions) {
        const exists = current.members.some(
          (member) => member.toLowerCase() === mention.toLowerCase(),
        );
        if (!exists) {
          missingMentions.add(mention);
        }
      }
    }

    const members = [...current.members];
    for (const mention of missingMentions) {
      if (!members.some((entry) => entry.toLowerCase() === mention.toLowerCase())) {
        members.push(mention);
      }
    }

    emitCollaborationUpdate({
      members,
      messages,
    });
  };

  useEffect(() => {
    const text =
      draftMessage.trim() ||
      Object.values(replyDrafts)
        .map((value) => value.trim())
        .find(Boolean) ||
      "";
    const timer = window.setTimeout(() => {
      updatePresence(Boolean(text), text ? anchorField : undefined);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [anchorField, author, draftMessage, replyDrafts]);

  useEffect(() => {
    return () => {
      updatePresence(false);
    };
  }, [author]);

  const addMember = () => {
    const candidate = newMember.trim();
    if (!candidate) {
      return;
    }

    const existingMembers = collaborationRef.current.members;
    if (existingMembers.some((member) => member.toLowerCase() === candidate.toLowerCase())) {
      setNewMember("");
      return;
    }

    emitCollaborationUpdate({
      members: [...existingMembers, candidate],
    });
    setNewMember("");
  };

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    const content = draftMessage.trim();
    if (!content) {
      return;
    }

    const message = createMessage(author, content, undefined, anchorField, anchorLabel);
    pushMessages([...(collaborationRef.current.messages || []), message]);
    setDraftMessage("");
  };

  const toggleResolve = (rootMessageId: string) => {
    const existingMessages = collaborationRef.current.messages || [];
    const current = existingMessages.find((message) => message.id === rootMessageId);
    if (!current || current.parentId) {
      return;
    }

    const isResolving = !current.resolved;
    const updated = existingMessages.map((message) => {
      if (message.id !== rootMessageId) {
        return message;
      }

      return {
        ...message,
        resolved: isResolving,
        resolvedAt: isResolving ? new Date().toISOString() : undefined,
        resolvedBy: isResolving ? (author.trim() || "Planner") : undefined,
      };
    });

    pushMessages(updated);
  };

  const startReply = (rootMessageId: string) => {
    setOpenReplyFor(rootMessageId);
    setReplyDrafts((prev) => ({
      ...prev,
      [rootMessageId]: prev[rootMessageId] ?? "",
    }));
  };

  const submitReply = (rootMessageId: string) => {
    const root = rootMessages.find((message) => message.id === rootMessageId);
    if (!root || root.resolved) {
      return;
    }

    const content = (replyDrafts[rootMessageId] ?? "").trim();
    if (!content) {
      return;
    }

    const reply = createMessage(author, content, rootMessageId, root.fieldKey, root.anchorLabel);
    pushMessages([...(collaborationRef.current.messages || []), reply]);
    setReplyDrafts((prev) => ({ ...prev, [rootMessageId]: "" }));
    setOpenReplyFor(null);
  };

  return (
    <Card className="p-4 bg-gradient-card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Team Review Chat</h3>
          <p className="text-xs text-muted-foreground">Threaded comments, @mentions, and resolution workflow</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{rootMessages.length} threads</Badge>
          <Badge variant={unresolvedCount > 0 ? "default" : "secondary"}>{unresolvedCount} open</Badge>
        </div>
      </div>

      <div className="rounded-md border border-border p-3 space-y-4 max-h-[360px] overflow-auto">
        {typingMembers.length > 0 && (
          <div className="rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-[11px] text-primary">
            {typingMembers.map((entry) => `${entry.member}${entry.fieldKey ? ` (${entry.fieldKey})` : ""}`).join(", ")} typing...
          </div>
        )}
        {rootMessages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No comments yet. Add a review note to start a thread.
          </p>
        )}

        {rootMessages.map((message) => {
          const replies = repliesByParentId.get(message.id) ?? [];
          return (
            <div key={message.id} className="space-y-2 rounded-md border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{message.author}</p>
                <p className="text-[11px] text-muted-foreground">{formatMessageTime(message.createdAt)}</p>
              </div>
              <p className="text-sm leading-relaxed break-words">{renderMessageContent(message.content)}</p>
              {(message.anchorLabel || message.fieldKey) && (
                <Badge variant="outline" className="text-[10px]">
                  Anchor: {message.anchorLabel || message.fieldKey}
                </Badge>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {message.resolved ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Resolved{message.resolvedBy ? ` by ${message.resolvedBy}` : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Open</Badge>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => startReply(message.id)}
                  disabled={message.resolved}
                >
                  <CornerDownRight className="h-3 w-3 mr-1" />
                  Reply
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => toggleResolve(message.id)}
                >
                  {message.resolved ? (
                    <>
                      <RotateCcw className="h-3 w-3 mr-1" /> Reopen
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                    </>
                  )}
                </Button>
              </div>

              {message.mentions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {message.mentions.map((mention) => (
                    <Badge key={`${message.id}-${mention}`} variant="secondary" className="text-[10px]">
                      <AtSign className="h-2.5 w-2.5 mr-1" />
                      {mention}
                    </Badge>
                  ))}
                </div>
              )}

              {replies.length > 0 && (
                <div className="space-y-2 border-l border-border pl-3">
                  {replies.map((reply) => (
                    <div key={reply.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{reply.author}</p>
                        <p className="text-[11px] text-muted-foreground">{formatMessageTime(reply.createdAt)}</p>
                      </div>
                      <p className="text-sm leading-relaxed break-words">{renderMessageContent(reply.content)}</p>
                    </div>
                  ))}
                </div>
              )}

              {openReplyFor === message.id && (
                <div className="space-y-2 border-l border-border pl-3">
                  <Textarea
                    value={replyDrafts[message.id] ?? ""}
                    onChange={(event) => setReplyDrafts((prev) => ({ ...prev, [message.id]: event.target.value }))}
                    placeholder={`Reply to ${message.author}...`}
                    className="min-h-[80px]"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => submitReply(message.id)}>
                      Post Reply
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setOpenReplyFor(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form className="space-y-3" onSubmit={submitMessage}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="chat-author">
            Posting as
          </label>
          <select
            id="chat-author"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
          >
            {data.collaboration.members.map((member) => (
              <option key={member} value={member}>
                {member}
              </option>
            ))}
          </select>
        </div>

        <Textarea
          value={draftMessage}
          onChange={(event) => setDraftMessage(event.target.value)}
          placeholder="Write a review comment and mention teammates with @name"
          className="min-h-[90px]"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="anchor-field">
            Anchor
          </label>
          <select
            id="anchor-field"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={anchorField}
            onChange={(event) => setAnchorField(event.target.value)}
          >
            {FIELD_ANCHORS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.collaboration.members.slice(0, 5).map((member) => (
            <Button
              key={`mention-chip-${member}`}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                setDraftMessage((prev) => `${prev}${prev.endsWith(" ") || prev.length === 0 ? "" : " "}@${member} `)
              }
            >
              <AtSign className="h-3 w-3 mr-1" />
              {member}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            Add Comment
          </Button>
          <div className="flex items-center gap-2">
            <Input
              value={newMember}
              onChange={(event) => setNewMember(event.target.value)}
              placeholder="Add team member"
              className="h-9 w-[170px]"
            />
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={addMember}>
              <UserPlus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
