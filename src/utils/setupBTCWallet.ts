import type {
    Action,
    Optional,
    Transaction,
    InjectedWallet,
    FunctionCallAction,
    WalletModuleFactory,
    WalletBehaviourFactory,
} from "@near-wallet-selector/core";
import { providers, transactions } from "near-api-js";
import { AccessKeyViewRaw, AccountView } from "near-api-js/lib/providers/provider";
import { SignedDelegate, SignedTransaction, buildDelegateAction, actionCreators, decodeTransaction } from '@near-js/transactions';

import { KeyType, PublicKey } from "near-api-js/lib/utils/key_pair";
import { createTransaction, encodeDelegateAction, encodeTransaction, Signature } from "near-api-js/lib/transaction";
import { baseDecode, baseEncode } from '@near-js/utils';
import bs58 from 'bs58'
import { sha256 } from 'js-sha256'
import { setupWalletButton, removeWalletButton } from "./initWalletButton";

// export * from './btcWalletSelectorContext'
// import { useBtcWalletSelector, BtcWalletSelectorContextProvider } from './btcWalletSelectorContext'

const { signedDelegate, transfer, functionCall } = actionCreators;


interface BTCWalletParams {
    iconUrl?: string;
    deprecated?: boolean;
    btcContext?: any;
    autoConnect?: boolean;
}

const base_url = 'https://api.dev.satoshibridge.top/v1'
const token = 'nbtc1-nsp.testnet'
const contractId = 'dev1-nsp.testnet'


const state: any = {
    saveAccount(account: string) {
        window.localStorage.setItem('btc-wallet-account', account)
    },
    removeAccount() {
        window.localStorage.removeItem('btc-wallet-account')
    },
    savePublicKey(publicKey: string) {
        window.localStorage.setItem('btc-wallet-publickey', publicKey)
    },
    removePublicKey() {
        window.localStorage.removeItem('btc-wallet-publickey')
    },
    saveBtcPublicKey(publicKey: string) {
        window.localStorage.setItem('btc-wallet-btc-publickey', publicKey)
    },
    removeBtcPublicKey() {
        window.localStorage.removeItem('btc-wallet-btc-publickey')
    },
    clear() {
        this.removeAccount()
        this.removePublicKey()
        this.removeBtcPublicKey()
    },
    save(account: string, publicKey: string) {
        this.saveAccount(account)
        this.savePublicKey(publicKey)
    },
    getAccount() {
        return window.localStorage.getItem('btc-wallet-account')
    },
    getPublicKey() {
        return window.localStorage.getItem('btc-wallet-publickey')
    },
    getBtcPublicKey() {
        return window.localStorage.getItem('btc-wallet-btc-publickey')
    }
}

let inter: any = null

const BTCWallet: WalletBehaviourFactory<InjectedWallet> = async ({
    metadata,
    options,
    store,
    emitter,
    logger,
    id,
    provider,
}) => {

    const wallet = {
        signIn,
        signOut,
        getAccounts,
        verifyOwner,
        signMessage,
        signAndSendTransaction,
        signAndSendTransactions
    }
    if (!inter) {
        inter = setInterval(async () => {
            // @ts-ignore
            const btcContext = window.btcContext
    
            // return
            if (btcContext) {
                clearInterval(inter)
                const context = btcContext.getContext()
    
                context.on('updatePublicKey', async (btcPublicKey: string) => {
                    const { nearTempAddress, nearTempPublicKey } = await getNearAccountByBtcPublicKey(btcPublicKey)
                    emitter.emit('accountsChanged', {
                        accounts: [{
                            accountId: nearTempAddress,
                            // active: true
                        }]
                    })
                })
    
                console.log('metadata.autoConnect:', metadata)

                // @ts-ignore
                if (metadata.autoConnect && localStorage.getItem('near-wallet-selector:selectedWalletId') === '"btc-wallet"') {
                    // btcContext.autoConnect()
                }
    
                clearInterval(inter)
            }
        }, 500)
    }
    

    async function viewMethod({ method, args = {} }: {
        method: string,
        args: any
    }) {
        const res: any = await provider.query({
            request_type: "call_function",
            account_id: contractId,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
            finality: "optimistic",
        });

        return JSON.parse(Buffer.from(res.result).toString());
    };


    async function getNearAccountByBtcPublicKey(btcPublicKey: string) {
        const nearTempAddress = await viewMethod({
            method: 'get_chain_signature_near_account',
            args: { 'btc_public_key': btcPublicKey }
        })

        const nearTempPublicKey = await viewMethod({
            method: 'get_chain_signature_near_account_public_key',
            args: { 'btc_public_key': btcPublicKey }
        })

        state.saveAccount(nearTempAddress)
        state.savePublicKey(nearTempPublicKey)
        state.saveBtcPublicKey(btcPublicKey)

        return {
            nearTempAddress,
            nearTempPublicKey
        }
    }

    async function signIn({ contractId, methodNames }: any) {
        console.log(provider)
        const accountId = state.getAccount()
        const publicKey = state.getPublicKey()
        // @ts-ignore
        const btcContext = window.btcContext

        if (accountId && publicKey) {
            return [{
                accountId,
                publicKey,
            }]
        }

        const btcAccount = await btcContext.login()
        const btcPublicKey = await btcContext.getPublicKey()

        const { nearTempAddress, nearTempPublicKey } = await getNearAccountByBtcPublicKey(btcPublicKey)

        return [
            {
                accountId: nearTempAddress,
                publicKey: nearTempPublicKey,
            },
        ];
    }

    async function signOut() {
        // @ts-ignore
        const btcContext = window.btcContext
        btcContext.logout()
        state.clear()
        window.localStorage.removeItem('near-wallet-selector:selectedWalletId')
        removeWalletButton()
        // clearInterval(inter)
    }

    async function getAccounts() {
        const accountId = state.getAccount()
        initWalletButton(options.network.networkId, accountId, wallet);
        return [{ accountId: state.getAccount() }];
    }

    async function verifyOwner() {
        throw new Error(`Method not supported by ${metadata.name}`);
    }

    async function signMessage() {
        throw new Error(`Method not supported by ${metadata.name}`);
    }

    async function signAndSendTransaction({ signerId, receiverId, actions }: any) {
        // @ts-ignore
        const btcContext = window.btcContext
        const accountId = state.getAccount()
        const publicKey = state.getPublicKey()
        const newActions = actions.map((action: any) => {
            switch (action.type) {
                case 'FunctionCall':
                    return functionCall(action.params.methodName, action.params.args, action.params.gas, action.params.deposit)
                case 'Transfer':
                    return transfer(action.params.deposit)
            }
        })

        const { header } = await provider.block({ finality: 'final' });

        const rawAccessKey = await provider.query<AccessKeyViewRaw>({
            request_type: 'view_access_key',
            account_id: accountId,
            public_key: publicKey,
            finality: 'final'
        });

        const accessKey = {
            ...rawAccessKey,
            nonce: BigInt(rawAccessKey.nonce || 0)
        };

        const publicKeyFromat = PublicKey.from(publicKey)

        let nearNonceNumber = accessKey.nonce + BigInt(1)
        const nearNonceApi = await getNearNonceFromApi(accountId)

        if (nearNonceApi) {
            nearNonceNumber = nearNonceApi.result_data && Number(nearNonceApi.result_data) > 0
                ? BigInt(Number(nearNonceApi.result_data))
                : accessKey.nonce + BigInt(1)
        }

        const _transiton: any = await transactions.createTransaction(
            accountId as string,
            publicKeyFromat,
            receiverId as string,
            nearNonceNumber,
            newActions,
            baseDecode(header.hash)
        )

        const tx_bytes = encodeTransaction(_transiton);

        // const txHash = new Uint8Array(sha256(Buffer.from(tx_bytes)));
        // const hash = bs58.encode(tx_bytes)
        const hash = bs58.encode(new Uint8Array(sha256.array(tx_bytes)));

        const accountInfo = await viewMethod({
            method: 'get_account',
            args: { 'account_id': accountId }
        })

        const nonceApi = await getNonceFromApi(accountId as string)

        const nonce = nonceApi?.result_data ? Number(nonceApi?.result_data) : accountInfo.nonce

        const outcome = {
            near_transactions: Array.from(tx_bytes),
            nonce: Number(nonce),
            // nonce:0,
            chain_id: 397,
            csna: accountId,
            btcPublicKey: state.getBtcPublicKey(),
            nearPublicKey: publicKey,
        } as any;

        const intention = {
            chain_id: outcome.chain_id.toString(),
            csna: outcome.csna,
            near_transactions: [outcome.near_transactions],
            "gas_token": token,
            "gas_limit": '3000',
            nonce: (Number(outcome.nonce)).toString(),
        }

        const strIntention = JSON.stringify(intention)


        const signature = await btcContext.signMessage(strIntention)

        const result = await uploadCAWithdraw({
            sig: signature,
            btcPubKey: outcome.btcPublicKey,
            data: toHex(strIntention),
            near_nonce: [Number(nearNonceNumber)]
            // pubKey: outcome.nearPublicKey,
        })

        console.log('result:', result)

        if (result.result_code === 0) {
            console.log('txHash:', hash)
            const result = await pollTransactionStatus(options.network.networkId, hash)
            return result;
        } else {
            return null
        }

    }

    async function signAndSendTransactions({ transactions }: any) {
        const result = await Promise.all(transactions.map(async (transaction: any) => {
            return await signAndSendTransaction(transaction)
        }
        ))
        return result;
    }

    return wallet as any;
}

function getNonceFromApi(accountId: string) {
    return fetch(`${base_url}/nonce?csna=${accountId}`, {
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
        },
    }).then(res => res.json())
}

function getNearNonceFromApi(accountId: string) {
    return fetch(`${base_url}/nonceNear?csna=${accountId}`, {
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
        },
    }).then(res => res.json())
}

function uploadCAWithdraw(data: any) {
    return fetch(`${base_url}/receiveTransaction`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data)
    }).then(res => res.json())
}

export function setupBTCWallet({
    iconUrl = 'https://assets.deltatrade.ai/assets/chain/btc.svg',
    deprecated = false,
    autoConnect = true,
    btcContext
}: BTCWalletParams): WalletModuleFactory<InjectedWallet> {
    const btcWallet: any = async () => {
        return {
            id: 'btc-wallet',
            type: 'injected',
            metadata: {
                name: 'BTC Wallet',
                description: 'BTC Wallet',
                iconUrl,
                downloadUrl: iconUrl,
                deprecated,
                available: true,
                autoConnect,
                btcContext,
            },
            init: BTCWallet,

        }
    }

    return btcWallet
}

function toHex(originalString: string) {
    let charArray = originalString.split('');
    let asciiArray = charArray.map(char => char.charCodeAt(0));
    let hexArray = asciiArray.map(code => code.toString(16));
    let hexString = hexArray.join('');
    hexString = hexString.replace(/(^0+)/g, '');
    return hexString
}

function initWalletButton(network: string, accountId: string, wallet: any) {
    const checkAndSetupWalletButton = () => {
        // @ts-ignore
        if (accountId && window.btcContext.account) {
            // @ts-ignore
            setupWalletButton(network, wallet, window.btcContext);
        } else {
            removeWalletButton();
            setTimeout(() => {
                checkAndSetupWalletButton();
            }, 5000);
        }
    }
    checkAndSetupWalletButton();
}

const rcpUrls = {
    mainnet: ['https://near.lava.build', 'https://rpc.mainnet.near.org', 'https://free.rpc.fastnear.com', 'https://near.drpc.org'],
    testnet: ['https://near-testnet.lava.build', 'https://rpc.testnet.near.org', 'https://near-testnet.drpc.org']
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTransactionStatus(network: string, hash: string) {
    const provider = new providers.FailoverRpcProvider(
        Object.values(rcpUrls[network as keyof typeof rcpUrls]).map(
            (url) => new providers.JsonRpcProvider({ url })
        )
    );

    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt++;

        const result = await provider.txStatus(hash, 'unused', 'FINAL').catch((error) => {
            console.log(error.message)
            console.error(`Failed to fetch transaction status: ${error.message}`);
            if (attempt === maxAttempts) {
                throw new Error(`Transaction not found: ${hash}`);
            }
            return;
        });
        if (result && result.status) {
            console.log(result);
            return result;
        }

        await delay(10000);
        console.log(`RPC request failed, will retry ${maxAttempts - attempt} more times`);

    }

}


export default {
    // useBtcWalletSelector,
    // BtcWalletSelectorContextProvider,
    setupBTCWallet,
}


