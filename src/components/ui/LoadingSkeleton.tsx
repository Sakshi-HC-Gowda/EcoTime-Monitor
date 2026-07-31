type SkeletonVariant = 'card' | 'row' | 'text';

interface LoadingSkeletonProps {
  count?: number;
  height?: string;
  variant?: SkeletonVariant;
}

const variantClasses: Record<SkeletonVariant, string> = {
  card: 'rounded-2xl',
  row:  'rounded-xl',
  text: 'rounded-md h-4',
};

export function LoadingSkeleton({
  count = 3,
  height = 'h-24',
  variant = 'card',
}: LoadingSkeletonProps) {
  return (
    <div className="space-y-3 w-full">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className={`
            w-full ${height}
            ${variantClasses[variant]}
            skeleton-shimmer
            border border-white/[0.04]
          `}
          style={{ animationDelay: `${i * 120}ms` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
