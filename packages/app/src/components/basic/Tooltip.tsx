import { useMessageBoxContext } from '@/providers/MessageBoxProvider';
import { Tooltip as _Tooltip, type TooltipProps } from '@nextui-org/react';
import { isMobileDevice } from '@/utils/common';
import Link from 'next/link';
import { Icon } from '@iconify/react/dist/iconify.js';

interface Props extends TooltipProps {
  disableMobile?: boolean;
}

export default function Tooltip({
  className,
  content,
  children,
  disableMobile,
  ...params
}: Props = {}) {
  const { alert } = useMessageBoxContext();

  function handleClick() {
    if (isMobileDevice() && !disableMobile) {
      alert(content);
    }
  }
  return (
    <_Tooltip
      classNames={{
        base: 'max-w-[260px]',
        content: 'border border-divider rounded-lg shadow-lg px-3 py-1.5',
      }}
      content={content}
      {...params}
    >
      <span className={`cursor-pointer ${className || ''}`} onClick={handleClick}>
        {children}
      </span>
    </_Tooltip>
  );
}

export function TooltipQuestion({
  children,
  className,
  content,
  href,
  isDisabled,
  ...params
}: TooltipProps & { iconClassName?: string; href?: string }) {
  return (
    <Tooltip
      classNames={{ base: 'max-w-[260px]' }}
      className={`cursor-pointer hover:opacity-80 ${className || ''}`}
      isDisabled={isDisabled || !content}
      content={content}
      {...params}
    >
      {href ? (
        <Link href={href} target="_blank">
          {children || <Icon icon="proicons:question-circle" />}
        </Link>
      ) : (
        children || <Icon icon="proicons:question-circle" />
      )}
    </Tooltip>
  );
}
