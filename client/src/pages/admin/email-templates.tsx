import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Save, RotateCcw, Loader2, Info, Code, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { emailTemplateTypeEnum } from "@shared/schema";

interface TemplateData {
  id: number | null;
  pipelineType: string;
  templateType: string;
  name: string;
  subject: string;
  bodyHtml: string;
  sequence: number;
  updatedAt: string | null;
  isDefault: boolean;
}

const TEMPLATE_LABELS: Record<string, { title: string; description: string }> = {
  SEND_INFO: {
    title: "Send Info",
    description: "Initial information email sent after speaking with the lead",
  },
  FOLLOW_UP: {
    title: "Follow Up",
    description: "Follow-up email sent after the initial info email",
  },
  UNREACHABLE_OUTREACH: {
    title: "Unreachable Outreach",
    description: "Last-resort email for leads that could not be reached by phone",
  },
};

const TEMPLATE_VARIABLES = [
  { variable: "{{company_name}}", description: "The lead's company name" },
  { variable: "{{contact_email}}", description: "The lead's confirmed or scraped email" },
  { variable: "{{caller_name}}", description: "Name of the caller sending the email" },
  { variable: "{{signup_link}}", description: "Unique signup link with lead tracking token" },
  { variable: "{{city}}", description: "The lead's city" },
  { variable: "{{state}}", description: "The lead's state" },
];

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const [pipeline, setPipeline] = useState("vendor");

  const { data: templates, isLoading } = useQuery<TemplateData[]>({
    queryKey: ["/api/templates", pipeline],
    queryFn: async () => {
      const res = await fetch(`/api/templates?pipeline=${pipeline}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const sortedTemplates = [...(templates ?? [])].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Email Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage outbound email templates for each pipeline</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CreateTemplateDialog />
          <div className="w-48">
            <Select value={pipeline} onValueChange={setPipeline}>
              <SelectTrigger data-testid="select-pipeline-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendor">Vendor Pipeline</SelectItem>
                <SelectItem value="buyer">Buyer Pipeline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold flex items-center gap-2 text-sm"><Code className="h-4 w-4" /> Available Template Variables</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TEMPLATE_VARIABLES.map((v) => (
              <div key={v.variable} className="flex items-start gap-2">
                <Badge variant="secondary" className="font-mono text-xs shrink-0">{v.variable}</Badge>
                <span className="text-xs text-muted-foreground">{v.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {sortedTemplates.map((template) => (
            <TemplateCard
              key={`${template.templateType}-${template.id}`}
              template={template}
              pipeline={pipeline}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTemplateDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pipelineType, setPipelineType] = useState("vendor");
  const [templateType, setTemplateType] = useState<string>(emailTemplateTypeEnum[0]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sequence, setSequence] = useState("1");

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/templates", {
        pipelineType,
        templateType,
        name,
        subject,
        bodyHtml,
        sequence: parseInt(sequence) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template created successfully" });
      setOpen(false);
      setPipelineType("vendor");
      setTemplateType(emailTemplateTypeEnum[0]);
      setName("");
      setSubject("");
      setBodyHtml("");
      setSequence("1");
    },
    onError: (err: any) => toast({ title: err?.message || "Failed to create template", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-template">
          <Plus className="h-4 w-4 mr-1" />
          Create New Template
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Pipeline Type</Label>
              <Select value={pipelineType} onValueChange={setPipelineType}>
                <SelectTrigger data-testid="select-create-pipeline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="buyer">Buyer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Template Type</Label>
              <Select value={templateType} onValueChange={setTemplateType}>
                <SelectTrigger data-testid="select-create-template-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {emailTemplateTypeEnum.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TEMPLATE_LABELS[t]?.title || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vendor Welcome Email"
                data-testid="input-create-name"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Sequence</Label>
              <Input
                type="number"
                min={0}
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                placeholder="1"
                data-testid="input-create-sequence"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line"
              data-testid="input-create-subject"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Body (HTML)</Label>
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="min-h-[150px] font-mono text-xs resize-y"
              placeholder="<p>Hello {{company_name}},</p>"
              data-testid="textarea-create-body"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-create-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !subject.trim() || !bodyHtml.trim()}
            data-testid="button-create-submit"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Create Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({ template, pipeline }: { template: TemplateData; pipeline: string }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [name, setName] = useState(template.name ?? "");
  const [sequence, setSequence] = useState(String(template.sequence ?? 0));
  const label = TEMPLATE_LABELS[template.templateType];

  useEffect(() => {
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
    setName(template.name ?? "");
    setSequence(String(template.sequence ?? 0));
  }, [template.subject, template.bodyHtml, template.name, template.sequence]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/templates", {
        pipelineType: pipeline,
        templateType: template.templateType,
        name,
        subject,
        bodyHtml,
        sequence: parseInt(sequence) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", pipeline] });
      toast({ title: `${label?.title || template.templateType} template saved` });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/templates/restore-default", {
        pipelineType: pipeline,
        templateType: template.templateType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSubject(data.subject);
      setBodyHtml(data.bodyHtml);
      queryClient.invalidateQueries({ queryKey: ["/api/templates", pipeline] });
      toast({ title: `${label?.title || template.templateType} template restored to default` });
    },
    onError: () => toast({ title: "Restore failed", variant: "destructive" }),
  });

  const hasChanges =
    subject !== template.subject ||
    bodyHtml !== template.bodyHtml ||
    name !== (template.name ?? "") ||
    String(parseInt(sequence) || 0) !== String(template.sequence ?? 0);

  return (
    <Card data-testid={`card-template-${template.templateType.toLowerCase()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">{label?.title || template.templateType}</h3>
            {template.name && (
              <Badge variant="outline" className="text-xs" data-testid={`badge-name-${template.templateType.toLowerCase()}`}>
                {template.name}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs" data-testid={`badge-sequence-${template.templateType.toLowerCase()}`}>
              Seq: {template.sequence ?? 0}
            </Badge>
            {template.isDefault && <Badge variant="outline" className="text-xs">Default</Badge>}
          </div>
          {template.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Last updated: {new Date(template.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        {label?.description && (
          <p className="text-xs text-muted-foreground mt-1">{label.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name"
              data-testid={`input-name-${template.templateType.toLowerCase()}`}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Sequence</label>
            <Input
              type="number"
              min={0}
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              placeholder="0"
              data-testid={`input-sequence-${template.templateType.toLowerCase()}`}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            data-testid={`input-subject-${template.templateType.toLowerCase()}`}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Body (HTML)</label>
          <Textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            className="min-h-[200px] font-mono text-xs resize-y"
            data-testid={`textarea-body-${template.templateType.toLowerCase()}`}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!hasChanges && !template.isDefault)}
            data-testid={`button-save-${template.templateType.toLowerCase()}`}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save Template
          </Button>
          <Button
            variant="outline"
            onClick={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
            data-testid={`button-restore-${template.templateType.toLowerCase()}`}
          >
            {restoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            Restore Default
          </Button>
          {hasChanges && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> Unsaved changes
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
