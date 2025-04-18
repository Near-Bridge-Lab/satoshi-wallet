export const isValidEthereumAddress = (address: string) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const isValidNearAddress = (address: string) => {
  return /\.(near|testnet)$/.test(address) || /^[0-9a-fA-F]{64}$/.test(address);
};
