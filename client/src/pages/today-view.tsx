import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Lead } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CallModal } from "@/components/call-modal";
import {
  Phone, Building2, MapPin, PhoneCall, RotateCcw, CheckCircle2,
  Target, Clock, Zap
} from "lucide-react";

interface TodayData {
  newLeads: Lead[];
  retryLeads: Lead[];
  completedLeads: Lead[];
  counters: {
    totalAssigned: number;
    retryEligible: number;
    attemptsMadeToday: number;
  };
  dailyCallTarget: number | null;
}

function outcomeLabel(status: string) {
  const map: Record<string, string> = {
    NOT_CALLED: "New",
    NO_ANSWER: "No Answer",
    VOICEMAIL: "Voicemail",
    GATEKEEPER: "Gatekeeper",
    CALL_DROPPED: "Dropped",
    SPOKE_NOT_INTERESTED: "Not Interested",
    SPOKE_SEND_INFO: "Send Info",
    SPOKE_FOLLOW_UP: "Follow Up",
    SPOKE_INTERESTED: "Interested",
  };
  return map[status] || status.replace(/_/g, " ");
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "NOT_CALLED": return "secondary";
    case "SPOKE_NOT_INTERESTED": return "destructive";
    case "SPOKE_INTERESTED": return "default";
    case "SPOKE_SEND_INFO": return "default";
    case "SPOKE_FOLLOW_UP": return "outline";
    default: return "outline";
  }
}

export default function TodayViewPage() {
  const { data, isLoading } = useQuery<TodayData>({ queryKey: ["/api/leads/today"] });
  const [callLead, setCallLead] = useState<Lead | null>(null);

  const newLeads = data?.newLeads ?? [];
  const retryLeads = data?.retryLeads ?? [];
  const completedLeads = data?.completedLeads ?? [];
  const counters = data?.counters;
  const target = data?.dailyCallTarget;

  const suggestedNew = target ? Math.round(target * 0.8) : null;
  const suggestedRetry = target ? Math.round(target * 0.2) : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Today's Calls</h1>
        <p className="text-sm text-muted-foreground mt-1">Your daily calling dashboard</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : counters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                  <Target className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-assigned">{counters.totalAssigned}</p>
                  <p className="text-xs text-muted-foreground">Total Assigned</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                  <RotateCcw className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-retry-eligible">{counters.retryEligible}</p>
                  <p className="text-xs text-muted-foreground">Retry Eligible</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                  <PhoneCall className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-attempts-today">{counters.attemptsMadeToday}</p>
                  <p className="text-xs text-muted-foreground">Attempts Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {target && suggestedNew !== null && suggestedRetry !== null && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Daily target: <span className="font-medium text-foreground">{target} calls</span>
              </span>
              <span className="text-sm text-muted-foreground mx-1">|</span>
              <span className="text-sm text-muted-foreground">
                Suggested: <span className="font-medium text-foreground">{suggestedNew} new</span>, <span className="font-medium text-foreground">{suggestedRetry} retry</span> (80/20)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new" data-testid="tab-new">
            New ({newLeads.length})
          </TabsTrigger>
          <TabsTrigger value="retry" data-testid="tab-retry">
            Retry ({retryLeads.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({completedLeads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <LeadList leads={newLeads} onCallClick={setCallLead} emptyMessage="No new leads to call." isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="retry" className="mt-4">
          <LeadList leads={retryLeads} onCallClick={setCallLead} emptyMessage="No leads eligible for retry right now." isLoading={isLoading} showRetryInfo />
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <LeadList leads={completedLeads} onCallClick={null} emptyMessage="No completed leads yet." isLoading={isLoading} />
        </TabsContent>
      </Tabs>

      <CallModal lead={callLead} open={!!callLead} onClose={() => setCallLead(null)} />
    </div>
  );
}

interface LeadListProps {
  leads: Lead[];
  onCallClick: ((lead: Lead) => void) | null;
  emptyMessage: string;
  isLoading: boolean;
  showRetryInfo?: boolean;
}

function LeadList({ leads, onCallClick, emptyMessage, isLoading, showRetryInfo }: LeadListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {leads.map((lead) => (
        <Card key={lead.id} data-testid={`card-today-lead-${lead.id}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" data-testid={`text-today-company-${lead.id}`}>{lead.companyName}</p>
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  {lead.city && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{lead.city}{lead.state ? `, ${lead.state}` : ""}
                    </span>
                  )}
                  {lead.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />{lead.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={statusVariant(lead.statusCall)} className="text-xs">
                  {outcomeLabel(lead.statusCall)}
                </Badge>
                {lead.attemptCount > 0 && (
                  <span className="text-xs text-muted-foreground">{lead.attemptCount} attempt{lead.attemptCount !== 1 ? "s" : ""}</span>
                )}
                {showRetryInfo && lead.retryNextEligibleAt && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />Eligible
                  </span>
                )}
              </div>
              {onCallClick && (
                <Button size="sm" onClick={() => onCallClick(lead)} data-testid={`button-log-call-${lead.id}`}>
                  <PhoneCall className="h-4 w-4 mr-1" />
                  Log Call
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
