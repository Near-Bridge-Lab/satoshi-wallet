import Big from 'big.js';

Big.DP = 40;
Big.PE = 24;

export default Big;

type BigValue = Big | string | number | undefined;

export function safeBig(val: BigValue, defaultVal = '0') {
  try {
    const v = val || defaultVal;
    return new Big(v);
  } catch (error) {
    console.error('safeBig error', val, error);
    return new Big('0');
  }
}

export function safeBigMax(v1: BigValue, v2: BigValue) {
  return safeBig(v1).gt(safeBig(v2)) ? safeBig(v1).toFixed() : safeBig(v2).toFixed();
}

export function safeBigMin(v1: BigValue, v2: BigValue) {
  return safeBig(v1).lt(safeBig(v2)) ? safeBig(v1).toFixed() : safeBig(v2).toFixed();
}
