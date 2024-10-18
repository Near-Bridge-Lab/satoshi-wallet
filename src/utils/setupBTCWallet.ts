import type {
    Action,
    Optional,
    Transaction,
    InjectedWallet,
    FunctionCallAction,
    WalletModuleFactory,
    WalletBehaviourFactory,
    Wallet,
} from "@near-wallet-selector/core";
import { providers, transactions } from "near-api-js";
import type { AccessKeyViewRaw } from "near-api-js/lib/providers/provider";
import { AccountView } from "near-api-js/lib/providers/provider";
import {
    SignedDelegate,
    SignedTransaction,
    buildDelegateAction,
    actionCreators,
    decodeTransaction,
} from "@near-js/transactions";

import { KeyType, PublicKey } from "near-api-js/lib/utils/key_pair";
import {
    createTransaction,
    encodeDelegateAction,
    encodeTransaction,
    Signature,
} from "near-api-js/lib/transaction";
import { baseDecode, baseEncode } from "@near-js/utils";
import bs58 from "bs58";
import { sha256 } from "js-sha256";
import { setupWalletButton, removeWalletButton } from "./initWalletButton";

// export * from './btcWalletSelectorContext'
import type { useBtcWalletSelector } from "./../components/btcWalletSelectorContext";

const { signedDelegate, transfer, functionCall } = actionCreators;

declare global {
    interface Window {
        btcContext: ReturnType<typeof useBtcWalletSelector>;
    }
}

interface BTCWalletParams {
    iconUrl?: string;
    deprecated?: boolean;
    autoConnect?: boolean;
}

const base_url = "https://api.dev.satoshibridge.top/v1";
const token = "nbtc1-nsp.testnet";
const contractId = "dev1-nsp.testnet";

const state: any = {
    saveAccount(account: string) {
        window.localStorage.setItem("btc-wallet-account", account);
    },
    removeAccount() {
        window.localStorage.removeItem("btc-wallet-account");
    },
    savePublicKey(publicKey: string) {
        window.localStorage.setItem("btc-wallet-publickey", publicKey);
    },
    removePublicKey() {
        window.localStorage.removeItem("btc-wallet-publickey");
    },
    saveBtcPublicKey(publicKey: string) {
        window.localStorage.setItem("btc-wallet-btc-publickey", publicKey);
    },
    removeBtcPublicKey() {
        window.localStorage.removeItem("btc-wallet-btc-publickey");
    },
    clear() {
        this.removeAccount();
        this.removePublicKey();
        this.removeBtcPublicKey();
    },
    save(account: string, publicKey: string) {
        this.saveAccount(account);
        this.savePublicKey(publicKey);
    },
    getAccount() {
        return window.localStorage.getItem("btc-wallet-account");
    },
    getPublicKey() {
        return window.localStorage.getItem("btc-wallet-publickey");
    },
    getBtcPublicKey() {
        return window.localStorage.getItem("btc-wallet-btc-publickey");
    },
};

let inter: any = null;

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
        signAndSendTransactions,
    };
    if (!inter) {
        inter = setInterval(async () => {
            // @ts-ignore
            const btcContext = window.btcContext;

            if (btcContext) {
                clearInterval(inter);
                const context = btcContext.getContext();

                const accountId = state.getAccount();
                initWalletButton(options.network.networkId, accountId, wallet);

                context.on("updatePublicKey", async (btcPublicKey: string) => {
                    const { nearTempAddress, nearTempPublicKey } =
                        await getNearAccountByBtcPublicKey(btcPublicKey);
                    console.log("accountsChanged:", nearTempAddress, btcContext.account);
                    removeWalletButton();
                    setTimeout(() => {
                        initWalletButton(
                            options.network.networkId,
                            nearTempAddress,
                            wallet,
                        );
                    }, 1000);

                    emitter.emit("accountsChanged", {
                        accounts: [
                            {
                                accountId: nearTempAddress,
                                // active: true
                            },
                        ],
                    });
                });

                context.on('btcLoginError', async (e: any) => {
                    emitter.emit('accountsChanged', {
                        accounts: []
                    })
                })

                console.log("metadata.autoConnect:", metadata);

                if (
                    "autoConnect" in metadata &&
                    metadata.autoConnect &&
                    localStorage.getItem("near-wallet-selector:selectedWalletId") ===
                    '"btc-wallet"'
                ) {
                    btcContext.autoConnect()
                }

                clearInterval(inter);
            }
        }, 500);
    }

    async function viewMethod({
        method,
        args = {},
    }: {
        method: string;
        args: any;
    }) {
        const res: any = await provider.query({
            request_type: "call_function",
            account_id: contractId,
            method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
            finality: "optimistic",
        });

        return JSON.parse(Buffer.from(res.result).toString());
    }

    async function getNearAccountByBtcPublicKey(btcPublicKey: string) {
        const nearTempAddress = await viewMethod({
            method: "get_chain_signature_near_account",
            args: { btc_public_key: btcPublicKey },
        });

        const nearTempPublicKey = await viewMethod({
            method: "get_chain_signature_near_account_public_key",
            args: { btc_public_key: btcPublicKey },
        });

        state.saveAccount(nearTempAddress);
        state.savePublicKey(nearTempPublicKey);
        state.saveBtcPublicKey(btcPublicKey);

        return {
            nearTempAddress,
            nearTempPublicKey,
        };
    }

    async function signIn({ contractId, methodNames }: any) {
        console.log(provider);
        const accountId = state.getAccount();
        const publicKey = state.getPublicKey();
        // @ts-ignore
        const btcContext = window.btcContext;

        if (accountId && publicKey) {
            return [
                {
                    accountId,
                    publicKey,
                },
            ];
        }

        const btcAccount = await btcContext.login();
        const btcPublicKey = await btcContext.getPublicKey();

        const { nearTempAddress, nearTempPublicKey } =
            await getNearAccountByBtcPublicKey(btcPublicKey);

        return [
            {
                accountId: nearTempAddress,
                publicKey: nearTempPublicKey,
            },
        ];
    }

    async function signOut() {
        const btcContext = window.btcContext;
        btcContext.logout();
        state.clear();
        window.localStorage.removeItem("near-wallet-selector:selectedWalletId");
        removeWalletButton();
        // clearInterval(inter)
    }

    async function getAccounts() {
        return [{ accountId: state.getAccount() }];
    }

    async function verifyOwner() {
        throw new Error(`Method not supported by ${metadata.name}`);
    }

    async function signMessage() {
        throw new Error(`Method not supported by ${metadata.name}`);
    }

    async function signAndSendTransaction(params: Transaction) {
        const transactions = [params];
        const result = await signAndSendTransactions({ transactions });
        if (Array.isArray(result)) {
            return result[0];
        } else {
            throw new Error(`Transaction failed: ${result}`);
        }
    }

    async function signAndSendTransactions(params: {
        transactions: Transaction[];
    }) {
        const btcContext = window.btcContext;
        const accountId = state.getAccount();
        const publicKey = state.getPublicKey();

        const { header } = await provider.block({ finality: "final" });

        const rawAccessKey = await provider.query<AccessKeyViewRaw>({
            request_type: "view_access_key",
            account_id: accountId,
            public_key: publicKey,
            finality: "final",
        });

        const accessKey = {
            ...rawAccessKey,
            nonce: BigInt(rawAccessKey.nonce || 0),
        };

        const publicKeyFormat = PublicKey.from(publicKey);

        const nearNonceApi = await getNearNonceFromApi(accountId);

        const newTransactions = params.transactions.map((transaction, index) => {
            let nearNonceNumber = accessKey.nonce + BigInt(1);
            if (nearNonceApi) {
                nearNonceNumber =
                    Number(nearNonceApi.result_data) > nearNonceNumber
                        ? BigInt(Number(nearNonceApi.result_data))
                        : nearNonceNumber;
            }
            const newActions = transaction.actions
                .map((action) => {
                    switch (action.type) {
                        case "FunctionCall":
                            return functionCall(
                                action.params.methodName,
                                action.params.args,
                                BigInt(action.params.gas),
                                BigInt(action.params.deposit),
                            );
                        case "Transfer":
                            return transfer(BigInt(action.params.deposit));
                    }
                })
                .filter(Boolean) as transactions.Action[];
            const _transaction = transactions.createTransaction(
                accountId,
                publicKeyFormat,
                transaction.receiverId,
                BigInt(nearNonceNumber) + BigInt(index),
                newActions,
                baseDecode(header.hash),
            );
            const txBytes = encodeTransaction(_transaction);
            const txHex = Array.from(txBytes, (byte)=> ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');;
            console.log('txHex:', txHex)

            const hash = bs58.encode(new Uint8Array(sha256.array(txBytes)));
            return { txBytes, txHex, hash };
        });

        const accountInfo = await viewMethod({
            method: "get_account",
            args: { account_id: accountId },
        });

        const nonceApi = await getNonceFromApi(accountId as string);

        const nonce = nonceApi?.result_data
            ? Number(nonceApi?.result_data)
            : accountInfo.nonce;

        const intention = {
            chain_id: "397",
            csna: accountId,
            near_transactions: newTransactions.map((t) => t.txHex),
            gas_token: token,
            gas_limit: "3000",
            nonce: Number(nonce).toString(),
        };

        const strIntention = JSON.stringify(intention);

        const signature = await btcContext.signMessage(strIntention);

        const result = await uploadBTCTx({
            sig: signature,
            btcPubKey: state.getBtcPublicKey(),
            data: toHex(strIntention),
        });

        console.log("result:", result);

        if (result.result_code === 0) {
            const hash = newTransactions.map((t) => t.hash);
            console.log("txHash:", hash);
            const result = await pollTransactionStatuses(
                options.network.networkId,
                hash,
            );
            return result;
        } else {
            return null;
        }
    }

    return wallet as any;
};

function getNonceFromApi(accountId: string) {
    return fetch(`${base_url}/nonce?csna=${accountId}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    }).then((res) => res.json());
}

function getNearNonceFromApi(accountId: string) {
    return fetch(`${base_url}/nonceNear?csna=${accountId}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    }).then((res) => res.json());
}

function uploadBTCTx(data: any) {
    return fetch(`${base_url}/receiveTransaction`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
    }).then((res) => res.json());
}

export function setupBTCWallet({
    iconUrl = "https://assets.deltatrade.ai/assets/chain/btc.svg",
    deprecated = false,
    autoConnect = true,
}: BTCWalletParams | undefined = {}): WalletModuleFactory<InjectedWallet> {
    const btcWallet: any = async () => {
        return {
            id: "btc-wallet",
            type: "injected",
            metadata: {
                name: "BTC Wallet",
                description: "BTC Wallet",
                iconUrl,
                downloadUrl: iconUrl,
                deprecated,
                available: true,
                autoConnect,
            },
            init: BTCWallet,
        };
    };

    return btcWallet;
}

function toHex(originalString: string) {
    const charArray = originalString.split("");
    const asciiArray = charArray.map((char) => char.charCodeAt(0));
    const hexArray = asciiArray.map((code) => code.toString(16));
    let hexString = hexArray.join("");
    hexString = hexString.replace(/(^0+)/g, "");
    return hexString;
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
    };
    checkAndSetupWalletButton();
}

const rcpUrls = {
    mainnet: [
        "https://near.lava.build",
        "https://rpc.mainnet.near.org",
        "https://free.rpc.fastnear.com",
        "https://near.drpc.org",
    ],
    testnet: [
        "https://near-testnet.lava.build",
        "https://rpc.testnet.near.org",
        "https://near-testnet.drpc.org",
    ],
};

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTransactionStatuses(network: string, hashes: string[]) {
    const provider = new providers.FailoverRpcProvider(
        Object.values(rcpUrls[network as keyof typeof rcpUrls]).map(
            (url) => new providers.JsonRpcProvider({ url }),
        ),
    );

    const maxAttempts = 3;

    // Helper function to poll status for a single transaction hash
    const pollStatus = async (hash: string) => {
        let attempt = 0;

        while (attempt < maxAttempts) {
            attempt++;

            try {
                const result = await provider.txStatus(hash, "unused", "FINAL");

                if (result && result.status) {
                    console.log(`Transaction ${hash} result:`, result);
                    return result;
                }
            } catch (error: any) {
                console.error(
                    `Failed to fetch transaction status for ${hash}: ${error.message}`,
                );
            }

            if (attempt === maxAttempts) {
                throw new Error(`Transaction not found after max attempts: ${hash}`);
            }

            // Delay before next attempt
            await delay(10000);
            console.log(
                `RPC request failed for ${hash}, retrying ${maxAttempts - attempt} more times`,
            );
        }
    };

    // Poll all transaction statuses in parallel
    const results = await Promise.all(hashes.map((hash) => pollStatus(hash)));

    return results;
}

export default {
    // useBtcWalletSelector,
    // BtcWalletSelectorContextProvider,
    setupBTCWallet,
};