import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Lead, CallLog, AiResearchRecord } from "@shared/schema";
import { callOutcomeEnum } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Phone, Clock, Loader2, Sparkles, RefreshCw, AlertTriangle, Copy, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const OUTCOME_LABELS: Record<string, string> = {
  NO_ANSWER: "No Answer",
  VOICEMAIL: "Voicemail",
  GATEKEEPER: "Gatekeeper",
  CALL_DROPPED: "Call Dropped",
  SPOKE_NOT_INTERESTED: "Spoke - Not Interested",
  SPOKE_SEND_INFO: "Spoke - Send Info",
  SPOKE_FOLLOW_UP: "Spoke - Follow Up",
  SPOKE_INTERESTED: "Spoke - Interested",
};

interface CallModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

interface AiResearchResponse {
  exists: boolean;
  current: AiResearchRecord | null;
  isStale: boolean;
  currentPromptVersion: number;
  aiConfigured: boolean;
  mock?: boolean;
}

function parseHoursForTimingCheck(hoursRaw: string | null, timezone: string | null): { isInBadWindow: boolean } {
  if (!hoursRaw || !timezone) return { isInBadWindow: false };

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(now);
    const hourStr = parts.find(p => p.type === "hour")?.value || "0";
    const minStr = parts.find(p => p.type === "minute")?.value || "0";
    const dayStr = parts.find(p => p.type === "weekday")?.value || "";
    const currentMinutes = parseInt(hourStr) * 60 + parseInt(minStr);

    const dayMap: Record<string, string> = {
      Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
      Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
    };
    const fullDay = dayMap[dayStr] || dayStr;

    const lines = hoursRaw.split(/[;\n]/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      const dayMatch = line.match(/^(\w+):?\s*(.*)/);
      if (!dayMatch) continue;
      const lineDay = dayMatch[1];
      const timeRange = dayMatch[2].trim();

      if (lineDay.toLowerCase() !== fullDay.toLowerCase() &&
          !lineDay.toLowerCase().startsWith(fullDay.toLowerCase().substring(0, 3))) {
        continue;
      }

      if (timeRange.toLowerCase() === "closed") return { isInBadWindow: false };

      const rangeMatch = timeRange.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
      if (!rangeMatch) continue;

      let openH = parseInt(rangeMatch[1]);
      const openM = parseInt(rangeMatch[2] || "0");
      const openAP = rangeMatch[3];
      let closeH = parseInt(rangeMatch[4]);
      const closeM = parseInt(rangeMatch[5] || "0");
      const closeAP = rangeMatch[6];

      if (openAP?.toUpperCase() === "PM" && openH < 12) openH += 12;
      if (openAP?.toUpperCase() === "AM" && openH === 12) openH = 0;
      if (closeAP?.toUpperCase() === "PM" && closeH < 12) closeH += 12;
      if (closeAP?.toUpperCase() === "AM" && closeH === 12) closeH = 0;

      const openMin = openH * 60 + openM;
      const closeMin = closeH * 60 + closeM;

      const nearOpen = Math.abs(currentMinutes - openMin) <= 15;
      const nearClose = Math.abs(currentMinutes - closeMin) <= 15;

      if (nearOpen || nearClose) {
        return { isInBadWindow: true };
      }
    }
  } catch {
  }

  return { isInBadWindow: false };
}

export function CallModal({ lead, open, onClose }: CallModalProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [showTimingWarning, setShowTimingWarning] = useState(false);

  const { data: lastCall } = useQuery<CallLog[]>({
    queryKey: ["/api/leads", lead?.id?.toString(), "calls"],
    enabled: !!lead?.id && open,
  });

  const lastCallLog = lastCall?.[0];

  const mutation = useMutation({
    mutationFn: async (opts: { withinBadTimingWindow: boolean }) => {
      if (phone && phone !== lead?.phone) {
        await apiRequest("PATCH", `/api/leads/${lead!.id}`, { phone });
      }
      await apiRequest("POST", `/api/leads/${lead!.id}/calls`, {
        outcome,
        notes: notes || null,
        durationSeconds: null,
        withinBadTimingWindow: opts.withinBadTimingWindow,
      });
    },
    onSuccess: () => {
      toast({ title: "Call logged", description: `Outcome: ${OUTCOME_LABELS[outcome]}` });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", lead?.id?.toString()] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", lead?.id?.toString(), "calls"] });
      handleClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleClose() {
    setPhone("");
    setOutcome("");
    setNotes("");
    setShowTimingWarning(false);
    onClose();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) handleClose();
  }

  function handleSubmit() {
    if (!outcome) return;

    const { isInBadWindow } = parseHoursForTimingCheck(lead?.hoursRaw || null, lead?.timezone || null);

    if (isInBadWindow) {
      setShowTimingWarning(true);
    } else {
      mutation.mutate({ withinBadTimingWindow: false });
    }
  }

  function handleConfirmBadTiming() {
    setShowTimingWarning(false);
    mutation.mutate({ withinBadTimingWindow: true });
  }

  const phoneValue = phone || lead?.phone || "";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-call-modal-title">
              <Phone className="h-5 w-5" />
              Log Call
            </DialogTitle>
          </DialogHeader>

          {lead && (
            <div className="space-y-4">
              <div>
                <p className="font-medium" data-testid="text-call-modal-company">{lead.companyName}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs" data-testid="text-call-modal-attempts">
                    {lead.attemptCount} attempt{lead.attemptCount !== 1 ? "s" : ""}
                  </Badge>
                  {lastCallLog && (
                    <span className="text-xs text-muted-foreground" data-testid="text-call-modal-last-call">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Last call: {format(new Date(lastCallLog.calledAt), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              <AiOpenerPanel leadId={lead.id} />

              <Separator />

              <div className="space-y-3">
                <div>
                  <Label htmlFor="call-phone">Phone</Label>
                  <Input
                    id="call-phone"
                    value={phoneValue}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    data-testid="input-call-phone"
                  />
                </div>

                <div>
                  <Label htmlFor="call-outcome">Outcome</Label>
                  <Select value={outcome} onValueChange={setOutcome}>
                    <SelectTrigger id="call-outcome" data-testid="select-call-outcome">
                      <SelectValue placeholder="Select outcome..." />
                    </SelectTrigger>
                    <SelectContent>
                      {callOutcomeEnum.map((o) => (
                        <SelectItem key={o} value={o} data-testid={`option-outcome-${o}`}>
                          {OUTCOME_LABELS[o]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="call-notes">Notes</Label>
                  <Textarea
                    id="call-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Call notes..."
                    rows={3}
                    data-testid="input-call-notes"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} data-testid="button-call-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!outcome || mutation.isPending}
              data-testid="button-call-submit"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showTimingWarning} onOpenChange={setShowTimingWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Timing Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              This business may be opening or closing within the next 15 minutes based on their listed hours. Are you sure you want to log this call?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-timing-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmBadTiming} data-testid="button-timing-continue">
              Continue Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AiOpenerPanel({ leadId }: { leadId: number }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AiResearchResponse>({
    queryKey: ["/api/leads", leadId.toString(), "ai-research"],
    enabled: !!leadId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/ai-research`, { force: true });
      return res.json();
    },
    onSuccess: (result: AiResearchResponse) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId.toString(), "ai-research"] });
      if (result.mock) {
        toast({ title: "Mock script generated", description: "AI not configured - using placeholder" });
      } else {
        toast({ title: "AI opener generated" });
      }
    },
    onError: (err: any) => {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    },
  });

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const hasData = data?.exists && data.current;
  const openerScript = data?.current?.openerScript || "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          AI Opener Script
        </h4>
        {data?.isStale && <Badge variant="outline" className="text-xs">Stale</Badge>}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
        </div>
      ) : hasData ? (
        <div className="space-y-2">
          {data.isStale && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>Prompt updated. Consider regenerating.</span>
            </div>
          )}
          <div className="relative rounded-md bg-muted p-3">
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-1 right-1"
              onClick={() => handleCopy(openerScript)}
              data-testid="button-copy-opener-modal"
            >
              {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
            <p className="text-sm whitespace-pre-wrap leading-relaxed pr-8" data-testid="text-ai-opener-script">
              {openerScript}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              data-testid="button-regenerate-ai"
            >
              {generateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Regenerate
            </Button>
            <span className="text-xs text-muted-foreground">
              v{data.current!.promptVersion} &middot; {data.current!.modelUsed || "unknown"}
            </span>
          </div>
        </div>
      ) : (
        <div className="py-2">
          <p className="text-xs text-muted-foreground mb-2">No AI opener generated yet.</p>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-ai"
          >
            {generateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Run AI Research
          </Button>
        </div>
      )}
    </div>
  );
}
