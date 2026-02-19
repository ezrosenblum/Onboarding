import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { callOutcomeEnum } from "@shared/schema";
import type { CallLog } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Phone,
  Search,
  Play,
  FileText,
  Monitor,
  Smartphone,
  Clock,
  Save,
  Loader2,
  Headphones,
  MessageSquare,
  Star,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";

interface CallReviewItem extends CallLog {
  callerName: string;
  companyName: string;
}

interface TranscriptResponse {
  status: string;
  transcript: string | null;
  error: string | null;
  provider: string | null;
}

interface UserItem {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

export default function CallReviewPage() {
  const { toast } = useToast();

  const [callerId, setCallerId] = useState("");
  const [outcome, setOutcome] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [hasRecording, setHasRecording] = useState(false);
  const [qualityTag, setQualityTag] = useState("");

  const [appliedFilters, setAppliedFilters] = useState({
    callerId: "",
    outcome: "",
    dateFrom: "",
    dateTo: "",
    hasRecording: false,
    qualityTag: "",
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [coachNote, setCoachNote] = useState("");
  const [selectedQualityTag, setSelectedQualityTag] = useState<string | null>(null);

  function buildQueryString() {
    const params = new URLSearchParams();
    if (appliedFilters.callerId && appliedFilters.callerId !== "all") params.set("callerId", appliedFilters.callerId);
    if (appliedFilters.outcome && appliedFilters.outcome !== "all") params.set("outcome", appliedFilters.outcome);
    if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
    if (appliedFilters.hasRecording) params.set("hasRecording", "true");
    if (appliedFilters.qualityTag && appliedFilters.qualityTag !== "all") params.set("qualityTag", appliedFilters.qualityTag);
    params.set("limit", "50");
    params.set("offset", "0");
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  const queryString = buildQueryString();

  const { data: calls, isLoading } = useQuery<CallReviewItem[]>({
    queryKey: [`/api/admin/call-review${queryString}`],
  });

  const { data: users } = useQuery<UserItem[]>({
    queryKey: ["/api/users"],
  });

  const { data: transcript, isLoading: transcriptLoading } = useQuery<TranscriptResponse>({
    queryKey: ["/api/call", String(expandedId), "transcript"],
    enabled: !!expandedId,
  });

  const coachMutation = useMutation({
    mutationFn: async ({ callLogId, coachNote, qualityTag }: { callLogId: number; coachNote: string; qualityTag: string | null }) => {
      await apiRequest("PUT", `/api/admin/call/${callLogId}/coach`, { coachNote, qualityTag });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/call-review${queryString}`] });
      toast({ title: "Coaching note saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  function handleApplyFilters() {
    setAppliedFilters({
      callerId,
      outcome,
      dateFrom,
      dateTo,
      hasRecording,
      qualityTag,
    });
    setExpandedId(null);
  }

  function handleExpandCall(call: CallReviewItem) {
    if (expandedId === call.id) {
      setExpandedId(null);
    } else {
      setExpandedId(call.id);
      setCoachNote(call.coachNote ?? "");
      setSelectedQualityTag(call.qualityTag ?? null);
    }
  }

  function handleSaveCoaching() {
    if (!expandedId) return;
    coachMutation.mutate({
      callLogId: expandedId,
      coachNote,
      qualityTag: selectedQualityTag,
    });
  }

  function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return "-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function getCallModeLabel(mode: string | null | undefined): string {
    if (mode === "BROWSER") return "Browser";
    if (mode === "AGENT_PHONE") return "Phone";
    return "Manual";
  }

  function getCallModeIcon(mode: string | null | undefined) {
    if (mode === "BROWSER") return <Monitor className="h-3 w-3" />;
    if (mode === "AGENT_PHONE") return <Smartphone className="h-3 w-3" />;
    return <Phone className="h-3 w-3" />;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-call-review-title">
        <Headphones className="h-5 w-5" /> Call Review Queue
      </h1>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Filter className="h-4 w-4" /> Filters
          </h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Caller</Label>
              <Select value={callerId} onValueChange={setCallerId}>
                <SelectTrigger data-testid="select-filter-caller">
                  <SelectValue placeholder="All Callers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Callers</SelectItem>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.fullName || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger data-testid="select-filter-outcome">
                  <SelectValue placeholder="All Outcomes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  {callOutcomeEnum.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Quality Tag</Label>
              <Select value={qualityTag} onValueChange={setQualityTag}>
                <SelectTrigger data-testid="select-filter-quality">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="great">Great</SelectItem>
                  <SelectItem value="needs_improvement">Needs Improvement</SelectItem>
                  <SelectItem value="untagged">Untagged</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasRecording"
                  checked={hasRecording}
                  onCheckedChange={(checked) => setHasRecording(!!checked)}
                  data-testid="checkbox-filter-has-recording"
                />
                <Label htmlFor="hasRecording" className="text-sm cursor-pointer">
                  Has Recording
                </Label>
              </div>
            </div>
          </div>

          <Button onClick={handleApplyFilters} data-testid="button-apply-filters">
            <Search className="h-4 w-4 mr-2" /> Apply Filters
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (calls ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-no-calls">No calls found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(calls ?? []).map((call) => {
            const isExpanded = expandedId === call.id;
            return (
              <Card key={call.id} data-testid={`card-call-${call.id}`}>
                <CardContent className="p-4">
                  <div
                    className="cursor-pointer"
                    onClick={() => handleExpandCall(call)}
                    data-testid={`button-expand-call-${call.id}`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium" data-testid={`text-company-${call.id}`}>
                            {call.companyName}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            by {call.callerName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {(call.outcome ?? "UNKNOWN").replace(/_/g, " ")}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(call.durationSeconds)}
                          </span>
                          {call.calledAt && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(call.calledAt), "MMM d, yyyy h:mm a")}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-xs flex items-center gap-1">
                            {getCallModeIcon(call.callMode)}
                            {getCallModeLabel(call.callMode)}
                          </Badge>
                          {call.recordingUrl && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                              <Play className="h-3 w-3" /> Recording
                            </Badge>
                          )}
                          {call.transcriptStatus && call.transcriptStatus !== "NONE" && (
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {call.transcriptStatus}
                            </Badge>
                          )}
                          {call.qualityTag === "great" && (
                            <Badge className="text-xs bg-green-600 text-white no-default-hover-elevate no-default-active-elevate">
                              <Star className="h-3 w-3 mr-1" /> Great
                            </Badge>
                          )}
                          {call.qualityTag === "needs_improvement" && (
                            <Badge className="text-xs bg-orange-500 text-white no-default-hover-elevate no-default-active-elevate">
                              Needs Improvement
                            </Badge>
                          )}
                        </div>
                        {call.coachNote && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-1" data-testid={`text-coach-preview-${call.id}`}>
                            <MessageSquare className="h-3 w-3 inline mr-1" />
                            {call.coachNote}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      <Separator className="my-4" />
                      <div className="space-y-4">
                        {call.recordingUrl && (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Recording</Label>
                            <audio
                              controls
                              src={`/api/call/${call.id}/recording`}
                              className="w-full"
                              data-testid={`audio-recording-${call.id}`}
                            />
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Transcript</Label>
                          {transcriptLoading ? (
                            <Skeleton className="h-20" />
                          ) : transcript?.transcript ? (
                            <div className="text-sm bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto whitespace-pre-wrap" data-testid={`text-transcript-${call.id}`}>
                              {transcript.transcript}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground" data-testid={`text-no-transcript-${call.id}`}>
                              {transcript?.error ? `Error: ${transcript.error}` : "No transcript available"}
                            </p>
                          )}
                        </div>

                        {call.notes && (
                          <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Call Notes</Label>
                            <p className="text-sm bg-muted/50 rounded-md p-3" data-testid={`text-call-notes-${call.id}`}>
                              {call.notes}
                            </p>
                          </div>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Coach Note</Label>
                          <Textarea
                            value={coachNote}
                            onChange={(e) => setCoachNote(e.target.value)}
                            placeholder="Add coaching feedback..."
                            className="resize-none"
                            data-testid={`textarea-coach-note-${call.id}`}
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Quality Tag</Label>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant={selectedQualityTag === "great" ? "default" : "outline"}
                              onClick={() => setSelectedQualityTag(selectedQualityTag === "great" ? null : "great")}
                              data-testid={`button-tag-great-${call.id}`}
                            >
                              <Star className="h-4 w-4 mr-2" /> Great
                            </Button>
                            <Button
                              variant={selectedQualityTag === "needs_improvement" ? "default" : "outline"}
                              onClick={() => setSelectedQualityTag(selectedQualityTag === "needs_improvement" ? null : "needs_improvement")}
                              data-testid={`button-tag-needs-improvement-${call.id}`}
                            >
                              Needs Improvement
                            </Button>
                            {selectedQualityTag && (
                              <Button
                                variant="outline"
                                onClick={() => setSelectedQualityTag(null)}
                                data-testid={`button-tag-clear-${call.id}`}
                              >
                                <X className="h-4 w-4 mr-2" /> Clear
                              </Button>
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={handleSaveCoaching}
                          disabled={coachMutation.isPending}
                          data-testid={`button-save-coaching-${call.id}`}
                        >
                          {coachMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save Coaching
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
