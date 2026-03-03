import Link from 'next/link';

export default function DashboardHomePage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1
            className="text-3xl font-medium"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Your Weddings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Manage your wedding experiences
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="btn-primary inline-flex items-center gap-2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Wedding
        </Link>
      </div>

      {/* Empty State */}
      <div
        className="card p-12 text-center"
        style={{ background: 'var(--bg-pure-white)' }}
      >
        <p className="text-5xl mb-4">&#128141;</p>
        <h2
          className="text-xl font-medium mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          No weddings yet
        </h2>
        <p
          className="text-sm mb-6 max-w-md mx-auto"
          style={{ color: 'var(--text-secondary)' }}
        >
          Create your first wedding to start building the guest experience.
          You&apos;ll be able to import guests, configure events, and customize
          everything.
        </p>
        <Link href="/dashboard/create" className="btn-primary inline-block">
          Create Your First Wedding
        </Link>
      </div>
    </div>
  );
}
