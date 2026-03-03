'use client';

import { useState } from 'react';
import Link from 'next/link';

const steps = [
  { id: 'size', title: 'How big is the celebration?' },
  { id: 'portraits', title: 'Fun Portraits' },
  { id: 'deliverables', title: 'Video Memories' },
  { id: 'extras', title: 'Community & Communication' },
  { id: 'theme', title: 'Look & Feel' },
];

export default function CreateWeddingPage() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm mb-8"
        style={{ color: 'var(--text-secondary)' }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              background:
                i <= currentStep
                  ? 'var(--color-terracotta)'
                  : 'var(--border-medium)',
            }}
          />
        ))}
      </div>

      {/* Step Content */}
      <div
        className="card p-8 md:p-10"
        style={{ background: 'var(--bg-pure-white)' }}
      >
        <h2
          className="text-2xl font-medium mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          {steps[currentStep].title}
        </h2>

        {currentStep === 0 && (
          <div className="mt-6 space-y-6">
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                How many guests are you expecting?
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {['25', '50', '100', '150', '200', '300', '500', '1000+'].map(
                  (count) => (
                    <button
                      key={count}
                      className="p-4 rounded-xl text-center font-medium transition-colors"
                      style={{
                        background: 'var(--bg-soft-cream)',
                        color: 'var(--text-primary)',
                        border: '2px solid transparent',
                      }}
                    >
                      {count}
                    </button>
                  )
                )}
              </div>
              <p
                className="text-xs mt-3"
                style={{ color: 'var(--text-tertiary)' }}
              >
                More guests means more messages, more perspectives, and an even
                richer highlight reel for you.
              </p>
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                How many events?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {['1 event', '2-3 events', '4+ events'].map((opt) => (
                  <button
                    key={opt}
                    className="p-4 rounded-xl text-center font-medium transition-colors"
                    style={{
                      background: 'var(--bg-soft-cream)',
                      color: 'var(--text-primary)',
                      border: '2px solid transparent',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentStep > 0 && (
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>
            This step will be fully interactive in the next phase.
          </p>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            className="btn-ghost"
            disabled={currentStep === 0}
            style={{ opacity: currentStep === 0 ? 0.4 : 1 }}
          >
            Back
          </button>
          <button
            onClick={() =>
              setCurrentStep(Math.min(steps.length - 1, currentStep + 1))
            }
            className="btn-primary"
          >
            {currentStep === steps.length - 1 ? 'Create Wedding' : 'Continue'}
          </button>
        </div>
      </div>

      {/* Running Total */}
      <div
        className="fixed bottom-0 left-0 right-0 py-4 px-6"
        style={{
          background: 'rgba(254, 252, 249, 0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Estimated total
            </p>
            <p
              className="text-xl font-semibold"
              style={{ color: 'var(--color-terracotta)' }}
            >
              $249
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Transparent pricing. No surprises.
          </p>
        </div>
      </div>
    </div>
  );
}
