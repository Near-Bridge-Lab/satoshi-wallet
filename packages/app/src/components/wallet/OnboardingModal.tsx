'use client';
import { Modal, ModalContent, ModalBody, Button } from '@nextui-org/react';
import { useState, useEffect } from 'react';
import { useWalletStore } from '@/stores/wallet';
import { useStorageState } from '@/hooks/useHooks';

const ONBOARDING_MODAL_STORAGE_KEY = 'onboarding-seen';

export default function OnboardingModal() {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useStorageState(
    ONBOARDING_MODAL_STORAGE_KEY,
    false,
  );
  const [isOpen, setIsOpen] = useState(false);
  const { accountId, originalAccountId, isNearWallet } = useWalletStore();

  useEffect(() => {
    const shouldShowOnboarding = (accountId || originalAccountId) && !isNearWallet;

    if (shouldShowOnboarding) {
      if (!hasSeenOnboarding) {
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [accountId, originalAccountId, isNearWallet]);

  const handleClose = () => {
    setIsOpen(false);
    setHasSeenOnboarding(true);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isDismissable={false}
      hideCloseButton
      classNames={{
        backdrop: 'bg-black/80 backdrop-blur-sm',
        wrapper: 'backdrop-blur-sm rounded-xl border-2 border-divider',
        base: 'border-none shadow-none bg-transparent',
        body: 'border-none bg-transparent',
      }}
      placement="center"
      size="sm"
    >
      <ModalContent className="bg-transparent border-none">
        <ModalBody className="px-[60px] bg-transparent">
          <div className="text-left space-y-4">
            <p className="text-default-500 text-base leading-relaxed mb-8">
              <span className="font-semibold text-[#FF4000]">Satoshi Wallet</span> is used to
              display assets in{' '}
              <span className="font-semibold text-foreground">ChainSignature-mapped accounts</span>.
              These assets are actually stored on the{' '}
              <span className="font-semibold text-foreground">NEAR blockchain</span>, and you can
              use <span className="font-semibold text-[#FF4000]">Satoshi Wallet</span> to{' '}
              <span className="font-semibold text-foreground">transfer, swap, </span>and{' '}
              <span className="font-semibold text-foreground">bridge</span> them.
            </p>

            <Button
              onPress={handleClose}
              variant="bordered"
              size="lg"
              radius="sm"
              className="border-1 border-foreground/50 hover:border-foreground w-full"
            >
              Got it
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
