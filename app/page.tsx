import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ReWed — Every Guest. Every Moment. Every Message.",
  description:
    "Your guests record heartfelt video toasts, take stunning photos with artistic filters, and create fun portraits. Days later, everyone receives a personalized video reel.",
};

export default function LandingPage() {
  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--bg-warm-gradient)" }}
    >
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center max-w-4xl mx-auto">
        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-medium leading-tight mb-6"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          Every guest. Every moment.
          <br />
          Every message.
        </h1>
        <p
          className="text-lg md:text-xl max-w-2xl mb-10 leading-relaxed"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--text-secondary)",
          }}
        >
          Your guests record heartfelt video toasts, take stunning photos with
          artistic filters, and create fun portraits of themselves. Days later,
          everyone receives a personalized video reel of their memories from your
          wedding.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <button className="btn-primary text-lg px-8 py-4">
            Build Your Experience &rarr;
          </button>
          <button className="btn-ghost text-lg px-8 py-4">
            See a demo reel &#9654;
          </button>
        </div>
        <p className="mt-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
          Trusted by couples who want to remember everything
        </p>
      </section>

      {/* How It Works */}
      <section
        className="py-20 px-6"
        style={{ background: "var(--bg-pure-white)" }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-medium text-center mb-16"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-primary)",
            }}
          >
            Three steps to something unforgettable
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: "1",
                title: "Share one link",
                desc: "Text your guests a single link or print a QR code. They tap their name and they\u2019re in.",
              },
              {
                step: "2",
                title: "Guests capture the magic",
                desc: "Video toasts with prompts that pull real emotion. A photo booth with artistic filters. Fun AI-powered portraits.",
              },
              {
                step: "3",
                title: "Everyone gets a keepsake",
                desc: "3 days later, every guest receives a personalized video reel of their photos, messages, and memories. Set to your song.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-semibold mx-auto mb-5"
                  style={{
                    background: "var(--color-terracotta-gradient)",
                    color: "white",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {item.step}
                </div>
                <h3
                  className="text-xl font-medium mb-3"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--text-primary)",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  className="leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2
            className="text-3xl md:text-4xl font-medium mb-6"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-primary)",
            }}
          >
            Transparent pricing. No surprises.
          </h2>
          <p
            className="text-lg mb-12 max-w-2xl mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Most couples spend $400&ndash;$600 for the full experience.
            That&apos;s less than a photo booth rental&mdash;and infinitely more
            meaningful.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "Intimate", guests: "50 guests", price: "$249" },
              { name: "Classic", guests: "200 guests", price: "$499" },
              { name: "Grand", guests: "400 guests", price: "$799" },
            ].map((pkg) => (
              <div
                key={pkg.name}
                className="card p-8 text-center hover:shadow-md transition-shadow"
              >
                <h3
                  className="text-xl font-medium mb-2"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--text-primary)",
                  }}
                >
                  {pkg.name}
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {pkg.guests}
                </p>
                <p
                  className="text-3xl font-semibold"
                  style={{ color: "var(--color-terracotta)" }}
                >
                  {pkg.price}
                </p>
              </div>
            ))}
          </div>
          <button className="btn-primary mt-10 text-lg px-8 py-4">
            Build Your Package &rarr;
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-12 px-6 text-center"
        style={{
          background: "var(--bg-soft-cream)",
          color: "var(--text-secondary)",
        }}
      >
        <p
          className="text-2xl font-medium mb-6"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          Ready to give your guests something unforgettable?
        </p>
        <button className="btn-primary text-lg px-8 py-4 mb-8">
          Get Started
        </button>
        <div className="flex flex-wrap justify-center gap-6 text-sm mb-4">
          <span>About</span>
          <span>Pricing</span>
          <span>Demo</span>
          <span>FAQ</span>
          <span>Contact</span>
          <span>Privacy</span>
          <span>Terms</span>
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Made with love for couples who want to remember everything
        </p>
      </footer>
    </main>
  );
}
