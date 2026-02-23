import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: "Ctrl/Cmd + K", description: "Open command palette" },
  { keys: "Ctrl/Cmd + B", description: "Toggle sidebar" },
  { keys: "/", description: "Focus campaign search (dashboard)" },
  { keys: "Esc", description: "Clear selected campaigns (dashboard)" },
  { keys: "?", description: "Open this shortcuts panel" },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Keyboard className="h-4 w-4" />
        <span className="sr-only">Open keyboard shortcuts</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Use these shortcuts to navigate and work faster.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                <kbd className="rounded border px-2 py-0.5 text-xs">{shortcut.keys}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
