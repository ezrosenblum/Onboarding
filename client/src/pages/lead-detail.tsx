import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import type { Lead, CallLog, LeadNote, EmailLog, AiResearchRecord, AiOutputJson } from "@shared/schema";
import { callOutcomeEnum } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Building2, Phone, Mail, MapPin, Globe, Star, MessageSquare,
  Clock, Save, Plus, Loader2, ArrowLeft, ExternalLink, PhoneCall,
  Send, AlertCircle, Sparkles, RefreshCw, AlertTriangle, Copy,
  CheckCircle2, ListChecks, HelpCircle, Shield, ArrowRight,
  Play, FileText, Headphones, Monitor, Smartphone, ChevronDown, ChevronUp
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { format } from "date-fns";

interface EmailEligibility {
  sendInfo: { eligible: boolean; reasons: string[] };
  followUp: { eligible: boolean; reasons: string[] };
  unreachableOutreach: { eligible: boolean; reasons: string[] };
}

interface AiResearchResponse {
  exists: boolean;
  current: AiResearchRecord | null;
  isStale: boolean;
  currentPromptVersion: number;
  aiConfigured: boolean;
  mock?: boolean;
}

export default function LeadDetailPage() {
  const [, params] = useRoute("/leads/:id");
  const leadId = params?.id;
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: lead, isLoading } = useQuery<Lead>({ queryKey: ["/api/leads", leadId], enabled: !!leadId });
  const { data: callLogs } = useQuery<CallLog[]>({ queryKey: ["/api/leads", leadId, "calls"], enabled: !!leadId });
  const { data: notes } = useQuery<LeadNote[]>({ queryKey: ["/api/leads", leadId, "notes"], enabled: !!leadId });
  const { data: emailLogs } = useQuery<EmailLog[]>({ queryKey: ["/api/leads", leadId, "emails"], enabled: !!leadId });
  const { data: eligibility } = useQuery<EmailEligibility>({ queryKey: ["/api/leads", leadId, "email-eligibility"], enabled: !!leadId });
  const { data: aiResearch, isLoading: aiLoading } = useQuery<AiResearchResponse>({ queryKey: ["/api/leads", leadId, "ai-research"], enabled: !!leadId });

  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editBestTime, setEditBestTime] = useState("");

  const [newNote, setNewNote] = useState("");
  const [callOutcome, setCallOutcome] = useState("NO_ANSWER");
  const [callNotes, setCallNotes] = useState("");
  const [callDuration, setCallDuration] = useState("");
  const [aiDetailTab, setAiDetailTab] = useState("opener");

  useEffect(() => {
    if (lead) {
      setEditPhone(lead.phone ?? "");
      setEditEmail(lead.confirmedEmail ?? "");
      setEditBestTime(lead.bestTimeToCall ?? "");
    }
  }, [lead?.id]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("PATCH", `/api/leads/${leadId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "email-eligibility"] });
      toast({ title: "Lead updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/leads/${leadId}/notes`, { note: newNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "notes"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
  });

  const logCallMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/leads/${leadId}/calls`, {
        outcome: callOutcome,
        notes: callNotes || undefined,
        durationSeconds: callDuration ? parseInt(callDuration) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "email-eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my"] });
      setCallNotes("");
      setCallDuration("");
      toast({ title: "Call logged" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (templateType: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/email/send`, { templateType });
      return res.json();
    },
    onSuccess: (_, templateType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "email-eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/today"] });
      const labels: Record<string, string> = {
        SEND_INFO: "Send Info",
        FOLLOW_UP: "Follow Up",
        UNREACHABLE_OUTREACH: "Unreachable Outreach",
      };
      toast({ title: `${labels[templateType] || templateType} email sent` });
    },
    onError: (err: any) => {
      toast({ title: "Email failed to send", description: err.message, variant: "destructive" });
    },
  });

  const generateAiMutation = useMutation({
    mutationFn: async (force: boolean = true) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/ai-research`, { force });
      return res.json();
    },
    onSuccess: (result: AiResearchResponse) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "ai-research"] });
      if (result.mock) {
        toast({ title: "Mock script generated", description: "AI not configured - using placeholder" });
      } else {
        toast({ title: "AI research generated" });
      }
    },
    onError: (err: any) => {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    },
  });

  const [markSignupDialogOpen, setMarkSignupDialogOpen] = useState(false);
  const [markSignupEmail, setMarkSignupEmail] = useState("");
  const [markSignupDate, setMarkSignupDate] = useState("");

  const markSignedUpMutation = useMutation({
    mutationFn: async (body: { email?: string; signedUpAt?: string }) => {
      await apiRequest("POST", `/api/admin/leads/${leadId}/mark-signed-up`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/metrics/signups"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads/my"] });
      setMarkSignupDialogOpen(false);
      setMarkSignupEmail("");
      setMarkSignupDate("");
      toast({ title: "Lead marked as signed up" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to mark signed up", description: err.message, variant: "destructive" });
    },
  });

  const canEdit = user?.role === "admin" || lead?.assignedToUserId === user?.id;

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium">Lead not found</p>
            <Link href="/leads">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to leads
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const outputJson = aiResearch?.current?.outputJson as AiOutputJson | undefined;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={user?.role === "admin" ? "/leads" : "/"}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate" data-testid="text-lead-company">{lead.companyName}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <Badge variant="secondary" className="text-xs">{lead.statusCall.replace(/_/g, " ")}</Badge>
            {lead.statusEmail !== "NOT_SENT" && (
              <Badge variant="outline" className="text-xs">{lead.statusEmail.replace(/_/g, " ")}</Badge>
            )}
            {lead.categoryKeyword && <Badge variant="outline" className="text-xs">{lead.categoryKeyword}</Badge>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="tabs-lead-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="calls" data-testid="tab-calls">Call Logs</TabsTrigger>
          <TabsTrigger value="emails" data-testid="tab-emails">Emails</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
          <TabsTrigger value="ai" data-testid="tab-ai">AI Call Prep</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Info</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={lead.fullAddress} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="City / State / ZIP" value={[lead.city, lead.state, lead.zip].filter(Boolean).join(", ")} />
                {lead.website && (
                  <div className="flex items-start gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Website</p>
                      <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener" className="text-sm text-primary flex items-center gap-1">
                        {lead.domain || lead.website} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
                {lead.rating && (
                  <InfoRow icon={<Star className="h-4 w-4" />} label="Rating" value={`${lead.rating} (${lead.reviewsCount ?? 0} reviews)`} />
                )}
                {lead.timezone && <InfoRow icon={<Clock className="h-4 w-4" />} label="Timezone" value={lead.timezone} />}
                {lead.scrapedEmail && <InfoRow icon={<Mail className="h-4 w-4" />} label="Scraped Email" value={lead.scrapedEmail} />}
              </div>
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold">Editable Fields</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} data-testid="input-edit-phone" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Confirmed Email</label>
                    <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} data-testid="input-edit-email" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Best Time to Call</label>
                    <Input value={editBestTime} onChange={(e) => setEditBestTime(e.target.value)} placeholder="e.g., 10am-12pm EST" data-testid="input-edit-best-time" />
                  </div>
                </div>
                <Button
                  onClick={() => updateMutation.mutate({ phone: editPhone, confirmedEmail: editEmail, bestTimeToCall: editBestTime })}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-lead"
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Signup Status</h3>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant={lead.statusSignup === "SIGNED_UP" ? "default" : "secondary"} data-testid="badge-signup-status">
                  {lead.statusSignup === "SIGNED_UP" ? "Signed Up" : "Not Signed Up"}
                </Badge>
                {lead.signedUpAt && (
                  <span className="text-xs text-muted-foreground" data-testid="text-signup-date">
                    {format(new Date(lead.signedUpAt), "MMM d, yyyy h:mm a")}
                  </span>
                )}
                {lead.signupSource && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-signup-source">
                    {lead.signupSource === "webhook" ? "Webhook" : "Admin Manual"}
                  </Badge>
                )}
              </div>
              {lead.signedUpEmail && (
                <p className="text-sm text-muted-foreground mt-2" data-testid="text-signup-email">
                  Signup email: {lead.signedUpEmail}
                </p>
              )}
              {user?.role === "admin" && lead.statusSignup !== "SIGNED_UP" && (
                <AlertDialog open={markSignupDialogOpen} onOpenChange={setMarkSignupDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="mt-3"
                      data-testid="button-mark-signed-up"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Signed Up
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark Lead as Signed Up</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark <strong>{lead.companyName}</strong> as signed up. This action records an audit event and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="signup-email">Signup Email (optional)</Label>
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder={lead.confirmedEmail || lead.scrapedEmail || "email@example.com"}
                          value={markSignupEmail}
                          onChange={(e) => setMarkSignupEmail(e.target.value)}
                          data-testid="input-signup-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-date">Signup Date (optional)</Label>
                        <Input
                          id="signup-date"
                          type="datetime-local"
                          value={markSignupDate}
                          onChange={(e) => setMarkSignupDate(e.target.value)}
                          data-testid="input-signup-date"
                        />
                      </div>
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-signup">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const body: { email?: string; signedUpAt?: string } = {};
                          if (markSignupEmail.trim()) body.email = markSignupEmail.trim();
                          if (markSignupDate) body.signedUpAt = new Date(markSignupDate).toISOString();
                          markSignedUpMutation.mutate(body);
                        }}
                        disabled={markSignedUpMutation.isPending}
                        data-testid="button-confirm-signup"
                      >
                        {markSignedUpMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls" className="space-y-4 mt-4">
          {canEdit && (
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold flex items-center gap-2"><PhoneCall className="h-4 w-4" /> Log a Call</h3>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Outcome</label>
                    <Select value={callOutcome} onValueChange={setCallOutcome}>
                      <SelectTrigger data-testid="select-call-outcome">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {callOutcomeEnum.map((s) => (
                          <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Duration (seconds)</label>
                    <Input type="number" value={callDuration} onChange={(e) => setCallDuration(e.target.value)} placeholder="120" data-testid="input-call-duration" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                  <Textarea value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="Call notes..." className="resize-none" data-testid="input-call-notes" />
                </div>
                <Button onClick={() => logCallMutation.mutate()} disabled={logCallMutation.isPending} data-testid="button-log-call">
                  {logCallMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PhoneCall className="h-4 w-4 mr-2" />}
                  Log Call
                </Button>
              </CardContent>
            </Card>
          )}

          {(callLogs ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <PhoneCall className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No call logs yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(callLogs ?? []).map((log) => (
                <CallLogCard key={log.id} log={log} isAdmin={user?.role === "admin"} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="emails" className="space-y-4 mt-4">
          {canEdit && (
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Send Email</h3>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  <EmailButton
                    label="Send Info"
                    eligible={eligibility?.sendInfo.eligible ?? false}
                    reasons={eligibility?.sendInfo.reasons ?? []}
                    isPending={sendEmailMutation.isPending}
                    onClick={() => sendEmailMutation.mutate("SEND_INFO")}
                    testId="button-email-send-info"
                  />
                  <EmailButton
                    label="Follow Up"
                    eligible={eligibility?.followUp.eligible ?? false}
                    reasons={eligibility?.followUp.reasons ?? []}
                    isPending={sendEmailMutation.isPending}
                    onClick={() => sendEmailMutation.mutate("FOLLOW_UP")}
                    testId="button-email-follow-up"
                  />
                  <EmailButton
                    label="Unreachable Outreach"
                    eligible={eligibility?.unreachableOutreach.eligible ?? false}
                    reasons={eligibility?.unreachableOutreach.reasons ?? []}
                    isPending={sendEmailMutation.isPending}
                    onClick={() => sendEmailMutation.mutate("UNREACHABLE_OUTREACH")}
                    testId="button-email-unreachable"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {(emailLogs ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No emails sent yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(emailLogs ?? []).map((email) => (
                <Card key={email.id} data-testid={`card-email-${email.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Send className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{email.templateType.replace(/_/g, " ")}</Badge>
                          <Badge variant={email.status === "FAILED" ? "destructive" : "secondary"} className="text-xs">
                            {email.status}
                          </Badge>
                        </div>
                        <p className="text-sm mt-1 truncate">{email.subject}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          To: {email.toEmail} &middot; {format(new Date(email.createdAt), "MMM d, yyyy h:mm a")}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4 mt-4">
          {canEdit && (
            <Card>
              <CardHeader className="pb-3">
                <h3 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Add Note</h3>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Write a note..." className="resize-none" data-testid="input-new-note" />
                <Button onClick={() => addNoteMutation.mutate()} disabled={!newNote.trim() || addNoteMutation.isPending} data-testid="button-add-note">
                  {addNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add Note
                </Button>
              </CardContent>
            </Card>
          )}

          {(notes ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No notes yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(notes ?? []).map((note) => (
                <Card key={note.id} data-testid={`card-note-${note.id}`}>
                  <CardContent className="p-4">
                    <p className="text-sm">{note.note}</p>
                    <p className="text-xs text-muted-foreground mt-2">{format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ai" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Call Prep</h3>
                {aiResearch?.exists && canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateAiMutation.mutate(true)}
                    disabled={generateAiMutation.isPending}
                    data-testid="button-regenerate-ai-detail"
                  >
                    {generateAiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Regenerate
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading AI research...
                </div>
              ) : aiResearch?.exists && aiResearch.current && outputJson ? (
                <>
                  {aiResearch.isStale && (
                    <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground">
                        The AI prompt has been updated since this was generated. Consider regenerating.
                      </p>
                    </div>
                  )}

                  <Tabs value={aiDetailTab} onValueChange={setAiDetailTab}>
                    <TabsList>
                      <TabsTrigger value="opener" data-testid="tab-ai-opener">Opener Script</TabsTrigger>
                      <TabsTrigger value="details" data-testid="tab-ai-details">More Details</TabsTrigger>
                    </TabsList>

                    <TabsContent value="opener" className="mt-3">
                      <OpenerScriptCard script={aiResearch.current.openerScript} />
                    </TabsContent>

                    <TabsContent value="details" className="mt-3 space-y-4">
                      {outputJson.summary_bullets?.length > 0 && (
                        <DetailSection icon={<ListChecks className="h-4 w-4" />} title="Key Facts">
                          <ul className="space-y-1.5">
                            {outputJson.summary_bullets.map((b, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-muted-foreground mt-0.5 shrink-0">-</span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        </DetailSection>
                      )}

                      {outputJson.discovery_questions?.length > 0 && (
                        <DetailSection icon={<HelpCircle className="h-4 w-4" />} title="Discovery Questions">
                          <ol className="space-y-1.5 list-decimal list-inside">
                            {outputJson.discovery_questions.map((q, i) => (
                              <li key={i} className="text-sm">{q}</li>
                            ))}
                          </ol>
                        </DetailSection>
                      )}

                      {outputJson.objections?.length > 0 && (
                        <DetailSection icon={<Shield className="h-4 w-4" />} title="Objection Handling">
                          <ul className="space-y-2">
                            {outputJson.objections.map((o, i) => (
                              <li key={i} className="text-sm">{o}</li>
                            ))}
                          </ul>
                        </DetailSection>
                      )}

                      {outputJson.suggested_next_step && (
                        <DetailSection icon={<ArrowRight className="h-4 w-4" />} title="Suggested Next Step">
                          <p className="text-sm">{outputJson.suggested_next_step}</p>
                        </DetailSection>
                      )}
                    </TabsContent>
                  </Tabs>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-2 border-t">
                    <span>Prompt v{aiResearch.current.promptVersion}</span>
                    <span>&middot;</span>
                    <span>Model: {aiResearch.current.modelUsed || "unknown"}</span>
                    <span>&middot;</span>
                    <span>{format(new Date(aiResearch.current.createdAt), "MMM d, yyyy h:mm a")}</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    No AI research generated for this lead yet.
                  </p>
                  {canEdit && (
                    <Button
                      onClick={() => generateAiMutation.mutate(true)}
                      disabled={generateAiMutation.isPending}
                      data-testid="button-generate-ai-detail"
                    >
                      {generateAiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                      Run AI Research
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OpenerScriptCard({ script }: { script: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  function handleCopy() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative rounded-md bg-muted p-4">
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2"
        onClick={handleCopy}
        data-testid="button-copy-opener"
      >
        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
      <p className="text-sm whitespace-pre-wrap leading-relaxed pr-10" data-testid="text-ai-opener-script-detail">
        {script}
      </p>
    </div>
  );
}

function DetailSection({ icon, title, children }: { icon: any; title: string; children: any }) {
  return (
    <div className="rounded-md bg-muted p-4 space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
}

function EmailButton({ label, eligible, reasons, isPending, onClick, testId }: {
  label: string;
  eligible: boolean;
  reasons: string[];
  isPending: boolean;
  onClick: () => void;
  testId: string;
}) {
  if (eligible) {
    return (
      <Button size="sm" onClick={onClick} disabled={isPending} data-testid={testId}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
        {label}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button size="sm" disabled data-testid={testId}>
            <AlertCircle className="h-4 w-4 mr-1" />
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="text-xs space-y-1">
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

function formatCallDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CallLogCard({ log, isAdmin }: { log: CallLog; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [transcriptData, setTranscriptData] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const hasRecording = !!(log as any).recordingUrl || !!(log as any).recordingSid;
  const hasTranscript = (log as any).transcriptStatus === "READY";
  const transcriptStatus = (log as any).transcriptStatus;
  const callMode = (log as any).callMode;
  const twilioCallSid = (log as any).twilioCallSid;

  async function loadTranscript() {
    if (transcriptData) return;
    setTranscriptLoading(true);
    try {
      const res = await fetch(`/api/call/${log.id}/transcript`);
      if (res.ok) {
        const data = await res.json();
        setTranscriptData(data.transcript);
      }
    } catch {}
    setTranscriptLoading(false);
  }

  return (
    <Card data-testid={`card-call-${log.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
            {callMode === "BROWSER" ? (
              <Monitor className="h-4 w-4 text-muted-foreground" />
            ) : callMode === "AGENT_PHONE" ? (
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {log.outcome ? (
                <Badge variant="outline" className="text-xs">{log.outcome.replace(/_/g, " ")}</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">In Progress</Badge>
              )}
              {log.durationSeconds && (
                <span className="text-xs text-muted-foreground">{formatCallDuration(log.durationSeconds)}</span>
              )}
              {log.withinBadTimingWindow && <Badge variant="secondary" className="text-xs">Bad Timing</Badge>}
              {callMode && (
                <Badge variant="outline" className="text-xs">
                  {callMode === "BROWSER" ? "Browser" : callMode === "AGENT_PHONE" ? "Phone" : "Manual"}
                </Badge>
              )}
              {hasRecording && (
                <Badge variant="outline" className="text-xs">
                  <Headphones className="h-3 w-3 mr-1" /> Recorded
                </Badge>
              )}
              {transcriptStatus && transcriptStatus !== "NONE" && (
                <Badge
                  variant={transcriptStatus === "READY" ? "outline" : "secondary"}
                  className="text-xs"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  {transcriptStatus === "READY" ? "Transcribed" : transcriptStatus === "PROCESSING" || transcriptStatus === "PENDING" ? "Transcribing..." : transcriptStatus === "FAILED" ? "Transcription Failed" : transcriptStatus}
                </Badge>
              )}
            </div>
            {log.notes && <p className="text-sm mt-1">{log.notes}</p>}
            <p className="text-xs text-muted-foreground mt-1">{format(new Date(log.calledAt), "MMM d, yyyy h:mm a")}</p>
          </div>

          {(hasRecording || hasTranscript) && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setExpanded(!expanded);
                if (!expanded && hasTranscript) loadTranscript();
              }}
              data-testid={`button-expand-call-${log.id}`}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {hasRecording && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Recording</p>
                <audio
                  controls
                  className="w-full"
                  src={`/api/call/${log.id}/recording`}
                  data-testid={`audio-recording-${log.id}`}
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}
            {hasTranscript && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Transcript</p>
                {transcriptLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading transcript...
                  </div>
                ) : transcriptData ? (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-sm whitespace-pre-wrap" data-testid={`text-transcript-${log.id}`}>
                      {transcriptData}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Transcript not available</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
