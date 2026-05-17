import { WorkOS } from "@workos-inc/node";

let workosInstance: WorkOS | null = null;

export function getWorkOS(): WorkOS {
  if (!workosInstance) {
    workosInstance = new WorkOS(process.env.WORKOS_API_KEY!, {
      clientId: process.env.WORKOS_CLIENT_ID!,
    });
  }
  return workosInstance;
}
