import { Upload, Users, ClipboardList, LayoutDashboard, UserCheck, PhoneCall, List, Mail, Sparkles, BarChart3, Activity, Settings, Headphones } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const adminItems = [
  { title: "Upload Leads", url: "/admin/upload", icon: Upload },
  { title: "Assign Batch", url: "/admin/assign", icon: UserCheck },
  { title: "All Vendor Leads", url: "/leads", icon: ClipboardList },
  { title: "Email Templates", url: "/admin/email-templates", icon: Mail },
  { title: "AI Prompts", url: "/admin/ai-prompts", icon: Sparkles },
  { title: "Performance", url: "/admin/dashboard", icon: Activity },
  { title: "Signup Metrics", url: "/admin/signup-metrics", icon: BarChart3 },
  { title: "Call Review", url: "/admin/call-review", icon: Headphones },
  { title: "Settings", url: "/admin/settings", icon: Settings },
  { title: "Manage Users", url: "/admin/users", icon: Users },
];

const callerItems = [
  { title: "Today's Calls", url: "/", icon: PhoneCall },
  { title: "My Assigned", url: "/my-leads", icon: List },
  { title: "All Vendor Leads", url: "/leads", icon: ClipboardList },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const items = isAdmin ? adminItems : callerItems;
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-primary-foreground">SS</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">SupplyStreamline</span>
            <span className="text-xs text-muted-foreground">Onboarding</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{isAdmin ? "Admin" : "Vendor Pipeline"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{user.name}</span>
            <Badge variant="outline" className="w-fit text-[10px]">
              {isAdmin ? "Admin" : "Caller"}
            </Badge>
          </div>
          <Button size="icon" variant="ghost" onClick={logout} data-testid="button-logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
