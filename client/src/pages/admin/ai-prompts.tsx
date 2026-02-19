import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, RotateCcw, Sparkles, AlertTriangle, Users, ShoppingCart } from "lucide-react";
import { useState, useEffect } from "react";

interface AiPromptData {
  id: number | null;
  pipelineType: string;
  promptTemplate: string;
  version: number;
  updatedAt: string | null;
  isDefault: boolean;
}

const PIPELINE_CONFIG: Record<string, { label: string; description: string; icon: typeof Users }> = {
  vendor: {
    label: "Vendor Leads",
    description: "Prompt template used to generate call opener scripts for vendor pipeline leads.",
    icon: Users,
  },
  buyer: {
    label: "Buyer Leads",
    description: "Prompt template used to generate call opener scripts for buyer pipeline leads.",
    icon: ShoppingCart,
  },
};

function PromptCard({
  prompt,
  editedValue,
  onEditChange,
  onSave,
  onRestore,
  isSaving,
  isRestoring,
}: {
  prompt: AiPromptData;
  editedValue: string;
  onEditChange: (value: string) => void;
  onSave: () => void;
  onRestore: () => void;
  isSaving: boolean;
  isRestoring: boolean;
}) {
  const config = PIPELINE_CONFIG[prompt.pipelineType] ?? {
    label: prompt.pipelineType,
    description: "",
    icon: Users,
  };
  const Icon = config.icon;
  const isDirty = editedValue !== prompt.promptTemplate;

  return (
    <Card data-testid={`card-prompt-${prompt.pipelineType}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
          <CardTitle className="text-base" data-testid={`title-prompt-${prompt.pipelineType}`}>
            {config.label} Prompt
          </CardTitle>
          <Badge variant="outline" className="text-xs" data-testid={`badge-version-${prompt.pipelineType}`}>
            v{prompt.version}
          </Badge>
          {prompt.isDefault && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-default-${prompt.pipelineType}`}>
              Default
            </Badge>
          )}
          {isDirty && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-unsaved-${prompt.pipelineType}`}>
              Unsaved changes
            </Badge>
          )}
        </div>
        <CardDescription>
          {config.description}
        </CardDescription>
        {prompt.updatedAt && (
          <p className="text-xs text-muted-foreground" data-testid={`text-updated-${prompt.pipelineType}`}>
            Last updated: {new Date(prompt.updatedAt).toLocaleDateString()} at {new Date(prompt.updatedAt).toLocaleTimeString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={editedValue}
          onChange={(e) => onEditChange(e.target.value)}
          rows={16}
          className="font-mono text-sm"
          data-testid={`textarea-prompt-${prompt.pipelineType}`}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={onSave}
            disabled={!isDirty || isSaving}
            data-testid={`button-save-prompt-${prompt.pipelineType}`}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Prompt
          </Button>
          <Button
            variant="outline"
            onClick={onRestore}
            disabled={prompt.isDefault || isRestoring}
            data-testid={`button-restore-prompt-${prompt.pipelineType}`}
          >
            {isRestoring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Restore Default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AiPromptsPage() {
  const { toast } = useToast();
  const { data: prompts, isLoading } = useQuery<AiPromptData[]>({
    queryKey: ["/api/admin/ai-prompts"],
  });

  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (prompts) {
      const map: Record<string, string> = {};
      prompts.forEach((p) => {
        map[p.pipelineType] = p.promptTemplate;
      });
      setEditedPrompts(map);
    }
  }, [prompts]);

  const saveMutation = useMutation({
    mutationFn: async ({ pipelineType, promptTemplate }: { pipelineType: string; promptTemplate: string }) => {
      await apiRequest("PUT", "/api/admin/ai-prompts", { pipelineType, promptTemplate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-prompts"] });
      toast({ title: "AI prompt saved", description: "Version incremented. New leads will use the updated prompt." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (pipelineType: string) => {
      await apiRequest("POST", "/api/admin/ai-prompts/restore-default", { pipelineType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-prompts"] });
      toast({ title: "Prompt restored to default" });
    },
    onError: (err: any) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" data-testid="skeleton-title" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" data-testid="skeleton-vendor" />
          <Skeleton className="h-96 w-full" data-testid="skeleton-buyer" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="heading-ai-prompts">
          <Sparkles className="h-5 w-5" />
          AI Prompt Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-description">
          Manage the AI prompts used to generate call opener scripts. Each pipeline type (vendor and buyer) has its own dedicated prompt template. Saving increments the version, and cached scripts for leads will be marked as stale.
        </p>
      </div>

      <Card data-testid="card-template-variables">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p>Use these template variables in your prompt:</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {["{{company_name}}", "{{category_keyword}}", "{{city}}", "{{state}}", "{{phone}}", "{{website}}", "{{rating}}", "{{reviews_count}}", "{{scraped_email}}", "{{confirmed_email}}", "{{full_address}}"].map((v) => (
                  <Badge key={v} variant="secondary" className="text-xs font-mono" data-testid={`badge-variable-${v}`}>{v}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {["vendor", "buyer"].map((pipelineType) => {
          const prompt = (prompts ?? []).find((p) => p.pipelineType === pipelineType);
          if (!prompt) {
            const config = PIPELINE_CONFIG[pipelineType];
            const Icon = config?.icon ?? Users;
            return (
              <Card key={pipelineType} data-testid={`card-prompt-${pipelineType}-missing`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Icon className="h-5 w-5" /> {config?.label ?? pipelineType}
                  </CardTitle>
                  <CardDescription>{config?.description ?? ""}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">No prompt template exists for this pipeline yet.</p>
                  <Button
                    onClick={() => saveMutation.mutate({ pipelineType, promptTemplate: `Default ${pipelineType} prompt - edit to customize` })}
                    disabled={saveMutation.isPending}
                    data-testid={`button-create-prompt-${pipelineType}`}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Create {config?.label ?? pipelineType} Prompt
                  </Button>
                </CardContent>
              </Card>
            );
          }
          return (
            <PromptCard
              key={pipelineType}
              prompt={prompt}
              editedValue={editedPrompts[prompt.pipelineType] ?? ""}
              onEditChange={(val) => setEditedPrompts((prev) => ({ ...prev, [pipelineType]: val }))}
              onSave={() => saveMutation.mutate({ pipelineType, promptTemplate: editedPrompts[pipelineType] })}
              onRestore={() => restoreMutation.mutate(pipelineType)}
              isSaving={saveMutation.isPending}
              isRestoring={restoreMutation.isPending}
            />
          );
        })}
      </div>
    </div>
  );
}
