import {
  setupModal as _setupModal,
  type WalletSelectorModal as _WalletSelectorModal,
  type ModalOptions as _ModalOptions,
} from 'ref-modal-ui';
import type { WalletSelector, WalletSelectorState } from '@near-wallet-selector/core';
import { Dialog } from '../utils/Dialog';
import { removeWalletButton, setupWalletButton } from '../utils/initWalletButton';
import { ENV } from '../config';

export interface WalletSelectorModalOptions extends _ModalOptions {
  showChainGroups?: boolean;
  showWalletUIForNearAccount?: boolean;
  walletUrl?: string;
  env?: ENV;
}
export type WalletSelectorModal = _WalletSelectorModal;

let subscription: any;

export function setupWalletSelectorModal(
  selector: WalletSelector,
  options: WalletSelectorModalOptions,
) {
  if (!selector) throw new Error('selector is required');

  const {
    showChainGroups = true,
    showWalletUIForNearAccount = true,
    env = 'mainnet',
    walletUrl,
  } = options;

  subscription?.unsubscribe();
  const state = selector.store.getState();
  const group = getGroup(state);
  subscription = selector.store.observable.subscribe((state: WalletSelectorState) => {
    const walletId = state.selectedWalletId;
    console.log('setupWalletSelectorModal walletId', walletId);
    if (!walletId) removeWalletButton();
    if (showWalletUIForNearAccount && walletId !== 'btc-wallet') {
      selector.wallet().then((wallet) => {
        setupWalletButton({ env, nearWallet: wallet, walletUrl });
      });
    }
  });

  if (group.includes('btc')) {
    document.head.appendChild(document.createElement('style')).textContent = `
      #near-wallet-selector-modal .options-list .btc-wallet {
        display: none;
      }
    `;
  }

  const modal = _setupModal(selector, options);
  const originalShow = modal.show.bind(modal);

  modal.show = async () => {
    const chain = group.length > 1 && showChainGroups ? await openChainModal() : group[0];
    if (chain === 'btc') {
      const module = state.modules.find((module) => module.id === 'btc-wallet');
      if (module) {
        const wallet = await module.wallet();
        await wallet.signIn(options as any);
      }
    } else if (chain === 'near') {
      originalShow();
    }
  };
  return modal;
}

async function openChainModal(): Promise<string> {
  const chains = ['btc', 'near'];
  const content = (resolve: (v: string) => void, close: () => void) => {
    const buttons = `
      <div class="option-list">${chains
        .map(
          (chain) => `<button class="chain-button option-item" data-chain="${chain}">
        <img src="https://assets.deltatrade.ai/assets/chain/${chain}.svg" alt="${chain}" style="width:32px; height: 32px;" />
        ${chain.toUpperCase()}
        </button>`,
        )
        .join('')}
      </div>
    `;
    const div = document.createElement('div');
    div.innerHTML = buttons;

    const buttonsEl = div.querySelectorAll('.chain-button');

    buttonsEl.forEach((button) => {
      button.addEventListener('click', () => {
        resolve((button as HTMLButtonElement).dataset.chain as string);
        close();
      });
    });

    return div;
  };
  return await Dialog.openModal({
    title: 'Choose Chain',
    titleStyle:
      'font-size: 18px; font-weight: 600; color: #fff; text-align: center;padding-bottom: 10px;',
    content,
  });
}

function getGroup(state: WalletSelectorState) {
  const hasBtcWallet = state.modules.some((module) => module.id === 'btc-wallet');
  const hasNearWallet = state.modules.some((module) => module.id !== 'btc-wallet');
  const group = [];
  if (hasBtcWallet) group.push('btc');
  if (hasNearWallet) group.push('near');
  return group;
}
