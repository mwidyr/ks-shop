// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}${JSON.stringify(o)}` : k) }) }))

const structure = [{ id: 1, name: 'Dragon', rooms: [{ id: 11, name: 'ROOM001', devices: [{ id: 111, name: 'iPhone13_001' }] }, { id: 12, name: 'ROOM002', devices: [] }] }]
vi.mock('../api/tiktok', () => ({
  getTikTokStructure: () => Promise.resolve(structure),
  listTikTokAccounts: () => Promise.resolve({ counts: { LIVE: 1, BACKUP: 0, BLOCKED: 0, OHCA: 0 }, accounts: [{ id: 1, tiktok_id: 'ohzaza000', status: 'LIVE', device_name: 'iPhone13_001', location_name: 'Dragon', room_name: 'ROOM001', device_id: 111, location_id: 1, room_id: 11 }] }),
  getTikTokAccount: () => Promise.resolve({ id: 1, tiktok_id: 'ohzaza000', status: 'LIVE', account_level: 0, account_created_on: null, device_id: 111, room_id: 11, location_id: 1, can_see_credentials: true, password: 'pw', twofa: '', email: '', email_password: '', notes: [{ id: 1, author: 'A', body: 'hello', created_at: '2026-11-01T10:00:00Z' }] }),
  createTikTokAccount: vi.fn(), updateTikTokAccount: vi.fn(), addTikTokNote: vi.fn(), createTikTokDevice: vi.fn(), updateTikTokDevice: vi.fn(),
}))
vi.mock('../api/cekViews', () => ({
  getPortalOverview: () => Promise.resolve([{ id: 1, name: 'Dragon', shifts: { morning: 2, middle: 0, evening: 0 } }]),
  getPortalHosts: () => Promise.resolve([{ host_id: 7, host_name: 'Sepia', tiktok_id: 'ohzaza000', room: 'ROOM001', device: 'iPhone13_001' }]),
  submitViews: vi.fn(() => Promise.resolve({ saved: 1, telegram_sent: true })),
  getAssignments: () => Promise.resolve({ hosts: [{ host_id: 7, host_name: 'Sepia', shift: 'morning', tiktok_account_id: 1, is_off: false }], accounts: [{ id: 1, tiktok_id: 'ohzaza000', status: 'LIVE', room_name: 'ROOM001', device_name: 'iPhone13_001' }] }),
  saveAssignments: vi.fn(), getVoiceSettings: () => Promise.resolve({ days: [1, 2], times: ['06:27'], timezone: 'Asia/Jakarta (GMT+7)', has_file: false }),
  saveVoiceSettings: vi.fn(), uploadVoiceFile: vi.fn(), fetchVoiceBlob: vi.fn(), testVoice: vi.fn(),
}))
const statuses = [
  { id: 1, code: 'W', name: 'Working', is_paid: true, deduct_bonus: false, bg_color: 'green', text_color: 'green', is_active: true, is_default: true },
  { id: 3, code: 'LV', name: 'Leave', is_paid: false, deduct_bonus: true, bg_color: 'red', text_color: 'red', is_active: true, is_default: false },
]
const locations = [{ id: 1, name: 'General', is_active: true, is_default: true }]
const breakdown = { base_salary: 3500000, work_days: 26, off_days: 4, unpaid_days: 0, leave_days: 0, unpaid_deduction: 0, attendance_bonus: 500000, qty: 10, gmv: 1000, qty_bonus: 0, gmv_bonus: 0, daily_bonus: 0, bonus: 500000, extra: 0, extra_note: '', final_salary: 4000000 }
vi.mock('../api/employee', () => ({
  getEmployeeMeta: () => Promise.resolve({ positions: [{ id: 1, name: 'Host' }], locations, hosts: [{ id: 5, name: 'Rere' }], can_see_sensitive: true }),
  listEmployees: () => Promise.resolve({ counts: { total: 1, active: 1, inactive: 0 }, employees: [{ id: 1, emp_code: 'EMP001', full_name: 'Rere Full', nickname: 'Rere', position: 'Host', position_id: 1, location: 'General', location_id: 1, whatsapp: '0812', status: 'full_time', join_date: '2026-07-01', mbti: '', birthday: null, host_id: 5, host_name: 'Rere' }] }),
  getEmployee: () => Promise.resolve({ id: 1, emp_code: 'EMP001', full_name: 'Rere Full', nickname: 'Rere', position_id: 1, location_id: 1, host_id: 5, whatsapp: '0812', status: 'full_time', join_date: '2026-07-01', mbti: '', birthday: null, nik: '0012', address: '', bank_holder: '', bank_name: '', bank_account: '000123', emergency_name: '', emergency_number: '' }),
  createEmployee: vi.fn(), updateEmployee: vi.fn(), createPosition: vi.fn(), exportEmployees: vi.fn(), importEmployees: vi.fn(),
  getSchedule: () => Promise.resolve({ month: '2026-11', dates: ['2026-11-01', '2026-11-02'], statuses, locations, employees: [{ id: 1, nickname: 'Rere', full_name: 'Rere Full', location: 'General', records: { '2026-11-02': 3 } }] }),
  saveSchedule: vi.fn(() => Promise.resolve({})), getScheduleSettings: () => Promise.resolve({ locations, statuses }),
  createEmployeeLocation: vi.fn(), updateEmployeeLocation: vi.fn(), createAttendanceStatus: vi.fn(), updateAttendanceStatus: vi.fn(),
  getPayroll: () => Promise.resolve({ month: '2026-11', locations, counts: { employees: 1, paid: 0, pending: 1 }, summary: { total_salaries: 4000000, transfer_fee: 104000, grand_total: 4104000 }, rows: [{ employee_id: 1, emp_code: 'EMP001', nickname: 'Rere', full_name: 'Rere Full', location: 'General', paid: false, paid_at: null, paid_by: null, finalized: false, details: breakdown }] }),
  getPayrollSettings: () => Promise.resolve({ effective_month: '2026-11', salaries: [{ employee_id: 1, emp_code: 'EMP001', nickname: 'Rere', location: 'General', base_salary: 3500000 }], bonus: { attendance_amount: 500000, qty_tiers: [{ min: 0, max: 200, rate: 0 }], gmv_tiers: [{ min: 150000, bonus: 500000 }], daily: { accumulate: false, tiers: [{ qty: 30, bonus: 100000 }] } } }),
  savePayrollExtra: vi.fn(), setPayrollPaid: vi.fn(), savePayrollTransferFee: vi.fn(), saveBaseSalary: vi.fn(), saveBonusSettings: vi.fn(),
  getBonusRanking: () => Promise.resolve({ month: '2026-11', locations, rows: [{ rank: 1, employee_id: 1, host: 'Rere', location: 'General', qty: 1250, gmv: 680000, total_bonus: 4175000 }] }),
}))

import TikTokAccounts from './TikTokAccounts'
import TikTokAccountDetail from './TikTokAccountDetail'
import CekViews from './CekViews'
import CekViewsSettings from './CekViewsSettings'
import EmployeeList from './EmployeeList'
import ShiftSchedule from './ShiftSchedule'
import Payroll from './Payroll'
import BonusRanking from './BonusRanking'

async function mount(el, path = '/') {
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  return container
}
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const byText = (c, sel, txt) => [...c.querySelectorAll(sel)].find((e) => e.textContent.includes(txt))

describe('TikTok + CEK VIEWS + EMPLOYEE pages render', () => {
  let errors
  beforeEach(() => { errors = []; vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' '))) })

  it('TikTok accounts list and the settings tab', async () => {
    const c = await mount(<TikTokAccounts />)
    expect(c.textContent).toContain('@ohzaza000')
    await click(byText(c, 'button', 'page_tiktok.tab_settings'))
    expect(c.textContent).toContain('ROOM001')
    expect(errors).toEqual([])
  })

  it('TikTok account detail shows login details and notes', async () => {
    const { Routes, Route } = await import('react-router-dom')
    const c = await mount(<Routes><Route path="/tiktok/accounts/:id" element={<TikTokAccountDetail />} /></Routes>, '/tiktok/accounts/1')
    expect(c.textContent).toContain('@ohzaza000')
    expect(c.textContent).toContain('hello')
    expect(c.querySelectorAll('input[type=password]').length).toBe(4)
    expect(errors).toEqual([])
  })

  it('CEK VIEWS portal: location, shift, views, send', async () => {
    const c = await mount(<CekViews />)
    await click(byText(c, 'button', 'Dragon'))
    await click(byText(c, 'button', 'Morning'))
    expect(c.textContent).toContain('Sepia')
    expect(c.textContent).toContain('Room 001')
    const input = c.querySelector('input[inputmode=numeric]')
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(input, '1234'); input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(byText(c, 'button', 'Kirim Views'))
    expect(c.textContent).toContain('page_cek_views.sent_title')
    expect(errors).toEqual([])
  })

  it('CEK VIEWS settings: assignment and voice reminder', async () => {
    const c = await mount(<CekViewsSettings />)
    expect(c.textContent).toContain('Sepia')
    await click(byText(c, 'button', 'Voice Reminder'))
    expect(c.textContent).toContain('06:27')
    expect(errors).toEqual([])
  })

  it('Employee list expands a row and opens the form', async () => {
    const c = await mount(<EmployeeList />)
    expect(c.textContent).toContain('EMP001')
    await click(byText(c, 'tr', 'Rere Full'))
    await click(byText(c, 'button', 'page_employee.open_full_form'))
    expect(c.textContent).toContain('A. page_employee.sec_personal')
    expect(errors).toEqual([])
  })

  it('Shift schedule grid, drag selection and status menu', async () => {
    const c = await mount(<ShiftSchedule />)
    const cells = [...c.querySelectorAll('tbody td')].filter((td) => td.textContent === 'W' || td.textContent === 'LV')
    expect(cells.map((td) => td.textContent)).toEqual(['W', 'LV']) // 2 Nov carries a stored Leave record
    await act(async () => { cells[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); window.dispatchEvent(new MouseEvent('mouseup')) })
    expect(c.textContent).toContain('page_employee.apply_status')
    expect(errors).toEqual([])
  })

  it('Payroll summary, row details and settings', async () => {
    const c = await mount(<Payroll />)
    expect(c.textContent).toContain('Rp 4,104,000')
    await click(byText(c, 'td', 'Rere'))
    expect(c.textContent).toContain('page_employee.copy_payslip')
    await click(byText(c, 'button', 'page_employee.settings'))
    expect(c.textContent).toContain('page_employee.salary_settings')
    expect(errors).toEqual([])
  })

  it('Bonus ranking', async () => {
    const c = await mount(<BonusRanking />)
    expect(c.textContent).toContain('4,175,000')
    expect(errors).toEqual([])
  })
})
