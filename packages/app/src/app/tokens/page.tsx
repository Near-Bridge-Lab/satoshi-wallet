'use client';
import Navbar from '@/components/basic/Navbar';
import TokenIcon from '@/components/wallet/TokenIcon';
import { ImportToken } from '@/components/wallet/Tokens';
import { useClient } from '@/hooks/useHooks';
import { useMessageBoxContext } from '@/providers/MessageBoxProvider';
import { useTokenStore } from '@/stores/token';
import { formatFileUrl, formatToken } from '@/utils/format';
import { Icon } from '@iconify/react';
import {
  Button,
  Image,
  Input,
  Listbox,
  ListboxItem,
  ListboxSection,
  Switch,
} from '@nextui-org/react';
import { useMemo, useState } from 'react';

export default function Tokens() {
  const { isClient } = useClient();

  const { hiddenTokens, setHiddenTokens, tokenMeta } = useTokenStore();

  const [search, setSearch] = useState('');

  const filteredTokenMetaList = useMemo(() => {
    return Object.entries(tokenMeta)
      .filter(([token, meta]) => {
        return (
          token.toLowerCase().includes(search.toLowerCase()) ||
          meta?.symbol.toLowerCase().includes(search.toLowerCase())
        );
      })
      .map(([address, meta]) => ({ address, ...meta }));
  }, [search, tokenMeta]);

  const { openModal } = useMessageBoxContext();
  async function handleAddToken() {
    await openModal({
      header: 'Add Custom Token',
      body: ({ close }) => <ImportToken onSuccess={close} />,
    });
  }

  return (
    <div className="s-container">
      <Navbar className="mb-5">
        <div className="text-lg font-bold text-center">Tokens</div>
      </Navbar>
      <div className="mb-5">
        <Input
          value={search}
          size="lg"
          isClearable
          placeholder="Search tokens"
          startContent={<Icon icon="eva:search-fill" className="text-default-500 text-lg" />}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />
      </div>
      <div>
        <Listbox aria-label=" " selectionMode="none" shouldFocusWrap>
          <ListboxItem
            key="addCustomToken"
            textValue=" "
            variant="light"
            className="mb-3 py-3"
            startContent={<Icon icon="fluent:add-12-filled" className="text-lg" />}
            endContent={<Icon icon="eva:chevron-right-fill" className="text-lg " />}
            onClick={handleAddToken}
          >
            <span className="text-base">Add Custom Token</span>
          </ListboxItem>
          <ListboxSection title="Added Tokens" classNames={{ heading: 'text-default-500' }}>
            {isClient &&
              (filteredTokenMetaList?.map((item) => (
                <ListboxItem
                  key={item.address}
                  textValue={item.address}
                  className="mb-3 py-2"
                  endContent={
                    <Switch
                      color="primary"
                      size="sm"
                      className="transform scale-90"
                      isSelected={!hiddenTokens?.includes(item.address)}
                      onChange={() =>
                        setHiddenTokens?.(
                          hiddenTokens?.includes(item.address)
                            ? [...hiddenTokens.filter((t) => t !== item.address)]
                            : [...(hiddenTokens || []), item.address],
                        )
                      }
                    />
                  }
                  tabIndex={-1}
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon url={item?.icon} width={30} height={30} />
                    <span className="text-base">{formatToken(item?.symbol)}</span>
                  </div>
                </ListboxItem>
              )) as any)}
          </ListboxSection>
        </Listbox>
      </div>
    </div>
  );
}
