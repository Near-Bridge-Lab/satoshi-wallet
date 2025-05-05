import type { Wallet } from '@near-wallet-selector/core';
import { walletConfig, type ENV } from '../config';
import { executeBTCDepositAndAction, getWithdrawTransaction } from '../core/btcUtils';

interface setupWalletButtonOptions {
  env: ENV;
  nearWallet: Wallet;
  btcWallet?: OriginalWallet;
  walletUrl?: string;
}

interface OriginalWallet {
  account: string | undefined;
  getPublicKey: () => Promise<string | undefined>;
}

export function setupWalletButton({
  env,
  nearWallet,
  btcWallet,
  walletUrl,
}: setupWalletButtonOptions) {
  console.log(`setupWalletButton ${walletUrl || ''}`);
  if (document.getElementById('satoshi-wallet-button')) {
    return;
  }

  const iframe = createIframe({
    iframeUrl: walletUrl || walletConfig[env].walletUrl,
    iframeStyle: { width: '400px', height: '650px' },
  });

  iframe.addEventListener('mouseenter', () => {
    if (document.activeElement !== iframe) {
      document.activeElement?.setAttribute('tabindex', 'null');
      setTimeout(() => {
        iframe.focus();
      }, 0);
    }
  });

  const button = createFloatingButtonWithIframe({
    openImageUrl: 'https://assets.deltatrade.ai/wallet-assets/wallet-btn.png',
    closeImageUrl: 'https://assets.deltatrade.ai/wallet-assets/wallet-btn-active.png',
    iframe,
  });

  setupButtonClickHandler(button, iframe, nearWallet, btcWallet);
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

  const isIframeVisible = localStorage.getItem('satoshi-wallet-iframe-visible') === 'true';

  button.src = isIframeVisible ? closeImageUrl : openImageUrl;
  iframe.style.display = isIframeVisible ? 'block' : 'none';

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  const savedPosition = JSON.parse(
    localStorage.getItem('satoshi-wallet-button-position') || '{"right": "20px", "bottom": "20px"}',
  );

  const right = Math.min(Math.max(20, parseInt(savedPosition.right)), windowWidth - 80);
  const bottom = Math.min(Math.max(20, parseInt(savedPosition.bottom)), windowHeight - 80);

  Object.assign(button.style, {
    position: 'fixed',
    bottom: `${bottom}px`,
    right: `${right}px`,
    zIndex: '100000',
    width: '60px',
    height: '60px',
    cursor: 'grab',
    transition: 'transform 0.15s ease',
    userSelect: 'none',
    touchAction: 'none',
  });

  document.body.appendChild(button);

  updateIframePosition(iframe, right, bottom, windowWidth, windowHeight);

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialRight = 0;
  let initialBottom = 0;
  let dragStartTime = 0;

  button.addEventListener('mousedown', (e) => {
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  });

  button.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
      e.preventDefault();
    }
  });

  function startDrag(clientX: number, clientY: number) {
    isDragging = true;
    startX = clientX;
    startY = clientY;
    initialRight = parseInt(button.style.right);
    initialBottom = parseInt(button.style.bottom);
    dragStartTime = Date.now();

    button.style.cursor = 'grabbing';
    button.style.transition = 'none';
  }

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    moveButton(e.clientX, e.clientY);
  });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    moveButton(touch.clientX, touch.clientY);
    e.preventDefault();
  });

  function moveButton(clientX: number, clientY: number) {
    const deltaX = startX - clientX;
    const deltaY = startY - clientY;

    let newRight = initialRight + deltaX;
    let newBottom = initialBottom + deltaY;

    newRight = Math.min(Math.max(20, newRight), windowWidth - 80);
    newBottom = Math.min(Math.max(20, newBottom), windowHeight - 80);

    const snapThreshold = 20;
    const buttonLeft = windowWidth - newRight - 60;

    if (buttonLeft < snapThreshold) {
      newRight = windowWidth - 80;
    } else if (buttonLeft > windowWidth - snapThreshold - 60) {
      newRight = 20;
    }

    if (newBottom < snapThreshold) {
      newBottom = 20;
    } else if (newBottom > windowHeight - snapThreshold - 60) {
      newBottom = windowHeight - 80;
    }

    button.style.right = `${newRight}px`;
    button.style.bottom = `${newBottom}px`;

    updateIframePosition(iframe, newRight, newBottom, windowWidth, windowHeight);
  }

  document.addEventListener('mouseup', () => {
    endDrag();
  });

  document.addEventListener('touchend', () => {
    endDrag();
  });

  document.addEventListener('touchcancel', () => {
    endDrag();
  });

  function endDrag() {
    if (!isDragging) return;

    const dragEndTime = Date.now();
    const isDragEvent = dragEndTime - dragStartTime > 200;

    isDragging = false;
    button.style.cursor = 'grab';
    button.style.transition = 'transform 0.15s ease';

    localStorage.setItem(
      'satoshi-wallet-button-position',
      JSON.stringify({
        right: button.style.right,
        bottom: button.style.bottom,
      }),
    );

    if (!isDragEvent) {
      handleButtonClick();
    }
  }

  const handleButtonClick = () => {
    const isCurrentlyVisible = iframe.style.display === 'block';
    button.style.transform = 'scale(0.8)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 150);

    const newVisibleState = !isCurrentlyVisible;
    iframe.style.display = newVisibleState ? 'block' : 'none';
    button.src = newVisibleState ? closeImageUrl : openImageUrl;

    localStorage.setItem('satoshi-wallet-iframe-visible', String(newVisibleState));

    setTimeout(() => {
      if (newVisibleState) {
        iframe.focus();
      }
    }, 0);
  };

  button.onclick = null;

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

  const isVisible = localStorage.getItem('satoshi-wallet-iframe-visible') === 'true';

  Object.assign(iframe.style, {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    zIndex: '100000',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
    borderRadius: '10px',
    display: isVisible ? 'block' : 'none',
    border: 'none',
    ...iframeStyle,
  });

  document.body.appendChild(iframe);

  return iframe;
}

let currentMessageHandler: ((event: MessageEvent) => void) | null = null;

async function setupButtonClickHandler(
  button: HTMLImageElement,
  iframe: HTMLIFrameElement,
  nearWallet: Wallet,
  btcWallet?: OriginalWallet,
) {
  const accountId = (await nearWallet?.getAccounts())?.[0].accountId;
  const originalAccountId = btcWallet?.account;
  const originalPublicKey = await btcWallet?.getPublicKey();
  console.log({ accountId, originalAccountId, originalPublicKey });
  const iframeSrc = new URL(iframe.src);
  iframeSrc.searchParams.set('origin', window.location.origin);
  accountId && iframeSrc.searchParams.set('accountId', accountId);
  originalAccountId && iframeSrc.searchParams.set('originalAccountId', originalAccountId);
  originalPublicKey && iframeSrc.searchParams.set('originalPublicKey', originalPublicKey);

  iframe.src = iframeSrc.toString();

  const actions = {
    signAndSendTransaction: nearWallet.signAndSendTransaction,
    signAndSendTransactions: nearWallet.signAndSendTransactions,
    executeBTCDepositAndAction,
    getWithdrawTransaction,
  };

  if (currentMessageHandler) {
    window.removeEventListener('message', currentMessageHandler);
    currentMessageHandler = null;
  }

  const handleWalletMessage = async (event: MessageEvent) => {
    if (event.origin !== iframeSrc.origin) return;
    const { action, requestId, data } = event.data;

    try {
      const actionFn = actions[action as keyof typeof actions];
      if (!actionFn) return;
      console.log('handleWalletAction', action, event.data);
      const result = await actionFn(data);
      console.log('handleWalletAction result', action, result);
      event.source?.postMessage(
        {
          requestId,
          data,
          success: true,
        },
        { targetOrigin: event.origin },
      );
    } catch (error: any) {
      console.error('handleWalletAction error', action, error);
      event.source?.postMessage(
        {
          requestId,
          error: error.message,
          success: false,
        },
        { targetOrigin: event.origin },
      );
    }
  };

  currentMessageHandler = handleWalletMessage;
  window.addEventListener('message', handleWalletMessage);
}

export function removeWalletButton() {
  console.log('removeWalletButton');
  const button = document.getElementById('satoshi-wallet-button');
  button?.remove();
  const iframe = document.getElementById('satoshi-wallet-iframe');
  iframe?.remove();
}

function updateIframePosition(
  iframe: HTMLIFrameElement,
  buttonRight: number,
  buttonBottom: number,
  windowWidth: number,
  windowHeight: number,
) {
  const iframeWidth = parseInt(iframe.style.width);
  const iframeHeight = parseInt(iframe.style.height);

  let iframeRight = buttonRight;
  let iframeBottom = buttonBottom + 70;

  if (iframeRight + iframeWidth > windowWidth - 20) {
    iframeRight = Math.max(20, windowWidth - iframeWidth - 20);
  }

  if (iframeBottom + iframeHeight > windowHeight - 20) {
    iframeBottom = Math.max(20, buttonBottom - iframeHeight - 10);
  }

  iframe.style.right = `${iframeRight}px`;
  iframe.style.bottom = `${iframeBottom}px`;
}
