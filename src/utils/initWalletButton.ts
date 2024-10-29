import type { Wallet } from '@near-wallet-selector/core';

interface OriginalWallet {
  account: string | null;
  getPublicKey: () => Promise<string>;
}

export function setupWalletButton(network: string, wallet: Wallet, originalWallet: OriginalWallet) {
  console.log('setupWalletButton');
  if (document.getElementById('satoshi-wallet-button')) {
    return;
  }

  const iframe = createIframe({
    iframeUrl:
      network === 'testnet'
        ? 'https://wallet-dev.satoshibridge.top'
        : 'https://wallet.satoshibridge.top',
    iframeStyle: { width: '400px', height: '650px' },
  });

  const button = createFloatingButtonWithIframe({
    openImageUrl: 'https://assets.deltatrade.ai/wallet-assets/wallet-btn.png',
    closeImageUrl: 'https://assets.deltatrade.ai/wallet-assets/wallet-btn-active.png',
    iframe,
  });

  setupButtonClickHandler(button, iframe, wallet, originalWallet);
}

function createFloatingButtonWithIframe({
  openImageUrl,
  closeImageUrl,
  iframe,
}: {
  openImageUrl: string;
  closeImageUrl: string;
  iframe: HTMLIFrameElement;
}): HTMLImageElement {
  const button = document.createElement('img');
  button.id = 'satoshi-wallet-button';
  button.src = openImageUrl;

  Object.assign(button.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '100000',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'transform 0.15s ease',
  });

  document.body.appendChild(button);

  const iframeVisible =
    localStorage.getItem('iframeVisible') === 'true' ||
    localStorage.getItem('iframeVisible') === null;
  button.src = iframeVisible ? closeImageUrl : openImageUrl;
  iframe.style.display = iframeVisible ? 'block' : 'none';

  button.onclick = function () {
    const isCurrentlyVisible = iframe.style.display === 'block';
    button.style.transform = 'scale(0.8)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 150);

    iframe.style.display = isCurrentlyVisible ? 'none' : 'block';
    button.src = isCurrentlyVisible ? openImageUrl : closeImageUrl;

    localStorage.setItem('iframeVisible', String(!isCurrentlyVisible));
  };

  return button;
}

function createIframe({
  iframeUrl,
  iframeStyle = {},
}: {
  iframeUrl: string;
  iframeStyle?: { [key: string]: string };
}): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = 'satoshi-wallet-iframe';
  iframe.allow = 'clipboard-read; clipboard-write';
  iframe.src = iframeUrl;

  Object.assign(iframe.style, {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    zIndex: '100000',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
    borderRadius: '10px',
    display: 'block', // 初始状态为显示
    ...iframeStyle,
  });

  document.body.appendChild(iframe);

  return iframe;
}

async function setupButtonClickHandler(
  button: HTMLImageElement,
  iframe: HTMLIFrameElement,
  wallet: Wallet,
  originalWallet: OriginalWallet,
) {
  const accountId = (await wallet?.getAccounts())?.[0].accountId;
  const originalAccountId = originalWallet.account;
  const originalPublicKey = await originalWallet.getPublicKey();
  console.log({ accountId, originalAccountId, originalPublicKey });
  const iframeSrc = new URL(iframe.src);
  iframeSrc.searchParams.set('origin', window.location.origin);
  accountId && iframeSrc.searchParams.set('accountId', accountId);
  originalAccountId && iframeSrc.searchParams.set('originalAccountId', originalAccountId);
  originalPublicKey && iframeSrc.searchParams.set('originalPublicKey', originalPublicKey);

  iframe.src = iframeSrc.toString();
  console.log('iframe src', iframe.src);

  window.addEventListener('message', async (event) => {
    if (event.origin !== iframeSrc.origin) return;
    const { action, requestId, data } = event.data;

    if (action === 'signAndSendTransaction') {
      console.log('signAndSendTransaction message', event.data);
      try {
        const result = await wallet.signAndSendTransaction(data);
        console.log('signAndSendTransaction result', result);
        event.source?.postMessage(
          {
            requestId,
            data,
            success: true,
          },
          { targetOrigin: event.origin },
        );
      } catch (error: any) {
        console.error('signAndSendTransaction error', error);
        event.source?.postMessage(
          {
            requestId,
            error: error.message,
            success: false,
          },
          { targetOrigin: event.origin },
        );
      }
    }
  });
}

export function removeWalletButton() {
  const button = document.getElementById('satoshi-wallet-button');
  button?.remove();
  const iframe = document.getElementById('satoshi-wallet-iframe');
  iframe?.remove();
}
