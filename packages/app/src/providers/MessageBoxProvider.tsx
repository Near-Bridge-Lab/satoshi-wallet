'use client';
import { useState, createContext, useContext, useCallback, useEffect, Suspense } from 'react';
import {
  Modal,
  type ModalProps as _ModalProps,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Button,
} from '@nextui-org/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useDebouncedEffect } from '@/hooks/useHooks';
import Loading from '@/components/basic/Loading';

type ModalProps = Partial<_ModalProps> & {
  id: string | number;
  header?: React.ReactNode | ((modal: ModalProps) => React.ReactNode);
  body: React.ReactNode | ((modal: ModalProps) => React.ReactNode);
  footer?: React.ReactNode | ((modal: ModalProps) => React.ReactNode);
  resolve?: (result?: any) => void;
  reject?: (reason?: any) => void;
  close?: () => void;
};

type MessageBoxContextExposes = {
  alert: (message: React.ReactNode, title?: React.ReactNode) => Promise<any> | undefined;
  confirm: (message: any, title?: string) => Promise<any> | undefined;
  openModal: (modalContent: Omit<ModalProps, 'id'>) => Promise<any> | undefined;
};

const MessageBoxContext = createContext<MessageBoxContextExposes>({} as MessageBoxContextExposes);

export const useMessageBoxContext = () => useContext(MessageBoxContext);

export const MessageBoxProvider = ({ children }: { children: React.ReactNode }) => {
  const [modals, setModals] = useState<ModalProps[]>([]);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  useDebouncedEffect(
    () => {
      clearModals();
    },
    [pathname, searchParams],
    100,
  );

  const clearModals = useCallback(() => {
    modals.length && setModals([]);
  }, []);

  const openModal = useCallback(({ classNames, ...modalContent }: Omit<ModalProps, 'id'>) => {
    return new Promise<any>((resolve, reject) => {
      const id = Date.now().toString();
      const newModal: ModalProps = {
        id,
        shadow: 'lg',
        ...modalContent,
        resolve,
        reject,
        close: () =>
          setTimeout(
            () => setModals((prevModals) => prevModals.filter((modal) => modal.id !== id)),
            100,
          ),
        classNames: {
          ...classNames,
        },
      };
      setModals((prevModals) => [...prevModals, newModal]);
      return newModal;
    });
  }, []);

  const alert = useCallback(
    (message: ModalProps['body'], title?: ModalProps['header']) => {
      return openModal({
        header: title ?? 'Information',
        body: message,
        footer: ({ resolve, close }) => (
          <Button
            onClick={() => {
              resolve?.();
              close?.();
            }}
          >
            OK
          </Button>
        ),
      });
    },
    [openModal],
  );

  const confirm = useCallback(
    (message: ModalProps['body'], title?: ModalProps['header']) => {
      return openModal({
        header: title ?? 'Confirm',
        body: message,
        footer: ({ resolve, reject, close }) => (
          <>
            <Button
              onClick={() => {
                reject?.();
                close?.();
              }}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={() => {
                resolve?.();
                close?.();
              }}
            >
              OK
            </Button>
          </>
        ),
      });
    },
    [openModal],
  );

  const exposes = {
    alert,
    confirm,
    openModal,
  };

  return (
    <Suspense fallback={<Loading />}>
      <MessageBoxContext.Provider value={exposes}>
        {children}
        {modals.map(({ id, resolve, reject, header, body, footer, close, ...rest }) => (
          <Modal
            {...rest}
            key={id}
            defaultOpen={true}
            scrollBehavior="inside"
            onClose={() => {
              reject?.(id);
              close?.();
            }}
          >
            <ModalContent>
              {header && (
                <ModalHeader>
                  {typeof header === 'function'
                    ? header({ id, resolve, reject, close, header, body, footer, ...rest })
                    : header}
                </ModalHeader>
              )}
              <ModalBody>
                {typeof body === 'function'
                  ? body({ id, resolve, reject, header, close, body, footer, ...rest })
                  : body}
              </ModalBody>
              {footer && (
                <ModalFooter>
                  {typeof footer === 'function'
                    ? footer({ id, resolve, reject, close, header, body, footer, ...rest })
                    : footer}
                </ModalFooter>
              )}
            </ModalContent>
          </Modal>
        ))}
      </MessageBoxContext.Provider>
    </Suspense>
  );
};
