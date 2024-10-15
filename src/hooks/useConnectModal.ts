import { useConnectProvider } from '../context';

export const useConnectModal = () => {
  const { openConnectModal, disconnect, requestDirectAccount } = useConnectProvider();
  return { openConnectModal, disconnect, requestDirectAccount };
};
