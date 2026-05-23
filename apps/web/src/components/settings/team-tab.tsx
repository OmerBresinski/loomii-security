import { useMemo } from "react"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { useTeamMembers, type TeamMember } from "@/queries/settings"
import { useUpdateMemberRole } from "@/mutations/settings"
import type { UserRole } from "@/lib/api-client"

// ─── Role Options ───────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "SECURITY_LEAD", label: "Security Lead" },
  { value: "DEVELOPER", label: "Developer" },
  { value: "VIEWER", label: "Viewer" },
]

// ─── Team Tab ───────────────────────────────────────────────────────────────

export function TeamTab() {
  const { user } = useAuth()
  const { data, isPending } = useTeamMembers()
  const updateRoleMutation = useUpdateMemberRole()

  const members = useMemo(() => data?.members ?? [], [data?.members])

  // Count admins to enforce "cannot remove last admin" rule
  const adminCount = useMemo(
    () => members.filter((m) => m.role === "ADMIN").length,
    [members]
  )

  function handleRoleChange(memberId: string, newRole: UserRole) {
    updateRoleMutation.mutate({ memberId, role: newRole })
  }

  function handleInvite() {
    if (!inviteEmail.trim()) return
    inviteMutation.mutate(
      { email: inviteEmail.trim(), role: inviteRole },
      {
        onSuccess: () => {
          setInviteOpen(false)
          setInviteEmail("")
          setInviteRole("DEVELOPER")
        },
      }
    )
  }

  if (isPending) {
    return (
      <div className="max-w-2xl rounded-lg border border-border/50 bg-[#2C2D30] p-5">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-8 w-28 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-2xl">
        {/* Invite button row */}
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            Invite member
          </Button>
        </div>

        {/* Members list */}
        <div className="rounded-lg border border-border/50 bg-[#2C2D30]">
          {members.length === 0 ? (
            <div className="px-5 py-8">
              <p className="text-center text-sm text-muted-foreground">
                No team members found.
              </p>
            </div>
          ) : (
            members.map((member, i) => (
              <div key={member.id}>
                {i > 0 && <Separator className="opacity-50" />}
                <MemberRow
                  member={member}
                  adminCount={adminCount}
                  currentUserId={user?.id ?? ""}
                  onRoleChange={handleRoleChange}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="invite-email">
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="invite-role">
                Role
              </label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as UserRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "Sending..." : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Member Row ─────────────────────────────────────────────────────────────

function MemberRow({
  member,
  adminCount,
  currentUserId,
  onRoleChange,
}: {
  member: TeamMember
  adminCount: number
  currentUserId: string
  onRoleChange: (memberId: string, role: UserRole) => void
}) {
  const isLastAdmin = member.role === "ADMIN" && adminCount <= 1
  const isSelf = member.id === currentUserId
  const isDisabled = isLastAdmin && isSelf

  const roleSelect = (
    <Select
      value={member.role}
      onValueChange={(v) => onRoleChange(member.id, v as UserRole)}
      disabled={isDisabled}
    >
      <SelectTrigger className="h-7 w-[130px] text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">
          {formatMemberName(member)}
        </span>
        <span className="text-[12px] text-muted-foreground">
          {member.email}
          {member.lastActiveAt
            ? ` · Active ${new Date(member.lastActiveAt).toLocaleDateString()}`
            : " · Never active"}
        </span>
      </div>
      {isDisabled ? (
        <Tooltip>
          <TooltipTrigger asChild>{roleSelect}</TooltipTrigger>
          <TooltipContent>Cannot remove the last admin</TooltipContent>
        </Tooltip>
      ) : (
        roleSelect
      )}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMemberName(member: TeamMember): string {
  const parts = [member.firstName, member.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(" ") : member.email.split("@")[0]
}
