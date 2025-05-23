import { useMessageBoxContext } from '@/providers/MessageBoxProvider';
import { Tooltip as _Tooltip, type TooltipProps } from '@nextui-org/react';
import { isMobileDevice } from '@/utils/common';

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
    <_Tooltip classNames={{ base: 'max-w-[260px]' }} content={content} {...params}>
      <span className={`cursor-pointer ${className || ''}`} onClick={handleClick}>
        {children}
      </span>
    </_Tooltip>
  );
}
