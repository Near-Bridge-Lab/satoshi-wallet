import { useEffect } from 'react'
import { useBtcWalletSelector } from './btcWalletSelectorContext'

export function InitContextHook() {
    const btcContext = useBtcWalletSelector()

    useEffect(() => {
        // @ts-ignore
        window.btcContext = btcContext
    }, [btcContext])

    return null
}