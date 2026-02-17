import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Mail, Save, RotateCcw, Loader2, Info, Code } from "lucide-react";
import { useState, useEffect } from "react";

interface TemplateData {
  id: number | null;
  pipelineType: string;
  templateType: string;
  subject: string;
  bodyHtml: string;
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Email Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage outbound email templates for each pipeline</p>
        </div>
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
          {(templates ?? []).map((template) => (
            <TemplateCard
              key={template.templateType}
              template={template}
              pipeline={pipeline}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, pipeline }: { template: TemplateData; pipeline: string }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const label = TEMPLATE_LABELS[template.templateType];

  useEffect(() => {
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
  }, [template.subject, template.bodyHtml]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/templates", {
        pipelineType: pipeline,
        templateType: template.templateType,
        subject,
        bodyHtml,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", pipeline] });
      toast({ title: `${label?.title} template saved` });
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
      toast({ title: `${label?.title} template restored to default` });
    },
    onError: () => toast({ title: "Restore failed", variant: "destructive" }),
  });

  const hasChanges = subject !== template.subject || bodyHtml !== template.bodyHtml;

  return (
    <Card data-testid={`card-template-${template.templateType.toLowerCase()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">{label?.title || template.templateType}</h3>
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
