import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Link2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams } from "react-router-dom";
import {
  IncidentRecord,
  RequestEventRecord,
  listIncidentRecords,
  listRequestEvents,
} from "@/lib/diagnostics-api";

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function parseNonNegativeInteger(value: string | null, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function parseStatusFilter(value: string | null): "all" | "2xx" | "4xx" | "5xx" {
  if (value === "2xx" || value === "4xx" || value === "5xx") {
    return value;
  }
  return "all";
}

export default function Diagnostics() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const INCIDENT_PAGE_SIZE = 50;
  const REQUEST_PAGE_SIZE = 100;
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [requestEvents, setRequestEvents] = useState<RequestEventRecord[]>([]);
  const [incidentTotal, setIncidentTotal] = useState(0);
  const [requestEventTotal, setRequestEventTotal] = useState(0);
  const [incidentOffset, setIncidentOffset] = useState(
    parseNonNegativeInteger(searchParams.get("incidentOffset"), 0),
  );
  const [requestOffset, setRequestOffset] = useState(
    parseNonNegativeInteger(searchParams.get("requestOffset"), 0),
  );
  const [incidentHasMore, setIncidentHasMore] = useState(false);
  const [requestHasMore, setRequestHasMore] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const [searchText, setSearchText] = useState(searchParams.get("q") || "");
  const [incidentTypeFilter, setIncidentTypeFilter] = useState(searchParams.get("incidentType") || "all");
  const [incidentSourceFilter, setIncidentSourceFilter] = useState(searchParams.get("incidentSource") || "all");
  const [requestEventFilter, setRequestEventFilter] = useState(searchParams.get("requestEvent") || "all");
  const [requestStatusFilter, setRequestStatusFilter] = useState(parseStatusFilter(searchParams.get("requestStatus")));
  const [incidentPageInput, setIncidentPageInput] = useState("1");
  const [requestPageInput, setRequestPageInput] = useState("1");
  const [sharedAt, setSharedAt] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchText(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const urlQuery = searchParams.get("q") || "";
    const urlIncidentType = searchParams.get("incidentType") || "all";
    const urlIncidentSource = searchParams.get("incidentSource") || "all";
    const urlRequestEvent = searchParams.get("requestEvent") || "all";
    const urlRequestStatus = parseStatusFilter(searchParams.get("requestStatus"));
    const urlIncidentOffset = parseNonNegativeInteger(searchParams.get("incidentOffset"), 0);
    const urlRequestOffset = parseNonNegativeInteger(searchParams.get("requestOffset"), 0);

    if (searchInput !== urlQuery) {
      setSearchInput(urlQuery);
    }
    if (searchText !== urlQuery) {
      setSearchText(urlQuery);
    }
    if (incidentTypeFilter !== urlIncidentType) {
      setIncidentTypeFilter(urlIncidentType);
    }
    if (incidentSourceFilter !== urlIncidentSource) {
      setIncidentSourceFilter(urlIncidentSource);
    }
    if (requestEventFilter !== urlRequestEvent) {
      setRequestEventFilter(urlRequestEvent);
    }
    if (requestStatusFilter !== urlRequestStatus) {
      setRequestStatusFilter(urlRequestStatus);
    }
    if (incidentOffset !== urlIncidentOffset) {
      setIncidentOffset(urlIncidentOffset);
    }
    if (requestOffset !== urlRequestOffset) {
      setRequestOffset(urlRequestOffset);
    }
  }, [
    incidentOffset,
    incidentSourceFilter,
    incidentTypeFilter,
    requestEventFilter,
    requestOffset,
    requestStatusFilter,
    searchInput,
    searchParams,
    searchText,
  ]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchText) {
      next.set("q", searchText);
    }
    if (incidentTypeFilter !== "all") {
      next.set("incidentType", incidentTypeFilter);
    }
    if (incidentSourceFilter !== "all") {
      next.set("incidentSource", incidentSourceFilter);
    }
    if (requestEventFilter !== "all") {
      next.set("requestEvent", requestEventFilter);
    }
    if (requestStatusFilter !== "all") {
      next.set("requestStatus", requestStatusFilter);
    }
    if (incidentOffset > 0) {
      next.set("incidentOffset", String(incidentOffset));
    }
    if (requestOffset > 0) {
      next.set("requestOffset", String(requestOffset));
    }
    setSearchParams(next, { replace: true });
  }, [
    incidentOffset,
    incidentSourceFilter,
    incidentTypeFilter,
    requestEventFilter,
    requestOffset,
    requestStatusFilter,
    searchText,
    setSearchParams,
  ]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [incidentResponse, requestResponse] = await Promise.all([
        listIncidentRecords({
          limit: INCIDENT_PAGE_SIZE,
          offset: incidentOffset,
          q: searchText || undefined,
          type: incidentTypeFilter !== "all" ? incidentTypeFilter : undefined,
          source: incidentSourceFilter !== "all" ? incidentSourceFilter : undefined,
        }),
        listRequestEvents({
          limit: REQUEST_PAGE_SIZE,
          offset: requestOffset,
          q: searchText || undefined,
          event: requestEventFilter !== "all" ? requestEventFilter : undefined,
          statusClass: requestStatusFilter !== "all" ? (requestStatusFilter as "2xx" | "4xx" | "5xx") : undefined,
        }),
      ]);
      setIncidents(incidentResponse.items);
      setRequestEvents(requestResponse.items);
      setIncidentTotal(incidentResponse.total);
      setRequestEventTotal(requestResponse.total);
      setIncidentHasMore(incidentResponse.hasMore);
      setRequestHasMore(requestResponse.hasMore);
    } catch (error) {
      toast({
        title: "Unable to load diagnostics",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    incidentOffset,
    incidentSourceFilter,
    incidentTypeFilter,
    requestEventFilter,
    requestOffset,
    requestStatusFilter,
    searchText,
    toast,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const incidentTypeOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(incidents.map((item) => item.type).filter(Boolean))).sort()];
  }, [incidents]);

  const incidentSourceOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(incidents.map((item) => item.source || "").filter(Boolean))).sort()];
  }, [incidents]);

  const requestEventOptions = useMemo(() => {
    return ["all", ...Array.from(new Set(requestEvents.map((item) => item.event).filter(Boolean))).sort()];
  }, [requestEvents]);

  const incidentPageCount = Math.max(1, Math.ceil(Math.max(incidentTotal, 1) / INCIDENT_PAGE_SIZE));
  const requestPageCount = Math.max(1, Math.ceil(Math.max(requestEventTotal, 1) / REQUEST_PAGE_SIZE));
  const incidentCurrentPage = Math.min(incidentPageCount, Math.floor(incidentOffset / INCIDENT_PAGE_SIZE) + 1);
  const requestCurrentPage = Math.min(requestPageCount, Math.floor(requestOffset / REQUEST_PAGE_SIZE) + 1);

  useEffect(() => {
    setIncidentPageInput(String(incidentCurrentPage));
  }, [incidentCurrentPage]);

  useEffect(() => {
    setRequestPageInput(String(requestCurrentPage));
  }, [requestCurrentPage]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gradient-primary">Diagnostics</h1>
          <p className="text-muted-foreground mt-1">Inspect recent frontend incidents and backend request traces.</p>
          {sharedAt && <p className="text-[11px] text-muted-foreground mt-1">Share link copied at {sharedAt}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={async () => {
              const shareUrl = typeof window !== "undefined" ? window.location.href : "";
              if (!shareUrl) {
                return;
              }
              try {
                await navigator.clipboard.writeText(shareUrl);
                setSharedAt(new Date().toLocaleTimeString());
                toast({
                  title: "Diagnostics link copied",
                  description: "Current filters and pages are in the URL.",
                });
              } catch (error) {
                toast({
                  title: "Unable to copy link",
                  description: error instanceof Error ? error.message : "Clipboard access failed.",
                  variant: "destructive",
                });
              }
            }}
          >
            <Link2 className="h-4 w-4" />
            Share View
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => void refresh()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      <Card className="p-4 bg-gradient-card border-border">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setIncidentOffset(0);
              setRequestOffset(0);
            }}
            placeholder="Search request id, route, message..."
            className="lg:col-span-2"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={incidentTypeFilter}
            onChange={(event) => {
              setIncidentTypeFilter(event.target.value);
              setIncidentOffset(0);
            }}
          >
            {incidentTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All incident types" : option}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={incidentSourceFilter}
            onChange={(event) => {
              setIncidentSourceFilter(event.target.value);
              setIncidentOffset(0);
            }}
          >
            {incidentSourceOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All incident sources" : option}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => {
              setSearchInput("");
              setSearchText("");
              setIncidentTypeFilter("all");
              setIncidentSourceFilter("all");
              setRequestEventFilter("all");
              setRequestStatusFilter("all");
              setIncidentOffset(0);
              setRequestOffset(0);
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 bg-gradient-card border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Incident Feed
          </div>
          <p className="text-xs text-muted-foreground mt-1">Recent telemetry incidents from frontend runtime + boundary.</p>
          <p className="text-[11px] text-muted-foreground mt-1">{incidents.length} shown / {incidentTotal} matched</p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isLoading || incidentOffset === 0}
              onClick={() => setIncidentOffset((current) => Math.max(0, current - INCIDENT_PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isLoading || !incidentHasMore}
              onClick={() => setIncidentOffset((current) => current + INCIDENT_PAGE_SIZE)}
            >
              Next
            </Button>
            <span className="text-[11px] text-muted-foreground ml-1">Page {incidentCurrentPage} / {incidentPageCount}</span>
            <Input
              value={incidentPageInput}
              onChange={(event) => setIncidentPageInput(event.target.value)}
              className="h-7 w-16 text-xs"
              inputMode="numeric"
              aria-label="Incident page"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isLoading}
              onClick={() => {
                const parsed = Number(incidentPageInput);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                const nextPage = Math.min(incidentPageCount, Math.max(1, Math.floor(parsed)));
                setIncidentOffset((nextPage - 1) * INCIDENT_PAGE_SIZE);
              }}
            >
              Go
            </Button>
          </div>
          <div className="mt-4 space-y-2 max-h-[420px] overflow-auto">
            {incidents.length === 0 && <p className="text-xs text-muted-foreground">No incidents found for current filters.</p>}
            {incidents.map((incident) => (
              <div key={incident.id} className="rounded-md border border-border p-3 text-xs space-y-1">
                <p className="font-medium">
                  {incident.type} <span className="text-muted-foreground">({formatDate(incident.createdAt)})</span>
                </p>
                <p className="text-muted-foreground">{incident.message}</p>
                <p className="text-muted-foreground">id: {incident.id}</p>
                <p className="text-muted-foreground">request: {incident.requestId || "-"}</p>
                <p className="text-muted-foreground">route: {incident.route || "-"}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 bg-gradient-card border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4 text-primary" />
            Request Events
          </div>
          <p className="text-xs text-muted-foreground mt-1">Recent backend request lifecycle events.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={requestEventFilter}
              onChange={(event) => {
                setRequestEventFilter(event.target.value);
                setRequestOffset(0);
              }}
            >
              {requestEventOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All event types" : option}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={requestStatusFilter}
              onChange={(event) => {
                setRequestStatusFilter(event.target.value as "all" | "2xx" | "4xx" | "5xx");
                setRequestOffset(0);
              }}
            >
              <option value="all">All statuses</option>
              <option value="2xx">2xx success</option>
              <option value="4xx">4xx client errors</option>
              <option value="5xx">5xx server errors</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">{requestEvents.length} shown / {requestEventTotal} matched</p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isLoading || requestOffset === 0}
              onClick={() => setRequestOffset((current) => Math.max(0, current - REQUEST_PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isLoading || !requestHasMore}
              onClick={() => setRequestOffset((current) => current + REQUEST_PAGE_SIZE)}
            >
              Next
            </Button>
            <span className="text-[11px] text-muted-foreground ml-1">Page {requestCurrentPage} / {requestPageCount}</span>
            <Input
              value={requestPageInput}
              onChange={(event) => setRequestPageInput(event.target.value)}
              className="h-7 w-16 text-xs"
              inputMode="numeric"
              aria-label="Request events page"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isLoading}
              onClick={() => {
                const parsed = Number(requestPageInput);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                const nextPage = Math.min(requestPageCount, Math.max(1, Math.floor(parsed)));
                setRequestOffset((nextPage - 1) * REQUEST_PAGE_SIZE);
              }}
            >
              Go
            </Button>
          </div>
          <div className="mt-4 space-y-2 max-h-[420px] overflow-auto">
            {requestEvents.length === 0 && <p className="text-xs text-muted-foreground">No request events found for current filters.</p>}
            {requestEvents.map((event, index) => (
              <div key={`${event.requestId || "req"}-${event.timestamp}-${index}`} className="rounded-md border border-border p-3 text-xs space-y-1">
                <p className="font-medium">
                  {event.event} <span className="text-muted-foreground">({formatDate(event.timestamp)})</span>
                </p>
                <p className="text-muted-foreground">
                  {event.method || "-"} {event.path || "-"} {typeof event.statusCode === "number" ? `(${event.statusCode})` : ""}
                </p>
                <p className="text-muted-foreground">request: {event.requestId || "-"}</p>
                <p className="text-muted-foreground">duration: {typeof event.durationMs === "number" ? `${event.durationMs} ms` : "-"}</p>
                {event.error && <p className="text-destructive">error: {event.error}</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
