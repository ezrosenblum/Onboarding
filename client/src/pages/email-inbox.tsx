import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, Inbox, User, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";

interface EmailThread {
  leadId: number;
  companyName: string;
  confirmedEmail: string | null;
  contactName: string | null;
  assignedToUserId: number | null;
  statusEmail: string;
  unreadCount: number;
  sentCount: number;
  receivedCount: number;
  lastActivity: string | null;
  lastSubject: string | null;
  assignedCallerName: string | null;
}

export default function EmailInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");

  const { data: threads, isLoading } = useQuery<EmailThread[]>({
    queryKey: ["/api/emails/inbox", filter],
    queryFn: async () => {
      const res = await fetch(`/api/emails/inbox?filter=${filter}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const totalUnread = (threads ?? []).reduce((sum, t) => sum + t.unreadCount, 0);

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-inbox-title">
          <Inbox className="h-5 w-5" /> Email Inbox
          {totalUnread > 0 && (
            <Badge variant="default" className="ml-1" data-testid="badge-unread-total">{totalUnread} unread</Badge>
          )}
        </h1>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList data-testid="tabs-inbox-filter">
          <TabsTrigger value="all" data-testid="tab-inbox-all">All</TabsTrigger>
          <TabsTrigger value="unread" data-testid="tab-inbox-unread">Unread</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-inbox-mine">Assigned to Me</TabsTrigger>
        </TabsList>
      </Tabs>

      {(threads ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Mail className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground" data-testid="text-inbox-empty">
              {filter === "unread" ? "No unread messages" : filter === "mine" ? "No email threads assigned to you" : "No email threads yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(threads ?? []).map((thread) => (
            <Link key={thread.leadId} href={`/leads/${thread.leadId}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-thread-${thread.leadId}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{thread.companyName}</span>
                        {thread.unreadCount > 0 && (
                          <Badge variant="default" className="text-xs" data-testid={`badge-unread-${thread.leadId}`}>
                            {thread.unreadCount} new
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{thread.statusEmail}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {thread.lastSubject || "No subject"}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {thread.contactName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {thread.contactName}
                          </span>
                        )}
                        <span>{thread.sentCount} sent</span>
                        {thread.receivedCount > 0 && <span>{thread.receivedCount} received</span>}
                        {thread.assignedCallerName && (
                          <span>Assigned: {thread.assignedCallerName}</span>
                        )}
                        {thread.lastActivity && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(thread.lastActivity), "MMM d, h:mm a")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
