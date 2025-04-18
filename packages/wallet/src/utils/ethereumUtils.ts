import { bytesToHex, publicToAddress, toBytes, toChecksumAddress } from '@ethereumjs/util';
import type { UserOp } from '@particle-network/aa';

export const pubKeyToEVMAddress = (pubKey: string) => {
  const address = toChecksumAddress(bytesToHex(publicToAddress(toBytes(`0x${pubKey}`), true)));
  return address;
};

export function caculateNativeFee(userOp: UserOp): bigint {
  return (
    (BigInt(userOp.callGasLimit) +
      BigInt(userOp.verificationGasLimit) +
      BigInt(userOp.preVerificationGas)) *
    BigInt(userOp.maxFeePerGas)
  );
}
