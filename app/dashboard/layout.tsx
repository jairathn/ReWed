import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard | ReWed',
  description: 'Manage your wedding experience.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg-soft-cream)' }}
    >
      {children}
    </div>
  );
}
