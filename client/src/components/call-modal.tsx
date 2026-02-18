import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Lead, CallLog, AiResearchCache } from "@shared/schema";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Phone, Clock, Loader2, Sparkles, RefreshCw, ChevronDown, AlertTriangle } from "lucide-react";
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

export function CallModal({ lead, open, onClose }: CallModalProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");

  const { data: lastCall } = useQuery<CallLog[]>({
    queryKey: ["/api/leads", lead?.id?.toString(), "calls"],
    enabled: !!lead?.id && open,
  });

  const lastCallLog = lastCall?.[0];

  const mutation = useMutation({
    mutationFn: async () => {
      if (phone && phone !== lead?.phone) {
        await apiRequest("PATCH", `/api/leads/${lead!.id}`, { phone });
      }
      await apiRequest("POST", `/api/leads/${lead!.id}/calls`, {
        outcome,
        notes: notes || null,
        durationSeconds: null,
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
    onClose();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) handleClose();
  }

  const phoneValue = phone || lead?.phone || "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
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

            <Separator />

            <AiOpenerSection leadId={lead.id} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-call-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!outcome || mutation.isPending}
            data-testid="button-call-submit"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log Call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AiResearchResponse {
  cache: AiResearchCache | null;
  isStale: boolean;
  currentPromptVersion: number;
  aiConfigured: boolean;
  mock?: boolean;
}

function AiOpenerSection({ leadId }: { leadId: number }) {
  const [isOpen, setIsOpen] = useState(true);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AiResearchResponse>({
    queryKey: ["/api/leads", leadId.toString(), "ai-research"],
    enabled: !!leadId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/ai-research`);
      return res.json();
    },
    onSuccess: (result: AiResearchResponse) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId.toString(), "ai-research"] });
      if (result.mock) {
        toast({ title: "Mock script generated", description: "AI not configured - using placeholder" });
      } else {
        toast({ title: "AI opener script generated" });
      }
    },
    onError: (err: any) => {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    },
  });

  const hasCache = !!data?.cache;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left rounded-md bg-muted p-3 hover-elevate"
          data-testid="button-toggle-ai-opener"
        >
          <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium flex-1">AI Opener Script</span>
          {data?.isStale && <Badge variant="outline" className="text-xs">Stale</Badge>}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          ) : hasCache ? (
            <>
              {data.isStale && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Prompt updated since this was generated. Consider regenerating.</span>
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-ai-opener-script">
                {data.cache!.resultText}
              </p>
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
                  v{data.cache!.promptVersion} &middot; {data.cache!.model}
                </span>
              </div>
            </>
          ) : (
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-2">No AI opener generated for this lead yet.</p>
              <Button
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-generate-ai"
              >
                {generateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Generate Opener
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
