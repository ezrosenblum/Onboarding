import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Lead } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Building2, MapPin, ExternalLink, Search } from "lucide-react";
import { useState } from "react";

function statusColor(status: string) {
  switch (status) {
    case "NOT_CALLED": return "secondary";
    case "SPOKE_INTERESTED": return "default";
    case "SPOKE_SEND_INFO": return "default";
    case "SPOKE_NOT_INTERESTED": return "destructive";
    default: return "outline";
  }
}

export default function MyLeadsPage() {
  const [search, setSearch] = useState("");
  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads/my"] });

  const filtered = (leads ?? []).filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.companyName.toLowerCase().includes(s) ||
      l.phone?.toLowerCase().includes(s) ||
      l.city?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">My Assigned Leads</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "Loading..." : `${filtered.length} lead${filtered.length !== 1 ? "s" : ""} assigned to you`}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, phone, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-my-leads"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No assigned leads</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "No leads match your search." : "You don't have any leads assigned yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((lead) => (
            <Link key={lead.id} href={`/leads/${lead.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-lead-${lead.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" data-testid={`text-company-${lead.id}`}>{lead.companyName}</p>
                      <div className="flex items-center gap-3 flex-wrap mt-1">
                        {lead.city && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />{lead.city}{lead.state ? `, ${lead.state}` : ""}
                          </span>
                        )}
                        {lead.phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />{lead.phone}
                          </span>
                        )}
                        {(lead.scrapedEmail || lead.confirmedEmail) && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />{lead.confirmedEmail || lead.scrapedEmail}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={statusColor(lead.statusCall)} className="text-xs">
                        {lead.statusCall.replace(/_/g, " ")}
                      </Badge>
                      {lead.attemptCount > 0 && (
                        <span className="text-xs text-muted-foreground">{lead.attemptCount} attempt{lead.attemptCount !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
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
