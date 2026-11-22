
const workflowOutline = [
  'Monitor grid carbon intensity',
  'Forecast cleaner electricity periods',
  'Discover Green Windows',
  'Schedule an activity into a selected window',
  'Review carbon-saving results',
];

export function VisualWorkflow() {
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

        {/* Product Demo Video */}
        <div className="ds-card mx-auto max-w-5xl overflow-hidden border-white/[0.08] bg-[#0b1220]/90 shadow-lg shadow-black/30">

          <div className="relative aspect-video w-full bg-[#070c16]">

            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.16),transparent_42%),radial-gradient(circle_at_80%_80%,rgba(20,184,166,0.12),transparent_46%)]"
              aria-hidden="true"
            />

            <video
              src="/demo.mp4"
              controls
              playsInline
              preload="metadata"
              className="relative z-10 h-full w-full object-contain"
            >
              Your browser does not support video playback.
            </video>

          </div>

          <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

            <p className="text-xs font-medium text-slate-400">
              Watch the EcoTime product walkthrough and explore its features.
            </p>

            <span className="ds-badge border-white/[0.08] text-emerald-400">
              Demo Video
            </span>

          </div>
        </div>
      </div>
    </section>
  );
}
