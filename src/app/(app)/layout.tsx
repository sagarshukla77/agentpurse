import { AppShell } from '@/components/domain/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
