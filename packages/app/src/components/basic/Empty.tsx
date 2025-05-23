export default function Empty({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`text-center text-sm py-3 text-default-500 ${className}`}>
      {children || 'No data'}
    </div>
  );
}
