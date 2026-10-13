import { useCallback, useEffect, useState } from 'react'
import { claimCoupon, claimMemberCoupon, getMemberCoupons } from './api'
import { listClaimed, saveClaimed } from './claimed'
import { useMember } from './member'

// The coupons the visitor holds: from the account when signed in (welcome voucher, birthday coupon, claimed
// live codes), otherwise the codes claimed on this device. Both shapes are the same to the pages.
export function useCoupons() {
  const { signedIn } = useMember()
  const [list, setList] = useState(listClaimed)
  const reload = useCallback(async () => {
    if (signedIn) {
      try { setList((await getMemberCoupons()).map((c) => ({ ...c, usedAt: c.used ? 1 : undefined }))) } catch { setList([]) }
    } else setList(listClaimed())
  }, [signedIn])
  useEffect(() => { reload() }, [reload])
  const claim = useCallback(async (code) => {
    const p = await claimCoupon(code) // validates the code (public)
    if (signedIn) await claimMemberCoupon(code)
    else saveClaimed(p)
    await reload()
    return p
  }, [signedIn, reload])
  return { list, claim, reload }
}
