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


interface CAWalletParams {
    iconUrl?: string;
    deprecated?: boolean;
    btcContext?: any;
}

const base_url = 'https://api.dev.satoshibridge.top/v1'
const token = 'nbtc1-nsp.testnet'
const contractId = 'dev1-nsp.testnet'


const state: any = {
    saveAccount(account: string) {
        console.log('saveAccount:', account)
        window.localStorage.setItem('satoshi-account', account)
    },
    removeAccount() {
        window.localStorage.removeItem('satoshi-account')
    },
    savePublicKey(publicKey: string) {
        window.localStorage.setItem('satoshi-publickey', publicKey)
    },
    removePublicKey() {
        window.localStorage.removeItem('satoshi-publickey')
    },
    saveBtcPublicKey(publicKey: string) {
        window.localStorage.setItem('satoshi-btc-publickey', publicKey)
    },
    removeBtcPublicKey() {
        window.localStorage.removeItem('satoshi-btc-publickey')
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
        console.log('getAccount:', window.localStorage.getItem('satoshi-account'))
        return window.localStorage.getItem('satoshi-account')
    },
    getPublicKey() {
        return window.localStorage.getItem('satoshi-publickey')
    },
    getBtcPublicKey() {
        return window.localStorage.getItem('satoshi-btc-publickey')
    }
}



const SatoshiWallet: WalletBehaviourFactory<InjectedWallet> = async ({
    metadata,options,
    store,
    emitter,
    logger,
    id,
    provider,
}) => {
    // const { login, logout, account } = useBtcWalletSelector()

    const wallet = {
        signIn,
        signOut,
        getAccounts,
        verifyOwner,
        signMessage,
        signAndSendTransaction,
        signAndSendTransactions
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


    async function signIn ({ contractId, methodNames }: any){
        console.log('signIn:', contractId, methodNames)
        console.log(provider)
        const accountId = state.getAccount()
        const publicKey = state.getPublicKey()
        // @ts-ignore
        const btcContext = window.btcContext

        console.log('metadata:', metadata)

        if (accountId && publicKey) {
            return [{
                accountId,
                publicKey,
            }]
        }

        const btcAccount = await btcContext.login()
        const btcPublicKey = await btcContext.getPublicKey()


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
    }

    async function getAccounts() {
        const accountId = state.getAccount()
         // @ts-ignore
        accountId ? setupWalletButton(options.network.networkId, wallet as any,window.btcContext):removeWalletButton()

        return [{ accountId: state.getAccount() }];
    }

    async function verifyOwner() {
        throw new Error(`Method not supported by ${metadata.name}`);
    }

    async function signMessage() {
        throw new Error(`Method not supported by ${metadata.name}`);
    }

    async function signAndSendTransaction({ signerId, receiverId, actions }: any){
        // @ts-ignore
        const btcContext = window.btcContext



        // console.log(btcContext)

        // const v = btcContext.getContext()

        // console.log(v)

        // v.setIsProcessing(true)

        // return 

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
            "gas_limit": '2000',
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
            const result=await pollTransactionStatus(options.network.networkId, hash)
            return result;
        } else {
            return null
        }

    }

    async function signAndSendTransactions({ transactions }: any){
        const result=await Promise.all(transactions.map(async (transaction: any) => {
                return await signAndSendTransaction(transaction)
            }
        ))
        return result;
    }

    return wallet;
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

export function setupSatoshiWallet({
    iconUrl = 'https://www.thefaucet.org/images/logo.jpg',
    deprecated = false,
    btcContext
}: CAWalletParams): WalletModuleFactory<InjectedWallet> {

    const satoshiWallet: any = async () => {
        return {
            id: 'satoshi-wallet',
            type: 'injected',
            metadata: {
                name: 'SatoshiWallet',
                description: 'SatoshiWallet',
                iconUrl,
                downloadUrl: iconUrl,
                deprecated,
                available: true,
                btcContext,
            },
            init: SatoshiWallet,
        }
    }

    return satoshiWallet
}

function toHex(originalString: string) {
    let charArray = originalString.split('');
    let asciiArray = charArray.map(char => char.charCodeAt(0));
    let hexArray = asciiArray.map(code => code.toString(16));
    let hexString = hexArray.join('');
    hexString = hexString.replace(/(^0+)/g, '');
    return hexString
}

const rcpUrls={
    mainnet:['https://near.lava.build','https://rpc.mainnet.near.org','https://free.rpc.fastnear.com','https://near.drpc.org'],
    testnet:['https://near-testnet.lava.build','https://rpc.testnet.near.org','https://near-testnet.drpc.org']
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

    const maxAttempts = 10;
    let attempt = 0;

    while (attempt < maxAttempts) {
        try {
            attempt++;
    
            const result = await provider.txStatus(hash, 'unused', 'FINAL');
            console.log('Polling result:', result);

            if (result && result.status) {
                return result;
            }

            console.warn('Received empty or invalid result, retrying...');
        } catch (error) {
            console.error('RPC request failed, will retry...', error);
        }
        await delay(5000);
    }
    throw new Error(`Transaction status polling failed after ${maxAttempts} attempts.`);
}


export default {
    // useBtcWalletSelector,
    // BtcWalletSelectorContextProvider,
    setupSatoshiWallet,
}


