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

  if (group.includes('eth')) {
    document.head.appendChild(document.createElement('style')).textContent = `
      #near-wallet-selector-modal .options-list .ethereum-wallets {
        display: none;
      }
    `;
  }

  const modal = _setupModal(selector, options);
  const originalShow = modal.show.bind(modal);

  modal.show = async () => {
    const chain = group.length > 1 && showChainGroups ? await openChainModal(group) : group[0];
    if (['btc', 'eth'].includes(chain)) {
      const moduleId = chain === 'btc' ? 'btc-wallet' : 'ethereum-wallets';
      const module = state.modules.find((module) => module.id === moduleId);
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

const CHAINS = [
  { id: 'btc', name: 'Bitcoin' },
  { id: 'eth', name: 'Ethereum' },
  { id: 'near', name: 'Near' },
];

async function openChainModal(group: string[]): Promise<string> {
  const chains = CHAINS.filter((chain) => group.includes(chain.id));
  const content = (resolve: (v: string) => void, close: () => void) => {
    const buttons = `
      <div class="option-list">${chains
        .map(
          (chain) => `<button class="chain-button option-item" data-chain="${chain.id}">
        <img src="https://assets.deltatrade.ai/assets/chain/${chain.id}.svg" alt="${chain.id}" style="width:32px; height: 32px;" />
        ${chain.name}
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
    title: 'Choose Wallet',
    titleStyle:
      'font-size: 18px; font-weight: 600; color: #fff; text-align: center;padding-bottom: 10px;',
    content,
  });
}

function getGroup(state: WalletSelectorState) {
  const hasBtcWallet = state.modules.some((module) => module.id === 'btc-wallet');
  const hasEvmWallet = state.modules.some((module) => module.id === 'ethereum-wallets');
  const hasNearWallet = state.modules.some(
    (module) => module.id !== 'btc-wallet' && module.id !== 'ethereum-wallets',
  );
  const group = [];
  if (hasBtcWallet) group.push('btc');
  if (hasEvmWallet) group.push('eth');
  if (hasNearWallet) group.push('near');
  return group;
}
