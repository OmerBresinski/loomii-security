import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api-client"
import {
  onboardingKeys,
  type OnboardingStateResponse,
} from "@/queries/onboarding"

// ─── Save Step Progress ─────────────────────────────────────────────────────

export function useSaveOnboardingStep() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["onboarding", "saveStep"],
    mutationFn: ({ step }: { step: number }) =>
      fetchApi<{ success: boolean }>("/api/v1/onboarding/step", {
        method: "PATCH",
        body: { step },
      }),

    onMutate: async ({ step }) => {
      await queryClient.cancelQueries({ queryKey: onboardingKeys.state() })

      const previous = queryClient.getQueryData<OnboardingStateResponse>(
        onboardingKeys.state()
      )

      if (previous) {
        queryClient.setQueryData<OnboardingStateResponse>(
          onboardingKeys.state(),
          {
            onboarding: { ...previous.onboarding, currentStep: step },
          }
        )
      }

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(onboardingKeys.state(), context.previous)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state() })
    },
  })
}

// ─── Configure Policies ─────────────────────────────────────────────────────

export function useConfigurePolicies() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["onboarding", "policies"],
    mutationFn: ({
      enabledPolicies,
    }: {
      enabledPolicies: string[]
    }) =>
      fetchApi<{ success: boolean }>("/api/v1/onboarding/policies", {
        method: "POST",
        body: { enabledPolicies },
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state() })
    },
  })
}

// ─── Save Monitoring Scope ──────────────────────────────────────────────────

export function useSaveMonitoringScope() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["onboarding", "scope"],
    mutationFn: ({
      linearProjectIds,
      linearTeamIds,
      notionPageIds,
    }: {
      linearProjectIds: string[]
      linearTeamIds: string[]
      notionPageIds: string[]
    }) =>
      fetchApi<{ success: boolean }>("/api/v1/onboarding/scope", {
        method: "POST",
        body: { linearProjectIds, linearTeamIds, notionPageIds },
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state() })
    },
  })
}

// ─── Start Initial Sync ─────────────────────────────────────────────────────

export function useStartSync() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["onboarding", "sync", "start"],
    mutationFn: () =>
      fetchApi<{ success: boolean }>("/api/v1/onboarding/sync", {
        method: "POST",
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.sync() })
    },
  })
}

// ─── Complete Onboarding ────────────────────────────────────────────────────

export function useCompleteOnboarding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ["onboarding", "complete"],
    mutationFn: () =>
      fetchApi<{ success: boolean }>("/api/v1/onboarding/complete", {
        method: "POST",
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state() })
    },
  })
}
