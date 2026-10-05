import { useState } from 'react'
import { IconEye, IconEyeOff } from './icons'

// A plain <input type="password"> plus a show/hide eye toggle button, styled to match the
// password fields already used on Login/ResetPassword/AcceptInvite (same classes, just an
// absolutely-positioned button over the right edge). minLength/required/className are forwarded
// straight through so every call site keeps its existing validation behavior unchanged.
export default function PasswordInput({ value, onChange, className = '', minLength, required, ...rest }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        minLength={minLength}
        required={required}
        className={`${className} pr-10`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full px-3 flex items-center text-gray-400 hover:text-gray-600"
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  )
}
