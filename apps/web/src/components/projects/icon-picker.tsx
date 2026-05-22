import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Shield01Icon,
  ShieldKeyIcon,
  LockIcon,
  LockKeyIcon,
  Key01Icon,
  FingerPrintIcon,
  CodeIcon,
  CodeSquareIcon,
  TerminalIcon,
  ApiIcon,
  ServerStack01Icon,
  Database01Icon,
  CloudIcon,
  CloudServerIcon,
  GlobeIcon,
  Globe02Icon,
  Rocket01Icon,
  Rocket02Icon,
  Target02Icon,
  Target03Icon,
  CpuIcon,
  CpuChargeIcon,
  Atom01Icon,
  Bug01Icon,
  Bug02Icon,
  Alert01Icon,
  AlertCircleIcon,
  EyeIcon,
  SearchList01Icon,
  Compass01Icon,
  Layers01Icon,
  FolderOpenIcon,
  Folder01Icon,
  LinkSquare02Icon,
  Settings01Icon,
  Award01Icon,
  Crown02Icon,
  Diamond01Icon,
  StarIcon,
  BookmarkAdd01Icon,
  Flag01Icon,
  Building01Icon,
  Castle01Icon,
  SparklesIcon,
  PaintBoardIcon,
  Chart01Icon,
  Analytics01Icon,
  Activity01Icon,
  Package01Icon,
  FileCodeIcon,
} from "@hugeicons/core-free-icons"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUpdateProjectIcon, type ProjectIcon } from "@/stores/project-icons"

// ─── Available Icons ────────────────────────────────────────────────────────

// ─── Available Icons ────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  { name: "Shield01Icon", icon: Shield01Icon },
  { name: "ShieldKeyIcon", icon: ShieldKeyIcon },
  { name: "LockIcon", icon: LockIcon },
  { name: "LockKeyIcon", icon: LockKeyIcon },
  { name: "Key01Icon", icon: Key01Icon },
  { name: "FingerPrintIcon", icon: FingerPrintIcon },
  { name: "CodeIcon", icon: CodeIcon },
  { name: "CodeSquareIcon", icon: CodeSquareIcon },
  { name: "TerminalIcon", icon: TerminalIcon },
  { name: "ApiIcon", icon: ApiIcon },
  { name: "ServerStack01Icon", icon: ServerStack01Icon },
  { name: "Database01Icon", icon: Database01Icon },
  { name: "CloudIcon", icon: CloudIcon },
  { name: "CloudServerIcon", icon: CloudServerIcon },
  { name: "GlobeIcon", icon: GlobeIcon },
  { name: "Globe02Icon", icon: Globe02Icon },
  { name: "Rocket01Icon", icon: Rocket01Icon },
  { name: "Rocket02Icon", icon: Rocket02Icon },
  { name: "Target02Icon", icon: Target02Icon },
  { name: "Target03Icon", icon: Target03Icon },
  { name: "CpuIcon", icon: CpuIcon },
  { name: "CpuChargeIcon", icon: CpuChargeIcon },
  { name: "Atom01Icon", icon: Atom01Icon },
  { name: "Bug01Icon", icon: Bug01Icon },
  { name: "Bug02Icon", icon: Bug02Icon },
  { name: "Alert01Icon", icon: Alert01Icon },
  { name: "AlertCircleIcon", icon: AlertCircleIcon },
  { name: "EyeIcon", icon: EyeIcon },
  { name: "SearchList01Icon", icon: SearchList01Icon },
  { name: "Compass01Icon", icon: Compass01Icon },
  { name: "Layers01Icon", icon: Layers01Icon },
  { name: "FolderOpenIcon", icon: FolderOpenIcon },
  { name: "Folder01Icon", icon: Folder01Icon },
  { name: "LinkSquare02Icon", icon: LinkSquare02Icon },
  { name: "Settings01Icon", icon: Settings01Icon },
  { name: "Award01Icon", icon: Award01Icon },
  { name: "Crown02Icon", icon: Crown02Icon },
  { name: "Diamond01Icon", icon: Diamond01Icon },
  { name: "StarIcon", icon: StarIcon },
  { name: "BookmarkAdd01Icon", icon: BookmarkAdd01Icon },
  { name: "Flag01Icon", icon: Flag01Icon },
  { name: "Building01Icon", icon: Building01Icon },
  { name: "Castle01Icon", icon: Castle01Icon },
  { name: "SparklesIcon", icon: SparklesIcon },
  { name: "PaintBoardIcon", icon: PaintBoardIcon },
  { name: "Chart01Icon", icon: Chart01Icon },
  { name: "Analytics01Icon", icon: Analytics01Icon },
  { name: "Activity01Icon", icon: Activity01Icon },
  { name: "Package01Icon", icon: Package01Icon },
  { name: "FileCodeIcon", icon: FileCodeIcon },
]

// Build a lookup map for rendering by name
export const ICON_MAP: Record<string, typeof Shield01Icon> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.name, o.icon])
)

// ─── Preset Colors ──────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#A1A1AA",
  "#A78BFA",
  "#67E8F9",
  "#6EE7B7",
  "#FCD34D",
  "#FDBA74",
  "#F9A8D4",
  "#EF4444",
]

// ─── Icon Display (renders an icon by name + color) ─────────────────────────

interface ProjectIconDisplayProps {
  icon: string
  color: string
  size?: number
  className?: string
}

export function ProjectIconDisplay({ icon, color, size = 18, className }: ProjectIconDisplayProps) {
  const IconComponent = ICON_MAP[icon]

  if (!IconComponent) return null

  return (
    <HugeiconsIcon
      icon={IconComponent}
      size={size}
      color={color}
      className={className}
    />
  )
}

// ─── Icon Picker Popover ────────────────────────────────────────────────────

interface IconPickerProps {
  projectId: string
  icon: string
  color: string
  children: React.ReactNode
}

export function IconPicker({ projectId, icon: currentIcon, color: currentColor, children }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const updateIcon = useUpdateProjectIcon(projectId)

  const [selectedColor, setSelectedColor] = useState(currentColor)

  function handleColorChange(color: string) {
    setSelectedColor(color)
    updateIcon.mutate({ icon: currentIcon, color })
  }

  function handleIconSelect(iconName: string) {
    updateIcon.mutate({ icon: iconName, color: selectedColor })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[320px] bg-[#2C2D30] border-[#3A3B3F] p-0" align="start" onClick={(e) => e.stopPropagation()}>
        {/* Color row */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorChange(color)}
              className={`size-[22px] rounded-full shrink-0 transition-[box-shadow] duration-100 ring-offset-1 ring-offset-[#2C2D30] ${
                selectedColor === color
                  ? "ring-2 ring-white/40"
                  : "hover:ring-2 hover:ring-white/25"
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Color ${color}`}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="mx-3 border-t border-[#3A3B3F]" />

        {/* Icon grid */}
        <div className="grid grid-cols-10 gap-0.5 p-2 pt-1">
          {ICON_OPTIONS.map((option) => (
            <button
              key={option.name}
              onClick={() => handleIconSelect(option.name)}
              className={`flex size-7 items-center justify-center rounded transition-colors hover:bg-white/10 ${
                currentIcon === option.name ? "bg-white/15" : ""
              }`}
              aria-label={option.name}
            >
              <HugeiconsIcon
                icon={option.icon}
                size={16}
                color={selectedColor}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
