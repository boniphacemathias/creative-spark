import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportFrontendIncident } from "@/lib/telemetry/incident-reporter";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorId: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
    errorId: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "Unexpected application error.",
      errorId: "",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorId = `ui-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    this.setState({ errorId });
    console.error("Unhandled application error", { errorId, error, errorInfo });
    void reportFrontendIncident({
      type: "react_error_boundary",
      message: error instanceof Error ? error.message : "Unhandled React error boundary failure",
      stack: error instanceof Error ? error.stack : "",
      source: "app_error_boundary",
      meta: {
        errorId,
        componentStack: errorInfo.componentStack,
      },
    });
  }

  private reload = (): void => {
    window.location.reload();
  };

  private reset = (): void => {
    this.setState({
      hasError: false,
      errorMessage: "",
      errorId: "",
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <div className="mx-auto h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Reload the app to continue.
              </p>
              {this.state.errorMessage && (
                <p className="text-xs text-muted-foreground">Error: {this.state.errorMessage}</p>
              )}
              {this.state.errorId && (
                <p className="text-xs text-muted-foreground">Reference: {this.state.errorId}</p>
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={this.reset}>Try Again</Button>
              <Button onClick={this.reload}>Reload</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
