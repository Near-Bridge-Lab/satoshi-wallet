'use client';
import { Modal, ModalContent, ModalBody } from '@nextui-org/react';
import { useState, useEffect } from 'react';
import { useWalletStore } from '@/stores/wallet';
import { storageStore } from '@/utils/common';

const storage = storageStore('SATOSHI_WALLET_BUTTON');
const ONBOARDING_MODAL_STORAGE_KEY = 'onboarding-seen';
const ALLOWED_DOMAINS = ['satoshibridge.top', '*.satoshibridge.top', 'btc.rhea.finance'];

const isAllowedDomain = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return ALLOWED_DOMAINS.some((domain) => {
    if (domain.startsWith('*.')) {
      const baseDomain = domain.substring(2);
      return hostname === baseDomain || hostname.endsWith('.' + baseDomain);
    }
    return hostname === domain;
  });
};

export default function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const { accountId, originalAccountId } = useWalletStore();

  useEffect(() => {
    if (!isAllowedDomain()) {
      return;
    }
    if (accountId || originalAccountId) {
      const hasSeenOnboarding = storage?.get<boolean>(ONBOARDING_MODAL_STORAGE_KEY);
      if (!hasSeenOnboarding) {
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [accountId, originalAccountId]);

  const handleClose = () => {
    setIsOpen(false);
    storage?.set(ONBOARDING_MODAL_STORAGE_KEY, true);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isDismissable={false}
      hideCloseButton
      classNames={{
        backdrop: 'bg-black/80 backdrop-blur-sm',
        wrapper: 'backdrop-blur-sm rounded-xl border-2 border-[#444444]',
        base: 'border-none shadow-none bg-transparent',
        body: 'border-none bg-transparent',
      }}
      placement="center"
      size="sm"
    >
      <ModalContent className="bg-transparent border-none">
        <ModalBody className="px-[60px] bg-transparent">
          <div className="text-left space-y-4">
            <p className="text-[#9D9D9D] text-base leading-relaxed mb-8">
              <span className="font-semibold text-[#FF4000]">Satoshi Wallet</span> is used to
              display assets in{' '}
              <span className="font-semibold text-white">ChainSignature-mapped accounts</span>.
              These assets are actually stored on the{' '}
              <span className="font-semibold text-white">NEAR blockchain</span>, and you can use{' '}
              <span className="font-semibold text-[#FF4000]">Satoshi Wallet</span> to{' '}
              <span className="font-semibold text-white">transfer, swap, </span>and{' '}
              <span className="font-semibold text-white">bridge</span> them.
            </p>

            <button
              onClick={handleClose}
              className="flex items-center justify-center w-full bg-transparent border 
              border-white border-opacity-50 h-[46px] rounded-md text-white hover:border-white 
              hover:border-opacity-100 font-medium cursor-pointer text-base"
            >
              Got it
            </button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
