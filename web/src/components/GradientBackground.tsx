// A subtle animated gradient — three drifting, blurred blobs in light,
// complementary neutrals. `full` (home / loading) moves and is more present;
// `ambient` (the working app) is slow and faint. Pure CSS transforms, so it's
// GPU-composited and costs ~nothing per frame; respects prefers-reduced-motion.
export function GradientBackground({ intensity = 'ambient' }: { intensity?: 'full' | 'ambient' }) {
  return (
    <div aria-hidden className={`gradient-bg gradient-bg--${intensity}`}>
      <span className="gradient-blob gradient-blob--a" />
      <span className="gradient-blob gradient-blob--b" />
      <span className="gradient-blob gradient-blob--c" />
    </div>
  );
}
