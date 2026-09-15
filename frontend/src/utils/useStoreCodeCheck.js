import { useEffect, useState } from 'react'
import { validateStoreCode } from '../api/pickupStores'

// Debounced existence check for a typed CVS store code (7-Eleven/FamilyMart) against ECPay's
// real store directory. Only fires once the code is a well-formed 6-digit string (the format
// check already covers anything shorter/invalid) and `active` (the chain is actually a CVS
// chain). Returns null while unchecked/checking/unconfigured - callers should only ever render
// a warning when this is exactly `{ exists: false }`, never treat null as "not found".
export function useStoreCodeCheck(chainType, code, active) {
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!active || !/^\d{6}$/.test(code || '')) {
      setResult(null)
      return
    }
    setResult(null)
    const timer = setTimeout(() => {
      validateStoreCode(chainType, code).then((data) => {
        if (!data.configured || data.exists === null || data.exists === undefined) {
          setResult(null)
          return
        }
        setResult({ exists: data.exists, storeName: data.store_name })
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [chainType, code, active])

  return result
}
