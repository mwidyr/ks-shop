import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '../i18n'
import { FONT_SCALES, applyFontScale, getFontScale } from '../utils/fontScale'
import { IconClose } from './icons'

const LANGUAGES = [
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'zh', label: '繁體中文' },
  { code: 'en', label: 'English' },
]

export default function PreferencesModal({ onClose }) {
  const { t, i18n } = useTranslation()
  const [scale, setScale] = useState(getFontScale())

  function handleScaleChange(value) {
    setScale(value)
    applyFontScale(value)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-gray-800">{t('preferences.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconClose />
          </button>
        </div>

        <p className="text-sm font-semibold text-gray-700 mb-2">{t('preferences.language')}</p>
        <div className={`grid grid-cols-${LANGUAGES.length} gap-2 mb-6`}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => changeLanguage(lang.code)}
              className={`text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
                i18n.language === lang.code
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">{t('preferences.font_size')}</p>
          <span className="text-xs font-semibold text-brand-600">{t(`preferences.${FONT_SCALES.find((f) => f.value === scale)?.key || 'font_standard'}`)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={FONT_SCALES.length - 1}
          step={1}
          value={FONT_SCALES.findIndex((f) => f.value === scale)}
          onChange={(e) => handleScaleChange(FONT_SCALES[Number(e.target.value)].value)}
          className="w-full accent-brand-600"
        />
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          {FONT_SCALES.map((f) => (
            <span key={f.value}>{t(`preferences.${f.key}`)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
