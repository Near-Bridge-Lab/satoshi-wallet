'use client';
import { Icon } from '@iconify/react';
import { Button } from '@nextui-org/react';
import { useRouter } from 'next/navigation';

export default function Navbar({
  className,
  children,
  endContent,
}: {
  children?: React.ReactNode;
  className?: string;
  endContent?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <Button
        isIconOnly
        variant="flat"
        size="sm"
        radius="full"
        className="min-w-7 w-7 h-7 bg-default-100"
        onClick={() => router.back()}
      >
        <Icon icon="fluent:chevron-left-12-filled" className="text-lg" />
      </Button>
      <div className="flex-1">{children}</div>
      {endContent}
    </div>
  );
}
