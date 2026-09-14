/**
 * The brand lockup: the picture mark beside the product name.
 *
 * The artwork carries no lettering of its own, so the wordmark is set in type
 * here rather than baked into the image. It stays crisp at any size, inherits
 * the app's font, and remains real text — selectable, translatable, and read
 * out once rather than twice, since the image itself is marked decorative.
 */

/** Intrinsic size of logo.png, reserved up front so nothing shifts on load. */
const ART = { width: 523, height: 392 };

const SIZES = {
  sm: { image: 'h-7', text: 'text-xs' },
  md: { image: 'h-8', text: 'text-sm' },
  lg: { image: 'h-12', text: 'text-base' },
} as const;

export function Logo({
  tone = 'onLight',
  size = 'md',
  className = '',
}: {
  /** `onDark` swaps in the reversed artwork; the original sinks into deep teal. */
  tone?: 'onLight' | 'onDark';
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { image, text } = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={tone === 'onDark' ? '/logo-light.png' : '/logo.png'}
        width={ART.width}
        height={ART.height}
        alt=""
        aria-hidden="true"
        className={`${image} w-auto shrink-0`}
      />
      <span
        className={`font-semibold uppercase tracking-widest ${text} ${
          tone === 'onDark' ? 'text-brand-100' : 'text-brand-800'
        }`}
      >
        Villa Saya
      </span>
    </span>
  );
}
