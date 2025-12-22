import {
  setupModal as _setupModal,
  type WalletSelectorModal as _WalletSelectorModal,
  type ModalOptions as _ModalOptions,
} from 'ref-modal-ui';
import type { WalletSelector, WalletSelectorState } from '@near-wallet-selector/core';
import { Dialog } from '../utils/Dialog';
import { removeWalletButton, setupWalletButton } from '../utils/initWalletButton';
import { ENV } from '../config';

export interface CustomGroup {
  id: string;
  name: string;
  description: string;
  onClick?: (group: CustomGroup) => void | Promise<void>;
}

export interface WalletSelectorModalOptions extends _ModalOptions {
  showChainGroups?: boolean;
  showWalletUIForNearAccount?: boolean;
  hideWalletUIForNearWallets?: string[];
  walletUrl?: string;
  env?: ENV;
  draggable?: boolean;
  initialPosition?: { right: string; bottom: string };
  buttonSize?: string;
  mobileButtonSize?: string;
  customGroups?: CustomGroup[];
}
export type WalletSelectorModal = _WalletSelectorModal;

declare global {
  interface Window {
    enableCustomWalletSelectorModal: boolean;
  }
}

let subscription: any;

export function setupWalletSelectorModal(
  selector: WalletSelector,
  options: WalletSelectorModalOptions,
) {
  if (!selector) throw new Error('selector is required');

  const {
    showChainGroups = true,
    showWalletUIForNearAccount = true,
    hideWalletUIForNearWallets = ['meteor-wallet-app'],
    env = 'mainnet',
    walletUrl,
    draggable = true,
    initialPosition = { right: '20px', bottom: '20px' },
    buttonSize = '60px',
    mobileButtonSize = '40px',
    customGroups = [],
  } = options;

  subscription?.unsubscribe();
  const state = selector.store.getState();
  const group = getGroup(state);
  subscription = selector.store.observable.subscribe((state: WalletSelectorState) => {
    const walletId = state.selectedWalletId;
    window.enableCustomWalletSelectorModal = true;
    console.log('setupWalletSelectorModal walletId', walletId);
    const showWalletUI =
      walletId &&
      (walletId === 'btc-wallet' ||
        (showWalletUIForNearAccount && !hideWalletUIForNearWallets.includes(walletId)));
    removeWalletButton();
    if (showWalletUI) {
      selector.wallet().then((wallet) => {
        setupWalletButton({
          env,
          nearWallet: wallet,
          btcWallet: walletId === 'btc-wallet' ? window.btcContext : undefined,
          walletUrl,
          draggable,
          initialPosition,
          buttonSize,
          mobileButtonSize,
        });
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
    const chain =
      group.length > 1 && showChainGroups ? await openChainModal(group, customGroups) : group[0];
    if (['btc', 'eth'].includes(chain)) {
      const moduleId = chain === 'btc' ? 'btc-wallet' : 'ethereum-wallets';
      const module = state.modules.find((module) => module.id === moduleId);
      if (module) {
        const wallet = await module.wallet();
        await wallet.signIn(options as any);
      }
    } else if (chain === 'near') {
      originalShow();
    } else {
      const customGroup = customGroups.find((g) => g.id === chain);
      if (customGroup?.onClick) {
        await customGroup.onClick(customGroup);
      }
    }
  };
  return modal;
}

const CHAINS = [
  { id: 'near', name: 'Near', description: 'Near Account' },
  { id: 'eth', name: 'Ethereum', description: 'EVM address as Near Account' },
  { id: 'btc', name: 'Bitcoin', description: 'MPC Mapping' },
];

async function openChainModal(group: string[], customGroups: CustomGroup[] = []): Promise<string> {
  const chains = CHAINS.filter((chain) => group.includes(chain.id));
  const allGroups = [...chains, ...customGroups];
  const content = (resolve: (v: string) => void, close: () => void) => {
    const buttons = `
      <div class="option-list">${allGroups
        .map(
          (item) => `<button class="chain-button option-item" data-chain="${item.id}">
          <img src="https://assets.deltatrade.ai/assets/chain/${item.id}.svg" alt="${item.id}" style="width:32px; height: 32px;" />
          <div style="display: flex; flex-direction: column; text-align: left;">
            <div style="font-size: 16px; font-weight: bold;">${item.name}</div>
            <div style="font-size: 12px; opacity:0.5;">${item.description}</div>
          </div>
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
