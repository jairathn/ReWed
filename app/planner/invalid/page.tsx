export default function InvalidPlannerLink() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'var(--bg-warm-gradient)',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: 'center',
          padding: 32,
          background: 'var(--bg-pure-white)',
          borderRadius: 18,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
          }}
        >
          Link no longer valid
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            margin: 0,
            fontFamily: 'var(--font-body)',
          }}
        >
          This planner link has been revoked or replaced. Ask the couple to send
          you a new one.
        </p>
      </div>
    </div>
  );
}
