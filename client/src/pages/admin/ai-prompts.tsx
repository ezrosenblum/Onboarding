import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, RotateCcw, Sparkles, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

interface AiPromptData {
  id: number | null;
  pipelineType: string;
  promptTemplate: string;
  version: number;
  updatedAt: string | null;
  isDefault: boolean;
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
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Prompt Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the AI prompts used to generate call opener scripts. Each save increments the version, and cached scripts for leads will be marked as stale.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p>Use these template variables in your prompt:</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {["{{company_name}}", "{{category_keyword}}", "{{city}}", "{{state}}", "{{phone}}", "{{website}}", "{{rating}}", "{{reviews_count}}", "{{scraped_email}}", "{{confirmed_email}}", "{{full_address}}"].map((v) => (
                  <Badge key={v} variant="secondary" className="text-xs font-mono">{v}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {(prompts ?? []).map((prompt) => {
        const isDirty = editedPrompts[prompt.pipelineType] !== prompt.promptTemplate;
        return (
          <Card key={prompt.pipelineType}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold capitalize">{prompt.pipelineType} Pipeline Prompt</h3>
                <Badge variant="outline" className="text-xs">v{prompt.version}</Badge>
                {prompt.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
              </div>
              {prompt.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(prompt.updatedAt).toLocaleDateString()}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={editedPrompts[prompt.pipelineType] ?? ""}
                onChange={(e) => setEditedPrompts((prev) => ({ ...prev, [prompt.pipelineType]: e.target.value }))}
                rows={16}
                className="font-mono text-sm"
                data-testid={`textarea-prompt-${prompt.pipelineType}`}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => saveMutation.mutate({ pipelineType: prompt.pipelineType, promptTemplate: editedPrompts[prompt.pipelineType] })}
                  disabled={!isDirty || saveMutation.isPending}
                  data-testid={`button-save-prompt-${prompt.pipelineType}`}
                >
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Prompt
                </Button>
                <Button
                  variant="outline"
                  onClick={() => restoreMutation.mutate(prompt.pipelineType)}
                  disabled={prompt.isDefault || restoreMutation.isPending}
                  data-testid={`button-restore-prompt-${prompt.pipelineType}`}
                >
                  {restoreMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  Restore Default
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
