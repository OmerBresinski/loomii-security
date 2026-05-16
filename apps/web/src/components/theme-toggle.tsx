import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark")
    else if (theme === "dark") setTheme("system")
    else setTheme("light")
  }

  const label =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"

  return (
    <Button variant="ghost" size="sm" onClick={cycleTheme} className="w-full justify-start">
      {label} Mode
    </Button>
  )
}
