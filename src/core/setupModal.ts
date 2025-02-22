import {
  setupModal as _setupModal,
  type WalletSelectorModal as _WalletSelectorModal,
  type ModalOptions as _ModalOptions,
} from 'ref-modal-ui';
import type { WalletSelector, WalletSelectorState } from '@near-wallet-selector/core';
import { Dialog } from '../utils/Dialog';
export type WalletSelectorModalOptions = _ModalOptions;
export type WalletSelectorModal = _WalletSelectorModal;

export function setupWalletSelectorModal(
  selector: WalletSelector,
  options: WalletSelectorModalOptions,
) {
  if (!selector) throw new Error('selector is required');
  const state = selector.store.getState();
  const group = getGroup(state);

  const modal = _setupModal(selector, options);
  const originalShow = modal.show.bind(modal);

  modal.show = async () => {
    const chain = group.length > 1 ? await openChainModal() : group[0];
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
