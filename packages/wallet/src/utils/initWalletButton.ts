import type { Wallet } from '@near-wallet-selector/core';
import { walletConfig, type ENV } from '../config';
import { executeBTCDepositAndAction, getWithdrawTransaction } from '../core/btcUtils';
import { isMobile, storageStore } from '.';

interface setupWalletButtonOptions {
  env: ENV;
  nearWallet: Wallet;
  btcWallet?: OriginalWallet;
  walletUrl?: string;
  draggable?: boolean;
  initialPosition?: { right: string; bottom: string };
  buttonSize?: string;
  mobileButtonSize?: string;
}

interface OriginalWallet {
  account: string | undefined;
  getPublicKey: () => Promise<string | undefined>;
}

const storage = storageStore('SATOSHI_WALLET_BUTTON');

const minimumMargin = 10;

export function setupWalletButton({
  env,
  nearWallet,
  btcWallet,
  walletUrl,
  draggable = true,
  initialPosition,
  buttonSize,
  mobileButtonSize,
}: setupWalletButtonOptions) {
  if (document.getElementById('satoshi-wallet-button')) {
    return;
  }

  const iframe = createIframe({
    iframeUrl: walletUrl || walletConfig[env].walletUrl,
    iframeStyle: isMobile()
      ? { width: 'calc(100% - 40px)', height: '80%' }
      : { width: '400px', height: '650px' },
  });

  iframe.addEventListener('mouseenter', () => {
    if (document.activeElement !== iframe) {
      document.activeElement?.setAttribute('tabindex', 'null');
      setTimeout(() => {
        iframe.focus();
      }, 0);
    }
  });

  const isNearWallet = !btcWallet;
  const openImageUrl = `https://assets.deltatrade.ai/wallet-assets/wallet${
    isNearWallet ? '-near' : ''
  }-btn.png`;
  const closeImageUrl = `https://assets.deltatrade.ai/wallet-assets/wallet${
    isNearWallet ? '-near' : ''
  }-btn-active.png`;

  const button = createFloatingButtonWithIframe({
    openImageUrl,
    closeImageUrl,
    iframe,
    draggable,
    initialPosition,
    buttonSize,
    mobileButtonSize,
  });

  setupButtonClickHandler(button, iframe, nearWallet, btcWallet);
}

function createFloatingButtonWithIframe({
  openImageUrl,
  closeImageUrl,
  iframe,
  draggable,
  initialPosition,
  buttonSize,
  mobileButtonSize,
}: {
  openImageUrl: string;
  closeImageUrl: string;
  iframe: HTMLIFrameElement;
  draggable: boolean;
  initialPosition?: { right: string; bottom: string };
  buttonSize?: string;
  mobileButtonSize?: string;
}): HTMLImageElement {
  const button = document.createElement('img');
  button.id = 'satoshi-wallet-button';

  const isIframeVisible = storage?.get<boolean>('visible') ?? true;

  button.src = isIframeVisible ? closeImageUrl : openImageUrl;
  iframe.style.display = isIframeVisible ? 'block' : 'none';

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  const savedPosition = storage?.get<{ right: string; bottom: string }>('position');
  const currentInitialPosition = initialPosition ||
    savedPosition || {
      right: '20px',
      bottom: '20px',
    };

  const tempButtonSize = buttonSize || '60px';
  const tempMobileButtonSize = mobileButtonSize || buttonSize || '40px';
  const actualButtonSize = isMobile() ? parseInt(tempMobileButtonSize) : parseInt(tempButtonSize);

  const right = Math.min(
    Math.max(minimumMargin, parseInt(currentInitialPosition.right)),
    windowWidth - actualButtonSize - minimumMargin,
  );
  const bottom = Math.min(
    Math.max(minimumMargin, parseInt(currentInitialPosition.bottom)),
    windowHeight - actualButtonSize - minimumMargin,
  );

  Object.assign(button.style, {
    position: 'fixed',
    bottom: `${bottom}px`,
    right: `${right}px`,
    zIndex: '100000',
    width: buttonSize || '60px',
    height: buttonSize || '60px',
    cursor: draggable ? 'grab' : 'pointer',
    transition: 'transform 0.15s ease',
    userSelect: 'none',
    touchAction: 'none',
  });

  if (isMobile()) {
    Object.assign(button.style, {
      width: mobileButtonSize || buttonSize || '40px',
      height: mobileButtonSize || buttonSize || '40px',
    });
  }

  document.body.appendChild(button);

  updateIframePosition(
    iframe,
    right,
    bottom,
    windowWidth,
    windowHeight,
    parseInt(button.style.width),
  );

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialRight = 0;
  let initialBottom = 0;
  let dragStartTime = 0;

  function startDrag(clientX: number, clientY: number) {
    if (!draggable) return;
    isDragging = true;
    startX = clientX;
    startY = clientY;
    initialRight = parseInt(button.style.right);
    initialBottom = parseInt(button.style.bottom);
    dragStartTime = Date.now();

    button.style.cursor = 'grabbing';
    button.style.transition = 'none';
  }

  function toggleWallet() {
    const isCurrentlyVisible = iframe.style.display === 'block';
    button.style.transform = 'scale(0.8)';
    setTimeout(() => {
      button.style.transform = 'scale(1)';
    }, 150);

    const newVisibleState = !isCurrentlyVisible;
    iframe.style.display = newVisibleState ? 'block' : 'none';
    button.src = newVisibleState ? closeImageUrl : openImageUrl;

    storage?.set('visible', newVisibleState);

    setTimeout(() => {
      if (newVisibleState) {
        iframe.focus();
      }
    }, 0);
  }

  button.addEventListener(
    'click',
    (e) => {
      if (!isDragging || !draggable) {
        toggleWallet();
      }
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );

  if (draggable) {
    button.addEventListener(
      'mousedown',
      (e) => {
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true },
    );

    button.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          startDrag(touch.clientX, touch.clientY);
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { capture: true },
    );

    document.addEventListener(
      'mousemove',
      (e) => {
        if (!isDragging) return;
        moveButton(e.clientX, e.clientY);
        e.preventDefault();
      },
      { capture: true },
    );

    document.addEventListener(
      'touchmove',
      (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        const touch = e.touches[0];
        moveButton(touch.clientX, touch.clientY);
        e.preventDefault();
      },
      { capture: true },
    );

    document.addEventListener(
      'mouseup',
      (e) => {
        if (isDragging) {
          e.preventDefault();
          e.stopPropagation();
        }
        endDrag();
      },
      { capture: true },
    );

    document.addEventListener(
      'touchend',
      (e) => {
        if (isDragging) {
          e.preventDefault();
          e.stopPropagation();
        }
        endDrag();

        const dragEndTime = Date.now();
        const dragDuration = dragEndTime - dragStartTime;

        if (
          dragDuration < 200 &&
          Math.abs(parseInt(button.style.right) - initialRight) < 5 &&
          Math.abs(parseInt(button.style.bottom) - initialBottom) < 5
        ) {
          toggleWallet();
        }
      },
      { capture: true },
    );

    document.addEventListener(
      'touchcancel',
      () => {
        endDrag();
      },
      { capture: true },
    );
  }

  function moveButton(clientX: number, clientY: number) {
    const deltaX = startX - clientX;
    const deltaY = startY - clientY;

    let newRight = initialRight + deltaX;
    let newBottom = initialBottom + deltaY;

    const currentButtonSize = parseInt(button.style.width);

    newRight = Math.min(
      Math.max(minimumMargin, newRight),
      windowWidth - currentButtonSize - minimumMargin,
    );
    newBottom = Math.min(
      Math.max(minimumMargin, newBottom),
      windowHeight - currentButtonSize - minimumMargin,
    );

    const snapThreshold = minimumMargin;
    const buttonLeft = windowWidth - newRight - currentButtonSize;
    if (buttonLeft < snapThreshold) {
      newRight = windowWidth - currentButtonSize - minimumMargin;
    } else if (newRight < snapThreshold) {
      newRight = minimumMargin;
    }

    const buttonTop = windowHeight - newBottom - currentButtonSize;
    if (buttonTop < snapThreshold) {
      newBottom = windowHeight - currentButtonSize - minimumMargin;
    } else if (newBottom < snapThreshold) {
      newBottom = minimumMargin;
    }

    button.style.right = `${newRight}px`;
    button.style.bottom = `${newBottom}px`;

    updateIframePosition(iframe, newRight, newBottom, windowWidth, windowHeight, currentButtonSize);
  }

  function endDrag() {
    if (!isDragging || !draggable) return;

    isDragging = false;
    button.style.cursor = 'grab';
    button.style.transition = 'transform 0.15s ease';

    storage?.set('position', {
      right: button.style.right,
      bottom: button.style.bottom,
    });
  }

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

  const isVisible = storage?.get<boolean>('visible') ?? true;

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
  buttonSize: number,
) {
  const iframeWidth = parseInt(iframe.style.width);
  const iframeHeight = parseInt(iframe.style.height);

  let iframeRight = buttonRight;
  let iframeBottom = buttonBottom + buttonSize + 10;

  if (iframeRight + iframeWidth > windowWidth - minimumMargin) {
    iframeRight = Math.max(minimumMargin, windowWidth - iframeWidth - minimumMargin);
  }

  if (iframeBottom + iframeHeight > windowHeight - minimumMargin) {
    iframeBottom = Math.max(minimumMargin, buttonBottom - iframeHeight - 10);
  }

  iframe.style.right = `${iframeRight}px`;
  iframe.style.bottom = `${iframeBottom}px`;
}
