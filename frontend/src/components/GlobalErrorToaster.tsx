import { useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { reportFrontendIncident } from "@/lib/telemetry/incident-reporter";

function toMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "Unexpected runtime error.";
}

export function GlobalErrorToaster() {
  const { toast } = useToast();

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = toMessage(event.error || event.message);
      toast({
        title: "Application error",
        description: message,
        variant: "destructive",
      });
      void reportFrontendIncident({
        type: "runtime_error",
        message,
        stack: event.error instanceof Error ? event.error.stack : "",
        source: "window.error",
        meta: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = toMessage(event.reason);
      toast({
        title: "Async error",
        description: message,
        variant: "destructive",
      });
      void reportFrontendIncident({
        type: "unhandled_rejection",
        message,
        stack: event.reason instanceof Error ? event.reason.stack : "",
        source: "window.unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [toast]);

  return null;
}
