import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  MessageSquare,
  Inbox,
  FileText,
  Mail,
  Instagram,
  LifeBuoy,
  BookOpen,
  AlertTriangle,
  Headphones,
  FlaskConical,
  Eye,
  Server,
  Settings,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const groups: { label: string; items: Item[] }[] = [
  {
    label: "Geral",
    items: [
      { title: "Engajamento", url: "/admin/engajamento", icon: LayoutDashboard },
      { title: "Usuários", url: "/admin/usuarios", icon: Users },
      { title: "Sessões", url: "/admin/sessoes", icon: CalendarDays },
    ],
  },
  {
    label: "Mensageria",
    items: [
      { title: "Mensagens", url: "/admin/mensagens", icon: MessageSquare },
      { title: "Inbox Recuperação", url: "/admin/whatsapp-inbox", icon: Inbox },
      { title: "Templates", url: "/admin/templates", icon: FileText },
      { title: "E-mails", url: "/admin/emails", icon: Mail },
      { title: "Instagram", url: "/admin/instagram", icon: Instagram },
    ],
  },
  {
    label: "Suporte",
    items: [
      { title: "Conversas", url: "/admin/suporte", icon: LifeBuoy },
      { title: "Conhecimento", url: "/admin/suporte/conhecimento", icon: BookOpen },
      { title: "Gaps", url: "/admin/suporte/gaps", icon: AlertTriangle },
    ],
  },
  {
    label: "Conteúdo",
    items: [
      { title: "Meditações", url: "/admin/meditacoes", icon: Headphones },
      { title: "Testes", url: "/admin/testes", icon: FlaskConical },
      { title: "Preview Popup", url: "/admin/popup-preview", icon: Eye },
    ],
  },
  {
    label: "Infra",
    items: [
      { title: "Instâncias", url: "/admin/instancias", icon: Server },
      { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  const { pathname } = useLocation();
  const isActive = (url: string) =>
    pathname === url || (url !== "/admin" && pathname.startsWith(url + "/"));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <NavLink to="/admin/engajamento" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            A
          </span>
          <span className="group-data-[collapsible=icon]:hidden">Aura · Admin</span>
        </NavLink>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}