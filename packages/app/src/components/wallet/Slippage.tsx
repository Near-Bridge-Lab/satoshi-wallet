import { Icon } from '@iconify/react/dist/iconify.js';
import {
  Button,
  Image,
  Input,
  Checkbox,
  Card,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  Tooltip,
} from '@nextui-org/react';
import { useState } from 'react';

export default function Slippage({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [isSlippageOpen, setIsSlippageOpen] = useState(false);
  const [isCustomSlippage, setIsCustomSlippage] = useState(false);

  const handleSlippageAction = (key: string) => {
    if (key === 'custom') return;
    const value = Number(key);
    if (!isNaN(value)) {
      onChange(value);
      setIsCustomSlippage(false);
    }
  };

  return (
    <Dropdown isOpen={isSlippageOpen} onOpenChange={setIsSlippageOpen}>
      <DropdownTrigger>
        <Button isIconOnly variant="flat" size="sm">
          <Tooltip content={`Slippage: ${value}%`}>
            <Icon icon="iconamoon:options-light" className="text-base" />
          </Tooltip>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Slippage options"
        className="min-w-[160px]"
        selectedKeys={isCustomSlippage ? new Set(['custom']) : new Set([value.toString()])}
        selectionMode="single"
        onAction={(key) => handleSlippageAction(key.toString())}
      >
        <DropdownSection title="Set max slippage">
          <DropdownItem key="0.1">0.1%</DropdownItem>
          <DropdownItem key="0.5">0.5%</DropdownItem>
          <DropdownItem key="1">1%</DropdownItem>
          <DropdownItem
            key="custom"
            className="data-[selected=true]:bg-primary-50"
            isReadOnly
            hideSelectedIcon
          >
            <Input
              type="number"
              size="sm"
              placeholder="Custom"
              value={value.toString()}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (!isNaN(value)) {
                  onChange(value);
                  setIsCustomSlippage(true);
                }
              }}
              className="w-full"
              endContent={<div className="text-small">%</div>}
              validationBehavior="aria"
            />
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
