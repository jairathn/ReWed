import { getPool } from '@/lib/db/client';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';

type Params = { slug: string };

async function getDirectoryData(slug: string) {
  const pool = getPool();

  const weddingResult = await pool.query(
    'SELECT id FROM weddings WHERE slug = $1',
    [slug]
  );

  if (weddingResult.rows.length === 0) return null;

  const weddingId = weddingResult.rows[0].id;

  const guestsResult = await pool.query(
    `SELECT id, first_name, last_name, group_label
     FROM guests WHERE wedding_id = $1
     ORDER BY first_name ASC, last_name ASC`,
    [weddingId]
  );

  return { guests: guestsResult.rows };
}

// Color palette for avatars based on name
const avatarColors = [
  { bg: '#E8C4B8', text: '#A85D3E' }, // blush
  { bg: '#C4E8D0', text: '#4A7A5C' }, // sage
  { bg: '#D4E8F0', text: '#2B5F8A' }, // sky
  { bg: '#E8D9C4', text: '#8A7050' }, // sand
  { bg: '#D4C4E8', text: '#6A5A8A' }, // lavender
  { bg: '#E8E4C4', text: '#8A8040' }, // butter
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default async function DirectoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const data = await getDirectoryData(slug);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: 'var(--text-secondary)' }}>Wedding not found</p>
      </div>
    );
  }

  const { guests } = data;

  // Group guests alphabetically
  const grouped: Record<
    string,
    { id: string; first_name: string; last_name: string; group_label: string | null }[]
  > = {};
  for (const guest of guests) {
    const letter = guest.first_name[0]?.toUpperCase() || '#';
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(guest);
  }

  const letters = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 0.5px 0 rgba(208, 197, 175, 0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/w/${slug}/home`} label="" />
        </div>
        <h1
          className="text-2xl tracking-wide"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--color-gold-dark)',
          }}
        >
          ReWed
        </h1>
        <div className="w-8" />
      </header>

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 relative">
        <section className="mb-8 text-center">
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Who&rsquo;s coming
          </h2>
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
            <p
              className="text-lg"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--color-terracotta)',
              }}
            >
              {guests.length} guests
            </p>
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          </div>
        </section>

        {/* Guest List */}
        <div className="space-y-4">
          {letters.map((letter) => (
            <div key={letter}>
              {/* Letter header */}
              <div
                id={letter}
                className="sticky top-0 z-10 py-1 px-1 text-sm font-semibold"
                style={{
                  color: 'var(--color-terracotta)',
                  background: 'var(--bg-warm-white)',
                }}
              >
                {letter}
              </div>

              <div className="space-y-1">
                {grouped[letter].map((guest) => {
                  const color = getAvatarColor(
                    `${guest.first_name}${guest.last_name}`
                  );
                  return (
                    <div
                      key={guest.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'var(--bg-pure-white)' }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                        style={{
                          background: color.bg,
                          color: color.text,
                        }}
                      >
                        {guest.first_name[0]}
                        {guest.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {guest.first_name} {guest.last_name}
                        </p>
                        {guest.group_label && (
                          <p
                            className="text-xs truncate"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {guest.group_label}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {guests.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">&#128101;</p>
            <p style={{ color: 'var(--text-secondary)' }}>
              The guest list is being finalized!
            </p>
          </div>
        )}

        {/* Alphabet sidebar */}
        {letters.length > 5 && (
          <div
            className="fixed right-1 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 z-20"
          >
            {letters.map((letter) => (
              <a
                key={letter}
                href={`#${letter}`}
                className="text-[10px] font-semibold w-4 h-4 flex items-center justify-center"
                style={{ color: 'var(--color-terracotta)' }}
              >
                {letter}
              </a>
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
