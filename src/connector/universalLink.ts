import { isMobile } from '../utils';
import { Dialog } from '../utils/Dialog';

export interface WalletConnectHelper {
  getUniversalLink(url: string): string;
  isWalletInstalled(): boolean;
}

export class MobileWalletConnect {
  static getUniversalLink(walletId: string, url: string): string {
    switch (walletId) {
      case 'okx':
        return `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`;
      case 'bitget':
        return `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`;
      case 'xverse':
        return `xverse://browser?url=${encodeURIComponent(url)}`;
      default:
        return '';
    }
  }

  static async redirectToWallet(walletId: string) {
    if (isMobile()) {
      const currentUrl = window.location.href;
      const universalLink = this.getUniversalLink(walletId, currentUrl);
      if (!universalLink) {
        try {
          await navigator.clipboard?.writeText(currentUrl);
        } catch (error) {
          console.error(error);
        }

        await Dialog.alert({
          title: 'Open in Wallet Browser',
          message: `
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <p>Please follow these steps:</p>
              <p>1. Open ${walletId} wallet app</p>
              <p>2. Find the browser feature in the wallet</p>
              <p>3. Paste the URL (already copied to clipboard)</p>
            </div>
          `,
          dangerouslyUseHTML: true,
        });
        return false;
      }
      window.location.href = universalLink;
      return true;
    }
    return false;
  }
}
