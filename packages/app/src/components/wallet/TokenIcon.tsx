'use client';
import { useMemo } from 'react';
import { cn, ImageProps, Image } from '@nextui-org/react';
import { useTokenStore } from '@/stores/token';
import { NEAR_TOKEN_CONTRACT } from '@/config';
import { formatFileUrl } from '@/utils/format';

interface TokenIconProps extends ImageProps {
  url?: string;
  address?: string;
  symbol?: string;
  render?: (token?: TokenMetadata) => React.ReactNode;
}

export default function TokenIcon({
  url,
  address,
  render,
  className,
  classNames,
  width = 24,
  height = 24,
  style,
  ...props
}: TokenIconProps) {
  const { tokenMeta: tokenMetaList } = useTokenStore();
  const tokenMeta = useMemo(() => {
    if (address === NEAR_TOKEN_CONTRACT && tokenMetaList[address]?.icon)
      tokenMetaList[address].icon = formatFileUrl('/assets/crypto/wnear.png');
    return address ? tokenMetaList[address] : undefined;
  }, [address, tokenMetaList]);

  const icon = useMemo(() => url || tokenMeta?.icon, [url, tokenMeta]);

  return (
    <div className={cn('flex items-center', className)}>
      {icon ? (
        <Image
          src={icon}
          width={width}
          height={height}
          alt={tokenMeta?.symbol}
          classNames={{
            ...classNames,
            wrapper: cn('bg-default-500/10 rounded-full flex-shrink-0', classNames?.wrapper || ''),
            img: cn('!h-inherit', classNames?.img),
          }}
          radius="full"
          style={{
            width: width + 'px',
            height: height + 'px',
            maxWidth: width + 'px',
            maxHeight: height + 'px',
            contain: 'size',
            ...style,
          }}
          {...props}
        />
      ) : (
        <div
          className="w-6 h-6 rounded-full bg-default-500/10 flex items-center justify-center"
          style={{
            width: width + 'px',
            height: height + 'px',
          }}
        ></div>
      )}
      {tokenMeta && render?.(tokenMeta)}
    </div>
  );
}
