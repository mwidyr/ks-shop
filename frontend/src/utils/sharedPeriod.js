// The Dashboard / analytics pages share ONE date filter while the tab stays open: pick "7 Days" on
// the Dashboard, open the Heatmap and it is still 7 Days. It is plain module state (not
// localStorage), so a refresh, reopening the site or a new login starts again at "Today".
let state = null // { key, from, to } - from/to only matter for the custom range

export const getSharedPeriod = () => state
export const setSharedPeriod = (next) => { state = next }
export const resetSharedPeriod = () => { state = null }
