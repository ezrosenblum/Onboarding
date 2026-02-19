import { useState, useEffect, useRef, useCallback } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Phone, Clock, Loader2, Sparkles, RefreshCw, AlertTriangle, Copy,
  CheckCircle2, Mic, MicOff, PhoneOff, PhoneCall, Monitor, Smartphone,
  Timer, AlertCircle
} from "lucide-react";
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

type CallPhase = "pre-call" | "calling" | "wrap-up";
type CallMode = "BROWSER" | "AGENT_PHONE";

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CallModal({ lead, open, onClose }: CallModalProps) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<CallPhase>("pre-call");
  const [callMode, setCallMode] = useState<CallMode>("BROWSER");
  const [phone, setPhone] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [showTimingWarning, setShowTimingWarning] = useState(false);

  const [callLogId, setCallLogId] = useState<number | null>(null);
  const [callStatus, setCallStatus] = useState<string>("initiated");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const deviceRef = useRef<any>(null);
  const connectionRef = useRef<any>(null);
  const callStartRef = useRef<number>(0);

  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [bestTimeToCall, setBestTimeToCall] = useState("");

  const { data: lastCall } = useQuery<CallLog[]>({
    queryKey: ["/api/leads", lead?.id?.toString(), "calls"],
    enabled: !!lead?.id && open,
  });

  const { data: twilioStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/twilio/status-check"],
    enabled: open,
  });

  const { data: userAgentPhone } = useQuery<{ agentPhone: string | null }>({
    queryKey: ["/api/user/agent-phone"],
    enabled: open,
  });

  const lastCallLog = lastCall?.[0];

  useEffect(() => {
    if (open && lead) {
      setPhase("pre-call");
      setPhone(lead.phone || "");
      setCallMode("BROWSER");
      setCallLogId(null);
      setCallStatus("initiated");
      setCallDuration(0);
      setIsMuted(false);
      setOutcome("");
      setNotes("");
      setConfirmedEmail(lead.confirmedEmail || "");
      setContactName(lead.contactName || "");
      setBestTimeToCall(lead.bestTimeToCall || "");
      if (userAgentPhone?.agentPhone) {
        setAgentPhone(userAgentPhone.agentPhone);
      }
    }
  }, [open, lead, userAgentPhone]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupTwilioDevice();
    };
  }, []);

  function cleanupTwilioDevice() {
    try {
      if (connectionRef.current) {
        connectionRef.current.disconnect();
        connectionRef.current = null;
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    } catch {}
  }

  function startTimer() {
    callStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const startCallMutation = useMutation({
    mutationFn: async () => {
      if (phone && phone !== lead?.phone) {
        await apiRequest("PATCH", `/api/leads/${lead!.id}`, { phone });
      }
      const res = await apiRequest("POST", `/api/leads/${lead!.id}/call/start`, {
        callMode,
        phoneOverride: phone || undefined,
        agentPhone: callMode === "AGENT_PHONE" ? agentPhone : undefined,
      });
      return res.json();
    },
    onSuccess: async (data) => {
      setCallLogId(data.callLogId);
      setPhase("calling");
      setCallStatus("initiated");

      if (data.mode === "BROWSER") {
        try {
          const { Device } = await import("@twilio/voice-sdk");
          const device = new Device(data.token, {
            codecPreferences: ["opus" as any, "pcmu" as any],
            closeProtection: true,
          });
          deviceRef.current = device;

          await device.register();

          const params: Record<string, string> = {
            To: data.toNumber,
            callLogId: data.callLogId.toString(),
          };

          const call = await device.connect({ params });
          connectionRef.current = call;

          call.on("ringing", () => setCallStatus("ringing"));
          call.on("accept", () => {
            setCallStatus("in_progress");
            startTimer();
            apiRequest("POST", `/api/call/${data.callLogId}/update-sid`, {
              twilioCallSid: call.parameters?.CallSid || "",
            }).catch(() => {});
          });
          call.on("disconnect", () => {
            setCallStatus("completed");
            stopTimer();
            const duration = Math.floor((Date.now() - callStartRef.current) / 1000);
            setCallDuration(duration);
            apiRequest("POST", `/api/call/${data.callLogId}/end`, {
              durationSeconds: duration,
            }).catch(() => {});
            setPhase("wrap-up");
          });
          call.on("cancel", () => {
            setCallStatus("canceled");
            stopTimer();
            setPhase("wrap-up");
          });
          call.on("error", (err: any) => {
            console.error("Call error:", err);
            setCallStatus("failed");
            stopTimer();
            toast({ title: "Call failed", description: err.message || "Connection error", variant: "destructive" });
            setPhase("wrap-up");
          });
        } catch (err: any) {
          console.error("WebRTC setup error:", err);
          toast({ title: "Call setup failed", description: err.message || "Could not connect", variant: "destructive" });
          setPhase("wrap-up");
        }
      } else {
        setCallStatus("ringing");
        startTimer();
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`/api/leads/${lead!.id}/calls`);
            const calls = await res.json();
            const thisCall = calls.find((c: any) => c.id === data.callLogId);
            if (thisCall) {
              setCallStatus(thisCall.callStatus || "ringing");
              if (thisCall.callStatus === "completed" || thisCall.callStatus === "failed" ||
                  thisCall.callStatus === "busy" || thisCall.callStatus === "no_answer" ||
                  thisCall.callStatus === "canceled") {
                clearInterval(pollInterval);
                stopTimer();
                setPhase("wrap-up");
              }
            }
          } catch {}
        }, 3000);

        setTimeout(() => clearInterval(pollInterval), 600000);
      }
    },
    onError: (err: any) => {
      toast({ title: "Call start failed", description: err.message, variant: "destructive" });
    },
  });

  const wrapUpMutation = useMutation({
    mutationFn: async (opts: { withinBadTimingWindow: boolean }) => {
      await apiRequest("POST", `/api/leads/${lead!.id}/call/${callLogId}/wrap-up`, {
        outcome,
        notes: notes || null,
        confirmedEmail: confirmedEmail || null,
        contactName: contactName || null,
        bestTimeToCall: bestTimeToCall || null,
        withinBadTimingWindow: opts.withinBadTimingWindow,
      });
    },
    onSuccess: () => {
      toast({ title: "Call saved", description: `Outcome: ${OUTCOME_LABELS[outcome]}` });
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
    cleanupTwilioDevice();
    stopTimer();
    setPhase("pre-call");
    setCallLogId(null);
    onClose();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && phase !== "calling") handleClose();
  }

  function handleConfirmCall() {
    if (!phone) {
      toast({ title: "Phone required", variant: "destructive" });
      return;
    }
    if (callMode === "AGENT_PHONE" && !agentPhone) {
      toast({ title: "Your phone number is required for bridged calling", variant: "destructive" });
      return;
    }

    const { isInBadWindow } = parseHoursForTimingCheck(lead?.hoursRaw || null, lead?.timezone || null);
    if (isInBadWindow) {
      setShowTimingWarning(true);
    } else {
      startCallMutation.mutate();
    }
  }

  function handleConfirmBadTiming() {
    setShowTimingWarning(false);
    startCallMutation.mutate();
  }

  function handleHangUp() {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
    } else {
      stopTimer();
      setPhase("wrap-up");
    }
  }

  function handleToggleMute() {
    if (connectionRef.current) {
      const newMuted = !isMuted;
      connectionRef.current.mute(newMuted);
      setIsMuted(newMuted);
    }
  }

  function handleWrapUpSubmit() {
    if (!outcome) return;
    const { isInBadWindow } = parseHoursForTimingCheck(lead?.hoursRaw || null, lead?.timezone || null);
    wrapUpMutation.mutate({ withinBadTimingWindow: isInBadWindow });
  }

  const phoneValue = phone || lead?.phone || "";
  const isTwilioReady = twilioStatus?.configured ?? false;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-call-modal-title">
              <Phone className="h-5 w-5" />
              {phase === "pre-call" ? "Place Call" : phase === "calling" ? "In Call" : "Wrap Up"}
            </DialogTitle>
          </DialogHeader>

          {lead && phase === "pre-call" && (
            <div className="space-y-4">
              <div>
                <p className="font-medium" data-testid="text-call-modal-company">{lead.companyName}</p>
                <p className="text-sm text-muted-foreground">{lead.fullAddress}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs" data-testid="text-call-modal-attempts">
                    {lead.attemptCount} attempt{lead.attemptCount !== 1 ? "s" : ""}
                  </Badge>
                  {lastCallLog && (
                    <span className="text-xs text-muted-foreground" data-testid="text-call-modal-last-call">
                      <Clock className="h-3 w-3 inline mr-1" />
                      Last: {format(new Date(lastCallLog.calledAt), "MMM d, h:mm a")}
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <Label htmlFor="call-phone">Phone Number</Label>
                  <Input
                    id="call-phone"
                    value={phoneValue}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone number"
                    data-testid="input-call-phone"
                  />
                </div>

                {isTwilioReady && (
                  <div>
                    <Label>Call Mode</Label>
                    <div className="flex gap-2 mt-1">
                      <Button
                        variant={callMode === "BROWSER" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCallMode("BROWSER")}
                        className="flex-1"
                        data-testid="button-mode-browser"
                      >
                        <Monitor className="h-4 w-4 mr-1" /> Browser
                      </Button>
                      <Button
                        variant={callMode === "AGENT_PHONE" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCallMode("AGENT_PHONE")}
                        className="flex-1"
                        data-testid="button-mode-phone"
                      >
                        <Smartphone className="h-4 w-4 mr-1" /> My Phone
                      </Button>
                    </div>
                  </div>
                )}

                {callMode === "AGENT_PHONE" && (
                  <div>
                    <Label htmlFor="agent-phone">Your Phone Number</Label>
                    <Input
                      id="agent-phone"
                      value={agentPhone}
                      onChange={(e) => setAgentPhone(e.target.value)}
                      placeholder="+1234567890"
                      data-testid="input-agent-phone"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      We'll call this number first, then bridge you to the lead
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <AiOpenerPanel leadId={lead.id} />

              {!isTwilioReady && (
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Twilio not configured</p>
                        <p className="text-xs text-muted-foreground">
                          Calling is unavailable. Contact your admin to set up Twilio.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={handleClose} data-testid="button-call-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmCall}
                  disabled={!phone || startCallMutation.isPending || !isTwilioReady}
                  data-testid="button-confirm-call"
                >
                  {startCallMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <PhoneCall className="h-4 w-4 mr-1" /> Confirm & Call
                </Button>
              </DialogFooter>
            </div>
          )}

          {lead && phase === "calling" && (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-2">
                <p className="font-medium text-lg" data-testid="text-incall-company">{lead.companyName}</p>
                <p className="text-sm text-muted-foreground" data-testid="text-incall-number">{phone || lead.phone}</p>

                <div className="flex items-center justify-center gap-2 mt-2">
                  <Badge
                    variant={callStatus === "in_progress" ? "default" : "outline"}
                    data-testid="text-call-status"
                  >
                    {callStatus === "initiated" && "Connecting..."}
                    {callStatus === "ringing" && "Ringing..."}
                    {callStatus === "in_progress" && "Connected"}
                    {callStatus === "completed" && "Call Ended"}
                    {callStatus === "failed" && "Failed"}
                    {callStatus === "busy" && "Busy"}
                    {callStatus === "no_answer" && "No Answer"}
                    {callStatus === "canceled" && "Canceled"}
                  </Badge>
                </div>

                <div className="flex items-center justify-center gap-2 mt-3">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-mono font-bold" data-testid="text-call-timer">
                    {formatDuration(callDuration)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 mt-6">
                {callMode === "BROWSER" && (
                  <Button
                    size="icon"
                    variant={isMuted ? "destructive" : "outline"}
                    onClick={handleToggleMute}
                    data-testid="button-mute"
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                )}
                <Button
                  size="default"
                  variant="destructive"
                  onClick={handleHangUp}
                  data-testid="button-hangup"
                >
                  <PhoneOff className="h-5 w-5 mr-2" /> End Call
                </Button>
              </div>
            </div>
          )}

          {lead && phase === "wrap-up" && (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{lead.companyName}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    Duration: {formatDuration(callDuration)}
                  </Badge>
                  <Badge variant={callStatus === "completed" ? "default" : "outline"} className="text-xs">
                    {callStatus === "completed" ? "Call completed" : `Status: ${callStatus}`}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div>
                  <Label htmlFor="wrap-outcome">Outcome</Label>
                  <Select value={outcome} onValueChange={setOutcome}>
                    <SelectTrigger id="wrap-outcome" data-testid="select-call-outcome">
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
                  <Label htmlFor="wrap-notes">Notes</Label>
                  <Textarea
                    id="wrap-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Call notes..."
                    rows={3}
                    data-testid="input-call-notes"
                  />
                </div>

                {(outcome === "SPOKE_SEND_INFO" || outcome === "SPOKE_FOLLOW_UP" || outcome === "SPOKE_INTERESTED") && (
                  <div>
                    <Label htmlFor="wrap-contact-name">Contact Name (person spoken to)</Label>
                    <Input
                      id="wrap-contact-name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g., John, Front Desk, Owner"
                      data-testid="input-contact-name"
                    />
                    {outcome === "SPOKE_SEND_INFO" && !contactName.trim() && (
                      <p className="text-xs text-destructive mt-1">Required before sending email</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="wrap-email">Confirmed Email</Label>
                    <Input
                      id="wrap-email"
                      value={confirmedEmail}
                      onChange={(e) => setConfirmedEmail(e.target.value)}
                      placeholder="email@example.com"
                      data-testid="input-confirmed-email"
                    />
                    {outcome === "SPOKE_SEND_INFO" && !confirmedEmail.trim() && (
                      <p className="text-xs text-destructive mt-1">Required before sending email</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="wrap-time">Best Time to Call</Label>
                    <Input
                      id="wrap-time"
                      value={bestTimeToCall}
                      onChange={(e) => setBestTimeToCall(e.target.value)}
                      placeholder="e.g., 10am-12pm EST"
                      data-testid="input-best-time"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose} data-testid="button-call-cancel">
                  Discard
                </Button>
                <Button
                  onClick={handleWrapUpSubmit}
                  disabled={!outcome || wrapUpMutation.isPending}
                  data-testid="button-call-submit"
                >
                  {wrapUpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </div>
          )}
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
              This business may be opening or closing within the next 15 minutes. Are you sure you want to call now?
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
