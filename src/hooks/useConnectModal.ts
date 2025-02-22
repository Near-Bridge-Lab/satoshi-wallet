import { useConnectProvider } from '../context';

export const useConnectModal = () => {
  const { openConnectModal, disconnect, requestDirectAccount, connectModalOpen } =
    useConnectProvider();
  return { openConnectModal, disconnect, requestDirectAccount, connectModalOpen };
};
