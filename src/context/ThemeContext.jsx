import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    const savedTheme = localStorage.getItem('theme')

    if (theme === 'light') {
      root.classList.add('light')
      root.classList.remove('dark')
    } else {
      root.classList.add('dark')
      root.classList.remove('light')
    }
    localStorage.setItem('theme', theme)

    if (savedTheme) return undefined

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mediaQuery) return undefined

    const handleSystemThemeChange = (event) => {
      if (!localStorage.getItem('theme')) {
        setTheme(event.matches ? 'dark' : 'light')
      }
    }
    mediaQuery.addEventListener?.('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener?.('change', handleSystemThemeChange)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}