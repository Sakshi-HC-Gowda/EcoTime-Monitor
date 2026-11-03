import { useState } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const workflowOutline = [
  'Monitor grid carbon intensity',
  'Forecast cleaner electricity periods',
  'Discover Green Windows',
  'Schedule an activity into a selected window',
  'Review carbon-saving results',
];

export function VisualWorkflow() {
  const [showFallback, setShowFallback] = useState(false);

  return (
    <section id="workflow" className="landing-section relative z-10 border-t border-white/[0.06] bg-slate-950/40">
      <div className="landing-container">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
          <p className="section-eyebrow text-emerald-400">Workflow</p>
          <h2 className="section-title text-balance">How EcoTime Works</h2>
          <p className="mt-4 text-base leading-8 text-slate-400 md:text-lg">
            EcoTime uses carbon-intensity data and forecasts to find lower-carbon Green Windows,
            then helps you schedule flexible work into those windows and review estimated savings.
          </p>
        </div>

        <ol className="mx-auto mb-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {workflowOutline.map((step, index) => (
            <li
              key={step}
              className="ds-card ds-card-pad-sm text-left"
            >
              <span className="label-text text-emerald-400">Step {index + 1}</span>
              <p className="mt-2 text-sm font-semibold leading-6 text-white">{step}</p>
            </li>
          ))}
        </ol>

        <div className="ds-card mx-auto max-w-5xl overflow-hidden border-white/[0.08] bg-[#0b1220]/90 shadow-lg shadow-black/30">
          <div className="relative aspect-video w-full bg-[#070c16]">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.16),transparent_42%),radial-gradient(circle_at_80%_80%,rgba(20,184,166,0.12),transparent_46%)]"
              aria-hidden="true"
            />

            {!showFallback ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <Button
                  type="button"
                  size="icon"
                  className="h-16 w-16 rounded-full shadow-lg shadow-emerald-500/20"
                  aria-label="Play EcoTime product demonstration"
                  onClick={() => setShowFallback(true)}
                >
                  <Play className="h-7 w-7 fill-white" />
                </Button>
                <p className="max-w-md text-sm text-slate-300">
                  Product walkthrough player. A recorded demo video has not been added to this project yet.
                </p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <p className="max-w-lg text-sm leading-6 text-slate-300">
                  No demo video file is available in the repository. When a local video asset is added,
                  this panel can host it with native playback controls.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowFallback(false)}
                >
                  Back to player
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-slate-400">
              Native video controls will appear here after a demo file is provided.
            </p>
            <span className="ds-badge border-white/[0.08] text-slate-400">Video pending</span>
          </div>
        </div>
      </div>
    </section>
  );
}
