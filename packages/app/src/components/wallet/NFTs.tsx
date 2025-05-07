import { useNFTStore } from '@/stores/token';
import { useEffect, useState } from 'react';
import { Card, CardBody, CardFooter, Image } from '@nextui-org/react';
import Empty from '../basic/Empty';
import Loading from '../basic/Loading';

export function NFTs() {
  const { nfts } = useNFTStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (nfts.length) {
      setIsLoading(false);
    }
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [nfts]);

  if (isLoading) {
    return <Loading className="flex items-center justify-center min-h-[200px]" />;
  }

  if (!nfts.length) {
    return <Empty>No NFTs found</Empty>;
  }

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
      {nfts.map((nft, index) => {
        const contractName = nft.metadata?.title;
        const displayName = contractName || nft.contract_id;

        const imageUrl = nft?.metadata?.media || '/assets/nft-placeholder.png';

        return (
          <div key={index} className="card flex flex-col gap-4">
            <div className="overflow-visible flex justify-center items-center">
              <Image alt={displayName} className="object-cover h-20" src={imageUrl} width="100%" />
            </div>
            <div className="text-xs line-clamp-2 overflow-hidden max-w-full break-words">
              {displayName}
            </div>
          </div>
        );
      })}
    </div>
  );
}
